/**
 * E2E: Task 2.1 Codex C1-B regression guard — forged session cookie without
 * `/auth/v1/user` mock MUST be rejected by the page-level `getUser()` check.
 *
 * Context:
 *   Task 2.1c's middleware performs a cheap cookie-shape check via
 *   `getSession()` — this is `@supabase/ssr`'s cookie-only path, which a
 *   forged (but well-shaped, non-expired) cookie can pass.
 *
 *   Task 2.1 Codex fix (C1-B) closed this gap by adding `supabase.auth.
 *   getUser()` validation to authed RSC pages (dashboard, onboarding).
 *   `getUser()` cryptographically verifies the access token against
 *   Supabase's `/auth/v1/user` endpoint; a forged token is rejected with
 *   401 and the page `redirect()`s to `/login`.
 *
 * What this spec proves:
 *   With only the session cookie seeded (NO `/auth/v1/user` mock), a hit on
 *   `/dashboard` must end up on `/login` with `redirect_to=%2Fdashboard`
 *   because the server-side `getUser()` call fails validation.
 *
 *   This is the inverse of the nav-responsive spec pattern: that spec uses
 *   the full `seedAuthSession()` helper which both seeds the cookie AND
 *   installs the `/auth/v1/user` mock. Here we seed ONLY the cookie so the
 *   page-level check has no mock to fall back on.
 *
 * Coverage boundary:
 *   The `context.route()` mock in the helper only intercepts browser-
 *   originated fetches. Real server-side (`getServerSupabase().auth.
 *   getUser()`) fetches from the Next.js process are NOT intercepted,
 *   meaning this test relies on the real Supabase `/auth/v1/user` endpoint
 *   returning 401 for a forged token. This is the expected behavior of a
 *   valid Supabase project and is what makes the C1-B protection genuine.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const AUTHORIZE_URL_PATTERN = /\/auth\/v1\/authorize(?:\?.*)?$/;

function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function buildFakeSessionJson(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    access_token: 'e2e-fake-access-token',
    refresh_token: 'e2e-fake-refresh-token',
    expires_at: nowSec + 3600,
    expires_in: 3600,
    token_type: 'bearer',
  });
}

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
      // navigation-abort timing; route handler already captured the URL.
    });

  const deadline = Date.now() + 5000;
  while (captured === null && Date.now() < deadline) {
    await page.waitForTimeout(50);
  }
  await page.unroute(AUTHORIZE_URL_PATTERN);

  if (captured === null) {
    throw new Error('auth-forged-cookie: failed to capture Supabase URL');
  }
  return new URL(captured).origin;
}

function resolveAppOrigin(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (previewUrl) {
    try {
      return new URL(previewUrl).origin;
    } catch {
      // fall through
    }
  }
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  return `http://localhost:${Number.isFinite(port) ? port : 3000}`;
}

async function seedCookieOnly(page: Page, context: BrowserContext): Promise<void> {
  const supabaseUrl = await discoverSupabaseUrl(page);
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = `base64-${base64urlEncode(buildFakeSessionJson())}`;

  const appOrigin = resolveAppOrigin();
  const { hostname } = new URL(appOrigin);

  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
    },
  ]);
  // Intentionally NOT installing the /auth/v1/user intercept — that's the
  // whole point of this spec.
}

test.describe('C1-B regression guard', () => {
  test('forged session cookie without /auth/v1/user intercept → /dashboard redirects to /login', async ({
    page,
    context,
  }) => {
    await seedCookieOnly(page, context);

    const response = await page.goto('/dashboard');

    // The page-level `getUser()` rejects the forged token and the auth
    // guard responds with `redirect('/login?reason=session_expired&...')`.
    // In Next 16's RSC-redirect flow that lands at the client as a 200
    // response carrying a `next-router-redirect` payload — `page.goto()`
    // resolves before the client-side router commits the new URL, so we
    // wait for the URL change explicitly rather than reading
    // `page.url()` synchronously.
    await page.waitForURL(/\/login\?.*redirect_to=/, { timeout: 5000 });
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('redirect_to');
    expect(response?.status()).toBeLessThan(400);
  });

  test('forged session cookie without /auth/v1/user intercept → /onboarding redirects to /login', async ({
    page,
    context,
  }) => {
    await seedCookieOnly(page, context);

    const response = await page.goto('/onboarding');

    // Same RSC-redirect timing as the /dashboard case — see comment above.
    await page.waitForURL(/\/login\?.*redirect_to=/, { timeout: 5000 });
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('redirect_to');
    expect(response?.status()).toBeLessThan(400);
  });
});
