/**
 * @vitest-environment node
 *
 * F12 refresh reinforcement — /api/ai/text-parse (Task 3.2 RED, R1).
 *
 * Proves the R1 mitigation contract: when the client uses `authFetch` (from
 * `lib/auth/refresh-interceptor.ts`) against the text-parse route and the
 * first attempt returns 401, the interceptor calls `refreshSession()` once,
 * retries the request with identical bytes, and the SERVER-SIDE route
 * writes exactly ONE `ai_call_log` row per logical call (no double charge).
 *
 * Pipeline:
 *   1. Client-side `authFetch` is the call site.
 *   2. Network stack is patched: first fetch returns 401 (via mocked
 *      `global.fetch`), the interceptor hits `refreshSession` (mocked OK),
 *      and the retried fetch hits the real POST handler.
 *   3. The POST handler, when it finally runs, registers exactly one
 *      ai_call_log insert.
 *
 * RED phase: route handler is a 501 stub, so the retried call never reaches
 * a passing 200 — the test fails on "expected 200, got 501" after the
 * refresh succeeds. GREEN: handler returns 200 and the single-insert
 * assertion passes.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../mocks/server';

const refreshSession = vi.fn(async () => ({ error: null }));
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: { refreshSession, signOut },
  }),
}));

function stubWindow() {
  (globalThis as unknown as { window: { location: { href: string } } }).window = {
    location: { href: '' },
  };
}
function unstubWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('F12 — /api/ai/text-parse refresh reinforcement', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ error: null });
    signOut.mockReset();
    vi.resetModules();
    stubWindow();
  });

  afterEach(() => {
    unstubWindow();
  });

  it('forced-401 → refreshSession once → retry lands → exactly ONE ai_call_log row per logical call', async () => {
    // Mock the user-scoped SSR client so the route's auth guard resolves
    // without Next's request-scope cookies() machinery.
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        // Phase A Codex Round 1 Improvement #5 — orphan-profile fence now
        // reads `profiles` before AI work. Provide a present, non-deleting
        // profile so the fence passes through.
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'u-1',
                      deleting_at: null,
                      onboarding_completed_at: '2026-01-01T00:00:00.000Z',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      }),
    }));

    // `insert` is the ai_call_log spy — the I2 observation point. Cache
    // writes use a separate sink so the exact-1 assertion is clean.
    const insert = vi.fn(async () => ({ data: null, error: null }));
    const cacheInsert = vi.fn(async () => ({ data: null, error: null }));
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
    const makeMissBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({
        from: (table: string) => {
          if (table === 'ai_response_cache') {
            return {
              select: () => makeMissBuilder(),
              insert: cacheInsert,
              upsert: cacheUpsert,
            };
          }
          return {
            select: () => makeMissBuilder(),
            insert,
          };
        },
      }),
    }));

    // Force the route to short-circuit at 401 on the FIRST call, then succeed
    // on the SECOND. We do this by patching global fetch rather than invoking
    // the POST handler directly — the test is specifically about `authFetch`'s
    // 401-retry contract, so the client->server hop MUST go through fetch.
    // MSW stub for Gemini — the retry lands the real handler, which calls
    // the Gemini REST API. Without a stub, the call would hit the network.
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () =>
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
          reasoning: 'refresh retry stub',
        }),
      ),
    );

    let routeCallCount = 0;
    const { POST } = await import('@/app/api/ai/text-parse/route');
    const realFetch = globalThis.fetch;
    // Route-scoped fetch spy: only intercepts hits to the text-parse route
    // (those go through `authFetch` and drive the 401 retry contract). All
    // other fetches — notably the handler's outbound Gemini call — are
    // forwarded to the real fetch so MSW's pass-through stubs resolve
    // them without a real network hit.
    const ROUTE_PATH = '/api/ai/text-parse';
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const isRouteCall = url.includes(ROUTE_PATH);
        if (!isRouteCall) {
          return realFetch(input as RequestInfo, init);
        }
        routeCallCount += 1;
        // First attempt to the route: respond 401 WITHOUT invoking the real
        // handler (simulating an expired access token rejection).
        if (routeCallCount === 1) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Retry: forward to the real POST handler.
        const req = new Request(String(input), init);
        return POST(req);
      },
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { authFetch } = await import('@/lib/auth/refresh-interceptor');
      const res = await authFetch('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '360ed072-3b46-443b-83e6-e58c3125062d',
          userText: 'one bowl of phở bò',
        }),
      });
      expect(res.status).toBe(200);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // Exactly two fetches to the route itself: the 401 short-circuit + the
      // retry that hits the real handler. Outbound Gemini fetches (which
      // also pass through the spy but are forwarded to the real fetch) are
      // ignored — this assertion is about authFetch's retry budget.
      const routeFetches = fetchSpy.mock.calls.filter((c) =>
        String((c as unknown as [unknown])[0]).includes(ROUTE_PATH),
      );
      expect(routeFetches.length).toBe(2);
      // Exactly ONE ai_call_log insert — retries do not double-charge.
      expect(insert).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
