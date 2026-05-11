/**
 * @vitest-environment node
 *
 * Task 3.5 AC F12 reinforcement — `/api/water/log` refresh interceptor contract.
 *
 * Proves that when the browser `authPost`s the water log route and the first
 * attempt returns 401, the interceptor:
 *   1. calls refreshSession() once (shared singleton),
 *   2. retries with IDENTICAL bytes (same client_id → I11 applies),
 *   3. hits the real handler on retry → single row, single revalidateTag.
 *
 * Key invariant (AC line 748): the optimistic UI does NOT rollback-flash
 * between the 401 and the retry. This test asserts the byte-level guarantee
 * that enables that UI property — identical body + same client_id means the
 * server treats the retry as the same logical write.
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

describe('F12 — /api/water/log refresh reinforcement', () => {
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
    const calls = { insertCount: 0, revalidatedTags: [] as string[] };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
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
          throw new Error(`unknown table: ${table}`);
        },
        // bugfix-tomi 2026-05-09-water-custom-button — route now calls
        // RPC `log_water_with_cap` (atomic SUM-cap-INSERT under
        // pg_advisory_xact_lock) instead of direct `from('water_log')`.
        // Mock the RPC to mirror the fresh-insert success path.
        rpc: async (fn: string, _params: Record<string, unknown>) => {
          if (fn !== 'log_water_with_cap') {
            return {
              data: null,
              error: { code: '42883', message: `unknown rpc: ${fn}` },
            };
          }
          calls.insertCount += 1;
          return {
            data: {
              row: {
                id: 'w-row-1',
                user_id: 'u-1',
                client_id: 'c1',
                date: '2026-04-22',
                count: 1,
                unit: 'glass',
              },
              replayed: false,
              total_ml: 250,
            },
            error: null,
          };
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn((tag: string) => {
        calls.revalidatedTags.push(tag);
      }),
    }));

    const { POST } = await import('@/app/api/water/log/route');

    const realFetch = globalThis.fetch;
    let callCount = 0;
    const fetchSpy = vi.fn(async (input: unknown, init: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
        });
      }
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
        client_id: '22222222-2222-4222-8222-222222222222',
        unit: 'glass' as const,
        count: 1,
        logged_on: '2026-04-22',
      };
      const result = await authPost<{ row: { id: string } }>('/api/water/log', body);
      expect(result.row.id).toBe('w-row-1');

      // 2 fetches: 401 + retry. Exactly ONE refresh call.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Server inserted exactly once (I11 under retry: single row).
      expect(calls.insertCount).toBe(1);
      // revalidateTag fired once with the userEntries tag.
      expect(calls.revalidatedTags).toEqual(['user:u-1:entries:2026-04-22']);

      // Byte-identical retry: client_id + full body preserved.
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(typeof body1).toBe('string');
      expect(body2).toBe(body1);
      const parsed1 = JSON.parse(String(body1)) as Record<string, unknown>;
      const parsed2 = JSON.parse(String(body2)) as Record<string, unknown>;
      expect(parsed2).toEqual(parsed1);
      expect(parsed2.client_id).toBe(body.client_id);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
