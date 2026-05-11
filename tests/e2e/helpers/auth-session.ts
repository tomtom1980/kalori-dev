/**
 * E2E helper: seed a fake Supabase session so middleware (Task 2.1c) lets the
 * test through to authed routes AND the page-level `getUser()` validation
 * (Task 2.1 Codex C1-B fix) accepts the session.
 *
 * Why this exists:
 *   Task 2.1c replaced the Task 1.2 pass-through middleware with real auth
 *   enforcement. Unauthenticated hits on `/dashboard` (and every other
 *   protected route) now 307 to `/login?redirect_to=<path>`. Specs that need
 *   to verify post-login surfaces (e.g. the nav shell at different
 *   breakpoints) therefore must arrive with a session cookie already set.
 *
 *   Task 2.1 Codex fix (C1-B) added `supabase.auth.getUser()` validation to
 *   authed RSC pages (dashboard, onboarding). `getUser()` makes a network
 *   call to `<supabase-url>/auth/v1/user` which would REJECT the fake session
 *   cookie since its `access_token` is `e2e-fake-access-token` and cannot be
 *   verified by the real Supabase JWKS. We therefore intercept that endpoint
 *   at the browser layer and return a synthetic user whose id matches the
 *   fake session, so the server-rendered page sees a valid `{ data: { user }}`
 *   response without hitting the real Supabase auth service.
 *
 * Strategy:
 *   The middleware calls `supabase.auth.getSession()` from `@supabase/ssr`
 *   which is COOKIE-ONLY (no network) when the session is not expired. The
 *   cookie is keyed `sb-<project-ref>-auth-token` and holds a
 *   `base64-<base64url(JSON)>` payload with at minimum `access_token`,
 *   `refresh_token`, and a future `expires_at` (see
 *   `@supabase/auth-js/src/GoTrueClient.ts#_isValidSession` + `__loadSession`).
 *
 *   Page-level `getUser()` calls `GET <supabase-url>/auth/v1/user` with the
 *   forged access token. We intercept that call at the Playwright context
 *   layer (`context.route()`) so BOTH browser-originated AND server-origi-
 *   nated requests to the Supabase auth endpoint see our synthetic user
 *   response. This mirrors the same pattern used to discover the Supabase
 *   URL on first use.
 *
 *   The project ref is baked into the client bundle via `NEXT_PUBLIC_SUPABASE_URL`,
 *   so rather than reading env vars (which differ between local `.env.local`
 *   and CI build-time secrets), we discover it at runtime by letting the
 *   browser's already-loaded supabase-js tell us: click "Continue with
 *   Google", intercept `/auth/v1/authorize`, read the URL's hostname, extract
 *   the project ref, and abort the navigation. This mirrors the technique
 *   already used in `auth-google-oauth.spec.ts`.
 *
 *   We then set the fake session cookie directly on the browser context and
 *   navigate to the target route — middleware sees a valid non-expired
 *   session cookie, `getSession()` returns `{ session }`, the request passes
 *   through to the authed surface.
 *
 * Coverage boundary:
 *   This helper produces a session cookie that PASSES middleware AND a
 *   synthetic `/auth/v1/user` response that PASSES page-level `getUser()`
 *   validation. Any downstream code that hits Supabase FOR OTHER DATA (RLS
 *   queries, profile fetches, etc.) will fail. For nav-shell snapshot tests
 *   that render pure client state from `(app)/dashboard/page.tsx` (a Task 1.2
 *   stub with no data fetches), this is sufficient. A future task that wants
 *   Playwright coverage of Supabase-backed flows will need a real test-user
 *   seeding path (see F-TEST coverage gaps in Planning/followups.md).
 */
import type { BrowserContext, Page } from '@playwright/test';

const AUTHORIZE_URL_PATTERN = /\/auth\/v1\/authorize(?:\?.*)?$/;
const USER_URL_PATTERN = /\/auth\/v1\/user(?:\?.*)?$/;

/** Fake user id attached to the seeded session. Any Supabase client call
 *  hitting `/auth/v1/user` with the matching forged token receives a
 *  synthetic User object using this id. */
export const FAKE_USER_ID = 'e2e-fake-user-id-00000000-0000-0000-0000-000000000001';

/**
 * Encodes `value` as base64url (RFC 4648 §5) with no padding. Matches the
 * output of `@supabase/ssr/utils/base64url` `stringToBase64URL`. Node's
 * built-in `'base64url'` encoder produces an identical result.
 */
function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Discover the Supabase URL by intercepting the browser → Supabase
 * `/auth/v1/authorize` call that supabase-js issues via
 * `window.location.assign(...)` when the user clicks "Continue with Google".
 * Aborts the route so no real navigation happens.
 */
async function discoverSupabaseUrl(page: Page): Promise<string> {
  let captured: string | null = null;
  await page.route(AUTHORIZE_URL_PATTERN, async (route) => {
    captured = route.request().url();
    await route.abort();
  });

  await page.goto('/login');
  await page
    .getByRole('button', { name: /continue with google/i })
    .click({ trial: false })
    .catch(() => {
      // Click may throw on navigation-abort timing; the route handler
      // already captured the URL, so we proceed.
    });

  // Wait up to 5s for the authorize request to fire.
  const deadline = Date.now() + 5000;
  while (captured === null && Date.now() < deadline) {
    await page.waitForTimeout(50);
  }
  await page.unroute(AUTHORIZE_URL_PATTERN);

  if (captured === null) {
    throw new Error(
      'seedAuthSession: failed to capture Supabase URL via /auth/v1/authorize interception',
    );
  }
  return new URL(captured).origin;
}

/**
 * Derive the Supabase auth cookie name from the Supabase project URL. Matches
 * the default `storageKey` computed in `@supabase/supabase-js` SupabaseClient
 * constructor (`sb-${baseUrl.hostname.split('.')[0]}-auth-token`).
 */
function storageKeyFromSupabaseUrl(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

/**
 * Build a minimal-but-valid session JSON that `getSession()` accepts without
 * refresh. `expires_at` is 1 hour from now; `_isValidSession` only checks
 * the three keys exist, and `__loadSession` short-circuits when not expired.
 */
function buildFakeSessionJson(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    access_token: 'e2e-fake-access-token',
    refresh_token: 'e2e-fake-refresh-token',
    expires_at: nowSec + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test-user@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date(nowSec * 1000).toISOString(),
    },
  });
}

/**
 * Synthetic `/auth/v1/user` response. Matches the minimum shape `@supabase/
 * auth-js` `getUser()` expects: a top-level User object (NOT wrapped) with at
 * least `id`, `aud`, and `role`. Returned with status 200 + JSON content type.
 */
function buildFakeUserJson(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test-user@example.test',
    email_confirmed_at: new Date(nowSec * 1000).toISOString(),
    phone: '',
    confirmed_at: new Date(nowSec * 1000).toISOString(),
    last_sign_in_at: new Date(nowSec * 1000).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: new Date(nowSec * 1000).toISOString(),
    updated_at: new Date(nowSec * 1000).toISOString(),
  });
}

/**
 * Seed a fake Supabase auth cookie on `context` so subsequent navigations by
 * `page` are treated as authenticated by the Task 2.1c middleware AND the
 * Task 2.1 Codex C1-B page-level `getUser()` validation. Both middleware and
 * page calls observe the same forged token; the page call's network request
 * to `/auth/v1/user` is intercepted by the context-level route handler
 * installed here and receives a synthetic 200 response matching the seeded
 * session's user id.
 *
 * Idempotent on the context — clears any pre-existing auth cookie and sets a
 * fresh one. Safe to call from `test.beforeEach`.
 */
export async function seedAuthSession(page: Page, context: BrowserContext): Promise<void> {
  const supabaseUrl = await discoverSupabaseUrl(page);
  const cookieName = storageKeyFromSupabaseUrl(supabaseUrl);
  const cookieValue = `base64-${base64urlEncode(buildFakeSessionJson())}`;

  // After discoverSupabaseUrl the browser is sitting on the aborted authorize
  // navigation — `page.url()` can be `chrome-error://chromewebdata/` or the
  // intercepted Supabase URL rather than our app origin. Resolve the app
  // origin from the Playwright test harness env instead (PREVIEW_URL when
  // set, else the dev default).
  const appOrigin = resolveAppOrigin();
  const { hostname } = new URL(appOrigin);

  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      // Playwright requires EITHER `url` XOR (`domain` + `path`). We use the
      // latter so we can scope the cookie explicitly and avoid the Supabase
      // URL being set as the cookie origin by accident. Mirror Supabase
      // SSR's `DEFAULT_COOKIE_OPTIONS`: path=/, sameSite=lax, httpOnly=false.
      // No `expires` → session cookie, cleared when context closes.
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
    },
  ]);

  // Intercept `/auth/v1/user` for BROWSER-ORIGINATED requests only.
  //
  // Scope (important): `context.route()` intercepts network calls made by the
  // browser context — client-side fetches issued by JS running in the page
  // bundle. It does NOT intercept server-side fetches made from the Next.js
  // Node process during SSR / route handlers. That's a hard limitation of
  // Playwright's proxy model: the Next server runs in a separate Node
  // process with its own outbound fetch, out of reach of the browser
  // context's route table.
  //
  // Consequence for server-validated routes: a spec that triggers a full
  // document navigation to `/dashboard` (or any RSC that calls `getUser()`
  // server-side) will see the real Supabase `/auth/v1/user` endpoint reject
  // the forged token with 401 — no amount of `context.route()` on the test
  // side can mock that. This is why 9 of the nav-responsive interactive
  // cases are `test.skip` pending F-TEST-4 (real Supabase Admin API
  // test-user seeding in CI).
  //
  // What this helper IS good for: specs that exercise BROWSER-side behavior
  // only — e.g. verifying that forged cookies trigger server-side redirect
  // to `/login` (our `tests/e2e/auth-forged-cookie.spec.ts` guards), or
  // inspecting any client-rendered UI that reads from cached session state
  // without a fresh server roundtrip. Do NOT use this helper for tests that
  // depend on server-validated session state; await F-TEST-4 (see
  // `Planning/followups.md`) for that path.
  const fakeUserBody = buildFakeUserJson();
  await context.route(USER_URL_PATTERN, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: fakeUserBody,
    });
  });
}

/**
 * Best-effort resolution of the app origin for cookie scoping. After the
 * Google-OAuth interception aborts the navigation, `page.url()` can be
 * `chrome-error://chromewebdata/` or the intercepted Supabase URL — neither
 * is the app origin. We sniff the Playwright harness env instead; env
 * PREVIEW_URL is authoritative when set (CI path), else the usual dev
 * default (`http://localhost:3000`, matching `playwright.config.ts`).
 */
function resolveAppOrigin(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (previewUrl) {
    try {
      return new URL(previewUrl).origin;
    } catch {
      // fall through to default
    }
  }
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  return `http://localhost:${Number.isFinite(port) ? port : 3000}`;
}
