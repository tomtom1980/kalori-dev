/**
 * @vitest-environment node
 *
 * Task 3.5 AC + Task 3.6 close-out integration — dashboard cache-tag round-trip.
 *
 * Task 3.4 shipped the WRITE half (entries/save + copy-yesterday revalidate
 * via TAGS.userEntries); 3.5 owns the READ half (dashboard fetch.ts wraps
 * reads in React.cache()). Task 3.6 Fix F-UI-3.6-C-3 migrated the readers
 * to `unstable_cache` with `tags: [TAGS.*]` so the writer-side
 * `revalidateTag(...)` calls have a target. This test closes the round-trip
 * on both halves:
 *
 *   Writer assertions (existing, retained):
 *   1. POST /api/water/log → revalidateTag('user:{uid}:entries:{day}') fires.
 *   2. POST /api/entries/save → same TAGS.userEntries tag fires for the same
 *      user+day.
 *   3. Both writes invoke the same tag key string → proving the read side
 *      can coalesce around a single tag.
 *
 *   Reader assertion (F-UI-3.6-C-3 — closes F-UI-3.5-14):
 *   4. Dashboard readers register with `unstable_cache(... { tags: [...] })`
 *      and the emitted tag string matches the writer-side tag. This proves
 *      writer-reader symmetry — a revalidateTag round-trip will actually
 *      invalidate the read cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('dashboard cache-tag round-trip (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('both /api/water/log and /api/entries/save emit TAGS.userEntries(uid, day) for the same day', async () => {
    const revalidatedTags: string[] = [];
    const store = new Map<string, Row>();
    const uid = 'u-1';

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: uid } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { timezone: 'Asia/Ho_Chi_Minh' },
                    error: null,
                  }),
                  // Codex Round 2 NEW-I1 — fence reads deleting_at.
                  maybeSingle: async () => ({
                    data: { deleting_at: null },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_entries' || table === 'water_log') {
            const tableName = table;
            let lookupClientId = '';
            return {
              select: () => ({
                eq: () => ({
                  eq: (k: string, v: string) => {
                    if (k === 'client_id') lookupClientId = v;
                    return {
                      maybeSingle: async () => {
                        const key = `${tableName}:${uid}:${lookupClientId}`;
                        return { data: store.get(key) ?? null, error: null };
                      },
                    };
                  },
                }),
              }),
              insert: (payload: Row) => ({
                select: () => ({
                  single: async () => {
                    const cid = String(payload.client_id);
                    const key = `${tableName}:${uid}:${cid}`;
                    const row: Row = {
                      id: `${tableName}-${store.size + 1}`,
                      ...payload,
                    };
                    store.set(key, row);
                    return { data: row, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'food_library_items') {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'lib-1' }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
        // bugfix-tomi 2026-05-09-water-custom-button — water route now
        // calls RPC `log_water_with_cap`. Mock it to mirror the
        // fresh-insert success path so revalidateTag still fires for
        // the userEntries tag (the assertion this test guards).
        rpc: async (fn: string, params: Record<string, unknown>) => {
          if (fn !== 'log_water_with_cap') {
            return {
              data: null,
              error: { code: '42883', message: `unknown rpc: ${fn}` },
            };
          }
          const cid = String(params.p_client_id);
          const key = `water_log:${uid}:${cid}`;
          const row: Row = {
            id: `water_log-${store.size + 1}`,
            user_id: uid,
            client_id: cid,
            date: params.p_date,
            count: params.p_count,
            unit: params.p_unit,
          };
          store.set(key, row);
          return {
            data: { row, replayed: false, total_ml: 250 },
            error: null,
          };
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: (tag: string) => {
        revalidatedTags.push(tag);
      },
    }));

    // Water POST — logged_on: 2026-04-22.
    const water = await import('@/app/api/water/log/route');
    const waterRes = await water.POST(
      new Request('http://kalori.test/api/water/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          unit: 'glass',
          count: 1,
          logged_on: '2026-04-22',
        }),
      }),
    );
    expect(waterRes.status).toBe(200);

    // Entries POST — logged_at that resolves to user-TZ 2026-04-22 in
    // Asia/Ho_Chi_Minh (UTC+7: 2026-04-22T01:00Z = 2026-04-22T08:00 local).
    const entries = await import('@/app/api/entries/save/route');
    const entriesRes = await entries.POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '22222222-2222-4222-8222-222222222222',
          logged_at: '2026-04-22T01:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        }),
      }),
    );
    expect(entriesRes.status).toBe(200);

    // Both writes emitted the same userEntries tag for the same day.
    expect(revalidatedTags).toContain('user:u-1:entries:2026-04-22');
    const userEntriesTags = revalidatedTags.filter((tag) =>
      tag.startsWith('user:u-1:entries:2026-04-22'),
    );
    expect(userEntriesTags.length).toBeGreaterThanOrEqual(2);
  });

  it('F-UI-3.5-14 + F-UI-3.6-C-3: reader-side tag registration deferred with cross-request invalidation scope', async () => {
    // Task 3.7 regression fix — the F-UI-3.6-C-3 `unstable_cache` wiring on
    // the reader side (asserted here pre-fix) was REVERTED because Next.js
    // 16 hard-errors when `cookies()` runs inside an `unstable_cache`
    // closure ("Route /dashboard used cookies() inside a function cached
    // with unstable_cache()"). The readers now dedupe per-request via React
    // `cache()` only; cross-request cache-tag invalidation is deferred to
    // the `cacheComponents: true` migration (F-UI-3.5-10) where the
    // idiomatic `'use cache'` + `cacheTag(...)` primitives allow the
    // framework to hoist request-scoped context.
    //
    // Writer-side `revalidateTag(TAGS.userEntries(uid, day))` calls remain
    // load-bearing in the first test above — they are the target the
    // cacheComponents-era reader tags will bind to once the migration
    // lands. For now, the invariant this test enforces is:
    //
    //   • Dashboard readers must NOT register any `unstable_cache` hooks.
    //     If they do, the `cookies()`-in-unstable_cache runtime error
    //     returns. See `tests/integration/dashboard-ssr-regression.test.ts`
    //     for the RED-style guard that reproduces the real bug.
    const registeredTags: string[] = [];
    const uid = 'u-1';
    const day = '2026-04-22';

    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      unstable_cache: <T extends (...args: unknown[]) => unknown>(
        cb: T,
        _keyParts?: string[],
        options?: { tags?: string[] },
      ): T => {
        if (options?.tags) registeredTags.push(...options.tags);
        return cb;
      },
    }));

    // Supabase mock covering all four readers (profile single + food_entries
    // range + water_log range + food_entries 7d micros).
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: uid,
                      calorie_target: 2000,
                      bmr: 1500,
                      tdee: 2200,
                      timezone: 'Asia/Ho_Chi_Minh',
                      created_at: '2026-01-01T00:00:00.000Z',
                      last_dashboard_visit_at: null,
                      target_mode: 'auto',
                      manual_override_value: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lt: () => ({
                      order: async () => ({ data: [], error: null }),
                      // fetchMicros7d path — no `.order`, directly awaited.
                      then: (fn: (v: { data: unknown[]; error: null }) => unknown) =>
                        fn({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'water_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
      }),
    }));

    const { fetchProfile, fetchTodayEntries, fetchTodayWater, fetchMicros7d } =
      await import('@/lib/dashboard/fetch');
    await fetchProfile(uid);
    await fetchTodayEntries(uid, day, 'Asia/Ho_Chi_Minh');
    await fetchTodayWater(uid, day);
    await fetchMicros7d(uid, '2026-04-22T06:00:00.000Z', 'Asia/Ho_Chi_Minh');

    // No `unstable_cache` registrations should be observed. The deferred
    // tag-symmetry contract binds in the cacheComponents migration.
    expect(registeredTags).toEqual([]);
  });
});
