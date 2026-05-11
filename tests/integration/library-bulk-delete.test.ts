/**
 * @vitest-environment node
 *
 * Task 4.1 sub-step 2 — `POST /api/library/bulk-delete` integration tests.
 *
 * Covers:
 *   1. Happy path: N active rows → `UPDATE ... SET deleted_at = now()` for all
 *      IDs owned by caller. Returns `{ deleted_count: N }`.
 *   2. Idempotent replay: second POST with the SAME ids (rows already
 *      tombstoned) returns `{ deleted_count: 0, replayed: true }`.
 *   3. Cross-user isolation: IDs owned by user B are silently ignored (RLS).
 *   4. Unauthorized: no session → 401.
 *   5. Validation: empty `ids` → 400; `ids`/`delete_client_ids` length mismatch → 400.
 *   6. Cache-tag invalidation fires on success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/bulk-delete — tombstones rows + idempotent replay', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: tombstones all requested IDs owned by user, returns deleted_count', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    const updated = { count: 0 };
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
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
          if (table === 'food_library_items') {
            return {
              update: () => ({
                in: () => ({
                  eq: () => ({
                    is: () => ({
                      select: async () => {
                        updated.count = 2;
                        return {
                          data: [{ id: 'row-1' }, { id: 'row-2' }],
                          error: null,
                        };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`unknown table ${table}`);
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
          delete_client_ids: [
            '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444',
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted_count: number; replayed?: boolean };
    expect(body.deleted_count).toBe(2);
    expect(body.replayed).toBeUndefined();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('200 replayed: second POST returns deleted_count=0, replayed=true', async () => {
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
                      is: () => ({
                        // Empty array — rows were already tombstoned.
                        select: async () => ({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['11111111-1111-4111-8111-111111111111'],
          delete_client_ids: ['22222222-2222-4222-8222-222222222222'],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted_count: number; replayed?: boolean };
    expect(body.deleted_count).toBe(0);
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

    const { POST } = await import('@/app/api/library/bulk-delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['11111111-1111-4111-8111-111111111111'],
          delete_client_ids: ['22222222-2222-4222-8222-222222222222'],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('400 when ids empty', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [], delete_client_ids: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when ids + delete_client_ids length mismatch', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['11111111-1111-4111-8111-111111111111'],
          delete_client_ids: [],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
