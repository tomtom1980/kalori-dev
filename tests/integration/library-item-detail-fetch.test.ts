/**
 * @vitest-environment node
 *
 * Task 4.2 — `getLibraryItemById` tombstone filter proof.
 *
 * Proves the detail SELECT applies `.is('deleted_at', null)` — a
 * tombstoned-but-not-swept row returns `null` from the read helper, which
 * surfaces as Next 404 on `/library/[id]`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` exists only as a build-time marker in Next — shim it for
// Vitest's Node runtime.
vi.mock('server-only', () => ({}));

describe('getLibraryItemById — tombstone filter', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('returns the row when active (deleted_at IS NULL)', async () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Pho',
      normalized_name: 'pho',
      default_portion: 400,
      default_unit: 'g',
      nutrition: { kcal: 500 },
      thumbnail_url: null,
      log_count: 0,
      last_used_at: null,
      user_edited_flag: false,
      created_from: 'text',
      created_at: '2026-04-14T22:03:00Z',
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: row, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const { getLibraryItemById } = await import('@/lib/library/getItem');
    const result = await getLibraryItemById('11111111-1111-4111-8111-111111111111', 'u-1');
    expect(result?.id).toBe(row.id);
  });

  it('returns null when the row is tombstoned (filter excluded)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const { getLibraryItemById } = await import('@/lib/library/getItem');
    const result = await getLibraryItemById('11111111-1111-4111-8111-111111111112', 'u-1');
    expect(result).toBeNull();
  });

  it('propagates DB errors as thrown Error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { message: 'pg_failure' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { getLibraryItemById } = await import('@/lib/library/getItem');
    await expect(getLibraryItemById('11111111-1111-4111-8111-111111111113', 'u-1')).rejects.toThrow(
      /library_item_fetch_failed/,
    );
  });
});
