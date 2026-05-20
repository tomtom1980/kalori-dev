/**
 * Visual regression baseline — Sidebar IdentityRow (Task A.2 / US-STAB-A2).
 *
 * Step 7 deliverable per briefing — locks the rendered identity row across
 * the AC1 real-user state. AC2 / AC3 / AC4 visual states are covered by
 * unit tests (`tests/unit/sidebar/identity-row.test.tsx`) which assert the
 * data-anonymous attribute + monogram + style flags, since those branches
 * require non-default user shapes that the live `authedPage` fixture
 * doesn't provision.
 *
 * Per ux-style spec §6.1: IdentityRow only renders on desktop (≥1280px).
 * Tablet collapses to icon-rail (avatar-only); mobile hides the sidebar
 * entirely. The visual-baseline-chromium project (1280×800) is the
 * authoritative target.
 */
import { test, expect } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Sidebar IdentityRow visual baseline (Task A.2)', () => {
  test('renders authed identity row at desktop ≥1280px', async ({ authedPage }, testInfo) => {
    test.skip(
      testInfo.project.name === 'visual-baseline-chromium-mobile' ||
        testInfo.project.name === 'visual-baseline-chromium-tablet',
      'Mobile (<768px) hides the entire sidebar per ux-style spec §6.1; identity row is not rendered.',
    );
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);

    const identityRow = authedPage
      .getByTestId('nav-shell-sidebar')
      .getByTestId('sidebar-identity-row');
    await expect(identityRow).toBeVisible();

    // Element-scoped screenshot keeps the baseline tight to the row itself,
    // sidestepping unrelated chrome drift in surrounding sidebar nav.
    // The identity row's only non-deterministic field is the user's email
    // (different ephemeral suffix per test run); we mask the whole row's
    // text region via the dedicated `sidebar-identity-row-name` testid so
    // pixel diffs only surface for layout / color drift, not the dynamic
    // email value.
    await expect(identityRow).toHaveScreenshot('sidebar-identity-row-authed.png', {
      animations: 'disabled',
      mask: [authedPage.getByTestId('sidebar-identity-row-name')],
    });
  });
});
