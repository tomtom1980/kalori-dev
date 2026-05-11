/**
 * E2E: /library first-time empty state — Task 4.1 sub-step 4 §15.5.1.
 *
 * Scope: the F-TEST-4 fixture provisions a brand-new user with zero library
 * items. Navigating to /library therefore hits the first-time empty state
 * rendered by <LibraryEmptyState kind="first-time"> (see
 * app/(app)/library/page.tsx — when `items.length === 0` the RSC skips the
 * client island entirely).
 *
 * Asserts:
 *   - URL settles on /library (no login redirect, no onboarding redirect).
 *   - Empty-state region is visible with its testid.
 *   - Kicker + heading + body copy from `t.library.empty*` render.
 *   - CTA link with testid `library-empty-cta` points at `/log?tab=type`.
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

test.describe('/library · first-time empty', () => {
  test('empty library shows empty-state copy + CTA to log flow', async ({ authedPage }) => {
    await authedPage.goto('/library');
    await expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/);

    const empty = authedPage.getByTestId('library-empty-first-time');
    await expect(empty).toBeVisible();

    // Masthead renders above the empty state.
    await expect(authedPage.getByTestId('library-masthead')).toBeVisible();

    // Copy — the exact strings come from lib/i18n/en.ts
    await expect(empty.getByRole('heading', { name: /no titles yet filed/i })).toBeVisible();
    await expect(empty).toContainText(/log a meal by text or photo/i);

    // CTA is a Next <Link> to /log?tab=type (see LibraryEmptyState.tsx).
    const cta = authedPage.getByTestId('library-empty-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/log?tab=type');

    // Grid + bulk-actions bar + tools rail MUST NOT render when items=0.
    await expect(authedPage.getByTestId('library-grid')).toHaveCount(0);
    await expect(authedPage.getByTestId('library-tools-rail')).toHaveCount(0);
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);
  });
});
