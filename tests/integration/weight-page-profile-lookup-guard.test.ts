/**
 * @vitest-environment node
 *
 * Phase B Codex Round 1 Critical F-PB-R1-2 contract — profiles SELECT
 * errors (including PGRST116) on `/weight` MUST throw `ProfileLookupError`
 * and propagate to Next's error boundary. They MUST NOT redirect to
 * /onboarding, because a transient RLS / DB blip would otherwise route an
 * already-onboarded user into the wizard, where the Step 8 finalize upsert
 * can clobber their profile and recomputed targets. The orphan self-heal
 * branch is reserved exclusively for the genuine `data:null, error:null`
 * shape (covered by tests/integration/dashboard-orphan-profile.test.ts).
 *
 * History: F-PROFILE-LOOKUP-MISSING-ROW remediation (2026-05-01) introduced
 * a PGRST116 escape-hatch that redirected lookup errors to /onboarding.
 * Phase B Codex review identified that this branch is unreachable for the
 * "no row" case under `.maybeSingle()` (which returns data:null/error:null)
 * — so any error reaching the branch is transient/RLS, never a missing
 * row. The escape hatch was removed; this test now guards the new contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/time/day', () => ({
  userTzToday: () => '2026-05-01',
}));

vi.mock('@/components/dashboard/WeightQuickAdd', () => ({
  WeightQuickAdd: () => null,
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
  const { default: WeightPage } = await import('@/app/(app)/weight/page');
  return WeightPage();
}

describe('/weight — profile lookup graceful fallback', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
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
