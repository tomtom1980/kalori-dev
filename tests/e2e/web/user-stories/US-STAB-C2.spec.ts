/**
 * Task C.2 (US-STAB-C2) — Library CRUD UI: two-section /library + Edit + Log-Now.
 *
 * Story (verbatim from `Planning/tasks.md`):
 *   AS a Library page user,
 *   WHEN I view /library, edit a library item, or click "Log Now" on a
 *        library detail page,
 *   THEN I see BOTH "My Library" AND "Recent Entries" sections; my edit
 *        persists; and "Log Now" creates a new food_entries row for today.
 *
 * AC coverage (E2E):
 *   AC1 (two-sections-visible) — /library shows BOTH My Library AND
 *       Recent Entries sections simultaneously on the same render. Assertion
 *       targets the actual rendered DOM (section testids + roles), NOT URL.
 *   AC2 (edit-modal-saves) — clicking a library card → Edit → renaming →
 *       Save persists the new name. The post-save proof is the renamed
 *       value visible back on the /library list (round-trip persistence,
 *       not just an in-memory state update).
 *   AC4 (log-now-creates-entry) — clicking "Log this now" from the detail
 *       page surfaces the success toast AND a corresponding food_entries
 *       row appears in the Recent Entries section after router.refresh().
 *
 * AC3 (delete-removes-row) is covered at the integration level by
 * `tests/integration/library-crud.test.ts::delete-removes-row` per the
 * task briefing test plan — no E2E mirror unless undo timer needs visual
 * proof; not included here (the redundant integration test plus the
 * existing single/bulk-delete-undo E2E specs already cover it).
 *
 * Click-through Mandate compliance (session-context.md §8):
 *   - WHEN-clause user-action API calls per AC: `page.click`, `page.fill`,
 *     `page.waitForLoadState`. NO `page.goto`-only smoke tests.
 *   - Post-action `expect(locator).toBeVisible() / toHaveText() / toHaveValue()`
 *     against rendered DOM — NOT URL-only / title-only.
 *   - Sequenced screenshots per AC at
 *     `tests/screenshots/user-stories/US-STAB-C2/`.
 *   - Evidence narrative at the same path.
 *
 * Seed strategy:
 *   - AC1 needs ≥1 library item AND ≥1 recent food_entries row inside the
 *     14-day window so both sections render with content. Uses
 *     `seedLibraryItems` + `seedFoodEntries` (service-role helpers).
 *   - AC2 + AC4 each seed one library item under the test user. AC2 also
 *     ensures the renamed value is unique-per-test so the assertion is
 *     unambiguous when other tests run in parallel.
 *
 * R1 firewall:
 *   This spec does NOT edit any auth glue. All mutation calls are exercised
 *   through the UI (Save / Log-Now buttons), so the production `authPost`
 *   path runs end-to-end. No raw fetch is made from the spec itself.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';
import { resolveTestUserId, seedFoodEntries, seedLibraryItems } from '../../library/_seed';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-C2';

test.describe('US-STAB-C2 · Library CRUD UI', () => {
  test('AC1: two-sections-visible — /library renders My Library AND Recent Entries simultaneously', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);

    // GIVEN — at least one library item AND at least one food_entries row
    // inside the 14-day Recent Entries window for this user. Without
    // BOTH, only one section is rendered (empty-state branch on the
    // other), which would not exercise AC1's simultaneous-render claim.
    const seededLibrary = await seedLibraryItems(userId, [
      {
        display_name: 'C2-ac1-pho-bo',
        normalized_name: 'c2 ac1 pho bo',
        nutrition: { kcal: 480, macros: { protein_g: 28, carbs_g: 56, fat_g: 14 } },
        log_count: 3,
      },
    ]);
    const itemId = seededLibrary[0]!.id;

    // Seed a recent food_entries row inside the 14-day window.
    await seedFoodEntries(userId, [
      {
        library_item_id: itemId,
        display_name: 'C2-ac1-pho-bo',
        logged_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
        meal_category: 'lunch',
        nutrition: { kcal: 480, macros: { protein_g: 28, carbs_g: 56, fat_g: 14 } },
      },
    ]);

    // WHEN — navigate to /library and wait for both sections to settle.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-01-initial.png`,
      fullPage: true,
    });

    // THEN — both section headings AND their structural roots are visible
    // simultaneously. We assert against three observables per section to
    // pin both the accessible name AND the data-testid hooks the Phase 1
    // UI sub-agent committed:
    //   - My Library:   library masthead + library grid
    //   - Recent Entries: <section> with aria-labelledby + the <h2> heading
    //                     + a non-empty <ul role="list"> containing rows.
    const myLibraryHeading = authedPage.getByRole('heading', { name: /the library/i });
    await expect(myLibraryHeading).toBeVisible();
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${itemId}`)).toBeVisible();

    const recentEntriesSection = authedPage.getByTestId('section-recent-entries');
    await expect(recentEntriesSection).toBeVisible();
    const recentEntriesHeading = recentEntriesSection.getByRole('heading', {
      name: /recent entries/i,
      level: 2,
    });
    await expect(recentEntriesHeading).toBeVisible();
    // Real <ul role="list"> with ≥1 seeded row — confirms the populated
    // (non-empty) branch rendered, not the empty-state placeholder.
    await expect(recentEntriesSection.getByRole('list').first()).toBeVisible();
    await expect(recentEntriesSection.getByTestId('recent-entries-row').first()).toBeVisible();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-02-result.png`,
      fullPage: true,
    });
  });

  test('AC2: edit-modal-saves — renaming a library item via the detail page persists to /library', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);

    // Unique-per-test names so the post-save assertion is unambiguous when
    // suites run in parallel.
    const originalName = `C2-ac2-orig-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const renamedName = `C2-ac2-renamed-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

    const seeded = await seedLibraryItems(userId, [
      {
        display_name: originalName,
        normalized_name: originalName.toLowerCase(),
        nutrition: { kcal: 350, macros: { protein_g: 15, carbs_g: 40, fat_g: 12 } },
        log_count: 1,
      },
    ]);
    const itemId = seeded[0]!.id;

    // GIVEN — open the library page, locate the seeded card, navigate to
    // the detail surface.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    await expect(authedPage.getByTestId(`library-card-${itemId}`)).toBeVisible();
    await authedPage.getByTestId(`library-card-${itemId}`).click();

    // Detail surface renders.
    await expect(authedPage.getByTestId('page-library-detail')).toBeVisible({ timeout: 5_000 });
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(originalName);

    // Enter edit mode.
    await authedPage.getByTestId('food-detail-edit-button').click();
    const nameInput = authedPage.getByTestId('food-detail-edit-name-input');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue(originalName);

    // WHEN — clear the input, type the new name, click Save.
    await nameInput.fill(renamedName);
    await expect(nameInput).toHaveValue(renamedName);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-01-initial.png`,
      fullPage: true,
    });

    // Wait for the PATCH/POST to land before asserting persistence — the
    // success path closes edit mode + reuses the committed item state.
    const updateResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemId}/update`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await authedPage.getByTestId('food-detail-save-button').click();
    await updateResponse;

    // THEN (in-place post-save proof) — the read-mode h1 shows the new
    // name and the edit form has been torn down.
    await expect(authedPage.getByTestId('food-detail-name')).toHaveText(renamedName);
    await expect(authedPage.getByTestId('food-detail-edit-name-input')).toHaveCount(0);

    // THEN (round-trip persistence proof) — navigate back to /library and
    // confirm the renamed card surfaces by accessible name. RSC refresh
    // re-fetches the tombstone-aware list so the rename should be visible
    // without a hard reload, but we hit /library fresh to make the
    // persistence claim airtight.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    const renamedCard = authedPage.getByTestId(`library-card-${itemId}`);
    await expect(renamedCard).toBeVisible();
    await expect(renamedCard).toContainText(renamedName);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-02-result.png`,
      fullPage: true,
    });
  });

  test('AC4: log-now-creates-entry — clicking Log This Now inserts a food_entries row + success toast', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);

    const foodName = `C2-ac4-banh-mi-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: foodName,
        normalized_name: foodName.toLowerCase(),
        nutrition: { kcal: 420, macros: { protein_g: 18, carbs_g: 50, fat_g: 14 } },
        log_count: 0,
      },
    ]);
    const itemId = seeded[0]!.id;

    // GIVEN — open the detail surface directly. The Log-Now button lives
    // in <FoodDetailActions> at testid `food-detail-log-now` per the
    // post-C.2 rewire.
    await authedPage.goto(`/library/${itemId}`);
    await authedPage.waitForLoadState('networkidle');
    const detailSurface = authedPage.getByTestId('page-library-detail');
    await expect(detailSurface).toBeVisible({ timeout: 5_000 });

    const logNowButton = authedPage.getByTestId('food-detail-log-now');
    await expect(logNowButton).toBeVisible();
    await expect(logNowButton).toBeEnabled();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac4-01-initial.png`,
      fullPage: true,
    });

    // WHEN — click Log This Now AND wait for the server insert to land
    // (post-C.2 contract POSTs to /api/library/<id>/log-now with the
    // atomic snapshot read).
    const logNowResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/library/${itemId}/log-now`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await logNowButton.click();
    await expect(authedPage.getByTestId('food-detail-log-now-meal-picker')).toBeVisible();
    await authedPage.getByTestId('food-detail-log-now-meal-snack').click();
    const logNowResp = await logNowResponse;

    // THEN (network proof) — the response was 200.
    expect(logNowResp.status()).toBe(200);

    // THEN (DOM proof, primary) — the success toast surfaces as
    // role="status" with the project's "Logged · view in today's log"
    // copy. We anchor on the data-testid for resilience to copy tweaks
    // but ALSO assert the role to satisfy the a11y contract.
    const toast = authedPage.getByTestId('undo-toast').first();
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toContainText(/logged/i);

    // THEN (round-trip proof) — navigate to /library and confirm the new
    // entry appears in the Recent Entries section. The server route
    // revalidates `TAGS.userEntries(uid, day)` + `TAGS.userLibrary(uid)`
    // before responding so a fresh /library hit re-renders with the row.
    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');
    const recentEntriesSection = authedPage.getByTestId('section-recent-entries');
    await expect(recentEntriesSection).toBeVisible();
    // The row aria-label embeds the food_name; the most defensive assertion
    // is "any row containing the seeded foodName appears." Using
    // `.filter({ hasText })` lets the row reorder around other entries
    // without breaking the test.
    const matchingRow = recentEntriesSection
      .getByTestId('recent-entries-row')
      .filter({ hasText: foodName });
    await expect(matchingRow.first()).toBeVisible({ timeout: 5_000 });

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac4-02-result.png`,
      fullPage: true,
    });
  });
});
