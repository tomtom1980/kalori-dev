/**
 * @vitest-environment node
 *
 * I4 — `/auth/callback` route coverage (Task 2.1 Codex fix).
 *
 * The callback route handles Supabase magic-link / Google-OAuth redirects.
 * It is reachable by unauthenticated traffic (public route per
 * `lib/auth/public-routes.ts`) and it decides post-sign-in landing via the
 * user's `profiles.onboarding_completed_at`. Because the route runs on the
 * server and owns session creation, its correctness is a security-sensitive
 * surface — one of the places an open-redirect bug can leak a session into
 * an attacker-controlled URL.
 *
 * Coverage:
 *   CALLBACK-MISSING-CODE            — GET without `?code=` → /login?error=callback
 *   CALLBACK-EXCHANGE-ERROR          — invalid code → /login?error=callback
 *   CALLBACK-ONBOARDING-INCOMPLETE   — valid code + null onboarding → /onboarding
 *   CALLBACK-ONBOARDING-COMPLETE     — valid code + onboarding ts → /dashboard
 *   CALLBACK-HOSTILE-REDIRECT-TO     — valid code + ?redirect_to=https://evil.com →
 *                                       MUST NOT honor the hostile URL; falls
 *                                       back to the profile-driven landing page
 *   CALLBACK-SAFE-RELATIVE-REDIRECT-TO — valid code + safe `/library` path AND
 *                                       onboarding complete → /library
 *
 * Test name prefix `CALLBACK-` so greps against design-doc / I6 history stay
 * clean.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  from: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
    from: mocks.from,
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
  setUser: mocks.setUser,
}));

async function invoke(url: string, headers?: Record<string, string>): Promise<Response> {
  const { GET } = await import('@/app/auth/callback/route');
  const request = new Request(url, headers ? { headers } : undefined);
  // NextRequest extends Request; the handler only reads `nextUrl` +
  // `searchParams` + `url`. A plain Request with a URL resolves nextUrl
  // lazily via the NextRequest constructor used inside the handler.
  // But the handler imports `NextRequest` as a TYPE — it's a cast. At
  // runtime, Next's helpers work from the underlying Request.
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

function mockProfileQueryError(error: { code?: string; message: string }) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error }),
      }),
    }),
  });
}

describe('I4 — /auth/callback route contract', () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset();
    mocks.from.mockReset();
    mocks.captureException.mockReset();
    mocks.captureMessage.mockReset();
    mocks.setUser.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('CALLBACK-MISSING-CODE: GET without ?code returns 307 to /login?error=callback', async () => {
    const res = await invoke('http://kalori.test/auth/callback', {
      'user-agent': 'TestAgent/1.0',
      referer: 'http://kalori.test/login',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    // Observability: missing ?code is a warning (likely a stale link / bot
    // probe / misconfigured provider) — captureMessage at warning severity.
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    const msgCall = mocks.captureMessage.mock.calls[0]!;
    expect(typeof msgCall[0]).toBe('string');
    expect(msgCall[1]).toMatchObject({
      level: 'warning',
      extra: { ua: 'TestAgent/1.0', referer: 'http://kalori.test/login' },
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.setUser).not.toHaveBeenCalled();
  });

  it('CALLBACK-EXCHANGE-ERROR: invalid code redirects to /login?error=callback', async () => {
    const exchangeError = { message: 'invalid_request' };
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: exchangeError,
    });

    const res = await invoke('http://kalori.test/auth/callback?code=invalid', {
      'user-agent': 'TestAgent/1.0',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    // Observability: surface the underlying exchange error with route +
    // auth_flow tags so we can tell OAuth/PKCE failures apart from other
    // /auth/callback paths.
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const errCall = mocks.captureException.mock.calls[0]!;
    expect(errCall[0]).toBe(exchangeError);
    expect(errCall[1]).toMatchObject({
      tags: { route: 'auth/callback', auth_flow: 'oauth_or_pkce' },
      extra: { code_present: true, ua: 'TestAgent/1.0' },
    });
    expect(mocks.setUser).not.toHaveBeenCalled();
  });

  it('CALLBACK-NULL-SESSION: exchange returns no error but null session → captureException with sentinel', async () => {
    // PKCE failure mode we just hit in prod: Supabase returns
    // `{ data: { session: null }, error: null }` (e.g. the code_verifier
    // cookie was missing). Today this silently redirects to /login with
    // zero Sentry events. The new contract: captureException with a
    // sentinel Error so the alert fires.
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const res = await invoke('http://kalori.test/auth/callback?code=valid-but-null', {
      'user-agent': 'TestAgent/1.0',
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const nullSessionCall = mocks.captureException.mock.calls[0]!;
    expect(nullSessionCall[0]).toBeInstanceOf(Error);
    expect(nullSessionCall[1]).toMatchObject({
      tags: { route: 'auth/callback', auth_flow: 'oauth_or_pkce' },
      extra: { code_present: true, ua: 'TestAgent/1.0' },
    });
    expect(mocks.setUser).not.toHaveBeenCalled();
  });

  it('CALLBACK-ONBOARDING-INCOMPLETE: new user (null onboarding_completed_at) lands on /onboarding', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-new', email: 'new@example.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: null });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/onboarding');
    expect(location).not.toContain('/dashboard');
    // Happy-path observability: setUser must be called once with the
    // session's user (id + email) — gives every subsequent Sentry event in
    // the request context a stable user attribution.
    expect(mocks.setUser).toHaveBeenCalledTimes(1);
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'user-new', email: 'new@example.test' });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('CALLBACK-ONBOARDING-COMPLETE: completed user lands on /dashboard', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done', email: 'done@example.test' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).not.toContain('/onboarding');
    expect(mocks.setUser).toHaveBeenCalledTimes(1);
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'user-done', email: 'done@example.test' });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('CALLBACK-HOSTILE-REDIRECT-TO: hostile absolute redirect_to is IGNORED (open-redirect guard)', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = encodeURIComponent('https://evil.com/steal-session');
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    // MUST NOT leak the session into the hostile host.
    expect(location).not.toContain('evil.com');
    // MUST fall back to the profile-driven landing.
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-HOSTILE-REDIRECT-TO-PROTOCOL-RELATIVE: //evil.com also rejected', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = encodeURIComponent('//evil.com/steal');
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('evil.com');
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-SAFE-RELATIVE-REDIRECT-TO: safe /library honored when onboarding complete', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const safe = encodeURIComponent('/library');
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${safe}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/library');
    // Must NOT redirect back to /dashboard since redirect_to was explicit + safe.
    expect(location).not.toMatch(/\/dashboard(\?|$)/);
  });

  // --- Round 3 hardening (F3) — additional attack-surface rejections ---
  // The safeRedirectTarget guard must reject path traversal, backslash smuggle,
  // encoded traversal, CR/LF header injection, and null-byte payloads. All of
  // these must fall back to the profile-driven default (/dashboard here since
  // the user has onboarding_completed_at set) — NEVER honor the hostile input.

  it('CALLBACK-REJECTS-TRAVERSAL: /login/../admin is rejected (path traversal)', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = encodeURIComponent('/login/../admin');
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('/admin');
    // Must also not contain the literal traversal segment.
    expect(location).not.toContain('..');
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-REJECTS-BACKSLASH: /\\evil.com/path is rejected (backslash smuggle)', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = encodeURIComponent('/\\evil.com/path');
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('evil.com');
    expect(location).not.toContain('\\');
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-REJECTS-ENCODED-TRAVERSAL: /%2e%2e/admin is rejected', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = '/%2e%2e/admin'; // Do NOT double-encode: value is already percent-encoded.
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toMatch(/\/admin(\?|$|\/)/);
    expect(location).not.toContain('..');
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-REJECTS-NEWLINE: /ok%0aHost:evil.com rejected (CRLF / header injection)', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = '/ok%0aHost:evil.com';
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('evil.com');
    expect(location).not.toMatch(/[\r\n]/);
    expect(location).toContain('/dashboard');
  });

  it('CALLBACK-REJECTS-NULL-BYTE: /ok%00 is rejected (null byte)', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const hostile = '/ok%00';
    const res = await invoke(`http://kalori.test/auth/callback?code=valid&redirect_to=${hostile}`);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toContain('\x00');
    expect(location).not.toContain('%00');
    expect(location).toContain('/dashboard');
  });

  // --- Phase 2 Codex R1 F2 — profile lookup errors must not silently
  // send an already-onboarded user back through the wizard. ---

  it('CALLBACK-PROFILE-LOOKUP-ERROR: DB/RLS error does NOT redirect to /onboarding', async () => {
    // F2: previously the callback ignored the `error` return from
    // maybeSingle(). A transient DB/RLS error made `onboardingComplete`
    // false and bounced the user back to the wizard. The new contract:
    // treat an error as "unknown state" and redirect to a safe login
    // error surface — NOT /onboarding.
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-transient-err', email: 'err@example.test' } } },
      error: null,
    });
    mockProfileQueryError({ code: '42501', message: 'permission denied' });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    // Must NOT send the user into the wizard on a transient lookup error.
    expect(location).not.toContain('/onboarding');
    // Must land on the login surface with a dedicated error parameter so
    // the product can show a specific retry message.
    expect(location).toContain('/login');
    expect(location).toContain('error=profile_lookup_failed');
    // Observability: profile lookup errors must surface to Sentry with the
    // profile_lookup stage tag so we can alert on auth-disrupting DB/RLS
    // regressions.
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const lookupErrCall = mocks.captureException.mock.calls[0]!;
    expect(lookupErrCall[1]).toMatchObject({
      tags: { route: 'auth/callback', auth_flow: 'profile_lookup' },
    });
  });

  it('CALLBACK-PROFILE-LOOKUP-THROWS: network failure during lookup is captured to Sentry', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-net-fail', email: 'net@example.test' } } },
      error: null,
    });
    const networkError = new Error('ECONNRESET');
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw networkError;
          },
        }),
      }),
    });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=profile_lookup_failed');
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const throwCall = mocks.captureException.mock.calls[0]!;
    expect(throwCall[0]).toBe(networkError);
    expect(throwCall[1]).toMatchObject({
      tags: { route: 'auth/callback', auth_flow: 'profile_lookup' },
    });
  });
});

describe('HEAD /auth/callback (prefetch defense)', () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset();
    mocks.from.mockReset();
    mocks.captureException.mockReset();
    mocks.captureMessage.mockReset();
    mocks.setUser.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('CALLBACK-HEAD-NOOP: HEAD request returns 200 without calling exchangeCodeForSession', async () => {
    // HEAD handler takes no arguments — response is deterministic regardless
    // of query params or headers. We still construct the NextRequest to
    // mirror the realistic shape a prefetcher (Gmail, Facebook, Defender)
    // would deliver, even though the handler ignores it.
    const { NextRequest } = await import('next/server');
    void new NextRequest('https://example.com/auth/callback?code=real_code', {
      method: 'HEAD',
    });
    const { HEAD } = await import('@/app/auth/callback/route');
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
    const text = await res.text();
    expect(text).toBe('');
  });
});
