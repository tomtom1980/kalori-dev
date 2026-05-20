/**
 * E2E: /library merge two duplicates — Task 4.1 sub-step 4 §15.5.6.
 *
 * Seed 2 library rows that the user chooses to merge + 1 food_entry row
 * pointing at the LOSER. Flow:
 *   - Navigate /library
 *   - Enter select mode, check both cards
 *   - BulkActionsBar shows N=2, MERGE enabled
 *   - Click MERGE → MergeDuplicatesDialog opens → submit → confirm
 *   - RPC repoints food_entries.library_item_id from loser → winner, hard-
 *     deletes loser row
 *   - UI updates: loser card gone, winner card remains
 *   - DB assertions: food_entries.library_item_id = winnerId; loser row
 *     absent; winner row active
 */
import { expect } from '@playwright/test';

import { test } from '../fixtures/auth';

import {
  fetchEntryRows,
  fetchLibraryRows,
  resolveTestUserId,
  seedFoodEntries,
  seedLibraryItems,
} from './_seed';

test.describe('/library · merge duplicates', () => {
  // Migration 0020 enforces one active row per (user_id, normalized_name), so
  // this legacy UI path can no longer create the duplicate pair it requires.
  test.skip('merge two items → FK repoint in entries + loser deleted', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Cappuccino',
        normalized_name: 'cappuccino',
        nutrition: { kcal: 110, macros: { protein_g: 6, carbs_g: 10, fat_g: 4 } },
        log_count: 10,
      },
      {
        display_name: 'Capuccino',
        normalized_name: 'capuccino',
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 9, fat_g: 3 } },
        log_count: 2,
      },
    ]);
    // Expected winner: idx 0 (higher log_count).
    const winner = seeded[0]!;
    const loser = seeded[1]!;

    // Seed one food_entry pointing at the LOSER. Post-merge it must repoint.
    const entries = await seedFoodEntries(userId, [
      {
        library_item_id: loser.id,
        display_name: loser.display_name,
        logged_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 9, fat_g: 3 } },
      },
    ]);
    expect(entries.length).toBe(1);

    await authedPage.goto('/library');
    // Enter select mode.
    await authedPage.getByTestId('library-select-toggle').click();
    // Click both cards.
    await authedPage.getByTestId(`library-card-${winner.id}`).click();
    await authedPage.getByTestId(`library-card-${loser.id}`).click();

    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
    await expect(authedPage.getByTestId('library-bulk-count')).toContainText('2 selected');

    // Open merge dialog.
    await authedPage.getByTestId('library-merge-button').click();
    await expect(authedPage.getByTestId('library-merge-dialog')).toBeVisible();

    // Submit (pre-commit confirm opens).
    await authedPage.getByTestId('library-merge-submit').click();
    await expect(authedPage.getByTestId('library-merge-confirm-dialog')).toBeVisible();

    // Proceed.
    await authedPage.getByTestId('library-merge-proceed').click();

    // Dialog closes after the merge RPC resolves.
    await expect(authedPage.getByTestId('library-merge-confirm-dialog')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(authedPage.getByTestId('library-merge-dialog')).toHaveCount(0);

    // Winner still visible.
    await expect(authedPage.getByTestId(`library-card-${winner.id}`)).toBeVisible();

    // DB readback (authoritative — same caveat as delete specs: optimistic
    // UI flickers but the server commits exactly once):
    const rows = await fetchLibraryRows(userId);
    // Loser is HARD-deleted by the merge RPC — completely absent.
    expect(rows.find((r) => r.id === loser.id)).toBeUndefined();
    // Winner remains active.
    const winRow = rows.find((r) => r.id === winner.id);
    expect(winRow).toBeDefined();
    expect(winRow!.deleted_at).toBeNull();

    // food_entries row now points at winner.
    const entryRows = await fetchEntryRows(userId);
    expect(entryRows.length).toBe(1);
    expect(entryRows[0]!.library_item_id).toBe(winner.id);
  });
});
