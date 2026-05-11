/**
 * E2E axe baseline — Task 1.3 AC.
 *
 * Asserts ZERO serious + critical axe violations on the landing page `/`.
 * The `injectAxeAndAudit()` helper lives at `tests/axe/setup.ts` and is the
 * canonical entry point every future E2E spec uses when asserting a11y
 * (testing-strategy.md §2.7).
 *
 * Scope: this spec scans only the landing route — the single public page
 * that has no authentication gate. Authenticated routes under `/(app)`
 * redirect to `/login` today (middleware pass-through shell); their axe
 * coverage lands with Phase 2 Task 2.1.
 */
import { expect, test } from '@playwright/test';

import { injectAxeAndAudit } from '../axe/setup';

test.describe('axe-baseline · landing page', () => {
  test('zero serious or critical violations on /', async ({ page }) => {
    await page.goto('/');
    // Wait for font + masthead paint so axe sees a stable DOM (avoids
    // false-positive color-contrast hits during Newsreader font-face swap).
    await page.waitForLoadState('networkidle');

    const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(page);
    expect(seriousAndCriticalCount, JSON.stringify(violations, null, 2)).toBe(0);
  });
});
