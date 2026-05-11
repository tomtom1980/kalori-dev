/**
 * Task B.5 (US-STAB-B5) AC3 — canonical Kalori 404 page renders for unknown
 * routes (NOT a generic Next.js default 404).
 *
 * Story (verbatim from design-doc §4):
 *   GIVEN a deliberate 404 fixture (e.g. `/this-page-does-not-exist`),
 *   WHEN visited, THEN the 404 page renders the canonical Kalori 404
 *   component (NOT a generic Next default).
 *
 * Auth fixture choice:
 *   The middleware redirects unauthenticated visitors on non-public routes
 *   to `/login?redirect_to=...` BEFORE the route's 404 fires. To exercise
 *   the canonical 404 page we need an authed session so the request reaches
 *   the App Router's not-found handler. We use the `authedPage` real-user
 *   fixture (F-TEST-4).
 *
 * Click-Through Mandate (E2E Functional Click-Through):
 *   WHEN  — `goto('/this-page-does-not-exist-${Date.now()}')` is the user
 *           action. The timestamp suffix defeats edge / SW caches that may
 *           have 200-cached a previously-rendered known-bad URL.
 *   THEN  — assertions on rendered DOM (NOT URL/title alone): canonical-404
 *           testid, H1 with "404", body copy with "ledger", recovery CTA.
 *   THEN  — additional user action (CTA click) followed by
 *           `expect(locator)` on the result. Proves the CTA is wired.
 *   Sequenced screenshots — `ac3-01-initial.png` (post-goto, pre-click)
 *           + `ac3-02-result.png` (post-click).
 *   axe-core — zero serious/critical violations on the 404 page.
 */
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { test } from '../fixtures/auth';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-B5';

test.describe('US-STAB-B5 · canonical 404 page (AC3)', () => {
  test('AC3 — canonical 404 page renders with correct copy and CTA', async ({ authedPage }) => {
    // -----------------------------------------------------------------------
    // GIVEN — authed visitor (real-user fixture, valid Supabase session).
    //
    // WHEN — navigate to a deliberately-bad URL. Date.now() defeats cache
    //         poisoning (Vercel edge cache, SW cache, browser cache).
    // -----------------------------------------------------------------------
    const badUrl = `/this-route-does-not-exist-xyz-${Date.now()}`;
    const response = await authedPage.goto(badUrl);
    // The route DOES return HTTP 404 (that IS the feature). The behavior
    // assertion below proves the canonical Kalori component renders, not a
    // Next.js default 404 stub.
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);

    // Capture the post-goto state. AC3-01 = initial (proves Given/When state).
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-01-initial.png`,
      fullPage: true,
    });

    // -----------------------------------------------------------------------
    // THEN — assertions on rendered DOM (Click-Through Mandate forbids
    //         URL-only or title-only assertions).
    // -----------------------------------------------------------------------

    // Binary discriminator: `data-testid="canonical-404"` is on the Kalori
    // 404 component and ONLY on the Kalori 404 component. If this locator
    // resolves, we are looking at the canonical page (not Next's default).
    const root = authedPage.getByTestId('canonical-404');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // H1 contains "404" — visible heading.
    await expect(authedPage.getByRole('heading', { level: 1, name: /404/i })).toBeVisible();

    // Editorial body copy from UX fragment (`t.notFound.body`).
    await expect(
      authedPage.getByText(/not in the ledger|page not found|archive holds/i),
    ).toBeVisible();

    // Recovery CTA — visible link labelled per UX fragment ("RETURN TO THE LEDGER").
    const cta = authedPage.getByRole('link', { name: /return to the ledger/i });
    await expect(cta).toBeVisible();

    // -----------------------------------------------------------------------
    // axe-core — zero serious/critical violations on the 404 page.
    // -----------------------------------------------------------------------
    const axeResults = await new AxeBuilder({ page: authedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = axeResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking,
      `axe-core serious/critical violations on 404 page:\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);

    // -----------------------------------------------------------------------
    // CTA click-through (proves the CTA is wired, not just visible).
    // CTA href="/" — for authed users middleware lets `/` through (public)
    // and the marketing route's RSC server-redirects to `/dashboard`. So the
    // post-click landing is `/dashboard`.
    // -----------------------------------------------------------------------
    await cta.scrollIntoViewIfNeeded();
    await Promise.all([authedPage.waitForURL(/\/(dashboard|onboarding|$)/), cta.click()]);

    // Capture the result state. AC3-02 = after click (proves Then state).
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-02-result.png`,
      fullPage: true,
    });

    // We should have landed on a real authed surface (dashboard/onboarding)
    // — NOT the 404 page. Proving the CTA is wired and routes to a known
    // recovery surface.
    await expect(authedPage.getByTestId('canonical-404')).toHaveCount(0);
  });
});
