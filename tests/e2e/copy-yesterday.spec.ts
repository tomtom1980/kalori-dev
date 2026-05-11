/**
 * Task 3.4 — Playwright E2E for copy-yesterday skeleton.
 *
 * See undo-toast.spec.ts module note — this spec reserves the file path.
 * Full E2E lands alongside Task 3.5 dashboard wiring when the surface is
 * end-to-end testable.
 */
import { expect, test } from '@playwright/test';

test.describe.skip('copy-yesterday (full E2E — requires auth fixtures)', () => {
  test('seed yesterday → navigate → multi-select → confirm → toast', async ({ page }) => {
    // TODO (3.5 follow-up):
    // 1. Seed 3 food_entries rows for yesterday.
    // 2. Navigate to /log/copy-yesterday.
    // 3. Check 2 of the 3 rows.
    // 4. Click the "COPY 2 ENTRIES" button.
    // 5. Assert undo toast appears with "Copied 2 entries from yesterday".
    // 6. Navigate to /dashboard and assert today's bucket shows 2 rows.
    await page.goto('/');
    await expect(page).toHaveURL(/\//);
  });
});
