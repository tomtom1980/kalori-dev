/**
 * Visual regression baseline — Progress (authed, seeded).
 *
 * Task 5.1.8. The /progress route renders charts + heatmap; for the
 * baseline freeze we accept the auth-fixture empty-state default (no
 * food_entries / weight_log seeded) — that gives us a stable empty-state
 * screenshot. If subsequent tasks need the populated chart surface
 * captured, they should land their own seed-then-snapshot spec rather
 * than rebuilding this one.
 */
import { test, expect } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Progress visual baseline', () => {
  test('renders correctly', async ({ authedPage }) => {
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/progress');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);
    await expect(authedPage).toHaveScreenshot('progress.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
