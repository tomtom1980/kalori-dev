/**
 * Task 4.3b — `lib/nutrition/recalc.ts` threshold-boundary unit tests.
 *
 * Purity + boundary coverage required by testing-strategy §2.1 + briefing §13:
 *   - Just below / just above threshold
 *   - Zero delta
 *   - Negative delta above threshold (weight loss)
 *   - First-ever entry (current_weight_kg null-ish edge — decision per briefing
 *     is: `didRecalc = true` so a baseline is established)
 *   - Identical repeated weight
 *   - Zero threshold (must recalc on any non-zero delta)
 *   - Extreme small threshold (0.0001 epsilon)
 *   - IO absence — no fetch/globalThis side-effects; assert by mocking fetch
 *     and expecting zero invocations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recalcTargetIfNeeded } from '@/lib/nutrition/recalc';

const baseProfile = {
  bio_sex: 'male' as const,
  age: 30,
  height_cm: 170,
  current_weight_kg: 70,
  activity_level: 'moderate' as const,
  goal_weight_kg: 65,
  goal_pace: 'moderate' as const,
};

describe('recalcTargetIfNeeded — threshold boundary', () => {
  it('just below threshold (2%) → didRecalc=false', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70.8, // 1.14% delta
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(false);
  });

  it('just above threshold (2%) → didRecalc=true + recomputes BMR/TDEE/target', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 71.5, // 2.14% delta
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(true);
    expect(typeof result.newBmr).toBe('number');
    expect(typeof result.newTdee).toBe('number');
    expect(typeof result.newTarget).toBe('number');
  });

  it('zero delta → didRecalc=false', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70,
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(false);
  });

  it('negative delta above threshold (weight loss) → didRecalc=true', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 68.5, // |Δ|=1.5, 2.14%
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(true);
  });

  it('first-ever entry (current_weight_kg null) → didRecalc=true (establish baseline)', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: null as unknown as number },
      newWeightKg: 70,
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(true);
  });

  it('thresholdPct = 0 → didRecalc=true on any non-zero delta', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70.01,
      thresholdPct: 0,
    });
    expect(result.didRecalc).toBe(true);
  });

  it('thresholdPct = 0 + zero delta → didRecalc=false (no non-zero change)', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70,
      thresholdPct: 0,
    });
    expect(result.didRecalc).toBe(false);
  });

  it('5% threshold + 4.86% delta → didRecalc=false', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 73.4,
      thresholdPct: 5.0,
    });
    expect(result.didRecalc).toBe(false);
  });

  it('extreme-small threshold (0.0001%) + tiny delta → didRecalc=true', () => {
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70.01,
      thresholdPct: 0.0001,
    });
    expect(result.didRecalc).toBe(true);
  });
});

describe('recalcTargetIfNeeded — purity / IO absence', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fires no fetch / network calls regardless of inputs', () => {
    recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 71.5,
      thresholdPct: 2.0,
    });
    recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 70.1,
      thresholdPct: 2.0,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });
});

describe('recalcTargetIfNeeded — math composition', () => {
  it('newBmr matches calcBMR direct call for the new weight', async () => {
    const { calcBMR } = await import('@/lib/nutrition/mifflin-st-jeor');
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 75, // well above any threshold
      thresholdPct: 2.0,
    });
    expect(result.didRecalc).toBe(true);
    expect(result.newBmr).toBe(
      calcBMR(baseProfile.bio_sex, 75, baseProfile.height_cm, baseProfile.age),
    );
  });

  it('newTdee matches calcTDEE(calcBMR(…), activity_level)', async () => {
    const { calcBMR } = await import('@/lib/nutrition/mifflin-st-jeor');
    const { calcTDEE } = await import('@/lib/nutrition/tdee');
    const result = recalcTargetIfNeeded({
      profile: { ...baseProfile, current_weight_kg: 70 },
      newWeightKg: 75,
      thresholdPct: 2.0,
    });
    const bmr = calcBMR(baseProfile.bio_sex, 75, baseProfile.height_cm, baseProfile.age);
    expect(result.newTdee).toBe(calcTDEE(bmr, baseProfile.activity_level));
  });
});
