/**
 * Task C.6 (US-STAB-C6) — Library grid → /library/[id] detail page navigation.
 *
 * Story (verbatim from `Planning/tasks.md`):
 *   AS a Library page user,
 *   WHEN I click (or keyboard-activate) a library card in the grid,
 *   THEN I am navigated to `/library/[id]` where the existing Food Detail
 *        surface renders.
 *
 * AC coverage:
 *   AC1 (click-card-navigates-to-detail) — clicking a card navigates to
 *       /library/${id} AND the existing Food Detail page renders
 *       (data-testid="page-library-detail").
 *   AC3 (log-now-from-detail-still-works) — after navigation, the existing
 *       Log-Now affordance on the detail page is reachable AND clicking it
 *       routes to /log?tab=library&item=... (regression-guard for F19-AC4).
 *
 * AC2 (keyboard-enter-and-space-activate) is covered at integration level
 * via `tests/integration/library-grid-navigation.test.tsx` because the card
 * key handler is React-bound and the assertion target (`router.push`) is
 * unit-testable without a browser. Per testing-strategy.md, integration
 * suffices when the structural keyboard binding is library-internal —
 * which it is here (LibraryCard.tsx:71-79 maps Enter+Space → handleClick).
 *
 * Click-through Mandate compliance:
 *   - WHEN-clause user-action: `page.click()` on the card locator.
 *   - Post-action `expect(locator).toBeVisible()` against rendered DOM
 *     (data-testid="page-library-detail") — NOT a URL-only assertion.
 *   - Sequenced screenshots per AC at
 *     `tests/screenshots/user-stories/US-STAB-C6/`.
 *   - Evidence narrative at the same path.
 *
 * Seed strategy:
 *   Uses the service-role `seedLibraryItems` helper (mirrors
 *   `library-add-then-view.spec.ts`) to insert one row under the
 *   fixture-provisioned user's id. The fresh authedPage user has no
 *   library rows by default; without seeding `/library` shows the
 *   empty state and there is nothing to click.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';
import { resolveTestUserId, seedLibraryItems } from '../../library/_seed';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-C6';

test.describe('US-STAB-C6 · Library grid → /library/[id] navigation', () => {
  test('AC1: click-card-navigates-to-detail — clicking a card opens the Food Detail page', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'C6-stab-banh-mi',
        normalized_name: 'c6 stab banh mi',
        nutrition: { kcal: 480, macros: { protein_g: 18, carbs_g: 60, fat_g: 18 } },
        log_count: 2,
      },
    ]);
    const itemId = seeded[0]!.id;

    // GIVEN — /library populated with one seeded row.
    await authedPage.goto('/library');
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    const card = authedPage.getByTestId(`library-card-${itemId}`);
    await expect(card).toBeVisible();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-01-initial.png`,
      fullPage: true,
    });

    // WHEN — real user action: click the card.
    await card.click();

    // THEN — the detail page renders (DOM assertion, not URL-only).
    const detailSection = authedPage.getByTestId('page-library-detail');
    await expect(detailSection).toBeVisible({ timeout: 5_000 });
    await expect(authedPage).toHaveURL(new RegExp(`/library/${itemId}$`));

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-02-result.png`,
      fullPage: true,
    });
  });

  test('AC3: log-now-from-detail-still-works — Log-Now reachable post-navigation', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'C6-stab-pho-bo',
        normalized_name: 'c6 stab pho bo',
        nutrition: { kcal: 520, macros: { protein_g: 32, carbs_g: 64, fat_g: 12 } },
        log_count: 5,
      },
    ]);
    const itemId = seeded[0]!.id;

    // GIVEN — click-through path from /library, exercising C.6's wiring.
    await authedPage.goto('/library');
    await authedPage.getByTestId(`library-card-${itemId}`).click();

    const detailSection = authedPage.getByTestId('page-library-detail');
    await expect(detailSection).toBeVisible({ timeout: 5_000 });

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-01-initial.png`,
      fullPage: true,
    });

    // WHEN — click the existing F19 Log-Now button (data-testid lives on
    // <FoodDetailActions>, see FoodDetailActions.tsx:69).
    const logNow = authedPage.getByTestId('food-detail-log-now');
    await expect(logNow).toBeVisible();
    await logNow.click();

    // Tapping "Log this now" opens the meal-slot picker popover. Click "Breakfast" (or any meal) to submit the log.
    await expect(authedPage.getByTestId('food-detail-log-now-meal-picker')).toBeVisible();
    await authedPage.getByTestId('food-detail-log-now-meal-breakfast').click();

    // THEN — Library overhaul 2026-05-16 (FoodDetail.tsx:21–25) replaced
    // the legacy `router.push('/log?tab=library&item=…')` deep-link with
    // an atomic in-place POST to `/api/library/[id]/log-now` followed by
    // a success toast + `router.refresh()`. The user stays on
    // `/library/[id]`; the entry is logged server-side; the success
    // toast (label: "Logged") is the user-observable confirmation.
    await expect(authedPage).toHaveURL(new RegExp(`/library/${itemId}$`));
    // Detail surface remains visible — no navigation away.
    await expect(detailSection).toBeVisible();
    // Success toast confirms the in-place log completed.
    await expect(authedPage.getByTestId('undo-toast').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(authedPage.getByTestId('undo-toast').first()).toContainText(/Logged/i);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-02-result.png`,
      fullPage: true,
    });
  });
});
