/**
 * US-ADDFOOD-1 — Add Food tab merge user story.
 *
 * Story:
 *   AS a user adding food via the dashboard FAB,
 *   I WANT a single "Add Food" tab that defaults to my personal library and
 *        lets me fall back to AI parse for unknown items,
 *   SO THAT I can re-log existing foods in one tap and only type/photograph
 *        when I actually need to create a new library item.
 *
 * Acceptance Criteria (verbatim from Planning/features/2026-05-17-add-food-
 * tab-merge/plan.md §13 + user story spec):
 *   AC1: dashboard FAB opens the log-flow modal with the Add Food tab active
 *        by default.
 *   AC2: library subview renders the loading skeleton for at least one frame
 *        before either the populated list OR the empty-state surface appears
 *        (race: skeleton may not flash if hydration is fast).
 *   AC3: searching for a string that does not match any library item shows
 *        the empty-state CTA `Add "<term>" as new item`; clicking it swaps
 *        to the AI parse subview with the textarea pre-filled to that term.
 *   AC4: tapping the `+` icon button beside library search → AI parse form
 *        renders → tapping its back arrow returns to the library subview
 *        with the previously-typed search term preserved.
 *   AC5: Snap tab remains accessible from the tab bar and continues to render
 *        its own panel when activated.
 *
 * Fixture notes:
 *   - `authedPage` (tests/e2e/fixtures/auth.ts) provisions a freshly-created
 *     onboarding-complete Supabase user. The user's `food_library_items`
 *     table starts empty — that is fine for AC1/AC3/AC4/AC5 (which all
 *     exercise UI paths that render with zero items) AND for AC2 (which
 *     asserts either skeleton OR empty-state, not a populated list).
 *   - The modal opens IN PLACE on `/dashboard` — `meal-add-breakfast` calls
 *     `useLogFlowStore.openModal('library', { mealCategory: 'breakfast' })`
 *     and the chrome-level `<LogFlowModalMount />` renders the Dialog
 *     portal. No navigation to `/log` is required.
 *   - The CTA `library-add-new-cta` is rendered conditionally by
 *     LibraryList.tsx whenever the (deferred-debounced) search input value
 *     is non-empty AND the filtered set is empty — that condition is
 *     satisfied here because the user's library is empty, so any non-empty
 *     search term immediately triggers the CTA branch.
 *   - The `+` icon button (`library-add-new-icon-button`) is rendered
 *     unconditionally beside the search input, so AC4 doesn't depend on
 *     seeded items either.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';

const STORY = 'US-ADDFOOD-1';

test.describe(`${STORY} — Add Food tab merge`, () => {
  test.beforeEach(async ({ authedPage }) => {
    // Land on the dashboard so the meal-add FAB (rendered by
    // <MealEntryContextTrigger />) is mounted. The authedPage fixture
    // already wrote a real Supabase session cookie onto the context, so
    // the middleware passes through and the dashboard RSC renders the
    // meal columns including the per-category `meal-add-<cat>` button.
    await authedPage.goto('/dashboard');
    await expect(authedPage.getByTestId('meal-add-breakfast')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AC1: dashboard FAB opens log-flow modal with Add Food tab active by default', async ({
    authedPage,
  }) => {
    await authedPage.getByTestId('meal-add-breakfast').click();

    // Modal mounts; the Add Food trigger is rendered and selected.
    await expect(authedPage.getByTestId('log-flow-modal')).toBeVisible({ timeout: 10_000 });

    const addFoodTab = authedPage.getByTestId('log-flow-tab-add-food');
    await expect(addFoodTab).toBeVisible();
    await expect(addFoodTab).toHaveAttribute('data-state', 'active');
    await expect(authedPage.getByTestId('log-flow-panel-add-food')).toBeVisible();
  });

  test('AC2: library subview renders skeleton OR list/empty-state on modal open', async ({
    authedPage,
  }) => {
    await authedPage.getByTestId('meal-add-breakfast').click();
    await expect(authedPage.getByTestId('log-flow-modal')).toBeVisible({ timeout: 10_000 });

    // Race: the loading skeleton renders only while the library query is
    // hydrating (`hydrating && items.length === 0` branch in
    // LibraryList.tsx). When hydration is fast — empty library, no
    // thumbnails to fetch — the component may transition directly from
    // skeleton to empty-state within a single render frame. Either the
    // skeleton OR one of the post-hydration surfaces is sufficient
    // evidence the library subview mounted.
    await expect(
      authedPage
        .getByTestId('library-skeleton')
        .or(authedPage.getByTestId('library-list'))
        .or(authedPage.getByTestId('library-empty-state'))
        .first(),
    ).toBeVisible({ timeout: 5_000 });

    // Eventually the library settles into a non-skeleton state. With the
    // fixture's empty library, that surface is `library-empty-state`; if
    // a future fixture variant seeds items the `library-list` <ul>
    // appears instead.
    await expect(
      authedPage
        .getByTestId('library-list')
        .or(authedPage.getByTestId('library-empty-state'))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('AC3: search-miss → empty-state CTA → parse pre-filled', async ({ authedPage }) => {
    await authedPage.getByTestId('meal-add-breakfast').click();
    await expect(authedPage.getByTestId('log-flow-modal')).toBeVisible({ timeout: 10_000 });

    const searchInput = authedPage.getByTestId('library-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('zzzimaginaryfood');

    // The CTA renders when the (deferred) search term is non-empty AND
    // the filtered list is empty. With a fresh-user empty library, any
    // non-empty term triggers the CTA branch. The label format is
    //   `${t.log.addNewItemCtaPrefix} "${trimmed}" ${t.log.addNewItemCtaSuffix}`
    // which expands to `Add "zzzimaginaryfood" as new item`.
    const cta = authedPage.getByTestId('library-add-new-cta');
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await expect(cta).toHaveText(/Add\s+"zzzimaginaryfood"\s+as new item/);

    await cta.click();

    // The CTA invokes `onAddNew(searchTerm)` → AddFoodTab.goToParseView
    // (sets typeDraft = seed, swaps activeTab → 'type'). The AiParseForm
    // mounts with the textarea bound to typeDraft.
    const textarea = authedPage.getByTestId('type-tab-textarea');
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await expect(textarea).toHaveValue('zzzimaginaryfood');
  });

  test('AC4: back arrow from parse → library preserves search term', async ({ authedPage }) => {
    await authedPage.getByTestId('meal-add-breakfast').click();
    await expect(authedPage.getByTestId('log-flow-modal')).toBeVisible({ timeout: 10_000 });

    const searchInput = authedPage.getByTestId('library-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('pho');

    // `+` icon next to search — always rendered, no dependency on
    // populated library. Click → AddFoodTab.goToParseView('') → AiParseForm.
    // (typeDraft is NOT seeded from the search term on the icon path —
    // only the empty-state CTA seeds the textarea — but the library
    // search term itself MUST persist across the back-nav round-trip.)
    await authedPage.getByTestId('library-add-new-icon-button').click();
    await expect(authedPage.getByTestId('type-tab-form')).toBeVisible({ timeout: 5_000 });

    // Back arrow on the AiParseForm header → AddFoodTab.goBackToLibrary
    // (activeTab → 'library'). The LibraryList remounts with `search`
    // sourced from the store's `librarySearch`, which was never cleared.
    await authedPage.getByTestId('ai-parse-form-back').click();
    await expect(authedPage.getByTestId('library-search-input')).toHaveValue('pho', {
      timeout: 5_000,
    });
  });

  test('AC5: Snap tab remains accessible and unchanged in behavior', async ({ authedPage }) => {
    await authedPage.getByTestId('meal-add-breakfast').click();
    await expect(authedPage.getByTestId('log-flow-modal')).toBeVisible({ timeout: 10_000 });

    const snapTrigger = authedPage.getByTestId('log-flow-tab-snap');
    await expect(snapTrigger).toBeVisible();
    await snapTrigger.click();

    await expect(snapTrigger).toHaveAttribute('data-state', 'active');
    await expect(authedPage.getByTestId('log-flow-panel-snap')).toBeVisible();
  });
});
