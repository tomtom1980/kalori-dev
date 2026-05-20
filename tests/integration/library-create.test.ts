/**
 * @vitest-environment node
 *
 * Task A.1 (REV 2) AC1 — round-trip integration test for save-to-library.
 *
 * Asserts: a successful POST `/api/entries/save` with `save_to_library:true`
 * AND `source: 'text'` actually persists a row into `food_library_items`
 * for the authenticated user, and a subsequent `fetchLibraryPage(userId)`
 * call returns it.
 *
 * This test does NOT mock `revalidateTag` / `revalidatePath` away from
 * the round-trip path — it lets them fire as no-ops in the test runtime
 * (Next.js cache primitives are tolerant of being called outside a real
 * request context; under `cacheComponents:false` they are documented
 * no-ops anyway). The cache-side assertion is owned by the unit test
 * (`tests/unit/api/entries-save.test.ts::AC1`); this test owns the
 * data-layer round-trip.
 *
 * Pattern reference: `tests/integration/dashboard-cache-tag.test.ts:30-160`
 * (writer→reader round-trip via mocked Supabase store). Adapted for the
 * library schema + read path.
 *
 * NOTE: Like the dashboard-cache-tag test, this is a "fake-DB integration"
 * — the Supabase client is mocked with an in-memory store that mirrors
 * the relevant subset of behavior. A real-DB version of this round-trip
 * exists in tests/rls/library-isolation.test.ts (AC3, exercises the same
 * INSERT path through the live Supabase REST API + RLS).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('library create round-trip (integration, AC1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
  });

  it('AC1 round-trip: POST save_to_library:true → fetchLibraryPage returns the new row', async () => {
    const uid = 'u-1';
    // In-memory store keyed `food_library_items:<id>`. Insert via the
    // route handler writes here; fetchLibraryPage SELECT reads from here.
    const libraryStore = new Map<string, Row>();
    // Auxiliary store for food_entries + profiles + idempotency lookup.
    const entriesStore = new Map<string, Row>();
    let libraryIdCounter = 0;

    vi.doMock('server-only', () => ({}));

    vi.doMock('next/cache', () => ({
      // Both fire-and-forget; no-op for round-trip purposes (cache assertion
      // is owned by the unit test).
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: uid } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return {
                      data: { timezone: 'Asia/Ho_Chi_Minh' },
                      error: null,
                    };
                  },
                  // Codex Round 2 NEW-I1 — fence helper reads via maybeSingle.
                  maybeSingle: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return {
                      data: { timezone: 'Asia/Ho_Chi_Minh' },
                      error: null,
                    };
                  },
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            let lookupClientId = '';
            return {
              select: (_cols?: string, options?: { count?: string; head?: boolean }) => {
                if (options?.count === 'exact' && options.head) {
                  return {
                    eq: () => ({
                      eq: () =>
                        Promise.resolve({
                          count: Array.from(entriesStore.values()).filter(
                            (r) => r.user_id === uid && typeof r.library_item_id === 'string',
                          ).length,
                          error: null,
                        }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: (k: string, v: string) => {
                      if (k === 'client_id') lookupClientId = v;
                      return {
                        maybeSingle: async () => {
                          const key = `food_entries:${uid}:${lookupClientId}`;
                          return { data: entriesStore.get(key) ?? null, error: null };
                        },
                      };
                    },
                  }),
                };
              },
              insert: (payload: Row) => ({
                select: () => ({
                  single: async () => {
                    const cid = String(payload.client_id);
                    const key = `food_entries:${uid}:${cid}`;
                    const row: Row = {
                      id: `entry-${entriesStore.size + 1}`,
                      ...payload,
                    };
                    entriesStore.set(key, row);
                    return { data: row, error: null };
                  },
                }),
              }),
              update: (payload: Row) => ({
                eq: () => ({
                  eq: async () => {
                    let affected = 0;
                    for (const [key, row] of entriesStore.entries()) {
                      if (row.user_id === uid) {
                        entriesStore.set(key, { ...row, ...payload });
                        affected += 1;
                      }
                    }
                    return { error: null, count: affected };
                  },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              insert: (payload: Row) => ({
                select: () => ({
                  single: async () => {
                    libraryIdCounter += 1;
                    const id = `lib-${libraryIdCounter}`;
                    const row: Row = {
                      id,
                      created_at: new Date().toISOString(),
                      deleted_at: null,
                      thumbnail_url: null,
                      log_count: 0,
                      last_used_at: null,
                      user_edited_flag: false,
                      default_portion: null,
                      default_unit: null,
                      ...payload,
                    };
                    libraryStore.set(`food_library_items:${id}`, row);
                    return { data: row, error: null };
                  },
                }),
              }),
              // The library reader (`lib/library/fetch.ts`) issues:
              //   1. DELETE …WHERE user_id = uid AND deleted_at IS NOT NULL
              //      AND deleted_at < cutoff … .select('id')   ← lazy sweep
              //   2. SELECT (long column list) WHERE user_id = uid
              //      AND deleted_at IS NULL ORDER BY last_used_at DESC NULLS LAST
              // We model both: DELETE returns empty (no tombstones in this
              // test); SELECT returns all `user_id===uid AND deleted_at===null`
              // rows from the in-memory store.
              delete: () => ({
                eq: () => ({
                  not: () => ({
                    lt: () => ({
                      select: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
              select: (_cols?: string, options?: { count?: string; head?: boolean }) => {
                if (options?.count === 'exact' && options.head) {
                  return {
                    eq: () => ({
                      gte: () => ({
                        lt: async () => ({ count: 0, error: null }),
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        maybeSingle: async () => ({ data: null, error: null }),
                      }),
                    }),
                    is: () => ({
                      order: async () => {
                        const rows = Array.from(libraryStore.values()).filter(
                          (r) => r.user_id === uid && r.deleted_at === null,
                        );
                        return { data: rows, error: null };
                      },
                    }),
                  }),
                };
              },
              update: (payload: Row) => ({
                eq: (key: string, value: string) => ({
                  eq: () => ({
                    is: async () => {
                      if (key === 'id') {
                        const row = libraryStore.get(`food_library_items:${value}`);
                        if (row)
                          libraryStore.set(`food_library_items:${value}`, { ...row, ...payload });
                      }
                      return { error: null };
                    },
                  }),
                }),
              }),
            };
          }
          throw new Error(`unknown table in test: ${table}`);
        },
      }),
    }));

    // POST /api/entries/save with save_to_library:true.
    const entries = await import('@/app/api/entries/save/route');
    const res = await entries.POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'aaaaaaaa-1111-4111-8111-111111111111',
          logged_at: '2026-04-21T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          save_to_library: true,
          items: [
            {
              name: 'kale-A1-test',
              portion: 1,
              unit: 'serving',
              kcal: 35,
              macros: { protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 1 },
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);

    // Now read via fetchLibraryPage and assert the row landed.
    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const page = await fetchLibraryPage(uid);

    const names = page.items.map((i) => i.display_name);
    expect(names).toContain('kale-A1-test');

    const inserted = page.items.find((i) => i.display_name === 'kale-A1-test');
    expect(inserted).toBeDefined();
    // normalizeName: lowercase + dash-strip + token-sort (see lib/text/normalize.ts)
    // `kale-A1-test` → tokens ['kale','a1','test'] → sort → 'a1 kale test'.
    expect(inserted!.normalized_name).toBe('a1 kale test');
    expect(inserted!.created_from).toBe('text');
    // Nutrition shape is preserved through INSERT → SELECT.
    expect(inserted!.nutrition.kcal).toBe(35);
    expect(inserted!.nutrition.macros?.protein_g).toBe(3);
  });
});
