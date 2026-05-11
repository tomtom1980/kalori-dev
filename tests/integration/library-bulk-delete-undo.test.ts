/**
 * @vitest-environment node
 *
 * Task 4.1 sub-step 2 — `POST /api/library/bulk-delete/undo` integration tests.
 *
 * Covers:
 *   1. Happy path: client_ids of tombstoned-but-not-swept rows → UPDATE ...
 *      SET deleted_at = NULL. Returns `{ restored_count }`.
 *   2. Idempotent replay / no-op: second POST (rows already active) returns
 *      `{ restored_count: 0, replayed: true }`.
 *   3. Unauthorized: no session → 401.
 *   4. Validation: empty client_ids → 400.
 *   5. Cache-tag invalidation fires on restore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/bulk-delete/undo — restores tombstoned rows', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: clears deleted_at on requested client_ids, returns restored_count', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

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
                      not: () => ({
                        select: async () => ({
                          data: [{ id: 'r-1' }, { id: 'r-2' }],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { restored_count: number; replayed?: boolean };
    expect(body.restored_count).toBe(2);
    expect(body.replayed).toBeUndefined();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('200 replayed when zero rows updated', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
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
                      not: () => ({
                        select: async () => ({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { restored_count: number; replayed?: boolean };
    expect(body.restored_count).toBe(0);
    expect(body.replayed).toBe(true);
  });

  it('401 when no session', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
        },
        from: () => ({}),
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('400 when client_ids empty', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_ids: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
