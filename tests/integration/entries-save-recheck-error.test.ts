/**
 * @vitest-environment node
 *
 * Task C.CODEX Round 2 Finding 1 (CRITICAL) — /api/entries/save post-insert
 * recheck must three-branch on the recheck result, NOT collapse error
 * outcomes into the tombstone-compensation branch.
 *
 * Bug class:
 *   The R1 TOCTOU compensating-recheck added in commit 45f4142 destructured
 *   only `data: stillActive` from the post-insert `food_library_items`
 *   SELECT. Supabase resolves with `{ data, error }` — transient PostgREST /
 *   RLS / schema failures land in `error` and leave `data === null`. The
 *   destructure swallows `error`, so the route mistakes a read blip for a
 *   confirmed tombstone, fires the compensating DELETE, and returns 404 to
 *   the client. End result:
 *     - The legitimately-inserted entry is permanently deleted.
 *     - The infrastructure failure is silently masked as user/action state.
 *     - Lesson #9 violation (never swallow pg errors).
 *
 * Fix (mirrors `/api/library/[id]/log-now` R2 fix, route.ts:411-505):
 *   Three branches on the recheck result —
 *     1. error !== null            → Sentry capture (component:'entries-save',
 *                                    phase:'post_insert_recheck') + 500
 *                                    `{ error: 'recheck_failed' }`. NO
 *                                    compensating delete.
 *     2. error === null && !data   → confirmed tombstone landed in the
 *                                    SELECT/INSERT gap → existing R1 path
 *                                    (compensating delete + uniform 404).
 *     3. error === null && data    → happy path → counter bump + 200.
 *
 * Coverage:
 *   - Test A: recheck error path → 500 `recheck_failed` + Sentry tagged +
 *     NO compensating delete + entry survives.
 *   - Test B: tombstone path → 404 `library_item_not_found` + compensating
 *     delete fires (regression guard on existing R1 contract).
 *   - Test C: happy path → 200 + entry persists + counter bump fires.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-a';
const LIBRARY_ITEM_ID = '88888888-8888-4888-8888-888888888888';
const CLIENT_ID = '77777777-7777-4777-8777-777777777777';
const INSERTED_ENTRY_ID = 'entry-recheck-test';

type RecheckResult = {
  data: { id: string } | null;
  error: { code?: string; message?: string } | null;
};

/**
 * Build the supabase mock with two ownership lookups (pre-insert + post-insert
 * recheck) and a configurable compensating-delete + counter-bump path.
 */
function makeMock(opts: {
  recheckResults: RecheckResult[];
  captureExceptionMock: ReturnType<typeof vi.fn>;
  compensateDeleteCalls: Array<{ column: string; value: unknown }>;
  bumpUpdateCalls: number[];
}) {
  let libSelectCount = 0;
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
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
        const idx = libSelectCount;
        libSelectCount += 1;
        const isPreInsert = idx === 0;
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
                if (isPreInsert) {
                  // Pre-insert ownership probe — row is active, owned by USER_ID.
                  return { data: { id: LIBRARY_ITEM_ID }, error: null };
                }
                // Post-insert recheck — controlled by recheckResults[0].
                return opts.recheckResults[0] ?? { data: null, error: null };
              },
            };
            return chain;
          },
          // Counter bump UPDATE (happy path only).
          update: () => {
            opts.bumpUpdateCalls.push(libSelectCount);
            const chain = {
              eq() {
                return chain;
              },
              is() {
                return chain;
              },
              then(resolve: (v: { error: null }) => void) {
                resolve({ error: null });
              },
            };
            return chain;
          },
        };
      }
      if (table === 'food_entries') {
        return {
          select: (cols?: string, _opts?: { count?: string; head?: boolean }) => {
            // Idempotency probe (pre-insert) and COUNT (post-insert bump derive).
            // The chain is `select().eq().eq()` then `.maybeSingle()` OR a
            // bare `await` (when `head: true` is used for count). We return a
            // thenable + maybeSingle to satisfy both shapes.
            const chain = {
              eq() {
                return chain;
              },
              async maybeSingle() {
                return { data: null, error: null };
              },
              then(resolve: (v: { count: number; error: null }) => void) {
                resolve({ count: 1, error: null });
              },
            };
            return chain;
          },
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: INSERTED_ENTRY_ID,
                  user_id: USER_ID,
                  client_id: CLIENT_ID,
                  logged_at: '2026-04-23T06:00:00Z',
                  meal_category: 'breakfast',
                  source: 'library',
                  library_item_id: LIBRARY_ITEM_ID,
                  items: [],
                },
                error: null,
              }),
            }),
          }),
          // Compensating delete — Recorded so tests can assert it did/didn't fire.
          delete: () => {
            const chain = {
              eq(column: string, value: unknown) {
                opts.compensateDeleteCalls.push({ column, value });
                return chain;
              },
              then(resolve: (v: { error: null; count: number }) => void) {
                resolve({ error: null, count: 1 });
              },
            };
            return chain;
          },
        };
      }
      return {};
    },
  };
}

function makeRequest() {
  return new Request('http://kalori.test/api/entries/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      logged_at: '2026-04-23T06:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: LIBRARY_ITEM_ID,
      items: [
        {
          name: 'Race Pho',
          portion: 400,
          unit: 'g',
          kcal: 500,
        },
      ],
    }),
  });
}

describe('POST /api/entries/save — Codex R2 Finding 1: post-insert recheck error handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('@sentry/nextjs');
  });

  it('A) recheck returns { data:null, error:<pg> } → 500 recheck_failed + Sentry + NO compensating delete', async () => {
    // The CRITICAL adversarial case. Before the fix, the route mistook this
    // for a tombstone, fired the compensating DELETE, and returned 404 — the
    // user's legitimately-inserted entry would be permanently lost.
    //
    // After the fix the route MUST:
    //   1. Return 500 with `{ error: 'recheck_failed' }`
    //   2. Sentry-capture with phase=post_insert_recheck + component=entries-save
    //   3. NOT issue ANY compensating delete (data integrity guarantee)
    const captureExceptionMock = vi.fn();
    const compensateDeleteCalls: Array<{ column: string; value: unknown }> = [];
    const bumpUpdateCalls: number[] = [];

    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () =>
        makeMock({
          recheckResults: [
            { data: null, error: { code: 'PGRST500', message: 'connection_failure' } },
          ],
          captureExceptionMock,
          compensateDeleteCalls,
          bumpUpdateCalls,
        }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('recheck_failed');

    // Sentry capture — operator must be able to audit potentially-orphaned
    // `food_entries` rows by `route` + `phase` tags.
    expect(captureExceptionMock).toHaveBeenCalled();
    const firstCall = captureExceptionMock.mock.calls[0]!;
    const ctx = firstCall[1] as { tags?: Record<string, string> };
    expect(ctx.tags?.phase).toBe('post_insert_recheck');
    expect(ctx.tags?.component).toBe('entries-save');

    // CRITICAL — NO compensating delete. The inserted entry survives the
    // read blip. If a delete happens here it's silent data loss.
    expect(compensateDeleteCalls).toHaveLength(0);
    // No counter bump either — control flow returned 500 before bump.
    expect(bumpUpdateCalls).toHaveLength(0);
  });

  it('B) recheck returns { data:null, error:null } → 404 + compensating delete fires (R1 tombstone path preserved)', async () => {
    // Regression guard: the R1 compensating-delete contract MUST still fire
    // on a confirmed tombstone (data:null + error:null). Without this
    // assertion the R2 fix could over-correct and disable the tombstone
    // branch entirely.
    const captureExceptionMock = vi.fn();
    const compensateDeleteCalls: Array<{ column: string; value: unknown }> = [];
    const bumpUpdateCalls: number[] = [];

    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () =>
        makeMock({
          recheckResults: [{ data: null, error: null }],
          captureExceptionMock,
          compensateDeleteCalls,
          bumpUpdateCalls,
        }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('library_item_not_found');

    // Compensating delete MUST fire — keyed on (id, user_id).
    expect(compensateDeleteCalls).toContainEqual({
      column: 'id',
      value: INSERTED_ENTRY_ID,
    });
    expect(compensateDeleteCalls).toContainEqual({
      column: 'user_id',
      value: USER_ID,
    });
    // No counter bump on the tombstone branch.
    expect(bumpUpdateCalls).toHaveLength(0);
  });

  it('C) recheck returns { data:<row>, error:null } → 200 + entry persists + NO compensating delete', async () => {
    // Happy path. Recheck confirms row still active → counter bump fires →
    // 200 success. NO compensating delete; entry is the source of truth.
    const captureExceptionMock = vi.fn();
    const compensateDeleteCalls: Array<{ column: string; value: unknown }> = [];
    const bumpUpdateCalls: number[] = [];

    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () =>
        makeMock({
          recheckResults: [{ data: { id: LIBRARY_ITEM_ID }, error: null }],
          captureExceptionMock,
          compensateDeleteCalls,
          bumpUpdateCalls,
        }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entry: { id: string } };
    expect(body.entry?.id).toBe(INSERTED_ENTRY_ID);

    // No compensating delete. Counter bump fired (the recheck confirmed
    // the library row is still active so log_count must be re-derived).
    expect(compensateDeleteCalls).toHaveLength(0);
    expect(bumpUpdateCalls.length).toBeGreaterThan(0);
  });
});
