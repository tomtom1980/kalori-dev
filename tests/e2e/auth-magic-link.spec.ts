/**
 * E2E: magic-link sign-in flow (Task 2.1e).
 *
 * Coverage boundary (intentional):
 *   Full end-to-end magic-link flow requires a live Supabase project + a
 *   mailbox stub that intercepts the emailed link and a way to click it.
 *   Neither are reachable from a plain Playwright CI job without either
 *   (a) seeding a real test user via the Supabase Admin API + generating a
 *       real link via `admin.generateLink`, or
 *   (b) faking the entire `exchangeCodeForSession` server round-trip, which
 *       is called SERVER-SIDE from `app/auth/callback/route.ts` and cannot
 *       be intercepted from the browser with `page.route()`.
 *
 *   This spec therefore verifies the pieces that Playwright CAN assert
 *   deterministically without live Supabase — the BROWSER-ORIGINATED Supabase
 *   API calls + the in-app redirect behavior:
 *
 *     1. magic-link happy path (form → Supabase `auth/v1/otp` POST) and the
 *        success state renders
 *     2. redirect-to-login on magic-link-error (invalid code arriving at
 *        `/auth/callback` → user lands at `/login?error=callback`)
 *     3. middleware I6 redirect when unauthenticated — the post-sign-in
 *        redirect target is governed by middleware + the auth callback route
 *        already covered by Vitest integration tests
 *        (tests/integration/middleware/redirect.test.ts + the Supabase-mocked
 *         callback tests), so this spec asserts only the observable
 *         user-facing routing.
 *
 *   The REDIRECT from /auth/callback to either /onboarding (new user) or
 *   /dashboard (returning user) is verified in the Vitest integration tier;
 *   replicating it in Playwright would require stubbing the server-side
 *   Supabase call, which pulls server-side test hooks into production code.
 *   Scope discipline wins here: the unit + integration tests already
 *   exercise the server logic. This spec exercises what users can see.
 *
 * Local-Windows note (F-ENV-2):
 *   Playwright + Next build are blocked locally on Windows by `spawn EPERM`.
 *   This spec is designed to run on CI Linux (Ubuntu runner). See
 *   `.github/workflows/ci.yml` > `e2e` job.
 */
import { expect, test } from '@playwright/test';

import { t } from '@/lib/i18n/en';

test.describe('auth · magic link', () => {
  test('dispatches Supabase signInWithOtp and shows the success state', async ({ page }) => {
    // Intercept the browser → Supabase /auth/v1/otp call so the test does
    // not send a real magic-link email. Respond with a 200 which mirrors
    // Supabase's real success body shape. Note: supabase-js sends the
    // email in the JSON body and encodes `emailRedirectTo` as the
    // `redirect_to` URL query param, not inside `options`.
    let otpCallCount = 0;
    let otpRequestBody: Record<string, unknown> | null = null;
    let otpRequestUrl: string | null = null;
    await page.route(/\/auth\/v1\/otp(?:\?.*)?$/, async (route) => {
      otpCallCount += 1;
      otpRequestUrl = route.request().url();
      try {
        const raw = route.request().postData();
        otpRequestBody = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        otpRequestBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    await page.goto('/login');

    // Form is visible with label + submit button.
    const emailInput = page.getByLabel(t.auth.emailLabel);
    await expect(emailInput).toBeVisible();
    const submit = page.getByRole('button', { name: t.auth.submitMagicLink });
    await expect(submit).toBeVisible();

    // Submit with a test-only email (no real domain).
    await emailInput.fill('test-user-magic@example.test');
    await submit.click();

    // Success copy replaces the form.
    await expect(page.getByText(t.auth.magicLinkSent)).toBeVisible();

    // Intercepted exactly one call with the test email in the JSON body.
    expect(otpCallCount).toBe(1);
    expect(otpRequestBody).not.toBeNull();
    const body = otpRequestBody as unknown as Record<string, unknown>;
    expect(body.email).toBe('test-user-magic@example.test');
    // supabase-js encodes `emailRedirectTo` as a URL query param, not a body
    // field. The redirect target must point at our auth callback; the
    // callback route is the one that eventually decides onboarding vs
    // dashboard.
    expect(otpRequestUrl).not.toBeNull();
    const parsedUrl = new URL(otpRequestUrl as unknown as string);
    const redirectTo = parsedUrl.searchParams.get('redirect_to');
    expect(redirectTo ?? '').toContain('/auth/callback');
  });

  test('surfaces an error banner when Supabase rejects the magic-link send', async ({ page }) => {
    // Simulate Supabase returning a rate-limit 429. The LoginForm must
    // surface the generic i18n error instead of echoing Supabase's raw
    // message (to keep PII / internal errors out of the UI).
    await page.route(/\/auth\/v1\/otp(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'rate limited',
          error_description: 'too many requests',
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel(t.auth.emailLabel).fill('test-user@example.test');
    await page.getByRole('button', { name: t.auth.submitMagicLink }).click();

    // Generic error copy — NOT Supabase's raw message.
    await expect(page.getByText(t.auth.errorGeneric)).toBeVisible();
    // Success state must NOT appear.
    await expect(page.getByText(t.auth.magicLinkSent)).toHaveCount(0);
  });

  test('blocks submit when email is empty and surfaces the required-field error', async ({
    page,
  }) => {
    let otpCallCount = 0;
    await page.route(/\/auth\/v1\/otp(?:\?.*)?$/, async (route) => {
      otpCallCount += 1;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: t.auth.submitMagicLink }).click();

    await expect(page.getByText(t.auth.errorEmailRequired)).toBeVisible();
    // Supabase must NOT have been called.
    expect(otpCallCount).toBe(0);
  });

  test('callback error path lands the user back on /login with error copy', async ({ page }) => {
    // Directly hit the callback with no code, mirroring what Supabase does
    // when the magic link has expired or been tampered with. The callback
    // route redirects to /login?error=callback — the page then surfaces
    // t.auth.errorCallback.
    await page.goto('/auth/callback');

    await expect(page).toHaveURL(/\/login\?error=callback/);
    await expect(page.getByText(t.auth.errorCallback)).toBeVisible();
  });

  test('unauthenticated dashboard hit redirects to /login with redirect_to', async ({ page }) => {
    // Middleware I6: hitting a protected route without a session round-trips
    // to /login and preserves the original path so post-sign-in can restore
    // the user's intended destination. Verified here at the user-visible
    // layer (the Vitest integration tier already covers the header logic).
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?redirect_to=%2Fdashboard/);
    // Login form is rendered on the resulting page.
    await expect(page.getByLabel(t.auth.emailLabel)).toBeVisible();
  });
});

test.describe('auth · magic link · prefers-reduced-motion', () => {
  // Coverage boundary: ui-design.md §7.8 line 2458 — "no page-settle
  // crossfade on load" under reduced-motion. Today the login page does not
  // ship any entry animations (no transition / animation CSS on the main /
  // form / buttons), so this test acts as a regression guard: the preference
  // is set, the page renders, the critical interactive elements remain
  // hittable, and no animations are running at the key moments.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('respects prefers-reduced-motion on /login (no entry crossfade)', async ({ page }) => {
    await page.goto('/login');

    // Page chrome is still visible + interactive under reduced motion.
    await expect(page.getByText(t.brand.wordmark)).toBeVisible();
    await expect(page.getByLabel(t.auth.emailLabel)).toBeVisible();
    await expect(page.getByRole('button', { name: t.auth.submitMagicLink })).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(t.auth.continueWithGoogle, 'i') }),
    ).toBeVisible();

    // Assert the browser-level preference took effect (guard against a
    // future change to Playwright's default that would silently drop the
    // preference).
    const prefersReduce = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(prefersReduce).toBe(true);

    // Regression guard: the login page must not start any in-flight
    // animations on load. If Task 2.2+ adds entry animations, they MUST be
    // gated behind `@media (prefers-reduced-motion: no-preference)` —
    // otherwise this assertion catches the regression.
    const runningAnimations = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .flatMap((el) => (el as HTMLElement).getAnimations?.() ?? [])
        .filter((animation) => animation.playState === 'running').length;
    });
    expect(runningAnimations).toBe(0);
  });
});
