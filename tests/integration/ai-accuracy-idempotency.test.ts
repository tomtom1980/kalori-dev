/**
 * @vitest-environment node
 *
 * AI accuracy idempotency — same fixture twice, identical body (Task 5.1.7 RED).
 *
 * Per AC4 (briefing §3): the MSW Gemini stub is deterministic, so calling
 * the same route handler twice with the same fixture must yield deep-equal
 * response bodies. This test catches any future move toward
 * Math.random()-flavored fuzzing in the stub (or in the route's
 * post-processing). Uses cache-miss on both calls (re-stubs MSW per call,
 * mocks SSR/admin twice) — the route is forced to re-invoke Gemini and the
 * deterministic stub must produce equal output, mirroring AC4's wording
 * "same fixture twice → identical snapshot — Gemini stub deterministic".
 *
 * Distinct from `ai-response-cache-ttl.test.ts` (cache-TTL contract) and
 * `ai-client-id-idempotency.test.ts` (client_id-replay short-circuit). This
 * test isolates the deterministic-stub claim.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';
import {
  loadAllFixtures,
  loadCriticalFixtures,
  type AccuracyFixture,
} from '../fixtures/ai-accuracy/loader';

const TEST_MICROS = { sodium: 1 };

function mockSupabaseSsr(userId: string) {
  const getUser = vi.fn(async () => ({ data: { user: { id: userId } }, error: null }));
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({ auth: { getUser }, from: makeServerFrom(userId) }),
  }));
}

function mockAdminCacheMiss() {
  const makeMissBuilder = () => {
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
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({
      from: () => ({
        select: () => makeMissBuilder(),
        insert: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
      }),
      storage: {
        from: () => ({ upload: async () => ({ data: { path: '' }, error: null }) }),
      },
    }),
  }));
}

function calibratedGeminiStub(fx: AccuracyFixture) {
  const body = {
    items: fx.expected.items.map((it) => ({
      name: it.name,
      portion: it.portion,
      unit: it.unit,
      kcal: it.kcal,
      macros: it.macros,
      micros: TEST_MICROS,
      confidence: 0.82,
    })),
    reasoning: `Calibrated MSW stub for ${fx.name} — test-only; never shipped.`,
  };
  return [
    http.post('https://generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
    http.post('*://*generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
  ];
}

async function dispatchFixture(fx: AccuracyFixture): Promise<{ status: number; result: unknown }> {
  if (fx.callType === 'text-parse') {
    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          userText: fx.input,
          region: fx.region,
        }),
      }),
    );
    const body = (await res.json()) as { result?: unknown };
    return { status: res.status, result: body.result };
  }
  if (fx.callType === 'vision') {
    const { POST } = await import('@/app/api/ai/vision/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          imageBase64: fx.input,
          mimeType: 'image/png',
        }),
      }),
    );
    const body = (await res.json()) as { result?: unknown };
    return { status: res.status, result: body.result };
  }
  throw new Error(`Unsupported callType ${fx.callType}`);
}

async function callFixtureFresh(fx: AccuracyFixture): Promise<unknown> {
  vi.resetModules();
  mockSupabaseSsr('user-idempotency');
  mockAdminCacheMiss();
  server.use(...calibratedGeminiStub(fx));

  const { status, result } = await dispatchFixture(fx);
  expect(status).toBe(200);

  // Codex Round 2 I3: structural shape guard. Without this, a regression
  // that returned `result === undefined` (or any two equally-empty values)
  // from both calls would pass the deep-equality assertion vacuously. The
  // route contract guarantees `result` is a non-null object with an
  // `items` array. We do NOT require items.length > 0: `edge-empty-plate`
  // legitimately ships zero items to exercise the empty-input path —
  // vacuity is defended by structural shape, not item count.
  expect(result, `fixture ${fx.name} result must be a non-null object`).toEqual(expect.any(Object));
  expect(result).not.toBeNull();
  expect(result, `fixture ${fx.name} must include items array`).toMatchObject({
    items: expect.any(Array),
  });
  const items = (result as { items: unknown[] }).items;
  // Each item (when present) must carry the fields downstream consumers
  // (UI + nutrition aggregator) rely on: name, kcal, and the four macro
  // grams. `edge-empty-plate` skips the loop body harmlessly.
  for (const it of items) {
    expect(it, `fixture ${fx.name} item shape`).toMatchObject({
      name: expect.any(String),
      kcal: expect.any(Number),
      macros: expect.objectContaining({
        protein_g: expect.any(Number),
        carbs_g: expect.any(Number),
        fat_g: expect.any(Number),
      }),
    });
  }

  vi.doUnmock('@/lib/supabase/server');
  vi.doUnmock('@/lib/supabase/admin');
  return result;
}

describe('AI accuracy idempotency — deterministic Gemini stub (Task 5.1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  it('every critical fixture yields deep-equal body across two cache-miss calls', async () => {
    const fixtures = loadCriticalFixtures('all');
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fx of fixtures) {
      const first = await callFixtureFresh(fx);
      const second = await callFixtureFresh(fx);
      expect(second, `fixture ${fx.name} second call body`).toEqual(first);
    }
  });

  it('every fixture in the full matrix yields deep-equal body across two cache-miss calls', async () => {
    const fixtures = loadAllFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(25);

    for (const fx of fixtures) {
      const first = await callFixtureFresh(fx);
      const second = await callFixtureFresh(fx);
      expect(second, `fixture ${fx.name} second call body`).toEqual(first);
    }
  });
});
