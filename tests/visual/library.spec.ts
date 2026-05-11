/**
 * Visual regression baseline — Library (authed, seeded).
 *
 * Task 5.1.8. Inline-seeds a small deterministic library set so the
 * snapshot captures the populated grid rather than the empty state.
 * Mirrors the seed pattern already exercised by
 * `tests/e2e/library/library-visual.spec.ts`.
 */
import { test, expect } from '../e2e/fixtures/auth';
import { resolveTestUserId, seedLibraryItems } from '../e2e/library/_seed';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Library visual baseline', () => {
  test('renders correctly', async ({ authedPage, context }) => {
    const userId = await resolveTestUserId(context);
    await seedLibraryItems(userId, [
      {
        display_name: 'Alpha',
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 3 } },
      },
      {
        display_name: 'Bravo',
        nutrition: { kcal: 200, macros: { protein_g: 8, carbs_g: 20, fat_g: 6 } },
      },
      {
        display_name: 'Charlie',
        nutrition: { kcal: 300, macros: { protein_g: 12, carbs_g: 30, fat_g: 9 } },
      },
    ]);

    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);
    // Wait for library grid to render (vs. empty-state) before snapshotting.
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();

    await expect(authedPage).toHaveScreenshot('library.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
