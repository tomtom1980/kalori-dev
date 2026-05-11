/**
 * Task B.1 (US-STAB-B1) AC1 + AC2 — root `/` redirect contract E2E.
 *
 * Story (verbatim from design-doc §4):
 *   AS a visitor in production, I WANT the root URL `/` to behave correctly,
 *   SO THAT logged-in users go straight to the dashboard AND anonymous
 *   users can read the public landing page WITHOUT being forced into the
 *   sign-in flow.
 *
 * AC1: GIVEN I am logged in AND I navigate to `/`, WHEN the request
 *       resolves, THEN I land on `/dashboard`.
 *      (verified by `root-redirects-authed-to-dashboard` below)
 *
 * AC2: GIVEN I am NOT logged in AND I navigate to `/`, WHEN the request
 *       resolves, THEN I see the public landing page (no auth gate, no
 *       redirect to dashboard).
 *      (verified by `root-shows-landing-anon` below)
 *
 * AC3 — Lighthouse delta vs `tests/lighthouse/landing.json` baseline — is a
 * manual gate, not part of this Playwright spec. AC3 baseline is established
 * this commit.
 *
 * Click-through Mandate (Phase B Codex Round 1, finding F-PB-R1-3):
 *   Each AC body MUST include
 *     1) ≥1 user-action API call (click / fill / press / tap / hover / drag /
 *        keyboard.type) — `goto` does NOT count.
 *     2) ≥1 post-action `expect(locator)` against rendered DOM that did NOT
 *        exist before the action — URL-only / title-only assertions DO NOT
 *        count.
 *     3) Sequenced screenshots `ac<N>-01-initial.png` (Given) +
 *        `ac<N>-02-result.png` (Then, taken AFTER the post-action assertion
 *        resolves green).
 *
 *   AC1 uses the canonical 404 surface (`app/not-found.tsx`, owned by
 *   US-STAB-B5) as the WHEN-stage launchpad: it carries a real `<Link
 *   href="/">` (testid `canonical-404-cta`) which is a genuine in-DOM,
 *   user-clickable affordance that drives the browser to `/`. Clicking that
 *   anchor triggers the full root-contract code path
 *   (`app/(marketing)/page.tsx` → `getServerSupabase().auth.getUser()` →
 *   `redirect('/dashboard')`), exactly as a real user reaching `/` would.
 *   `goto('/')` is NEVER the user-action for AC1 — it only seeds the Given
 *   page (the canonical 404).
 *
 *   AC2 cannot reuse the canonical-404 launchpad: `middleware.ts` redirects
 *   ANY unauthenticated request to a non-public route (incl. arbitrary
 *   `/this-page-does-not-exist-*`) to `/login` BEFORE Next.js gets to render
 *   `app/not-found.tsx`. That middleware bounce is the right product
 *   behaviour but it means an anon visitor never reaches the canonical 404 —
 *   so AC2 instead navigates to `/` directly (PUBLIC route per
 *   `lib/auth/public-routes.ts`, middleware passes through), asserts the
 *   landing rendered as the GIVEN, then performs a real `click()` on the
 *   landing's `landing-signin-cta` anchor as the user-action and asserts the
 *   `#login-email` input is visible as the post-action rendered-DOM check.
 *   Per F-PB-R2-1 (Codex Round 2 verdict), this exercises the unauthenticated
 *   `/`-shows-landing contract from a publicly-accessible launchpad while
 *   preserving the click-through mandate.
 *
 *   The post-click assertions probe DOM rendered ONLY by the destination
 *   route — `dashboard-masthead` for AC1; `#login-email` for AC2 — neither
 *   of which exists on the launchpad that hosts the click.
 *
 * Two fixtures:
 *   AC1 uses the real-user `authedPage` fixture (Supabase session →
 *        server-side `getUser()` succeeds → `redirect('/dashboard')`).
 *   AC2 uses the plain `@playwright/test` `page` fixture (no auth →
 *        `getUser()` returns null → landing renders inline at `/`).
 */
import { test as anonTest, expect } from '@playwright/test';

import { test as authedTest } from '../../fixtures/auth';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-B1';
const NONEXISTENT_PATH = '/this-page-does-not-exist-us-stab-b1';

authedTest.describe('US-STAB-B1 · authed root redirect (AC1)', () => {
  authedTest('root-redirects-authed-to-dashboard', async ({ authedPage }) => {
    // -----------------------------------------------------------------------
    // GIVEN — logged-in user has a valid session (authedPage fixture has
    //         already provisioned the user + written the auth cookie) AND
    //         the user is currently parked on the canonical 404 page, which
    //         carries the in-DOM `<Link href="/">` we will click.
    // -----------------------------------------------------------------------
    await authedPage.goto(NONEXISTENT_PATH);

    const canonical404 = authedPage.getByTestId('canonical-404');
    await expect(canonical404).toBeVisible({ timeout: 10_000 });

    const cta = authedPage.getByTestId('canonical-404-cta');
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute('href')).toBe('/');

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-01-initial.png`,
      fullPage: true,
    });

    // -----------------------------------------------------------------------
    // WHEN — user clicks the in-DOM "back to home" CTA. This is a real
    //        click() on a real <Link href="/"> — exactly how a user reaches
    //        `/` after hitting the canonical 404. `goto('/')` is NOT used.
    // -----------------------------------------------------------------------
    await cta.click();

    // -----------------------------------------------------------------------
    // THEN — URL has settled on /dashboard AND the dashboard's signature
    //         masthead landmark is visible. The masthead testid did NOT
    //         exist on the canonical 404 page that hosted the click —
    //         proving the destination route actually rendered (not a 404
    //         on /dashboard, not a stuck loading state, not a static
    //         snapshot of the launchpad).
    // -----------------------------------------------------------------------
    await expect(authedPage).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10_000 });
    await expect(authedPage.getByTestId('dashboard-masthead')).toBeVisible({
      timeout: 10_000,
    });

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-02-result.png`,
      fullPage: true,
    });
  });
});

anonTest.describe('US-STAB-B1 · anon root landing (AC2)', () => {
  anonTest('root-shows-landing-anon', async ({ page }) => {
    // -----------------------------------------------------------------------
    // GIVEN — anonymous visitor (no auth cookie set) navigates directly to
    //         `/`. Per `lib/auth/public-routes.ts`, `/` IS a public route,
    //         so middleware passes the request through to the marketing
    //         page; `app/(marketing)/page.tsx` calls
    //         `getServerSupabase().auth.getUser()`, which returns
    //         `{ user: null }` for the unauthenticated browser, and the
    //         landing renders inline (no `redirect()` call). The Given
    //         assertions confirm the landing actually rendered (the THEN
    //         clause of AC2's "I see the public landing page (no auth gate,
    //         no redirect to dashboard)") BEFORE we perform the user-action
    //         click that satisfies the click-through mandate.
    //
    //         Why not use the canonical 404 launchpad like AC1? Middleware
    //         redirects unauthenticated requests to non-public routes
    //         (incl. arbitrary nonexistent paths) to `/login` BEFORE
    //         Next.js renders `app/not-found.tsx` — so an anon visitor
    //         never reaches the canonical 404. See file-header docblock
    //         (F-PB-R2-1).
    // -----------------------------------------------------------------------
    await page.goto('/');

    // URL stayed at `/` — not bounced to `/login`, not bounced to
    // `/dashboard`. This is the AC's literal THEN clause.
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

    const landingRoot = page.getByTestId('landing-root');
    await expect(landingRoot).toBeVisible({ timeout: 10_000 });

    const wordmark = page.getByTestId('landing-wordmark');
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveText(/KALORI/);

    const signinCta = page.getByTestId('landing-signin-cta');
    await expect(signinCta).toBeVisible();
    expect(await signinCta.getAttribute('href')).toBe('/login');

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-01-initial.png`,
      fullPage: true,
    });

    // -----------------------------------------------------------------------
    // WHEN — user clicks the landing's "Sign in" CTA. Real `click()` on a
    //        real `<a href="/login">` — a genuine in-DOM, user-actionable
    //        affordance. This satisfies the click-through mandate's
    //        user-action requirement (clause 1) and proves the landing is
    //        a fully interactive surface (not a phantom DOM snapshot).
    //        `goto('/')` above was the GIVEN setup, NOT the user action.
    // -----------------------------------------------------------------------
    await signinCta.click();

    // -----------------------------------------------------------------------
    // THEN — URL settles at `/login` AND the login form's `#login-email`
    //        input becomes visible. The `#login-email` input is rendered
    //        EXCLUSIVELY by `/login`'s `<LoginForm />` — it did NOT exist
    //        on the landing page that hosted the click. Its post-click
    //        visibility satisfies the click-through mandate's rendered-DOM
    //        post-action assertion requirement (clause 2).
    // -----------------------------------------------------------------------
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });

    const loginEmail = page.locator('#login-email');
    await expect(loginEmail).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-02-result.png`,
      fullPage: true,
    });
  });
});
