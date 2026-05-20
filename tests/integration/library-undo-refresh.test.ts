/**
 * @vitest-environment node
 *
 * Task 4.2 — F12 refresh reinforcement for single-item undo via the
 * existing `/api/library/bulk-delete/undo` route with a length-1
 * `client_ids` array. Briefing §Delete-LOCKED mandates reuse of the
 * bulk-undo route — no new `/api/library/[id]/undo`.
 *
 * Asserts that the undo route matches the bulk-undo F12 semantics when
 * called with a length-1 payload:
 *   - exactly one refreshSession
 *   - 2 fetches (original 401 + single retry)
 *   - undo UPDATE runs exactly once (not twice)
 *   - retry bytes are identical
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

describe('F12 — single-item undo via /api/library/bulk-delete/undo', () => {
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

  it('401 → refresh → retry → deleted_at nulled exactly once for length-1 payload', async () => {
    const calls = { updateCount: 0, revalidatedCount: 0 };

    // Route now does tombstone-select + conflict-probe + update. Use null
    // normalized_name in the tombstone result so the conflict probe is
    // skipped (partial unique index predicate excludes null names anyway).
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
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
              in: () => ({
                eq: () => ({
                  not: () =>
                    Promise.resolve({
                      data: [
                        {
                          client_id: '22222222-2222-4222-8222-222222222222',
                          normalized_name: null,
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
            update: () => ({
              in: () => ({
                eq: () => ({
                  not: () => ({
                    select: async () => {
                      calls.updateCount += 1;
                      return {
                        data: [{ id: 'row-1' }],
                        error: null,
                      };
                    },
                  }),
                }),
              }),
            }),
          };
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(() => {
        calls.revalidatedCount += 1;
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');

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
      // Single-item payload per briefing §Delete-LOCKED.
      const body = { client_ids: ['22222222-2222-4222-8222-222222222222'] };
      const result = await authPost<{ restored_count: number }>(
        '/api/library/bulk-delete/undo',
        body,
      );
      expect(result.restored_count).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(calls.updateCount).toBe(1);
      expect(calls.revalidatedCount).toBe(1);

      const [, init1] = fetchSpy.mock.calls[0] ?? [];
      const [, init2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (init1 as RequestInit | undefined)?.body;
      const body2 = (init2 as RequestInit | undefined)?.body;
      expect(body2).toBe(body1);
      const parsed = JSON.parse(String(body1)) as { client_ids: string[] };
      expect(parsed.client_ids).toHaveLength(1);
      expect(parsed.client_ids[0]).toBe('22222222-2222-4222-8222-222222222222');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('third synthetic POST against already-restored row returns replayed=true', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            // Tombstone fetch returns empty (row already restored / swept),
            // skipping the conflict probe and falling through to the UPDATE
            // (which itself returns 0 rows → replayed=true).
            select: () => ({
              in: () => ({
                eq: () => ({
                  not: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
            update: () => ({
              in: () => ({
                eq: () => ({
                  not: () => ({
                    // Row already had deleted_at=null → filter excluded it.
                    select: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        },
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['22222222-2222-4222-8222-222222222222'],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { restored_count: number; replayed?: boolean };
    expect(body.restored_count).toBe(0);
    expect(body.replayed).toBe(true);
  });
});
