/**
 * @vitest-environment node
 *
 * Task 3.7 regression — dashboard readers must NOT call `cookies()`
 * from inside an `unstable_cache` closure.
 *
 * Next.js 16 throws at runtime with:
 *   > Route /dashboard used cookies() inside a function cached with
 *   > unstable_cache(). Accessing Dynamic data sources inside a cache
 *   > scope is not supported.
 *
 * The production bug (pre-fix): `lib/dashboard/fetch.ts` wraps the
 * four readers (`fetchProfile`, `fetchTodayEntries`, `fetchTodayWater`,
 * `fetchMicros7d`) in `unstable_cache(...)` and THEN calls
 * `getServerSupabase()` inside the cache lambda. `getServerSupabase()`
 * calls `cookies()` — so the real Next runtime throws.
 *
 * This test enforces the structural invariant:
 *   cookies() MUST be observable only in per-request context, never
 *   from a cached lambda's closure.
 *
 * It does so by replacing `unstable_cache` with a pass-through that
 * sets a module-scoped flag while the lambda is executing. A stubbed
 * `next/headers` `cookies()` throws if it is invoked while the flag
 * is set, reproducing Next 16's runtime behaviour.
 *
 * Phase 3 smoke gate regression — F-UI-3.6-C-3 follow-up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard readers — cookies()-outside-unstable_cache regression', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
  });

  afterEach(() => {
    vi.doUnmock('server-only');
    vi.doUnmock('next/cache');
    vi.doUnmock('next/headers');
    vi.doUnmock('@supabase/ssr');
  });

  /**
   * Shared harness: wires a fake `unstable_cache` that tracks when a cache
   * lambda is executing, plus a `next/headers` `cookies()` stub that throws
   * the EXACT Next 16 error if invoked inside that scope. A real-looking
   * `createServerClient` lets the readers exercise their Supabase query paths.
   */
  async function setupHarness() {
    let insideCache = false;
    const cookiesMock = vi.fn(async () => {
      if (insideCache) {
        throw new Error(
          'Route /dashboard used cookies() inside a function cached with unstable_cache(). Accessing Dynamic data sources inside a cache scope is not supported.',
        );
      }
      return {
        getAll: () => [],
        set: () => undefined,
      };
    });
    vi.doMock('next/headers', () => ({ cookies: cookiesMock }));

    vi.doMock('next/cache', () => ({
      unstable_cache:
        <T extends (...args: unknown[]) => unknown>(cb: T) =>
        async (...args: Parameters<T>) => {
          insideCache = true;
          try {
            return await cb(...args);
          } finally {
            insideCache = false;
          }
        },
    }));

    const createServerClientMock = vi.fn(() => ({
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
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
        throw new Error(`unknown table ${table}`);
      },
    }));
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: createServerClientMock,
    }));

    // Env vars required by getServerSupabase().
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';

    return { cookiesMock };
  }

  it('fetchProfile does not invoke cookies() from inside the cache scope', async () => {
    await setupHarness();
    const { fetchProfile } = await import('@/lib/dashboard/fetch');
    // The bug: current code throws the Next 16 runtime error here because
    // getServerSupabase() → cookies() is called inside the unstable_cache
    // lambda. After the fix the reader must hoist or eliminate the cache
    // wrapper so cookies() runs in per-request scope.
    await expect(fetchProfile('u-1')).resolves.toBeDefined();
  });

  it('fetchTodayEntries does not invoke cookies() from inside the cache scope', async () => {
    await setupHarness();
    const { fetchTodayEntries } = await import('@/lib/dashboard/fetch');
    await expect(fetchTodayEntries('u-1', '2026-04-22', 'Asia/Ho_Chi_Minh')).resolves.toBeDefined();
  });

  it('fetchTodayWater does not invoke cookies() from inside the cache scope', async () => {
    await setupHarness();
    const { fetchTodayWater } = await import('@/lib/dashboard/fetch');
    await expect(fetchTodayWater('u-1', '2026-04-22')).resolves.toBeDefined();
  });

  it('fetchMicros7d does not invoke cookies() from inside the cache scope', async () => {
    await setupHarness();
    const { fetchMicros7d } = await import('@/lib/dashboard/fetch');
    await expect(
      fetchMicros7d('u-1', '2026-04-22T06:00:00.000Z', 'Asia/Ho_Chi_Minh'),
    ).resolves.toBeDefined();
  });
});
