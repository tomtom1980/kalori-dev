/**
 * Visual regression baseline — Weight log (authed).
 *
 * Task 5.1.8 — Screen #16-18 per briefing §6. Implementer pick = `/weight`
 * route (D1 in briefing §13). The page renders deterministically with the
 * auth-fixture user (empty history list, default unit-pref metric). For the
 * baseline freeze we accept the empty-state list — it captures the page
 * chrome (masthead + quick-add form + "no entries" empty state).
 */
import { test, expect } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Weight log visual baseline', () => {
  test('renders correctly', async ({ authedPage }) => {
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/weight');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);
    await expect(authedPage).toHaveScreenshot('weight.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
