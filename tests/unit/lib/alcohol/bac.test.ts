import { describe, expect, it } from 'vitest';

import { calculateBac } from '@/lib/alcohol/bac';

describe('calculateBac', () => {
  const asOf = '2026-05-19T12:00:00.000Z';

  it('returns 0 when there are no alcohol logs', () => {
    expect(
      calculateBac({
        logs: [],
        profile: { bio_sex: 'male', current_weight_kg: 70 },
        asOf,
      }),
    ).toBe(0);
  });

  it('ramps a new drink linearly over 30 minutes', () => {
    const full = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T11:30:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    const halfway = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T11:45:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });

    expect(halfway).toBeCloseTo(full / 2, 4);
  });

  it('decays a fully absorbed drink by 0.015 BAC per hour', () => {
    const atThirtyMinutes = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T11:30:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    const ninetyMinutes = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T10:30:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });

    expect(atThirtyMinutes - ninetyMinutes).toBeCloseTo(0.015, 4);
  });

  it('applies elimination once to the total BAC for multiple simultaneous drinks', () => {
    const oneDrink = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T10:30:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    const twoDrinks = calculateBac({
      logs: [
        { alcohol_grams: 14, consumed_at: '2026-05-19T10:30:00.000Z' },
        { alcohol_grams: 14, consumed_at: '2026-05-19T10:30:00.000Z' },
      ],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    const fullyAbsorbedOneDrink = calculateBac({
      logs: [{ alcohol_grams: 14, consumed_at: '2026-05-19T11:30:00.000Z' }],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });

    expect(twoDrinks).toBeCloseTo(fullyAbsorbedOneDrink * 2 - 0.0075, 4);
    expect(twoDrinks).toBeGreaterThan(oneDrink * 1.5);
  });

  it('clamps at 0 after elimination exceeds absorbed alcohol', () => {
    expect(
      calculateBac({
        logs: [{ alcohol_grams: 14, consumed_at: '2026-05-16T12:00:00.000Z' }],
        profile: { bio_sex: 'female', current_weight_kg: 70 },
        asOf,
      }),
    ).toBe(0);
  });

  it('is deterministic for a fixed asOf and supports only male/female coefficients', () => {
    const input = {
      logs: [{ alcohol_grams: 28, consumed_at: '2026-05-19T10:00:00.000Z' }],
      profile: { bio_sex: 'female' as const, current_weight_kg: 62 },
      asOf,
    };

    expect(calculateBac(input)).toBe(calculateBac(input));
    expect(() =>
      calculateBac({
        logs: input.logs,
        profile: { bio_sex: 'other' as never, current_weight_kg: 62 },
        asOf,
      }),
    ).toThrow('unsupported_bio_sex');
  });

  it('yesterday plus recent drink: old drink fully metabolized, new drink contributes positively (Bug 3 regression)', () => {
    // Male 70kg, r=0.68. peakBac per 14g drink = 14/(70000*0.68)*100 = 0.0294118.
    // D1 (14g at 2026-05-18T22:00): absorption window [22:00, 22:30]
    //   Segment [22:00, 22:30] (0.5h): rate = 0.058824 - 0.015 = 0.043824/hr x 0.5h = 0.021912.
    //     bac = 0 + 0.021912 = 0.021912.
    //   Segment [22:30, 11:00] (12.5h): rate = -0.015/hr x 12.5h = -0.1875.
    //     bac = max(0, 0.021912 - 0.1875) = 0.
    // D2 (14g at 2026-05-19T11:00): absorption window [11:00, 11:30]
    //   Segment [11:00, 11:30] (0.5h): rate = 0.043824/hr x 0.5h = 0.021912.
    //     bac = max(0, 0 + 0.021912) = 0.021912.
    //   Segment [11:30, 12:00] (0.5h): rate = -0.015/hr x 0.5h = -0.0075.
    //     bac = 0.021912 - 0.0075 = 0.014412.
    // Expected: 0.0144 (precise). Current buggy code returns 0 (13.5h elimination wipes everything).
    const bac = calculateBac({
      logs: [
        { alcohol_grams: 14, consumed_at: '2026-05-18T22:00:00.000Z' },
        { alcohol_grams: 14, consumed_at: '2026-05-19T11:00:00.000Z' },
      ],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    expect(bac).toBeGreaterThan(0);
    expect(bac).toBeCloseTo(0.0144, 4);
  });

  it('old drink fully metabolized hours ago: recent drink still partially absorbs (Bug 3 regression)', () => {
    // Male 70kg, r=0.68.
    // D1 (25g at 2026-05-19T04:00): peakBac = 25/(70000*0.68)*100 = 0.052521.
    //   Segment [04:00, 04:30] (0.5h): rate = 0.105042 - 0.015 = 0.090042/hr x 0.5h = 0.045021.
    //     bac = 0 + 0.045021 = 0.045021.
    //   Segment [04:30, 11:50] (7.333h): rate = -0.015/hr x 7.333h = -0.11.
    //     bac = max(0, 0.045021 - 0.11) = 0.
    // D2 (14g at 2026-05-19T11:50): peakBac = 0.029412. Absorption window [11:50, 12:20].
    //   asOf=12:00 falls mid-absorption.
    //   Segment [11:50, 12:00] (1/6h): D2 still absorbing.
    //     rate = 0.058824 - 0.015 = 0.043824/hr x 1/6h = 0.007304.
    //     bac = max(0, 0 + 0.007304) = 0.007304.
    // Expected: 0.0073 (precise). Current buggy code returns 0.
    const bac = calculateBac({
      logs: [
        { alcohol_grams: 25, consumed_at: '2026-05-19T04:00:00.000Z' },
        { alcohol_grams: 14, consumed_at: '2026-05-19T11:50:00.000Z' },
      ],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf,
    });
    expect(bac).toBeGreaterThan(0);
    expect(bac).toBeCloseTo(0.0073, 4);
  });

  it('three drinks across an evening: peak then decay tracked per segment (Bug 3 regression)', () => {
    // Male 70kg, r=0.68. peakBac per 14g drink = 0.029412.
    // Segments (asOf = 22:00):
    //   [19:00, 19:30] (0.5h): D1 absorbing. rate = 0.058824 - 0.015 = 0.043824. bac += 0.021912 -> 0.021912.
    //   [19:30, 20:00] (0.5h): nothing absorbing. rate = -0.015. bac -= 0.0075 -> 0.014412.
    //   [20:00, 20:30] (0.5h): D2 absorbing. rate = 0.043824. bac += 0.021912 -> 0.036324.
    //   [20:30, 21:00] (0.5h): nothing absorbing. bac -= 0.0075 -> 0.028824.
    //   [21:00, 21:30] (0.5h): D3 absorbing. rate = 0.043824. bac += 0.021912 -> 0.050735.
    //   [21:30, 22:00] (0.5h): nothing absorbing. bac -= 0.0075 -> 0.043235.
    // Expected: 0.0432 (precise). Current buggy code returns 3*0.029412 - 3*0.015 = 0.0432.
    //   (Coincidentally the old buggy code also returns ~0.0432 here because all 3 drinks fully
    //   absorb and the 3h elimination clock x 0.015 approximates aggregated decay. This test pins the per-segment
    //   correctness; the harder bugfix tests are the two above.)
    const bac = calculateBac({
      logs: [
        { alcohol_grams: 14, consumed_at: '2026-05-19T19:00:00.000Z' },
        { alcohol_grams: 14, consumed_at: '2026-05-19T20:00:00.000Z' },
        { alcohol_grams: 14, consumed_at: '2026-05-19T21:00:00.000Z' },
      ],
      profile: { bio_sex: 'male', current_weight_kg: 70 },
      asOf: '2026-05-19T22:00:00.000Z',
    });
    expect(bac).toBeGreaterThan(0);
    expect(bac).toBeCloseTo(0.0432, 4);
  });
});
