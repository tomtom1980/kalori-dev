/**
 * @vitest-environment node
 *
 * Phase B C1-B regression guard — `app/(app)/onboarding/page.tsx` profile
 * lookup error handling.
 *
 * Contract (post-Codex-R1 C1 fix on 2026-05-08-e2e-regressions Bug #1):
 *   1. `data == null` AND no error — row truly doesn't exist — render
 *      the wizard (the intended "not onboarded" path).
 *   2. `data.onboarding_completed_at` truthy — redirect to /dashboard.
 *   3. `error != null` (RLS denial, network blip, etc.) — throw a typed
 *      `ProfileLookupError` so Next's error boundary surfaces a
 *      recoverable error page. The session is preserved: getUser() above
 *      already cryptographically validated the user, so destroying the
 *      session on a transient profile-lookup blip would boot a valid
 *      user mid-wizard. Forged cookies are caught upstream by the
 *      `error || !user` branch on getUser() and by middleware — NOT by
 *      this branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  from: vi.fn(),
  redirect: vi.fn(() => {
    // Mimic Next's redirect: throws a special error to short-circuit the
    // React render. We check the call args rather than the throw type.
    throw new Error('NEXT_REDIRECT');
  }),
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

// Stub the WizardShell client component so we don't need happy-dom to
// render it — the test asserts routing behavior, not wizard internals.
vi.mock('@/app/(app)/onboarding/_components/WizardShell', () => ({
  WizardShell: () => null,
}));

function mockProfileQuery(profile: { onboarding_completed_at: string | null } | null) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
    }),
  });
}

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
  const { default: OnboardingPage } = await import('@/app/(app)/onboarding/page');
  return OnboardingPage();
}

describe('F2 — /onboarding page profile lookup error handling', () => {
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

  it('profile lookup error throws ProfileLookupError, preserving the session (Codex R1 C1)', async () => {
    // Codex R1 C1: getUser() above already cryptographically validated
    // the session, so a transient profile-lookup blip (RLS denial,
    // network glitch, etc.) MUST NOT destroy a valid session. The
    // previous "signOut + redirect to /login" contract booted valid
    // users mid-wizard on transient errors. New contract: throw a typed
    // ProfileLookupError so Next's error boundary catches it and the
    // user can retry without losing their session.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-transient-err' } },
      error: null,
    });
    mockProfileQueryError({ code: '42501', message: 'permission denied' });

    await expect(invokePage()).rejects.toThrow(/profile lookup failed/i);
    // Session must be preserved.
    expect(mocks.signOut).not.toHaveBeenCalled();
    // No redirect — the error boundary handles surfacing the failure.
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('row genuinely missing (data=null, error=null) renders the wizard — the not-onboarded path', async () => {
    // Truly-missing row is the "not yet onboarded" path. No throw, no
    // redirect — the wizard renders.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-new' } },
      error: null,
    });
    mockProfileQuery(null);

    const out = await invokePage();
    // No redirect issued.
    expect(mocks.redirect).not.toHaveBeenCalled();
    // The returned JSX tree is truthy (the stubbed WizardShell returns null
    // but the page-level JSX is a React element, not null/undefined).
    expect(out).toBeTruthy();
  });

  it('onboarding_completed_at truthy redirects to /dashboard', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-done' } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    await expect(invokePage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
  });
});
