/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NutritionSummaryContext } from '@/lib/aggregations/summary-context';

const context: NutritionSummaryContext = {
  scope: 'progress-range',
  range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
  timezone: 'UTC',
  profile: {
    calorie_target: 2000,
    protein_target_g: 125,
    carbs_target_g: 225,
    fat_target_g: 67,
    fiber_target_g: 30,
    cholesterol_target_mg: 300,
    current_weight_kg: 82,
    goal_weight_kg: 78,
    activity_level: 'moderate',
    goal_pace: 'moderate',
    target_mode: 'auto',
    unit_pref: 'metric',
  },
  food: {
    entry_count: 1,
    logged_days: 1,
    missing_days: ['2026-05-12'],
    totals: { kcal: 680, protein_g: 42, carbs_g: 82, fat_g: 22, fiber_g: 8, cholesterol_mg: 120 },
    highlights: ['Chicken rice'],
    daily: [
      {
        date: '2026-05-18',
        entry_count: 1,
        totals: {
          kcal: 680,
          protein_g: 42,
          carbs_g: 82,
          fat_g: 22,
          fiber_g: 8,
          cholesterol_mg: 120,
        },
        highlights: ['Chicken rice'],
      },
    ],
  },
  water: { log_count: 0, total_ml: 0, target_ml: 2000, daily: [] },
  weight: { log_count: 0, latest_kg: null, latest_on: null, trend_kg: null, logs: [] },
  caveats: ['Only 1 of 7 days has food entries.'],
  is_empty: false,
};

function jsonRequest(body: unknown): Request {
  return new Request('http://kalori.test/api/ai/nutrition-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupRoute(opts?: {
  summaryContext?: NutritionSummaryContext;
  fingerprint?: string;
  cachePayload?: unknown;
  priorCall?: { inputHash: string; callType: string } | null;
  replayPayload?: unknown;
  aiSummaryOptIn?: boolean;
  contextError?: Error;
  geminiThrows?: boolean;
  latestHistoryPayload?: unknown;
  latestHistoryRequestContext?: {
    scope: 'dashboard-day' | 'progress-range';
    range: { preset: string; start_on: string; end_on: string };
  };
}) {
  class MockNutritionSummaryContextReadError extends Error {}
  const buildNutritionSummaryContext = vi.fn(
    async (input: {
      scope: 'dashboard-day' | 'progress-range';
      day?: string;
      range?: NutritionSummaryContext['range'];
    }) => {
      if (opts?.contextError) throw opts.contextError;
      if (opts?.summaryContext) return opts.summaryContext;
      return {
        ...context,
        scope: input.scope,
        range:
          input.scope === 'dashboard-day'
            ? {
                preset: 'dashboard-day' as const,
                start_on: input.day!,
                end_on: input.day!,
              }
            : input.range!,
      };
    },
  );
  const computeNutritionSummaryFingerprint = vi.fn(() => opts?.fingerprint ?? 'fp-one-food');
  vi.doMock('@/lib/aggregations/summary-context', () => ({
    buildNutritionSummaryContext,
    computeNutritionSummaryFingerprint,
    NutritionSummaryContextReadError: MockNutritionSummaryContextReadError,
  }));

  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: vi.fn(async () => ({
      user: { id: 'u-1' },
      profile: {
        id: 'u-1',
        onboarding_completed_at: '2026-05-01T00:00:00.000Z',
        timezone: 'UTC',
        ai_summary_opt_in: opts?.aiSummaryOptIn ?? true,
        calorie_target: 2000,
        current_weight_kg: 82,
      },
    })),
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: vi.fn(async () => null),
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: vi.fn(async () => ({ from: vi.fn() })),
  }));

  const lookup = vi.fn(async () =>
    opts?.cachePayload ? { hit: true, payload: opts.cachePayload } : { hit: false, payload: null },
  );
  const lookupLatestSuccessful = vi.fn(async (input?: { requestContext?: unknown }) => {
    if (!opts?.latestHistoryPayload) return null;
    if (!opts.latestHistoryRequestContext) return opts.latestHistoryPayload;
    return JSON.stringify(input?.requestContext) ===
      JSON.stringify(opts.latestHistoryRequestContext)
      ? opts.latestHistoryPayload
      : null;
  });
  const write = vi.fn(async () => undefined);
  vi.doMock('@/lib/ai/cache', () => ({
    computeCacheKey: vi.fn(
      ({ callType, userId, normalizedInput }) => `${callType}:${userId}:${normalizedInput}`,
    ),
    lookup,
    lookupLatestSuccessful,
    write,
  }));

  const findPriorCall = vi.fn(async () => opts?.priorCall ?? null);
  const fetchCacheByHash = vi.fn(async () => opts?.replayPayload ?? null);
  const logAICall = vi.fn(async () => undefined);
  vi.doMock('@/lib/ai/cost-log', () => ({
    findPriorCall,
    fetchCacheByHash,
    logAICall,
  }));

  const callGemini = vi.fn(async () => {
    if (opts?.geminiThrows) throw new Error('gemini down');
    return {
      raw: {
        body_markdown:
          'One logged meal is enough to see a pattern: protein started well, water still needs attention.',
        bullets: ['Log the next meal with vegetables.', 'Add water before the next entry.'],
        caveats: ['Only one food day is present.'],
      },
      tokens: 321,
      costEstimate: 0.001,
    };
  });
  vi.doMock('@/lib/ai/client', () => ({ callGemini }));
  vi.doMock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

  return {
    buildNutritionSummaryContext,
    computeNutritionSummaryFingerprint,
    lookup,
    lookupLatestSuccessful,
    write,
    findPriorCall,
    fetchCacheByHash,
    logAICall,
    callGemini,
  };
}

describe('POST /api/ai/nutrition-summary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/aggregations/summary-context');
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/account/deleting-fence');
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/ai/cache');
    vi.doUnmock('@/lib/ai/cost-log');
    vi.doUnmock('@/lib/ai/client');
    vi.doUnmock('@sentry/nextjs');
  });

  it('calls Gemini for sparse-but-nonempty ranges instead of returning "not enough items logged"', async () => {
    const mocks = setupRoute();
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '8cb14eb5-31e2-4dcb-bbf1-05ba0cda5c7a',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { body_markdown: string; source: string };
    expect(mocks.callGemini).toHaveBeenCalledTimes(1);
    expect(body.source).toBe('ai');
    expect(body.body_markdown.toLowerCase()).not.toContain('not enough');
    expect(mocks.logAICall).toHaveBeenCalledTimes(1);
  });

  it('returns deterministic fallback without Gemini for truly empty ranges', async () => {
    const mocks = setupRoute({
      summaryContext: {
        ...context,
        food: { ...context.food, entry_count: 0, logged_days: 0, highlights: [], daily: [] },
        is_empty: true,
      },
      fingerprint: 'fp-empty',
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: 'b7e1dfbb-067d-499c-a2f1-9a36d0c62867',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; data_fingerprint: string };
    expect(body.source).toBe('fallback');
    expect(body.data_fingerprint).toBe('fp-empty');
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).toHaveBeenCalledTimes(1);
  });

  it('keys cache by scope, range, and data fingerprint', async () => {
    const cached = {
      body_markdown: 'Cached summary for this exact fingerprint.',
      bullets: [],
      caveats: [],
      generated_at: '2026-05-18T12:00:00.000Z',
      source: 'cache',
      data_fingerprint: 'fp-cache',
    };
    const mocks = setupRoute({ fingerprint: 'fp-cache', cachePayload: cached });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '47c4aaaf-3910-43dc-8809-1d567b940c5f',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: 'nutrition-summary',
        userId: 'u-1',
        normalizedInput: expect.stringContaining('fp-cache'),
      }),
    );
    expect(mocks.lookup).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedInput: expect.stringContaining('"scope":"progress-range"'),
      }),
    );
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).toHaveBeenCalledTimes(1);
  });

  it('returns the last successful cached summary and still logs exactly once when Gemini fails', async () => {
    const history = {
      body_markdown: 'Previous AI summary from the last successful run.',
      bullets: ['Repeat the protein breakfast that worked.'],
      caveats: [],
      generated_at: '2026-05-17T12:00:00.000Z',
      source: 'ai',
      data_fingerprint: 'fp-history',
    };
    const mocks = setupRoute({ geminiThrows: true, latestHistoryPayload: history });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: 'ce097695-af7c-423c-bc47-bf11436e9c45',
        scope: 'dashboard-day',
        day: '2026-05-18',
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; body_markdown: string; caveats: string[] };
    expect(body.source).toBe('cache');
    expect(body.body_markdown).toBe('Previous AI summary from the last successful run.');
    expect(body.caveats.join(' ')).toContain('Last successful AI summary shown');
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'dashboard-day',
        range: { preset: 'dashboard-day', start_on: '2026-05-18', end_on: '2026-05-18' },
      },
    });
    expect(mocks.callGemini).toHaveBeenCalledTimes(1);
    expect(mocks.logAICall).toHaveBeenCalledTimes(1);
  });

  it('does not return dashboard-day history for a failed progress-range request', async () => {
    const history = {
      body_markdown: 'Dashboard summary should not appear on progress.',
      bullets: [],
      caveats: [],
      generated_at: '2026-05-17T12:00:00.000Z',
      source: 'ai',
      data_fingerprint: 'fp-dashboard-history',
    };
    const mocks = setupRoute({
      geminiThrows: true,
      latestHistoryPayload: history,
      latestHistoryRequestContext: {
        scope: 'dashboard-day',
        range: { preset: 'dashboard-day', start_on: '2026-05-18', end_on: '2026-05-18' },
      },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '1e8bc39e-4b41-4a50-8713-eb029a1f8845',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_summary_unavailable' });
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      },
    });
  });

  it('does not return progress-range history for a failed dashboard-day request', async () => {
    const history = {
      body_markdown: 'Progress summary should not appear on dashboard.',
      bullets: [],
      caveats: [],
      generated_at: '2026-05-17T12:00:00.000Z',
      source: 'ai',
      data_fingerprint: 'fp-progress-history',
    };
    const mocks = setupRoute({
      geminiThrows: true,
      latestHistoryPayload: history,
      latestHistoryRequestContext: {
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '04428f11-fb23-4ce2-8f2f-81d0e7d8cb61',
        scope: 'dashboard-day',
        day: '2026-05-18',
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_summary_unavailable' });
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'dashboard-day',
        range: { preset: 'dashboard-day', start_on: '2026-05-18', end_on: '2026-05-18' },
      },
    });
  });

  it('does not return history for a different selected progress range', async () => {
    const history = {
      body_markdown: 'Last 30 summary should not appear on last 7.',
      bullets: [],
      caveats: [],
      generated_at: '2026-05-17T12:00:00.000Z',
      source: 'ai',
      data_fingerprint: 'fp-last-30-history',
    };
    const mocks = setupRoute({
      geminiThrows: true,
      latestHistoryPayload: history,
      latestHistoryRequestContext: {
        scope: 'progress-range',
        range: { preset: 'last_30', start_on: '2026-04-19', end_on: '2026-05-18' },
      },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '36674a89-cf5b-4751-9173-7ba93b3a5a6f',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_summary_unavailable' });
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      },
    });
  });

  it('returns 503 for nonempty progress ranges when Gemini fails and no history exists', async () => {
    const mocks = setupRoute({ geminiThrows: true });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '1d7f20ed-5bb8-4d70-8f0e-54f658bc2a01',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_summary_unavailable' });
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      },
    });
    expect(mocks.callGemini).toHaveBeenCalledTimes(1);
    expect(mocks.logAICall).toHaveBeenCalledTimes(1);
  });

  it('returns 503 and does not call Gemini or log cost when context reads fail', async () => {
    const mocks = setupRoute({ contextError: new Error('food_entries denied') });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '27d8bb84-83df-4f9f-a8df-064a487e0b7e',
        scope: 'dashboard-day',
        day: '2026-05-18',
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'summary_context_unavailable' });
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).not.toHaveBeenCalled();
  });

  it('rejects requests before context reads when AI summary consent is disabled', async () => {
    const mocks = setupRoute({ aiSummaryOptIn: false });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '1d115d12-7cf3-4214-986c-a2caa36d7f81',
        scope: 'dashboard-day',
        day: '2026-05-18',
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'ai_summary_consent_required' });
    expect(mocks.buildNutritionSummaryContext).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).not.toHaveBeenCalled();
  });

  it('rejects future dashboard days before Gemini', async () => {
    const mocks = setupRoute();
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: 'f4d33453-8849-4ab8-9d94-02238ec62f10',
        scope: 'dashboard-day',
        day: '2099-01-01',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'future_date_not_allowed' });
    expect(mocks.buildNutritionSummaryContext).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('rejects future progress ranges before Gemini', async () => {
    const mocks = setupRoute();
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '904cc64c-15d1-4e48-ac59-b7633b3e1c13',
        scope: 'progress-range',
        range: { preset: 'custom', start_on: '2099-01-01', end_on: '2099-01-02' },
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'future_date_not_allowed' });
    expect(mocks.buildNutritionSummaryContext).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('rejects reused client_id with a changed input hash before Gemini or logging', async () => {
    const mocks = setupRoute({
      priorCall: { callType: 'nutrition-summary', inputHash: 'nutrition-summary:u-1:old' },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '5c4e5af0-d9ce-48fc-bbfc-7d07bfdbe7d0',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'idempotency_conflict' });
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).not.toHaveBeenCalled();
  });

  it('rejects reused client_id from another AI call type before Gemini or logging', async () => {
    const mocks = setupRoute({
      priorCall: { callType: 'vision', inputHash: 'nutrition-summary:u-1:any' },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '715090db-1a04-483e-b23b-af960b86f6a2',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'idempotency_conflict' });
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).not.toHaveBeenCalled();
  });

  it('returns 503 for same-hash client_id replay when replay cache and history are unavailable', async () => {
    const normalized = JSON.stringify({
      scope: 'progress-range',
      range: context.range,
      data_fingerprint: 'fp-one-food',
    });
    const hash = `nutrition-summary:u-1:${normalized}`;
    const mocks = setupRoute({
      priorCall: { callType: 'nutrition-summary', inputHash: hash },
    });
    const { POST } = await import('@/app/api/ai/nutrition-summary/route');

    const res = await POST(
      jsonRequest({
        client_id: '024f23b3-cf7a-4ab1-b180-7a896ce40239',
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_summary_unavailable' });
    expect(mocks.fetchCacheByHash).toHaveBeenCalledWith({ userId: 'u-1', inputHash: hash });
    expect(mocks.lookupLatestSuccessful).toHaveBeenCalledWith({
      callType: 'nutrition-summary',
      userId: 'u-1',
      requestContext: {
        scope: 'progress-range',
        range: { preset: 'last_7', start_on: '2026-05-12', end_on: '2026-05-18' },
      },
    });
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.logAICall).not.toHaveBeenCalled();
  });
});
