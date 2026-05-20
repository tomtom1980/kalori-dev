/**
 * @vitest-environment node
 *
 * Task D.6 (US-STAB-D6) AC2 / AC4 — DB-level duplicate-insert contract on
 * `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL
 *  AND normalized_name IS NOT NULL`.
 *
 * **Scope distinction:** the briefing §14 (Files FORBIDDEN to touch) explicitly
 * excludes `app/api/entries/save/route.ts` — the route patch that maps the
 * DB-level 23505 to a structured 409 belongs to followup
 * `F-LIB-DEDUP-DUPLICATE-INSERT` and is OUT OF SCOPE for D.6. This file
 * therefore asserts the DB CONTRACT directly via the admin client (NOT through
 * the route handler) — that contract is what migration 0020 ships.
 *
 * Pattern reference: `tests/integration/library-merge-tombstone-real-db.test.ts`
 * (real-DB integration test using `setupRlsHarness()` + `harness.admin`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('food_library_items dedup partial unique index (Task D.6, migration 0020) — real DB', () => {
  let harness: RlsHarness;

  beforeEach(async () => {
    harness = await setupRlsHarness();
  }, 60_000);

  afterEach(async () => {
    if (harness) await harness.teardown();
  }, 30_000);

  // AC2 — dedup-blocks-duplicate-active-insert
  it('AC2: duplicate active (user_id, normalized_name) insert fails with 23505 unique_violation', async () => {
    const userId = harness.userA.id;
    const normalized = 'd6 ac2 kale';

    const firstInsert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'AC2 Kale (first)',
        nutrition: { kcal: 35, macros: { protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 1 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(firstInsert.error, `first insert failed: ${firstInsert.error?.message}`).toBeNull();
    expect(firstInsert.data).not.toBeNull();

    // Second insert with same (user_id, normalized_name) and deleted_at IS NULL
    // — must be rejected by the partial unique index.
    const secondInsert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'AC2 Kale (duplicate)',
        nutrition: { kcal: 35, macros: { protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 1 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(secondInsert.data).toBeNull();
    expect(secondInsert.error).not.toBeNull();
    expect(
      secondInsert.error!.code,
      `expected pg error code 23505, got: ${JSON.stringify(secondInsert.error)}`,
    ).toBe('23505');
  }, 30_000);

  // AC4 — soft-deleted-does-not-block-reinsert
  it('AC4: soft-deleted row does NOT block re-insert of the same (user_id, normalized_name) as a new active row', async () => {
    const userId = harness.userA.id;
    const normalized = 'd6 ac4 eggs';

    // Insert + immediately soft-delete.
    const firstInsert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'AC4 Eggs (first)',
        nutrition: { kcal: 140, macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(firstInsert.error).toBeNull();
    expect(firstInsert.data).not.toBeNull();

    const tombstoned = await harness.admin
      .from('food_library_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', firstInsert.data!.id);
    expect(tombstoned.error).toBeNull();

    // Re-insert the same (user_id, normalized_name) as a NEW active row.
    // The partial unique index predicate is `WHERE deleted_at IS NULL` so the
    // soft-deleted row does NOT participate in the constraint.
    const reInsert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'AC4 Eggs (re-add)',
        nutrition: { kcal: 140, macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(reInsert.error, `re-insert failed: ${reInsert.error?.message}`).toBeNull();
    expect(reInsert.data).not.toBeNull();
  }, 30_000);

  // Companion guard — a duplicate insert under user B does NOT collide with
  // user A. (Single-user MVP today; verify the partial index keeps per-user
  // scoping intact when multi-user lands.)
  it('cross-user same-normalized_name insert is permitted (user_id is part of the key)', async () => {
    const normalized = 'd6 cross user oat';

    const insertA = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'Oat (user A)',
        nutrition: { kcal: 150, macros: { protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(insertA.error).toBeNull();

    const insertB = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userB.id,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: 'Oat (user B)',
        nutrition: { kcal: 150, macros: { protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(
      insertB.error,
      `user B insert blocked unexpectedly: ${insertB.error?.message}`,
    ).toBeNull();
  }, 30_000);
});
