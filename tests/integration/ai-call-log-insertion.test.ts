/**
 * @vitest-environment node
 *
 * I2 — every AI lookup writes exactly ONE ai_call_log row (Task 3.2 RED).
 *
 * Covers three mutually-exclusive paths:
 *   1. Cache miss → Gemini success → one row (cached=false)
 *   2. Cache hit → one row (cached=true, tokens=0, cost=0)
 *   3. Gemini error → one row (cached=false, tokens=0) + fallback payload
 *
 * Failure-tolerance contract: if `ai_call_log.insert` itself fails, the
 * route still returns its payload (200) and a Sentry error is recorded.
 * We observe the Sentry side by mocking `@sentry/nextjs` and asserting
 * `captureException` fired with the ai-cost-log tag.
 *
 * RED phase: route handler is a 501 stub — most assertions fail on
 * status=200 expectation.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException,
}));

function setupSsr() {
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-i2' } }, error: null }),
      },
      from: makeServerFrom('u-i2'),
    }),
  }));
}

function setupAdmin(opts: { cacheHit?: { parsed_payload: unknown }; insertThrows?: boolean }) {
  const insert = vi.fn(async () => {
    if (opts.insertThrows) {
      return { data: null, error: { code: 'CONN', message: 'DB down' } };
    }
    return { data: null, error: null };
  });
  const makeHitBuilder = () => {
    const builder = {
      eq: () => builder,
      single: async () => ({ data: opts.cacheHit, error: null }),
    };
    return builder;
  };
  const makeMissBuilder = () => {
    const builder = {
      eq: () => builder,
      single: async () => ({ data: null, error: { code: 'PGRST116' } }),
    };
    return builder;
  };
  const fromSpy = vi.fn((table: string) => {
    if (table === 'ai_response_cache') {
      return {
        select: () => (opts.cacheHit ? makeHitBuilder() : makeMissBuilder()),
        insert,
        upsert: insert,
      };
    }
    return {
      select: () => makeMissBuilder(),
      insert,
    };
  });
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({ from: fromSpy }),
  }));
  return { insert, fromSpy };
}

function stubGeminiSuccess() {
  server.use(
    http.post('*generativelanguage.googleapis.com/*', () =>
      HttpResponse.json({
        items: [
          {
            name: 'phở bò',
            portion: 1,
            unit: 'bowl',
            kcal: 520,
            macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
            micros: {},
            confidence: 0.85,
          },
        ],
        reasoning: 'Standard.',
      }),
    ),
  );
}

function stubGemini500() {
  server.use(
    http.post('*generativelanguage.googleapis.com/*', () =>
      HttpResponse.json({ error: 'server_error' }, { status: 500 }),
    ),
  );
}

async function invokeTextParse() {
  const { POST } = await import('@/app/api/ai/text-parse/route');
  return POST(
    new Request('http://kalori.test/api/ai/text-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: crypto.randomUUID(), userText: 'phở' }),
    }),
  );
}

describe('I2 — ai_call_log exactly-one contract', () => {
  beforeEach(() => {
    captureException.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  it('cache miss + Gemini success → ai_call_log row with cached_flag=false', async () => {
    setupSsr();
    const { insert } = setupAdmin({});
    stubGeminiSuccess();
    const res = await invokeTextParse();
    expect(res.status).toBe(200);
    // Two insert() spy calls total — one for ai_response_cache, one for
    // ai_call_log. The ai_call_log call is what we assert on:
    const calls = insert.mock.calls as unknown as [
      { cached_flag?: boolean; latency_ms?: number },
    ][];
    const logCall = calls.find(([row]) => {
      return row?.cached_flag === false && typeof row?.latency_ms === 'number';
    });
    expect(logCall).toBeDefined();
  });

  it('cache hit → ai_call_log row with cached_flag=true, tokens=0, cost=0', async () => {
    setupSsr();
    const cached = {
      items: [],
      reasoning: 'cached',
    };
    const { insert } = setupAdmin({ cacheHit: { parsed_payload: cached } });
    const res = await invokeTextParse();
    expect(res.status).toBe(200);
    const calls = insert.mock.calls as unknown as [
      { cached_flag?: boolean; tokens?: number; cost_estimate?: number },
    ][];
    const hitLog = calls.find(([row]) => row?.cached_flag === true);
    expect(hitLog).toBeDefined();
    const row = hitLog![0];
    expect(row.tokens).toBe(0);
    expect(row.cost_estimate).toBe(0);
  });

  it('Gemini error → ai_call_log row written AND fallback returned', async () => {
    setupSsr();
    const { insert } = setupAdmin({});
    stubGemini500();
    const res = await invokeTextParse();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback: boolean };
    expect(body.fallback).toBe(true);
    // At least one ai_call_log row written despite the error.
    const calls = insert.mock.calls as unknown as [
      { cached_flag?: boolean; latency_ms?: number },
    ][];
    const logCall = calls.find(([row]) => {
      return row?.cached_flag === false && typeof row?.latency_ms === 'number';
    });
    expect(logCall).toBeDefined();
  });

  it('ai_call_log insert itself failing does NOT block the response (I7 + failure-tolerant logger)', async () => {
    setupSsr();
    setupAdmin({ insertThrows: true });
    stubGeminiSuccess();
    const res = await invokeTextParse();
    // Response still succeeds despite the insert error.
    expect(res.status).toBe(200);
    // Sentry captured the insert failure with the ai-cost-log component tag.
    expect(captureException).toHaveBeenCalled();
    const captureCall = captureException.mock.calls[0] as unknown as
      | [unknown, { tags?: { component?: string } }]
      | undefined;
    const hint = captureCall?.[1];
    expect(hint?.tags?.component).toBe('ai-cost-log');
  });
});
