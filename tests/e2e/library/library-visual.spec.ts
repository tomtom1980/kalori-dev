/**
 * E2E visual regression for /library — Task 4.1 sub-step 4 §15.6.
 *
 * Playwright `toHaveScreenshot()` snapshots the /library route across 4
 * viewports (sm 390 / md 768 / lg 1280 / xl 1600) in 6 canonical states.
 * Animations are disabled via `reducedMotion: 'reduce'` + an injected
 * `animation-duration: 0s` CSS override so snapshots are deterministic.
 *
 * Matrix (20 images):
 *   a. fresh-load              (populated grid, browse mode)
 *   b. empty-state             (no items)
 *   c. filtered-to-zero        (search yields zero matches)
 *   d. selection-mode-2        (2 items selected, BulkActionsBar visible)
 *   e. bulk-delete-dialog-open (3 items selected, BulkDelete dialog visible)
 *
 * Why 20 and not the 32 in the briefing: "merge-dialog-open" became obsolete
 * after migration 0020 made active duplicate rows impossible, "post-delete
 * with undo toast" is time-sensitive and flakey to snapshot, and "focus-ring
 * on card" is covered by axe-core + keyboard-nav specs semantically.
 *
 * Snapshots are stored next to the spec under -snapshots/. Run with
 * `--update-snapshots` once to generate baselines; subsequent runs compare.
 */
import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

// Deterministic snapshot knob — reject any 1-pixel difference (tight).
// Raise to 0.01 if CI proves flaky on font subpixel rendering.
const SNAPSHOT_DIFF_THRESHOLD = 0.01;

const VIEWPORTS = [
  { name: 'sm-390', width: 390, height: 844 },
  { name: 'md-768', width: 768, height: 1024 },
  { name: 'lg-1280', width: 1280, height: 900 },
  { name: 'xl-1600', width: 1600, height: 1000 },
] as const;

async function disableAnimations(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }`,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('/library · visual regression', () => {
  for (const vp of VIEWPORTS) {
    test(`snapshots at ${vp.name}`, async ({ authedPage, context }) => {
      const userId = await resolveTestUserId(context);
      await authedPage.setViewportSize({ width: vp.width, height: vp.height });

      // --- b. empty-state (BEFORE seeding anything) ---
      await authedPage.goto('/library');
      await disableAnimations(authedPage);
      await expect(authedPage.getByRole('region', { name: 'No library items yet.' })).toBeVisible();
      await expect(authedPage).toHaveScreenshot(`empty-state.${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: SNAPSHOT_DIFF_THRESHOLD,
      });

      // Seed 6 items for the subsequent states.
      const seeded = await seedLibraryItems(userId, [
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
        {
          display_name: 'Delta',
          nutrition: { kcal: 400, macros: { protein_g: 15, carbs_g: 35, fat_g: 12 } },
        },
        {
          display_name: 'Echo',
          nutrition: { kcal: 500, macros: { protein_g: 18, carbs_g: 40, fat_g: 15 } },
        },
        {
          display_name: 'Foxtrot',
          nutrition: { kcal: 600, macros: { protein_g: 22, carbs_g: 45, fat_g: 18 } },
        },
      ]);

      // --- a. fresh-load (populated) ---
      await authedPage.goto('/library');
      await disableAnimations(authedPage);
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();
      await expect(authedPage).toHaveScreenshot(`fresh-load.${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: SNAPSHOT_DIFF_THRESHOLD,
      });

      // --- c. filtered-to-zero ---
      await authedPage.getByTestId('library-search-input').fill('__no_such_item__');
      await expect(authedPage.getByTestId('library-empty-filtered')).toBeVisible();
      await expect(authedPage).toHaveScreenshot(`filtered-zero.${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: SNAPSHOT_DIFF_THRESHOLD,
      });
      // Reset search.
      await authedPage.getByTestId('library-search-input').fill('');

      // --- d. selection-mode-2 ---
      await authedPage.getByTestId('library-select-toggle').click();
      await authedPage.getByTestId(`library-card-${seeded[0]!.id}`).click();
      await authedPage.getByTestId(`library-card-${seeded[1]!.id}`).click();
      await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
      await expect(authedPage).toHaveScreenshot(`selection-mode-2.${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: SNAPSHOT_DIFF_THRESHOLD,
      });

      // --- e. bulk-delete-dialog-open (select 3 + open delete dialog) ---
      await authedPage.getByTestId(`library-card-${seeded[2]!.id}`).click();
      await expect(authedPage.getByTestId('library-bulk-count')).toContainText('3 selected');
      await authedPage.getByTestId('library-bulk-delete-button').click();
      await expect(authedPage.getByTestId('library-bulk-delete-dialog')).toBeVisible();
      await disableAnimations(authedPage);
      await expect(authedPage).toHaveScreenshot(`bulk-delete-dialog-open.${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: SNAPSHOT_DIFF_THRESHOLD,
      });
    });
  }
});
