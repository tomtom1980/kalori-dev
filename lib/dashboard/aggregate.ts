/**
 * `lib/dashboard/aggregate.ts` — Task 3.5 pure aggregation.
 *
 * Given raw Supabase rows (today's food_entries, water_log, last-7-days
 * food_entries for the micros union) and the user's profile + timezone,
 * build the `DashboardSnapshot` consumed by RSC islands. Pure; no I/O.
 *
 * F5 contract: day filtering on `food_entries.logged_at` uses user-TZ
 * (`lib/time/day.ts` → `userTzDayFrom`). Entries with `logged_at` that
 * resolves to a different user-TZ day are excluded. The caller typically
 * already constrains by the UTC range but this filter is the authoritative
 * backstop.
 *
 * Tiebreakers:
 *   - MealCategory is the 5-tuple including `drink` (Codex R1 I1 fix).
 *   - Macro target split: default 25/45/30 (P/C/F) of calorie_target,
 *     converted to grams via 4/4/9 kcal/g. This is a display-only default
 *     until the nutrition package ships explicit per-user macro targets.
 *   - Chronometer status: `approaching` 80–100%, `on-target` 95–105%,
 *     `over-target` >105%, `way-over` >120%.
 *   - Edition number: days-since-created_at in user TZ.
 */
import { userTzDayFrom } from '@/lib/time/day';
import { calculateBac } from '@/lib/alcohol/bac';
import {
  formatMicroPercent,
  microStatus,
  sortAndFilterMicrosByRdaPct,
} from '@/lib/nutrition/display-micros';
import { canonicalizeMicroKey, resolveMicrosRda } from '@/lib/dashboard/micros-rda-resolver';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';

import {
  MEAL_CATEGORIES,
  mlFromWaterRow,
  type ChronometerData,
  type ChronometerStatus,
  type DashboardSnapshot,
  type Edition,
  type FoodEntry,
  type AlcoholLogEntry,
  type MacroContribution,
  type MacroRow,
  type MacroRowStatus,
  type MacrosByKey,
  type MealColumnData,
  type MealsByCategory,
  type MicroContribution,
  type MicroRow,
  type Profile,
  type WaterLogEntry,
} from './types';

// Default water target — 2 litres / day. Design-doc §5: 8 "glasses" baseline.
const DEFAULT_WATER_TARGET_ML = 2000;

// Default macro split of calorie_target. Each macro's kcal share:
// protein 25%, carbs 45%, fat 30%. Converted to grams via kcal/g.
const MACRO_KCAL_SHARE = { protein: 0.25, carbs: 0.45, fat: 0.3 };
const MACRO_KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
const FIBER_TARGET_G = 25;
// Daily dietary cholesterol target — USDA / FDA Daily Value reference
// (21 CFR §101.9). Treated as an upper limit: status `'over'` means the
// user exceeded the guidance for the day. UI is expected to colour
// `'over'` for cholesterol differently than for protein/carbs/fat where
// 'over' is also undesirable but less consequential.
const CHOLESTEROL_TARGET_MG = 300;

export interface AggregateDayInput {
  entries: FoodEntry[];
  water: WaterLogEntry[];
  micros7d: FoodEntry[];
  alcoholLogs?: AlcoholLogEntry[];
  profile: Profile;
  day: string;
  tz: string;
  now: string;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function aggregateDay(input: AggregateDayInput): DashboardSnapshot {
  const { entries, water, micros7d, alcoholLogs = [], profile, day, tz, now } = input;

  // Defensive: trust day strings but filter by user-TZ anyway (F5 backstop).
  const todayEntries = entries.filter((e) => userTzDayFrom(e.logged_at, tz) === day);
  const todayWater = water.filter((w) => w.date === day);

  const meals = groupMeals(todayEntries);
  const macros = aggregateMacros(todayEntries, profile);
  const chronometer = buildChronometer(todayEntries, profile, now);
  const waterBlock = {
    consumedMl: todayWater.reduce((n, w) => n + mlFromWaterRow(w), 0),
    targetMl: DEFAULT_WATER_TARGET_ML,
    entries: todayWater,
  };
  const bac = {
    value: calculateBac({
      logs: alcoholLogs,
      profile: {
        bio_sex: profile.bio_sex,
        current_weight_kg: profile.current_weight_kg,
      },
      asOf: now,
    }),
    calculatedAt: now,
  };
  // 2026-05-16 — micros are now day-scoped (daily audit). The 7-day
  // window source remains in `fetchMicros7d` for potential weekly/
  // trend consumers; the dashboard panel below uses today's entries
  // only so the table reflects what the user actually ate THIS day.
  const micros = aggregateMicros(todayEntries);
  // Task C.1 — 30-row RDA snapshot reading today's entries against
  // DEFAULT_MICROS_LIST (no override; DT-5/O-2 deferral).
  const microsRda = resolveMicrosRda(todayEntries);
  const edition = buildEdition(profile, day, tz);

  return {
    edition,
    chronometer,
    macros,
    meals,
    water: waterBlock,
    bac,
    micros,
    microsRda,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupMeals(entries: FoodEntry[]): MealsByCategory {
  const empty = (): MealColumnData => ({
    category: 'breakfast',
    entries: [],
    totalKcal: 0,
    heaviestEntryId: null,
  });
  const cols: MealsByCategory = {
    breakfast: { ...empty(), category: 'breakfast' },
    lunch: { ...empty(), category: 'lunch' },
    dinner: { ...empty(), category: 'dinner' },
    snack: { ...empty(), category: 'snack' },
    drink: { ...empty(), category: 'drink' },
  };

  for (const e of entries) {
    const col = cols[e.meal_category];
    col.entries.push(e);
  }

  for (const cat of MEAL_CATEGORIES) {
    const col = cols[cat];
    col.entries.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    let total = 0;
    let heaviestId: string | null = null;
    let heaviestKcal = -1;
    for (const e of col.entries) {
      const kcal = entryKcal(e);
      total += kcal;
      if (kcal > heaviestKcal) {
        heaviestKcal = kcal;
        heaviestId = e.id;
      }
    }
    col.totalKcal = total;
    col.heaviestEntryId = heaviestId;
  }

  return cols;
}

function entryKcal(e: FoodEntry): number {
  return e.items.reduce((n, item) => n + item.kcal, 0);
}

function entryMacros(e: FoodEntry): {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  cholesterol_mg: number;
} {
  return e.items.reduce(
    (acc, item) => {
      const m = item.macros ?? {
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        cholesterol_mg: 0,
      };
      acc.protein_g += m.protein_g;
      acc.carbs_g += m.carbs_g;
      acc.fat_g += m.fat_g;
      acc.fiber_g += m.fiber_g;
      // Legacy items pre-date cholesterol — default missing to 0.
      acc.cholesterol_mg += m.cholesterol_mg ?? 0;
      return acc;
    },
    { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, cholesterol_mg: 0 },
  );
}

/**
 * Per-item macro amount in its native unit. Returns grams for
 * protein/carbs/fat/fiber and milligrams for cholesterol. Field name
 * preserved as `*MacroG` for surgical-change reasons; callers know which
 * key they passed in. New code should pair the returned value with the
 * row's `unit` field for correct display.
 */
function itemMacroAmount(item: FoodEntry['items'][number], key: MacroRow['key']): number {
  const m = item.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    cholesterol_mg: 0,
  };
  if (key === 'protein') return m.protein_g;
  if (key === 'carbs') return m.carbs_g;
  if (key === 'fiber') return m.fiber_g;
  if (key === 'cholesterol') return m.cholesterol_mg ?? 0;
  return m.fat_g;
}

function formatPortionLabel(item: FoodEntry['items'][number]): string {
  return `${item.portion} ${item.unit}`.trim();
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function macroContributions(
  entries: FoodEntry[],
  key: MacroRow['key'],
  total: number,
): MacroContribution[] {
  const rows: MacroContribution[] = [];
  for (const entry of entries) {
    entry.items.forEach((item, index) => {
      const amount = itemMacroAmount(item, key);
      if (amount <= 0) return;
      const rounded = roundOne(amount);
      rows.push({
        id: `${entry.id}:${index}:${key}`,
        entryId: entry.id,
        mealCategory: entry.meal_category,
        loggedAt: entry.logged_at,
        itemName: item.name,
        portionLabel: formatPortionLabel(item),
        // `grams` retained for existing UI consumers (MacroBars.tsx reads
        // `item.grams`); semantically holds mg for cholesterol. `amount`
        // is the new unit-aware sibling per the cholesterol/contrib spec.
        grams: rounded,
        amount: rounded,
        pctOfTotal: total > 0 ? Math.round((amount / total) * 100) : 0,
      });
    });
  }
  return rows.sort((a, b) => {
    // `amount` is optional on the type to keep legacy fixtures compiling,
    // but the aggregator ALWAYS populates it. Default-coalesce defensively.
    const aAmt = a.amount ?? a.grams;
    const bAmt = b.amount ?? b.grams;
    if (bAmt !== aAmt) return bAmt - aAmt;
    return a.loggedAt.localeCompare(b.loggedAt);
  });
}

function macroRowStatus(consumedG: number, targetG: number): MacroRowStatus {
  if (consumedG === 0 && targetG === 0) return 'empty';
  if (consumedG === 0) return 'empty';
  const pct = (consumedG / Math.max(targetG, 1)) * 100;
  if (pct > 105) return 'over';
  if (pct >= 95 && pct <= 105) return 'on-target';
  return 'default';
}

function aggregateMacros(entries: FoodEntry[], profile: Profile): MacrosByKey {
  const totals = entries.reduce(
    (acc, e) => {
      const m = entryMacros(e);
      acc.protein += m.protein_g;
      acc.carbs += m.carbs_g;
      acc.fat += m.fat_g;
      acc.fiber += m.fiber_g;
      acc.cholesterol += m.cholesterol_mg;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, fiber: 0, cholesterol: 0 },
  );
  // `calorie_target` is nullable in the DB (pre-onboarding profiles have
  // NULL). The dashboard onboarding guard should prevent reaching this
  // aggregation with a NULL, but treat it as 0 defensively so macro targets
  // degrade to zero rather than producing NaN.
  const target = profile.calorie_target ?? 0;
  const targetG = {
    protein: Math.round((target * MACRO_KCAL_SHARE.protein) / MACRO_KCAL_PER_G.protein),
    carbs: Math.round((target * MACRO_KCAL_SHARE.carbs) / MACRO_KCAL_PER_G.carbs),
    fat: Math.round((target * MACRO_KCAL_SHARE.fat) / MACRO_KCAL_PER_G.fat),
    fiber: FIBER_TARGET_G,
    cholesterol: CHOLESTEROL_TARGET_MG,
  };

  const build = (
    key: MacroRow['key'],
    consumed: number,
    target: number,
    unit: 'g' | 'mg',
  ): MacroRow => {
    const consumedG = Math.round(consumed);
    return {
      key,
      unit,
      consumedG,
      targetG: target,
      pct: target > 0 ? Math.round((consumed / target) * 100) : 0,
      // Status enum reused verbatim for cholesterol. `'over'` here means
      // "exceeded the 300mg/day guidance" — visually undesirable, but
      // the UI subagent (Phase 2A) owns the colour decision so the
      // aggregator just reports the bucket.
      status: macroRowStatus(consumed, target),
      contributions: macroContributions(entries, key, consumed),
    };
  };

  return {
    protein: build('protein', totals.protein, targetG.protein, 'g'),
    carbs: build('carbs', totals.carbs, targetG.carbs, 'g'),
    fat: build('fat', totals.fat, targetG.fat, 'g'),
    fiber: build('fiber', totals.fiber, targetG.fiber, 'g'),
    cholesterol: build('cholesterol', totals.cholesterol, targetG.cholesterol, 'mg'),
  };
}

function buildChronometer(entries: FoodEntry[], profile: Profile, now: string): ChronometerData {
  // Defensive null coalesce — see `aggregateMacros` comment. `ChronometerRing`
  // also guards `formatNumber(null)` → "—" so downstream UI never crashes
  // if this path is ever reached with a pre-onboarding profile.
  const target = profile.calorie_target ?? 0;
  if (entries.length === 0) {
    return { status: 'empty', target };
  }
  const consumed = entries.reduce((n, e) => n + entryKcal(e), 0);
  const fiber = entries.reduce((n, e) => n + entryMacros(e).fiber_g, 0);
  const pct = target > 0 ? (consumed / target) * 100 : 0;
  const status = chronometerStatus(pct);
  const lastLoggedAt = entries.reduce<string | null>((latest, e) => {
    if (!latest) return e.logged_at;
    return e.logged_at > latest ? e.logged_at : latest;
  }, null);

  return {
    status,
    consumed: Math.round(consumed),
    target,
    fiber: { consumed: Math.round(fiber), target: FIBER_TARGET_G },
    nowAngle: nowAngleFromIso(now),
    entryCount: entries.length,
    lastLoggedAt,
  };
}

function chronometerStatus(pct: number): ChronometerStatus {
  if (pct > 120) return 'way-over';
  if (pct > 105) return 'over-target';
  if (pct >= 95 && pct <= 105) return 'on-target';
  if (pct >= 80) return 'approaching';
  return 'default';
}

function nowAngleFromIso(iso: string): number {
  // Map hours-of-day to 0..360 clock angle. 0h = 12 o'clock (top), clockwise.
  const d = new Date(iso);
  const hoursFraction = (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) / 24;
  return Math.round(hoursFraction * 360);
}

/**
 * Task C.1 Codex Round 1 — Finding 1 fix.
 *
 * AI now returns canonical snake_case codes (`vitamin_c`, `vitamin_d`, …) per
 * the `MICROS_DIRECTIVE` baked into the Gemini prompt. The existing 7-day
 * `MicronutrientPanel` aggregation path looks up RDAs by HUMAN DISPLAY NAME
 * (`"vitamin c"`, `"vitamin d"`) and sorts by display-name priority. Without
 * translation, newly-parsed entries render raw `vitamin_c` chips with no RDA
 * lookup, no priority ordering, and misleading `status='low'`.
 *
 * Lookup table (canonical code → display name) is built once at module load
 * from `DEFAULT_MICROS_LIST` (single source of truth). Backward compat is
 * preserved: if a key is NOT in the canonical set (older entries logged
 * before this contract, or non-canonical AI drift) we pass it through as a
 * display name unchanged. Fix is additive — `MicronutrientPanel.tsx` and
 * `display-micros.ts` are NOT touched.
 */
const CANONICAL_CODE_TO_DISPLAY_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.code, m.name])),
);

/**
 * Display-name → canonical unit lookup. Built once at module load from
 * `DEFAULT_MICROS_LIST` so the per-micro contribution rows can attach a
 * unit string ('mg' / 'mcg' / 'g') matching the canonical table. Orphan
 * rows (display names not in the canonical set, e.g. legacy / drift
 * entries) fall back to an empty string — UI decides how to render.
 */
const DISPLAY_NAME_TO_UNIT: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.name, m.unit])),
);

function canonicalCodeToDisplayName(key: string): string {
  return CANONICAL_CODE_TO_DISPLAY_NAME[key] ?? key;
}

function aggregateMicros(weekEntries: FoodEntry[]): MicroRow[] {
  // Union + sum micronutrient values across all items in the 7-day window.
  //
  // Codex R1 Finding 1: translate canonical AI codes (`vitamin_c`) to display
  // names (`Vitamin C`) BEFORE summing so AI-returned and legacy entries
  // converge on the same row (priority sort + RDA lookup work for both).
  //
  // Codex R2 Fix R2-2: route the raw key through `canonicalizeMicroKey` FIRST
  // (shared helper with `resolveMicrosRda`). This catches library-UI
  // unit-suffixed keys (`sodium_mg`, `iron_mg`, `vitamin_c_mg`, ...) and
  // display-name keys (`"Sodium"`) and reduces them to canonical codes.
  // The canonical code then flows through the existing
  // `canonicalCodeToDisplayName` translation for the priority sort + RDA
  // lookup. Unknown keys (canonicalize returns undefined) pass through
  // unchanged so the "orphan key" behavior of the existing tests is
  // preserved (e.g. `made_up_key` still renders as an orphan low row). The
  // closed-allowlist alias map means cross-unit suffixes like `sodium_g`
  // are NOT coerced — they pass through as orphan rows rather than
  // inflating canonical totals by 1000x.
  //
  // 2026-05-16 — also gathers per-source `MicroContribution[]` for each
  // display key (mirrors `macroContributions`). The aggregation totals
  // themselves are NOT changed; this is an additive pass that buckets
  // every nonzero per-item value into a `contributions` array attached
  // to the final row. Sort order: amount desc, then loggedAt asc — same
  // contract as macros — applied AFTER all entries are walked.
  const totals = new Map<string, number>();
  const contribBuckets = new Map<string, MicroContribution[]>();
  for (const entry of weekEntries) {
    entry.items.forEach((item, itemIndex) => {
      const micros = item.micros ?? {};
      for (const [rawKey, value] of Object.entries(micros)) {
        if (typeof value !== 'number') continue;
        const canonical = canonicalizeMicroKey(rawKey);
        const displayKey =
          canonical !== undefined
            ? canonicalCodeToDisplayName(canonical)
            : canonicalCodeToDisplayName(rawKey);
        totals.set(displayKey, (totals.get(displayKey) ?? 0) + value);

        // Only emit contribution rows for positive, finite values so the
        // attached array mirrors the daily-audit filter on the parent row.
        if (Number.isFinite(value) && value > 0) {
          const bucket = contribBuckets.get(displayKey) ?? [];
          bucket.push({
            id: `${entry.id}:${itemIndex}:${displayKey}`,
            entryId: entry.id,
            mealCategory: entry.meal_category,
            loggedAt: entry.logged_at,
            itemName: item.name,
            portionLabel: formatPortionLabel(item),
            amount: roundOne(value),
            unit: DISPLAY_NAME_TO_UNIT[displayKey] ?? '',
            // pctOfTotal filled in once totals are known (post-loop).
            pctOfTotal: 0,
          });
          contribBuckets.set(displayKey, bucket);
        }
      }
    });
  }
  if (totals.size === 0) return [];

  // RDA lookup — sparse. For micros the app doesn't know an RDA for, the
  // row still renders with pct=0 / status='low'; UI uses that state to
  // surface a caption rather than a bar.
  const rda = rdaLookup();
  // Build a MicroRow per name; orphan rows (no RDA known) carry the helper's
  // `pct: null` signal so they aren't sorted by a fake-zero pct.
  //
  // 2026-05-17 (bugfix-tomi micros-display-consistency) — sort + filter is
  // delegated to `sortAndFilterMicrosByRdaPct` so dashboard / confirmation /
  // library detail all converge on the same display rule. Surface A applies
  // the user's cross-surface RDA-unknown inclusion rule per batch
  // 2026-05-17-micros-display-consistency (Codex R1 C1 fix): hide RDA-having
  // rows below 1% of RDA but KEEP RDA-unknown rows (sugar / orphan / etc.)
  // sorted to the END of the list, matching library + confirmation surfaces.
  type AggregatedRow = MicroRow & { __helperPct: number | null };
  const aggregatedRows: AggregatedRow[] = [];
  for (const [name, consumed] of totals) {
    // 2026-05-16 — daily audit: hide micros with zero consumption for
    // the viewed day. Keeps the panel focused on what the user
    // actually ate; un-consumed rows just produced noise at the bottom.
    if (!Number.isFinite(consumed) || consumed <= 0) continue;
    const r = rda[name.toLowerCase()] ?? null;
    const pct = formatMicroPercent(consumed, r);
    const bucket = contribBuckets.get(name) ?? [];
    // Backfill pctOfTotal against the row total + sort. Same contract
    // as `macroContributions`: amount desc, loggedAt asc tie-break.
    const contributions = bucket
      .map((c) => ({
        ...c,
        pctOfTotal: consumed > 0 ? Math.round((c.amount / consumed) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.loggedAt.localeCompare(b.loggedAt);
      });
    aggregatedRows.push({
      name,
      consumed,
      rda: r,
      pct,
      status: microStatus(consumed, r),
      unit: DISPLAY_NAME_TO_UNIT[name] ?? '',
      contributions,
      // Helper input — `pct: null` when no RDA reference, so orphan rows
      // are treated as RDA-unknown by the shared sort/filter rule. With
      // `includeUnknownRda: true` they survive the filter and sort to the
      // END of the list (after RDA-having rows), matching the cross-surface
      // rule applied on library + confirmation.
      __helperPct: r === null ? null : pct,
    });
  }

  // Single source of truth: helper applies the sort + filter rule
  // articulated by the user 2026-05-17. Dashboard variant drops sub-1%
  // RDA-having rows (panel signal-only) but KEEPS RDA-unknown orphans
  // (sugar / caffeine / etc.) at the end of the list, matching library +
  // confirmation surfaces (Codex R1 C1 fix).
  const helperInput = aggregatedRows.map((row) => ({
    key: row.name,
    displayName: row.name,
    pct: row.__helperPct,
    __row: row,
  }));
  const sorted = sortAndFilterMicrosByRdaPct(helperInput, {
    minPct: 1,
    includeUnknownRda: true,
  });
  return sorted
    .map(({ __row }) => __row)
    .sort(compareDashboardMicroRows)
    .map((__row) => {
      // Drop the helper-only field on the way out so the public MicroRow
      // shape stays clean.
      const { __helperPct: _drop, ...publicRow } = __row;
      void _drop;
      return publicRow;
    });
}

function compareDashboardMicroRows(
  a: MicroRow & { __helperPct: number | null },
  b: MicroRow & { __helperPct: number | null },
): number {
  const aRank = dashboardMicroStatusRank(a);
  const bRank = dashboardMicroStatusRank(b);
  if (aRank !== bRank) return aRank - bRank;

  if (a.status === 'low' || a.status === 'mid') {
    return (a.__helperPct ?? 0) - (b.__helperPct ?? 0) || a.name.localeCompare(b.name);
  }
  if (a.status === 'over') {
    return (b.__helperPct ?? 0) - (a.__helperPct ?? 0) || a.name.localeCompare(b.name);
  }
  if (a.status === 'unknown') {
    return b.consumed - a.consumed || a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name);
}

function dashboardMicroStatusRank(row: MicroRow): number {
  if (row.status === 'low') return 0;
  if (row.status === 'mid') return 1;
  if (row.status === 'over') return 2;
  if (row.status === 'good') return 3;
  return 4;
}

// Minimal baseline RDA table. Values chosen to exercise status transitions;
// the real nutrition pipeline will own the full NIH/NHS table.
function rdaLookup(): Record<string, number> {
  return {
    protein: 50,
    iron: 18,
    'vitamin d': 20,
    'vitamin c': 90,
    calcium: 1000,
    fiber: 28,
    magnesium: 400,
    potassium: 3500,
    zinc: 11,
    sodium: 2300,
    'vitamin a': 900,
    'vitamin b12': 2.4,
    'vitamin e': 15,
    'vitamin k': 120,
    folate: 400,
  };
}

function buildEdition(profile: Profile, day: string, tz: string): Edition {
  // Edition number = days since profile.created_at (user-TZ rounded).
  const createdDay = userTzDayFrom(profile.created_at, tz);
  const n = daysBetween(createdDay, day);

  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  const safeDate = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(safeDate);
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
  }).format(safeDate);

  return {
    n: Math.max(1, n),
    weekday,
    day: d ?? 1,
    month: monthName,
    year: y ?? 2026,
  };
}

function daysBetween(fromDay: string, toDay: string): number {
  const parse = (s: string): number => {
    const [y, m, d] = s.split('-').map((p) => parseInt(p, 10));
    if (!y || !m || !d) return 0;
    return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  };
  const a = parse(fromDay);
  const b = parse(toDay);
  if (a === 0 || b === 0) return 1;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
