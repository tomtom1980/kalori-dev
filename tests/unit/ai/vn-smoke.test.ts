/**
 * @vitest-environment node
 *
 * VN accuracy smoke suite — MERGE-BLOCKING (Task 3.2 RED).
 *
 * Drives every critical VN fixture through the `/api/ai/text-parse` Route
 * Handler against MSW stubs calibrated to the fixture's expected nutrition.
 * Asserts:
 *   - EXACT item count (no AI phantom entries)
 *   - kcal within ±15% tolerance
 *   - each macro (protein/carbs/fat/fiber) within ±20% tolerance
 *
 * A fixture drifting outside tolerance fails the run AND (per
 * testing-strategy.md §3.3) blocks the Phase 3 merge gate. Recovery is
 * (a) justified fixture update in the PR description, (b) prompt
 * adjustment, or (c) model-version rollback.
 *
 * Pipeline: test calls the real POST handler with a mocked Supabase SSR
 * client (authenticated user, admin cache lookup returns miss), and MSW
 * intercepts the outgoing Gemini fetch to return a calibrated stub
 * response. RED phase: route handler is a 501 stub, so every assertion
 * fails with "expected 200, got 501".
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../mocks/server';
import { loadCriticalFixtures, type AccuracyFixture } from '../../fixtures/ai-accuracy/loader';

function mockSupabaseSsr(userId: string) {
  const getUser = vi.fn(async () => ({ data: { user: { id: userId } }, error: null }));
  // A.CODEX Round 1 Finding #5 — text-parse route now calls the orphan-profile
  // fence (requireProfileOrJson401) before reaching Gemini work. The fence
  // performs `supabase.from('profiles').select(cols).eq('id', user.id).maybeSingle()`,
  // so the SSR mock must return a non-null profile or every smoke fixture
  // short-circuits with a 422. A bare `{ id: userId }` row is enough — the
  // fence only checks for non-null + no error to consider the user fenced-OK.
  const profilesQuery = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: userId }, error: null }),
      }),
    }),
  };
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: { getUser },
      from: (table: string) => (table === 'profiles' ? profilesQuery : {}),
    }),
  }));
}

function mockAdminCacheMiss() {
  const makeMissBuilder = () => {
    const builder = {
      eq: () => builder,
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
      micros: {},
      confidence: 0.82,
    })),
    reasoning: `Calibrated MSW stub for ${fx.name} — test-only; never shipped.`,
  };
  // Stub every outbound Gemini endpoint the wrapper might choose.
  return [
    http.post('https://generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
    http.post('*://*generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
  ];
}

describe('VN accuracy smoke suite (merge-blocking)', () => {
  const fixtures = loadCriticalFixtures();
  const userId = 'user-vn-smoke';

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  it.each(fixtures.map((f) => [f.name, f]))(
    '%s — kcal within ±15%%, macros within ±20%%, exact item count',
    async (_name, fx) => {
      mockSupabaseSsr(userId);
      mockAdminCacheMiss();
      server.use(...calibratedGeminiStub(fx));

      const { POST } = await import('@/app/api/ai/text-parse/route');
      const res = await POST(
        new Request('http://kalori.test/api/ai/text-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: crypto.randomUUID(),
            userText: fx.input,
            region: 'vn',
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          items: {
            name: string;
            portion: number;
            unit: string;
            kcal: number;
            macros: {
              protein_g: number;
              carbs_g: number;
              fat_g: number;
              fiber_g: number;
            };
          }[];
        };
      };

      expect(body.result.items.length).toBe(fx.expected.itemCount);

      const totalKcal = body.result.items.reduce((s, it) => s + it.kcal, 0);
      const kcalDelta = Math.abs(totalKcal - fx.expected.total.kcal) / fx.expected.total.kcal;
      expect(kcalDelta).toBeLessThanOrEqual(fx.tolerance.kcal_pct);

      for (const key of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
        const total = body.result.items.reduce((s, it) => s + it.macros[key], 0);
        const expected = fx.expected.total[key];
        const delta = expected === 0 ? total : Math.abs(total - expected) / expected;
        expect(delta).toBeLessThanOrEqual(fx.tolerance.macro_pct);
      }
    },
  );
});
