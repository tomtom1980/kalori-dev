/**
 * Visual regression baseline — Dashboard (authed, seeded).
 *
 * Task 5.1.8. Uses the existing `authedPage` fixture from
 * `tests/e2e/fixtures/auth.ts` (creates a fresh user per test). Per
 * briefing §13 D5 the dashboard's visual surface tolerates the auth
 * fixture's empty-state default — no inline seeding required to capture a
 * stable screenshot of the dashboard chrome (masthead + nav + zero-data
 * tiles). The fixture's `SEED_PROFILE_PATCH` already flips
 * `onboarding_completed_at` so the page renders rather than redirecting.
 */
import { test, expect } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Dashboard visual baseline', () => {
  test('renders correctly', async ({ authedPage }) => {
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);
    await expect(authedPage).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
