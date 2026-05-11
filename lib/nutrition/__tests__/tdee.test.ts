/**
 * `lib/nutrition/__tests__/tdee.test.ts` — Total Daily Energy Expenditure
 * table-driven fixtures.
 *
 * TDEE = BMR × activity_multiplier. Activity multipliers are the Harris-Benedict
 * canonical set, aligned with `profiles.activity_level` DDL enum:
 *
 *   sedentary    → 1.2
 *   light        → 1.375
 *   moderate     → 1.55
 *   active       → 1.725
 *   very_active  → 1.9
 *
 * (Source: Task 2.1 briefing §3.1 + architecture.md §2.2 `profiles.activity_level`
 * check constraint. The briefing uses the full 5-level enum; caller must pass
 * exactly one of those strings.)
 *
 * Output rounded to nearest integer per design-doc §10.3 (kcal/day never
 * fractional in UI).
 *
 * Fixtures exported so integration tests (I5 per testing-strategy §12) can reuse.
 */
import { describe, expect, it } from 'vitest';

import { calcTDEE, type ActivityLevel } from '@/lib/nutrition/tdee';

export interface TDEEFixture {
  readonly input: {
    readonly bmr: number;
    readonly activityLevel: ActivityLevel;
  };
  readonly expected: number;
  readonly rationale: string;
}

export const TDEE_FIXTURES: readonly TDEEFixture[] = [
  // Each of the 5 activity levels applied to the baseline male BMR (1780)
  {
    input: { bmr: 1780, activityLevel: 'sedentary' },
    // 1780 × 1.2 = 2136
    expected: 2136,
    rationale: 'sedentary (×1.2) — lowest multiplier branch',
  },
  {
    input: { bmr: 1780, activityLevel: 'light' },
    // 1780 × 1.375 = 2447.5 → 2448
    expected: 2448,
    rationale: 'light (×1.375) — fractional result rounds up',
  },
  {
    input: { bmr: 1780, activityLevel: 'moderate' },
    // 1780 × 1.55 = 2759
    expected: 2759,
    rationale: 'moderate (×1.55) — exact integer result',
  },
  {
    input: { bmr: 1780, activityLevel: 'active' },
    // 1780 × 1.725 = 3070.5 → 3071
    expected: 3071,
    rationale: 'active (×1.725) — fractional result rounds up',
  },
  {
    input: { bmr: 1780, activityLevel: 'very_active' },
    // 1780 × 1.9 = 3382
    expected: 3382,
    rationale: 'very_active (×1.9) — highest multiplier branch',
  },
  // Boundary BMR values (extreme low — elderly small-frame female)
  {
    input: { bmr: 789, activityLevel: 'sedentary' },
    // 789 × 1.2 = 946.8 → 947
    expected: 947,
    rationale: 'Extreme-low BMR (age-120 female fixture) × sedentary',
  },
  {
    input: { bmr: 789, activityLevel: 'very_active' },
    // 789 × 1.9 = 1499.1 → 1499
    expected: 1499,
    rationale: 'Extreme-low BMR × very_active for multiplier coverage',
  },
  // Boundary BMR values (extreme high — 350 kg male fixture)
  {
    input: { bmr: 4480, activityLevel: 'sedentary' },
    // 4480 × 1.2 = 5376
    expected: 5376,
    rationale: 'Extreme-high BMR (350 kg male fixture) × sedentary',
  },
  {
    input: { bmr: 4480, activityLevel: 'moderate' },
    // 4480 × 1.55 = 6944
    expected: 6944,
    rationale: 'Extreme-high BMR × moderate',
  },
  {
    input: { bmr: 4480, activityLevel: 'very_active' },
    // 4480 × 1.9 = 8512
    expected: 8512,
    rationale: 'Extreme-high BMR × very_active (multiplier compounding)',
  },
  // Mid-range BMR × each activity level to double-cover multipliers
  {
    input: { bmr: 1500, activityLevel: 'light' },
    // 1500 × 1.375 = 2062.5 → 2063 (banker's rounding edge — Math.round rounds
    // .5 AWAY from zero for positives, i.e. 2062.5 → 2063)
    expected: 2063,
    rationale: 'Mid-range BMR × light — documents .5 rounding direction',
  },
  {
    input: { bmr: 2000, activityLevel: 'active' },
    // 2000 × 1.725 = 3450
    expected: 3450,
    rationale: 'Round BMR × active — exact integer result',
  },
];

describe('calcTDEE — BMR × activity multiplier', () => {
  it.each(TDEE_FIXTURES)(
    'BMR $input.bmr × $input.activityLevel → $expected kcal ($rationale)',
    ({ input, expected }) => {
      const actual = calcTDEE(input.bmr, input.activityLevel);
      expect(actual).toBe(expected);
    },
  );

  it('returns an integer for every fixture', () => {
    for (const { input } of TDEE_FIXTURES) {
      const actual = calcTDEE(input.bmr, input.activityLevel);
      expect(Number.isInteger(actual)).toBe(true);
    }
  });

  it('is monotonically increasing across activity levels for a fixed BMR', () => {
    // Property: higher multiplier → strictly higher TDEE. Guards against a
    // future regression that swaps multiplier values.
    const bmr = 1780;
    const order: readonly ActivityLevel[] = [
      'sedentary',
      'light',
      'moderate',
      'active',
      'very_active',
    ];
    let prev = -Infinity;
    for (const level of order) {
      const tdee = calcTDEE(bmr, level);
      expect(tdee).toBeGreaterThan(prev);
      prev = tdee;
    }
  });
});
