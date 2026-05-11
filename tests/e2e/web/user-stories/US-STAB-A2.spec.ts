/**
 * Task A.2 (US-STAB-A2) AC1 — sidebar identity row click-through E2E.
 *
 * Story (verbatim from design-doc §4):
 *   AS a Google-OAuth-authenticated user in production, I WANT the sidebar
 *   to display my real Gmail address, SO THAT I trust I am viewing my own
 *   data, not a dev fixture user.
 *
 * AC1: GIVEN I am logged in via Google OAuth in production AND my Gmail is
 *       `tamas.szalay@gmail.com`, WHEN I render any page that includes the
 *       sidebar, THEN the sidebar identity row reads my real email,
 *       NOT `dev user`.
 *
 * AC1 fixture nuance (briefing §"Defects discovered" point 3):
 *   The `authedPage` fixture provisions an ephemeral test user per test with
 *   email shaped `e2e-authed-<timestamp>-<rand>@kalori.test`. We assert the
 *   email-shape regex + NOT-`/dev user/i` instead of the literal Gmail —
 *   the AC's intent is "real email, not the dev stub", not the production
 *   maintainer's address.
 *
 * Click-through Mandate (per `~/.claude/skills/brainstorm-tomi/testing-
 * strategy.md` E2E Functional Click-Through):
 *   WHEN — at least one user-action API. We click the `nav-library` Link in
 *          the sidebar to exercise a real interaction (NOT a bare goto).
 *   THEN — `expect(locator).toHaveText() / toHaveAttribute()` on the
 *          rendered identity row, asserting both the email-shape AND the
 *          absence of any `dev user` text.
 *   Sequenced screenshots — `ac1-01-initial.png` (Given) +
 *          `ac1-02-result.png` (Then).
 *
 * AC2/AC3/AC4 coverage: those three branches live in unit tests:
 *   - `tests/unit/lib/auth/get-display-identity.test.ts` (resolver branches)
 *   - `tests/unit/sidebar/identity-row.test.tsx` (component visual states)
 *   The briefing's test matrix puts them at Unit (Vitest+RTL) — not E2E.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-A2';

test.describe('US-STAB-A2 · sidebar identity row', () => {
  test('AC1: real authed user email renders in sidebar (NOT "dev user")', async ({
    authedPage,
  }) => {
    // -----------------------------------------------------------------------
    // GIVEN — logged-in user lands at /dashboard.
    // -----------------------------------------------------------------------
    await authedPage.goto('/dashboard');

    const identityRow = authedPage
      .getByTestId('nav-shell-sidebar')
      .getByTestId('sidebar-identity-row');
    await expect(identityRow).toBeVisible({ timeout: 10_000 });

    // Capture sequenced evidence — initial (Given).
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-01-initial.png`,
      fullPage: true,
    });

    // -----------------------------------------------------------------------
    // WHEN — click the sidebar's `nav-library` Link (a real user action,
    //         exercising a Link interaction so this isn't a bare goto smoke).
    // -----------------------------------------------------------------------
    const navLibrary = authedPage.getByTestId('nav-shell-sidebar').getByTestId('nav-library');
    await expect(navLibrary).toBeVisible();
    await navLibrary.click({ force: true });

    await expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/);

    // -----------------------------------------------------------------------
    // THEN — first prove the click reached a NEW page state that did NOT
    //         exist before the click. `[data-testid="page-library"]` is
    //         rendered exclusively by `/library` (see
    //         `app/(app)/library/page.tsx`); its visibility is the strict
    //         post-action signal the click-through mandate requires.
    // -----------------------------------------------------------------------
    const libraryPage = authedPage.getByTestId('page-library');
    await expect(libraryPage).toBeVisible({ timeout: 10_000 });

    // Then re-locate the identity row from the POST-NAV DOM (do NOT reuse
    // the pre-click locator) and assert the email-shape + aria-label via
    // `toHaveText` / regex match — these prove the sidebar persisted with
    // the REAL email after route change, never the legacy `dev user` stub.
    const identityRowAfter = authedPage
      .getByTestId('nav-shell-sidebar')
      .getByTestId('sidebar-identity-row');
    await expect(identityRowAfter).toBeVisible({ timeout: 10_000 });

    // Real-email shape: ephemeral fixture user is `e2e-authed-...@kalori.test`.
    await expect(identityRowAfter).toHaveText(/e2e-authed-.+@kalori\.test/i);
    // Negative assertion — the bug being fixed is the `dev user` stub leak.
    await expect(identityRowAfter).not.toContainText(/dev user/i);
    // aria-label carries the full identity for screen readers.
    const ariaLabel = await identityRowAfter.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/^Signed in as e2e-authed-.+@kalori\.test$/);

    // Capture sequenced evidence — result (Then). Captured AFTER the
    // post-nav assertions resolve green so the screenshot reflects the
    // proven-rendered library state, not a pre-assertion frame.
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-02-result.png`,
      fullPage: true,
    });
  });
});
