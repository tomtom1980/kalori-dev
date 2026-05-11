/**
 * @vitest-environment node
 *
 * Task 3.4 — F12 refresh reinforcement for `/api/entries/save`.
 *
 * Proves the R1 mitigation contract: when the client `authFetch`'s the save
 * route and the first attempt returns 401, the interceptor:
 *   1. calls refreshSession() once,
 *   2. retries with IDENTICAL bytes (same client_id → I11 applies),
 *   3. hits the real handler on retry → single row, single revalidateTag.
 *
 * Asserted via spies on `global.fetch` (network), `refreshSession` (auth),
 * and the mocked Supabase insert — exactly one insert call.
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

describe('F12 — /api/entries/save refresh reinforcement', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ error: null });
    signOut.mockReset();
    vi.resetModules();
    stubWindow();
  });
  afterEach(() => {
    unstubWindow();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('401 → refresh → retry preserves client_id → 1 row, 1 revalidateTag', async () => {
    // Track how many times the real handler ran; how many inserts fired.
    const calls = { insertCount: 0, revalidatedCount: 0 };

    // Mock the SSR Supabase client used by the route handler.
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { timezone: 'Asia/Ho_Chi_Minh' },
                    error: null,
                  }),
                  maybeSingle: async () => ({
                    data: { deleting_at: null },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => {
                    calls.insertCount += 1;
                    return {
                      data: {
                        id: 'row-1',
                        user_id: 'u-1',
                        client_id: 'c1',
                      },
                      error: null,
                    };
                  },
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
      }),
    }));

    // Spy revalidateTag.
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(() => {
        calls.revalidatedCount += 1;
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');

    // Patch global.fetch so the first call returns 401 (without hitting
    // the handler), then subsequent calls invoke the real POST handler.
    const realFetch = globalThis.fetch;
    let callCount = 0;
    const fetchSpy = vi.fn(async (input: unknown, init: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      // The interceptor-retry replays the same relative URL. Upgrade to
      // an absolute URL for the real Request constructor (happy-dom runtime
      // accepts relative URLs; Node's fetch/Request does not).
      const url =
        typeof input === 'string' && input.startsWith('/')
          ? `http://kalori.test${input}`
          : (input as string);
      return POST(new Request(url, init as RequestInit));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      const body = {
        client_id: '11111111-1111-4111-8111-111111111111',
        logged_at: '2026-04-21T10:00:00.000Z',
        meal_category: 'breakfast',
        source: 'text',
        items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
      };
      const result = await authPost<{ entry: { id: string } }>('/api/entries/save', body);
      expect(result.entry.id).toBe('row-1');
      // 2 fetches: original 401 + retry.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Exactly ONE refreshSession call (shared refresh singleton).
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // Handler ran once and inserted once.
      expect(calls.insertCount).toBe(1);
      // Task 4.5 R1 Pass 2 C2: revalidateTag fires 7× on fresh insert —
      //   1× TAGS.userEntries(uid, day) (dashboard cache)
      //   6× TAGS.userProgress(uid, range) for the canonical range set
      //      `['24h','D','7d','30d','90d','1y']` via the shared
      //      `revalidateAllProgressRanges` helper. Previously only 3 of 6
      //      were emitted, leaving D/90d/1y stale until next mutation.
      expect(calls.revalidatedCount).toBe(7);

      // I8 — strengthen: the interceptor's retry MUST replay the IDENTICAL
      // request body bytes so `client_id`-anchored idempotency (I11) holds.
      // A regression that mutated the body on retry (e.g., reserialized
      // with different key ordering, stripped a field, or refreshed
      // `logged_at`) would silently break idempotency under load.
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(typeof body1).toBe('string');
      expect(typeof body2).toBe('string');
      // Raw-bytes equality — the retry sends byte-identical payload.
      expect(body2).toBe(body1);
      // Deep-JSON equality (belt-and-braces; includes client_id check).
      const parsed1 = JSON.parse(String(body1)) as Record<string, unknown>;
      const parsed2 = JSON.parse(String(body2)) as Record<string, unknown>;
      expect(parsed2).toEqual(parsed1);
      expect(parsed2.client_id).toBe(body.client_id);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
