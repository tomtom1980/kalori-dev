/**
 * @vitest-environment node
 *
 * Task C.4 (US-STAB-C4) — F11 undo path (DELETE /api/entries/[id]) MUST
 * symmetrically reverse the Library `log_count` + `last_used_at` bump so
 * the counters never drift away from the true entry count.
 *
 * Tests in this file:
 *   - `::reverses-on-undo` (AC2): DELETE on a library-linked entry
 *     decrements `log_count` by 1 (floored at 0) AND recomputes
 *     `last_used_at = MAX(logged_at)` over remaining entries pointing at
 *     the same `library_item_id`.
 *   - `::reverses-on-undo-null` (AC2 NULL recompute sub-case): when no
 *     entries remain, `last_used_at = NULL`. `lib/library/fetch.ts:77`
 *     orders `NULLS LAST` so the NULL'd row sinks correctly.
 *   - `::tombstone-tolerant-no-op` (AC3, undo branch): when the library
 *     row is tombstoned, the reverse-bump UPDATE silently no-ops; the
 *     entry DELETE still succeeds and the response is 200 OK.
 *
 * Pattern reference: `library-undo-refresh.test.ts:51-81` for the
 * `vi.doMock('@/lib/supabase/server')` template; `library-delete-refresh.test.ts`
 * for the DELETE route invocation template (RouteContext with params).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('Task C.4 — F11 undo reverses library bump', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
  });

  it('::reverses-on-undo — undo decrements log_count and recomputes last_used_at from MAX(logged_at)', async () => {
    // Codex Round 1 fix: log_count is now derived from COUNT(food_entries)
    // AFTER the DELETE commits. Test simulates 1 entry remaining → COUNT
    // returns 1 (= log_count after undo). Equivalent end-state to the prior
    // "initial 5, -1 = 4" semantics when 1 entry remains.
    const uid = 'u-undo-1';
    const libraryItemId = 'cccccccc-4444-4444-8444-444444444444';
    const entryToDeleteId = 'eeeeeeee-1111-4111-8111-111111111111';
    const T1 = '2026-05-12T09:00:00.000Z';
    const T2 = '2026-05-13T15:00:00.000Z';
    const trueEntryCountAfterDelete = 4;

    let reverseUpdatePayload: Row | null = null;
    let reverseUpdateRan = false;

    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                  maybeSingle: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            // Three patterns to support (Codex Round 1 derive-from-count):
            //   1. Pre-delete SELECT: 'id, logged_at, library_item_id' via
            //      .eq().eq().maybeSingle().
            //   2. DELETE: .delete().eq().eq() → { error: null }.
            //   3. Post-delete COUNT: select('id', { count: 'exact', head: true })
            //      .eq().eq() — thenable on the 2nd .eq().
            //   4. Post-delete MAX(logged_at): select('logged_at').eq().eq()
            //      .order().limit().maybeSingle().
            return {
              select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  return {
                    eq: () => ({
                      eq: () =>
                        Promise.resolve({
                          count: trueEntryCountAfterDelete,
                          error: null,
                        }),
                    }),
                  };
                }
                const isRecompute = cols === 'logged_at';
                if (isRecompute) {
                  return {
                    eq: () => ({
                      eq: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: async () => ({
                              data: { logged_at: T1 },
                              error: null,
                            }),
                          }),
                        }),
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: entryToDeleteId,
                          logged_at: T2,
                          library_item_id: libraryItemId,
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              },
              delete: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // After Codex Round 1: no SELECT log_count from food_library_items;
            // the reverse path derives log_count from the COUNT chain above.
            return {
              update: (payload: Row) => {
                reverseUpdatePayload = payload;
                reverseUpdateRan = true;
                return {
                  eq: () => ({
                    eq: () => ({
                      is: async () => ({ data: null, error: null, count: 1 }),
                    }),
                  }),
                };
              },
            };
          }
          throw new Error(`unknown table in test: ${table}`);
        },
      }),
    }));

    const { DELETE } = await import('@/app/api/entries/[id]/route');
    const res = await DELETE(
      new Request(`http://kalori.test/api/entries/${entryToDeleteId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: entryToDeleteId }) },
    );

    expect(res.status).toBe(200);
    expect(reverseUpdateRan).toBe(true);
    expect(reverseUpdatePayload).not.toBeNull();
    // log_count derived from COUNT(food_entries) post-DELETE.
    expect(reverseUpdatePayload!.log_count).toBe(trueEntryCountAfterDelete);
    // last_used_at = MAX(remaining logged_at) = T1
    expect(reverseUpdatePayload!.last_used_at).toBe(T1);
  });

  it('::reverses-on-undo-null — MAX(logged_at) returns NULL when 0 remaining', async () => {
    // Arrange: a library item with one entry. After delete: 0 entries
    // remain. Codex Round 1 fix: COUNT returns 0 → skip MAX read → write
    // last_used_at = NULL legitimately (the route now correctly
    // distinguishes "no remaining entries" from "could not read remaining
    // entries").
    const uid = 'u-undo-null';
    const libraryItemId = 'cccccccc-5555-4555-8555-555555555555';
    const entryToDeleteId = 'eeeeeeee-2222-4222-8222-222222222222';
    const T1 = '2026-05-12T09:00:00.000Z';

    let reverseUpdatePayload: Row | null = null;
    let maxReadCalled = false;

    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                  maybeSingle: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  // COUNT post-DELETE — 0 remaining.
                  return {
                    eq: () => ({
                      eq: () => Promise.resolve({ count: 0, error: null }),
                    }),
                  };
                }
                const isRecompute = cols === 'logged_at';
                if (isRecompute) {
                  // The route now SKIPs this read when count = 0. If reached,
                  // capture the fact and return null defensively.
                  maxReadCalled = true;
                  return {
                    eq: () => ({
                      eq: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                          }),
                        }),
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: entryToDeleteId,
                          logged_at: T1,
                          library_item_id: libraryItemId,
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              },
              delete: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              update: (payload: Row) => {
                reverseUpdatePayload = payload;
                return {
                  eq: () => ({
                    eq: () => ({
                      is: async () => ({ data: null, error: null, count: 1 }),
                    }),
                  }),
                };
              },
            };
          }
          throw new Error(`unknown table in test: ${table}`);
        },
      }),
    }));

    const { DELETE } = await import('@/app/api/entries/[id]/route');
    const res = await DELETE(
      new Request(`http://kalori.test/api/entries/${entryToDeleteId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: entryToDeleteId }) },
    );

    expect(res.status).toBe(200);
    expect(reverseUpdatePayload).not.toBeNull();
    expect(reverseUpdatePayload!.log_count).toBe(0);
    expect(reverseUpdatePayload!.last_used_at).toBeNull();
    // Codex Round 1 optimization: when count = 0 the MAX read is skipped
    // entirely. This proves the route correctly distinguishes "empty
    // state" from "read failure".
    expect(maxReadCalled).toBe(false);
  });

  it('::tombstone-tolerant-no-op — undo silently no-ops on tombstoned library item', async () => {
    // Codex Round 1 fix: the route no longer SELECTs log_count from
    // food_library_items (derive-from-count removed that read). Tombstone
    // tolerance is now enforced via the UPDATE's `.is('deleted_at', null)`
    // predicate — the UPDATE runs but matches 0 rows on a tombstoned row.
    // This is the correct, authoritative tombstone guard at the DB layer
    // (RLS + soft-delete partial index do the actual filtering).
    //
    // Test verifies: (a) the entry DELETE succeeds, (b) the response is
    // 200 OK, (c) the route does not throw, (d) the UPDATE chain is
    // invoked with the `.is('deleted_at', null)` predicate so a tombstoned
    // row would silently no-op at the DB.
    const uid = 'u-undo-tomb';
    const libraryItemId = 'cccccccc-6666-4666-8666-666666666666';
    const entryToDeleteId = 'eeeeeeee-3333-4333-8333-333333333333';
    const T1 = '2026-05-12T09:00:00.000Z';

    let updateInvoked = false;
    let updatePayload: Row | null = null;
    let isPredicateCol: string | null = null;
    let isPredicateVal: unknown = undefined;

    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                  maybeSingle: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { timezone: 'UTC' }, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  // COUNT post-DELETE — 0 remaining (only the deleted entry
                  // ever existed in this scenario).
                  return {
                    eq: () => ({
                      eq: () => Promise.resolve({ count: 0, error: null }),
                    }),
                  };
                }
                const isRecompute = cols === 'logged_at';
                if (isRecompute) {
                  return {
                    eq: () => ({
                      eq: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                          }),
                        }),
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: entryToDeleteId,
                          logged_at: T1,
                          library_item_id: libraryItemId,
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              },
              delete: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              update: (payload: Row) => {
                updateInvoked = true;
                updatePayload = payload;
                return {
                  eq: () => ({
                    eq: () => ({
                      is: async (col: string, val: unknown) => {
                        isPredicateCol = col;
                        isPredicateVal = val;
                        // Simulate tombstoned row: predicate matches 0
                        // rows → silent no-op at DB layer.
                        return { data: null, error: null, count: 0 };
                      },
                    }),
                  }),
                };
              },
            };
          }
          throw new Error(`unknown table in test: ${table}`);
        },
      }),
    }));

    const { DELETE } = await import('@/app/api/entries/[id]/route');
    const res = await DELETE(
      new Request(`http://kalori.test/api/entries/${entryToDeleteId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: entryToDeleteId }) },
    );

    // Entry DELETE is authoritative → 200 even when reverse UPDATE
    // silently no-ops on a tombstoned row.
    expect(res.status).toBe(200);
    // Reverse UPDATE was invoked (no SELECT log_count gate any more), but
    // it carries the `.is('deleted_at', null)` predicate that filters
    // tombstoned rows out at the DB layer.
    expect(updateInvoked).toBe(true);
    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.log_count).toBe(0);
    expect(updatePayload!.last_used_at).toBeNull();
    // Codex Round 1: prove the tombstone predicate is on the UPDATE chain.
    expect(isPredicateCol).toBe('deleted_at');
    expect(isPredicateVal).toBeNull();
  });
});
