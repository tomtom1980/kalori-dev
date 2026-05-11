/**
 * E2E: /library search + filter + sort + sessionStorage persistence.
 * Task 4.1 sub-step 4 §15.5.3.
 *
 * Seed set: 6 items with intentionally varied shapes so every filter + sort
 * option has a visible effect. Items chosen so search narrows to a proper
 * subset and the sort reorders tangibly.
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · search / filter / sort', () => {
  test('search narrows grid, filter and sort change ordering, sessionStorage persists', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const now = Date.now();
    // Task 4.1 Phase 3 fix (P3-bug-2): `next.config.ts` now whitelists
    // Supabase Storage signed + public `food-thumbnails` URLs, so non-null
    // `thumbnail_url` no longer crashes `<Image>`. This test still seeds
    // rows with thumbnail_url=null for simplicity (the filter test
    // exercises THIS WEEK based on last_used_at, not photo status); a
    // dedicated thumbnail-render spec covers the image path.
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Apple (red)',
        normalized_name: 'apple red',
        nutrition: { kcal: 95, macros: { protein_g: 0, carbs_g: 25, fat_g: 0 } },
        log_count: 10,
        last_used_at: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Apple (green)',
        normalized_name: 'apple green',
        nutrition: { kcal: 80, macros: { protein_g: 0, carbs_g: 21, fat_g: 0 } },
        log_count: 2,
        last_used_at: new Date(now - 2 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Banana',
        normalized_name: 'banana',
        nutrition: { kcal: 105, macros: { protein_g: 1, carbs_g: 27, fat_g: 0 } },
        log_count: 7,
        last_used_at: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Toast',
        normalized_name: 'toast',
        nutrition: { kcal: 200, macros: { protein_g: 6, carbs_g: 30, fat_g: 4 } },
        log_count: 1,
        last_used_at: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Zebra cake',
        normalized_name: 'zebra cake',
        nutrition: { kcal: 450, macros: { protein_g: 5, carbs_g: 60, fat_g: 20 } },
        log_count: 4,
        last_used_at: new Date(now - 4 * 24 * 3600 * 1000).toISOString(),
      },
      {
        display_name: 'Salad',
        normalized_name: 'salad',
        nutrition: { kcal: 150, macros: { protein_g: 4, carbs_g: 10, fat_g: 10 } },
        log_count: 5,
        last_used_at: new Date(now - 60 * 24 * 3600 * 1000).toISOString(),
      },
    ]);

    await authedPage.goto('/library');
    const grid = authedPage.getByTestId('library-grid');
    await expect(grid).toBeVisible();

    // Baseline: 6 non-pad cards visible.
    const cards = authedPage.locator('[data-testid^="library-card-"]').filter({
      hasNot: authedPage.locator('[data-testid^="library-card-thumb-"]'),
    });
    // Cards are nested under <li>; counting li > button with data-testid regex
    // is more robust than over-filtering.
    for (const it of seeded) {
      await expect(authedPage.getByTestId(`library-card-${it.id}`)).toBeVisible();
    }
    void cards; // (we use individual testid asserts instead of count filter)

    // --- Search narrows ---
    const searchInput = authedPage.getByTestId('library-search-input');
    await searchInput.fill('apple');
    // Deferred value → grid re-derives quickly; wait for hiding.
    await expect(authedPage.getByTestId(`library-card-${seeded[0]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[1]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[2]!.id}`)).toHaveCount(0);
    await expect(authedPage.getByTestId(`library-card-${seeded[3]!.id}`)).toHaveCount(0);

    // Clear search — all back.
    await searchInput.fill('');
    for (const it of seeded) {
      await expect(authedPage.getByTestId(`library-card-${it.id}`)).toBeVisible();
    }

    // --- Filter: LOGGED THIS WEEK narrows by last_used_at within 7 days ---
    // Items 0-4 have last_used_at within 1-4 days (all this week); item 5
    // (Salad) is 60 days back → excluded. Item 3 (Toast) is 30 days back →
    // also excluded.
    await authedPage.getByTestId('library-filter-trigger').click();
    await authedPage.getByTestId('library-filter-option-this-week').click();
    await expect(authedPage.getByTestId(`library-card-${seeded[0]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[1]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[2]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[4]!.id}`)).toBeVisible();
    await expect(authedPage.getByTestId(`library-card-${seeded[3]!.id}`)).toHaveCount(0);
    await expect(authedPage.getByTestId(`library-card-${seeded[5]!.id}`)).toHaveCount(0);

    // --- Filter: ALL back ---
    await authedPage.getByTestId('library-filter-trigger').click();
    await authedPage.getByTestId('library-filter-option-all').click();
    for (const it of seeded) {
      await expect(authedPage.getByTestId(`library-card-${it.id}`)).toBeVisible();
    }

    // --- Sort: NAME A-Z ---
    await authedPage.getByTestId('library-sort-trigger').click();
    await authedPage.getByTestId('library-sort-option-name-asc').click();
    // After sort A-Z the first card in DOM order should be "Apple (green)"
    // (alphabetically before "Apple (red)" → "Banana" → "Salad" → "Toast" →
    // "Zebra cake"). The grid's DOM order follows the items prop order.
    const firstCardHandle = grid.locator('[data-testid^="library-card-"]').first();
    await expect(firstCardHandle).toContainText('Apple (green)');

    // --- sessionStorage persistence: reload and confirm selections sticky ---
    const filterBefore = await authedPage.evaluate(() =>
      window.sessionStorage.getItem('library:filter'),
    );
    const sortBefore = await authedPage.evaluate(() =>
      window.sessionStorage.getItem('library:sort'),
    );
    expect(filterBefore).toBe('all');
    expect(sortBefore).toBe('name-asc');

    await authedPage.reload();
    // Post-reload: sort trigger reflects persisted value.
    const sortTrigger = authedPage.getByTestId('library-sort-trigger');
    await expect(sortTrigger).toContainText(/name a-z/i);
    const firstAfterReload = authedPage
      .getByTestId('library-grid')
      .locator('[data-testid^="library-card-"]')
      .first();
    await expect(firstAfterReload).toContainText('Apple (green)');
  });
});
