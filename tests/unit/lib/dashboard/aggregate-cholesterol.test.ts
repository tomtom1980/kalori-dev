/**
 * Cholesterol as 5th macro — dashboard aggregation contract.
 *
 * Behaviour locked here:
 *   - `entryMacros` sums `cholesterol_mg` across items, defaulting missing
 *     to 0 (historical entries compat).
 *   - `aggregateMacros` returns a 5th `MacroRow` with `key='cholesterol'`,
 *     `unit='mg'`, target = 300mg (USDA reference).
 *   - `pct` is computed against the 300mg target and CAN exceed 100 when
 *     consumed is over the limit.
 *   - Empty status when no cholesterol consumed.
 *   - `macroContributions` lists items by cholesterol_mg desc.
 */
import { describe, expect, it } from 'vitest';

import { aggregateDay } from '@/lib/dashboard/aggregate';
import type { FoodEntry, Profile } from '@/lib/dashboard/types';

function makeProfile(): Profile {
  return {
    id: 'u1',
    calorie_target: 2000,
    bmr: 1500,
    tdee: 1800,
    bio_sex: 'male',
    current_weight_kg: 70,
    timezone: 'Asia/Ho_Chi_Minh',
    created_at: '2025-11-01T00:00:00.000Z',
    last_dashboard_visit_at: null,
    target_mode: 'auto',
    manual_override_value: null,
  };
}

function makeEntry(
  overrides: Partial<FoodEntry> & {
    cholesterolMg?: number;
    cholesterolMgPerItem?: number[];
    itemsCount?: number;
  } = {},
): FoodEntry {
  const itemsCount = overrides.itemsCount ?? 1;
  const items = Array.from({ length: itemsCount }, (_, i) => {
    const cholesterol_mg = overrides.cholesterolMgPerItem?.[i] ?? overrides.cholesterolMg ?? 0;
    return {
      name: `item-${i}`,
      portion: 100,
      unit: 'g',
      kcal: 100,
      macros: {
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        cholesterol_mg,
      },
      micros: {},
      confidence: 0.9,
    };
  });
  // Strip helper keys before spreading so they don't bleed into FoodEntry.
  const {
    cholesterolMg: _a,
    cholesterolMgPerItem: _b,
    itemsCount: _c,
    items: itemsOverride,
    ...rest
  } = overrides;
  return {
    id: 'e1',
    client_id: 'c1',
    logged_at: '2026-05-14T05:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: itemsOverride ?? items,
    ai_reasoning: null,
    ...rest,
  };
}

function snapshotFor(entries: FoodEntry[]) {
  return aggregateDay({
    entries,
    water: [],
    micros7d: [],
    profile: makeProfile(),
    day: '2026-05-14',
    tz: 'Asia/Ho_Chi_Minh',
    now: '2026-05-14T06:00:00.000Z',
  });
}

describe('aggregateMacros — cholesterol 5th macro', () => {
  it('returns a cholesterol MacroRow with unit=mg, target=300, key=cholesterol', () => {
    const snap = snapshotFor([makeEntry({ cholesterolMg: 50 })]);
    const chol = snap.macros.cholesterol!;
    expect(chol).toBeDefined();
    expect(chol.key).toBe('cholesterol');
    expect(chol.unit).toBe('mg');
    expect(chol.targetG).toBe(300); // field name kept; semantically mg
    expect(chol.consumedG).toBe(50);
  });

  it('protein/carbs/fat/fiber rows carry unit="g"', () => {
    const snap = snapshotFor([makeEntry({ cholesterolMg: 0 })]);
    expect(snap.macros.protein.unit).toBe('g');
    expect(snap.macros.carbs.unit).toBe('g');
    expect(snap.macros.fat.unit).toBe('g');
    expect(snap.macros.fiber.unit).toBe('g');
  });

  it('sums cholesterol across multiple items in one entry', () => {
    const snap = snapshotFor([makeEntry({ itemsCount: 3, cholesterolMgPerItem: [25, 50, 75] })]);
    expect(snap.macros.cholesterol!.consumedG).toBe(150);
  });

  it('sums cholesterol across multiple entries', () => {
    const snap = snapshotFor([
      makeEntry({ id: 'e1', cholesterolMg: 100 }),
      makeEntry({ id: 'e2', cholesterolMg: 120 }),
    ]);
    expect(snap.macros.cholesterol!.consumedG).toBe(220);
  });

  it('defaults missing cholesterol_mg on legacy items to 0', () => {
    // An item with no cholesterol_mg field (legacy DB row) must aggregate
    // to 0, not NaN — schema default kicks in at parse time but the
    // aggregator must also be defensive.
    const legacyItem = {
      name: 'legacy',
      portion: 100,
      unit: 'g',
      kcal: 100,
      macros: { protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 1 } as {
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        fiber_g: number;
        cholesterol_mg?: number;
      },
      micros: {},
      confidence: 0.9,
    };
    const entry = makeEntry({ items: [legacyItem as never] });
    const snap = snapshotFor([entry]);
    expect(snap.macros.cholesterol!.consumedG).toBe(0);
    expect(snap.macros.cholesterol!.status).toBe('empty');
  });

  it('computes pct correctly when consumed exceeds target', () => {
    const snap = snapshotFor([makeEntry({ cholesterolMg: 450 })]);
    // 450 / 300 = 150%
    expect(snap.macros.cholesterol!.pct).toBe(150);
    expect(snap.macros.cholesterol!.status).toBe('over');
  });

  it('returns empty status when no cholesterol consumed', () => {
    const snap = snapshotFor([makeEntry({ cholesterolMg: 0 })]);
    expect(snap.macros.cholesterol!.status).toBe('empty');
    expect(snap.macros.cholesterol!.consumedG).toBe(0);
  });

  it('lists item contributions sorted by cholesterol_mg desc', () => {
    const snap = snapshotFor([
      makeEntry({
        itemsCount: 3,
        cholesterolMgPerItem: [10, 80, 30],
      }),
    ]);
    const rows = snap.macros.cholesterol!.contributions;
    expect(rows.length).toBe(3);
    // The MacroContribution `grams` field semantically carries mg for
    // cholesterol; the new `amount` field is the unit-aware sibling.
    expect(rows.map((r) => r.grams)).toEqual([80, 30, 10]);
    expect(rows.map((r) => r.amount)).toEqual([80, 30, 10]);
  });

  it('skips items with 0 cholesterol from contributions', () => {
    const snap = snapshotFor([
      makeEntry({
        itemsCount: 3,
        cholesterolMgPerItem: [0, 50, 0],
      }),
    ]);
    const rows = snap.macros.cholesterol!.contributions;
    expect(rows.length).toBe(1);
    expect(rows[0]?.amount).toBe(50);
  });
});
