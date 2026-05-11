/**
 * @vitest-environment node
 *
 * Task 4.2 round 1 C1 fix — /api/entries/save must reject a
 * `library_item_id` that does NOT belong to the authenticated user (or is
 * tombstoned). Before this fix, the server silently persisted the
 * cross-user reference because RLS on food_entries only gates the INSERT's
 * own user_id — not the foreign-key `library_item_id`.
 *
 * Attack vector: `/library/[id]` detail → "Log this now" deep-link
 * `?tab=library&item=<victim-uuid>` → user completes log flow → save route
 * writes `food_entries.library_item_id = <victim-uuid>`.
 *
 * Round 2 hardening — the mocks now CAPTURE every `.eq()` / `.is()`
 * invocation made against `food_library_items` during the ownership probe
 * and assert that the route issued the full 3-filter chain with the
 * expected arg values. Without the capturing mock, removing e.g.
 * `.eq('user_id', userId)` from the production route would still return
 * `null` from the chain (defaults hard-code null) and the test would
 * silently pass. The capture + assert pair makes the filter chain
 * LOAD-BEARING: any missing or mis-argued filter fails the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FilterCall =
  | { method: 'eq'; column: string; value: unknown }
  | { method: 'is'; column: string; value: unknown };

/**
 * Build a `food_library_items` ownership-lookup mock that:
 *   1. Records every `.eq(column, value)` / `.is(column, value)` call into
 *      the supplied `calls` array in invocation order.
 *   2. Resolves `.maybeSingle()` to the supplied `result` regardless of
 *      arg shape — but the test asserts the calls array AFTER the route
 *      runs to prove the full filter chain was applied.
 *
 * The builder is chainable and unordered — the route can call
 * `.eq().eq().is()` in any order and we still record the total set.
 */
function makeOwnershipLookupMock(calls: FilterCall[], result: { data: unknown; error: null }) {
  const chain = {
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', column, value });
      return chain;
    },
    is(column: string, value: unknown) {
      calls.push({ method: 'is', column, value });
      return chain;
    },
    async maybeSingle() {
      return result;
    },
  };
  return {
    select: () => chain,
  };
}

describe('POST /api/entries/save — C1 library_item_id ownership guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('404 when library_item_id points to a row owned by another user', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const ownershipCalls: FilterCall[] = [];
    const insertMock = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Victim-owned row — ownership + tombstone filters must BOTH be
            // present for the route to 404. Capturing mock records the
            // filter chain for assertion.
            return makeOwnershipLookupMock(ownershipCalls, { data: null, error: null });
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
              insert: (...args: unknown[]) => {
                insertMock(...args);
                return {
                  select: () => ({
                    single: async () => ({ data: null, error: null }),
                  }),
                };
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          // Victim-owned library item UUID.
          library_item_id: '11111111-1111-4111-8111-111111111111',
          items: [
            {
              name: 'Victim Pho',
              portion: 400,
              unit: 'g',
              kcal: 500,
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(404);
    // CRITICAL: the cross-user insert must NOT happen.
    expect(insertMock).not.toHaveBeenCalled();

    // Round 2 hardening — the route MUST have applied all three filters
    // on the ownership probe. If any filter is removed from the
    // production code, one of these expectations fails.
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'id',
      value: '11111111-1111-4111-8111-111111111111',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'user_id',
      value: 'user-a',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'is',
      column: 'deleted_at',
      value: null,
    });
  });

  it('404 when library_item_id points to a tombstoned row owned by the user', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const ownershipCalls: FilterCall[] = [];
    const insertMock = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Tombstoned row — `.is('deleted_at', null)` filter excludes it.
            return makeOwnershipLookupMock(ownershipCalls, { data: null, error: null });
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
              insert: (...args: unknown[]) => {
                insertMock(...args);
                return {
                  select: () => ({
                    single: async () => ({ data: null, error: null }),
                  }),
                };
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '44444444-4444-4444-8444-444444444444',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: '22222222-2222-4222-8222-222222222222',
          items: [
            {
              name: 'Tombstoned Pho',
              portion: 400,
              unit: 'g',
              kcal: 500,
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();

    // Round 2 hardening — same three filters must be applied even on the
    // tombstoned path. `.is('deleted_at', null)` is the load-bearing one
    // here but we still verify `.eq('user_id', …)` so a future regression
    // that drops the user filter on this path fails too.
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'id',
      value: '22222222-2222-4222-8222-222222222222',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'user_id',
      value: 'user-a',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'is',
      column: 'deleted_at',
      value: null,
    });
  });

  it('200 when library_item_id belongs to the authenticated user and is active', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const insertedRow = {
      id: 'entry-1',
      user_id: 'user-a',
      client_id: '55555555-5555-4555-8555-555555555555',
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: '66666666-6666-4666-8666-666666666666',
      items: [],
    };
    const ownershipCalls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Active, owned row — all three filters match; row returned.
            return makeOwnershipLookupMock(ownershipCalls, {
              data: { id: '66666666-6666-4666-8666-666666666666' },
              error: null,
            });
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
                  single: async () => ({ data: insertedRow, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '55555555-5555-4555-8555-555555555555',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: '66666666-6666-4666-8666-666666666666',
          items: [
            {
              name: 'Own Pho',
              portion: 400,
              unit: 'g',
              kcal: 500,
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entry: typeof insertedRow };
    expect(body.entry.library_item_id).toBe('66666666-6666-4666-8666-666666666666');

    // Round 2 hardening — even on the happy path, every filter must be
    // present. If someone later "optimizes" the route by removing one,
    // this assertion fails.
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'id',
      value: '66666666-6666-4666-8666-666666666666',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'eq',
      column: 'user_id',
      value: 'user-a',
    });
    expect(ownershipCalls).toContainEqual({
      method: 'is',
      column: 'deleted_at',
      value: null,
    });
  });

  /**
   * F-TASK-4.2-TOCTOU regression — Task 4.2 Codex round 2 finding #3.
   *
   * The pre-insert ownership/tombstone SELECT runs as a SEPARATE statement
   * from the food_entries INSERT. A same-user race window exists: the
   * library row can be tombstoned via /api/library/[id]/delete in a sibling
   * tab AFTER the route reads it as active but BEFORE the INSERT commits.
   * The FK ON DELETE SET NULL trigger does NOT fire because soft-delete
   * leaves the row physically present — so the entry persists with a
   * library_item_id pointing at a tombstoned row (referential-integrity
   * scar; orphaned on list views that filter `deleted_at IS NULL`).
   *
   * Fix mechanism: after the INSERT commits, RE-VERIFY the library row is
   * still active. If a concurrent tombstone landed in the window, DELETE
   * the just-inserted entry (compensating action — the brand-new row has
   * no children and is owned by the caller) and return 404 uniformly.
   *
   * The test simulates the race by wiring TWO sequential lookups against
   * food_library_items: the first returns "active" (pre-insert pass), the
   * second returns "null" (post-insert recheck — tombstoned in the window).
   * The route MUST detect this and reverse its commit.
   */
  it('TOCTOU: rolls back the entry when library row is tombstoned mid-flight', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const insertedRow = {
      id: 'entry-orphan-candidate',
      user_id: 'user-a',
      client_id: '77777777-7777-4777-8777-777777777777',
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: '88888888-8888-4888-8888-888888888888',
      items: [],
    };

    let libraryLookupCount = 0;
    const ownershipResults = [
      // Pre-insert SELECT — row is active (passes the guard).
      { data: { id: '88888888-8888-4888-8888-888888888888' }, error: null },
      // Post-insert recheck — the concurrent /library/[id]/delete in a
      // sibling tab tombstoned the row in the race window. Returns null
      // (filter `deleted_at IS NULL` excludes it).
      { data: null, error: null },
    ];

    const compensatingDeleteCalls: Array<{ column: string; value: unknown }> = [];
    const insertMock = vi.fn();

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            const idx = libraryLookupCount;
            libraryLookupCount += 1;
            const result = ownershipResults[idx] ?? { data: null, error: null };
            const chain = {
              eq: () => chain,
              is: () => chain,
              maybeSingle: async () => result,
            };
            return { select: () => chain };
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
              insert: (payload: unknown) => {
                insertMock(payload);
                return {
                  select: () => ({
                    single: async () => ({ data: insertedRow, error: null }),
                  }),
                };
              },
              // Compensating DELETE — the route MUST issue this when the
              // post-insert recheck sees a tombstone. Capture the filter
              // chain to assert the delete is keyed on the inserted row's
              // id (NOT a broad delete) AND scoped to user_id.
              //
              // Aggregate Codex A2 follow-up: the chain is now thenable so
              // the route's `await supabase...delete().eq().eq()` resolves
              // to `{ error: null, count: 1 }` (success). The route checks
              // these and only returns 404 on the success path.
              delete: () => {
                const chain = {
                  eq: (column: string, value: unknown) => {
                    compensatingDeleteCalls.push({ column, value });
                    return chain;
                  },
                  then: (resolve: (value: { data: null; error: null; count: number }) => void) => {
                    resolve({ data: null, error: null, count: 1 });
                  },
                };
                return chain;
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '77777777-7777-4777-8777-777777777777',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: '88888888-8888-4888-8888-888888888888',
          items: [
            {
              name: 'Race Pho',
              portion: 400,
              unit: 'g',
              kcal: 500,
            },
          ],
        }),
      }),
    );

    // The route detected the mid-flight tombstone; final response is 404
    // (matches the pre-insert tombstone path — uniform error contract).
    expect(res.status).toBe(404);

    // Sanity: the route MUST have issued two ownership lookups (pre-insert
    // gate + post-insert recheck). If only one runs, the recheck wasn't
    // wired and the test would still pass on the legacy code path.
    expect(libraryLookupCount).toBe(2);

    // Sanity: the INSERT did fire (this is a TRUE race, not a guard skip).
    expect(insertMock).toHaveBeenCalledTimes(1);

    // The compensating delete MUST be keyed on the inserted entry's id AND
    // user_id (RLS already enforces the latter, but explicit defense-in-
    // depth — and any future regression that broadens the delete fails
    // here). Without these filters present, a buggy delete could wipe
    // unrelated rows.
    expect(compensatingDeleteCalls).toContainEqual({
      column: 'id',
      value: 'entry-orphan-candidate',
    });
    expect(compensatingDeleteCalls).toContainEqual({
      column: 'user_id',
      value: 'user-a',
    });
  });

  /**
   * F-TASK-4.2-TOCTOU follow-up — aggregate Codex finding A2.
   *
   * Supabase query failures resolve with `{ error, count }` rather than
   * throwing. The original compensating-delete in commit 45f4142 wrapped the
   * delete in try/catch only — any failure (RLS denial, constraint problem,
   * delete that affected zero rows) was treated as success and the route
   * returned a clean 404 to the client even though the orphan entry persisted
   * in the database.
   *
   * Spec (post-fix):
   *   - The delete MUST inspect `{ error, count }` returned by Supabase.
   *   - If `error` is non-null OR `count !== 1`, the route MUST surface a
   *     500 (`library_item_compensation_failed`) so the client knows
   *     compensation failed and the operator can investigate.
   *   - Only when the delete actually removes the inserted row may the route
   *     return the uniform 404 (`library_item_not_found`).
   *
   * Each test wires a fresh mock with TWO ownership lookups (active then
   * tombstoned) and varies the delete-builder behavior to assert the route
   * routes the response on `{ error, count }` correctly.
   */
  it('AC-A2: TOCTOU compensating delete failure surfaces as 500, not 404', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const insertedRow = {
      id: 'entry-A',
      user_id: 'user-a',
      client_id: '11111111-1111-4111-8111-aaaaaaaaaaaa',
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: '99999999-9999-4999-8999-999999999999',
      items: [],
    };

    let libraryLookupCount = 0;
    const ownershipResults = [
      { data: { id: '99999999-9999-4999-8999-999999999999' }, error: null },
      { data: null, error: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            const idx = libraryLookupCount;
            libraryLookupCount += 1;
            const result = ownershipResults[idx] ?? { data: null, error: null };
            const chain = {
              eq: () => chain,
              is: () => chain,
              maybeSingle: async () => result,
            };
            return { select: () => chain };
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
                  single: async () => ({ data: insertedRow, error: null }),
                }),
              }),
              // Compensating delete RESOLVES with an error — RLS denial, etc.
              // The route MUST detect this and return 500.
              delete: () => {
                const chain = {
                  eq: () => chain,
                  // Final await on the chain returns the error envelope.
                  then: (
                    resolve: (value: {
                      data: null;
                      error: { message: string };
                      count: null;
                    }) => void,
                  ) => {
                    resolve({ data: null, error: { message: 'rls denied' }, count: null });
                  },
                };
                return chain;
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-aaaaaaaaaaaa',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: '99999999-9999-4999-8999-999999999999',
          items: [{ name: 'Race Pho', portion: 400, unit: 'g', kcal: 500 }],
        }),
      }),
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('library_item_compensation_failed');
  });

  it('AC-A2: TOCTOU compensating delete returning count=0 surfaces as 500', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const insertedRow = {
      id: 'entry-B',
      user_id: 'user-a',
      client_id: '22222222-2222-4222-8222-bbbbbbbbbbbb',
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      items: [],
    };

    let libraryLookupCount = 0;
    const ownershipResults = [
      { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, error: null },
      { data: null, error: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            const idx = libraryLookupCount;
            libraryLookupCount += 1;
            const result = ownershipResults[idx] ?? { data: null, error: null };
            const chain = {
              eq: () => chain,
              is: () => chain,
              maybeSingle: async () => result,
            };
            return { select: () => chain };
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
                  single: async () => ({ data: insertedRow, error: null }),
                }),
              }),
              // Compensating delete RESOLVES with no error but count=0 —
              // delete didn't actually hit the row (race / row already gone).
              // The route MUST detect this and return 500.
              delete: () => {
                const chain = {
                  eq: () => chain,
                  then: (resolve: (value: { data: null; error: null; count: number }) => void) => {
                    resolve({ data: null, error: null, count: 0 });
                  },
                };
                return chain;
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '22222222-2222-4222-8222-bbbbbbbbbbbb',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          items: [{ name: 'Race Pho', portion: 400, unit: 'g', kcal: 500 }],
        }),
      }),
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('library_item_compensation_failed');
  });

  it('AC-A2: TOCTOU compensating delete success keeps 404 (positive control)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const insertedRow = {
      id: 'entry-C',
      user_id: 'user-a',
      client_id: '33333333-3333-4333-8333-cccccccccccc',
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      items: [],
    };

    let libraryLookupCount = 0;
    const ownershipResults = [
      { data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, error: null },
      { data: null, error: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via maybeSingle.
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            const idx = libraryLookupCount;
            libraryLookupCount += 1;
            const result = ownershipResults[idx] ?? { data: null, error: null };
            const chain = {
              eq: () => chain,
              is: () => chain,
              maybeSingle: async () => result,
            };
            return { select: () => chain };
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
                  single: async () => ({ data: insertedRow, error: null }),
                }),
              }),
              // Compensating delete SUCCEEDS — count=1 means the orphan row
              // was actually removed. The route returns the uniform 404 used
              // by the pre-insert tombstone branch.
              delete: () => {
                const chain = {
                  eq: () => chain,
                  then: (resolve: (value: { data: null; error: null; count: number }) => void) => {
                    resolve({ data: null, error: null, count: 1 });
                  },
                };
                return chain;
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-cccccccccccc',
          logged_at: '2026-04-23T06:00:00Z',
          meal_category: 'breakfast',
          source: 'library',
          library_item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          items: [{ name: 'Race Pho', portion: 400, unit: 'g', kcal: 500 }],
        }),
      }),
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('library_item_not_found');
  });
});
