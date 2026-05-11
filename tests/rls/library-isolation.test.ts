/**
 * @vitest-environment node
 *
 * Task A.1 (REV 2) AC3 — library_items_user_isolation.
 *
 * Two new RLS assertions complementing the 32-assertion `food-schema.test.ts`
 * baseline. Both exercise the actual `food_library_items` INSERT path that
 * `app/api/entries/save` writes through, then prove RLS scoping on the
 * downstream READ:
 *
 *   - User A inserts a row directly via the admin path (mirrors the
 *     server-side route's effective behavior — INSERT `user_id = userA.id`,
 *     `auth.uid() = userA.id` via her JWT-bearing client) → User B's
 *     `fetchLibraryPage`-equivalent SELECT MUST return empty for that row.
 *   - The same INSERT → User A's own SELECT MUST include the row (positive
 *     control — proves we're not just blocking everything).
 *
 * The pre-existing 4-assertion library coverage in `food-schema.test.ts`
 * (lines 229-272) is RETAINED and MUST stay GREEN. This file adds the
 * round-trip "INSERT under save_to_library, SELECT cross-user" pair the
 * briefing specifies for AC3.
 *
 * Skip-gate matches the rest of `tests/rls/` — when SUPABASE_TEST_* env
 * is absent, the suite is `describe.skip` so local `pnpm test` stays
 * green without a live DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('AC3: library_items_user_isolation (Task A.1)', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 60_000);

  afterAll(async () => {
    if (harness) await harness.teardown();
  }, 30_000);

  // AC3 (Task A.1) ----------------------------------------------------------
  //
  // Save-to-library inserts under userA's identity. UserB's read MUST see
  // an empty result via her own JWT-scoped client (RLS policy
  // `food_library_items_select_own` blocks cross-user SELECTs).
  it('AC3: User B does NOT see User A library row inserted via save_to_library path', async () => {
    // Insert under userA's identity (her JWT-bearing client). This mirrors
    // the effective behavior of `app/api/entries/save/route.ts` line 329-340
    // when called from an authenticated session: the server resolves
    // `userId = userA.id` from `auth.getUser()` and INSERT carries it. Using
    // userA.client here is the closest harness-level analogue without
    // standing up a Next.js dev server inside the test.
    const insertResult = await harness.userA.client
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'a1 isolation kale',
        display_name: 'Kale A1 isolation',
        nutrition: { kcal: 35, macros: { protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 1 } },
        created_from: 'text',
      })
      .select('id, display_name, normalized_name')
      .single();
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).not.toBeNull();
    const insertedId = insertResult.data!.id as string;

    // User B reads via her own RLS-enforcing client. The row MUST be
    // invisible — `food_library_items_select_own` policy filters by
    // `auth.uid() = user_id`.
    const readByB = await harness.userB.client
      .from('food_library_items')
      .select('id')
      .eq('id', insertedId);
    expect(readByB.error).toBeNull();
    expect(readByB.data).toEqual([]);
  });

  // AC3 round-trip positive control — the same row IS visible to User A.
  // Without this, "User B sees nothing" could trivially be satisfied by
  // a broken INSERT or a wrong-user_id row.
  it('AC3: User A DOES see her own library row inserted via save_to_library path', async () => {
    const insertResult = await harness.userA.client
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'a1 isolation eggs',
        display_name: 'Eggs A1 isolation',
        nutrition: { kcal: 140, macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(insertResult.error).toBeNull();
    const insertedId = insertResult.data!.id as string;

    // User A's own SELECT must include the row.
    const readByA = await harness.userA.client
      .from('food_library_items')
      .select('id, display_name')
      .eq('id', insertedId)
      .maybeSingle();
    expect(readByA.error).toBeNull();
    expect(readByA.data).not.toBeNull();
    expect(readByA.data!.display_name).toBe('Eggs A1 isolation');
  });
});
