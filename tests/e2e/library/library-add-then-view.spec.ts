/**
 * E2E: /library renders seeded items — Task 4.1 sub-step 4 §15.5.2.
 *
 * Brief contract: "(seed a library item via DB or API) → navigate to /library
 * → see the item".
 *
 * Uses the service-role seed helper to insert 3 library items under the
 * fixture-provisioned user's id (the app's own save-to-library path is owned
 * by the log flow — separately tested — so this spec exercises the read
 * surface without coupling to log-flow internals).
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · populated grid', () => {
  test('seeded library items render as cards with display_name + kcal', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Phở bò tái nạm',
        normalized_name: 'pho bo tai nam',
        nutrition: { kcal: 480, macros: { protein_g: 32, carbs_g: 60, fat_g: 10 } },
        log_count: 12,
        last_used_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Crème brûlée',
        normalized_name: 'creme brulee',
        nutrition: { kcal: 320, macros: { protein_g: 5, carbs_g: 28, fat_g: 22 } },
        log_count: 3,
        last_used_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: '2-egg omelet',
        normalized_name: '2 egg omelet',
        nutrition: { kcal: 220, macros: { protein_g: 18, carbs_g: 1, fat_g: 16 } },
        log_count: 8,
        last_used_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      },
    ]);

    await authedPage.goto('/library');
    await expect(authedPage).toHaveURL(/\/library(?:\?.*)?$/);

    // Grid renders, one card per seeded item, by testid.
    await expect(authedPage.getByTestId('library-grid')).toBeVisible();
    for (const item of seeded) {
      await expect(authedPage.getByTestId(`library-card-${item.id}`)).toBeVisible();
    }

    // At least one visible card shows its display_name + kcal text.
    const firstCard = authedPage.getByTestId(`library-card-${seeded[0]!.id}`);
    await expect(firstCard).toContainText('Phở bò tái nạm');
    await expect(firstCard).toContainText('480 kcal');

    // Letter-mark fallback renders when no thumbnail_url — verify for first.
    await expect(authedPage.getByTestId(`library-card-lettermark-${seeded[0]!.id}`)).toBeVisible();
  });
});
