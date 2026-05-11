/**
 * I6 — Middleware redirect contract (Task 2.1c).
 *
 * Replaces the Task 1.2 pass-through R1 pin. Post-R1 implementation, the
 * middleware MUST:
 *   - Read the session via `@supabase/ssr` `createServerClient` +
 *     `supabase.auth.getSession()` (cookie-only; no network roundtrip).
 *   - Redirect unauthenticated hits on protected routes to
 *     `/login?redirect_to=<original>`.
 *   - Redirect authenticated hits on `/login` to `/dashboard` (onboarding
 *     split is decided in the callback route / dashboard page; middleware
 *     just kicks the user off the login page).
 *   - Let PUBLIC_ROUTES pass through for BOTH signed-in and signed-out users
 *     EXCEPT the `/login` case above (so signed-in users don't sit on the
 *     sign-in screen).
 *   - Never block static-asset traffic (`_next/static`, images, favicon);
 *     this is enforced by the matcher config, not the redirect logic.
 *
 * Test naming: every case is prefixed `I6-REDIRECT-*` so the suite greps
 * cleanly against design-doc §18.2 I6.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MiddlewareResponse = {
  type: 'next' | 'redirect';
  status: number;
  redirectUrl?: string;
};

/**
 * Shared mock state — hoisted so the `vi.mock` factories below can reference
 * them BEFORE the top-level describe body executes. Resetting per-test avoids
 * leakage between I6-* cases.
 */
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  nextSpy: vi.fn(),
  redirectSpy: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextResponse {
    public cookies = {
      getAll: vi.fn(() => []),
      set: vi.fn(),
    };
    public headers = new Map<string, string>();
    public status = 200;
    public type: 'next' | 'redirect' = 'next';
    public redirectUrl: string | undefined;
    constructor(public init?: Record<string, unknown>) {}
    static next() {
      mocks.nextSpy();
      return new MockNextResponse({ kind: 'next' });
    }
    static redirect(url: URL | string) {
      mocks.redirectSpy(url);
      const res = new MockNextResponse({ kind: 'redirect', url });
      res.status = 307;
      res.type = 'redirect';
      res.redirectUrl = url instanceof URL ? url.toString() : url;
      return res;
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock('@supabase/ssr', () => {
  return {
    createServerClient: (...args: unknown[]) => {
      mocks.createServerClient(...args);
      return {
        auth: {
          getSession: mocks.getSession,
          getUser: mocks.getUser,
        },
      };
    },
  };
});

interface MockRequestInit {
  url: string;
  cookies?: Array<{ name: string; value: string }>;
}

function makeRequest({ url, cookies = [] }: MockRequestInit): unknown {
  return {
    url,
    nextUrl: new URL(url),
    cookies: {
      getAll: () => cookies,
      set: () => undefined,
    },
    headers: new Map(),
  };
}

const FAKE_SESSION = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u1', email: 'u@example.test' },
};

async function invoke(url: string, authed: boolean): Promise<MiddlewareResponse> {
  const req = makeRequest({ url });
  if (authed) {
    mocks.getSession.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
  } else {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  }
  const { middleware } = await import('../../../middleware');
  const res = (await middleware(req as never)) as unknown as MiddlewareResponse;
  return res;
}

describe('I6 — middleware redirect contract (Task 2.1c)', () => {
  beforeEach(() => {
    // Ensure Supabase env vars are present so `createServerClient` is actually
    // constructed inside the middleware — otherwise the pass-through short-
    // circuit kicks in and we never see the redirect logic. Restored by
    // afterEach via Vitest's stubEnv/unstubAllEnvs.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fake');
  });

  afterEach(() => {
    mocks.getSession.mockReset();
    mocks.getUser.mockReset();
    mocks.nextSpy.mockReset();
    mocks.redirectSpy.mockReset();
    mocks.createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  // ── Unauthenticated user ───────────────────────────────────────────────
  it('I6-REDIRECT-UNAUTHED-DASHBOARD: redirects /dashboard to /login?redirect_to=/dashboard', async () => {
    const res = await invoke('http://localhost:3000/dashboard', false);
    expect(res.type).toBe('redirect');
    expect(res.status).toBe(307);
    expect(res.redirectUrl).toContain('/login');
    expect(res.redirectUrl).toContain('redirect_to=%2Fdashboard');
  });

  it('I6-REDIRECT-UNAUTHED-ONBOARDING: redirects /onboarding to /login?redirect_to=/onboarding', async () => {
    const res = await invoke('http://localhost:3000/onboarding', false);
    expect(res.type).toBe('redirect');
    expect(res.redirectUrl).toContain('/login');
    expect(res.redirectUrl).toContain('redirect_to=%2Fonboarding');
  });

  it('I6-REDIRECT-UNAUTHED-NESTED: preserves full path in redirect_to for nested routes', async () => {
    const res = await invoke('http://localhost:3000/library/entries/42', false);
    expect(res.type).toBe('redirect');
    expect(res.redirectUrl).toContain('redirect_to=%2Flibrary%2Fentries%2F42');
  });

  it('I6-REDIRECT-UNAUTHED-LOGIN-PASSTHRU: lets unauthed /login through without redirect', async () => {
    const res = await invoke('http://localhost:3000/login', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-UNAUTHED-ROOT-PASSTHRU: lets unauthed / (marketing) through', async () => {
    const res = await invoke('http://localhost:3000/', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-UNAUTHED-CALLBACK-PASSTHRU: lets unauthed /auth/callback?code=x through (OAuth exchange)', async () => {
    const res = await invoke('http://localhost:3000/auth/callback?code=abc123', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  // ── PWA shell pass-through (Task 5.1.2 Codex Round 2 Critical #1) ──────
  // The Service Worker install fetch, the Web App Manifest, and the offline
  // navigation fallback MUST be reachable for unauthenticated visitors —
  // otherwise the SW caches a /login redirect as "offline", manifest fetch
  // 302s, and the whole PWA contract collapses.
  it('I6-REDIRECT-UNAUTHED-SW-PASSTHRU: lets unauthed /sw.js through (PWA install)', async () => {
    const res = await invoke('http://localhost:3000/sw.js', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-UNAUTHED-MANIFEST-PASSTHRU: lets unauthed /manifest.json through (PWA manifest)', async () => {
    const res = await invoke('http://localhost:3000/manifest.json', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-UNAUTHED-OFFLINE-PASSTHRU: lets unauthed /offline through (SW navigation fallback)', async () => {
    const res = await invoke('http://localhost:3000/offline', false);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  // ── Authenticated user ─────────────────────────────────────────────────
  it('I6-REDIRECT-AUTHED-LOGIN: redirects authed /login to /dashboard', async () => {
    const res = await invoke('http://localhost:3000/login', true);
    expect(res.type).toBe('redirect');
    expect(res.redirectUrl).toContain('/dashboard');
    // Must NOT carry the redirect_to param when kicking the user off /login
    // (it would loop back to /login if it did).
    expect(res.redirectUrl).not.toContain('redirect_to');
  });

  it('I6-REDIRECT-AUTHED-LOGIN-SESSION-EXPIRED-PASSTHRU: authed /login?reason=session_expired is let through (C1-B loop breaker)', async () => {
    // When an authed RSC page's `getUser()` validation fails, the page
    // redirects here with `?reason=session_expired`. Middleware MUST NOT
    // bounce back to /dashboard (the forged cookie would loop). Instead
    // let /login render so the user can start a fresh sign-in.
    const res = await invoke('http://localhost:3000/login?reason=session_expired', true);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-AUTHED-DASHBOARD-PASSTHRU: lets authed /dashboard through', async () => {
    const res = await invoke('http://localhost:3000/dashboard', true);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  it('I6-REDIRECT-AUTHED-PROFILE-API-PASSTHRU: lets authed /api/profile/save through (non-public, authed)', async () => {
    const res = await invoke('http://localhost:3000/api/profile/save', true);
    expect(res.type).toBe('next');
    expect(mocks.redirectSpy).not.toHaveBeenCalled();
  });

  // ── Matcher contract ───────────────────────────────────────────────────
  it('exports a matcher that ignores Next internal + static assets', async () => {
    const middlewareModule = await import('../../../middleware');
    expect(middlewareModule.config).toBeDefined();
    const matcher = middlewareModule.config.matcher;
    const asArray = Array.isArray(matcher) ? matcher : [matcher];
    expect(asArray.join(' ')).toMatch(/_next\/static|_next\/image|favicon/);
  });
});
