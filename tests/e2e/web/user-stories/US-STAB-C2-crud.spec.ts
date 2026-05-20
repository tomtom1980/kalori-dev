/**
 * Task C.E2E.2 (US-STAB-C2 Library CRUD) — consolidated CRUD walk + AC3.
 *
 * Sibling spec coexistence:
 *   `tests/e2e/web/user-stories/US-STAB-C2.spec.ts` (committed in task C.2)
 *   already covers AC1 / AC2 / AC4 as isolated tests with dedicated seeds
 *   per AC. THIS file is the distinct `-crud` sibling: it owns the AC3
 *   click-through (`delete-removes-row` via UI confirm dialog) PLUS the
 *   consolidated CRUD chain (list → Edit → Save → Delete → Confirm →
 *   Log-Now → entry appears) as a single `test()`.
 *
 *   The two files COEXIST in `tests/e2e/web/user-stories/`. This spec MUST
 *   NOT consolidate, overwrite, or rename the sibling.
 *
 * AC coverage owned by THIS spec:
 *   AC3 (delete-removes-row) — UNIQUE to this file. Standalone test seeds a
 *       single library item, opens its detail surface, clicks Delete,
 *       confirms via BulkDeleteConfirmDialog (N=1 mode), and asserts the
 *       row disappears from the /library grid + the deleted-toast surfaces.
 *   CRUD chain (consolidated walk) — one `test()` exercising M1→M6 as a
 *       single state-continuity flow:
 *         M1: log in → /library → two-section list visible (AC1 re-touch)
 *         M2: click card → enter edit mode on item_A (AC2 re-touch)
 *         M3: rename + Save → in-place + round-trip persistence proof
 *         M4: click Delete on item_A → BulkDeleteConfirmDialog open
 *         M5: Confirm → tombstone + redirect to /library + undo toast
 *         M6: click Log-Now on item_B → success toast + entry in Recent
 *
 * SCOPE-SKIP (3 + 1):
 *   AC1 / AC2 / AC4 — covered by the sibling spec `US-STAB-C2.spec.ts` as
 *       isolated tests. The chain test re-touches these surfaces inline,
 *       but the canonical isolated-AC coverage lives in the sibling file.
 *   AC5 (RLS-harness regression) — out of scope here per briefing §6, §13
 *       question 6. The 66-assertion RLS harness re-runs at C.SWEEP (Phase
 *       C Testing Sweep) where the contract is recoverable on a clean
 *       baseline.
 *
 * Click-through Mandate compliance (Planning/testing-strategy.md):
 *   - WHEN-clause user-action API calls per `test()`: `page.click`,
 *     `page.fill`, `page.waitForLoadState`, `page.waitForResponse`. NO
 *     `page.goto`-only smoke tests. (`goto('/library')` IS allowed as
 *     the GIVEN-clause entry + as round-trip refresh proofs.)
 *   - Post-action `expect(locator).toBeVisible() / toHaveText() /
 *     toHaveValue() / toContainText() / toHaveCount()` against rendered
 *     DOM — NOT URL-only / title-only / status-code-only.
 *   - Sequenced screenshots per milestone at
 *     `tests/screenshots/user-stories/US-STAB-C2-crud/`.
 *   - Evidence narrative at the same path.
 *
 * Seed strategy:
 *   - AC3 standalone: one library item under the test user. Click-through
 *     deletes it; no Recent Entries dependency.
 *   - CRUD chain: TWO library items + ONE food_entries row inside the
 *     14-day window attached to `item_B.id` (NOT `item_A.id`). This way
 *     when M5 deletes item_A, the seeded food_entries row attached to
 *     item_B survives, so Recent Entries continues to render its
 *     non-empty branch on the post-delete /library re-visit (per
 *     briefing §13 question 5).
 *
 * Network proofs (no spec-level fetch — every mutation runs through the
 * UI button, hitting the production `authPost` path end-to-end):
 *   - `POST /api/library/<id>/update`     → CRUD chain M3
 *   - `POST /api/library/<id>/delete`     → AC3 + CRUD chain M5
 *   - `POST /api/library/<id>/log-now`    → CRUD chain M6
 *
 * R1 firewall:
 *   This spec does NOT edit `lib/auth/refresh-interceptor.ts`,
 *   `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`,
 *   `middleware.ts`, RLS / profiles migrations, or `ConfirmationScreen.tsx`.
 *   TEST-ONLY task — the production click-through path is exercised
 *   read-only through UI buttons.
 *
 * F-TEST-4 #1 (local execution gate):
 *   The `tests/e2e/fixtures/auth.ts` fixture requires `SUPABASE_TEST_*`
 *   service-role secrets to provision an ephemeral user per test. Local
 *   dev does not have these wired. Local verification is `playwright test
 *   --list` (compile + import-resolve + test-discovery proof). CI runs
 *   the actual browser flow + generates screenshots.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';
import { resolveTestUserId, seedFoodEntries, seedLibraryItems } from '../../library/_seed';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-C2-crud';

test.describe('US-STAB-C2 · Library CRUD (crud walk)', () => {
  test('US-STAB-C2 AC3 — delete custom food removes it from library', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);

    // GIVEN — a single seeded library item under the test user. Unique-per-test
    // name so the assertion is unambiguous when suites run in parallel.
    const targetName = `C-E2E-2-ac3-delete-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: targetName,
        normalized_name: targetName.toLowerCase(),
        nutrition: { kcal: 280, macros: { protein_g: 14, carbs_g: 30, fat_g: 10 } },
        log_count: 1,
      },
    ]);
    const itemId = seeded[0]!.id;

    // GIVEN — open the library page and confirm the seeded card is present
    // before any mutation. This pins the "row exists pre-delete" half of
    // AC3's claim; the post-confirm assertion proves the disappearance.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    await expect(authedPage.getByTestId(`library-card-${itemId}`)).toBeVisible();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-01-initial.png`,
      fullPage: true,
    });

    // WHEN (1) — navigate to the detail surface and open the delete dialog.
    await authedPage.getByTestId(`library-card-${itemId}`).click();
    await expect(authedPage.getByTestId('page-library-detail')).toBeVisible({ timeout: 5_000 });
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(targetName);
    await authedPage.getByTestId('food-detail-delete-button').click();

    // THEN (dialog open + N=1 single-name slot) — the same
    // BulkDeleteConfirmDialog used by bulk-delete opens in N=1 mode with the
    // target name pinned in the `library-bulk-delete-name` slot.
    const dialog = authedPage.getByTestId('library-bulk-delete-dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(authedPage.getByTestId('library-bulk-delete-name')).toContainText(targetName);
    // Both action buttons exposed (cancel + confirm). We don't click cancel
    // on the happy path; we still assert visible so a regression that drops
    // the cancel affordance surfaces here, not in a flaky retry.
    await expect(authedPage.getByTestId('library-bulk-delete-cancel')).toBeVisible();
    await expect(authedPage.getByTestId('library-bulk-delete-confirm')).toBeVisible();

    // WHEN (2) — click Confirm AND wait for the server delete to land. The
    // production `FoodDetail.onDeleteConfirm` posts to
    // `/api/library/<id>/delete`, then `router.push('/library')` +
    // `router.refresh()` to re-fetch the tombstone-aware list.
    const deleteResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemId}/delete`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await authedPage.getByTestId('library-bulk-delete-confirm').click();
    const deleteResp = await deleteResponse;

    // THEN (network proof) — the response was 200.
    expect(deleteResp.status()).toBe(200);

    // THEN (DOM proof, primary) — after `router.push('/library')` +
    // `router.refresh()` the seeded card MUST be absent from the grid.
    // Playwright's auto-retry handles the post-refresh repaint window;
    // no manual waitForTimeout required.
    await authedPage.waitForLoadState('networkidle');
    await expect(authedPage.getByTestId(`library-card-${itemId}`)).toHaveCount(0);

    // THEN (DOM proof, undo-toast surfaces) — the deleted-toast renders
    // with `role="status"`. Anchor on the data-testid for resilience to
    // copy tweaks, but also assert the role to satisfy the a11y contract
    // AND match `/deleted/i` against `t.library.detail.deletedToast =
    // '1 item deleted · undo 5s'`.
    const toast = authedPage.getByTestId('undo-toast').first();
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toContainText(/deleted/i);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-02-result.png`,
      fullPage: true,
    });
  });

  test('US-STAB-C2 CRUD chain — create -> edit -> log-now -> recent-entries -> delete', async ({
    authedPage,
    context,
  }) => {
    // F5 fix (2026-05-16) — multi-milestone CRUD chain (M1..M5) hits 4
    // mutation endpoints + 3 navigations + many DOM proofs in serial.
    // Dev-mode on-demand route compilation + cross-region Supabase (SG ↔
    // iad1 ~150-200ms RTT) blows past the 30s default. 90s is enough for
    // a clean run with budget for the first-compile penalty on each route.
    test.setTimeout(90_000);
    const userId = await resolveTestUserId(context);

    // ──────────────────────────────────────────────────────────────────────
    // Seed — TWO library items + one food_entries row attached to item_B.
    //
    // item_A: rename + delete subject. Killed in M5.
    // item_B: log-now subject. Survives the chain so M6 round-trip can
    //         assert it in Recent Entries.
    // food_entries row: attached to item_B (per briefing §13 question 5
    //         — item_A is going to be soft-deleted, so the seeded row
    //         that proves the non-empty Recent Entries branch in M1 MUST
    //         live on item_B for survival across the chain).
    // ──────────────────────────────────────────────────────────────────────
    const itemAName = `C-E2E-2-crud-A-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const itemBName = `C-E2E-2-crud-B-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const renamedAName = `C-E2E-2-crud-A-renamed-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

    const seeded = await seedLibraryItems(userId, [
      {
        display_name: itemAName,
        normalized_name: itemAName.toLowerCase(),
        nutrition: { kcal: 350, macros: { protein_g: 15, carbs_g: 40, fat_g: 12 } },
        log_count: 1,
      },
      {
        display_name: itemBName,
        normalized_name: itemBName.toLowerCase(),
        nutrition: { kcal: 420, macros: { protein_g: 18, carbs_g: 50, fat_g: 14 } },
        log_count: 0,
      },
    ]);
    const itemA = seeded.find((row) => row.display_name === itemAName)!;
    const itemB = seeded.find((row) => row.display_name === itemBName)!;

    // food_entries row attached to item_B (NOT item_A). Two hours ago to sit
    // safely inside the 14-day Recent Entries window per briefing §13 #3.
    await seedFoodEntries(userId, [
      {
        library_item_id: itemB.id,
        display_name: itemBName,
        logged_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        meal_category: 'lunch',
        nutrition: { kcal: 420, macros: { protein_g: 18, carbs_g: 50, fat_g: 14 } },
      },
    ]);

    // ──────────────────────────────────────────────────────────────────────
    // M1 — login + two-section list (AC1 re-touch)
    // ──────────────────────────────────────────────────────────────────────
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');

    await expect(authedPage.getByRole('heading', { name: /the library/i })).toBeVisible();
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${itemA.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${itemB.id}`)).toBeVisible();
    const recentEntriesM1 = authedPage.getByTestId('section-recent-entries');
    await expect(recentEntriesM1).toBeVisible();
    await expect(
      recentEntriesM1.getByRole('heading', { name: /recent entries/i, level: 2 }),
    ).toBeVisible();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/chain-01-empty.png`,
      fullPage: true,
    });

    // ──────────────────────────────────────────────────────────────────────
    // M2 — click Edit on item_A → enter edit mode (AC2 re-touch)
    // ──────────────────────────────────────────────────────────────────────
    await authedPage.getByTestId(`library-card-${itemA.id}`).click();
    await expect(authedPage.getByTestId('page-library-detail')).toBeVisible({ timeout: 5_000 });
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(itemAName);

    await authedPage.getByTestId('food-detail-edit-button').click();
    const nameInput = authedPage.getByTestId('food-detail-edit-name-input');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue(itemAName);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/chain-02-create.png`,
      fullPage: true,
    });

    // ──────────────────────────────────────────────────────────────────────
    // M3 — rename + Save → in-place + round-trip persistence (AC2 re-touch)
    // ──────────────────────────────────────────────────────────────────────
    await nameInput.fill(renamedAName);
    await expect(nameInput).toHaveValue(renamedAName);

    const updateResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemA.id}/update`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await authedPage.getByTestId('food-detail-save-button').click();
    await updateResponse;

    // In-place: read-mode h1 swaps to renamed value AND edit form is torn down.
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(renamedAName);
    await expect(authedPage.getByTestId('food-detail-edit-name-input')).toHaveCount(0);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/chain-03-edit.png`,
      fullPage: true,
    });

    // Round-trip: navigate back to /library and confirm the card surfaces
    // by accessible name. RSC refresh re-fetches the tombstone-aware list.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    const renamedCard = authedPage.getByTestId(`library-card-${itemA.id}`);
    await expect(renamedCard).toBeVisible();
    await expect(renamedCard).toContainText(renamedAName);

    // ──────────────────────────────────────────────────────────────────────
    // M4 — click Log-Now on item_B → success toast (AC4 re-touch).
    //
    // Sequenced BEFORE M5 delete so that the food_entries row sits in
    // Recent Entries before the delete-refresh round-trip exercises the
    // post-mutation cache invalidation. Briefing §6 sequences M4 as M6;
    // ordering is non-essential to the chain claim — we just need the
    // log-now click-through to happen before the chain closes.
    // ──────────────────────────────────────────────────────────────────────
    await authedPage.getByTestId(`library-card-${itemB.id}`).click();
    await expect(authedPage.getByTestId('page-library-detail')).toBeVisible({ timeout: 5_000 });
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(itemBName);

    const logNowButton = authedPage.getByTestId('food-detail-log-now');
    await expect(logNowButton).toBeVisible();
    await expect(logNowButton).toBeEnabled();

    const logNowResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemB.id}/log-now`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await logNowButton.click();
    await expect(authedPage.getByTestId('food-detail-log-now-meal-picker')).toBeVisible();
    await authedPage.getByTestId('food-detail-log-now-meal-snack').click();
    const logNowResp = await logNowResponse;
    expect(logNowResp.status()).toBe(200);

    const logToast = authedPage.getByTestId('undo-toast').first();
    await expect(logToast).toBeVisible({ timeout: 5_000 });
    await expect(logToast).toHaveAttribute('role', 'status');
    await expect(logToast).toContainText(/logged/i);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/chain-04-log.png`,
      fullPage: true,
    });

    // Round-trip: navigate back to /library and confirm the new entry
    // surfaces in Recent Entries. `.filter({ hasText })` makes the
    // assertion robust against reordering.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    const recentEntriesM4 = authedPage.getByTestId('section-recent-entries');
    await expect(recentEntriesM4).toBeVisible();
    const newRow = recentEntriesM4.getByTestId('recent-entries-row').filter({ hasText: itemBName });
    await expect(newRow.first()).toBeVisible({ timeout: 5_000 });

    // ──────────────────────────────────────────────────────────────────────
    // M5 — click Delete on item_A → confirm dialog + tombstone (AC3 — UNIQUE
    // to this spec). After M3 the card carries `renamedAName`; we anchor on
    // the testid (id-keyed, copy-independent) for the click and on the
    // renamed copy for the dialog single-name slot text proof.
    // ──────────────────────────────────────────────────────────────────────
    await authedPage.getByTestId(`library-card-${itemA.id}`).click();
    await expect(authedPage.getByTestId('page-library-detail')).toBeVisible({ timeout: 5_000 });
    await authedPage.getByTestId('food-detail-delete-button').click();

    const deleteDialog = authedPage.getByTestId('library-bulk-delete-dialog');
    await expect(deleteDialog).toBeVisible({ timeout: 5_000 });
    await expect(deleteDialog).toHaveAttribute('role', 'alertdialog');
    await expect(authedPage.getByTestId('library-bulk-delete-name')).toContainText(renamedAName);

    const chainDeleteResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemA.id}/delete`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await authedPage.getByTestId('library-bulk-delete-confirm').click();
    await chainDeleteResponse;

    // After router.push('/library') + router.refresh() the soft-deleted
    // card is filtered out of the grid (tombstone-aware list query).
    await authedPage.waitForLoadState('networkidle');
    await expect(authedPage.getByTestId(`library-card-${itemA.id}`)).toHaveCount(0);
    // item_B survives (the log-now subject, with the seeded food_entries row).
    await expect(authedPage.getByTestId(`library-card-${itemB.id}`)).toBeVisible();
    // Recent Entries section keeps rendering its non-empty branch — the
    // seeded `food_entries` row attached to item_B was NOT touched.
    await expect(authedPage.getByTestId('section-recent-entries')).toBeVisible();

    const deleteToast = authedPage.getByTestId('undo-toast').first();
    await expect(deleteToast).toBeVisible({ timeout: 5_000 });
    await expect(deleteToast).toHaveAttribute('role', 'status');
    await expect(deleteToast).toContainText(/deleted/i);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/chain-05-delete.png`,
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // SCOPE-SKIP declarations — coverage trail to the sibling spec + C.SWEEP
  // per the [SCOPE-SKIP] precedent in
  // tests/e2e/web/user-stories/US-STAB-A-bundled.spec.ts.
  // -------------------------------------------------------------------------

  // SCOPE-SKIP — AC1 (two-sections-visible) is covered by the sibling spec
  // `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC1` as an isolated
  // test with its own seed. The CRUD chain re-touches this surface in M1
  // (asserts both `library-grid` AND `section-recent-entries`) but the
  // canonical isolated-AC coverage is in the sibling file.
  test.skip('US-STAB-C2 AC1 — [SCOPE-SKIP]: two-sections-visible — covered by sibling tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC1', () => {
    /* covered by sibling spec — isolated AC test with dedicated seed */
  });

  // SCOPE-SKIP — AC2 (edit-modal-saves) is covered by the sibling spec
  // `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC2`. The CRUD chain
  // re-touches this surface in M2+M3 (in-place + round-trip persistence
  // proof on item_A) but the canonical isolated-AC coverage is in the
  // sibling file.
  test.skip('US-STAB-C2 AC2 — [SCOPE-SKIP]: edit-modal-saves — covered by sibling tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC2', () => {
    /* covered by sibling spec — isolated AC test with dedicated seed */
  });

  // SCOPE-SKIP — AC4 (log-now-creates-entry) is covered by the sibling spec
  // `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC4`. The CRUD chain
  // re-touches this surface in M4 (success toast + recent-entries
  // round-trip on item_B) but the canonical isolated-AC coverage is in
  // the sibling file.
  test.skip('US-STAB-C2 AC4 — [SCOPE-SKIP]: log-now-creates-entry — covered by sibling tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC4', () => {
    /* covered by sibling spec — isolated AC test with dedicated seed */
  });

  // SCOPE-SKIP — AC5 (RLS-harness regression) is out of scope for this
  // E2E spec per briefing §6 + §13 question 6. The 66-assertion RLS
  // harness re-runs as part of the Phase C Testing Sweep (task C.SWEEP)
  // against a clean baseline; the harness IS the contract.
  test.skip('US-STAB-C2 AC5 — [SCOPE-SKIP]: rls-harness-regression — covered by C.SWEEP Phase C Testing Sweep (66-assertion RLS harness)', () => {
    /* covered by C.SWEEP — invariant, no UI surface */
  });
});
