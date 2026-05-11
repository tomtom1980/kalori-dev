/**
 * E2E: Google OAuth sign-in flow (Task 2.1e).
 *
 * Coverage boundary (intentional):
 *   Google's hosted consent screen (`accounts.google.com/...`) cannot be
 *   driven from a CI Playwright job without credentials — and we must NOT
 *   exercise real Google OAuth from tests (would burn the single "Testing
 *   mode" test user allowlisted in Google Cloud Console). Supabase's own
 *   server-side token exchange is invoked in a SERVER route
 *   (`app/auth/callback/route.ts`), which also cannot be mocked from the
 *   browser via `page.route()`.
 *
 *   supabase-js implements `signInWithOAuth` as:
 *     (a) compute the authorize URL client-side, then
 *     (b) `window.location.assign(url)`
 *   It does NOT make an intervening HTTP call, so Playwright cannot
 *   intercept "the request" — only the resulting navigation. We therefore
 *   intercept the browser's navigation to `${SUPABASE_URL}/auth/v1/authorize`
 *   and synthesize a redirect back to our callback with an invalid code.
 *   The callback's server-side error branch then lands the user at
 *   `/login?error=callback`, which proves the full outbound leg was wired
 *   correctly WITHOUT needing real Google credentials OR a live Supabase.
 *
 *   Happy-path success (code exchange → session → /onboarding or /dashboard)
 *   is covered by:
 *     - Vitest integration: tests/integration/middleware/redirect.test.ts +
 *       the Supabase-mocked callback tests (Task 2.1c)
 *     - Vitest unit:        app/auth/callback path logic (Task 2.1c)
 *   Replicating that at the Playwright layer would require either a live
 *   Supabase test project hit from CI (cost + flake) or injecting a
 *   test-only server hook into production code (scope / security hazard).
 *
 * Local-Windows note (F-ENV-2):
 *   Playwright + Next build are blocked locally on Windows by `spawn EPERM`.
 *   This spec is designed to run on CI Linux. See `.github/workflows/ci.yml`
 *   > `e2e` job.
 */
import { expect, test } from '@playwright/test';

import { t } from '@/lib/i18n/en';

const AUTHORIZE_URL_PATTERN = /\/auth\/v1\/authorize(?:\?.*)?$/;

test.describe('auth · Google OAuth', () => {
  test('clicking Continue with Google navigates to Supabase authorize with provider=google', async ({
    page,
  }) => {
    // Intercept the browser's navigation to Supabase's authorize endpoint.
    // The real flow is: Supabase 302 → Google consent → Supabase callback →
    // our `/auth/callback`. We short-circuit by responding with a direct
    // redirect to our callback. The callback will fail the code exchange
    // (no real session), which is fine — that error path is already covered
    // by the magic-link spec. Here we only assert the outbound leg is wired
    // correctly.
    let authorizeHitCount = 0;
    let capturedUrl: string | null = null;
    await page.route(AUTHORIZE_URL_PATTERN, async (route) => {
      authorizeHitCount += 1;
      capturedUrl = route.request().url();
      const origin = new URL(page.url()).origin;
      await route.fulfill({
        status: 302,
        headers: {
          location: `${origin}/auth/callback?code=invalid-synthetic-oauth-code`,
        },
      });
    });

    await page.goto('/login');

    const googleButton = page.getByRole('button', {
      name: new RegExp(t.auth.continueWithGoogle, 'i'),
    });
    await expect(googleButton).toBeVisible();

    // Click and wait for the terminal URL. The pathway is:
    //   /login → Supabase /auth/v1/authorize (intercepted → 302) →
    //   /auth/callback?code=invalid → /login?error=callback
    await Promise.all([
      page.waitForURL(/\/login\?error=callback/, { timeout: 15_000 }),
      googleButton.click(),
    ]);

    // We intercepted the authorize call exactly once.
    expect(authorizeHitCount).toBe(1);
    expect(capturedUrl).not.toBeNull();
    const authorizeUrl = new URL(capturedUrl as unknown as string);
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    // Supabase's SDK names this parameter `redirect_to` (not `redirectTo`).
    const redirectTo = authorizeUrl.searchParams.get('redirect_to');
    expect(redirectTo ?? '').toContain('/auth/callback');

    // And the callback error branch surfaced the right copy.
    await expect(page.getByText(t.auth.errorCallback)).toBeVisible();
  });

  test('Google button remains visible and accessible on the login page', async ({ page }) => {
    // Regression guard for the button existing + being keyboard-accessible
    // independent of click handler wiring. If Task 2.2 refactors the sign-in
    // surface we want an early signal.
    await page.goto('/login');

    const googleButton = page.getByRole('button', {
      name: new RegExp(t.auth.continueWithGoogle, 'i'),
    });
    await expect(googleButton).toBeVisible();
    // 44×44 minimum hit target (design-doc §6 + ui-design §7.8.2).
    const box = await googleButton.boundingBox();
    expect(box, 'google button bounding box').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
