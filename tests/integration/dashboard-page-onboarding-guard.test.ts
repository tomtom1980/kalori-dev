/**
 * @vitest-environment node
 *
 * Task 3.7 fix — F-UI-3.7-C: `/dashboard` page must redirect users with
 * `profile.onboarding_completed_at IS NULL` to `/onboarding`.
 *
 * The production bug (pre-fix): `app/(app)/dashboard/page.tsx` authenticates
 * the user via `supabase.auth.getUser()` then immediately calls
 * `fetchProfile(user.id)` + `fetchDaySnapshot(...)`. If the user typed
 * `/dashboard` directly without completing onboarding:
 *   1. `calorie_target` and `timezone` are still NULL / default → later code
 *      (e.g. `ChronometerRing formatNumber(target)`, `userTzNowIso(profile.timezone)`)
 *      crashes or renders NaN.
 *   2. No redirect-to-/onboarding gate — the wizard is the ONLY place that
 *      sets those fields, so skipping it leaves the dashboard in a broken state.
 *
 * Contract parallel to `app/(app)/onboarding/page.tsx` (which redirects the
 * OTHER direction — already-onboarded → /dashboard):
 *   - SELECT `onboarding_completed_at` from profiles WHERE id = auth.uid().
 *   - If error with code === 'PGRST116' (genuine missing row,
 *     defense-in-depth): redirect to `/onboarding` so the finalize flow
 *     can self-heal the row.
 *   - If any other error (RLS denial, network blip, crypto-validation
 *     failure): throw `ProfileLookupError` so Next's error boundary
 *     handles it and forged-cookie tokens trip the unauthenticated
 *     branch upstream instead of masquerading as orphans (C1-B
 *     regression guard).
 *   - If `onboarding_completed_at` is NULL: `redirect('/onboarding')`.
 *   - Otherwise proceed to render the dashboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  from: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  fetchProfile: vi.fn(),
  fetchDaySnapshot: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/dashboard/fetch', () => ({
  fetchProfile: mocks.fetchProfile,
  fetchDaySnapshot: mocks.fetchDaySnapshot,
}));

vi.mock('@/lib/time/day', () => ({
  userTzNowIso: () => '2026-04-22T06:00:00.000Z',
  userTzToday: () => '2026-04-22',
  userTzDayUtcRange: () => ({ startUtc: '', endUtc: '' }),
  userTzDayFrom: () => '2026-04-22',
}));

// Stub all dashboard components to null — we only care about routing.
vi.mock('@/components/dashboard/Masthead', () => ({ Masthead: () => null }));
vi.mock('@/components/charts/ChronometerRing', () => ({ ChronometerRing: () => null }));
vi.mock('@/components/dashboard/MacroBars', () => ({ MacroBars: () => null }));
vi.mock('@/components/dashboard/MealsBulletin', () => ({ MealsBulletin: () => null }));
vi.mock('@/components/dashboard/WaterTracker', () => ({ WaterTracker: () => null }));
vi.mock('@/components/dashboard/MicronutrientPanel', () => ({ MicronutrientPanel: () => null }));
vi.mock('@/components/dashboard/WeeklyInsightSkeleton', () => ({
  WeeklyInsightSkeleton: () => null,
}));

function mockOnboardingQuery(value: { onboarding_completed_at: string | null } | null) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: value, error: null }),
      }),
    }),
  });
}

function mockOnboardingQueryError(error: { code?: string; message: string }) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error }),
      }),
    }),
  });
}

async function invokePage(): Promise<unknown> {
  const { default: DashboardPage } = await import('@/app/(app)/dashboard/page');
  return DashboardPage();
}

describe('F-UI-3.7-C — /dashboard onboarding-complete guard', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.from.mockReset();
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
    mocks.fetchProfile.mockReset();
    mocks.fetchDaySnapshot.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('user with onboarding_completed_at IS NULL redirects to /onboarding', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-not-onboarded' } },
      error: null,
    });
    mockOnboardingQuery({ onboarding_completed_at: null });

    await expect(invokePage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mocks.redirect).toHaveBeenCalledWith('/onboarding');
    // Must NOT have invoked the dashboard data fetch path — the guard
    // runs BEFORE fetchProfile / fetchDaySnapshot so NULL fields never
    // reach the render layer.
    expect(mocks.fetchProfile).not.toHaveBeenCalled();
    expect(mocks.fetchDaySnapshot).not.toHaveBeenCalled();
  });

  it('user with onboarding_completed_at set proceeds to dashboard render', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-onboarded' } },
      error: null,
    });
    mockOnboardingQuery({ onboarding_completed_at: '2026-04-01T10:00:00Z' });
    mocks.fetchProfile.mockResolvedValue({
      id: 'user-onboarded',
      calorie_target: 2000,
      bmr: 1500,
      tdee: 2200,
      timezone: 'Asia/Ho_Chi_Minh',
      created_at: '2026-01-01T00:00:00Z',
      last_dashboard_visit_at: null,
      target_mode: 'auto',
      manual_override_value: null,
    });
    mocks.fetchDaySnapshot.mockResolvedValue({
      edition: { n: 1, weekday: 'Wednesday', day: 22, month: 'April', year: 2026 },
      chronometer: { status: 'empty', target: 2000 },
      macros: {
        protein: { key: 'protein', consumedG: 0, targetG: 125, pct: 0, status: 'empty' },
        carbs: { key: 'carbs', consumedG: 0, targetG: 225, pct: 0, status: 'empty' },
        fat: { key: 'fat', consumedG: 0, targetG: 66, pct: 0, status: 'empty' },
      },
      meals: {
        breakfast: { category: 'breakfast', entries: [], totalKcal: 0, heaviestEntryId: null },
        lunch: { category: 'lunch', entries: [], totalKcal: 0, heaviestEntryId: null },
        dinner: { category: 'dinner', entries: [], totalKcal: 0, heaviestEntryId: null },
        snack: { category: 'snack', entries: [], totalKcal: 0, heaviestEntryId: null },
        drink: { category: 'drink', entries: [], totalKcal: 0, heaviestEntryId: null },
      },
      water: { consumedMl: 0, targetMl: 2000, entries: [] },
      micros: [],
    });

    const out = await invokePage();
    expect(out).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.fetchProfile).toHaveBeenCalledWith('user-onboarded');
  });

  it('profile lookup error (non-PGRST116) throws ProfileLookupError (C1-B regression guard)', async () => {
    // C1-B regression guard contract: non-PGRST116 lookup errors (RLS
    // denials, network blips, crypto-validation failures) MUST throw
    // ProfileLookupError so authed-but-broken sessions surface in Next's
    // error boundary, and forged-cookie tokens trip the unauthenticated
    // branch upstream rather than masquerading as orphans. The narrow
    // PGRST116 carveout still redirects to /onboarding as
    // defense-in-depth for the genuine missing-row case.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-transient-err' } },
      error: null,
    });
    mockOnboardingQueryError({ code: '42501', message: 'permission denied' });

    await expect(invokePage()).rejects.toThrow('profile lookup failed');
    expect(mocks.redirect).not.toHaveBeenCalledWith('/onboarding');
    expect(mocks.fetchProfile).not.toHaveBeenCalled();
  });
});
