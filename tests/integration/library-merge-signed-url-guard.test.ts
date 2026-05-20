/**
 * @vitest-environment node
 *
 * Bugfix R1 C1 — signed URL persistence hazard guard for `/api/library/merge`.
 *
 * Context: `fetchLibraryPage` returns sign-on-read `thumbnail_url` values
 * (1-hour signed URLs). The merge dialog copies `a.thumbnail_url` /
 * `b.thumbnail_url` into the merge payload. Before this guard, the merge
 * RPC wrote that signed URL straight into the canonical `thumbnail_url`
 * column, persisting an expiring URL permanently.
 *
 * Guard contract:
 *   - When `fields.thumbnail_url` is a `http(s)://` URL, the route MUST
 *     re-resolve the raw storage path from the chosen source row
 *     (winner or loser, based on the new `thumbnail_source_id` field
 *     OR — for back-compat — by matching against winner/loser rows).
 *   - If no raw path can be resolved (the source row has no thumbnail
 *     or the supplied source id doesn't match either row), the route
 *     forces `thumbnail_url` to `null` before invoking the RPC rather
 *     than persisting the signed URL.
 *   - When `fields.thumbnail_url` is `null` or a raw path, behavior is
 *     unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('POST /api/library/merge — signed URL persistence guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildMockClient(opts: {
    winnerRaw: string | null;
    loserRaw: string | null;
    capturedFields: { value: Record<string, unknown> | null };
    rpcResult?: { winner: unknown; replayed: boolean };
  }) {
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { deleting_at: null, timezone: 'UTC' },
                  error: null,
                }),
                single: async () => ({
                  data: { timezone: 'UTC' },
                  error: null,
                }),
              }),
              single: async () => ({ data: { timezone: 'UTC' }, error: null }),
            }),
          };
        }
        if (table === 'food_entries') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        // food_library_items — raw thumbnail_url lookup for winner+loser.
        return {
          select: () => ({
            eq: () => ({
              in: async (
                _col: string,
                ids: string[],
              ): Promise<{
                data: Array<{ id: string; thumbnail_url: string | null }>;
                error: null;
              }> => {
                const rows: Array<{ id: string; thumbnail_url: string | null }> = [];
                if (ids.includes('22222222-2222-4222-8222-222222222222')) {
                  rows.push({
                    id: '22222222-2222-4222-8222-222222222222',
                    thumbnail_url: opts.winnerRaw,
                  });
                }
                if (ids.includes('33333333-3333-4333-8333-333333333333')) {
                  rows.push({
                    id: '33333333-3333-4333-8333-333333333333',
                    thumbnail_url: opts.loserRaw,
                  });
                }
                return { data: rows, error: null };
              },
            }),
          }),
        };
      },
      rpc: async (name: string, args: { p_fields: Record<string, unknown> }) => {
        if (name === 'library_merge_atomic') {
          opts.capturedFields.value = args.p_fields;
          return {
            data: opts.rpcResult ?? {
              winner: {
                id: '22222222-2222-4222-8222-222222222222',
                user_id: 'u-1',
                display_name: 'Merged',
                log_count: 5,
              },
              replayed: false,
            },
            error: null,
          };
        }
        throw new Error(`unknown rpc ${name}`);
      },
    };
  }

  async function callMerge(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/library/merge/route');
    return POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('replaces signed URL with raw path resolved from thumbnail_source_id=winner', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const captured: { value: Record<string, unknown> | null } = { value: null };
    const winnerRaw = 'u-1/sketch_winner.webp';
    const client = buildMockClient({
      winnerRaw,
      loserRaw: 'u-1/sketch_loser.webp',
      capturedFields: captured,
    });
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const res = await callMerge({
      client_id: '11111111-1111-4111-8111-111111111111',
      winnerId: '22222222-2222-4222-8222-222222222222',
      loserId: '33333333-3333-4333-8333-333333333333',
      thumbnail_source_id: '22222222-2222-4222-8222-222222222222',
      fields: {
        display_name: 'Merged',
        thumbnail_url: 'https://signed.test/winner-signed.webp?token=abc',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
    });

    expect(res.status).toBe(200);
    expect(captured.value).not.toBeNull();
    // RPC saw the raw path, NOT the signed URL.
    expect(captured.value!.thumbnail_url).toBe(winnerRaw);
  });

  it('replaces signed URL with raw path resolved from thumbnail_source_id=loser', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const captured: { value: Record<string, unknown> | null } = { value: null };
    const loserRaw = 'u-1/sketch_loser.webp';
    const client = buildMockClient({
      winnerRaw: 'u-1/sketch_winner.webp',
      loserRaw,
      capturedFields: captured,
    });
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const res = await callMerge({
      client_id: '11111111-1111-4111-8111-111111111111',
      winnerId: '22222222-2222-4222-8222-222222222222',
      loserId: '33333333-3333-4333-8333-333333333333',
      thumbnail_source_id: '33333333-3333-4333-8333-333333333333',
      fields: {
        display_name: 'Merged',
        thumbnail_url: 'https://signed.test/loser-signed.webp?token=def',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
    });

    expect(res.status).toBe(200);
    expect(captured.value!.thumbnail_url).toBe(loserRaw);
  });

  it('forces thumbnail_url to null when signed URL is supplied with no thumbnail_source_id', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const captured: { value: Record<string, unknown> | null } = { value: null };
    const client = buildMockClient({
      winnerRaw: 'u-1/sketch_winner.webp',
      loserRaw: 'u-1/sketch_loser.webp',
      capturedFields: captured,
    });
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const res = await callMerge({
      client_id: '11111111-1111-4111-8111-111111111111',
      winnerId: '22222222-2222-4222-8222-222222222222',
      loserId: '33333333-3333-4333-8333-333333333333',
      fields: {
        display_name: 'Merged',
        // Legacy client — sends signed URL without the new discriminator.
        thumbnail_url: 'https://signed.test/winner-signed.webp?token=abc',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
    });

    expect(res.status).toBe(200);
    // Defense in depth: signed URL stripped to null when source can't
    // be resolved server-side. The RPC never sees the signed URL.
    expect(captured.value!.thumbnail_url).toBeNull();
  });

  it('passes raw storage path through unchanged when client sends a path (no signed URL)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const captured: { value: Record<string, unknown> | null } = { value: null };
    const client = buildMockClient({
      winnerRaw: 'u-1/sketch_winner.webp',
      loserRaw: 'u-1/sketch_loser.webp',
      capturedFields: captured,
    });
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const res = await callMerge({
      client_id: '11111111-1111-4111-8111-111111111111',
      winnerId: '22222222-2222-4222-8222-222222222222',
      loserId: '33333333-3333-4333-8333-333333333333',
      fields: {
        display_name: 'Merged',
        thumbnail_url: 'u-1/sketch_some_raw_path.webp',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
    });

    expect(res.status).toBe(200);
    expect(captured.value!.thumbnail_url).toBe('u-1/sketch_some_raw_path.webp');
  });

  it('passes null thumbnail_url through unchanged', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const captured: { value: Record<string, unknown> | null } = { value: null };
    const client = buildMockClient({
      winnerRaw: null,
      loserRaw: null,
      capturedFields: captured,
    });
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const res = await callMerge({
      client_id: '11111111-1111-4111-8111-111111111111',
      winnerId: '22222222-2222-4222-8222-222222222222',
      loserId: '33333333-3333-4333-8333-333333333333',
      fields: {
        display_name: 'Merged',
        thumbnail_url: null,
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
    });

    expect(res.status).toBe(200);
    expect(captured.value!.thumbnail_url).toBeNull();
  });
});
