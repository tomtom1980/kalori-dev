/**
 * Bug #1 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — horizontal-overflow
 * regression spec.
 *
 * Asserts that the four `(app)` route surfaces (dashboard, library, progress,
 * settings) do NOT introduce horizontal scrolling at the three canonical
 * breakpoints (375 / 768 / 1280 viewport widths). The proposal's fix is
 * objective rather than pixel-comparison, so this spec uses
 * `page.evaluate(() => documentElement.scrollWidth <= innerWidth + 1)` as the
 * acceptance criterion — a cheaper and more durable signal than full-page
 * snapshot diffs (which the existing `tests/visual/dashboard.spec.ts` family
 * already maintains as separate baselines).
 *
 * The +1px tolerance is the standard fudge for sub-pixel rounding on devicePixelRatio>1.
 *
 * IMPORTANT: This spec is intentionally scoped to overflow assertion. It does
 * NOT call `toHaveScreenshot()`, so it produces NO new baseline PNGs (per
 * bugfix-tomi guard rails — "do NOT auto-accept new baselines"). The existing
 * baseline specs at `tests/visual/dashboard.spec.ts`, `library.spec.ts`,
 * `progress.spec.ts` already cover pixel-level visual regression separately.
 */
import { expect, test } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

const ROUTES = ['/dashboard', '/library', '/progress', '/settings'] as const;

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

test.describe('responsive layout — no horizontal overflow', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} @ ${viewport.name}`, async ({ authedPage }) => {
        await authedPage.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await freezeViewportForVisualBaseline(authedPage);
        await authedPage.goto(route);
        await authedPage.waitForLoadState('networkidle');

        const overflow = await authedPage.evaluate(() => {
          // +1 px tolerance for sub-pixel rounding on devicePixelRatio > 1.
          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          return { docWidth, winWidth, overflow: docWidth - winWidth };
        });

        expect(
          overflow.overflow,
          `${route} at ${viewport.width}px viewport: documentElement.scrollWidth (${overflow.docWidth}) ` +
            `must not exceed innerWidth (${overflow.winWidth}) by more than 1px`,
        ).toBeLessThanOrEqual(1);
      });
    }
  }
});
