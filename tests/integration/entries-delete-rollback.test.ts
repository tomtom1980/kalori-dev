/**
 * @vitest-environment node
 *
 * Task 3.4 AC7 (F3) — server-rejected DELETE rollback contract (integration).
 *
 * Purpose: prove the `/api/entries/[id]` DELETE route returns a non-2xx
 * response when the underlying DB delete fails, and does NOT fire
 * `revalidateTag` on that failure path. The client-side reaction (push
 * `delete-failed` toast with the `undoToastDeleteRestored` copy) is wired
 * in `ConfirmationScreen.tsx` and asserted at the component level in
 * `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`.
 *
 * Together the two test levels close AC7: the route returns the rejection
 * signal here; the client surfaces the restored copy there.
 *
 * Pattern mirrors `entries-save-cross-user-collision.test.ts`:
 *   - @vitest-environment node
 *   - vi.resetModules + vi.doMock('@/lib/supabase/server')
 *   - vi.doMock('next/cache') to spy revalidateTag
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DELETE /api/entries/[id] — server rejection does not invalidate cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('500 when DB delete errors; revalidateTag NOT called on failure', async () => {
    const rowId = '33333333-3333-4333-8333-333333333333';
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    // The route performs:
    //   1. SELECT food_entries (exists check + logged_at).
    //   2. SELECT profiles.timezone.
    //   3. DELETE food_entries (this is where we inject the failure).
    //   4. revalidateTag(...) — MUST be skipped on failure.
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'food_entries') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: rowId,
                        logged_at: '2026-04-21T10:00:00.000Z',
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              delete: () => ({
                eq: () => ({
                  eq: async () => ({
                    data: null,
                    error: { code: 'db_error', message: 'simulated failure' },
                  }),
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { timezone: 'Asia/Ho_Chi_Minh' },
                    error: null,
                  }),
                  maybeSingle: async () => ({
                    data: { deleting_at: null },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
      }),
    }));

    const { DELETE } = await import('@/app/api/entries/[id]/route');
    const res = await DELETE(
      new Request(`http://kalori.test/api/entries/${rowId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: rowId }) },
    );

    // Contract: route returns 500 when DB delete errors.
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('db_error');
    // Contract: no cache-tag invalidation on failure — the row is still
    // persisted, so the dashboard bucket must remain consistent with DB state.
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('404 when RLS hides the row; revalidateTag NOT called', async () => {
    const rowId = '44444444-4444-4444-8444-444444444444';
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    // RLS-filtered: row invisible to this user.
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
      }),
    }));

    const { DELETE } = await import('@/app/api/entries/[id]/route');
    const res = await DELETE(
      new Request(`http://kalori.test/api/entries/${rowId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: rowId }) },
    );

    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
