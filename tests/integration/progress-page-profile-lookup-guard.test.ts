/**
 * @vitest-environment node
 *
 * Phase B Codex Round 1 Critical F-PB-R1-2 contract — profiles SELECT
 * errors (including PGRST116) on `/progress` MUST throw `ProfileLookupError`
 * and propagate to Next's error boundary. They MUST NOT redirect to
 * /onboarding (would let a transient RLS / DB blip route an already-
 * onboarded user into the wizard, where Step 8 upsert clobbers their
 * profile). Genuine missing-row orphan self-heal is the data:null/error:null
 * branch only — covered by tests/integration/dashboard-orphan-profile.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  from: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  headers: vi.fn(async () => ({
    get: () => null,
  })),
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

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

// Stub heavy chart imports — we only care about routing.
vi.mock('@/components/charts/CalorieAdherenceBar', () => ({ CalorieAdherenceBar: () => null }));
vi.mock('@/components/charts/ChartSkeleton', () => ({ ChartSkeleton: () => null }));
vi.mock('@/components/charts/LoggingConsistencyCalendar', () => ({
  LoggingConsistencyCalendar: () => null,
}));
vi.mock('@/components/charts/MacroDistributionStackedArea', () => ({
  MacroDistributionStackedArea: () => null,
}));
vi.mock('@/components/charts/MicronutrientHeatmap', () => ({ MicronutrientHeatmap: () => null }));
vi.mock('@/components/charts/TrendSummary', () => ({ TrendSummary: () => null }));
vi.mock('@/components/charts/WeeklyReviewSkeleton', () => ({ WeeklyReviewSkeleton: () => null }));
vi.mock('@/components/charts/WeightTrajectoryLine', () => ({ WeightTrajectoryLine: () => null }));
vi.mock('@/lib/aggregations/progress-fetch', () => ({
  fetchProgressSnapshot: vi.fn(),
}));
vi.mock('@/app/(app)/progress/_components/ProgressRangeToolbar', () => ({
  ProgressRangeToolbar: () => null,
}));
vi.mock('@/app/(app)/progress/_components/weekly-review-island', () => ({
  WeeklyReviewIsland: () => null,
}));

function mockProfileQueryError(error: { code?: string; message: string }) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error }),
      }),
    }),
  });
}

async function invokePage(): Promise<unknown> {
  const { default: ProgressPage } = await import('@/app/(app)/progress/page');
  return ProgressPage({ searchParams: Promise.resolve({}) });
}

describe('/progress — profile lookup graceful fallback', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.from.mockReset();
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('profile lookup error throws ProfileLookupError (does NOT redirect to /onboarding)', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-already-onboarded' } },
      error: null,
    });
    mockProfileQueryError({ code: 'PGRST116', message: 'no rows' });

    await expect(invokePage()).rejects.toThrow(/profile lookup failed/);
    expect(mocks.redirect).not.toHaveBeenCalledWith('/onboarding');
  });
});
