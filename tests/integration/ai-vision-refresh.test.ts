/**
 * @vitest-environment node
 *
 * F12 refresh reinforcement — /api/ai/vision (Task 3.2 RED, R1).
 *
 * Same contract as ai-text-parse-refresh.test.ts but for the vision route.
 * Image base64 is a plain string — safely replayable via `authFetch`'s
 * `RetryableBody` type.
 *
 * RED phase: vision route handler is a 501 stub; the retried call does not
 * return 200, so this test fails after the refresh succeeds.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
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

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('F12 — /api/ai/vision refresh reinforcement', () => {
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

  it('forced-401 → refreshSession once → retry lands → exactly ONE ai_call_log row', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: makeServerFrom('u-1'),
      }),
    }));

    const insert = vi.fn(async () => ({ data: null, error: null }));
    const cacheInsert = vi.fn(async () => ({ data: null, error: null }));
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
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

    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () =>
        HttpResponse.json({
          items: [
            {
              name: 'cơm tấm',
              portion: 1,
              unit: 'plate',
              kcal: 760,
              macros: { protein_g: 36, carbs_g: 85, fat_g: 28, fiber_g: 3 },
              micros: {},
              confidence: 0.8,
            },
          ],
          reasoning: 'vision refresh retry stub',
        }),
      ),
    );

    const ROUTE_PATH = '/api/ai/vision';
    let routeCallCount = 0;
    const { POST } = await import('@/app/api/ai/vision/route');
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (!url.includes(ROUTE_PATH)) {
          return realFetch(input as RequestInfo, init);
        }
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
      const { authFetch } = await import('@/lib/auth/refresh-interceptor');
      const res = await authFetch('http://kalori.test/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'a27a6f61-f263-4fe9-9b2c-e9e72a9479f6',
          imageBase64: TINY_PNG_BASE64,
        }),
      });
      expect(res.status).toBe(200);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      const routeFetches = fetchSpy.mock.calls.filter((c) =>
        String((c as unknown as [unknown])[0]).includes(ROUTE_PATH),
      );
      expect(routeFetches.length).toBe(2);
      expect(insert).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
