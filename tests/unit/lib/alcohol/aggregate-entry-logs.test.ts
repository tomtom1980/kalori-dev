/**
 * @vitest-environment node
 *
 * Unit coverage for `lib/alcohol/aggregate-entry-logs.ts` — the shared
 * aggregator used by both `app/api/entries/save/route.ts` and
 * `app/api/entries/copy-yesterday/route.ts` (Codex Round 2 C1-r2 / C2-r2).
 *
 * The math is exercised end-to-end via the integration tests too, but
 * isolated unit assertions here protect the contract (UNIQUE entry_id
 * collapse, portion multiplier, non-drink silent skip, legacy slot
 * override) against future refactors of either route.
 */
import { describe, expect, it } from 'vitest';

import {
  aggregateAlcoholFromItems,
  aggregateAlcoholRow,
  collectAlcoholContributions,
} from '@/lib/alcohol/aggregate-entry-logs';

describe('collectAlcoholContributions', () => {
  it('returns [] for non-drink mealCategory even if items are alcoholic', () => {
    const out = collectAlcoholContributions({
      mealCategory: 'snack',
      items: [{ is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 1 }],
    });
    expect(out).toEqual([]);
  });

  it('multiplies volume_ml by portion for alcoholic items', () => {
    const out = collectAlcoholContributions({
      mealCategory: 'drink',
      items: [{ is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 2 }],
    });
    expect(out).toEqual([{ volume_ml: 710, abv_percent: 5 }]);
  });

  it('skips items missing volume_ml or abv_percent or portion', () => {
    const out = collectAlcoholContributions({
      mealCategory: 'drink',
      items: [
        { is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 1 },
        { is_alcoholic: true, abv_percent: 5, portion: 1 }, // no volume_ml
        { is_alcoholic: true, volume_ml: 355, portion: 1 }, // no abv_percent
        { is_alcoholic: true, volume_ml: 355, abv_percent: 5 }, // no portion
        { is_alcoholic: false, volume_ml: 100, abv_percent: 5, portion: 1 }, // not alcoholic
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ volume_ml: 355, abv_percent: 5 });
  });

  it('legacy top-level slot overrides per-item collection', () => {
    const out = collectAlcoholContributions({
      mealCategory: 'drink',
      items: [{ is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 1 }],
      legacy: { volume_ml: 750, abv_percent: 13 },
    });
    expect(out).toEqual([{ volume_ml: 750, abv_percent: 13 }]);
  });
});

describe('aggregateAlcoholRow', () => {
  it('returns null for empty contributions', () => {
    expect(aggregateAlcoholRow([])).toBeNull();
  });

  it('returns null if total volume collapses to 0', () => {
    expect(aggregateAlcoholRow([{ volume_ml: 0, abv_percent: 5 }])).toBeNull();
  });

  it('aggregates a single beer contribution correctly', () => {
    const row = aggregateAlcoholRow([{ volume_ml: 355, abv_percent: 5 }]);
    expect(row).not.toBeNull();
    expect(row!.volume_ml).toBe(355);
    expect(row!.alcohol_grams).toBeCloseTo(14.005, 2);
    expect(row!.abv_percent).toBeCloseTo(5, 1);
  });

  it('aggregates beer + wine into one row with weighted ABV', () => {
    const row = aggregateAlcoholRow([
      { volume_ml: 355, abv_percent: 5 },
      { volume_ml: 150, abv_percent: 12 },
    ]);
    expect(row).not.toBeNull();
    expect(row!.volume_ml).toBe(505);
    // beer grams: 355 * 0.05 * 0.789 = 14.00475
    // wine grams: 150 * 0.12 * 0.789 = 14.202
    // total ≈ 28.207
    expect(row!.alcohol_grams).toBeCloseTo(28.207, 1);
    // weighted abv ≈ (28.207 / (505 * 0.789)) * 100 ≈ 7.077
    expect(row!.abv_percent).toBeCloseTo(7.077, 0);
  });
});

// Security Review (bugfix-tomi 2026-05-19-bac-improvements) — H1 (HIGH):
// Defense-in-depth layer 2. Even with the route-level portion.max(100)
// cap, the aggregator must clamp its OUTPUT so a future caller that
// bypasses the route layer (a direct DB script, a future copy-yesterday
// path with drifted persisted items, etc.) cannot push numeric(8,3)
// alcohol_grams or numeric(8,2) volume_ml past their DB CHECK bounds
// and 22003 overflow the insert.
describe('aggregateAlcoholRow — defense-in-depth clamps (Security H1)', () => {
  it('clamps alcohol_grams ≤ 99999.999 when contributions sum past the DB max', () => {
    // Single artificial contribution that produces ~157.8M grams ethanol.
    // Pre-fix this would have written 157,800,000.000 → numeric(8,3) overflow.
    const row = aggregateAlcoholRow([{ volume_ml: 2_000_000_000, abv_percent: 10 }]);
    expect(row).not.toBeNull();
    expect(row!.alcohol_grams).toBeLessThanOrEqual(99999.999);
    expect(row!.alcohol_grams).toBeGreaterThan(0);
  });

  it('clamps volume_ml ≤ 999999.99 when contributions sum past the DB max', () => {
    // numeric(8,2) volume_ml CHECK bounds it ≤ 5000 in the schema, but the
    // aggregator stores a 0-100 ABV regardless. The clamp guards the column
    // type ceiling so a bypassed-route call cannot 22003 the insert.
    const row = aggregateAlcoholRow([{ volume_ml: 1_500_000_000, abv_percent: 5 }]);
    expect(row).not.toBeNull();
    expect(row!.volume_ml).toBeLessThanOrEqual(999999.99);
    expect(row!.volume_ml).toBeGreaterThan(0);
  });

  it('does NOT clamp realistic multi-drink aggregates (no regression on Test M+P)', () => {
    // Two beers + one wine — 860 ml, ~42 g ethanol. Both well under caps.
    const row = aggregateAlcoholRow([
      { volume_ml: 710, abv_percent: 5 },
      { volume_ml: 150, abv_percent: 12 },
    ]);
    expect(row).not.toBeNull();
    expect(row!.volume_ml).toBe(860);
    expect(row!.alcohol_grams).toBeCloseTo(42.212, 1);
  });
});

describe('aggregateAlcoholFromItems', () => {
  it('end-to-end: non-drink → null', () => {
    expect(
      aggregateAlcoholFromItems({
        mealCategory: 'snack',
        items: [{ is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 1 }],
      }),
    ).toBeNull();
  });

  it('end-to-end: drink with alcoholic items → row', () => {
    const row = aggregateAlcoholFromItems({
      mealCategory: 'drink',
      items: [{ is_alcoholic: true, volume_ml: 355, abv_percent: 5, portion: 2 }],
    });
    expect(row).not.toBeNull();
    expect(row!.volume_ml).toBe(710);
    expect(row!.alcohol_grams).toBeCloseTo(28.01, 1);
  });

  it('end-to-end: drink with no alcoholic items → null', () => {
    expect(
      aggregateAlcoholFromItems({
        mealCategory: 'drink',
        items: [{ is_alcoholic: false, volume_ml: 100, abv_percent: 0 }],
      }),
    ).toBeNull();
  });
});
