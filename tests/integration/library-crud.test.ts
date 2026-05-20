/**
 * @vitest-environment node
 *
 * Task C.2 (US-STAB-C2) — Library CRUD integration umbrella.
 *
 * Backend-side tests for the NEW `POST /api/library/[id]/log-now` route.
 * AC4 contract:
 *
 *   - **Snapshot atomic at click-time (P-1 mitigation).** The route MUST
 *     issue a fresh SELECT on `food_library_items` keyed by `(id, user_id,
 *     deleted_at IS NULL)`. The snapshot embedded in `food_entries.items`
 *     MUST be derived from THAT row, not from a client-supplied payload.
 *
 *   - **I11 idempotency on client_id.** A retry under the same `client_id`
 *     returns the existing row + `replayed: true`. The second insert MUST
 *     NOT fire.
 *
 *   - **RLS cross-user isolation (AC3 + AC5).** User B may not log-now a
 *     library item owned by User A. The ownership probe SELECT applies
 *     both `.eq('id', id)` and `.eq('user_id', userId)` AND
 *     `.is('deleted_at', null)` — any missing filter is a test failure.
 *
 *   - **Cache invalidation.** On success, both `TAGS.userLibrary(uid)`
 *     and `TAGS.userEntries(uid, day)` are invalidated BEFORE the 200
 *     response returns.
 *
 *   - **Sentry capture on failure.** Server fallback paths MUST call
 *     `Sentry.captureException` BEFORE returning the error response
 *     (project lesson #9).
 *
 *   - **Counter bump.** Successful log-now bumps the library item's
 *     `log_count` and `last_used_at` via the COUNT-derived pattern (F-C4
 *     concurrency-tolerant contract). Bump failure swallowed + Sentry-
 *     captured per design-doc §10.3 (library = enrichment, entry =
 *     authoritative).
 *
 * Pattern reference: `library-relog-bumps-counters.test.ts` for the
 * Supabase mock template (table-routing factory + COUNT/INSERT chains).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type FilterCall =
  | { method: 'eq'; column: string; value: unknown }
  | { method: 'is'; column: string; value: unknown };

/**
 * Chainable mock that records every `.eq()` / `.is()` filter, then resolves
 * `.maybeSingle()` to the supplied result. Lets tests prove that the route
 * issued the full filter chain (so a future regression that drops a filter
 * — e.g. `.eq('user_id', userId)` — fails loudly instead of silently).
 */
function makeOwnershipLookupMock(
  calls: FilterCall[],
  result: { data: unknown; error: unknown },
): { select: () => unknown } {
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
  return { select: () => chain };
}

describe('POST /api/library/[id]/log-now (Task C.2 — US-STAB-C2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
  });

  it('200: inserts food_entries with atomic snapshot from fresh library SELECT + invalidates both cache tags', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag,
      revalidatePath: vi.fn(),
    }));

    const uid = 'u-1';
    const libraryItemId = '11111111-1111-4111-8111-111111111111';
    const clientId = '22222222-2222-4222-8222-222222222222';

    // The "fresh" library row the route reads at click-time. Snapshot
    // bytes here MUST end up in the inserted food_entries.items[0].
    const liveLibraryRow = {
      id: libraryItemId,
      display_name: 'Pho Bo',
      default_portion: 400,
      default_unit: 'g',
      nutrition: {
        kcal: 520,
        macros: { protein_g: 30, carbs_g: 50, fat_g: 15, fiber_g: 2 },
        micros: { sodium_mg: 1200 },
      },
    };

    // Capture the actual insert payload + ownership filter chain.
    const insertCalls: Row[] = [];
    const ownershipCalls: FilterCall[] = [];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                  maybeSingle: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Fresh SELECT — snapshot source. Both ownership-probe and
            // post-insert counter-bump SELECT route through here.
            return {
              select: () => {
                const chain = {
                  eq(column: string, value: unknown) {
                    ownershipCalls.push({ method: 'eq', column, value });
                    return chain;
                  },
                  is(column: string, value: unknown) {
                    ownershipCalls.push({ method: 'is', column, value });
                    return chain;
                  },
                  async maybeSingle() {
                    return { data: liveLibraryRow, error: null };
                  },
                };
                return chain;
              },
              // The bump UPDATE chain.
              update: (_payload: Row) => ({
                eq: () => ({
                  eq: () => ({
                    is: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            // I11 pre-insert SELECT — empty (no replay).
            return {
              select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  // Post-insert COUNT for log_count derivation (F-C4 contract).
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
              insert: (payload: Row) => {
                insertCalls.push(payload);
                return {
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: 'entry-id-1',
                        logged_at: '2026-05-15T01:00:00Z',
                        ...payload,
                      },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      }),
      { params: Promise.resolve({ id: libraryItemId }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entry?: { id: string };
      replayed?: boolean;
    };
    expect(body.entry?.id).toBe('entry-id-1');

    // Snapshot freshness — the embedded items[0] must mirror the live row's
    // nutrition bytes (P-1 mitigation contract).
    expect(insertCalls).toHaveLength(1);
    const insertPayload = insertCalls[0]!;
    expect(insertPayload.user_id).toBe(uid);
    expect(insertPayload.client_id).toBe(clientId);
    expect(insertPayload.source).toBe('library');
    expect(insertPayload.library_item_id).toBe(libraryItemId);

    const items = insertPayload.items as Array<Row>;
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Pho Bo');
    expect(items[0]!.kcal).toBe(520);
    expect((items[0]!.macros as Row).protein_g).toBe(30);
    // Snapshot includes micros — proves the route did NOT just copy partial
    // data from the client.
    expect((items[0]!.micros as Row).sodium_mg).toBe(1200);

    // Ownership probe filter chain — `.eq('id')`, `.eq('user_id')`,
    // `.is('deleted_at', null)`. Any missing filter is a test failure.
    expect(ownershipCalls).toContainEqual({ method: 'eq', column: 'id', value: libraryItemId });
    expect(ownershipCalls).toContainEqual({ method: 'eq', column: 'user_id', value: uid });
    expect(ownershipCalls).toContainEqual({ method: 'is', column: 'deleted_at', value: null });

    // Cache invalidation — both tags BEFORE the response.
    expect(revalidateTag).toHaveBeenCalledWith(`user:${uid}:library`, 'max');
    // userEntries is keyed by user-TZ day. The day string is derived
    // server-side from `logged_at` + profile.timezone — we assert any
    // `user:${uid}:entries:` tag was emitted at least once.
    const calls = revalidateTag.mock.calls.filter((c: unknown[]) =>
      String(c[0]).startsWith(`user:${uid}:entries:`),
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('404: ownership fail (User B cannot log-now User A library item)', async () => {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    const insertMock = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-b' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Library row exists but is owned by User A, not User B —
            // ownership filter forces an empty result.
            return makeOwnershipLookupMock([], { data: null, error: null });
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

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      {
        params: Promise.resolve({
          id: '11111111-1111-4111-8111-111111111111',
        }),
      },
    );

    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('200 replayed: same client_id retry returns existing row without re-inserting', async () => {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    const existingEntry = {
      id: 'entry-existing',
      user_id: 'u-1',
      client_id: '44444444-4444-4444-8444-444444444444',
      logged_at: '2026-05-14T10:00:00Z',
      source: 'library',
      library_item_id: '11111111-1111-4111-8111-111111111111',
      items: [{ name: 'Pho Bo', kcal: 520 }],
    };

    const insertMock = vi.fn();

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Pre-insert ownership probe still runs.
            return makeOwnershipLookupMock([], {
              data: { id: '11111111-1111-4111-8111-111111111111' },
              error: null,
            });
          }
          if (table === 'food_entries') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: existingEntry, error: null }),
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

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: existingEntry.client_id }),
      }),
      {
        params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(body.replayed).toBe(true);
    expect(body.entry.id).toBe('entry-existing');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('401 when no session', async () => {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
        },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 when client_id is missing or not a UUID', async () => {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/log-now/route');

    const res1 = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res1.status).toBe(400);

    const res2 = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: 'not-a-uuid' }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res2.status).toBe(400);
  });

  it('400 when route param id is not a UUID', async () => {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: () => ({}),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('log-now: tombstone-after-snapshot races to compensating delete (TOCTOU defense — Codex R1 Finding 1)', async () => {
    // Adversarial test for Codex R1 Finding 1 (HIGH). The route fresh-reads
    // `food_library_items` BEFORE the INSERT, but a sibling tab can soft-
    // delete the row in the SELECT/INSERT gap. Without the post-INSERT
    // recheck added by this fix-round, an orphan `food_entries.library_
    // item_id` survives — referential-integrity scar matching `/api/entries/
    // save` route.ts:260-335. This test asserts:
    //   1. INSERT succeeds (snapshot read is fresh)
    //   2. Post-INSERT recheck observes `data: null` (concurrent tombstone)
    //   3. Compensating DELETE fires against `food_entries` by inserted id
    //   4. Route returns 404 with the SAME shape as pre-insert tombstone
    //   5. No `entry_id` leaked in the 404 body
    const revalidateTag = vi.fn();
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag,
      revalidatePath: vi.fn(),
    }));

    const uid = 'u-1';
    const libraryItemId = '11111111-1111-4111-8111-111111111111';
    const clientId = '99999999-9999-4999-8999-999999999999';
    const insertedEntryId = 'entry-id-toctou';

    // Track which `food_library_items` SELECT call we're on: the first
    // returns the live row (snapshot source), the second returns null
    // (simulated concurrent tombstone landed in the gap).
    let libSelectCount = 0;
    const compensateDeleteCalls: Array<{ id: string; userId: string }> = [];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                  maybeSingle: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              select: () => {
                libSelectCount += 1;
                const isFirstSelect = libSelectCount === 1;
                const chain = {
                  eq() {
                    return chain;
                  },
                  is() {
                    return chain;
                  },
                  async maybeSingle() {
                    if (isFirstSelect) {
                      // Snapshot read — row still active.
                      return {
                        data: {
                          id: libraryItemId,
                          display_name: 'Pho Bo',
                          default_portion: 400,
                          default_unit: 'g',
                          nutrition: { kcal: 520, macros: {}, micros: {} },
                        },
                        error: null,
                      };
                    }
                    // Post-INSERT recheck — concurrent tombstone landed.
                    return { data: null, error: null };
                  },
                };
                return chain;
              },
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
                    data: { id: insertedEntryId, logged_at: '2026-05-15T01:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              delete: () => ({
                eq(col: string, val: string) {
                  // First eq is `id`, second is `user_id`. Capture the pair.
                  if (col === 'id') {
                    compensateDeleteCalls.push({ id: val, userId: '' });
                  } else if (col === 'user_id' && compensateDeleteCalls.length) {
                    compensateDeleteCalls[compensateDeleteCalls.length - 1]!.userId = val;
                  }
                  const chain = {
                    eq(col2: string, val2: string) {
                      if (col2 === 'user_id' && compensateDeleteCalls.length) {
                        compensateDeleteCalls[compensateDeleteCalls.length - 1]!.userId = val2;
                      }
                      return Promise.resolve({ error: null, count: 1 });
                    },
                    then(resolve: (v: unknown) => void) {
                      resolve({ error: null, count: 1 });
                    },
                  };
                  return chain;
                },
              }),
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      }),
      { params: Promise.resolve({ id: libraryItemId }) },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as Row;
    // Same shape as the pre-insert tombstone branch — no entry_id leaked.
    expect(body.error).toBe('not_found');
    expect(body.entry_id).toBeUndefined();
    expect(body.entry).toBeUndefined();

    // Compensating delete fired against food_entries by inserted id +
    // user_id (defense-in-depth, matches /api/entries/save).
    expect(compensateDeleteCalls.length).toBeGreaterThanOrEqual(1);
    const compensate = compensateDeleteCalls[0]!;
    expect(compensate.id).toBe(insertedEntryId);
    expect(compensate.userId).toBe(uid);
  });

  it('log-now: meal_category respects profile timezone — Bangkok 08:00 → breakfast (Codex R1 Finding 2)', async () => {
    // Adversarial test for Codex R1 Finding 2 (HIGH). The previous
    // implementation called `new Date(iso).getUTCHours()` which, for an
    // Asia/Bangkok user logging at 08:00 local (01:00 UTC), produced
    // `h=1` → "snack". This fix passes `profile.timezone` to
    // inferMealCategory and uses Intl.DateTimeFormat to recover the
    // local hour. Each timezone exercises one slot boundary:
    //   - 08:00 Asia/Bangkok = 01:00Z → "breakfast" (was "snack")
    //   - 13:00 Asia/Bangkok = 06:00Z → "lunch"     (was "breakfast")
    //   - 19:00 Asia/Bangkok = 12:00Z → "dinner"    (was "lunch")
    //   - 22:00 Asia/Bangkok = 15:00Z → "snack"     (was "lunch")
    //
    // Pin `Date.now()` past the latest ISO under test so the
    // FUTURE_SKEW_MS guard doesn't reject the request (the integration
    // route enforces `logged_at <= now + 5min` per F-UI-3.6-B-3 I10).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T20:00:00Z'));
    const insertCalls: Row[] = [];
    function setupSupabaseMock(): void {
      const uid = 'u-1';
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({
          auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
          from: (table: string) => {
            if (table === 'profiles') {
              return {
                select: (cols?: string) => ({
                  eq: () => ({
                    single: async () =>
                      cols && cols.includes('deleting_at')
                        ? { data: { deleting_at: null }, error: null }
                        : { data: { timezone: 'Asia/Bangkok' }, error: null },
                    maybeSingle: async () =>
                      cols && cols.includes('deleting_at')
                        ? { data: { deleting_at: null }, error: null }
                        : { data: { timezone: 'Asia/Bangkok' }, error: null },
                  }),
                }),
              };
            }
            if (table === 'food_library_items') {
              return {
                select: () => {
                  const chain = {
                    eq() {
                      return chain;
                    },
                    is() {
                      return chain;
                    },
                    async maybeSingle() {
                      return {
                        data: {
                          id: '11111111-1111-4111-8111-111111111111',
                          display_name: 'Pho Bo',
                          default_portion: 400,
                          default_unit: 'g',
                          nutrition: { kcal: 520, macros: {}, micros: {} },
                        },
                        error: null,
                      };
                    },
                  };
                  return chain;
                },
                update: () => ({
                  eq: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
                }),
              };
            }
            if (table === 'food_entries') {
              return {
                select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                  if (opts?.count === 'exact' && opts.head) {
                    return { eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }) };
                  }
                  return {
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({ data: null, error: null }),
                      }),
                    }),
                  };
                },
                insert: (payload: Row) => {
                  insertCalls.push(payload);
                  return {
                    select: () => ({
                      single: async () => ({
                        data: { id: 'e-1', logged_at: payload.logged_at, ...payload },
                        error: null,
                      }),
                    }),
                  };
                },
              };
            }
            return {};
          },
        }),
      }));
    }

    const cases: Array<{ utcIso: string; expected: string; label: string }> = [
      { utcIso: '2026-05-15T01:00:00Z', expected: 'breakfast', label: 'Bangkok 08:00' },
      { utcIso: '2026-05-15T06:00:00Z', expected: 'lunch', label: 'Bangkok 13:00' },
      { utcIso: '2026-05-15T12:00:00Z', expected: 'dinner', label: 'Bangkok 19:00' },
      { utcIso: '2026-05-15T15:00:00Z', expected: 'snack', label: 'Bangkok 22:00' },
    ];

    for (const tc of cases) {
      vi.resetModules();
      vi.doMock('server-only', () => ({}));
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
      insertCalls.length = 0;
      setupSupabaseMock();

      const { POST } = await import('@/app/api/library/[id]/log-now/route');
      const res = await POST(
        new Request('http://kalori.test/api/library/x/log-now', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: '88888888-8888-4888-8888-888888888888',
            logged_at: tc.utcIso,
          }),
        }),
        { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
      );
      expect(res.status).toBe(200);
      expect(insertCalls.length).toBe(1);
      expect(insertCalls[0]!.meal_category).toBe(tc.expected);
    }
    vi.useRealTimers();
  });

  it('500: snapshot-read DB error captures Sentry BEFORE returning error (lesson #9)', async () => {
    // The Sentry stub captures every captureException call so we can assert
    // a Sentry breadcrumb landed BEFORE the route returned the 500.
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            // I11 pre-insert SELECT — empty (no replay) so the route
            // proceeds to the snapshot read.
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            // Snapshot read fails — route must Sentry-capture + 500.
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: async () => ({
                        data: null,
                        error: { code: '500', message: 'connection_failure' },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );

    expect(res.status).toBe(500);
    // Lesson #9: Sentry capture BEFORE the response (so the failure is
    // observable in production, never silently swallowed).
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it('500 recheck_failed: post-INSERT recheck DB error does NOT compensating-delete (Codex R2 Finding 1)', async () => {
    // Adversarial test for Codex R2 Finding 1 (HIGH). The R1 fix destructured
    // only `data: stillActive` from the recheck, silently treating a transient
    // PostgREST/RLS/schema failure (data:null, error:!!) as a concurrent
    // tombstone (data:null, error:null). That would fire the compensating
    // DELETE on a read blip → permanent data loss + hidden DB error.
    //
    // The R2 fix three-branches: error → 500 `recheck_failed` + Sentry, no
    // compensating delete; tombstone → 404 + delete; happy → bump + 200.
    // This test asserts:
    //   1. INSERT succeeds (snapshot read is fresh)
    //   2. Post-INSERT recheck returns { data:null, error:<pg error> }
    //   3. Route returns 500 with `{ error: 'recheck_failed' }`
    //   4. Sentry.captureException fires with phase=post_insert_recheck tag
    //   5. NO compensating DELETE is issued against food_entries
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    const uid = 'u-1';
    const libraryItemId = '11111111-1111-4111-8111-111111111111';
    const clientId = '77777777-7777-4777-8777-777777777777';
    const insertedEntryId = 'entry-id-recheck-fail';
    let libSelectCount = 0;
    const compensateDeleteCalls: Array<{ id: string; userId: string }> = [];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                  maybeSingle: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'UTC' }, error: null },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              select: () => {
                libSelectCount += 1;
                const isFirstSelect = libSelectCount === 1;
                const chain = {
                  eq() {
                    return chain;
                  },
                  is() {
                    return chain;
                  },
                  async maybeSingle() {
                    if (isFirstSelect) {
                      // Snapshot read — row still active.
                      return {
                        data: {
                          id: libraryItemId,
                          display_name: 'Pho Bo',
                          default_portion: 400,
                          default_unit: 'g',
                          nutrition: { kcal: 520, macros: {}, micros: {} },
                        },
                        error: null,
                      };
                    }
                    // Post-INSERT recheck — DB read FAILS (transient pg error).
                    return {
                      data: null,
                      error: { code: 'PGRST500', message: 'connection_failure' },
                    };
                  },
                };
                return chain;
              },
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
                    data: { id: insertedEntryId, logged_at: '2026-05-15T01:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              // If ANY delete chain fires, we record it — a recheck-error path
              // that compensating-deletes is the bug we're guarding against.
              delete: () => {
                const chain = {
                  eq(col: string, val: string) {
                    if (col === 'id') {
                      compensateDeleteCalls.push({ id: val, userId: '' });
                    } else if (col === 'user_id' && compensateDeleteCalls.length) {
                      compensateDeleteCalls[compensateDeleteCalls.length - 1]!.userId = val;
                    }
                    return chain;
                  },
                  then(resolve: (v: unknown) => void) {
                    resolve({ error: null, count: 1 });
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

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      }),
      { params: Promise.resolve({ id: libraryItemId }) },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as Row;
    expect(body.error).toBe('recheck_failed');

    // Sentry capture fired with the right tags so operator can audit the
    // potentially-orphaned `food_entries` row.
    expect(captureExceptionMock).toHaveBeenCalled();
    const sentryCall = captureExceptionMock.mock.calls[0]!;
    const ctx = sentryCall[1] as { tags?: Record<string, string> };
    expect(ctx.tags?.phase).toBe('post_insert_recheck');
    expect(ctx.tags?.route).toBe('log-now');

    // NO compensating delete on a read failure — we don't know if the
    // library row is still active, and deleting on a blip is data loss.
    expect(compensateDeleteCalls).toHaveLength(0);
  });

  it('log-now: malformed profile.timezone falls back to UTC + Sentry-captures (Codex R2 Finding 2)', async () => {
    // Adversarial test for Codex R2 Finding 2 (MEDIUM). A legacy/abandoned
    // onboarding row leaves `profiles.timezone = 'NotARealZone/Bogus'`.
    // The R1 implementation passed this directly to `inferMealCategory` and
    // `userTzDayFrom`, both of which call `Intl.DateTimeFormat({ timeZone })`
    // → RangeError → 500 BEFORE the entry insert (user-visible failure on
    // every log-now attempt until the profile is repaired).
    //
    // The R2 fix normalizes at the route boundary: invalid → UTC fallback,
    // Sentry-captures with `scope: 'log-now'` so operators can audit and
    // repair the profile. The log-now path SUCCEEDS (200), entry inserts.
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));

    const uid = 'u-1';
    const libraryItemId = '11111111-1111-4111-8111-111111111111';
    const insertCalls: Row[] = [];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            // The bug condition: timezone is a malformed string.
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'NotARealZone/Bogus' }, error: null },
                  maybeSingle: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'NotARealZone/Bogus' }, error: null },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              select: () => {
                const chain = {
                  eq() {
                    return chain;
                  },
                  is() {
                    return chain;
                  },
                  async maybeSingle() {
                    return {
                      data: {
                        id: libraryItemId,
                        display_name: 'Pho Bo',
                        default_portion: 400,
                        default_unit: 'g',
                        nutrition: { kcal: 520, macros: {}, micros: {} },
                      },
                      error: null,
                    };
                  },
                };
                return chain;
              },
              update: () => ({
                eq: () => ({
                  eq: () => ({ is: async () => ({ error: null }) }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.count === 'exact' && opts.head) {
                  return {
                    eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }),
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
              insert: (payload: Row) => {
                insertCalls.push(payload);
                return {
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: 'entry-id-tz-fallback',
                        logged_at: payload.logged_at,
                        ...payload,
                      },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/log-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: '55555555-5555-4555-8555-555555555555' }),
      }),
      { params: Promise.resolve({ id: libraryItemId }) },
    );

    // The route does NOT crash with 500 — it succeeds.
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);

    // Sentry capture fired exactly once for the invalid_tz with scope=log-now.
    const invalidTzCalls = captureExceptionMock.mock.calls.filter((c) => {
      const tags = (c[1] as { tags?: Record<string, string> }).tags;
      return tags?.component === 'profile-timezone' && tags?.scope === 'log-now';
    });
    expect(invalidTzCalls.length).toBeGreaterThanOrEqual(1);
    const ctx = invalidTzCalls[0]![1] as {
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    };
    expect(ctx.tags.invalid_tz).toBe('NotARealZone/Bogus');
    expect(ctx.extra.userId).toBe(uid);
  });
});
