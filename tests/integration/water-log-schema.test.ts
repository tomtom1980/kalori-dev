/**
 * @vitest-environment node
 *
 * Task 3.7 regression — water_log column name drift guard.
 *
 * Context: the migration at `supabase/migrations/0003_food_schema.sql` and the
 * architecture spec at `Planning/architecture.md §2.6` both declare the
 * `water_log` calendar column as `date`. The Phase 3 app code shipped with
 * `logged_on` instead, so every production read / write failed with PostgREST
 * `42703 column water_log.logged_on does not exist`:
 *
 *   - Dashboard SSR 500 on `fetchTodayWater` (every user, every request).
 *   - `POST /api/water/log` 500 on the first `INSERT` (quick-add broken).
 *
 * The bug survived Phase 3 because:
 *   - Unit + component specs mock `@/lib/supabase/server`, so they never touch
 *     real PostgREST — the fabricated rows shaped around `logged_on` flow
 *     straight back to the reader.
 *   - The dashboard E2E (F-TEST-4) is currently skipped.
 *
 * This spec closes that gap: it boots the real `@/lib/supabase/server` client
 * wired to the RLS harness's user JWT and exercises both halves of the water
 * code path — POST then SELECT — against the live `kalori-dev` schema. When
 * the code drifts from the migration (as it did before the 3.7 rename), the
 * test fails with the authentic `42703` error rather than silently passing
 * against a schema-free mock.
 *
 * Local skip gate matches the rest of the RLS-backed suite: when
 * SUPABASE_TEST_* is absent, `describe.skip` keeps `pnpm test` green locally
 * without a live DB.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('water_log schema-drift guard (real PostgREST)', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness.teardown();
  }, 30_000);

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
  });

  it('POST /api/water/log inserts a row against the real water_log schema', async () => {
    const revalidatedTags: string[] = [];

    // Inject the RLS harness's authed user client so the route handler's
    // `.auth.getUser()` + `.from('water_log').insert(...)` both hit real
    // PostgREST with the user's JWT — exactly the production code path,
    // minus the cookies() cookie bridge (which cannot run in a Vitest node
    // environment).
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => harness.userA.client,
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: (tag: string) => {
        revalidatedTags.push(tag);
      },
    }));

    const { POST } = await import('@/app/api/water/log/route');

    const clientId = crypto.randomUUID();
    const loggedOn = new Date().toISOString().slice(0, 10);
    const res = await POST(
      new Request('http://kalori.test/api/water/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          unit: 'glass',
          count: 1,
          logged_on: loggedOn,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      row: { id: string; date: string; count: number; unit: string };
      replayed?: boolean;
    };
    expect(json.replayed).toBeUndefined();
    // The DB column is `date` per migration 0003. If code drifted to
    // `logged_on`, PostgREST would have returned 42703 and the route would
    // have 500'd long before this assertion.
    expect(json.row.date).toBe(loggedOn);
    expect(json.row.count).toBe(1);
    expect(json.row.unit).toBe('glass');
    expect(revalidatedTags).toContain(`user:${harness.userA.id}:entries:${loggedOn}`);
  }, 30_000);

  it('fetchTodayWater returns the real water_log row shape the aggregator expects', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => harness.userA.client,
    }));

    // Seed a known row via admin (bypasses RLS, isolates this spec from the
    // POST spec's row churn and from the JWT client's RLS posture).
    const clientId = crypto.randomUUID();
    const loggedOn = new Date().toISOString().slice(0, 10);
    const { error: seedErr } = await harness.admin.from('water_log').insert({
      user_id: harness.userA.id,
      client_id: clientId,
      date: loggedOn,
      count: 2,
      unit: 'bottle',
    });
    expect(seedErr).toBeNull();

    const { fetchTodayWater } = await import('@/lib/dashboard/fetch');
    const rows = await fetchTodayWater(harness.userA.id, loggedOn);

    // Rows must carry `date` (matching migration 0003). A code path that
    // selects `logged_on` would have thrown `water_fetch_failed` before
    // returning.
    const seeded = rows.find((r) => r.client_id === clientId);
    expect(seeded).toBeDefined();
    expect(seeded!.date).toBe(loggedOn);
    expect(seeded!.count).toBe(2);
    expect(seeded!.unit).toBe('bottle');
  }, 30_000);
});
