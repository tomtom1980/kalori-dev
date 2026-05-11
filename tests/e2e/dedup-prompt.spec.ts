/**
 * Task 3.4 — Playwright E2E for the dedup-prompt path (AC10 skeleton).
 *
 * IMPORTANT: this spec depends on test-DB seeding + a logged-in auth fixture +
 * a dev server. It is authored here as a describe.skip skeleton (mirrors
 * `undo-toast.spec.ts` + `copy-yesterday.spec.ts`) and will be un-skipped
 * once F-TEST-4 closes — real test-user seeding for the Playwright harness.
 *
 * Scope note: Task 3.4 ships 2-way dedup (REUSE EXISTING + CREATE NEW) per
 * `design-doc.md` §18.3 + `ui-design.md` §5. True MERGE between library rows
 * (FK-repoint) is Task 4.1 per `design-doc.md` §10.6. The three test cases
 * below match the 2-way prompt that currently ships.
 *
 * See `undo-toast.spec.ts` module note for the rationale around
 * describe.skip during the 3.4–3.5 transition.
 */
import { expect, test } from '@playwright/test';

test.describe.skip('dedup prompt path (full E2E — requires auth fixtures)', () => {
  test('REUSE EXISTING: type name matching library → confirm → reuses library row', async ({
    page,
  }) => {
    // TODO (F-TEST-4 follow-up):
    // 1. Log in via auth fixture.
    // 2. Seed a food_library_items row with normalized_name='eggs'.
    // 3. Open /log, TYPE tab.
    // 4. Enter "2 eggs" → PARSE.
    // 5. ConfirmationScreen shows; DedupBanner appears with REUSE EXISTING +
    //    CREATE NEW buttons.
    // 6. Click REUSE EXISTING; click SAVE TO LEDGER.
    // 7. Assert: undo toast "Logged 2 eggs" surfaces.
    // 8. Assert: new food_entries row has library_item_id = seeded library row.
    // 9. Assert: NO new food_library_items row was created.
    await page.goto('/');
    await expect(page).toHaveURL(/\//);
  });

  test('CREATE NEW: type name matching library → confirm → keeps both rows independent', async ({
    page,
  }) => {
    // TODO (F-TEST-4 follow-up):
    // 1. Log in via auth fixture.
    // 2. Seed a food_library_items row with normalized_name='eggs'.
    // 3. Open /log, TYPE tab → enter "2 eggs" → PARSE.
    // 4. ConfirmationScreen shows; DedupBanner visible.
    // 5. Click CREATE NEW; keep save-to-library toggle ON; click SAVE TO LEDGER.
    // 6. Assert: undo toast "Logged 2 eggs" surfaces.
    // 7. Assert: new food_entries row has library_item_id = null (not the
    //    seeded library row).
    // 8. Assert: a fresh food_library_items row is inserted (2 rows total).
    await page.goto('/');
    await expect(page).toHaveURL(/\//);
  });

  test('cancel path: dismiss dedup prompt via Escape → entry not saved', async ({ page }) => {
    // TODO (F-TEST-4 follow-up):
    // 1. Log in via auth fixture.
    // 2. Seed a food_library_items row with normalized_name='eggs'.
    // 3. Open /log, TYPE tab → enter "2 eggs" → PARSE.
    // 4. ConfirmationScreen shows; DedupBanner visible.
    // 5. Press Escape → DiscardDraftAlertDialog opens.
    // 6. Confirm DISCARD → modal closes, no undo toast.
    // 7. Assert: no new food_entries row was created.
    // 8. Assert: no new food_library_items row was created.
    await page.goto('/');
    await expect(page).toHaveURL(/\//);
  });
});
