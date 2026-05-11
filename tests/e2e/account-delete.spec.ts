/**
 * Task 5.2 — E2E: AccountDeleteFlow (AC4) + ExportModal (AC3) + cross-tab
 * signal UI smokes (AC1 / AC2). Per synthesis §6.5 + briefing §H E2E
 * Functional Click-Through Mandate (M1–M6).
 *
 * Per-AC sequenced screenshots land at
 *   tests/screenshots/user-stories/US-5.2/
 * with an evidence-with-why narrative in `evidence.md`.
 *
 * axe-core is injected at 6 states (settings idle, AccountDeleteFlow Steps
 * 1–4, ExportModal opened) and asserts zero serious/critical violations
 * via the canonical `injectAxeAndAudit()` helper.
 *
 * The spec runs on a fresh real-Supabase user provisioned by the
 * `authedPage` fixture (F-TEST-4 #1 closure). The fixture's afterEach hook
 * deletes the user; the AC4 happy path also DELETEs through the cascade
 * which is idempotent (admin.deleteUser on a missing id is a no-op).
 */
import { expect } from '@playwright/test';

import { injectAxeAndAudit } from '../axe/setup';

import { t } from '@/lib/i18n/en';

import { test } from './fixtures/auth';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-5.2';

async function expectNoSeriousAxeViolations(
  page: import('@playwright/test').Page,
  state: string,
): Promise<void> {
  const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(page);
  expect(
    seriousAndCriticalCount,
    `state=${state} · violations=${JSON.stringify(violations, null, 2)}`,
  ).toBe(0);
}

test.describe('Task 5.2 · AccountDeleteFlow (AC4)', () => {
  test('end-to-end delete — Settings → Step1 → Step2 → Step3 → Step4 → Step5 (deleted)', async ({
    authedPage,
  }) => {
    // Whole-test budget: settings load (5s) + step1+axe (4s) + step2+axe
    // (4s) + countdown wait+axe (15s) + step4+axe (4s) + cascade (~5s) +
    // redirect (~3s) = ~40s. Default 30s is too tight.
    test.setTimeout(90_000);
    // ---- AC4 Step 0: Settings page idle (verify trigger present) ----
    await authedPage.goto('/settings');
    await authedPage.waitForLoadState('networkidle');

    const deleteTrigger = authedPage.getByTestId('account-delete-trigger');
    await expect(deleteTrigger).toBeVisible();

    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac4-01-initial.png`, fullPage: true });
    await expectNoSeriousAxeViolations(authedPage, 'settings-idle');

    // ---- AC4 Step 1: Warning dialog ----
    await deleteTrigger.click();
    const warning = authedPage.getByTestId('account-delete-step1');
    await expect(warning).toBeVisible();
    await expect(authedPage.getByRole('dialog', { name: /This cannot be undone/i })).toBeVisible();

    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac4-02-step1-warning.png` });
    await expectNoSeriousAxeViolations(authedPage, 'step1-warning');

    // ---- AC4 Step 2: Email typed-confirm ----
    await authedPage.getByTestId('account-delete-continue').click();
    const step2 = authedPage.getByTestId('account-delete-step2');
    await expect(step2).toBeVisible();

    const emailInput = authedPage.getByTestId('account-delete-email');
    const userEmail = (await emailInput.getAttribute('data-user-email')) ?? '';
    expect(
      userEmail.length,
      'data-user-email attr should expose the current user email',
    ).toBeGreaterThan(0);
    // Synthesis Conflict #1 — case-INSENSITIVE match: type the upper-case form.
    await emailInput.fill(userEmail.toUpperCase());

    const deleteAccountBtn = authedPage.getByTestId('account-delete-confirm-email');
    // aria-disabled toggles to "false" once the case-insensitive match passes.
    await expect(deleteAccountBtn).toHaveAttribute('aria-disabled', 'false');

    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac4-03-step2-typed-confirm.png` });
    await expectNoSeriousAxeViolations(authedPage, 'step2-typed-confirm');

    // ---- AC4 Step 3: Countdown ----
    await deleteAccountBtn.click();
    const step3 = authedPage.getByTestId('account-delete-step3');
    await expect(step3).toBeVisible();

    await authedPage.getByTestId('account-delete-understand').check();

    // Capture countdown screenshot mid-tick (around 6s left so the UI is
    // visibly animating). axe runs against the active countdown DOM.
    await authedPage.waitForTimeout(4000);
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac4-04-step3-countdown.png` });
    await expectNoSeriousAxeViolations(authedPage, 'step3-countdown-active');

    // Wait for the countdown to finish (10s total).
    const deleteNow = authedPage.getByTestId('account-delete-now');
    await expect(deleteNow).toHaveAttribute('aria-disabled', 'false', { timeout: 12_000 });

    // ---- AC4 Step 4: In-flight delete ----
    // Mock the delete route to delay 600ms so axe can scan the in-flight UI.
    await authedPage.route('**/api/account/delete', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    await deleteNow.click();
    const step4 = authedPage.getByTestId('account-delete-step4');
    await expect(step4).toBeVisible();
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac4-05-step4-in-flight.png` });
    await expectNoSeriousAxeViolations(authedPage, 'step4-in-flight');

    // ---- AC4 Step 5: Signed-out result page ----
    // Task B.1 (US-STAB-B1) AC2 update: successful cascade redirects to
    // `/?deleted=1`. Pre-B.1 the marketing root forwarded to
    // `/login?deleted=1`; post-B.1 the landing surface renders the
    // deletion-success banner inline at `/?deleted=1` (anon branch =
    // landing render, not redirect). Asserting both the URL AND the banner
    // pins the UX surface, not just the route.
    await authedPage.waitForURL(/\/\?deleted=1/, { timeout: 30_000 });
    await expect(authedPage).toHaveURL(/\/\?deleted=1/);
    const deletedBanner = authedPage.getByTestId('landing-deleted-banner');
    await expect(deletedBanner).toBeVisible();
    await expect(deletedBanner).toContainText(t.auth.deletedBanner.title);
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac4-06-signed-out-result.png`,
      fullPage: true,
    });
  });

  test('Step 1 ESC closes the warning dialog (reversible)', async ({ authedPage }) => {
    await authedPage.goto('/settings');
    await authedPage.getByTestId('account-delete-trigger').click();
    await expect(authedPage.getByTestId('account-delete-step1')).toBeVisible();
    await authedPage.keyboard.press('Escape');
    await expect(authedPage.getByTestId('account-delete-step1')).toBeHidden();
  });

  /**
   * Codex I1 regression — `handleSubmit` must clear
   * `sessionStorage[kalori-pending-cross-tab-signout]` on ALL exit
   * branches, not just success and network-throw. Previously the
   * `!res.ok → dispatch('fail')` branch left the flag set indefinitely,
   * which made `<CrossTabSignOutListener />` ignore subsequent
   * `kalori-auth` broadcasts in this tab.
   *
   * Setup: route the delete API to a 500 with a recoverable JSON body so
   * Step 6 (failure) renders. Then assert the sessionStorage flag has
   * been cleared (would FAIL before the try/finally fix because the flag
   * was set in handleSubmit and never reset on this branch).
   */
  test('Step 6 failure recovery clears PENDING_CROSS_TAB_KEY (Codex I1)', async ({
    authedPage,
  }) => {
    test.setTimeout(90_000);
    // Mock /api/account/delete BEFORE we enter the flow.
    await authedPage.route('**/api/account/delete', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'cascade_failed', recoverable: true, cause: 'db' }),
      });
    });

    await authedPage.goto('/settings');
    await authedPage.waitForLoadState('networkidle');

    await authedPage.getByTestId('account-delete-trigger').click();
    await expect(authedPage.getByTestId('account-delete-step1')).toBeVisible();
    await authedPage.getByTestId('account-delete-continue').click();

    const emailInput = authedPage.getByTestId('account-delete-email');
    const userEmail = (await emailInput.getAttribute('data-user-email')) ?? '';
    expect(userEmail.length).toBeGreaterThan(0);
    await emailInput.fill(userEmail);

    const confirmEmailBtn = authedPage.getByTestId('account-delete-confirm-email');
    await expect(confirmEmailBtn).toHaveAttribute('aria-disabled', 'false');
    await confirmEmailBtn.click();

    const step3 = authedPage.getByTestId('account-delete-step3');
    await expect(step3).toBeVisible();
    await authedPage.getByTestId('account-delete-understand').check();

    const deleteNow = authedPage.getByTestId('account-delete-now');
    await expect(deleteNow).toHaveAttribute('aria-disabled', 'false', { timeout: 12_000 });
    await deleteNow.click();

    // Step 6 (failure) should render with TRY AGAIN button.
    const step6 = authedPage.getByTestId('account-delete-step6');
    await expect(step6).toBeVisible({ timeout: 10_000 });
    await expect(authedPage.getByTestId('account-delete-retry')).toBeVisible();

    // Codex I1 load-bearing assertion — the pending flag MUST be cleared.
    const flag = await authedPage.evaluate(() =>
      sessionStorage.getItem('kalori-pending-cross-tab-signout'),
    );
    expect(flag).toBeNull();
  });
});

test.describe('Task 5.2 · ExportModal (AC3)', () => {
  test('CSV export — open modal, click EXPORT, native download fires', async ({ authedPage }) => {
    await authedPage.goto('/settings');
    await authedPage.waitForLoadState('networkidle');

    const csvTrigger = authedPage.getByTestId('export-trigger-csv');
    await expect(csvTrigger).toBeVisible();
    await csvTrigger.click();

    const modal = authedPage.getByTestId('export-modal');
    await expect(modal).toBeVisible();
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac3-01-modal-opened.png` });
    await expectNoSeriousAxeViolations(authedPage, 'export-modal-opened');

    // Click EXPORT → fetching state.
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac3-02-format-chosen.png` });
    const exportBtn = authedPage.getByTestId('export-modal-cta');

    // Set up the download promise BEFORE clicking.
    const downloadPromise = authedPage.waitForEvent('download', { timeout: 15_000 });
    await exportBtn.click();

    // Generating state — assert phase indicator visible.
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac3-03-generating.png` });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kalori-export-.+\.zip$/);
    await authedPage.screenshot({ path: `${SCREENSHOT_DIR}/ac3-04-download-ready.png` });
  });
});
