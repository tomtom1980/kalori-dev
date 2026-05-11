/**
 * Phase A Codex Round 1 Critical #1 regression — `requireProfileOrJson401`
 * MUST return HTTP 422 (not 401) on the orphan-profile branch so client
 * `authFetch` (R1 firewall) does not pattern-match the response as
 * session-expiry and force-sign-out the user. Body shape unchanged.
 *
 * Distinct branches:
 *   - unauthenticated      → 401 `{ error: 'unauthorized' }`
 *   - orphan profile        → 422 `{ error: 'profile_lookup_failed' }`
 *   - transient lookup err  → 503 `{ error: 'profile_lookup_unavailable' }`
 *
 * The function name retains "401" by surgical-changes principle (renaming
 * would cascade through every API caller); only the orphan branch's status
 * code changes. Body shape is preserved so existing callers that match on
 * `body.error === 'profile_lookup_failed'` keep working.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted Sentry mock — fence emits a breadcrumb on orphan; we don't assert
// on it here, but we need the module to be importable.
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

interface MockOpts {
  /** undefined = no profile row (orphan), object = present, null also = orphan */
  profileRow?: Record<string, unknown> | null;
  profileError?: { message: string; code?: string } | null;
  user?: { id: string } | null;
}

function buildSupabaseMock(opts: MockOpts) {
  const profilesTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: opts.profileRow ?? null,
          error: opts.profileError ?? null,
        }),
      }),
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profilesTable;
    throw new Error(`unexpected table: ${table}`);
  });
  const userValue = opts.user === undefined ? { id: 'u-test-orphan' } : opts.user;
  const getUser = vi.fn(async () => ({
    data: { user: userValue },
    error: userValue ? null : { message: 'no session' },
  }));
  return { auth: { getUser }, from };
}

describe('requireProfileOrJson401 — orphan branch returns 422 (Codex R1 #1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('orphan profile → status 422 (Unprocessable Entity), body { error: profile_lookup_failed }', async () => {
    const supabase = buildSupabaseMock({
      user: { id: 'u-test-orphan' },
      profileRow: null,
      profileError: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrJson401: (opts: { route: string }) => Promise<unknown>;
    };
    const result = await mod.requireProfileOrJson401({ route: '/api/test/probe' });

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    // 422 is the Codex R1 fix — distinct from the 401 that authFetch treats
    // as session-expiry.
    expect(res.status).toBe(422);
    expect(res.status).not.toBe(401);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('profile_lookup_failed');
  });

  it('unauthenticated → status 401 (the only 401 branch)', async () => {
    const supabase = buildSupabaseMock({ user: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrJson401: (opts: { route: string }) => Promise<unknown>;
    };
    const result = await mod.requireProfileOrJson401({ route: '/api/test/probe' });

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthorized');
  });

  it('transient lookup error → status 503 (also distinct from 401)', async () => {
    const supabase = buildSupabaseMock({
      user: { id: 'u-test' },
      profileRow: null,
      profileError: { message: 'connection reset' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrJson401: (opts: { route: string }) => Promise<unknown>;
    };
    const result = await mod.requireProfileOrJson401({ route: '/api/test/probe' });

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('profile_lookup_unavailable');
  });
});

/**
 * Phase B Codex Round 1 Critical F-PB-R1-2 regression — `requireProfileOrRedirect`
 * MUST treat `lookup_error` (any Supabase profiles SELECT error, including
 * RLS/transient blips that surface with code PGRST116 or similar) as a
 * fail-closed throw, NOT as an orphan redirect to /onboarding.
 *
 * Background: a temporary RLS / SELECT outage on `/dashboard`, `/progress`,
 * `/settings`, `/log`, `/library`, or `/weight` was previously routing an
 * already-onboarded user into the onboarding wizard. The Step 8 finalize
 * upsert can replace existing profile fields and recomputed targets with
 * newly entered values — i.e. silent profile-clobber on a transient blip.
 *
 * Fix contract: ANY error from the profiles SELECT (regardless of `code`,
 * including `PGRST116`) MUST throw `ProfileLookupError` so the calling
 * page bubbles to Next's error boundary. The orphan-redirect path is
 * reserved exclusively for the `data === null && error === null` shape.
 */
describe('requireProfileOrRedirect — lookup_error must NOT redirect to /onboarding (Codex F-PB-R1-2)', () => {
  const navMocks = {
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };

  beforeEach(() => {
    vi.resetModules();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.doMock('next/navigation', () => ({
      redirect: navMocks.redirect,
    }));
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/navigation');
  });

  it('profiles SELECT returns generic error → throws ProfileLookupError (no /onboarding redirect)', async () => {
    const supabase = buildSupabaseMock({
      user: { id: 'u-test-already-onboarded' },
      profileRow: null,
      profileError: { message: 'connection reset', code: '57P01' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrRedirect: (opts: {
        route: string;
        loginRedirectTo: string;
      }) => Promise<unknown>;
      ProfileLookupError: new (...args: unknown[]) => Error;
    };

    await expect(
      mod.requireProfileOrRedirect({ route: '/dashboard', loginRedirectTo: '/dashboard' }),
    ).rejects.toBeInstanceOf(mod.ProfileLookupError);
    expect(navMocks.redirect).not.toHaveBeenCalledWith('/onboarding');
  });

  it('profiles SELECT returns PGRST116-coded error → throws (NOT redirect to /onboarding)', async () => {
    // PGRST116 historically had an escape-hatch redirect to /onboarding for
    // "no row" semantics, but with `.maybeSingle()` the no-row case returns
    // `data:null, error:null` (caught by the orphan branch upstream). Any
    // PGRST116 surfacing here is therefore a transient/RLS condition and
    // MUST fail closed — never silently land an already-onboarded user in
    // the onboarding wizard where Step 8 upsert would clobber their profile.
    const supabase = buildSupabaseMock({
      user: { id: 'u-test-already-onboarded' },
      profileRow: null,
      profileError: { message: 'PostgREST PGRST116 fired', code: 'PGRST116' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrRedirect: (opts: {
        route: string;
        loginRedirectTo: string;
      }) => Promise<unknown>;
      ProfileLookupError: new (...args: unknown[]) => Error;
    };

    await expect(
      mod.requireProfileOrRedirect({ route: '/dashboard', loginRedirectTo: '/dashboard' }),
    ).rejects.toBeInstanceOf(mod.ProfileLookupError);
    expect(navMocks.redirect).not.toHaveBeenCalledWith('/onboarding');
  });

  it('genuine missing-row orphan (data=null, error=null) → still redirects to /onboarding (self-heal preserved)', async () => {
    const supabase = buildSupabaseMock({
      user: { id: 'u-test-true-orphan' },
      profileRow: null,
      profileError: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const mod = (await import('@/lib/auth/orphan-profile-fence')) as {
      requireProfileOrRedirect: (opts: {
        route: string;
        loginRedirectTo: string;
      }) => Promise<unknown>;
    };

    await expect(
      mod.requireProfileOrRedirect({ route: '/dashboard', loginRedirectTo: '/dashboard' }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/onboarding/);
    expect(navMocks.redirect).toHaveBeenCalledWith('/onboarding');
  });
});
