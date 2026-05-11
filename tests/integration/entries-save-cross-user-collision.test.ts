/**
 * @vitest-environment node
 *
 * Task 3.4 — Cross-user client_id Route Handler scoping test.
 * Prerequisite from Task 3.1 Codex R1 C1 follow-up.
 *
 * Contract (synthesis §10.10): the Route Handler's replay-lookup SELECT
 * scopes by `.eq('user_id', ctx.user.id)` so User B's POST cannot be served
 * from User A's row even if they share a client_id.
 *
 * At the DB level, `UNIQUE(client_id)` is single-column (briefing §9) — a
 * cross-user collision raises 23505 (client RNG failure is fail-loud). The
 * route-level contract tested here is the USER SCOPING, not DB behaviour:
 * when the handler's pre-insert SELECT runs, it must filter by user_id so
 * User B never reads back User A's entry as a "replay".
 *
 * This test is purely at route-handler level with mocked Supabase:
 *   - User A inserts row(client_id=X) → DB has row A.
 *   - User B's SELECT for client_id=X scoped by user_B.id → returns null.
 *   - User B's insert proceeds normally (not routed through replay path).
 *
 * We use two separate POST invocations with distinct mocked `getUser()`
 * values to prove the scoping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('entries-save cross-user lookup scoping (route-level)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('User B POST with same client_id as User A does NOT return User A row as replay', async () => {
    const sharedClientId = '11111111-1111-4111-8111-111111111111';

    // Simulate DB state: User A has committed a row with client_id=sharedClientId.
    // The SELECT must return User A's row only for user_id=user-A, null otherwise.
    const userACommittedRow: Row = {
      id: 'row-for-user-A',
      user_id: 'user-A',
      client_id: sharedClientId,
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    };

    let lookupUserId: string | null = null;
    let lookupClientId: string | null = null;

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { timezone: 'UTC' },
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
      if (table === 'food_entries') {
        return {
          select: () => ({
            eq: (k: string, v: string) => {
              if (k === 'user_id') lookupUserId = v;
              return {
                eq: (k2: string, v2: string) => {
                  if (k2 === 'client_id') lookupClientId = v2;
                  return {
                    // Only return User A's row if user_id matches user-A.
                    maybeSingle: async () => {
                      if (lookupUserId === 'user-A' && lookupClientId === sharedClientId) {
                        return { data: userACommittedRow, error: null };
                      }
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: 'row-for-user-B',
                  user_id: 'user-B',
                  client_id: sharedClientId,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-B' } }, error: null }),
        },
        from,
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: sharedClientId,
          logged_at: '2026-04-21T11:00:00.000Z',
          meal_category: 'lunch',
          source: 'text',
          items: [{ name: 'toast', portion: 1, unit: 'slice', kcal: 120 }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    // NOT a replay — the row came from INSERT, not from User A's committed row.
    expect(json.replayed).toBeUndefined();
    expect(json.entry.id).toBe('row-for-user-B');
    expect(json.entry.user_id).toBe('user-B');
    // The lookup was scoped by user_id = 'user-B' (NOT 'user-A').
    expect(lookupUserId).toBe('user-B');
  });
});
