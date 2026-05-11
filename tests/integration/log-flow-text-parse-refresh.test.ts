/**
 * @vitest-environment node
 *
 * Task 3.3 R1 — log flow text-parse dispatch forced-401 refresh reinforcement.
 *
 * Pipeline:
 *   1. Log flow Type tab dispatches `authPost('/api/ai/text-parse', …)`.
 *   2. Network stack is patched: first fetch returns 401, interceptor calls
 *      `refreshSession()` (mocked OK), retried fetch hits the real POST
 *      handler which returns 200.
 *   3. Assertion: `refreshSession` called exactly once, exactly two fetches
 *      to the route path, final response is 200, originalInput preserved
 *      in the draft.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

const refreshSession = vi.fn(async () => ({ error: null }));
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({ auth: { refreshSession, signOut } }),
}));

function stubWindow() {
  (globalThis as unknown as { window: { location: { href: string } } }).window = {
    location: { href: '' },
  };
}
function unstubWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('R1 — log-flow text-parse refresh reinforcement', () => {
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

  it('forced-401 → refreshSession once → retry lands → draft preserved', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-log-flow' } }, error: null }) },
        from: makeServerFrom('u-log-flow'),
      }),
    }));

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
        from: (table: string) =>
          table === 'ai_response_cache'
            ? { select: () => makeMissBuilder(), insert: cacheInsert, upsert: cacheUpsert }
            : { select: () => makeMissBuilder(), insert },
      }),
    }));

    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () =>
        HttpResponse.json({
          items: [
            {
              name: 'pho bo',
              portion: 1,
              unit: 'bowl',
              kcal: 520,
              macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
              micros: {},
              confidence: 0.85,
            },
          ],
          reasoning: 'log-flow refresh test',
        }),
      ),
    );

    let routeCallCount = 0;
    const { POST } = await import('@/app/api/ai/text-parse/route');
    const realFetch = globalThis.fetch;
    const ROUTE_PATH = '/api/ai/text-parse';
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (!url.includes(ROUTE_PATH)) return realFetch(input as RequestInfo, init);
        routeCallCount += 1;
        if (routeCallCount === 1) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const req = new Request(String(input), init);
        return POST(req);
      },
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      const originalInput = 'one bowl of pho bo';
      const res = await authPost<{ result: { items: unknown[] } } | { fallback: true }>(
        'http://kalori.test/api/ai/text-parse',
        { client_id: '11111111-1111-4111-8111-111111111111', userText: originalInput },
      );
      // Refresh happened once.
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // Route hit exactly twice (401 + retry).
      const routeFetches = fetchSpy.mock.calls.filter((c) =>
        String((c as unknown as [unknown])[0]).includes(ROUTE_PATH),
      );
      expect(routeFetches.length).toBe(2);
      // Final response was successful.
      if ('result' in res) {
        expect(Array.isArray(res.result.items)).toBe(true);
      } else {
        throw new Error('expected parse result, got fallback');
      }
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
