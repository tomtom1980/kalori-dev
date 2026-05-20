/**
 * Phase 2D — cholesterol on the TrendSummary aggregator.
 *
 * Mirrors `progress-cholesterol.test.ts` for the trend summary: per-bucket
 * cholesterol sums roll up into a `cholesterolAvgMg` field on
 * `TrendSummaryData`, averaged across the same logged-bucket denominator
 * as the other four macros. Legacy items lacking `cholesterol_mg` coerce
 * to 0 (parity with `numOr0`); empty windows emit 0.
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
    kcal?: number;
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
  return {
    id: `e-${loggedAt}`,
    logged_at: loggedAt,
    meal_category: 'lunch',
    library_item_id: null,
    items: [
      {
        name: 'Egg & toast',
        portion: 1,
        unit: 'serving',
        kcal: opts.kcal ?? 250,
        macros,
        micros: {},
        confidence: 0.9,
      },
    ],
  } as unknown as FoodEntryRow;
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

describe('lib/aggregations/progress — TrendSummary cholesterol', () => {
  it('W: computes avg cholesterol_mg across logged days', () => {
    // 3 logged days; cholesterol values 150, 200, 250 → avg = 200.
    const entries: FoodEntryRow[] = [
      entry('2026-04-18T05:00:00.000Z', { cholesterol: 150 }),
      entry('2026-04-20T05:00:00.000Z', { cholesterol: 200 }),
      entry('2026-04-22T05:00:00.000Z', { cholesterol: 250 }),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    expect(result.trend.cholesterolAvgMg).toBe(200);
  });

  it('emits cholesterolTargetMg = 300 by default', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-22T05:00:00.000Z', { cholesterol: 100 }),
      entry('2026-04-23T05:00:00.000Z', { cholesterol: 100 }),
      entry('2026-04-24T03:00:00.000Z', { cholesterol: 100 }),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    expect(result.trend.cholesterolTargetMg).toBe(300);
  });

  it('honors explicit profile.cholesterol_target_mg', () => {
    const entries: FoodEntryRow[] = [entry('2026-04-24T05:00:00.000Z', { cholesterol: 80 })];
    const result = aggregateProgress(baseInput(entries, 'W', { cholesterol_target_mg: 250 }));
    expect(result.trend.cholesterolTargetMg).toBe(250);
  });

  it('empty window → cholesterolAvgMg = 0', () => {
    const result = aggregateProgress(baseInput([], 'W'));
    expect(result.trend.cholesterolAvgMg).toBe(0);
  });

  it('legacy items missing macros.cholesterol_mg coerce to 0', () => {
    // No cholesterol values supplied for any entry — average should be 0.
    const entries: FoodEntryRow[] = [
      entry('2026-04-22T05:00:00.000Z'),
      entry('2026-04-23T05:00:00.000Z'),
      entry('2026-04-24T03:00:00.000Z'),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    expect(result.trend.cholesterolAvgMg).toBe(0);
  });

  it('non-finite cholesterol_mg values coerce to 0 via numOr0', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-22T05:00:00.000Z', { cholesterol: Number.NaN }),
      entry('2026-04-23T05:00:00.000Z', { cholesterol: Number.POSITIVE_INFINITY }),
      entry('2026-04-24T03:00:00.000Z', { cholesterol: 90 }),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    // 3 logged days, only one contributes 90 → 90/3 = 30.
    expect(result.trend.cholesterolAvgMg).toBe(30);
  });

  it('cholesterol appears in srSummary alongside the existing macros', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-22T05:00:00.000Z', { cholesterol: 100 }),
      entry('2026-04-23T05:00:00.000Z', { cholesterol: 100 }),
      entry('2026-04-24T03:00:00.000Z', { cholesterol: 100 }),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    expect(result.trend.srSummary).toMatch(/cholesterol/i);
    expect(result.trend.srSummary).toMatch(/100/); // the avg cholesterol value
    expect(result.trend.srSummary).toMatch(/milligrams|mg/i);
  });

  it('cholesterol appears in commentary alongside the existing macros', () => {
    const entries: FoodEntryRow[] = [
      entry('2026-04-22T05:00:00.000Z', { cholesterol: 200 }),
      entry('2026-04-23T05:00:00.000Z', { cholesterol: 200 }),
      entry('2026-04-24T03:00:00.000Z', { cholesterol: 200 }),
    ];
    const result = aggregateProgress(baseInput(entries, 'W'));
    expect(result.trend.commentary).toMatch(/200\s*mg/i);
  });
});
