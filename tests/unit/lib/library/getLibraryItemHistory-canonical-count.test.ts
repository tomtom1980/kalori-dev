/**
 * @vitest-environment node
 *
 * Bug 1 (library detail false "Never logged") — unit tests asserting that
 * `getLibraryItemHistory.totalLogCount` reads from the canonical
 * `food_library_items.log_count` column, NOT from a `COUNT(food_entries
 * WHERE library_item_id=id)` query.
 *
 * Root cause history: some save paths (e.g. confirmation create+log,
 * legacy log-now) do not populate `food_entries.library_item_id` even
 * though they correctly increment `food_library_items.log_count`. The
 * FK-based count therefore returns 0 for items the user has logged, and
 * the detail page renders a misleading "Never logged" + "Log now" CTA
 * while the list page (which reads `log_count`) correctly shows the item
 * as logged.
 *
 * Fix: switch `totalLogCount` source to a single-row read of
 * `food_library_items.log_count`. Keep `recent` and `firstLoggedAt`
 * walking `food_entries` (those queries still produce useful — if
 * incomplete — data and the UI degrades gracefully when entries lack
 * the FK).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

interface SupabaseStubs {
  /** Rows returned by `from('food_entries').select(...).order(...).limit(...)`. */
  recentEntries?: Array<{ id: string; logged_at: string; meal_category: string }>;
  /** First entry returned by `.order('logged_at', { ascending: true }).limit(1).maybeSingle()`. */
  firstEntry?: { logged_at: string } | null;
  /** Row returned by `from('food_library_items').select('log_count').eq(...).maybeSingle()`. */
  libraryRow?: { log_count: number } | null;
  /** Forced error from the library row read. */
  libraryError?: { message: string } | null;
}

function buildSupabaseMock(stubs: SupabaseStubs) {
  const recentEntries = stubs.recentEntries ?? [];
  const firstEntry = stubs.firstEntry ?? null;
  const libraryRow = stubs.libraryRow ?? null;
  const libraryError = stubs.libraryError ?? null;

  const client = {
    from: (table: string) => {
      if (table === 'food_library_items') {
        // SELECT chain — `.select('log_count').eq('id', …).eq('user_id', …).maybeSingle()`.
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: libraryRow, error: libraryError }),
              }),
            }),
          }),
        };
      }
      if (table === 'food_entries') {
        // Three chains share the same `from('food_entries')`:
        //   1. .select('id, logged_at, meal_category').eq().eq().order().limit() — recent
        //   2. .select('logged_at').eq().eq().order().limit(1).maybeSingle() — first
        //   3. (legacy) .select('id', { count: 'exact', head: true }).eq().eq() — count
        //      (count path should NOT be reached after the fix.)
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            // Count chain — head:true variant. The fix removes this call
            // entirely; if invoked we return null to surface the bug.
            if (opts?.count === 'exact' && opts.head) {
              return {
                eq: () => ({
                  eq: async () => ({ count: null, error: null }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  order: (_col: string, opts?: { ascending: boolean }) => {
                    const isFirst = opts?.ascending === true;
                    if (isFirst) {
                      return {
                        limit: () => ({
                          maybeSingle: async () => ({ data: firstEntry, error: null }),
                        }),
                      };
                    }
                    return {
                      limit: async () => ({ data: recentEntries, error: null }),
                    };
                  },
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: { from: () => ({ createSignedUrl: vi.fn() }) },
  };
  return { client };
}

describe('getLibraryItemHistory — canonical totalLogCount', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('totalLogCount comes from food_library_items.log_count, NOT a food_entries count', async () => {
    // Mismatch scenario: library_items.log_count = 3 (canonical, bumped by
    // the create+log save path) BUT food_entries query returns 0 rows
    // (because those save paths never populated library_item_id).
    const { client } = buildSupabaseMock({
      libraryRow: { log_count: 3 },
      recentEntries: [],
      firstEntry: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => client,
    }));

    const { getLibraryItemHistory } = await import('@/lib/library/getItem');
    const history = await getLibraryItemHistory('lib-id', 'user-id');

    expect(history.totalLogCount).toBe(3);
  });

  it('totalLogCount falls back to 0 when the library row is missing', async () => {
    const { client } = buildSupabaseMock({
      libraryRow: null,
      recentEntries: [],
      firstEntry: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => client,
    }));

    const { getLibraryItemHistory } = await import('@/lib/library/getItem');
    const history = await getLibraryItemHistory('missing-id', 'user-id');

    expect(history.totalLogCount).toBe(0);
  });

  it('throws library_item_history_count_failed when the library row read errors', async () => {
    const { client } = buildSupabaseMock({
      libraryError: { message: 'simulated_rls_violation' },
      recentEntries: [],
      firstEntry: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => client,
    }));

    const { getLibraryItemHistory } = await import('@/lib/library/getItem');
    await expect(getLibraryItemHistory('lib-id', 'user-id')).rejects.toThrow(
      /library_item_history_count_failed/,
    );
  });

  it('recent + firstLoggedAt still derive from food_entries unchanged', async () => {
    const { client } = buildSupabaseMock({
      libraryRow: { log_count: 7 },
      recentEntries: [
        { id: 'entry-1', logged_at: '2026-05-15T10:00:00Z', meal_category: 'lunch' },
        { id: 'entry-2', logged_at: '2026-05-14T08:00:00Z', meal_category: 'breakfast' },
      ],
      firstEntry: { logged_at: '2026-01-01T12:00:00Z' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => client,
    }));

    const { getLibraryItemHistory } = await import('@/lib/library/getItem');
    const history = await getLibraryItemHistory('lib-id', 'user-id');

    expect(history.totalLogCount).toBe(7);
    expect(history.firstLoggedAt).toBe('2026-01-01T12:00:00Z');
    expect(history.recent).toHaveLength(2);
    expect(history.recent[0]?.mealCategory).toBe('lunch');
  });
});
