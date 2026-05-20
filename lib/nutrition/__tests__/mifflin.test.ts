/**
 * `lib/nutrition/__tests__/mifflin.test.ts` - Mifflin-St Jeor BMR fixtures.
 *
 * The profile `bio_sex` domain is now `male | female`; legacy `other` values
 * are migrated to `male` by migration 0026.
 */
import { describe, expect, it } from 'vitest';

import { calcBMR } from '@/lib/nutrition/mifflin-st-jeor';

export interface BMRFixture {
  readonly input: {
    readonly bioSex: 'male' | 'female';
    readonly weightKg: number;
    readonly heightCm: number;
    readonly ageYears: number;
  };
  readonly expected: number;
  readonly rationale: string;
}

export const BMR_FIXTURES: readonly BMRFixture[] = [
  {
    input: { bioSex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 },
    expected: 1780,
    rationale: 'Baseline adult male',
  },
  {
    input: { bioSex: 'male', weightKg: 70, heightCm: 175, ageYears: 25 },
    expected: 1674,
    rationale: 'Male fractional height rounding',
  },
  {
    input: { bioSex: 'female', weightKg: 60, heightCm: 165, ageYears: 28 },
    expected: 1330,
    rationale: 'Baseline adult female',
  },
  {
    input: { bioSex: 'female', weightKg: 55, heightCm: 160, ageYears: 35 },
    expected: 1214,
    rationale: 'Female mid-age exact integer',
  },
  {
    input: { bioSex: 'male', weightKg: 55, heightCm: 160, ageYears: 13 },
    expected: 1490,
    rationale: 'Lower age boundary',
  },
  {
    input: { bioSex: 'female', weightKg: 55, heightCm: 160, ageYears: 120 },
    expected: 789,
    rationale: 'Upper age boundary',
  },
  {
    input: { bioSex: 'male', weightKg: 50, heightCm: 100, ageYears: 30 },
    expected: 980,
    rationale: 'Lower height boundary',
  },
  {
    input: { bioSex: 'male', weightKg: 100, heightCm: 250, ageYears: 30 },
    expected: 2418,
    rationale: 'Upper height boundary',
  },
  {
    input: { bioSex: 'female', weightKg: 30, heightCm: 165, ageYears: 30 },
    expected: 1020,
    rationale: 'Lower weight boundary',
  },
  {
    input: { bioSex: 'male', weightKg: 350, heightCm: 180, ageYears: 30 },
    expected: 4480,
    rationale: 'Upper weight boundary',
  },
];

describe('calcBMR - Mifflin-St Jeor formula', () => {
  it.each(BMR_FIXTURES)(
    '$input.bioSex $input.weightKg kg x $input.heightCm cm x $input.ageYears yr -> $expected kcal ($rationale)',
    ({ input, expected }) => {
      expect(calcBMR(input.bioSex, input.weightKg, input.heightCm, input.ageYears)).toBe(expected);
    },
  );

  it('returns an integer', () => {
    for (const { input } of BMR_FIXTURES) {
      expect(
        Number.isInteger(calcBMR(input.bioSex, input.weightKg, input.heightCm, input.ageYears)),
      ).toBe(true);
    }
  });

  it("rejects the retired 'other' branch", () => {
    expect(() => calcBMR('other' as never, 70, 170, 30)).toThrow('unsupported_bio_sex');
  });
});
