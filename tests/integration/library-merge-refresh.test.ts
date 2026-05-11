/**
 * @vitest-environment node
 *
 * Task 4.1 — F12 refresh reinforcement for `/api/library/merge`.
 *
 * Proves the R1 contract: client `authPost`'s merge, first fetch returns 401,
 * interceptor calls refreshSession() once, retries with identical bytes,
 * retry succeeds. Asserts:
 *   - exactly one refreshSession() call
 *   - 2 fetches: original 401 + single retry
 *   - the atomic transaction commits exactly once (no partial FK repoint —
 *     the RPC only ran on the retry; first attempt was 401'd before server
 *     code executed)
 *   - retry body bytes === original body bytes (I11 idempotency preserved)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('F12 — /api/library/merge refresh reinforcement', () => {
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

  it('401 → refresh → retry → RPC commits exactly once, identical body bytes', async () => {
    const calls = { rpcCount: 0, revalidatedCount: 0 };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                // Pre-fetch affected days list: empty for simplicity.
                select: () => ({
                  eq: () => ({
                    in: async () => ({ data: [], error: null }),
                  }),
                }),
              },
        rpc: async (name: string) => {
          if (name === 'library_merge_atomic') {
            calls.rpcCount += 1;
            return {
              data: {
                winner: {
                  id: 'winner-1',
                  user_id: 'u-1',
                  display_name: 'Merged',
                  log_count: 5,
                },
                replayed: false,
              },
              error: null,
            };
          }
          throw new Error(`unknown rpc ${name}`);
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(() => {
        calls.revalidatedCount += 1;
      }),
    }));

    const { POST } = await import('@/app/api/library/merge/route');

    const realFetch = globalThis.fetch;
    let callCount = 0;
    const fetchSpy = vi.fn(async (input: unknown, init: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
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
        client_id: '11111111-1111-4111-8111-111111111111',
        winnerId: '22222222-2222-4222-8222-222222222222',
        loserId: '33333333-3333-4333-8333-333333333333',
        fields: {
          display_name: 'Merged',
          nutrition: {
            kcal: 250,
            macros: { protein_g: 25, carbs_g: 15, fat_g: 6 },
          },
        },
      };
      const result = await authPost<{ winner: { id: string } }>('/api/library/merge', body);
      expect(result.winner.id).toBe('winner-1');
      // 2 fetches: original 401 + retry.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Exactly ONE refresh.
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // RPC ran EXACTLY once — the 401'd first attempt never reached the server.
      expect(calls.rpcCount).toBe(1);

      // Identical retry body bytes.
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(typeof body1).toBe('string');
      expect(body2).toBe(body1);
      const parsed = JSON.parse(String(body2)) as Record<string, unknown>;
      expect(parsed.client_id).toBe(body.client_id);
      expect(parsed.winnerId).toBe(body.winnerId);
      expect(parsed.loserId).toBe(body.loserId);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
