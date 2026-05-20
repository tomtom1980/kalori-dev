/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import {
  buildNutritionSummaryContext,
  computeNutritionSummaryFingerprint,
  NutritionSummaryContextReadError,
} from '@/lib/aggregations/summary-context';

type TableName = 'food_entries' | 'water_log' | 'weight_log';

function makeSupabase(input: {
  rows?: Partial<Record<TableName, unknown[]>>;
  errors?: Partial<Record<TableName, unknown>>;
}) {
  return {
    from(table: string) {
      const name = table as TableName;
      const result = async () => ({
        data: input.rows?.[name] ?? [],
        error: input.errors?.[name] ?? null,
      });
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              lt: result,
              lte: () => ({
                order: result,
              }),
            }),
          }),
        }),
      };
    },
  };
}

const baseInput = {
  userId: 'u-1',
  scope: 'dashboard-day' as const,
  day: '2026-05-18',
  timezone: 'Asia/Bangkok',
  profile: {
    calorie_target: 2000,
    current_weight_kg: 82,
    goal_weight_kg: 78,
    activity_level: 'moderate',
    goal_pace: 'moderate',
    target_mode: 'auto',
    unit_pref: 'metric',
  },
};

describe('buildNutritionSummaryContext', () => {
  it('buckets food entries by the user timezone local day before fingerprinting', async () => {
    const supabase = makeSupabase({
      rows: {
        food_entries: [
          {
            logged_at: '2026-05-17T18:30:00.000Z',
            items: [
              {
                name: 'Late tofu bowl',
                kcal: 420,
                macros: { protein_g: 28, carbs_g: 45, fat_g: 14, fiber_g: 7 },
              },
            ],
          },
        ],
        water_log: [],
        weight_log: [],
      },
    });

    const context = await buildNutritionSummaryContext({ ...baseInput, supabase });

    expect(context.food.entry_count).toBe(1);
    expect(context.food.logged_days).toBe(1);
    expect(context.food.daily).toEqual([
      expect.objectContaining({
        date: '2026-05-18',
        entry_count: 1,
        highlights: ['Late tofu bowl'],
        totals: expect.objectContaining({ kcal: 420, protein_g: 28 }),
      }),
    ]);
    expect(context.food.missing_days).toEqual([]);
    const fingerprint = computeNutritionSummaryFingerprint(context);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(['food_entries', 'water_log', 'weight_log'] as const)(
    'fails closed when %s returns an error',
    async (table) => {
      const supabase = makeSupabase({
        rows: { food_entries: [], water_log: [], weight_log: [] },
        errors: { [table]: { code: '42501', message: 'denied' } },
      });

      await expect(buildNutritionSummaryContext({ ...baseInput, supabase })).rejects.toMatchObject({
        name: 'NutritionSummaryContextReadError',
        source: table,
      });
    },
  );

  it('preserves the original query error on the fail-closed exception', async () => {
    const error = { code: 'PGRST204', message: 'column missing' };
    const supabase = makeSupabase({
      rows: { food_entries: [], water_log: [], weight_log: [] },
      errors: { food_entries: error },
    });

    await expect(buildNutritionSummaryContext({ ...baseInput, supabase })).rejects.toSatisfy(
      (err) =>
        err instanceof NutritionSummaryContextReadError &&
        err.source === 'food_entries' &&
        err.causeValue === error,
    );
  });
});
