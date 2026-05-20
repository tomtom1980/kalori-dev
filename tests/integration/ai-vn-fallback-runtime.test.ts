/**
 * @vitest-environment node
 *
 * F-UI-3.6-A-4 vn-smoke runtime fallback chain (Task 4.7.6 RED).
 *
 * Asserts the I7 chain: primary `gemini-flash-latest` call → if it throws,
 * a secondary `gemini-2.5-flash-lite` call with a VN-tuned prompt fires →
 * if BOTH throw, the existing `{fallback: true, originalInput}` envelope
 * is returned (status 200, one ai_call_log row, Sentry exception captured).
 *
 * RED phase: `callGeminiWithFallback` doesn't exist yet, the routes still
 * call `callGemini` directly. Tests that depend on a secondary call
 * firing (Test 1, Test 5) fail with "expected 1 secondary call, got 0";
 * tests that depend on primary-only behavior staying intact (Test 2)
 * pass coincidentally.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

const CID = '11111111-2222-4333-8444-555555555555';
const TEXT_INPUT = 'one bowl of phở bò';

interface AdminCallLogRow {
  user_id: string;
  client_id: string;
  input_hash: string;
  call_type: string;
}

function setupSsr() {
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
      },
      from: makeServerFrom('u-1'),
    }),
  }));
}

/**
 * Admin mock that simulates an empty ai_call_log + ai_response_cache so the
 * route always falls through to the Gemini call. Returns the captured
 * insert spy so tests can count log writes.
 */
function setupAdmin() {
  const logRows: AdminCallLogRow[] = [];
  const cacheRows: { user_id: string; input_hash: string; parsed_payload: unknown }[] = [];

  const logInsert = vi.fn(async (row: AdminCallLogRow) => {
    logRows.push(row);
    return { data: null, error: null };
  });

  const logSelectByCid = () => {
    const builder = {
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      lt: async () => ({ count: 0, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: { code: 'PGRST116' } }),
    };
    return builder;
  };

  const cacheUpsert = vi.fn(
    async (row: { user_id: string; input_hash: string; parsed_payload: unknown }) => {
      cacheRows.push(row);
      return { data: null, error: null };
    },
  );

  const cacheSelectByHash = () => {
    const builder = {
      eq: () => builder,
      single: async () => ({ data: null, error: { code: 'PGRST116' } }),
    };
    return builder;
  };

  const from = vi.fn((table: string) => {
    if (table === 'ai_call_log') {
      return { select: logSelectByCid, insert: logInsert };
    }
    if (table === 'ai_response_cache') {
      return {
        select: () => cacheSelectByHash(),
        insert: cacheUpsert,
        upsert: cacheUpsert,
      };
    }
    return { select: () => cacheSelectByHash(), insert: logInsert };
  });

  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({ from }),
  }));
  return { logRows, cacheRows, logInsert };
}

function setupCacheTagMock() {
  vi.doMock('next/cache', () => ({
    updateTag: vi.fn(),
    revalidateTag: vi.fn(),
  }));
}

function setupSentryMock() {
  const addBreadcrumb = vi.fn();
  const captureException = vi.fn();
  vi.doMock('@sentry/nextjs', () => ({
    addBreadcrumb,
    captureException,
  }));
  return { addBreadcrumb, captureException };
}

function validParsePayload(reasoning: string) {
  return {
    items: [
      {
        name: 'phở bò',
        portion: 1,
        unit: 'bowl',
        kcal: 520,
        macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
        micros: { sodium: 900 },
        confidence: 0.85,
      },
    ],
    reasoning,
  };
}

/**
 * Stub a per-model Gemini handler. Returns counters so tests can assert
 * each model's call count independently. The wrapper's contract is to
 * call the secondary at a different `:generateContent` URL when the
 * primary throws.
 */
function stubGeminiPerModel(opts: {
  primaryStatus: 'ok' | 500 | 'hang';
  secondaryStatus: 'ok' | 500 | 'absent';
  primaryModel?: string;
  primaryBody?: unknown;
  secondaryBody?: unknown;
}) {
  const counts = { primary: 0, secondary: 0 };
  const primaryModel = opts.primaryModel ?? 'gemini-flash-latest';
  const handlers = [
    http.post(`*generativelanguage.googleapis.com/*models/${primaryModel}:*`, async () => {
      counts.primary += 1;
      if (opts.primaryStatus === 500) {
        return HttpResponse.json({ error: 'server_error' }, { status: 500 });
      }
      if (opts.primaryStatus === 'hang') {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        return HttpResponse.json({ items: [], reasoning: '' });
      }
      return HttpResponse.json(opts.primaryBody ?? validParsePayload('primary ok'));
    }),
    http.post('*generativelanguage.googleapis.com/*models/gemini-2.5-flash-lite*', async () => {
      counts.secondary += 1;
      if (opts.secondaryStatus === 500) {
        return HttpResponse.json({ error: 'server_error' }, { status: 500 });
      }
      if (opts.secondaryStatus === 'absent') {
        // Should NOT be invoked under the test's scenario.
        return HttpResponse.json({ error: 'unexpected_call' }, { status: 500 });
      }
      return HttpResponse.json(opts.secondaryBody ?? validParsePayload('secondary ok'));
    }),
  ];
  server.use(...handlers);
  return counts;
}

describe('F-UI-3.6-A-4 — vn-smoke runtime fallback chain', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('next/cache');
    vi.doUnmock('@sentry/nextjs');
  });

  it('Test 1 — primary 500 → secondary fires → secondary result returned, ONE ai_call_log row', async () => {
    setupSsr();
    const { logRows } = setupAdmin();
    setupCacheTagMock();
    const { addBreadcrumb } = setupSentryMock();
    const counts = stubGeminiPerModel({
      primaryStatus: 500,
      secondaryStatus: 'ok',
      secondaryBody: validParsePayload('vn-fallback'),
    });

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, userText: TEXT_INPUT, region: 'vn' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { items: { kcal: number }[] }; fallback?: true };
    // Secondary succeeded — we get a real {result: ...}, NOT the I7 envelope.
    expect(body.fallback).toBeUndefined();
    expect(body.result?.items[0]?.kcal).toBe(520);

    // Both calls fired: primary first, secondary as fallback.
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(1);

    // Idempotency / I2: ONE ai_call_log row per logical request.
    expect(logRows.length).toBe(1);
    expect(logRows[0]?.client_id).toBe(CID);

    // Observability: a breadcrumb is fired when fallback succeeds.
    expect(addBreadcrumb).toHaveBeenCalled();
    const breadcrumbCalls = addBreadcrumb.mock.calls;
    const matched = breadcrumbCalls.some(([arg]) => {
      const a = arg as { category?: string; message?: string } | undefined;
      return a?.category === 'ai.fallback' && /vn-smoke/.test(a?.message ?? '');
    });
    expect(matched).toBe(true);
  });

  it('Test 2 — primary OK → secondary NOT called, no breadcrumb, ONE log row', async () => {
    setupSsr();
    const { logRows } = setupAdmin();
    setupCacheTagMock();
    const { addBreadcrumb } = setupSentryMock();
    const counts = stubGeminiPerModel({
      primaryStatus: 'ok',
      secondaryStatus: 'absent',
    });

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, userText: TEXT_INPUT }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { items: unknown[] } };
    expect(body.result).toBeDefined();
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(0);
    expect(logRows.length).toBe(1);

    const matched = addBreadcrumb.mock.calls.some(([arg]) => {
      const a = arg as { category?: string } | undefined;
      return a?.category === 'ai.fallback';
    });
    expect(matched).toBe(false);
  });

  it('Test 3 — primary 500 + secondary 500 → I7 envelope, Sentry exception, ONE log row', async () => {
    setupSsr();
    const { logRows } = setupAdmin();
    setupCacheTagMock();
    const { captureException } = setupSentryMock();
    const counts = stubGeminiPerModel({
      primaryStatus: 500,
      secondaryStatus: 500,
    });

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, userText: TEXT_INPUT }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback?: boolean; originalInput?: string };
    expect(body.fallback).toBe(true);
    expect(body.originalInput).toBe(TEXT_INPUT);
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(1);
    expect(logRows.length).toBe(1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('Test 4 — idempotency over the fallback path: first call falls back, replay short-circuits without firing primary OR secondary (I11 + I2 fix)', async () => {
    setupSsr();
    setupCacheTagMock();
    setupSentryMock();
    // Codex R1 I2 fix — reconfigure to exercise the fallback path on the
    // first call (primary 500 → secondary OK) so the replay assertion
    // covers the fallback-specific I11 invariant: a successful FALLBACK
    // call still produces ONE ai_call_log row that short-circuits the
    // replay without firing any Gemini calls.
    const counts = stubGeminiPerModel({
      primaryStatus: 500,
      secondaryStatus: 'ok',
      secondaryBody: validParsePayload('vn-fallback'),
    });

    // Custom admin mock: first call inserts a log row + cache row. Second
    // call sees the prior log row via findPriorCall and short-circuits.
    const logRows: AdminCallLogRow[] = [];
    const cacheRows: { user_id: string; input_hash: string; parsed_payload: unknown }[] = [];

    const logInsert = vi.fn(async (row: AdminCallLogRow) => {
      const dup = logRows.find((r) => r.user_id === row.user_id && r.client_id === row.client_id);
      if (dup) return { data: null, error: { code: '23505', message: 'dup' } };
      logRows.push(row);
      return { data: null, error: null };
    });

    const logSelectByCid = vi.fn(() => {
      const builder = {
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lt: async () => ({ count: 0, error: null }),
        maybeSingle: async () => {
          const row = logRows[0];
          return { data: row ?? null, error: null };
        },
        single: async () => {
          const row = logRows[0];
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        },
      };
      return builder;
    });

    const cacheUpsert = vi.fn(
      async (row: { user_id: string; input_hash: string; parsed_payload: unknown }) => {
        cacheRows.push(row);
        return { data: null, error: null };
      },
    );

    const cacheSelectByHash = () => {
      const builder = {
        eq: () => builder,
        single: async () => {
          const row = cacheRows[0];
          if (row) {
            return {
              data: {
                ...row,
                expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
              },
              error: null,
            };
          }
          return { data: null, error: { code: 'PGRST116' } };
        },
      };
      return builder;
    };

    const from = vi.fn((table: string) => {
      if (table === 'ai_call_log') {
        return { select: logSelectByCid, insert: logInsert };
      }
      if (table === 'ai_response_cache') {
        return {
          select: () => cacheSelectByHash(),
          insert: cacheUpsert,
          upsert: cacheUpsert,
        };
      }
      return { select: () => cacheSelectByHash(), insert: logInsert };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from }),
    }));

    const { POST } = await import('@/app/api/ai/text-parse/route');

    // First call — primary 500 → secondary OK. Both Gemini paths fire,
    // ONE ai_call_log row is written, parsed payload cached.
    const res1 = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, userText: TEXT_INPUT }),
      }),
    );
    expect(res1.status).toBe(200);
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(1);
    expect(logRows.length).toBe(1);

    // Second call — same CID. Replay must short-circuit: NO additional
    // Gemini calls of either model, even though the FIRST call took the
    // fallback path.
    const res2 = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, userText: TEXT_INPUT }),
      }),
    );
    expect(res2.status).toBe(200);
    // No new Gemini calls fired (counts unchanged). I11 preserved over fallback.
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(1);
    // Same client_id row count.
    const uniqueCids = new Set(logRows.map((r) => r.client_id));
    expect(uniqueCids.size).toBe(1);
  });

  it('Test 5 — vision route mirrors the fallback chain', async () => {
    setupSsr();
    const { logRows } = setupAdmin();
    setupCacheTagMock();
    const { addBreadcrumb } = setupSentryMock();
    const counts = stubGeminiPerModel({
      primaryModel: 'gemini-2.5-flash',
      primaryStatus: 500,
      secondaryStatus: 'ok',
      secondaryBody: validParsePayload('vision vn-fallback'),
    });

    const { POST } = await import('@/app/api/ai/vision/route');
    const tinyB64 = 'aGVsbG93b3JsZA=='; // 'helloworld' base64
    const res = await POST(
      new Request('http://kalori.test/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CID,
          imageBase64: tinyB64,
          region: 'vn',
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { items: unknown[] }; fallback?: true };
    expect(body.fallback).toBeUndefined();
    expect(body.result).toBeDefined();
    expect(counts.primary).toBe(1);
    expect(counts.secondary).toBe(1);
    expect(logRows.length).toBe(1);

    const matched = addBreadcrumb.mock.calls.some(([arg]) => {
      const a = arg as { category?: string } | undefined;
      return a?.category === 'ai.fallback';
    });
    expect(matched).toBe(true);
  });

  it('Test 6 — time-budget: when primary timeout consumes most of the budget, secondary is skipped (1s floor)', async () => {
    setupSsr();
    const { logRows } = setupAdmin();
    setupCacheTagMock();
    const { captureException } = setupSentryMock();
    // Wrapper directly: import and call so we can pass an explicit deadline
    // and verify it skips the secondary when the remaining budget < 1s.
    const { callGeminiWithFallback } = await import('@/lib/ai/fallback');
    const { v1_foodParse, v1_foodParseVnFallback } = await import('@/lib/ai/prompts');

    // Primary 500 — wrapper would normally invoke the secondary, but the
    // deadline is already in the past so the floor check trips and the
    // primary error rethrows.
    const counts = stubGeminiPerModel({
      primaryStatus: 500,
      secondaryStatus: 'absent',
    });

    const primary = v1_foodParse({ userText: TEXT_INPUT, region: 'vn' });
    const fallback = v1_foodParseVnFallback({ userText: TEXT_INPUT, region: 'vn' });

    const deadlineMs = Date.now() - 100; // already past
    let threw: Error | null = null;
    try {
      await callGeminiWithFallback({
        prompt: primary,
        primaryModel: 'gemini-flash-latest',
        fallbackModel: 'gemini-2.5-flash-lite',
        fallbackPrompt: fallback,
        deadlineMs,
      });
    } catch (err) {
      threw = err as Error;
    }
    expect(threw).not.toBeNull();
    expect(counts.primary).toBe(1);
    // Secondary skipped — deadline already past, floor of 1s not satisfied.
    expect(counts.secondary).toBe(0);
    // The wrapper itself doesn't write log rows or capture exceptions —
    // that's the route's job. Just verify it didn't accidentally do so.
    expect(logRows.length).toBe(0);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('Test 7 — Codex R1 C1: primary first-byte timeout fires its abort signal; secondary gets a FRESH budget and succeeds', async () => {
    // Codex R1 C1 — AbortSignal isolation. Pre-fix: secondary reused the
    // primary's signal. When primary's first-byte timer fires, the shared
    // signal is aborted, so the secondary aborts immediately despite ~22s
    // budget remaining. This test pins the fix: when primary's first-byte
    // signal aborts (NOT the caller's external abort), the secondary call
    // STILL fires successfully under a fresh signal.
    setupSsr();
    setupCacheTagMock();
    setupSentryMock();

    const { callGeminiWithFallback } = await import('@/lib/ai/fallback');
    const { v1_foodParse, v1_foodParseVnFallback } = await import('@/lib/ai/prompts');

    let primaryAttempted = 0;
    let secondaryAttempted = 0;
    server.use(
      http.post(
        '*generativelanguage.googleapis.com/*models/gemini-flash-latest*',
        async ({ request }) => {
          primaryAttempted += 1;
          // Listen for abort. When the primary's signal aborts (its
          // dedicated first-byte timer fires), throw — exactly like a
          // real fetch would when its signal aborts mid-flight.
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => reject(new Error('aborted'));
            if (request.signal.aborted) onAbort();
            else request.signal.addEventListener('abort', onAbort, { once: true });
            setTimeout(resolve, 5_000); // never resolves before abort
          });
          return HttpResponse.json(validParsePayload('primary unreachable'));
        },
      ),
      http.post('*generativelanguage.googleapis.com/*models/gemini-2.5-flash-lite*', async () => {
        secondaryAttempted += 1;
        return HttpResponse.json(validParsePayload('secondary fresh budget'));
      }),
    );

    // Caller's abort signal — should remain INACTIVE throughout the test.
    const callerController = new AbortController();
    // Primary's dedicated first-byte signal — fires after 50ms, separate
    // from the caller signal.
    const primaryController = new AbortController();
    const fired = setTimeout(() => primaryController.abort(new Error('first-byte timeout')), 50);

    const primary = v1_foodParse({ userText: TEXT_INPUT });
    const fallback = v1_foodParseVnFallback({ userText: TEXT_INPUT });

    const result = await callGeminiWithFallback({
      prompt: primary,
      primaryModel: 'gemini-flash-latest',
      fallbackModel: 'gemini-2.5-flash-lite',
      fallbackPrompt: fallback,
      // Caller signal — propagates user cancel ONLY.
      abortSignal: callerController.signal,
      // Primary's first-byte signal — fires before primary returns,
      // independent of caller. Pre-C1-fix this was the same as the
      // secondary's signal too, so the secondary aborted instantly.
      // Post-fix: the wrapper should isolate the secondary from this signal.
      primaryAbortSignal: primaryController.signal,
      deadlineMs: Date.now() + 30_000,
    });

    clearTimeout(fired);
    expect(result.usedFallback).toBe(true);
    expect(primaryAttempted).toBe(1);
    expect(secondaryAttempted).toBe(1);
  });

  it('Test 7b — Codex R1 C1: caller external abort still aborts the secondary call too', async () => {
    // Companion to Test 7 — the caller's abortSignal must STILL propagate
    // to the secondary so user-initiated cancellation works.
    setupSsr();
    setupCacheTagMock();
    setupSentryMock();

    const { callGeminiWithFallback } = await import('@/lib/ai/fallback');
    const { v1_foodParse, v1_foodParseVnFallback } = await import('@/lib/ai/prompts');

    let secondaryAborted = false;
    server.use(
      http.post('*generativelanguage.googleapis.com/*models/gemini-flash-latest*', async () => {
        // Primary fails immediately so secondary fires.
        return HttpResponse.json({ error: 'fail' }, { status: 500 });
      }),
      http.post(
        '*generativelanguage.googleapis.com/*models/gemini-2.5-flash-lite*',
        async ({ request }) => {
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
              secondaryAborted = true;
              reject(new Error('aborted'));
            };
            if (request.signal.aborted) onAbort();
            else request.signal.addEventListener('abort', onAbort, { once: true });
            setTimeout(resolve, 5_000);
          });
          return HttpResponse.json(validParsePayload('secondary not reached'));
        },
      ),
    );

    const callerController = new AbortController();
    // Abort the caller signal once secondary is in flight.
    setTimeout(() => callerController.abort(new Error('user cancelled')), 80);

    const primary = v1_foodParse({ userText: TEXT_INPUT });
    const fallback = v1_foodParseVnFallback({ userText: TEXT_INPUT });

    let threw: Error | null = null;
    try {
      await callGeminiWithFallback({
        prompt: primary,
        primaryModel: 'gemini-flash-latest',
        fallbackModel: 'gemini-2.5-flash-lite',
        fallbackPrompt: fallback,
        abortSignal: callerController.signal,
        deadlineMs: Date.now() + 30_000,
      });
    } catch (err) {
      threw = err as Error;
    }

    expect(threw).not.toBeNull();
    expect(secondaryAborted).toBe(true);
  });

  it('Test 8 — Codex R1 I1: tokens SUM primary + secondary when primary reached Gemini before throwing', async () => {
    // Codex R1 I1 — token accounting. The wrapper's `tokens` field must
    // reflect the SUM of primary + secondary token consumption so the
    // route's `ai_call_log` row captures actual Gemini cost.
    //
    // When primary throws BEFORE reaching Gemini (network error, abort),
    // primaryTokens = 0. When primary throws AFTER reaching Gemini (e.g.
    // a non-2xx response that nevertheless reported usage in the body),
    // those tokens are tracked via `error.tokens` and summed.
    //
    // We mock `callGemini` directly so we can control the error shape
    // precisely: primary throws an Error decorated with `tokens: 100`,
    // secondary resolves with `tokens: 50`. Expected sum = 150.
    setupSsr();
    setupCacheTagMock();
    setupSentryMock();

    let primaryCalls = 0;
    let secondaryCalls = 0;
    vi.doMock('@/lib/ai/client', () => ({
      callGemini: vi.fn(async (input: { model?: string }) => {
        if (input.model === 'gemini-flash-latest') {
          primaryCalls += 1;
          // Simulate "primary reached Gemini, got HTTP 5xx WITH usage in body".
          const err = new Error('Gemini call failed: HTTP 503') as Error & {
            tokens?: number;
          };
          err.tokens = 100;
          throw err;
        }
        if (input.model === 'gemini-2.5-flash-lite') {
          secondaryCalls += 1;
          return {
            raw: validParsePayload('summed'),
            tokens: 50,
            costEstimate: 50 * 0.000375 * 0.001,
          };
        }
        throw new Error(`unexpected model: ${input.model}`);
      }),
    }));

    const { callGeminiWithFallback } = await import('@/lib/ai/fallback');
    const { v1_foodParse, v1_foodParseVnFallback } = await import('@/lib/ai/prompts');

    const primary = v1_foodParse({ userText: TEXT_INPUT });
    const fallback = v1_foodParseVnFallback({ userText: TEXT_INPUT });

    const result = await callGeminiWithFallback({
      prompt: primary,
      primaryModel: 'gemini-flash-latest',
      fallbackModel: 'gemini-2.5-flash-lite',
      fallbackPrompt: fallback,
      deadlineMs: Date.now() + 30_000,
    });

    expect(result.usedFallback).toBe(true);
    expect(primaryCalls).toBe(1);
    expect(secondaryCalls).toBe(1);
    // Sum semantics: primary contributed 100 (HTTP 5xx body had usage),
    // secondary contributed 50 → 150 total billed against the user.
    expect(result.tokens).toBe(150);

    vi.doUnmock('@/lib/ai/client');
  });
});
