/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 1 S2 — `POST /api/library/merge` MUST surface cache
 * invalidation failures via Sentry + an optional `cache_invalidation_warnings`
 * field in the response envelope. Codex flagged the silent try/catch in the
 * `affectedDays` pre-fetch (and the unprotected per-tag revalidate calls)
 * as cache-correctness invisibility — failures slipped through unnoticed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryCaptureExceptionSpy = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (err: unknown, ctx?: unknown) => sentryCaptureExceptionSpy(err, ctx),
}));

describe('POST /api/library/merge — cache invalidation error surfacing (Task 4.5 R1 S2)', () => {
  beforeEach(() => {
    sentryCaptureExceptionSpy.mockReset();
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('captures revalidateTag throws to Sentry AND surfaces a warning in the response envelope', async () => {
    const revalidateTag = vi.fn(() => {
      throw new Error('synthetic-revalidate-failure');
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                    // Route's cache-invalidation prefetch reads profiles.timezone via single.
                    single: async () => ({ data: { timezone: 'UTC' }, error: null }),
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
    const body = (await res.json()) as {
      winner: { id: string };
      replayed?: boolean;
      cache_invalidation_warnings?: string[];
    };
    // Merge succeeded — winner returned.
    expect(body.winner.id).toBe('winner-1');
    // Cache-warning surface populated — the call site can react / log /
    // alert without walking Sentry transcripts.
    expect(Array.isArray(body.cache_invalidation_warnings)).toBe(true);
    expect((body.cache_invalidation_warnings ?? []).length).toBeGreaterThan(0);
    // Sentry got the failure too — silent-swallow regression guard.
    expect(sentryCaptureExceptionSpy).toHaveBeenCalled();
    const sentryArgs = sentryCaptureExceptionSpy.mock.calls[0] ?? [];
    expect((sentryArgs[0] as Error).message).toContain('synthetic-revalidate-failure');
  });
});
