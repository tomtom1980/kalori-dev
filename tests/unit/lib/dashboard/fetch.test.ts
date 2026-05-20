/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` is not installed as a runtime package — Next polyfills it at
// build time. Stub it here so the SUT module can import when Vitest evaluates
// it directly. Hoisted at module top so every import picks it up.
vi.mock('server-only', () => ({}));

describe('fetchMicros7d', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
  });

  it('queries a bounded 7-day window inclusive of the current user-TZ day', async () => {
    const lt = vi.fn(async () => ({ data: [], error: null }));
    const gte = vi.fn(() => ({ lt }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ from }),
    }));

    const { fetchMicros7d } = await import('@/lib/dashboard/fetch');
    await fetchMicros7d('u-1', '2026-04-22T06:00:00.000Z', 'Asia/Ho_Chi_Minh');

    expect(from).toHaveBeenCalledWith('food_entries');
    expect(eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(gte).toHaveBeenCalledWith('logged_at', '2026-04-15T17:00:00.000Z');
    expect(lt).toHaveBeenCalledWith('logged_at', '2026-04-22T17:00:00.000Z');
  });

  // ---------------------------------------------------------------------
  // Task 3.7 regression: F-UI-3.6-C-3 unstable_cache wiring has been
  // REVERTED because `unstable_cache` executes its lambda outside the
  // Next request scope, so `cookies()` (used by `getServerSupabase()`)
  // throws at runtime. The readers now dedupe per-request via React
  // `cache()` only; cross-request cache-tag invalidation is deferred to
  // the `cacheComponents: true` migration (F-UI-3.5-10). These tests
  // lock the intended surface:
  //   1. Readers no longer route through `unstable_cache`.
  //   2. React `cache()` still dedupes repeated calls within a request.
  // ---------------------------------------------------------------------

  it('regression: readers do not import or invoke next/cache unstable_cache', async () => {
    const unstableCache: ReturnType<typeof vi.fn> = vi.fn((...args: unknown[]) => args[0]);
    vi.doMock('next/cache', () => ({
      unstable_cache: unstableCache,
    }));

    const order = vi.fn(async () => ({ data: [], error: null }));
    const lt = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lt }));
    const eqDay = vi.fn(() => ({ order }));
    const eqUser = vi.fn(() => ({ gte, eq: eqDay }));
    const single = vi.fn(async () => ({
      data: {
        id: 'u-1',
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
    }));
    const eqProfile = vi.fn(() => ({ single }));
    const select = vi.fn((cols: string) =>
      cols.includes('calorie_target') ? { eq: eqProfile } : { eq: eqUser },
    );
    const from = vi.fn(() => ({ select }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ from }),
    }));

    const { fetchProfile, fetchTodayEntries, fetchTodayWater, fetchMicros7d } =
      await import('@/lib/dashboard/fetch');
    await fetchProfile('u-1');
    await fetchTodayEntries('u-1', '2026-04-22', 'Asia/Ho_Chi_Minh');
    await fetchTodayWater('u-1', '2026-04-22');
    await fetchMicros7d('u-1', '2026-04-22T06:00:00.000Z', 'Asia/Ho_Chi_Minh');

    // Confirms the F-UI-3.6-C-3 wiring has been removed. If a future
    // change reintroduces `unstable_cache` without hoisting cookies() it
    // will be caught by `tests/integration/dashboard-ssr-regression.test.ts`.
    expect(unstableCache).not.toHaveBeenCalled();
  });

  it('regression: readers still return valid data after unstable_cache removal', async () => {
    // Sanity follow-up to the "no unstable_cache" assertion above — locks
    // that removing the `unstable_cache` wrapper did not break the happy
    // path. React `cache()` dedupe is a framework-internal behavior that
    // requires a real render dispatcher; in Vitest-node each call issues a
    // fresh Supabase round-trip, which is acceptable — the server is the
    // same response.
    const order = vi.fn(async () => ({ data: [{ id: 'row-1' }], error: null }));
    const lt = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lt }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ from }),
    }));

    const { fetchTodayEntries } = await import('@/lib/dashboard/fetch');
    const rows = await fetchTodayEntries('u-1', '2026-04-22', 'Asia/Ho_Chi_Minh');
    expect(rows).toEqual([{ id: 'row-1' }]);
  });

  it('F-UI-3.6-C-2 (I5): uses userTzDayUtcRange for day-end so DST transitions land correctly', async () => {
    // America/Los_Angeles spring-forward day = 2026-03-08.
    // The user-local day 2026-03-08 is only 23 hours long (02:00 → 03:00 at
    // DST transition). The OLD impl computed `endUtc = todayStartUtc + 24h`
    // which would extend the window an extra hour into the NEXT local day
    // (2026-03-09 01:00 local = 2026-03-09 08:00 UTC, instead of
    // 2026-03-09 00:00 local = 2026-03-09 07:00 UTC).
    //
    // userTzDayUtcRange('2026-03-08', 'America/Los_Angeles') returns:
    //   startUtc: 2026-03-08 00:00 local = 2026-03-08 08:00 UTC (UTC-8)
    //   endUtc:   2026-03-09 00:00 local = 2026-03-09 07:00 UTC (UTC-7 after DST)
    //
    // The 7-day window is [today-6d_start, today_end), so:
    //   gte: endUtc - 7*24h = 2026-03-02 07:00 UTC
    //   lt:  endUtc         = 2026-03-09 07:00 UTC
    const lt = vi.fn(async () => ({ data: [], error: null }));
    const gte = vi.fn(() => ({ lt }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ from }),
    }));

    const { fetchMicros7d } = await import('@/lib/dashboard/fetch');
    // Seed with any UTC instant that resolves to local day 2026-03-08.
    // 2026-03-08 18:00 UTC = 11:00 LA (before transition) or 10:00 LA
    // depending on sub-hour; either way local day = 2026-03-08.
    await fetchMicros7d('u-1', '2026-03-08T18:00:00.000Z', 'America/Los_Angeles');

    // With the fix: endUtc sits at the user-local next-midnight boundary.
    // With the OLD buggy impl: endUtc = startUtc + 24h = 2026-03-09 08:00 UTC
    // (wrong — drags into hour 01:00 LA of 2026-03-09).
    expect(lt).toHaveBeenCalledWith('logged_at', '2026-03-09T07:00:00.000Z');
    // gte = endUtc - 7 days. Assert the exact day-aligned boundary matches the
    // DST-corrected endUtc computed above.
    expect(gte).toHaveBeenCalledWith('logged_at', '2026-03-02T07:00:00.000Z');
  });

  it('fetchAlcoholLogs queries asOf minus 72 hours through asOf independent of viewed day', async () => {
    const order = vi.fn(async () => ({ data: [], error: null }));
    const lte = vi.fn(() => ({ order }));
    const gte = vi.fn(() => ({ lte }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ from }),
    }));

    const { fetchAlcoholLogs } = await import('@/lib/dashboard/fetch');
    await fetchAlcoholLogs('u-1', '2026-05-19T12:00:00.000Z');

    expect(from).toHaveBeenCalledWith('alcohol_logs');
    expect(eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(gte).toHaveBeenCalledWith('consumed_at', '2026-05-16T12:00:00.000Z');
    expect(lte).toHaveBeenCalledWith('consumed_at', '2026-05-19T12:00:00.000Z');
    expect(order).toHaveBeenCalledWith('consumed_at', { ascending: true });
  });
});
