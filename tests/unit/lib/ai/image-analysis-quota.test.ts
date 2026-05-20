import { describe, expect, it } from 'vitest';

import { getImageAnalysisQuota, imageAnalysisQuotaWindows } from '@/lib/ai/image-analysis-quota';

function buildQuotaSupabase(counts: readonly number[]) {
  let countIndex = 0;
  const filters: Array<{ method: string; args: unknown[] }> = [];

  const query = {
    select: (...args: unknown[]) => {
      filters.push({ method: 'select', args });
      return query;
    },
    eq: (...args: unknown[]) => {
      filters.push({ method: 'eq', args });
      return query;
    },
    in: (...args: unknown[]) => {
      filters.push({ method: 'in', args });
      return query;
    },
    gte: (...args: unknown[]) => {
      filters.push({ method: 'gte', args });
      return query;
    },
    lt: async (...args: unknown[]) => {
      filters.push({ method: 'lt', args });
      const count = counts[countIndex] ?? 0;
      countIndex += 1;
      return { count, error: null };
    },
  };

  return {
    supabase: {
      from: (table: string) => {
        filters.push({ method: 'from', args: [table] });
        return query;
      },
    },
    filters,
  };
}

describe('image analysis quota', () => {
  it('uses user-timezone day and month windows', () => {
    const windows = imageAnalysisQuotaWindows('2026-05-18T03:30:00.000Z', 'Asia/Bangkok');

    expect(windows).toEqual({
      dayStartUtc: '2026-05-17T17:00:00.000Z',
      dayEndUtc: '2026-05-18T17:00:00.000Z',
      monthStartUtc: '2026-04-30T17:00:00.000Z',
      monthEndUtc: '2026-05-31T17:00:00.000Z',
    });
  });

  it('counts non-cached vision and sketch rows together for daily/monthly quota', async () => {
    const { supabase, filters } = buildQuotaSupabase([19, 99]);

    const quota = await getImageAnalysisQuota({
      supabase: supabase as never,
      userId: 'u-1',
      tz: 'UTC',
      nowIso: '2026-05-18T12:00:00.000Z',
    });

    expect(quota.exceeded).toBe(false);
    expect(quota.dailyRemaining).toBe(1);
    expect(quota.monthlyRemaining).toBe(1);
    expect(filters).toContainEqual({
      method: 'in',
      args: ['call_type', ['vision', 'image-analysis-sketch']],
    });
    expect(filters).toContainEqual({ method: 'eq', args: ['cached_flag', false] });
  });

  it('marks daily quota exhausted at 20 calls', async () => {
    const { supabase } = buildQuotaSupabase([20, 50]);

    const quota = await getImageAnalysisQuota({
      supabase: supabase as never,
      userId: 'u-1',
      tz: 'UTC',
      nowIso: '2026-05-18T12:00:00.000Z',
    });

    expect(quota.exceeded).toBe(true);
    expect(quota.reason).toBe('daily');
    expect(quota.dailyRemaining).toBe(0);
  });
});
