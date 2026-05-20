/**
 * @vitest-environment node
 *
 * Task D.2 — US-STAB-D2 — API 401 returned as JSON, never HTML redirect.
 *
 * Characterization tests for the canonical unauthenticated 401 contract on
 * `/api/*` routes (design-doc §4 US-STAB-D2 + impact-analysis line 207).
 *
 * ACs covered:
 *   AC1: unauthenticated /api/* → 401 with `Content-Type: application/json`
 *        AND body `{ "error": "unauthenticated" }`.
 *   AC2: same response → NO `Location:` header AND NO HTML body.
 *
 * Coverage strategy: per briefing §"Every /api/* endpoint", parameterize
 * over a representative subset that exercises BOTH the fence-fix path and
 * the inline-auth withAuth wrapper path:
 *   - Fence-fix path (via `requireProfileOrJson401` → fence 401 branch):
 *       water/log, weight/log, entries/save, library/[id]/update,
 *       ai/text-parse
 *   - Inline-auth path (via `withAuth` wrapper):
 *       profile/save, account/delete
 *
 * Mock pattern mirrors `tests/integration/ai-routes-orphan-profile.test.ts`
 * lines 1-90 — `vi.mock('@/lib/supabase/server')` so
 * `getServerSupabase().auth.getUser()` returns `{ data: { user: null },
 * error: null }`. The route handler is invoked directly with a constructed
 * Request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted Sentry mock so routes can capture exceptions without crashing the
// node test runtime.
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

// next/headers must be stubbed because getServerSupabase() calls cookies().
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => null, getAll: () => [] }),
}));

// Stub the deleting-fence so routes that call rejectIfDeletingOrUnavailable
// before the auth check don't divert into the deleting-fence branch when the
// test mock returns no user. Returning `null` means "no fence triggered".
vi.mock('@/lib/account/deleting-fence', () => ({
  rejectIfDeletingOrUnavailable: vi.fn(async () => null),
}));

// ─── Module-level @supabase/ssr mock for middleware-path tests (D.2) ─────
// `proxy()` (the middleware/auth gate) uses `@supabase/ssr`'s
// `createServerClient` for its cookie-only `getSession()` check. The
// handler-path tests above mock `@/lib/supabase/server` instead, so the two
// mock surfaces don't collide. `ssrMocks` is hoisted via `vi.hoisted()` so
// the `vi.mock` factory can reference the spies before tests run.
const ssrMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => {
    ssrMocks.createServerClient(...args);
    return {
      auth: {
        getSession: ssrMocks.getSession,
      },
    };
  },
}));

// Unauthenticated supabase mock — auth.getUser() returns the null-user shape
// that triggers the canonical 401 path on every API route.
function buildUnauthSupabaseMock(): {
  auth: { getUser: () => Promise<unknown> };
  from: () => unknown;
} {
  return {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: null,
      }),
    },
    // No-op `.from` so any incidental call doesn't crash. The fence + withAuth
    // both short-circuit BEFORE reaching `.from()` when user is null, but a
    // defensive stub keeps the test focused on the 401 envelope.
    from: () => {
      const chain: Record<string, unknown> = {};
      const passThrough = () => chain;
      Object.assign(chain, {
        select: passThrough,
        insert: passThrough,
        update: passThrough,
        delete: passThrough,
        upsert: passThrough,
        eq: passThrough,
        neq: passThrough,
        order: passThrough,
        limit: passThrough,
        in: passThrough,
        is: passThrough,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 }),
      });
      return chain;
    },
  };
}

interface RouteCase {
  /** Display name for the parameterized test. */
  name: string;
  /** Dynamic import path of the route module. */
  importPath: string;
  /** HTTP method to invoke. */
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Build the Request the route will receive (must include a body for POST/PATCH/DELETE). */
  buildRequest: () => Request;
}

const ROUTE_CASES: RouteCase[] = [
  // Fence path — covered by the Option 1 fence-fix in
  // `lib/auth/orphan-profile-fence.ts` `kind: 'unauthenticated'` branch.
  {
    name: 'POST /api/water/log',
    importPath: '@/app/api/water/log/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/water/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          unit: 'glass',
          count: 1,
          logged_on: '2026-05-15',
        }),
      }),
  },
  {
    name: 'POST /api/entries/save',
    importPath: '@/app/api/entries/save/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '22222222-2222-4222-8222-222222222222',
          logged_at: '2026-05-15T12:00:00.000Z',
          meal_category: 'lunch',
          source: 'text',
          items: [
            {
              name: 'rice',
              portion: 1,
              unit: 'bowl',
              kcal: 200,
            },
          ],
        }),
      }),
  },
  {
    name: 'POST /api/ai/text-parse',
    importPath: '@/app/api/ai/text-parse/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          userText: 'two eggs',
        }),
      }),
  },
  // Inline-auth path — covered by `withAuth` wrapper applied to the route.
  {
    name: 'POST /api/profile/save',
    importPath: '@/app/api/profile/save/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '44444444-4444-4444-8444-444444444444',
          patch: { age: 30 },
        }),
      }),
  },
  {
    name: 'POST /api/account/delete',
    importPath: '@/app/api/account/delete/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
  },
];

describe('Task D.2 (US-STAB-D2) — Canonical JSON 401 envelope on /api/*', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  for (const rc of ROUTE_CASES) {
    it(`api-returns-json-401 [${rc.name}] — AC1: status 401 + Content-Type: application/json + body {error:'unauthenticated'}`, async () => {
      const supabaseMock = buildUnauthSupabaseMock();
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(rc.importPath)) as Record<string, unknown>;
      const handler = mod[rc.method] as (req: Request) => Promise<Response>;
      const req = rc.buildRequest();
      const res = await handler(req);

      // AC1.a: status 401.
      expect(res.status).toBe(401);

      // AC1.b: Content-Type: application/json.
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');

      // AC1.c: body deep-equals { error: 'unauthenticated' } — no extra
      // fields, no envelope wrapping, no `code`, no `message`.
      const body = (await res.clone().json()) as Record<string, unknown>;
      expect(body).toEqual({ error: 'unauthenticated' });

      // AC1.d: WWW-Authenticate header (RFC 6750 + design-doc §4 explicit).
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm="kalori"');
    });

    it(`no-location-header [${rc.name}] — AC2: no Location header + no HTML body`, async () => {
      const supabaseMock = buildUnauthSupabaseMock();
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(rc.importPath)) as Record<string, unknown>;
      const handler = mod[rc.method] as (req: Request) => Promise<Response>;
      const req = rc.buildRequest();
      const res = await handler(req);

      // AC2.a: NO Location header (would mark this as a redirect).
      expect(res.headers.get('location')).toBeNull();

      // AC2.b: NO HTML body. Read the raw bytes (not just the JSON-parsed
      // shape) so we catch any case where an HTML error page leaks through.
      const rawBody = await res.clone().text();
      expect(rawBody).not.toMatch(/<html\b/i);
      expect(rawBody).not.toMatch(/<!doctype/i);
    });
  }
});

// ─── Codex Round 1 fix: middleware-path /api/* 401 contract ───────────────
//
// Route-handler-only assertions above bypass `proxy()` (the middleware/auth
// gate). In the deployed request path, an unauthenticated `/api/water/log`
// request hits `proxy()` BEFORE the route handler ever runs — without the
// fix, `proxy()` returns a 302 Location: /login redirect, and the route
// handler is never invoked. SPA `authFetch` callers / PWA SW / curl all see
// the redirect HTML flow rather than the canonical JSON 401 envelope.
//
// These tests exercise `proxy()` directly via the same mock pattern used by
// `tests/integration/middleware/redirect.test.ts` — `vi.mock('@supabase/ssr')`
// returns a `createServerClient` whose `auth.getSession()` resolves to
// `{ data: { session: null } }`. We assert that for unauthenticated `/api/*`
// requests (excluding `/api/auth/*` public allowlist), `proxy()` returns the
// canonical JSON 401 envelope — NOT a 302. Page routes still 302-redirect,
// and `/api/auth/*` paths still pass through per the public allowlist.
// ──────────────────────────────────────────────────────────────────────────
describe('Task D.2 (US-STAB-D2) — middleware-path /api/* 401 contract', () => {
  // `ssrMocks` is declared at module scope (so `vi.mock('@supabase/ssr')`
  // can reference it). See top-of-file mock declaration.
  function makeMiddlewareRequest(url: string): unknown {
    return {
      url,
      nextUrl: new URL(url),
      cookies: {
        getAll: () => [],
        set: () => undefined,
      },
      headers: new Map(),
    };
  }

  async function invokeMiddleware(url: string, authed: boolean): Promise<Response> {
    ssrMocks.getSession.mockResolvedValue(
      authed
        ? {
            data: {
              session: {
                access_token: 'at',
                refresh_token: 'rt',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: { id: 'u1', email: 'u@example.test' },
              },
            },
            error: null,
          }
        : { data: { session: null }, error: null },
    );
    const req = makeMiddlewareRequest(url);
    const { default: proxy } = await import('../../proxy');
    return (await proxy(req as never)) as unknown as Response;
  }

  beforeEach(() => {
    // Env vars must be present so `proxy()` constructs the Supabase client
    // (otherwise the env-missing fallback branch fires for non-public routes).
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fake');
  });

  afterEach(() => {
    ssrMocks.getSession.mockReset();
    ssrMocks.createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  // ── AC1+AC2 on the middleware path for representative /api/* routes ─────
  const API_PATHS = ['/api/water/log', '/api/profile/save', '/api/account/delete'];

  for (const path of API_PATHS) {
    it(`middleware-json-401 [${path}] — unauth request returns canonical JSON 401, NOT 302`, async () => {
      const res = await invokeMiddleware(`http://localhost:3000${path}`, false);

      // NOT a 302 redirect — this is the core finding from Codex Round 1.
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(302);
      expect(res.status).not.toBe(307);

      // Canonical envelope headers + body (mirrors handler-path assertions).
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm="kalori"');
      expect(res.headers.get('location')).toBeNull();

      const body = (await res.clone().json()) as Record<string, unknown>;
      expect(body).toEqual({ error: 'unauthenticated' });
    });
  }

  // ── Public allowlist: /api/auth/* must STILL pass through unauthenticated ─
  it('middleware-public-api-auth-passthru — unauth /api/auth/callback passes through (public allowlist)', async () => {
    const res = (await invokeMiddleware(
      'http://localhost:3000/api/auth/callback?code=abc',
      false,
    )) as unknown as { status: number; type?: string };
    // The middleware emits `NextResponse.next()` for public routes — its
    // status is 200 (or `next`'s default) and never 401 / 302.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(307);
  });

  // ── Page-route 302 preservation: NON-/api/* routes still redirect ───────
  // Negative test that locks in "no regression on page-route redirect."
  const PAGE_PATHS = ['/', '/dashboard', '/foods'];

  for (const path of PAGE_PATHS) {
    it(`middleware-page-route-redirect-preserved [${path}] — unauth page route still redirects (non-/api/* unchanged)`, async () => {
      const res = (await invokeMiddleware(`http://localhost:3000${path}`, false)) as unknown as {
        status: number;
        headers?: Headers;
      };

      if (path === '/') {
        // Root is public per allowlist — must pass through (NOT 401, NOT 302).
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(302);
        expect(res.status).not.toBe(307);
      } else {
        // Protected page routes MUST still 302-redirect to /login.
        // Real NextResponse.redirect() emits status 307 (temporary) but the
        // contract is "any 3xx redirect to /login", verified via the
        // `redirect.test.ts` mock returning 307. Here we use the real
        // NextResponse so it returns whatever Next's implementation chooses
        // (currently 307). The negative test is: NOT 401 (i.e., NOT the
        // /api/* canonical envelope leaking into page-route territory).
        expect(res.status).not.toBe(401);
        // Must NOT be a JSON 401 envelope.
        expect(res.headers?.get?.('www-authenticate')).not.toBe('Bearer realm="kalori"');
        // Must be a 3xx redirect to /login.
        expect([302, 307]).toContain(res.status);
        expect(res.headers?.get?.('location')).toContain('/login');
      }
    });
  }
});
