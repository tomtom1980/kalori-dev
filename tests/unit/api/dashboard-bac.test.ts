/**
 * @vitest-environment node
 *
 * `GET /api/dashboard/bac` — widget-only BAC refresh source for the
 * `<BacTracker />` client widget. Replaces the previous `router.refresh()`
 * full-RSC re-stream (Bug D fix) so the user only sees the BAC value spin
 * while every other dashboard island stays still.
 *
 * Contract:
 *   - Auth required via `requireProfileOrJson401` (Task A.3 fence). Status
 *     codes therefore follow the fence contract:
 *       - unauthenticated     → 401 + `{ error: 'unauthenticated' }`
 *       - orphan profile      → 422 + `{ error: 'profile_lookup_failed' }`
 *       - lookup error        → 503 + `{ error: 'profile_lookup_unavailable' }`
 *   - On happy path: 200 + `{ value: number, calculatedAt: ISO string }`,
 *     bit-identical shape to `DashboardSnapshot['bac']` so the widget can
 *     drop the payload straight into its local state.
 *   - Calculation pipeline mirrors `lib/dashboard/aggregate.ts` (calls
 *     `calculateBac({logs, profile, asOf})` on logs fetched via
 *     `fetchAlcoholLogs(userId, asOf)`) — server-side `asOf` is
 *     `new Date().toISOString()` (never trusted from the client).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

interface BuildMockOpts {
  user?: { id: string } | null;
  profileRow?: Row | null;
  profileError?: { message: string } | null;
  /** Rows returned from the `alcohol_logs` SELECT. */
  alcoholRows?: Row[];
  /** Rows returned from the second `profiles` SELECT (fetchProfile). */
  fetchProfileRow?: Row | null;
}

function buildMocks(opts: BuildMockOpts = {}) {
  // Fence — first profiles SELECT via `.from('profiles').select(cols).eq('id', uid).maybeSingle()`.
  const fenceProfileRow =
    opts.profileRow === undefined
      ? {
          id: 'u-1',
          onboarding_completed_at: '2026-01-01T00:00:00.000Z',
          bio_sex: 'male',
          current_weight_kg: 75,
        }
      : opts.profileRow;
  // Second profiles SELECT — full Profile row (fetchProfile).
  const fetchProfileRow =
    opts.fetchProfileRow === undefined
      ? {
          id: 'u-1',
          calorie_target: 2000,
          bmr: 1500,
          tdee: 2000,
          bio_sex: 'male',
          current_weight_kg: 75,
          timezone: 'Asia/Ho_Chi_Minh',
          created_at: '2026-01-01T00:00:00.000Z',
          last_dashboard_visit_at: null,
          target_mode: 'auto',
          manual_override_value: null,
        }
      : opts.fetchProfileRow;

  // Counter so fence (first call) returns maybeSingle shape and fetchProfile
  // (second call) returns single shape.
  let profileSelectCount = 0;
  const profilesTable = {
    select: () => ({
      eq: () => {
        profileSelectCount += 1;
        if (profileSelectCount === 1) {
          // Fence path
          return {
            maybeSingle: async () => ({
              data: fenceProfileRow,
              error: opts.profileError ?? null,
            }),
          };
        }
        // fetchProfile path
        return {
          single: async () => ({
            data: fetchProfileRow,
            error: null,
          }),
        };
      },
    }),
  };

  // alcohol_logs SELECT chain: .select().eq().gte().lte().order() — final
  // await yields { data, error }.
  const alcoholRows = opts.alcoholRows ?? [];
  const alcoholOrderThenable = {
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: alcoholRows, error: null }),
  };
  const alcoholTable = {
    select: () => ({
      eq: () => ({
        gte: () => ({
          lte: () => ({
            order: () => alcoholOrderThenable,
          }),
        }),
      }),
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profilesTable;
    if (table === 'alcohol_logs') return alcoholTable;
    throw new Error(`unknown table: ${table}`);
  });

  const userValue = opts.user === undefined ? { id: 'u-1' } : opts.user;
  const getUser = vi.fn(async () => ({
    data: { user: userValue },
    error: userValue ? null : { message: 'no session' },
  }));

  return { from, getUser };
}

describe('GET /api/dashboard/bac', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('server-only');
    vi.useRealTimers();
  });

  async function get(): Promise<Response> {
    const { GET } = await import('@/app/api/dashboard/bac/route');
    return GET();
  }

  it('returns 200 with value:0 and calculatedAt ISO when user has no alcohol logs', async () => {
    const { from, getUser } = buildMocks({ alcoholRows: [] });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { value: number; calculatedAt: string };
    expect(json.value).toBe(0);
    expect(typeof json.calculatedAt).toBe('string');
    // calculatedAt must be a valid ISO string parsable by `new Date()`.
    expect(Number.isFinite(new Date(json.calculatedAt).getTime())).toBe(true);
  });

  it('returns 200 with positive BAC when user has recent alcohol logs', async () => {
    // 20g of ethanol consumed 5 minutes before `asOf` should produce a small
    // positive BAC for a 75kg male (Widmark r=0.68). The exact value comes
    // from `calculateBac` — the test asserts >0 and the same value the pure
    // function would have produced for the same inputs.
    vi.useFakeTimers();
    const now = new Date('2026-05-19T10:00:00.000Z');
    vi.setSystemTime(now);

    const alcoholRows = [
      {
        id: 'al-1',
        user_id: 'u-1',
        entry_id: 'e-1',
        volume_ml: 200,
        abv_percent: 12.5,
        alcohol_grams: 20,
        consumed_at: '2026-05-19T09:55:00.000Z',
        created_at: '2026-05-19T09:55:30.000Z',
      },
    ];
    const { from, getUser } = buildMocks({ alcoholRows });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { value: number; calculatedAt: string };
    expect(json.value).toBeGreaterThan(0);
    expect(json.calculatedAt).toBe(now.toISOString());

    // Sanity check the value is consistent with calculateBac for the same
    // input — proves the route is a faithful proxy for the aggregate path.
    const { calculateBac } = await import('@/lib/alcohol/bac');
    const expected = calculateBac({
      logs: alcoholRows.map((r) => ({
        alcohol_grams: r.alcohol_grams as number,
        consumed_at: r.consumed_at as string,
      })),
      profile: { bio_sex: 'male', current_weight_kg: 75 },
      asOf: now.toISOString(),
    });
    expect(json.value).toBe(expected);
  });

  it('returns 401 unauthenticated when no session', async () => {
    const { from, getUser } = buildMocks({ user: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('unauthenticated');
  });

  it('returns 422 profile_lookup_failed when fence rejects (orphan profile)', async () => {
    const { from, getUser } = buildMocks({ profileRow: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('profile_lookup_failed');
  });

  it('returns 503 profile_lookup_unavailable on transient fence lookup error', async () => {
    const { from, getUser } = buildMocks({
      profileRow: null,
      profileError: { message: 'connection reset' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('profile_lookup_unavailable');
  });
});
