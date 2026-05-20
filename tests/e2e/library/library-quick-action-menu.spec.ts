/**
 * E2E: /library quick-action kebab menu — bugfix-tomi batch
 * 2026-05-16-library-overhaul Bug 3.
 *
 * Verifies the per-card kebab menu added in Wave 3:
 *   - Trigger button is rendered on every card with data-testid
 *     `library-card-menu-trigger-${itemId}`
 *   - Click trigger -> menu opens with Edit + Delete options
 *   - Click on the trigger does NOT activate the card (stopPropagation)
 *   - Delete option opens the bulk-delete confirm dialog with N=1
 *   - Edit option navigates to /library/[id]?mode=edit
 *
 * Why E2E: client-side stopPropagation behavior is covered by unit tests
 * but the combination of click-on-trigger + route mode wiring crosses the
 * client/router boundary; route-level E2E is the right place to assert
 * the navigation contract.
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · quick-action menu (Bug 3)', () => {
  test('kebab trigger opens menu without activating the card', async ({ authedPage, context }) => {
    const userId = await resolveTestUserId(context);
    const [first, second] = await seedLibraryItems(userId, [
      {
        display_name: 'Quick Menu Probe One',
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 3 } },
        recipe_eligibility: 'eligible',
      },
      {
        display_name: 'Quick Menu Probe Two',
        nutrition: { kcal: 200, macros: { protein_g: 8, carbs_g: 20, fat_g: 6 } },
        recipe_eligibility: 'ineligible',
      },
    ]);

    await authedPage.goto('/library');
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();

    // The trigger button is rendered on the card.
    const trigger = authedPage.getByTestId(`library-card-menu-trigger-${first!.id}`);
    await expect(trigger).toBeVisible();

    // Click trigger -> menu visible, with Edit + Delete options.
    await trigger.click();
    const menu = authedPage.getByTestId(`library-card-menu-${first!.id}`);
    await expect(menu).toBeVisible();
    await expect(
      authedPage.getByTestId(`library-card-menu-create-recipe-${first!.id}`),
    ).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-menu-edit-${first!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-menu-delete-${first!.id}`)).toBeVisible();

    // The card must NOT have navigated to /library/[id] (stopPropagation).
    await expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/);

    // Click outside to close menu (Escape works too).
    await authedPage.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Delete option from a second card opens the bulk-delete confirm with N=1.
    await authedPage.getByTestId(`library-card-menu-trigger-${second!.id}`).click();
    await expect(
      authedPage.getByTestId(`library-card-menu-create-recipe-${second!.id}`),
    ).toHaveCount(0);
    await authedPage.getByTestId(`library-card-menu-delete-${second!.id}`).click();
    const dialog = authedPage.getByTestId('library-bulk-delete-dialog');
    await expect(dialog).toBeVisible();
    // F7 fix (2026-05-16) — N=1 uses the singular copy
    // `bulkDeleteTitleSingular = 'Strike this title from the record?'`,
    // NOT the plural `Strike {N} titles...` with N=1 substituted. The
    // singular variant landed in library-overhaul commit b362c90 alongside
    // the kebab quick-action menu surface this spec exercises. Anchor on
    // the kicker + singular-title phrasing.
    await expect(dialog).toContainText(/strike this title/i);

    // Cancel the dialog; no row tombstoned.
    await authedPage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('Edit option navigates to /library/[id]?mode=edit', async ({ authedPage, context }) => {
    const userId = await resolveTestUserId(context);
    const [item] = await seedLibraryItems(userId, [
      {
        display_name: 'Edit Mode Nav Probe',
        nutrition: { kcal: 250, macros: { protein_g: 10, carbs_g: 18, fat_g: 9 } },
      },
    ]);

    await authedPage.goto('/library');
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();

    await authedPage.getByTestId(`library-card-menu-trigger-${item!.id}`).click();
    await authedPage.getByTestId(`library-card-menu-edit-${item!.id}`).click();

    // URL settles on the route-mode detail page with mode=edit query.
    await expect(authedPage).toHaveURL(new RegExp(`/library/${item!.id}\\?(?:.*&)?mode=edit`));
  });
});
