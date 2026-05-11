/**
 * @vitest-environment node
 *
 * Task 4.2 — `POST /api/library/[id]/delete` integration tests.
 *
 * Covers: happy tombstone, idempotent replay, 401 no-session, 400
 * validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/[id]/delete', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: tombstones row, returns { item: { id, deleted_at } }, invalidates tag', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

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
                          maybeSingle: async () => ({
                            data: {
                              id: '11111111-1111-4111-8111-111111111111',
                              deleted_at: nowIso,
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          delete_client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      item: { id: string; deleted_at: string } | null;
      replayed?: boolean;
    };
    expect(body.item?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.item?.deleted_at).toBe(nowIso);
    expect(body.replayed).toBeUndefined();
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('200 replayed: already-tombstoned row returns { item: null, replayed: true }', async () => {
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
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: null, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/delete', {
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
    const { POST } = await import('@/app/api/library/[id]/delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          delete_client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 when delete_client_id missing', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/delete/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
  });
});
