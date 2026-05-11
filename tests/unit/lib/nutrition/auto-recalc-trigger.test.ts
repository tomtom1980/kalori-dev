/**
 * Task 4.3b — auto-mode vs manual-mode trigger behaviour for recalc pipeline.
 *
 * NOTE: `recalcTargetIfNeeded` is pure — it does NOT read `target_mode`. The
 * API route handler is the one that checks `target_mode === 'auto'` before
 * persisting the recalc. These unit tests focus on the downstream
 * `shouldPersistRecalc` helper, which composes the two signals.
 */
import { describe, expect, it, vi } from 'vitest';

import { recalcTargetIfNeeded, shouldPersistRecalc } from '@/lib/nutrition/recalc';

const baseProfile = {
  bio_sex: 'female' as const,
  age: 35,
  height_cm: 165,
  current_weight_kg: 68,
  activity_level: 'light' as const,
  goal_weight_kg: 62,
  goal_pace: 'moderate' as const,
};

describe('shouldPersistRecalc — mode + threshold combinations', () => {
  it('auto + above threshold → true', () => {
    const result = recalcTargetIfNeeded({
      profile: baseProfile,
      newWeightKg: 70,
      thresholdPct: 2.0,
    });
    expect(shouldPersistRecalc('auto', result)).toBe(true);
  });

  it('auto + below threshold → false', () => {
    const result = recalcTargetIfNeeded({
      profile: baseProfile,
      newWeightKg: 68.2,
      thresholdPct: 2.0,
    });
    expect(shouldPersistRecalc('auto', result)).toBe(false);
  });

  it('manual + above threshold → false (manual override locks target)', () => {
    const result = recalcTargetIfNeeded({
      profile: baseProfile,
      newWeightKg: 75, // huge swing
      thresholdPct: 2.0,
    });
    expect(shouldPersistRecalc('manual', result)).toBe(false);
  });

  it('manual + below threshold → false', () => {
    const result = recalcTargetIfNeeded({
      profile: baseProfile,
      newWeightKg: 68.1,
      thresholdPct: 2.0,
    });
    expect(shouldPersistRecalc('manual', result)).toBe(false);
  });
});

describe('shouldPersistRecalc — purity', () => {
  it('triggers zero fetch invocations across many calls', () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      for (const [mode, newWeight] of [
        ['auto', 70],
        ['auto', 75],
        ['manual', 70],
        ['manual', 65],
      ] as const) {
        const r = recalcTargetIfNeeded({
          profile: baseProfile,
          newWeightKg: newWeight,
          thresholdPct: 2.0,
        });
        shouldPersistRecalc(mode, r);
      }
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('buildIdempotencyKey — uniqueness + stability', () => {
  it('same inputs yield identical key (idempotent replay protection)', async () => {
    const { buildRecalcIdempotencyKey } = await import('@/lib/nutrition/recalc');
    const k1 = buildRecalcIdempotencyKey({
      userId: 'user-1',
      clientId: 'uuid-aaa',
      newWeightKg: 71.5,
    });
    const k2 = buildRecalcIdempotencyKey({
      userId: 'user-1',
      clientId: 'uuid-aaa',
      newWeightKg: 71.5,
    });
    expect(k1).toBe(k2);
    expect(k1.length).toBeGreaterThan(8);
  });

  it('different clientId yields different key', async () => {
    const { buildRecalcIdempotencyKey } = await import('@/lib/nutrition/recalc');
    const k1 = buildRecalcIdempotencyKey({
      userId: 'user-1',
      clientId: 'uuid-aaa',
      newWeightKg: 71.5,
    });
    const k2 = buildRecalcIdempotencyKey({
      userId: 'user-1',
      clientId: 'uuid-bbb',
      newWeightKg: 71.5,
    });
    expect(k1).not.toBe(k2);
  });

  it('different userId yields different key (cross-user collision safety)', async () => {
    const { buildRecalcIdempotencyKey } = await import('@/lib/nutrition/recalc');
    const k1 = buildRecalcIdempotencyKey({
      userId: 'user-1',
      clientId: 'uuid-aaa',
      newWeightKg: 71.5,
    });
    const k2 = buildRecalcIdempotencyKey({
      userId: 'user-2',
      clientId: 'uuid-aaa',
      newWeightKg: 71.5,
    });
    expect(k1).not.toBe(k2);
  });
});
