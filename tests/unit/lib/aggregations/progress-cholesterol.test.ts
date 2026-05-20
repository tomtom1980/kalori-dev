/**
 * Phase 2D — cholesterol on the /progress aggregator.
 *
 * Adds a 5th macro field (`cholesterolMg` / `cholesterolTargetMg`) on every
 * `MacroBucket` emitted by `aggregateProgress`. Cholesterol is summed from
 * `items[].macros.cholesterol_mg`, defaults to the USDA Daily Value
 * (300 mg/day) when `profile.cholesterol_target_mg` is absent, and tolerates
 * legacy items / non-finite values via the existing `numOr0` coercion path
 * (consistent with how the other macros already behave).
 */
import { describe, expect, it } from 'vitest';

import {
  aggregateProgress,
  type AggregateProgressInput,
  type FoodEntryRow,
  type ProgressProfile,
  type ProgressRange,
} from '@/lib/aggregations/progress';

const NOW_ISO = '2026-04-24T07:15:00.000Z'; // 14:15 UTC+7
const TZ = 'Asia/Ho_Chi_Minh';

function entry(
  loggedAt: string,
  opts: {
    cholesterol?: unknown;
    p?: number;
    c?: number;
    f?: number;
    fiber?: number;
  } = {},
): FoodEntryRow {
  const macros: Record<string, unknown> = {
    protein_g: opts.p ?? 20,
    carbs_g: opts.c ?? 30,
    fat_g: opts.f ?? 10,
    fiber_g: opts.fiber ?? 3,
  };
  if (opts.cholesterol !== undefined) {
    macros.cholesterol_mg = opts.cholesterol;
  }
  // Build the row literally; the `as unknown as FoodEntryRow` cast is needed
  // only on the NaN-guard test where `cholesterol_mg` is intentionally not
  // a finite number.
  const row = {
    id: `e-${loggedAt}`,
    logged_at: loggedAt,
    meal_category: 'lunch',
    library_item_id: null,
    items: [
      {
        name: 'Egg & toast',
        portion: 1,
        unit: 'serving',
        kcal: 250,
        macros,
        micros: {},
        confidence: 0.9,
      },
    ],
  };
  return row as unknown as FoodEntryRow;
}

function baseInput(
  entries: FoodEntryRow[],
  range: ProgressRange,
  profileOverrides: Partial<ProgressProfile> = {},
): AggregateProgressInput {
  return {
    range,
    now: NOW_ISO,
    tz: TZ,
    profile: {
      calorie_target: 2000,
      protein_target_g: 125,
      carbs_target_g: 225,
      fat_target_g: 67,
      fiber_target_g: 30,
      ...profileOverrides,
    },
    entries,
  };
}

describe('lib/aggregations/progress — cholesterol (Phase 2D)', () => {
  it('sums cholesterol_mg per bucket on a 7-day window', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-18T05:00:00.000Z', { cholesterol: 100 }), // Apr 18 noon UTC+7
      entry('2026-04-18T06:00:00.000Z', { cholesterol: 50 }),
      entry('2026-04-24T05:00:00.000Z', { cholesterol: 200 }), // Apr 24 noon UTC+7
    ];
    const out = aggregateProgress(baseInput(entries, 'W'));
    const apr18 = out.macro.points.find((p) => p.bucket === '2026-04-18');
    const apr24 = out.macro.points.find((p) => p.bucket === '2026-04-24');
    expect(apr18).toBeDefined();
    expect(apr18!.cholesterolMg).toBeCloseTo(150, 1);
    expect(apr24).toBeDefined();
    expect(apr24!.cholesterolMg).toBeCloseTo(200, 1);
  });

  it('defaults cholesterolTargetMg = 300 when profile omits cholesterol_target_mg', () => {
    const out = aggregateProgress(baseInput([entry('2026-04-24T05:00:00.000Z')], 'W'));
    for (const p of out.macro.points) {
      expect(p.cholesterolTargetMg).toBe(300);
    }
  });

  it('honors explicit profile.cholesterol_target_mg = 250', () => {
    const out = aggregateProgress(
      baseInput([entry('2026-04-24T05:00:00.000Z')], 'W', { cholesterol_target_mg: 250 }),
    );
    for (const p of out.macro.points) {
      expect(p.cholesterolTargetMg).toBe(250);
    }
  });

  it('emits cholesterolMg = 0 for buckets with no entries', () => {
    const out = aggregateProgress(baseInput([], 'W'));
    expect(out.macro.points.length).toBe(7);
    for (const p of out.macro.points) {
      expect(p.cholesterolMg).toBe(0);
      expect(p.cholesterolTargetMg).toBe(300);
    }
  });

  it('legacy items missing macros.cholesterol_mg coerce to 0 (parity with numOr0)', () => {
    // No `cholesterol` key set → field is omitted from the item.macros object.
    const out = aggregateProgress(baseInput([entry('2026-04-24T05:00:00.000Z')], 'W'));
    const apr24 = out.macro.points.find((p) => p.bucket === '2026-04-24')!;
    expect(apr24.cholesterolMg).toBe(0);
  });

  it('non-finite / negative-looking cholesterol_mg values coerce to 0 (NaN guard)', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-24T05:00:00.000Z', { cholesterol: Number.NaN }),
      entry('2026-04-24T05:30:00.000Z', { cholesterol: Number.POSITIVE_INFINITY }),
      entry('2026-04-24T06:00:00.000Z', { cholesterol: 'not-a-number' as unknown as number }),
      entry('2026-04-24T06:30:00.000Z', { cholesterol: 80 }), // sole valid one
    ];
    const out = aggregateProgress(baseInput(entries, 'W'));
    const apr24 = out.macro.points.find((p) => p.bucket === '2026-04-24')!;
    expect(apr24.cholesterolMg).toBeCloseTo(80, 1);
  });
});
