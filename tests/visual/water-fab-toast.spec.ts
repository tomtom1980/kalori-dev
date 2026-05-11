/**
 * Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — water FAB toast
 * visual baseline.
 *
 * Asserts the canonical 250 ml confirmation toast surfaces at the mobile
 * 375×667 breakpoint after a tap on `log-fab-water`, and again under
 * `prefers-reduced-motion: reduce` (kalori discipline — every toast surface
 * has a reduced-motion baseline per dual-FAB precedent).
 *
 * Boilerplate is parallel to `tests/visual/dual-fab-layout.spec.ts`;
 * geometric assertions are kept light because the kalori canonical
 * `<UndoToast>` chrome is already pixel-baselined elsewhere — the value
 * here is verifying the FAB→toast wire end-to-end at the proper
 * breakpoint with the proper copy.
 *
 * Visual baselines will be missing on first run; that's expected. The
 * `--update-snapshots=missing` workflow (F-TEST-1) bootstraps Linux PNGs.
 *
 * Codex Round 2 → Round 3 I3 (2026-05-09): Verification confirmed the
 * `tests/e2e/fixtures/auth.ts` fixture (shipped commit aea1a66) is a
 * REAL-Supabase fixture — `admin.createUser` + `signInWithPassword` +
 * cookie write — NOT the forged-cookie `seedAuthSession` helper. The
 * earlier I2 sub-agent misread that fixture as a delegator to the
 * forger; it is in fact the F-TEST-4 #1 implementation. Un-skipping
 * these two cases is therefore feasible now. Linux baselines will be
 * missing on first run; the `--update-snapshots=missing` workflow
 * (F-TEST-1) bootstraps them.
 */
import { expect, test } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

const VIEWPORT = { width: 375, height: 667 } as const;

test.describe('Bug-1 — water FAB toast (mobile 375×667)', () => {
  test('default — tapping water FAB surfaces 250 ml toast', async ({ authedPage }) => {
    await authedPage.setViewportSize(VIEWPORT);
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    // Register response listener BEFORE the tap (cross-region POST
    // discipline per R1 lessons).
    const responsePromise = authedPage.waitForResponse(
      (r) =>
        r.url().includes('/api/water/log') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 10_000 },
    );
    // Use `click()` — the visual-baseline projects don't enable
    // `hasTouch: true` in their browser context (only the e2e mobile
    // project does), so `tap()` fails with "page does not support tap".
    // The FAB's `onClick` handler is the relevant code path; click and
    // tap dispatch through the same React handler.
    await authedPage.getByTestId('log-fab-water').click();
    await responsePromise;

    const toast = authedPage.getByTestId('undo-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/250\s*ml\s*logged/i);
    // No UNDO button — kind:'delete-failed' renders no action.
    await expect(authedPage.getByTestId('undo-action')).toHaveCount(0);

    await expect(authedPage).toHaveScreenshot('water-fab-toast-default.png', {
      fullPage: false,
    });
  });

  test('reduced-motion — tapping water FAB surfaces 250 ml toast with motion suppressed', async ({
    authedPage,
  }) => {
    await authedPage.setViewportSize(VIEWPORT);
    await authedPage.emulateMedia({ reducedMotion: 'reduce' });
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    const responsePromise = authedPage.waitForResponse(
      (r) =>
        r.url().includes('/api/water/log') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 10_000 },
    );
    // Use `click()` for the same reason as the default case above — the
    // visual-baseline projects don't enable `hasTouch: true`.
    await authedPage.getByTestId('log-fab-water').click();
    await responsePromise;

    const toast = authedPage.getByTestId('undo-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/250\s*ml\s*logged/i);

    await expect(authedPage).toHaveScreenshot('water-fab-toast-reduced-motion.png', {
      fullPage: false,
    });
  });
});
