/**
 * Shared aggregator that converts an entry's `items[]` plus an optional
 * legacy top-level `{ volume_ml, abv_percent }` slot into a single
 * `alcohol_logs`-ready row.
 *
 * Background — Codex Round 1 C1 (UNIQUE on alcohol_logs.entry_id) and
 * Codex Round 2 C1-r2 / C2-r2 (replay path + copy-yesterday parity) collapsed
 * the two routes that need alcohol-log writes onto the same math:
 *
 *   - `app/api/entries/save/route.ts` — fresh insert, replay (existing entry
 *     for same client_id), and race-recovery (23505) all aggregate from the
 *     entry's PERSISTED items[] (not the request body on replay) so a same-
 *     client_id retry with different items cannot corrupt the canonical
 *     alcohol log.
 *   - `app/api/entries/copy-yesterday/route.ts` — copied entries inherit the
 *     source row's `items[]`. The new entry's own consumed_at (today) is the
 *     ledger timestamp (open question from bugfix-tomi 2026-05-19 plan.md:
 *     "if copied to today, use the new copied entry timestamp so BAC does
 *     not resurrect yesterday's exact drinking time").
 *
 * The math here is identical to the inline aggregator that previously lived
 * in the save route (lines ~218-301 before extraction). It is hoisted into
 * a shared module so copy-yesterday can call it without duplicating the
 * UNIQUE-collapsing logic.
 */
import * as Sentry from '@sentry/nextjs';

import { calculateAlcoholGrams } from '@/lib/alcohol/bac';

/**
 * Security Review (bugfix-tomi 2026-05-19-bac-improvements) H1 (HIGH) —
 * defense-in-depth clamps that mirror the alcohol_logs DB CHECK ceilings:
 *   - volume_ml: DB CHECK caps production rows to ≤ 5000 per migration
 *     0026 line 37.
 *   - alcohol_grams: numeric(8,3), kept consistent with the capped maximum
 *     volume at 100% ABV.
 *
 * If a computed total exceeds these the aggregator caps to the ceiling
 * and emits a Sentry breadcrumb for operator observability. The request
 * is NOT aborted — the entry is still authoritative; only the alcohol
 * ledger is capped. Realistic multi-drink aggregates (Test M+P et al.)
 * are far below both ceilings, so this is a pure safety net.
 */
const ALCOHOL_LOG_VOLUME_ML_MAX = 5000;
const ALCOHOL_LOG_GRAMS_MAX = 3945;

/**
 * Minimal item shape needed for alcohol aggregation. Mirrors the per-item
 * fields the save route already validates via Zod + the per-item fields
 * stored verbatim on `food_entries.items` (JSONB).
 *
 * Optional fields use `| undefined` explicitly so callers passing through
 * Zod-parsed bodies (which produce `boolean | undefined` etc. under
 * `exactOptionalPropertyTypes: true`) assign cleanly.
 */
export type AlcoholAggregatableItem = {
  is_alcoholic?: boolean | undefined;
  volume_ml?: number | undefined;
  abv_percent?: number | undefined;
  portion?: number | undefined;
};

export type LegacyAlcoholSlot = {
  volume_ml: number;
  abv_percent: number;
};

export type AlcoholContribution = {
  volume_ml: number;
  abv_percent: number;
};

export type AggregatedAlcoholRow = {
  volume_ml: number;
  abv_percent: number;
  alcohol_grams: number;
};

/**
 * Collect per-item alcohol contributions (and the legacy top-level slot
 * when present) for an entry with the given `mealCategory`. Returns
 * `[]` for non-drink categories — silent skip so AI mis-tags on snacks/
 * meals don't 400 the save and so copy-yesterday copies don't resurrect
 * an alcohol_logs row for a non-drink (legacy) entry.
 *
 * Codex R1 I1 — `volume_ml` is per single serving; multiply by portion so
 * "two beers" (portion=2, volume_ml=355) yields 710 ml of beer.
 *
 * When the legacy `{ volume_ml, abv_percent }` slot is present it overrides
 * per-item collection — this preserves the save route's defensive policy of
 * "legacy top-level wins, per-item is dropped". The slot has no portion
 * factor (legacy single-contribution shape).
 */
export function collectAlcoholContributions(args: {
  items: readonly AlcoholAggregatableItem[];
  mealCategory: string;
  legacy?: LegacyAlcoholSlot | undefined;
}): AlcoholContribution[] {
  if (args.mealCategory !== 'drink') return [];
  if (args.legacy) {
    return [{ volume_ml: args.legacy.volume_ml, abv_percent: args.legacy.abv_percent }];
  }
  const out: AlcoholContribution[] = [];
  for (const item of args.items) {
    if (
      item.is_alcoholic === true &&
      typeof item.volume_ml === 'number' &&
      typeof item.abv_percent === 'number' &&
      typeof item.portion === 'number' &&
      Number.isFinite(item.portion) &&
      item.portion > 0
    ) {
      out.push({
        volume_ml: item.volume_ml * item.portion,
        abv_percent: item.abv_percent,
      });
    }
  }
  return out;
}

/**
 * Aggregate a list of per-item contributions into a single alcohol_logs row.
 *
 * Codex R1 C1 fix — `alcohol_logs.entry_id` has UNIQUE so we MUST emit at
 * most one row per entry. Strategy:
 *   - alcohol_grams: sum of (volume_ml × abv/100 × 0.789) across all
 *     contributions — load-bearing field for the BAC engine.
 *   - volume_ml: sum of contribution volumes (total liquid consumed).
 *   - abv_percent: volume-weighted average so the triple
 *     (volume_ml, abv_percent, alcohol_grams) is internally consistent.
 *
 * Returns null if no contributions or if total_volume collapses to 0
 * (defensive — should not happen because every contribution is gated on
 * `volume_ml > 0` upstream).
 */
export function aggregateAlcoholRow(
  contributions: readonly AlcoholContribution[],
): AggregatedAlcoholRow | null {
  if (contributions.length === 0) return null;
  let totalVolumeMl = 0;
  let totalGrams = 0;
  for (const c of contributions) {
    totalVolumeMl += c.volume_ml;
    totalGrams += calculateAlcoholGrams(c.volume_ml, c.abv_percent);
  }
  if (totalVolumeMl <= 0) return null;
  const uncappedVolume = Number(totalVolumeMl.toFixed(2));
  const uncappedGrams = Number(totalGrams.toFixed(3));
  const roundedVolume = Math.min(uncappedVolume, ALCOHOL_LOG_VOLUME_ML_MAX);
  const roundedGrams = Math.min(uncappedGrams, ALCOHOL_LOG_GRAMS_MAX);
  if (roundedVolume !== uncappedVolume || roundedGrams !== uncappedGrams) {
    Sentry.addBreadcrumb({
      category: 'alcohol.aggregate',
      message: 'Capped alcohol aggregate to database-safe bounds',
      level: 'warning',
      data: {
        uncappedVolumeMl: uncappedVolume,
        uncappedAlcoholGrams: uncappedGrams,
        cappedVolumeMl: roundedVolume,
        cappedAlcoholGrams: roundedGrams,
      },
    });
  }
  const weightedAbv = Number(((roundedGrams / (roundedVolume * 0.789)) * 100).toFixed(2));
  const safeAbv = Math.min(Math.max(weightedAbv, 0), 100);
  return {
    volume_ml: roundedVolume,
    abv_percent: safeAbv,
    alcohol_grams: roundedGrams,
  };
}

/**
 * Convenience: collect → aggregate in one call. Returns null if no
 * alcoholic contributions survive collection.
 */
export function aggregateAlcoholFromItems(args: {
  items: readonly AlcoholAggregatableItem[];
  mealCategory: string;
  legacy?: LegacyAlcoholSlot | undefined;
}): AggregatedAlcoholRow | null {
  const contributions = collectAlcoholContributions(args);
  return aggregateAlcoholRow(contributions);
}
