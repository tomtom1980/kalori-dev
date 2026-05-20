/**
 * @vitest-environment node
 *
 * D.CODEX Round 2 — F-CODEX-D-02 restore name-conflict guard.
 *
 * Codex Round 1 risk: with migration 0020's partial unique index on
 * `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL
 *  AND normalized_name IS NOT NULL`, the undo handler's blind
 * `UPDATE ... SET deleted_at = NULL` can race against a same-name active
 * row created inside the 5s undo window. Postgres raises `23505` on the
 * restore, the handler maps that to a generic 500, and the client revert
 * path swallows the error — silent restore loss.
 *
 * The guard pre-checks for an active row with the same
 * `(user_id, normalized_name)` BEFORE attempting the restore. On conflict
 * it returns `409 { error: 'restore_name_conflict', conflicts: [...] }`
 * so the UI can prompt the user to rename-and-merge instead of silently
 * losing the restore.
 *
 * Mocks are intentionally hand-rolled (matching the sibling
 * `library-bulk-delete-undo.test.ts` style) so each test owns the exact
 * chain of `.from(...)` calls the route makes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/bulk-delete/undo — restore name-conflict guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('409 when a same-name active row already exists for one of the requested client_ids', async () => {
    // Sequence the handler walks under the new guard:
    //   1. auth.getUser              → u-1
    //   2. .from('profiles')         → deleting_at = null (fence passes)
    //   3. .from('food_library_items')
    //        .select tombstoned rows  → [{ id: r-1, normalized_name: 'pho bo' }]
    //   4. .from('food_library_items')
    //        .select active conflict  → [{ id: r-2, normalized_name: 'pho bo' }]
    //   5. NO update attempted (guard returned 409 before reaching it).
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    let updateCalled = false;
    // Each .from('food_library_items') returns a fresh object, so the
    // tombstone-vs-conflict-probe call count must be tracked at the closure
    // level (NOT inside the per-call factory). Routes-under-test currently
    // issue exactly 2 selects against `food_library_items` in the pre-update
    // phase. The shape diff (tombstone uses .in().eq().not(); conflict probe
    // uses .eq().in().is()) lets each mock select branch use just its needed
    // chain — both can be expressed in one object without conflicting.
    let foodLibSelectCount = 0;
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => {
              foodLibSelectCount += 1;
              if (foodLibSelectCount === 1) {
                // Tombstone fetch
                return {
                  in: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'r-1',
                              client_id: '11111111-1111-4111-8111-111111111111',
                              normalized_name: 'pho bo',
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                };
              }
              // Conflict probe
              return {
                eq: () => ({
                  in: () => ({
                    is: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: 'r-2',
                            normalized_name: 'pho bo',
                            client_id: 'new-active-client-id',
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              };
            },
            update: () => {
              updateCalled = true;
              return {
                in: () => ({
                  eq: () => ({
                    not: () => ({
                      select: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      conflicts: Array<{ client_id: string; normalized_name: string; existing_id: string }>;
    };
    expect(body.error).toBe('restore_name_conflict');
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]).toMatchObject({
      client_id: '11111111-1111-4111-8111-111111111111',
      normalized_name: 'pho bo',
      existing_id: 'r-2',
    });
    expect(updateCalled).toBe(false);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('200 when no active conflict — restore proceeds as before', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    let updateCalled = false;
    let foodLibSelectCount = 0;
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => {
              foodLibSelectCount += 1;
              if (foodLibSelectCount === 1) {
                return {
                  in: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'r-1',
                              client_id: '11111111-1111-4111-8111-111111111111',
                              normalized_name: 'pho bo',
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                };
              }
              // Conflict probe — no conflict (empty result).
              return {
                eq: () => ({
                  in: () => ({
                    is: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              };
            },
            update: () => {
              updateCalled = true;
              return {
                in: () => ({
                  eq: () => ({
                    not: () => ({
                      select: async () => ({
                        data: [{ id: 'r-1' }],
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { restored_count: number; replayed?: boolean };
    expect(body.restored_count).toBe(1);
    expect(updateCalled).toBe(true);
    expect(revalidateTag).toHaveBeenCalledWith('user:u-1:library', 'max');
  });

  it('409 partial: returns only the conflicting client_ids; clean ones are NOT restored when any conflict is present', async () => {
    // Contract decision: a 409 short-circuits the entire batch — we do not
    // half-restore. This matches the existing "atomic batch" semantics that
    // the bulk-delete sibling uses (deletions are all-or-nothing per call).
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    let updateCalled = false;
    let foodLibSelectCount = 0;
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => {
              foodLibSelectCount += 1;
              if (foodLibSelectCount === 1) {
                return {
                  in: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'r-1',
                              client_id: '11111111-1111-4111-8111-111111111111',
                              normalized_name: 'pho bo',
                            },
                            {
                              id: 'r-3',
                              client_id: '33333333-3333-4333-8333-333333333333',
                              normalized_name: 'banh mi',
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                };
              }
              // Only 'pho bo' has an active conflict; 'banh mi' is clean.
              return {
                eq: () => ({
                  in: () => ({
                    is: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: 'r-2',
                            normalized_name: 'pho bo',
                            client_id: 'new-active',
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              };
            },
            update: () => {
              updateCalled = true;
              return {
                in: () => ({
                  eq: () => ({
                    not: () => ({
                      select: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: [
            '11111111-1111-4111-8111-111111111111',
            '33333333-3333-4333-8333-333333333333',
          ],
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      conflicts: Array<{ client_id: string; normalized_name: string; existing_id: string }>;
    };
    expect(body.error).toBe('restore_name_conflict');
    expect(body.conflicts).toHaveLength(1);
    // toHaveLength(1) doesn't narrow the array type — guard explicitly for tsc.
    const conflict0 = body.conflicts[0];
    expect(conflict0).toBeDefined();
    expect(conflict0?.normalized_name).toBe('pho bo');
    expect(updateCalled).toBe(false);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // D.CODEX Round 3 — F-CODEX-D-R2-02 resolution.
  //
  // Codex Round 2 correctly observed that the pre-flight probe + UPDATE
  // pattern remains TOCTOU: a concurrent INSERT can commit between the
  // probe (returns "no conflict") and the restore UPDATE (hits 23505 on
  // the partial unique index). Before this fix the handler mapped 23505
  // to a generic 500. After this fix the handler catches Postgres error
  // code 23505 on the restore and maps it to the same structured 409
  // payload as the synchronous-probe branch — so the wire contract is
  // race-agnostic.
  //
  // Reproducing real concurrency in a unit test is non-deterministic;
  // the correct testable shape is to inject the 23505 error from the
  // Supabase client. The probe returns "no conflict" (matches the clean
  // case above), then the UPDATE rejects with `{ code: '23505' }`. The
  // route MUST map this to 409 + the structured payload, NOT 500.
  it('returns 409 restore_name_conflict when restore UPDATE hits 23505 unique violation (TOCTOU race)', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    let updateCalled = false;
    let foodLibSelectCount = 0;
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => {
              foodLibSelectCount += 1;
              if (foodLibSelectCount === 1) {
                // Tombstone fetch — returns the row we'd like to restore.
                return {
                  in: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'r-1',
                              client_id: '11111111-1111-4111-8111-111111111111',
                              normalized_name: 'pho bo',
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                };
              }
              // Pre-flight probe — returns "no conflict" (this is the TOCTOU
              // window: between this read and the UPDATE below a concurrent
              // INSERT commits with the same normalized_name).
              return {
                eq: () => ({
                  in: () => ({
                    is: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              };
            },
            // The UPDATE then hits the partial unique index and Postgres
            // raises 23505. Supabase surfaces this as `{ code: '23505' }`
            // on the error object.
            update: () => {
              updateCalled = true;
              return {
                in: () => ({
                  eq: () => ({
                    not: () => ({
                      select: async () => ({
                        data: null,
                        error: {
                          code: '23505',
                          message:
                            'duplicate key value violates unique constraint "food_library_items_user_normalized_name_active_uniq"',
                        },
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      conflicts: Array<{ client_id: string; normalized_name: string; existing_id: string | null }>;
    };
    expect(body.error).toBe('restore_name_conflict');
    // The conflicts array MUST surface the same shape as the pre-flight
    // branch so callers don't need to differentiate sync-vs-race. The
    // `existing_id` is null because the racing INSERT's id isn't known
    // by the handler — only the normalized_name + client_id are.
    expect(body.conflicts).toHaveLength(1);
    const conflict0 = body.conflicts[0];
    expect(conflict0).toBeDefined();
    expect(conflict0?.client_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(conflict0?.normalized_name).toBe('pho bo');
    expect(updateCalled).toBe(true);
    // No revalidateTag — restore failed, no cache state to invalidate.
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // Non-23505 db errors should still surface as the existing 500. This
  // pins the new catch path to ONLY the 23505 code, not all UPDATE errors.
  it('returns 500 db_error when restore UPDATE fails with a non-23505 error', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    let foodLibSelectCount = 0;
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => {
              foodLibSelectCount += 1;
              if (foodLibSelectCount === 1) {
                return {
                  in: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'r-1',
                              client_id: '11111111-1111-4111-8111-111111111111',
                              normalized_name: 'pho bo',
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                };
              }
              return {
                eq: () => ({
                  in: () => ({
                    is: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              };
            },
            update: () => ({
              in: () => ({
                eq: () => ({
                  not: () => ({
                    select: async () => ({
                      data: null,
                      error: { code: '40001', message: 'serialization_failure' },
                    }),
                  }),
                }),
              }),
            }),
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/bulk-delete/undo/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('db_error');
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
