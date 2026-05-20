/**
 * @vitest-environment node
 *
 * I4b — `/auth/confirm` route coverage (PKCE-free magic-link verification).
 *
 * Companion to `/auth/callback`. The PKCE flow in `callback.ts` fails when the
 * user clicks the magic link in a DIFFERENT browser context than where they
 * requested it (e.g. requested from a Facebook Messenger in-app browser,
 * clicked from Gmail) because the code_verifier cookie is missing. The
 * `/auth/confirm` route uses `verifyOtp({ type, token_hash })` which does NOT
 * require a client-side cookie — Supabase verifies the hash against its own
 * stored hash and mints a session unconditionally.
 *
 * The route mirrors callback's structure (profile lookup → /onboarding or
 * /dashboard, `next` redirect support via the same `safeRedirectTarget`
 * guard) and adds explicit Sentry capture so the cross-browser failure mode
 * (which currently triggers the silent code_verifier-mismatch bug) leaves a
 * trace in production.
 *
 * Round-2 hybrid hardening (Codex F1) — the route ALSO accepts `?code=…` as
 * a PKCE-fallback shape so old-template links during a rollout window land
 * here safely instead of dying with "missing params". token_hash always wins
 * when both shapes are present.
 *
 * Round-2 OTP-type tightening (Codex F3) — only `email` + `magiclink` are
 * accepted. `recovery`, `invite`, `signup`, `email_change` are rejected with
 * a warning capture so a future misrouted password-reset / invite template
 * cannot silently mint a normal sign-in session.
 *
 * Coverage:
 *   CONFIRM-MISSING-TOKEN-HASH                 — no ?token_hash AND no ?code → /login?error=callback + warning
 *   CONFIRM-MISSING-TYPE                       — ?token_hash without ?type → /login?error=callback
 *   CONFIRM-ONBOARDING-INCOMPLETE              — valid + null onboarding → /onboarding
 *   CONFIRM-ONBOARDING-COMPLETE                — valid + onboarding ts → /dashboard
 *   CONFIRM-NEXT-PARAM-HONORED                 — valid + ?next=/library → /library
 *   CONFIRM-NEXT-PARAM-HOSTILE                 — hostile ?next dropped, falls back to /dashboard
 *   CONFIRM-VERIFY-OTP-ERROR                   — verifyOtp errors → /login?error=callback + captureException
 *   CONFIRM-NO-SESSION                         — verifyOtp returns no session → /login?error=callback + captureException
 *   CONFIRM-PROFILE-LOOKUP-THROW               — profile lookup throws → /login?error=profile_lookup_failed
 *   CONFIRM-PKCE-FALLBACK-SUCCESS              — ?code only → exchangeCodeForSession path → onboarding/dashboard
 *   CONFIRM-PKCE-FALLBACK-ERROR                — ?code with error → /login?error=callback + pkce_fallback tag
 *   CONFIRM-PKCE-FALLBACK-NULL-SESSION         — ?code returns null session → /login?error=callback + pkce_fallback tag
 *   CONFIRM-PREFERS-TOKEN-HASH-WHEN-BOTH       — ?code + ?token_hash + ?type → verifyOtp used, exchange NOT called
 *   CONFIRM-REJECTS-RECOVERY-TYPE              — ?type=recovery rejected as missing-params (warning)
 *   CONFIRM-REJECTS-INVITE-TYPE                — ?type=invite rejected
 *   CONFIRM-REJECTS-SIGNUP-TYPE                — ?type=signup rejected
 *   CONFIRM-REJECTS-EMAIL-CHANGE-TYPE          — ?type=email_change rejected
 *
 * Test name prefix `CONFIRM-` so greps stay clean.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  from: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
    from: mocks.from,
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
  setUser: mocks.setUser,
  addBreadcrumb: mocks.addBreadcrumb,
}));

async function invoke(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import('@/app/auth/confirm/route');
  const request = new Request(url, { headers });
  const nextReqModule = await import('next/server');
  const nextRequest = new nextReqModule.NextRequest(request);
  return GET(nextRequest);
}

function mockProfileQuery(profile: { onboarding_completed_at: string | null } | null) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
    }),
  });
}

function mockProfileQueryThrow(err: Error) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          throw err;
        },
      }),
    }),
  });
}

describe('I4b — /auth/confirm route contract', () => {
  beforeEach(() => {
    mocks.verifyOtp.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.from.mockReset();
    mocks.captureException.mockReset();
    mocks.captureMessage.mockReset();
    mocks.setUser.mockReset();
    mocks.addBreadcrumb.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('CONFIRM-MISSING-TOKEN-HASH: GET without ?token_hash AND without ?code redirects to /login?error=callback and emits a warning breadcrumb', async () => {
    // Hybrid handler (Codex R2 F1): missing means BOTH shapes absent. `?type`
    // alone without a token_hash or a code is still a "no usable params" hit.
    const res = await invoke('http://kalori.test/auth/confirm?type=email', {
      'user-agent': 'TestUA/1.0',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'auth_confirm_missing_params',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          has_token_hash: false,
          has_type: true,
          has_code: false,
          ua: 'TestUA/1.0',
        }),
      }),
    );
  });

  it('CONFIRM-MISSING-TYPE: GET with ?token_hash but no ?type and no ?code redirects to /login?error=callback', async () => {
    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc123');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'auth_confirm_missing_params',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          has_token_hash: true,
          has_type: false,
          has_code: false,
        }),
      }),
    );
  });

  it('CONFIRM-ONBOARDING-INCOMPLETE: new user (null onboarding_completed_at) lands on /onboarding', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-new', email: 'new@kalori.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: null });

    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc&type=email');

    expect(res.status).toBe(307);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc' });
    const location = res.headers.get('location');
    expect(location).toContain('/onboarding');
    expect(location).not.toMatch(/\/dashboard(\?|$)/);
  });

  it('CONFIRM-ONBOARDING-COMPLETE: completed user lands on /dashboard', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-done', email: 'done@kalori.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc&type=magiclink');

    expect(res.status).toBe(307);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'abc' });
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).not.toContain('/onboarding');
  });

  it('CONFIRM-NEXT-PARAM-HONORED: safe ?next=/library is followed when onboarding complete', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const safe = encodeURIComponent('/library');
    const res = await invoke(
      `http://kalori.test/auth/confirm?token_hash=abc&type=email&next=${safe}`,
    );

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/library');
    expect(location).not.toMatch(/\/dashboard(\?|$)/);
  });

  it('CONFIRM-NEXT-PARAM-HOSTILE: hostile ?next=https://evil.com is ignored (open-redirect guard)', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = encodeURIComponent('https://evil.com/steal');
    const res = await invoke(
      `http://kalori.test/auth/confirm?token_hash=abc&type=email&next=${hostile}`,
    );

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('evil.com');
    expect(location).toContain('/dashboard');
  });

  it('CONFIRM-VERIFY-OTP-ERROR: expired token redirects to /login?error=callback and captures the error with context', async () => {
    const verifyError = {
      name: 'AuthApiError',
      message: 'Token has expired or is invalid',
      status: 401,
    };
    mocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: verifyError,
    });

    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc&type=email', {
      'user-agent': 'GmailApp/iOS 5.1',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.captureException).toHaveBeenCalledWith(
      verifyError,
      expect.objectContaining({
        tags: expect.objectContaining({
          route: 'auth/confirm',
          auth_flow: 'magic_link',
        }),
        extra: expect.objectContaining({
          has_token_hash: true,
          type: 'email',
          ua: 'GmailApp/iOS 5.1',
        }),
      }),
    );
  });

  it('CONFIRM-NO-SESSION: verifyOtp succeeds but returns no session → /login?error=callback + captureException', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc&type=email');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const [errArg] = mocks.captureException.mock.calls[0]!;
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toMatch(/no session/i);
  });

  it('CONFIRM-PROFILE-LOOKUP-THROW: lookup exception → /login?error=profile_lookup_failed + captureException', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'user-x', email: 'x@kalori.test' } } },
      error: null,
    });
    const lookupErr = new Error('connection reset');
    mockProfileQueryThrow(lookupErr);

    const res = await invoke('http://kalori.test/auth/confirm?token_hash=abc&type=email');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=profile_lookup_failed');
    expect(mocks.captureException).toHaveBeenCalledWith(
      lookupErr,
      expect.objectContaining({
        tags: expect.objectContaining({
          route: 'auth/confirm',
          auth_flow: 'magic_link',
          stage: 'profile_lookup',
        }),
      }),
    );
  });

  // ===== Round-2 hybrid + restricted-type tests (Codex F1 + F3) =====

  it('CONFIRM-PKCE-FALLBACK-SUCCESS: ?code only (no token_hash) triggers exchangeCodeForSession and lands /onboarding', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'pkce-user-new', email: 'pkce@kalori.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: null });

    const res = await invoke('http://kalori.test/auth/confirm?code=pkce-code-123');

    expect(res.status).toBe(307);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-123');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    const location = res.headers.get('location');
    expect(location).toContain('/onboarding');
    // Sentry.setUser must fire on the PKCE-fallback success path too.
    expect(mocks.setUser).toHaveBeenCalledWith({
      id: 'pkce-user-new',
      email: 'pkce@kalori.test',
    });
  });

  it('CONFIRM-PKCE-FALLBACK-SUCCESS-DASHBOARD: ?code only with onboarded user → /dashboard', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'pkce-user-done', email: 'pkced@kalori.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const res = await invoke('http://kalori.test/auth/confirm?code=pkce-code-abc');

    expect(res.status).toBe(307);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-abc');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
  });

  it('CONFIRM-PKCE-FALLBACK-ERROR: ?code with exchange error → /login?error=callback + pkce_fallback tag', async () => {
    const exchangeError = {
      name: 'AuthApiError',
      message: 'invalid_grant: code_verifier mismatch',
      status: 400,
    };
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: exchangeError,
    });

    const res = await invoke('http://kalori.test/auth/confirm?code=stale-code', {
      'user-agent': 'TestUA/1.0',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('stale-code');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledWith(
      exchangeError,
      expect.objectContaining({
        tags: expect.objectContaining({
          route: 'auth/confirm',
          auth_flow: 'pkce_fallback',
        }),
        extra: expect.objectContaining({
          has_code: true,
          ua: 'TestUA/1.0',
        }),
      }),
    );
  });

  it('CONFIRM-PKCE-FALLBACK-NULL-SESSION: ?code returns null session without error → /login?error=callback + pkce_fallback', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const res = await invoke('http://kalori.test/auth/confirm?code=null-session-code');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('null-session-code');
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const [errArg, opts] = mocks.captureException.mock.calls[0]!;
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toMatch(/no session/i);
    expect(opts).toMatchObject({
      tags: expect.objectContaining({
        route: 'auth/confirm',
        auth_flow: 'pkce_fallback',
      }),
    });
  });

  it('CONFIRM-PREFERS-TOKEN-HASH-WHEN-BOTH: ?code + ?token_hash + ?type → verifyOtp is used, exchangeCodeForSession is NOT', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'both-user', email: 'both@kalori.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const res = await invoke(
      'http://kalori.test/auth/confirm?code=should-be-ignored&token_hash=winner&type=email',
    );

    expect(res.status).toBe(307);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'winner' });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
  });

  it('CONFIRM-REJECTS-RECOVERY-TYPE: ?type=recovery rejected as missing-params → /login?error=callback + warning', async () => {
    const res = await invoke('http://kalori.test/auth/confirm?token_hash=foo&type=recovery', {
      'user-agent': 'TestUA/1.0',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'auth_confirm_missing_params',
      expect.objectContaining({
        level: 'warning',
      }),
    );
  });

  it('CONFIRM-REJECTS-INVITE-TYPE: ?type=invite rejected as missing-params', async () => {
    const res = await invoke('http://kalori.test/auth/confirm?token_hash=foo&type=invite');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalled();
  });

  it('CONFIRM-REJECTS-SIGNUP-TYPE: ?type=signup rejected as missing-params', async () => {
    const res = await invoke('http://kalori.test/auth/confirm?token_hash=foo&type=signup');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalled();
  });

  it('CONFIRM-REJECTS-EMAIL-CHANGE-TYPE: ?type=email_change rejected as missing-params', async () => {
    const res = await invoke('http://kalori.test/auth/confirm?token_hash=foo&type=email_change');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalled();
  });
});

describe('HEAD /auth/confirm (prefetch defense)', () => {
  beforeEach(() => {
    mocks.verifyOtp.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.from.mockReset();
    mocks.captureException.mockReset();
    mocks.captureMessage.mockReset();
    mocks.setUser.mockReset();
    mocks.addBreadcrumb.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('CONFIRM-HEAD-NOOP: HEAD request returns 200 without calling verifyOtp', async () => {
    // HEAD handler takes no arguments — response is deterministic regardless
    // of query params or headers. We still construct the NextRequest to
    // mirror the realistic shape a prefetcher (Gmail, Facebook, Defender)
    // would deliver, even though the handler ignores it.
    const { NextRequest } = await import('next/server');
    void new NextRequest('https://example.com/auth/confirm?token_hash=real_token&type=email', {
      method: 'HEAD',
    });
    const { HEAD } = await import('@/app/auth/confirm/route');
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
    // Body must be empty
    const text = await res.text();
    expect(text).toBe('');
  });

  it('CONFIRM-HEAD-NOOP-CODE: HEAD on PKCE-style URL also no-ops', async () => {
    const { NextRequest } = await import('next/server');
    void new NextRequest('https://example.com/auth/confirm?code=real_code', {
      method: 'HEAD',
    });
    const { HEAD } = await import('@/app/auth/confirm/route');
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
