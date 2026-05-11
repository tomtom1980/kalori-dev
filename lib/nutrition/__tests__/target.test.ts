/**
 * `lib/nutrition/__tests__/target.test.ts` — calorie-target table-driven fixtures.
 *
 * Formula (briefing §3.1, testing-strategy §2.1):
 *
 *   dailyDelta = (goalDeltaKg × 7700) / (paceWeeks × 7)
 *   target     = tdee + dailyDelta
 *   return     Math.round(target / 10) × 10     // nearest 10 kcal
 *
 * Convention: `goalDeltaKg` is the desired weight change over `paceWeeks`
 * (positive = gain, negative = loss, zero = maintenance).
 *
 * 7,700 kcal ≈ 1 kg body fat (industry standard energy-mass equivalence).
 *
 * Briefing §3.1 / testing-strategy §2.1 line 108 require coverage of goal
 * deltas (+5, −10, 0) × pace bands (8, 12, 16, 24 weeks) and the nearest-10
 * rounding. No hard minimum floor (e.g. 1200 kcal) is specified in the
 * briefing — caller UX is responsible for surfacing unhealthy targets.
 */
import { describe, expect, it } from 'vitest';

import { calcCalorieTarget } from '@/lib/nutrition/target';

export interface TargetFixture {
  readonly input: {
    readonly tdee: number;
    readonly goalDeltaKg: number;
    readonly paceWeeks: number;
  };
  readonly expected: number;
  readonly rationale: string;
}

export const TARGET_FIXTURES: readonly TargetFixture[] = [
  // Loss goals across pace bands (8, 12, 16, 24 weeks)
  {
    input: { tdee: 2200, goalDeltaKg: -10, paceWeeks: 16 },
    // daily = -687.5, raw = 1512.5, rounded/10 = 1510
    expected: 1510,
    rationale: 'Loss −10 kg over 16 weeks (moderate pace)',
  },
  {
    input: { tdee: 2200, goalDeltaKg: -5, paceWeeks: 12 },
    // daily = -458.333, raw = 1741.667, rounded/10 = 1740
    expected: 1740,
    rationale: 'Loss −5 kg over 12 weeks',
  },
  {
    input: { tdee: 2500, goalDeltaKg: -10, paceWeeks: 24 },
    // daily = -458.333, raw = 2041.667, rounded/10 = 2040
    expected: 2040,
    rationale: 'Loss −10 kg over 24 weeks (slowest pace band)',
  },
  {
    input: { tdee: 2500, goalDeltaKg: -10, paceWeeks: 8 },
    // daily = -1375, raw = 1125, rounded/10 = 1130 (Math.round(112.5) = 113)
    expected: 1130,
    rationale: 'Loss −10 kg over 8 weeks (fastest/aggressive pace band)',
  },
  {
    input: { tdee: 1800, goalDeltaKg: -5, paceWeeks: 16 },
    // daily = -343.75, raw = 1456.25, rounded/10 = 1460
    expected: 1460,
    rationale: 'Low-TDEE loss scenario',
  },
  // Gain goals
  {
    input: { tdee: 2200, goalDeltaKg: 5, paceWeeks: 12 },
    // daily = +458.333, raw = 2658.333, rounded/10 = 2660
    expected: 2660,
    rationale: 'Gain +5 kg over 12 weeks',
  },
  {
    input: { tdee: 2000, goalDeltaKg: 5, paceWeeks: 8 },
    // daily = +687.5, raw = 2687.5, rounded/10 = 2690
    expected: 2690,
    rationale: 'Gain +5 kg over 8 weeks (aggressive bulk)',
  },
  {
    input: { tdee: 3000, goalDeltaKg: -10, paceWeeks: 8 },
    // daily = -1375, raw = 1625, rounded/10 = 1630
    expected: 1630,
    rationale: 'Very aggressive cut from high-TDEE baseline',
  },
  // Maintenance (goalDeltaKg = 0)
  {
    input: { tdee: 2200, goalDeltaKg: 0, paceWeeks: 12 },
    expected: 2200,
    rationale: 'Maintenance goal — target equals TDEE, pace irrelevant',
  },
  {
    input: { tdee: 2200, goalDeltaKg: 0, paceWeeks: 8 },
    expected: 2200,
    rationale: 'Maintenance goal with different pace — still equals TDEE',
  },
  // Fractional goal delta (supports real-world UI slider values)
  {
    input: { tdee: 2200, goalDeltaKg: 2.5, paceWeeks: 12 },
    // daily = +229.167, raw = 2429.167, rounded/10 = 2430
    expected: 2430,
    rationale: 'Fractional gain 2.5 kg — confirms sub-kilo deltas supported',
  },
];

describe('calcCalorieTarget — TDEE + dailyDelta(goal/pace), rounded to nearest 10 kcal', () => {
  it.each(TARGET_FIXTURES)(
    'TDEE $input.tdee + goal $input.goalDeltaKg kg / $input.paceWeeks wk → $expected kcal ($rationale)',
    ({ input, expected }) => {
      const actual = calcCalorieTarget(input.tdee, input.goalDeltaKg, input.paceWeeks);
      expect(actual).toBe(expected);
    },
  );

  it('always returns a multiple of 10 kcal', () => {
    for (const { input } of TARGET_FIXTURES) {
      const actual = calcCalorieTarget(input.tdee, input.goalDeltaKg, input.paceWeeks);
      expect(actual % 10).toBe(0);
    }
  });

  it('maintenance (goalDeltaKg=0) returns tdee rounded to nearest 10', () => {
    // TDEE = 2201 rounds to 2200; TDEE = 2205 rounds to 2210 (half-up).
    expect(calcCalorieTarget(2201, 0, 12)).toBe(2200);
    expect(calcCalorieTarget(2205, 0, 12)).toBe(2210);
  });

  it('loss and gain of same magnitude straddle TDEE symmetrically', () => {
    const tdee = 2200;
    const loss = calcCalorieTarget(tdee, -5, 12);
    const gain = calcCalorieTarget(tdee, 5, 12);
    // (tdee - loss) should equal (gain - tdee) within the 10-kcal rounding band.
    const lossDelta = tdee - loss;
    const gainDelta = gain - tdee;
    expect(Math.abs(lossDelta - gainDelta)).toBeLessThanOrEqual(10);
  });
});
