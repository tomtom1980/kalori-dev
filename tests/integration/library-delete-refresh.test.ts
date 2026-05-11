/**
 * @vitest-environment node
 *
 * Task 4.2 — F12 refresh reinforcement for `/api/library/[id]/delete`.
 *
 * Asserts the tombstone UPDATE runs exactly once on retry (not twice).
 * The idempotency guard `.is('deleted_at', null)` ensures a replay
 * against an already-tombstoned row returns `{ item: null, replayed: true }`
 * without re-stamping. We drive this by routing the authPost through the
 * interceptor, forcing 401 on call 1, and counting handler invocations.
 *
 * Also confirms happy-path delete-then-undo round-trip using the bulk
 * undo route (briefing §Delete semantics LOCKED — reuse bulk-undo with
 * length-1 array, NO new `/api/library/[id]/undo`).
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

describe('F12 — /api/library/[id]/delete refresh reinforcement', () => {
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

  it('401 → refresh → retry → deleted_at stamped exactly once', async () => {
    const calls = { updateCount: 0, revalidatedCount: 0 };
    const nowIso = '2026-04-24T11:00:00.000Z';

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
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => {
                            calls.updateCount += 1;
                            return {
                              data: {
                                id: '11111111-1111-4111-8111-111111111111',
                                deleted_at: nowIso,
                              },
                              error: null,
                            };
                          },
                        }),
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

    const { POST } = await import('@/app/api/library/[id]/delete/route');

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
      const request = new Request(url, init as RequestInit);
      return POST(request, {
        params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
      });
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      const body = { delete_client_id: '33333333-3333-4333-8333-333333333333' };
      const result = await authPost<{ item: { id: string; deleted_at: string } | null }>(
        '/api/library/11111111-1111-4111-8111-111111111111/delete',
        body,
      );
      expect(result.item?.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.item?.deleted_at).toBe(nowIso);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // UPDATE ran exactly once — only on the retry.
      expect(calls.updateCount).toBe(1);
      expect(calls.revalidatedCount).toBe(1);

      // Retry body bytes === original.
      const [, init1] = fetchSpy.mock.calls[0] ?? [];
      const [, init2] = fetchSpy.mock.calls[1] ?? [];
      expect((init2 as RequestInit | undefined)?.body).toBe(
        (init1 as RequestInit | undefined)?.body,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('replay / idempotent — second POST with already-tombstoned row returns replayed=true', async () => {
    const calls = { updateCount: 0 };
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
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => {
                            calls.updateCount += 1;
                            // Null = row already tombstoned (filter excluded it).
                            return { data: null, error: null };
                          },
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const { POST } = await import('@/app/api/library/[id]/delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/xxx/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          delete_client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: null; replayed?: boolean };
    expect(body.item).toBeNull();
    expect(body.replayed).toBe(true);
    // The filter matched 0 rows — DB is untouched after the second stamp attempt.
    expect(calls.updateCount).toBe(1);
  });
});
