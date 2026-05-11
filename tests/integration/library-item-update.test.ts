/**
 * @vitest-environment node
 *
 * Task 4.2 — `POST /api/library/[id]/update` happy-path + validation +
 * 404 on tombstoned / unknown id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/[id]/update', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: applies patch + returns updated row + invalidates cache tag', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    const updatedRow = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Pho Ga',
      normalized_name: 'pho ga',
      default_portion: 400,
      default_unit: 'g',
      nutrition: { kcal: 520 },
      thumbnail_url: null,
      log_count: 0,
      last_used_at: null,
      user_edited_flag: true,
      created_from: 'text',
      created_at: '2026-04-14T22:03:00Z',
    };

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
                          maybeSingle: async () => ({ data: updatedRow, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          // Task 4.2 round 1 C2 fix — nutrition must be fully merged
          // (client always sends the full post-edit shape, server stores
          // it verbatim). Partial nutrition bodies are rejected at Zod.
          fields: {
            display_name: 'Pho Ga',
            nutrition: {
              kcal: 520,
              macros: { protein_g: 30, carbs_g: 50, fat_g: 15, fiber_g: 2, sugar_g: 1 },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: typeof updatedRow };
    expect(body.item.display_name).toBe('Pho Ga');
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('404: tombstoned row returns not_found (no leak of 403)', async () => {
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
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga' },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(404);
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
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga' },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 when body is not valid JSON', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 when fields is empty', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: {},
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 when id is not a UUID', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/not-a-uuid/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'x' },
        }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });
});
