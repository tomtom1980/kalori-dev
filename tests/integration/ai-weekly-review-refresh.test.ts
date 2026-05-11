/**
 * @vitest-environment node
 *
 * F12 refresh reinforcement — /api/ai/weekly-review (Task 3.2 RED, R1).
 *
 * Same contract as the other two refresh tests. Because weekly-review's
 * happy path is a sparse-data short-circuit (no Gemini call), the test
 * seeds <3 logged days so the insert assertion passes in GREEN without
 * needing a live Gemini stub — the route still writes exactly one log
 * row (cached=true, tokens=0) even under the sparse path.
 *
 * RED phase: route handler is a 501 stub; the retried call does not return
 * 200 after refresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('F12 — /api/ai/weekly-review refresh reinforcement', () => {
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

  it('forced-401 → refreshSession once → retry lands sparse path → exactly ONE ai_call_log row', async () => {
    // Sparse-data setup: only 2 logged days — short-circuits to static template.
    // 2026-04-13 is a Monday (week_start_on); entries fall within the [start, +7d) range.
    const sparseDays = ['2026-04-14', '2026-04-15'];
    // F-UI-3.6-A-1 (Codex Split A round 1): `weekly_reviews` upsert now goes
    // through the auth client; mock its upsert alongside the food_entries
    // select.
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'weekly_reviews') {
            return {
              upsert: vi.fn(async () => ({ data: null, error: null })),
              insert: vi.fn(async () => ({ data: null, error: null })),
            };
          }
          if (table === 'profiles') {
            // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  lt: async () => ({
                    data: sparseDays.map((d) => ({ logged_at: `${d}T12:00:00.000Z` })),
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
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
        from: (table: string) => {
          if (table === 'ai_response_cache') {
            return {
              select: () => makeMissBuilder(),
              insert: cacheInsert,
              upsert: cacheUpsert,
            };
          }
          if (table === 'weekly_reviews') {
            return {
              upsert: vi.fn(async () => ({ data: null, error: null })),
              insert: vi.fn(async () => ({ data: null, error: null })),
            };
          }
          return {
            select: () => makeMissBuilder(),
            insert,
          };
        },
      }),
    }));
    vi.doMock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }));

    let callCount = 0;
    const { POST } = await import('@/app/api/ai/weekly-review/route');
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        callCount += 1;
        if (callCount === 1) {
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
      const res = await authFetch('http://kalori.test/api/ai/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '076e6bef-0c16-413b-a1d9-33e879b9fa11',
          week_start_on: '2026-04-13',
        }),
      });
      expect(res.status).toBe(200);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(insert).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
