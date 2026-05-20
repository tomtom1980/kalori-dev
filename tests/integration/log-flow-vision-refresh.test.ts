/**
 * @vitest-environment node
 *
 * Task 3.3 R1 — log flow vision dispatch forced-401 refresh reinforcement.
 * Mirrors the text-parse refresh test at the /api/ai/vision seam.
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

describe('R1 — log-flow vision refresh reinforcement', () => {
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

  it('forced-401 → refreshSession once → retry lands', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-vision' } }, error: null }) },
        from: makeServerFrom('u-vision'),
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
              name: 'pho',
              portion: 1,
              unit: 'bowl',
              kcal: 520,
              macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
              micros: {},
              confidence: 0.85,
            },
          ],
          reasoning: 'vision refresh test',
        }),
      ),
    );

    let routeCallCount = 0;
    const { POST } = await import('@/app/api/ai/vision/route');
    const realFetch = globalThis.fetch;
    const ROUTE_PATH = '/api/ai/vision';
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
      const res = await authPost<{ result?: { items: unknown[] }; fallback?: true }>(
        'http://kalori.test/api/ai/vision',
        {
          client_id: '22222222-2222-4222-8222-222222222222',
          imageBase64: 'AAAA' + 'B'.repeat(200),
          mimeType: 'image/jpeg',
        },
      );
      expect(refreshSession).toHaveBeenCalledTimes(1);
      const routeFetches = fetchSpy.mock.calls.filter((c) =>
        String((c as unknown as [unknown])[0]).includes(ROUTE_PATH),
      );
      expect(routeFetches.length).toBe(2);
      if (res.result) {
        expect(Array.isArray(res.result.items)).toBe(true);
      }
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
