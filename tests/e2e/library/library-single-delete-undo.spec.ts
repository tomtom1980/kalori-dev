/**
 * E2E: /library single-item delete + undo + tombstone sweep — §15.5.4.
 *
 * Task 4.1 Phase 3 fix (F2): BulkActionsBar materializes at N≥2 (not N≥1)
 * per design-lead §6 / reconciled §7.12. The single-item delete path is
 * therefore driven via the Phase 3 fix (P3-bug-6a) standalone Delete
 * keyboard shortcut — in select mode with exactly 1 selected, pressing
 * Delete opens the bulk-delete confirm dialog directly.
 *
 * A separate assertion covers the lazy sweep: after ≥5s without undo, the
 * tombstoned row is hard-deleted on the next page load.
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import { fetchLibraryRows, resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · single-item delete + undo', () => {
  test('select → bulk delete (N=1) → undo restores row; separate sweep path hard-deletes', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Alpha',
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 3 } },
      },
      {
        display_name: 'Bravo',
        nutrition: { kcal: 200, macros: { protein_g: 8, carbs_g: 20, fat_g: 6 } },
      },
      {
        display_name: 'Charlie',
        nutrition: { kcal: 300, macros: { protein_g: 12, carbs_g: 30, fat_g: 9 } },
      },
    ]);
    const victim = seeded[1]!; // "Bravo"

    await authedPage.goto('/library');

    // Enter select mode.
    await authedPage.getByTestId('library-select-toggle').click();
    // Click the target card to select it (in select mode, click toggles).
    await authedPage.getByTestId(`library-card-${victim.id}`).click();

    // Phase 3 fix F2: BulkActionsBar threshold is N≥2 → NOT visible
    // yet at N=1. Confirm the bar is absent and verify selection state
    // indirectly via the sr-only live region.
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toHaveCount(0);

    // Phase 3 fix P3-bug-6a: standalone Delete in select mode with a
    // single selection opens the bulk-delete confirm dialog directly.
    // Focus lives on the card after click; press Delete at the page
    // scope.
    await authedPage.keyboard.press('Delete');
    await expect(authedPage.getByTestId('library-bulk-delete-dialog')).toBeVisible();

    // Confirm (click the STRIKE button).
    await authedPage.getByTestId('library-bulk-delete-confirm').click();

    // Undo toast appears (authoritative observable after the mutation).
    // Phase 3 fix P3-bug-1: `router.refresh()` after successful mutation
    // re-fetches the RSC tree, so the deleted row also disappears from
    // the grid — not just the DB.
    await expect(authedPage.getByTestId('undo-toast')).toBeVisible();
    {
      const dbRows = await fetchLibraryRows(userId);
      const tombstoned = dbRows.find((r) => r.id === victim.id);
      expect(tombstoned).toBeDefined();
      expect(tombstoned!.deleted_at).not.toBeNull();
    }

    // Click UNDO within 5s → the row's deleted_at is cleared.
    // Wait for the actual undo POST to resolve before reading the DB —
    // a fixed timeout races the cross-region (Vercel iad1 ↔ Supabase
    // ap-southeast-1) write→read settle window.
    const undoResponse = authedPage.waitForResponse(
      (resp) =>
        resp.url().includes('/api/library/bulk-delete/undo') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );
    await authedPage.getByTestId('undo-action').click();
    await undoResponse;

    // Service-role readback: the row is back to active (deleted_at = NULL).
    const rows = await fetchLibraryRows(userId);
    const restored = rows.find((r) => r.id === victim.id);
    expect(restored).toBeDefined();
    expect(restored!.deleted_at).toBeNull();
  });

  test('separate sweep path: tombstone past 5s is hard-deleted on next fetch', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Sweep target',
        nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 2, fat_g: 3 } },
      },
      {
        display_name: 'Remain',
        nutrition: { kcal: 200, macros: { protein_g: 2, carbs_g: 4, fat_g: 6 } },
      },
    ]);
    const victim = seeded[0]!;

    await authedPage.goto('/library');

    // Enter select + select + confirm bulk delete, then DO NOT click undo.
    // Phase 3 fix: N=1 delete goes through standalone Delete keyboard
    // shortcut (bar threshold is N≥2).
    await authedPage.getByTestId('library-select-toggle').click();
    await authedPage.getByTestId(`library-card-${victim.id}`).click();
    await authedPage.keyboard.press('Delete');
    await authedPage.getByTestId('library-bulk-delete-confirm').click();
    await expect(authedPage.getByTestId('undo-toast')).toBeVisible();

    // Wait past the 5s grace window.
    await authedPage.waitForTimeout(6000);

    // Next page load runs the lazy sweep BEFORE the SELECT (lib/library/fetch.ts).
    await authedPage.goto('/library');

    // DB-level: the victim row should be gone.
    const rows = await fetchLibraryRows(userId);
    const survivor = rows.find((r) => r.id === victim.id);
    expect(survivor).toBeUndefined();
    // The "Remain" row still exists (active).
    const keeper = rows.find((r) => r.id === seeded[1]!.id);
    expect(keeper).toBeDefined();
    expect(keeper!.deleted_at).toBeNull();

    // UI readback: victim gone from DOM entirely (RSC re-renders without it),
    // keeper visible.
    await expect(authedPage.getByTestId(`library-card-${victim.id}`)).toHaveCount(0);
    await expect(authedPage.getByTestId(`library-card-${seeded[1]!.id}`)).toBeVisible();
  });
});
