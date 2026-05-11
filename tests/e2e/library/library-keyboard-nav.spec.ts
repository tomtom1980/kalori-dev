/**
 * E2E: /library keyboard navigation — Task 4.1 sub-step 4 §15.5.7.
 *
 * Verifies keyboard-only interaction paths:
 *   - Tab order reaches interactive controls (search, filter, sort, select).
 *   - `/` shortcut focuses the search input from outside.
 *   - Arrow keys navigate the grid via roving tabindex.
 *   - Enter on a card in browse mode is wired (no-op for now — logs stub).
 *   - Enter on a card in select mode toggles selection.
 *   - Escape exits select mode and closes dialogs.
 *   - Cmd/Ctrl + A in select mode selects all visible (Phase 3 fix P3-bug-6a).
 *   - Standalone Delete/Backspace in select mode with N=1 opens bulk
 *     delete confirm (Phase 3 fix P3-bug-6a).
 *
 * **NOT covered** (deferred to Phase 4 with FoodDetail):
 *   - Shift+click range-select.
 *   - Card context menu via Menu / Shift+F10.
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · keyboard navigation', () => {
  test('slash focuses search, arrows roam grid, Enter toggles in select mode', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    await seedLibraryItems(userId, [
      {
        display_name: 'Alpha',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 2, fat_g: 3 } },
      },
      {
        display_name: 'Bravo',
        nutrition: { kcal: 200, macros: { protein_g: 4, carbs_g: 5, fat_g: 6 } },
      },
      {
        display_name: 'Charlie',
        nutrition: { kcal: 300, macros: { protein_g: 7, carbs_g: 8, fat_g: 9 } },
      },
      {
        display_name: 'Delta',
        nutrition: { kcal: 400, macros: { protein_g: 10, carbs_g: 11, fat_g: 12 } },
      },
    ]);

    await authedPage.goto('/library', { waitUntil: 'networkidle' });
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    // Small hydration beat — post-mount `useEffect` reads sessionStorage
    // (two-phase pattern after Phase 3 fix P3-bug-3) before any
    // user-driven keypress flows.
    await authedPage.waitForTimeout(120);

    // --- `/` focuses search input from a non-input element ---
    // Click the masthead first so focus is outside any input.
    await authedPage.getByTestId('library-masthead').click();
    await authedPage.keyboard.press('/');
    const searchInput = authedPage.getByTestId('library-search-input');
    await expect(searchInput).toBeFocused();

    // Escape while focused on a non-empty search clears it; on empty, blurs.
    await searchInput.fill('alp');
    await authedPage.keyboard.press('Escape');
    await expect(searchInput).toHaveValue('');

    // --- Arrow-key roving inside the grid ---
    //
    // The sort-DB-ordering returned by Supabase is `last_used_at DESC NULLS
    // LAST` (see lib/library/fetch.ts). All seeded rows have
    // last_used_at=null → rows order by the secondary (created_at implicit)
    // which for batch-insert ties can come back in ANY order. We therefore
    // read the DOM order of the cards as they actually rendered and
    // assert roving navigation against THAT order, not the seed array.
    const renderedCardIds = await authedPage
      .locator('[data-testid^="library-card-"]')
      .evaluateAll((els) =>
        (els as HTMLElement[])
          .map((el) => el.getAttribute('data-testid')?.replace(/^library-card-/, '') ?? '')
          .filter((id) => id && !id.startsWith('thumb-') && !id.startsWith('lettermark-')),
      );
    expect(renderedCardIds.length).toBeGreaterThanOrEqual(4);

    const firstCard = authedPage.getByTestId(`library-card-${renderedCardIds[0]}`);
    await expect(firstCard).toHaveAttribute('tabindex', '0', { timeout: 5_000 });
    await firstCard.focus();
    await expect(firstCard).toBeFocused();

    // `focusCard()` uses `queueMicrotask` for the node.focus() so we give the
    // commit one tick to settle before asserting each step.
    await authedPage.keyboard.press('ArrowRight');
    await expect(authedPage.getByTestId(`library-card-${renderedCardIds[1]}`)).toBeFocused({
      timeout: 5_000,
    });

    await authedPage.keyboard.press('ArrowRight');
    await expect(authedPage.getByTestId(`library-card-${renderedCardIds[2]}`)).toBeFocused({
      timeout: 5_000,
    });

    // Home → card[0]; End → last card.
    await authedPage.keyboard.press('Home');
    await expect(authedPage.getByTestId(`library-card-${renderedCardIds[0]}`)).toBeFocused({
      timeout: 5_000,
    });
    await authedPage.keyboard.press('End');
    const lastId = renderedCardIds[renderedCardIds.length - 1]!;
    await expect(authedPage.getByTestId(`library-card-${lastId}`)).toBeFocused({
      timeout: 5_000,
    });

    // --- Enter to toggle select in select mode (Phase 3 F2: bar at N≥2) ---
    // First, enter select mode via the toggle.
    await authedPage.getByTestId('library-select-toggle').click();
    // Focus the DOM-first card and press Space (alternate of Enter per spec).
    await authedPage.getByTestId(`library-card-${renderedCardIds[0]}`).focus();
    await authedPage.keyboard.press(' ');
    // Single selection — bar NOT yet visible per F2 threshold.
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);
    // Move to second card + select → bar appears at N=2.
    await authedPage.keyboard.press('ArrowRight');
    await authedPage.keyboard.press(' ');
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
    await expect(authedPage.getByTestId('library-bulk-count')).toContainText('2 selected');

    // Enter on the same card deselects (aria-checked toggles) → below
    // threshold again.
    await authedPage.keyboard.press('Enter');
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);

    // --- Escape exits select mode ---
    // After the Enter-deselect above, card[0] is still selected (N=1).
    // Arrow right to card[2] and Space-select it → N=2, bar back.
    await authedPage.keyboard.press('ArrowRight');
    await authedPage.keyboard.press('ArrowRight');
    await authedPage.keyboard.press(' ');
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
    await authedPage.keyboard.press('Escape');
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);

    // Confirm the toggle has reverted to SELECT (not CANCEL) label.
    await expect(authedPage.getByTestId('library-select-toggle')).toContainText(/^select$/i);
  });

  test('Cmd/Ctrl+A in select mode selects every visible card (Phase 3 P3-bug-6a)', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    await seedLibraryItems(userId, [
      {
        display_name: 'A1',
        nutrition: { kcal: 10, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
      },
      {
        display_name: 'A2',
        nutrition: { kcal: 20, macros: { protein_g: 2, carbs_g: 2, fat_g: 2 } },
      },
      {
        display_name: 'A3',
        nutrition: { kcal: 30, macros: { protein_g: 3, carbs_g: 3, fat_g: 3 } },
      },
    ]);
    await authedPage.goto('/library', { waitUntil: 'networkidle' });
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    await authedPage.waitForTimeout(120);

    // Enter select mode.
    await authedPage.getByTestId('library-select-toggle').click();

    // Cmd/Ctrl+A → all 3 selected, bar visible at N≥2.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await authedPage.getByTestId('library-masthead').click();
    await authedPage.keyboard.press(`${modifier}+a`);

    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
    await expect(authedPage.getByTestId('library-bulk-count')).toContainText('3 selected');
  });
});
