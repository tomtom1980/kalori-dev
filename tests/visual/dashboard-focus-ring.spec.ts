/**
 * Task D.1 (US-STAB-D1) — Dashboard focus-ring visual baseline.
 *
 * AC2 contract: every interactive element on the dashboard renders the
 * canonical IVORY 2px outline + 2px offset focus ring (NOT oxblood) per
 * design-doc §FocusRing. The CSS-inspection assertions live in the E2E
 * spec at `tests/e2e/web/dashboard-a11y.spec.ts` — this file owns the
 * pixel-level screenshot evidence.
 *
 * Naming: file uses `.spec.ts` (not `.test.ts`) because playwright.config.ts
 * testMatch glob "visual/(...)/(...).spec.ts" only picks up .spec.ts under
 * tests/visual/. The briefing called for .test.ts but that filename
 * would never run. Same content; correct extension.
 *
 * Snapshot path: `tests/visual/__screenshots__/visual/dashboard-focus-ring.spec.ts/`.
 * The companion focus-state PNGs at
 * `tests/screenshots/user-stories/US-STAB-D1/ac2-*.png` come from the
 * E2E spec (it owns the per-AC evidence-narrative screenshots).
 *
 * R1 firewall: zero touches to `lib/auth/refresh-interceptor.ts` etc.
 */
import { expect } from '@playwright/test';

import { test } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

test.describe('Dashboard focus-ring visual baseline (US-STAB-D1 AC2)', () => {
  test('first tab-stop renders ivory 2px ring (visual)', async ({ authedPage }) => {
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);

    await authedPage.keyboard.press('Tab');
    const focused = authedPage.locator(':focus');
    await expect(focused).toHaveCount(1);

    // Computed-style assertion (machine-verifiable). The screenshot below
    // is the visual EVIDENCE; the assertion is the contract.
    const ring = await focused.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        color: cs.outlineColor,
        width: cs.outlineWidth,
        style: cs.outlineStyle,
        offset: cs.outlineOffset,
      };
    });
    // #F4EBDC ivory → rgb(244, 235, 220).
    expect(ring.color).toBe('rgb(244, 235, 220)');
    expect(ring.width).toBe('2px');
    expect(ring.style).toBe('solid');
    expect(ring.offset).toBe('2px');

    await expect(focused).toHaveScreenshot('focus-tab-1.png', {
      animations: 'disabled',
    });
  });
});
