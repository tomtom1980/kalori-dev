/**
 * `lib/nutrition/__tests__/mifflin.test.ts` — Mifflin-St Jeor BMR table-driven
 * fixtures.
 *
 * Specification of record: Mifflin MD, St Jeor ST, et al., Am J Clin Nutr
 * 1990;51:241-7. Canonical published formula (per Task 2.1 briefing §3.1):
 *
 *   BMR (male)   = 10 × weight_kg + 6.25 × height_cm − 5 × age_years + 5
 *   BMR (female) = 10 × weight_kg + 6.25 × height_cm − 5 × age_years − 161
 *   BMR (other)  = (BMR_male + BMR_female) / 2
 *                = 10 × weight_kg + 6.25 × height_cm − 5 × age_years − 78
 *
 * The 'other' branch encodes the midpoint as a first-class constant (−78) —
 * the canonical MyFitnessPal/Cronometer approach for non-binary bio_sex.
 *
 * `calcBMR` rounds to the nearest integer (design-doc §10.3: kcal/day surfaces
 * are never fractional).
 *
 * Fixtures below are exported so integration tests (I5 per testing-strategy §12)
 * can reuse them without duplication.
 */
import { describe, expect, it } from 'vitest';

import { calcBMR } from '@/lib/nutrition/mifflin-st-jeor';

export interface BMRFixture {
  readonly input: {
    readonly bioSex: 'male' | 'female' | 'other';
    readonly weightKg: number;
    readonly heightCm: number;
    readonly ageYears: number;
  };
  readonly expected: number;
  readonly rationale: string;
}

export const BMR_FIXTURES: readonly BMRFixture[] = [
  // Male branch (+5 constant)
  {
    input: { bioSex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 },
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expected: 1780,
    rationale: 'Baseline adult male — primary branch coverage',
  },
  {
    input: { bioSex: 'male', weightKg: 70, heightCm: 175, ageYears: 25 },
    // 700 + 1093.75 - 125 + 5 = 1673.75 → 1674
    expected: 1674,
    rationale: 'Male fractional height rounding (.75 → nearest int)',
  },
  // Female branch (−161 constant)
  {
    input: { bioSex: 'female', weightKg: 60, heightCm: 165, ageYears: 28 },
    // 600 + 1031.25 - 140 - 161 = 1330.25 → 1330
    expected: 1330,
    rationale: 'Baseline adult female — primary branch coverage',
  },
  {
    input: { bioSex: 'female', weightKg: 55, heightCm: 160, ageYears: 35 },
    // 550 + 1000 - 175 - 161 = 1214
    expected: 1214,
    rationale: 'Female mid-age exact-integer result',
  },
  // Other branch (−78 constant, midpoint of +5 and −161)
  {
    input: { bioSex: 'other', weightKg: 70, heightCm: 170, ageYears: 30 },
    // 700 + 1062.5 - 150 - 78 = 1534.5 → 1535
    expected: 1535,
    rationale: "Baseline 'other' bio_sex — midpoint constant −78 branch",
  },
  {
    input: { bioSex: 'other', weightKg: 65, heightCm: 172, ageYears: 40 },
    // 650 + 1075 - 200 - 78 = 1447
    expected: 1447,
    rationale: "'other' integer-result fixture proving the −78 constant",
  },
  // Boundary ages (13 → 120 per profiles.age DDL check constraint)
  {
    input: { bioSex: 'male', weightKg: 55, heightCm: 160, ageYears: 13 },
    // 550 + 1000 - 65 + 5 = 1490
    expected: 1490,
    rationale: 'Lower age boundary (13) — DDL min',
  },
  {
    input: { bioSex: 'female', weightKg: 55, heightCm: 160, ageYears: 120 },
    // 550 + 1000 - 600 - 161 = 789
    expected: 789,
    rationale: 'Upper age boundary (120) — DDL max; very low BMR floor check',
  },
  // Boundary heights (100 → 250 cm per DDL)
  {
    input: { bioSex: 'male', weightKg: 50, heightCm: 100, ageYears: 30 },
    // 500 + 625 - 150 + 5 = 980
    expected: 980,
    rationale: 'Lower height boundary (100 cm) — DDL min',
  },
  {
    input: { bioSex: 'male', weightKg: 100, heightCm: 250, ageYears: 30 },
    // 1000 + 1562.5 - 150 + 5 = 2417.5 → 2418
    expected: 2418,
    rationale: 'Upper height boundary (250 cm) — DDL max; rounding check',
  },
  // Boundary weights (30 → 350 kg per DDL)
  {
    input: { bioSex: 'female', weightKg: 30, heightCm: 165, ageYears: 30 },
    // 300 + 1031.25 - 150 - 161 = 1020.25 → 1020
    expected: 1020,
    rationale: 'Lower weight boundary (30 kg) — DDL min',
  },
  {
    input: { bioSex: 'male', weightKg: 350, heightCm: 180, ageYears: 30 },
    // 3500 + 1125 - 150 + 5 = 4480
    expected: 4480,
    rationale: 'Upper weight boundary (350 kg) — DDL max',
  },
];

describe('calcBMR — Mifflin-St Jeor formula', () => {
  it.each(BMR_FIXTURES)(
    '$input.bioSex $input.weightKg kg × $input.heightCm cm × $input.ageYears yr → $expected kcal ($rationale)',
    ({ input, expected }) => {
      const actual = calcBMR(input.bioSex, input.weightKg, input.heightCm, input.ageYears);
      expect(actual).toBe(expected);
    },
  );

  it('returns an integer (no fractional kcal)', () => {
    for (const { input } of BMR_FIXTURES) {
      const actual = calcBMR(input.bioSex, input.weightKg, input.heightCm, input.ageYears);
      expect(Number.isInteger(actual)).toBe(true);
    }
  });

  it("the 'other' branch equals the exact midpoint of male and female", () => {
    // Property check: BMR_other = (BMR_male + BMR_female) / 2 for any fixed
    // weight/height/age triple. Rounding can shift by at most 1 kcal, so we
    // assert |diff| ≤ 1.
    const cases = [
      { weightKg: 70, heightCm: 170, ageYears: 30 },
      { weightKg: 50, heightCm: 155, ageYears: 45 },
      { weightKg: 90, heightCm: 188, ageYears: 22 },
    ];
    for (const c of cases) {
      const male = calcBMR('male', c.weightKg, c.heightCm, c.ageYears);
      const female = calcBMR('female', c.weightKg, c.heightCm, c.ageYears);
      const other = calcBMR('other', c.weightKg, c.heightCm, c.ageYears);
      const midpoint = (male + female) / 2;
      expect(Math.abs(other - midpoint)).toBeLessThanOrEqual(1);
    }
  });
});
