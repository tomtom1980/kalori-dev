/**
 * @vitest-environment node
 *
 * Task 3.4 AC10 (integration) — `/api/entries/save` idempotency round-trip.
 *
 * Contract: two POSTs to the route with the SAME `client_id` from the SAME
 * user MUST yield exactly 1 stored row. The second POST is served from the
 * pre-insert SELECT replay branch and returns 200 + `replayed: true` +
 * identical `entry.id`.
 *
 * Why at integration level when `entries-save.test.ts` already unit-tests the
 * 23505 replay branch in isolation: AC10 names this file explicitly, and the
 * value-add is the persistence-of-state across two calls. Unit tests stub
 * the existing-row read per iteration; here we hold a single in-closure
 * Map<client_id, row> that spans both POSTs, so the route's SELECT/INSERT
 * contract is exercised end-to-end with a single backing store. This matches
 * the pattern in `entries-save-cross-user-collision.test.ts` (two POSTs, one
 * mock).
 *
 * R1: the route is invoked directly via its `POST` export (server side). The
 * R1 client-side contract (authFetch / authPost) is asserted separately in
 * `entries-save-refresh.test.ts`; here we isolate the idempotency guarantee
 * from the refresh wrapper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('POST /api/entries/save — idempotency round-trip (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('two POSTs with same client_id → 1 stored row; second response replayed=true with same id', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222';
    const validBody = {
      client_id: clientId,
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    } as const;

    // Single in-closure store that persists across both POSTs.
    const store = new Map<string, Row>(); // key = `${user_id}:${client_id}`
    const calls = { insertCount: 0, selectCount: 0, revalidated: [] as string[] };

    const from = vi.fn((table: string) => {
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
      if (table === 'food_entries') {
        let lookupUserId = '';
        let lookupClientId = '';
        return {
          select: () => ({
            eq: (k: string, v: string) => {
              if (k === 'user_id') lookupUserId = v;
              return {
                eq: (k2: string, v2: string) => {
                  if (k2 === 'client_id') lookupClientId = v2;
                  return {
                    maybeSingle: async () => {
                      calls.selectCount += 1;
                      const key = `${lookupUserId}:${lookupClientId}`;
                      return { data: store.get(key) ?? null, error: null };
                    },
                  };
                },
              };
            },
          }),
          insert: (payload: Row) => ({
            select: () => ({
              single: async () => {
                const userId = String(payload.user_id);
                const cid = String(payload.client_id);
                const key = `${userId}:${cid}`;
                // If race beats us, return 23505 so the route re-SELECTs.
                if (store.has(key)) {
                  return {
                    data: null,
                    error: { code: '23505', message: 'duplicate key' },
                  };
                }
                const row: Row = {
                  id: `row-${store.size + 1}`,
                  ...payload,
                };
                store.set(key, row);
                calls.insertCount += 1;
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from,
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');

    const buildReq = () =>
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

    const res1 = await POST(buildReq());
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as { entry: Row; replayed?: boolean };
    expect(json1.entry).toBeDefined();
    expect(json1.replayed).toBeUndefined();

    const res2 = await POST(buildReq());
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { entry: Row; replayed?: boolean };
    expect(json2.replayed).toBe(true);

    // Single row stored after two POSTs — the I11 contract.
    expect(store.size).toBe(1);
    expect(calls.insertCount).toBe(1);

    // Both responses reference the same row id.
    expect(json2.entry.id).toBe(json1.entry.id);

    // revalidateTag fires on both the fresh insert AND the replay (idempotent
    // tag write is cheap and keeps the dashboard bucket warm).
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-21');
    // Task 4.5 R1 Pass 2 C2: 7 revalidations per path (1 entries + 6 progress
    // ranges via `revalidateAllProgressRanges` helper). Two paths (insert +
    // replay) = 14 total revalidateTag calls.
    expect(revalidateTag).toHaveBeenCalledTimes(14);
    // And the progress tags appear in the captured log.
    expect(calls.revalidated).toContain('user:u-1:progress:24h');
    expect(calls.revalidated).toContain('user:u-1:progress:7d');
    expect(calls.revalidated).toContain('user:u-1:progress:30d');
  });

  // I6 — Per I11, `client_id` is the idempotency anchor; content is NOT
  // hashed. A 2nd POST with the SAME `client_id` but DIFFERENT body bytes
  // MUST return the ORIGINAL row (200 replayed: true) — the new body is
  // silently dropped. This matches the design-doc §18.2 contract: clients
  // that want to persist edited content MUST mint a fresh `client_id` for
  // the edit. Encoded as an integration test so the contract is enforced
  // end-to-end through the route handler.
  it('same client_id + different body content → 200 replayed=true returning ORIGINAL row (content silently dropped per I11)', async () => {
    const clientId = '33333333-3333-4333-8333-333333333333';
    const originalBody = {
      client_id: clientId,
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    } as const;
    const editedBody = {
      ...originalBody,
      items: [{ name: 'eggs', portion: 3, unit: 'unit', kcal: 210 }], // edited!
    } as const;

    const store = new Map<string, Row>();
    const calls = { insertCount: 0 };

    const from = vi.fn((table: string) => {
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
      if (table === 'food_entries') {
        let lookupUserId = '';
        let lookupClientId = '';
        return {
          select: () => ({
            eq: (k: string, v: string) => {
              if (k === 'user_id') lookupUserId = v;
              return {
                eq: (k2: string, v2: string) => {
                  if (k2 === 'client_id') lookupClientId = v2;
                  return {
                    maybeSingle: async () => {
                      const key = `${lookupUserId}:${lookupClientId}`;
                      return { data: store.get(key) ?? null, error: null };
                    },
                  };
                },
              };
            },
          }),
          insert: (payload: Row) => ({
            select: () => ({
              single: async () => {
                const key = `${String(payload.user_id)}:${String(payload.client_id)}`;
                if (store.has(key)) {
                  return {
                    data: null,
                    error: { code: '23505', message: 'duplicate key' },
                  };
                }
                const row: Row = { id: 'row-orig', ...payload };
                store.set(key, row);
                calls.insertCount += 1;
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
        },
        from,
      }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const buildReq = (body: unknown) =>
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const res1 = await POST(buildReq(originalBody));
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as { entry: Row; replayed?: boolean };
    expect(json1.replayed).toBeUndefined();
    const storedItems = json1.entry.items as Array<{ kcal: number }>;
    expect(storedItems[0]?.kcal).toBe(140);

    const res2 = await POST(buildReq(editedBody));
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { entry: Row; replayed?: boolean };
    expect(json2.replayed).toBe(true);
    // CRITICAL — the replay response returns the ORIGINAL items (kcal: 140),
    // NOT the edited body (kcal: 210). I11 anchors idempotency on
    // `client_id`; content is discarded on replay.
    const replayedItems = json2.entry.items as Array<{
      kcal: number;
      portion: number;
    }>;
    expect(replayedItems[0]?.kcal).toBe(140);
    expect(replayedItems[0]?.portion).toBe(2);
    expect(calls.insertCount).toBe(1);
  });
});
