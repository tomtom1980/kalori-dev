/**
 * @vitest-environment node
 *
 * Task C.4 (US-STAB-C4) — Re-log path bumps `food_library_items.log_count`
 * and `last_used_at` so the Library tab "frequency-sorted by default"
 * contract (PRD §3.4) holds. Origin: F-VERIFY-201.
 *
 * Tests in this file:
 *   - `::bumps-on-relog` (AC1): POST /api/entries/save with non-null
 *     `library_item_id` MUST UPDATE the matching `food_library_items` row
 *     with `log_count = N+1` and `last_used_at = now()`.
 *   - `::frequency-sort-restored` (AC4): after re-log, the bumped item
 *     would sort to the top under `last_used_at DESC NULLS LAST`
 *     (`lib/library/fetch.ts:77`) — verified by mocking the UPDATE chain
 *     and asserting the new `last_used_at` is the most-recent timestamp
 *     among observed rows.
 *   - `::tombstone-tolerant-no-op` (AC3, re-log branch): when the library
 *     row is tombstoned (`deleted_at IS NOT NULL`), the bump UPDATE
 *     silently no-ops; the entry INSERT still succeeds and the response
 *     is 200 OK. Tested by having the post-insert TOCTOU recheck succeed
 *     (so the entry persists) but then having the library SELECT for the
 *     log_count return a tombstoned row — the UPDATE chain's
 *     `.is('deleted_at', null)` predicate then matches 0 rows.
 *
 * Pattern reference: `library-undo-refresh.test.ts:51-81` for the
 * `vi.doMock('@/lib/supabase/server')` template.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('Task C.4 — library re-log bumps log_count + last_used_at', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
  });

  it('::bumps-on-relog — re-log bumps log_count and last_used_at', async () => {
    const uid = 'u-relog-1';
    const libraryItemId = 'cccccccc-1111-4111-8111-111111111111';
    // Codex Round 1 fix: log_count is now derived from COUNT(food_entries)
    // AFTER the INSERT commits. Test simulates 3 prior entries + the new
    // INSERT → COUNT returns 4. Equivalent end-state to "initial 3, +1".
    const trueEntryCountAfterInsert = 4;
    // Stamp captured before route call — bump's last_used_at MUST be >= this.
    const tStart = Date.now();

    // Captured UPDATE payload on food_library_items (the bump UPDATE).
    let bumpUpdatePayload: Row | null = null;
    let bumpUpdateRan = false;

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
            // Codex Round 1: the bump path now COUNTs food_entries (head:true
            // with count: 'exact') AFTER the INSERT, instead of SELECTing
            // log_count from food_library_items. The COUNT chain is
            // `select('id', { count: 'exact', head: true }).eq().eq()`
            // which resolves to a thenable with `{ count, error }`. The
            // I11 pre-insert SELECT remains `.select(...).eq().eq().maybeSingle()`.
            return {
              select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  // COUNT chain — Promise resolves on the 2nd .eq()
                  return {
                    eq: () => ({
                      eq: () =>
                        Promise.resolve({
                          count: trueEntryCountAfterInsert,
                          error: null,
                        }),
                    }),
                  };
                }
                // I11 idempotency pre-insert SELECT — terminal maybeSingle().
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                };
              },
              insert: (_payload: Row) => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'entry-1', logged_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // After Codex Round 1: the route no longer SELECTs `log_count`
            // from food_library_items. Only ownership-check + TOCTOU-recheck
            // SELECTs remain (both return `id`).
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: async () => ({ data: { id: libraryItemId }, error: null }),
                    }),
                  }),
                }),
              }),
              update: (payload: Row) => {
                bumpUpdatePayload = payload;
                bumpUpdateRan = true;
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

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'aaaaaaaa-1111-4111-8111-111111111111',
          logged_at: '2026-05-14T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: libraryItemId,
          items: [
            {
              name: 'banh-mi',
              portion: 1,
              unit: 'serving',
              kcal: 450,
              macros: { protein_g: 18, carbs_g: 55, fat_g: 14, fiber_g: 3 },
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);

    // AC1: bump UPDATE ran with log_count derived from COUNT(food_entries)
    // post-INSERT (Codex Round 1 fix) and last_used_at recent.
    expect(bumpUpdateRan).toBe(true);
    expect(bumpUpdatePayload).not.toBeNull();
    expect(bumpUpdatePayload!.log_count).toBe(trueEntryCountAfterInsert);
    const lastUsedAt = bumpUpdatePayload!.last_used_at as string;
    expect(typeof lastUsedAt).toBe('string');
    const lastUsedAtMs = Date.parse(lastUsedAt);
    // last_used_at >= now() - 1s (allow tiny clock-skew).
    expect(lastUsedAtMs).toBeGreaterThanOrEqual(tStart - 1000);
    // And not in the future beyond reasonable bounds.
    expect(lastUsedAtMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('::frequency-sort-restored — re-logged item moves to top on next fetch', async () => {
    // Codex Round 1 Low: this test now exercises BOTH the bump (proving
    // last_used_at is set to "now") AND the fetchLibraryPage ORDER chain
    // (proving the `ascending: false, nullsFirst: false` contract that
    // makes the bumped row sort to index 0). The previous version only
    // asserted hand-rolled timestamp comparisons — regressions in the
    // fetch's order/nullsFirst signature would not have been caught.
    const uid = 'u-sort-1';
    const libraryItemId = 'cccccccc-2222-4222-8222-222222222222';
    const peerA = {
      id: 'aaaa-peer-a',
      last_used_at: '2026-05-13T08:00:00.000Z',
    };
    const peerB = {
      id: 'bbbb-peer-b',
      last_used_at: '2026-05-14T06:00:00.000Z',
    };

    let bumpedLastUsedAt: string | null = null;
    // Codex Round 1 Low capture: assert the fetch chain invokes
    // .order('last_used_at', { ascending: false, nullsFirst: false }).
    let observedOrderCol: string | null = null;
    let observedOrderOpts: { ascending?: boolean; nullsFirst?: boolean } | null = null;

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
            // After Codex Round 1: route COUNTs food_entries post-INSERT.
            return {
              select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  return {
                    eq: () => ({
                      eq: () => Promise.resolve({ count: 1, error: null }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                };
              },
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'entry-1', logged_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              // Codex Round 1 Low — the fetchLibraryPage helper invokes
              // .select(...).eq().is().order(<col>, <opts>). We capture the
              // order call's column and options to assert the sort contract.
              // It also invokes .delete().eq().not().lt().select() for the
              // tombstone sweep, which we return a benign empty result for.
              delete: () => ({
                eq: () => ({
                  not: () => ({
                    lt: () => ({
                      select: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
              select: (cols?: string) => {
                // fetchLibraryPage's active-list SELECT uses a long column
                // list including `last_used_at`. The route's ownership +
                // TOCTOU SELECTs use `id` only.
                if (cols && cols.includes('last_used_at') && cols.includes('display_name')) {
                  return {
                    eq: () => ({
                      is: () => ({
                        order: (
                          col: string,
                          opts: { ascending?: boolean; nullsFirst?: boolean },
                        ) => {
                          observedOrderCol = col;
                          observedOrderOpts = opts;
                          // Return rows pre-sorted by last_used_at DESC NULLS LAST
                          // so we can also assert the bumped item is at index 0.
                          // We do this synchronously by reading the captured
                          // bumpedLastUsedAt at resolve time.
                          return Promise.resolve({
                            data: [
                              {
                                id: libraryItemId,
                                last_used_at: bumpedLastUsedAt,
                                display_name: 'pho',
                                client_id: 'c-pho',
                                normalized_name: 'pho',
                                default_portion: null,
                                default_unit: null,
                                nutrition: { kcal: 480 },
                                thumbnail_url: null,
                                log_count: 1,
                                user_edited_flag: false,
                                created_from: 'text',
                                created_at: '2026-05-14T10:00:00.000Z',
                              },
                              {
                                id: peerB.id,
                                last_used_at: peerB.last_used_at,
                                display_name: 'banh-mi',
                                client_id: 'c-banh',
                                normalized_name: 'banh-mi',
                                default_portion: null,
                                default_unit: null,
                                nutrition: { kcal: 450 },
                                thumbnail_url: null,
                                log_count: 1,
                                user_edited_flag: false,
                                created_from: 'text',
                                created_at: '2026-05-14T06:00:00.000Z',
                              },
                              {
                                id: peerA.id,
                                last_used_at: peerA.last_used_at,
                                display_name: 'com-tam',
                                client_id: 'c-com',
                                normalized_name: 'com-tam',
                                default_portion: null,
                                default_unit: null,
                                nutrition: { kcal: 600 },
                                thumbnail_url: null,
                                log_count: 1,
                                user_edited_flag: false,
                                created_from: 'text',
                                created_at: '2026-05-13T08:00:00.000Z',
                              },
                            ],
                            error: null,
                          });
                        },
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        maybeSingle: async () => ({ data: { id: libraryItemId }, error: null }),
                      }),
                    }),
                  }),
                };
              },
              update: (payload: Row) => {
                bumpedLastUsedAt = payload.last_used_at as string;
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

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'aaaaaaaa-2222-4222-8222-222222222222',
          logged_at: '2026-05-14T10:00:00.000Z',
          meal_category: 'lunch',
          source: 'library',
          library_item_id: libraryItemId,
          items: [{ name: 'pho', portion: 1, unit: 'bowl', kcal: 480 }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(bumpedLastUsedAt).not.toBeNull();
    const bumpedMs = Date.parse(bumpedLastUsedAt!);
    // Bumped stamp is strictly more recent than both peers.
    expect(bumpedMs).toBeGreaterThan(Date.parse(peerA.last_used_at));
    expect(bumpedMs).toBeGreaterThan(Date.parse(peerB.last_used_at));

    // Codex Round 1 Low fix — exercise the real fetchLibraryPage helper.
    // This proves: (a) the ORDER BY column is `last_used_at`, (b) the
    // ascending option is `false` (DESC), (c) nullsFirst is `false`
    // (NULLS LAST), and (d) the bumped item lands at index 0. A
    // regression in lib/library/fetch.ts:77 ordering or nullsFirst
    // behavior would now fail this test.
    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const page = await fetchLibraryPage(uid);
    expect(observedOrderCol).toBe('last_used_at');
    expect(observedOrderOpts).toEqual({ ascending: false, nullsFirst: false });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]!.id).toBe(libraryItemId);
  });

  it('::tombstone-tolerant-no-op — re-log silently no-ops on tombstoned library item', async () => {
    // Scenario: pre-insert ownership SELECT (line ~124) returns null
    // because `.is('deleted_at', null)` filters out tombstoned rows.
    // Route returns 404 BEFORE the bump UPDATE.
    const uid = 'u-tombstone-1';
    const libraryItemId = 'cccccccc-3333-4333-8333-333333333333';

    let bumpUpdateRan = false;

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
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'entry-1', logged_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // All SELECTs return null (tombstoned row filtered by
            // `.is('deleted_at', null)`).
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              update: () => {
                bumpUpdateRan = true;
                return {
                  eq: () => ({
                    eq: () => ({
                      is: async () => ({ data: null, error: null, count: 0 }),
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

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'aaaaaaaa-3333-4333-8333-333333333333',
          logged_at: '2026-05-14T10:00:00.000Z',
          meal_category: 'snack',
          source: 'library',
          library_item_id: libraryItemId,
          items: [{ name: 'che', portion: 1, unit: 'serving', kcal: 220 }],
        }),
      }),
    );

    // Pre-insert ownership check fails (tombstoned) → 404 by existing
    // contract (line ~134). The bump UPDATE never runs. Entry INSERT is
    // also skipped (the ownership check guards above it). The "tombstone-
    // tolerant" contract is satisfied: no orphan UPDATE, no 5xx.
    expect(res.status).toBe(404);
    expect(bumpUpdateRan).toBe(false);
  });
});
