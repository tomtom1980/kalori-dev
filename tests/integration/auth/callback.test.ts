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
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
    from: mocks.from,
  }),
}));

async function invoke(url: string): Promise<Response> {
  const { GET } = await import('@/app/auth/callback/route');
  const request = new Request(url);
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
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('CALLBACK-MISSING-CODE: GET without ?code returns 307 to /login?error=callback', async () => {
    const res = await invoke('http://kalori.test/auth/callback');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('CALLBACK-EXCHANGE-ERROR: invalid code redirects to /login?error=callback', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid_request' },
    });

    const res = await invoke('http://kalori.test/auth/callback?code=invalid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=callback');
  });

  it('CALLBACK-ONBOARDING-INCOMPLETE: new user (null onboarding_completed_at) lands on /onboarding', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-new' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: null });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/onboarding');
    expect(location).not.toContain('/dashboard');
  });

  it('CALLBACK-ONBOARDING-COMPLETE: completed user lands on /dashboard', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-done' } } },
      error: null,
    });
    mockProfileQuery({ onboarding_completed_at: '2026-01-01T00:00:00Z' });

    const res = await invoke('http://kalori.test/auth/callback?code=valid');

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).not.toContain('/onboarding');
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
      data: { session: { user: { id: 'user-transient-err' } } },
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
  });
});
