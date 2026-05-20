/**
 * Bug #5 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — dual-FAB layout
 * regression spec.
 *
 * Asserts that the food + water FAB pair renders side-by-side at the
 * mobile breakpoints (375 / 414 / 768px boundary) WITHOUT introducing
 * horizontal overflow, with the proper 8px gutter, and with both FABs
 * sized at 56×56 (≥ the 44×44 WCAG 2.5.5 AAA floor).
 *
 * The proposal called for golden-image baselines at /dashboard at
 * 375 / 360 / 414 viewports. Per bugfix-tomi guard rails ("do NOT
 * auto-accept new baselines") + Bug #1 precedent
 * (`tests/visual/responsive-overflow.spec.ts`), we use OBJECTIVE
 * geometric assertions instead of pixel-comparison snapshots so the
 * spec produces NO new PNG baselines. Existing dashboard screenshot
 * specs (`tests/visual/dashboard.spec.ts` family) already cover
 * pixel-level regression of the dashboard at 375px in aggregate.
 *
 * If visual deviation is suspected at 360px (smallest target), the
 * `documentElement.scrollWidth - innerWidth` overflow check from
 * `tests/visual/responsive-overflow.spec.ts` is the canonical guard.
 * We add nav-shell-mobile-specific assertions on top of it here.
 */
import { expect, test } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 640 }, // Smallest target
  { name: 'mobile-375', width: 375, height: 667 }, // iPhone SE
  { name: 'mobile-414', width: 414, height: 896 }, // iPhone XR
  { name: 'tablet-768', width: 768, height: 1024 }, // iPad/tablet follows phone chrome
] as const;

test.describe('Bug #5 — dual FAB layout (food + water)', () => {
  for (const viewport of VIEWPORTS) {
    test(`renders both FABs side-by-side at ${viewport.name}`, async ({ authedPage }) => {
      await authedPage.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await freezeViewportForVisualBaseline(authedPage);
      await authedPage.goto('/dashboard');
      await authedPage.waitForLoadState('networkidle');

      const food = authedPage.getByTestId('log-fab-food');
      const water = authedPage.getByTestId('log-fab-water');

      await expect(food, `food FAB visible at ${viewport.name}`).toBeVisible();
      await expect(water, `water FAB visible at ${viewport.name}`).toBeVisible();

      const foodBox = await food.boundingBox();
      const waterBox = await water.boundingBox();

      expect(foodBox, 'food FAB has bounding box').not.toBeNull();
      expect(waterBox, 'water FAB has bounding box').not.toBeNull();

      // Both 56×56 — parity tap targets, both clear the 44×44 AAA floor.
      expect(foodBox!.width, 'food FAB width').toBeGreaterThanOrEqual(56);
      expect(foodBox!.height, 'food FAB height').toBeGreaterThanOrEqual(56);
      expect(waterBox!.width, 'water FAB width').toBeGreaterThanOrEqual(56);
      expect(waterBox!.height, 'water FAB height').toBeGreaterThanOrEqual(56);

      // Both at the same y-coordinate (side-by-side, not stacked).
      // 1px tolerance for sub-pixel rounding.
      expect(
        Math.abs(foodBox!.y - waterBox!.y),
        `${viewport.name}: FABs must be on the same y-axis`,
      ).toBeLessThanOrEqual(1);

      // 8px gutter between them: water.x - (food.x + food.width).
      // Tolerance ±2px for sub-pixel rounding on devicePixelRatio>1.
      const gutter = waterBox!.x - (foodBox!.x + foodBox!.width);
      expect(gutter, `${viewport.name}: 8px gutter between FABs`).toBeGreaterThanOrEqual(6);
      expect(gutter, `${viewport.name}: 8px gutter between FABs`).toBeLessThanOrEqual(10);

      // Pair is centred. The midpoint between food.left and water.right
      // should be within ~1px of viewport centre (50%).
      const pairLeft = foodBox!.x;
      const pairRight = waterBox!.x + waterBox!.width;
      const pairCentre = (pairLeft + pairRight) / 2;
      const viewportCentre = viewport.width / 2;
      expect(
        Math.abs(pairCentre - viewportCentre),
        `${viewport.name}: FAB pair centred (pair centre ${pairCentre} vs viewport centre ${viewportCentre})`,
      ).toBeLessThanOrEqual(2);

      // No horizontal overflow caused by the FAB pair.
      const overflow = await authedPage.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return { docWidth, winWidth, overflow: docWidth - winWidth };
      });
      expect(
        overflow.overflow,
        `${viewport.name}: no horizontal overflow with dual FAB`,
      ).toBeLessThanOrEqual(1);
    });

    test(`distinct accessible names at ${viewport.name}`, async ({ authedPage }) => {
      await authedPage.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await freezeViewportForVisualBaseline(authedPage);
      await authedPage.goto('/dashboard');
      await authedPage.waitForLoadState('networkidle');

      // Distinct aria-labels so screen readers announce them separately.
      await expect(authedPage.getByRole('button', { name: /^log food$/i })).toBeVisible();
      await expect(authedPage.getByRole('button', { name: /^log water$/i })).toBeVisible();
    });
  }
});
