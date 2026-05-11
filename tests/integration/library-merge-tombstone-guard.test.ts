/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 1 C1 — `POST /api/library/merge` route MUST surface the
 * RPC's P0003 `merge_target_tombstoned` exception as a clear 409 response so
 * the client can react (refresh the library view, prompt the user, etc.).
 * Without this mapping, the RPC's tombstone guard would land in the generic
 * `db_error` 500 branch — opaque to consumers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/merge — tombstoned target → 409 (Task 4.5 R1 C1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('returns 409 + error=merge_target_tombstoned when RPC raises P0003', async () => {
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
                select: () => ({
                  eq: (k: string) => {
                    if (k === 'id')
                      return { single: async () => ({ data: { timezone: 'UTC' }, error: null }) };
                    return { eq: async () => ({ data: [], error: null }) };
                  },
                }),
              },
        rpc: async () => ({
          data: null,
          error: { code: 'P0003', message: 'merge_target_tombstoned' },
        }),
      }),
    }));

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          winnerId: '22222222-2222-4222-8222-222222222222',
          loserId: '33333333-3333-4333-8333-333333333333',
          fields: {
            nutrition: { kcal: 0, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
          },
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('merge_target_tombstoned');
  });
});
