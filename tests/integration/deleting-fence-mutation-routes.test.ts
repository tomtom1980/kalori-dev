/**
 * @vitest-environment node
 *
 * Task 5.3 Codex Round 1 C3 — `profiles.deleting_at` mutation fence.
 *
 * Without a fence, the account-deletion cascade has a window between
 * Phase 0 (storage cleanup) and Phase 3 (auth.users delete) during which
 * concurrent mutations from other tabs / outbox replays / in-flight
 * requests can insert NEW rows or upload NEW thumbnails. Result:
 * orphaned storage objects + DB rows persist after auth.users is gone,
 * breaking the I9 "no DB residue" invariant.
 *
 * Fix:
 *   1. New column `profiles.deleting_at TIMESTAMPTZ NULL` (migration 0016).
 *      RLS-protected: users may READ but cannot WRITE (writes flow only
 *      through the cascade RPC under service-role).
 *   2. Cascade sets `deleting_at = now()` BEFORE storage cleanup
 *      (`lib/account/delete.ts`).
 *   3. Mutation routes check `deleting_at IS NULL` for the calling user;
 *      if set → HTTP 423 Locked.
 *
 * Test contract:
 *   - When the calling user's `profiles.deleting_at` is set, the
 *     `/api/entries/save` route returns HTTP 423 with `error:
 *     'account_deleting'`.
 *   - When the column is null, the route's normal happy-path proceeds (we
 *     test that the request is not rejected with 423).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = '33333333-3333-4333-8333-333333333333';

describe('Codex R1 C3 — profiles.deleting_at mutation fence', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('returns 423 Locked from /api/entries/save when calling user has deleting_at set', async () => {
    const validBody = {
      client_id: '44444444-4444-4444-8444-444444444444',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols: string) => {
            // The fence helper SELECTs `deleting_at` (or `*`); the route's
            // own profile read SELECTs only `timezone`. Distinguish by the
            // requested columns so the same mock serves both.
            if (cols.includes('deleting_at')) {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { deleting_at: '2026-05-01T03:00:00Z' },
                    error: null,
                  }),
                  single: async () => ({
                    data: { deleting_at: '2026-05-01T03:00:00Z' },
                    error: null,
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                single: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      // No food_entries access expected — the fence rejects before then.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: TEST_USER_ID } },
            error: null,
          }),
        },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
    }));

    const routeMod = await import('@/app/api/entries/save/route');
    const req = new Request('http://localhost/api/entries/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await routeMod.POST(req);
    expect(res.status).toBe(423);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('account_deleting');
  });

  it('returns 503 from /api/entries/save when fence read errors (fail-closed, NEW-I1)', async () => {
    // Codex Round 2 NEW-I1: load-bearing deletion fence MUST fail closed.
    // When the DB read errors (timeout, connection drop, transient
    // unavailability), routes used to swallow it and proceed. That defeats
    // the fence on the exact code path that matters. Fix: helper throws
    // FenceReadError → routes catch + return 503 'deletion_state_unknown'.
    const validBody = {
      client_id: '66666666-6666-4666-8666-666666666666',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols: string) => {
            if (cols.includes('deleting_at')) {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { message: 'connection timeout' },
                  }),
                  single: async () => ({
                    data: null,
                    error: { message: 'connection timeout' },
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                single: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: TEST_USER_ID } },
            error: null,
          }),
        },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
    }));

    const routeMod = await import('@/app/api/entries/save/route');
    const req = new Request('http://localhost/api/entries/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await routeMod.POST(req);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('deletion_state_unknown');
  });

  it('returns 423 Locked from /api/ai/weekly-review when deleting_at is set (NEW-C3-gap)', async () => {
    // Codex Round 2 NEW-C3-gap — `weekly_reviews` is a user-owned table;
    // the route MUST run the fence before its upsert. R1 enumeration of
    // mutation routes missed this one.
    const validBody = {
      client_id: '77777777-7777-4777-8777-777777777777',
      week_start_on: '2026-04-20', // Monday
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: cols.includes('deleting_at')
                  ? { deleting_at: '2026-05-01T03:00:00Z' }
                  : { timezone: 'Asia/Ho_Chi_Minh' },
                error: null,
              }),
              single: async () => ({
                data: cols.includes('deleting_at')
                  ? { deleting_at: '2026-05-01T03:00:00Z' }
                  : { timezone: 'Asia/Ho_Chi_Minh' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        upsert: async () => ({ data: null, error: null }),
      };
    });

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: TEST_USER_ID } },
            error: null,
          }),
        },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      updateTag: vi.fn(),
    }));

    const routeMod = await import('@/app/api/ai/weekly-review/route');
    const req = new Request('http://localhost/api/ai/weekly-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await routeMod.POST(req);
    expect(res.status).toBe(423);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('account_deleting');
  });

  it('returns 200 happy path from /api/entries/save when deleting_at is null', async () => {
    const validBody = {
      client_id: '55555555-5555-4555-8555-555555555555',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    };

    const insertedRow = {
      id: 'new-entry-id',
      user_id: TEST_USER_ID,
      client_id: validBody.client_id,
      logged_at: validBody.logged_at,
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols: string) => {
            if (cols.includes('deleting_at')) {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { deleting_at: null },
                    error: null,
                  }),
                  single: async () => ({
                    data: { deleting_at: null },
                    error: null,
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                single: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { timezone: 'Asia/Ho_Chi_Minh' },
                  error: null,
                }),
              }),
            };
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
              single: async () => ({ data: insertedRow, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: TEST_USER_ID } },
            error: null,
          }),
        },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
    }));

    const routeMod = await import('@/app/api/entries/save/route');
    const req = new Request('http://localhost/api/entries/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const res = await routeMod.POST(req);
    // Critical assertion: status is NOT 423.
    expect(res.status).not.toBe(423);
  });
});
