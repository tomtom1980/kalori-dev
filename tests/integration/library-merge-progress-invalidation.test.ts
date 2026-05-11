/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 1 S1 — `POST /api/library/merge` MUST invalidate all 6
 * canonical progress range tags after a successful merge (24h, D, 7d, 30d,
 * 90d, 1y). Codex flagged the route for emitting only `['24h','7d','30d']`,
 * leaving D / 90d / 1y stale until next natural revalidation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGS } from '@/lib/cache/tags';

describe('POST /api/library/merge — full progress range invalidation (Task 4.5 R1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('emits revalidateTag for ALL 6 canonical progress ranges on a successful merge', async () => {
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
                select: () => ({
                  eq: (k: string) => {
                    if (k === 'id')
                      return { single: async () => ({ data: { timezone: 'UTC' }, error: null }) };
                    return {
                      eq: async () => ({ data: [], error: null }),
                    };
                  },
                }),
              },
        rpc: async () => ({
          data: {
            winner: { id: 'winner-1', user_id: 'u-1', display_name: 'Merged', log_count: 5 },
            replayed: false,
          },
          error: null,
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
            display_name: 'Merged',
            nutrition: { kcal: 250, macros: { protein_g: 25, carbs_g: 15, fat_g: 6 } },
          },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const tags = revalidateTag.mock.calls.map((c) => c[0] as string);
    // All 6 canonical ranges must be invalidated.
    expect(tags).toContain(TAGS.userProgress('u-1', '24h'));
    expect(tags).toContain(TAGS.userProgress('u-1', 'D'));
    expect(tags).toContain(TAGS.userProgress('u-1', '7d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '30d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '90d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '1y'));
  });
});
