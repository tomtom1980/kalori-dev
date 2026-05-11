/**
 * @vitest-environment node
 *
 * Task 4.1 — F12 refresh reinforcement for `/api/library/bulk-delete`.
 *
 * Proves the R1 contract: client `authPost`'s bulk-delete, first fetch returns
 * 401, interceptor calls refreshSession() once, retries with identical bytes,
 * retry succeeds. Asserts:
 *   - exactly one refreshSession() call (shared in-flight singleton)
 *   - 2 fetches: original 401 + single retry
 *   - the deleted row set matches the requested IDs exactly once (no partial
 *     deletion — the server-side UPDATE ran once on the retry only)
 *   - retry body bytes === original body bytes (I11 preservation)
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

describe('F12 — /api/library/bulk-delete refresh reinforcement', () => {
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

  it('401 → refresh → retry → exactly-once deletion, identical body bytes', async () => {
    const calls = { updateCount: 0, revalidatedCount: 0 };

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
                update: () => ({
                  in: () => ({
                    eq: () => ({
                      is: () => ({
                        select: async () => {
                          calls.updateCount += 1;
                          return {
                            data: [{ id: 'row-1' }, { id: 'row-2' }],
                            error: null,
                          };
                        },
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(() => {
        calls.revalidatedCount += 1;
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/route');

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
        ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
        delete_client_ids: [
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      };
      const result = await authPost<{ deleted_count: number }>('/api/library/bulk-delete', body);
      expect(result.deleted_count).toBe(2);
      // 2 fetches: 401 + retry.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Exactly ONE refreshSession.
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // Handler ran exactly once — the UPDATE fired once.
      expect(calls.updateCount).toBe(1);
      // revalidateTag fired once.
      expect(calls.revalidatedCount).toBe(1);

      // Identical retry body bytes (I11 idempotency preservation).
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(typeof body1).toBe('string');
      expect(body2).toBe(body1);
      const parsed2 = JSON.parse(String(body2)) as Record<string, unknown>;
      expect(parsed2.ids).toEqual(body.ids);
      expect(parsed2.delete_client_ids).toEqual(body.delete_client_ids);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
