/**
 * E2E: /library first-time empty state.
 *
 * Scope: the F-TEST-4 fixture provisions a brand-new user with zero library
 * items. The page now always renders the full LibraryClient — so the toolbar
 * AND the page-level "Add Item" button are visible even with zero items, and
 * the empty-state copy appears inline inside the grid area (via the grid's
 * `renderEmpty` callback). This replaces the old "skip the client island +
 * show a big CTA Link" surface — the page-level Add Item button is the
 * single entry point for adding items.
 *
 * Asserts:
 *   - URL settles on /library (no login redirect, no onboarding redirect).
 *   - Masthead + toolbar + Add Item button render even when items=0.
 *   - Empty-state region renders with the new "no library items yet"
 *     heading (no body, no CTA link).
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

test.describe('/library · first-time empty', () => {
  test('empty library still shows the toolbar + Add Item entry point', async ({ authedPage }) => {
    await authedPage.goto('/library');
    await expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/);

    // Masthead + page-level Add Item button + tools rail all render even
    // when the user has zero items — that's the whole point of unifying
    // the empty + populated layouts.
    await expect(authedPage.getByTestId('library-masthead')).toBeVisible();
    await expect(authedPage.getByTestId('library-add-button')).toBeVisible();
    await expect(authedPage.getByTestId('library-tools-rail')).toBeVisible();

    // Empty-state surface appears inline inside the grid area. Heading
    // copy is the simplified "no library items yet" line; the old
    // "Open the log flow" CTA link is gone.
    const empty = authedPage.getByTestId('library-empty-first-time');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('heading', { name: /no library items yet/i })).toBeVisible();
    await expect(authedPage.getByTestId('library-empty-cta')).toHaveCount(0);

    // No selection — the bulk-actions bar stays unmounted.
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);
  });
});
