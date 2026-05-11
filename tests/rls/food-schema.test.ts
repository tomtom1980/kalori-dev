/**
 * @vitest-environment node
 *
 * I1 — food schema RLS integration test (Task 3.1 AC; briefing §7).
 *
 * Coverage:
 *   - 5 user-owned tables (food_entries, food_library_items, weight_log,
 *     water_log, weekly_reviews) × 4 verbs each = 20 assertions
 *   - 2 service-role-only tables (ai_response_cache, ai_call_log) × 4 verbs
 *     each = 8 assertions (all blocked because no user-facing policy exists,
 *     Postgres default-deny)
 *
 * TOTAL: 28 RLS assertions in ONE direction (User B attempts on User A's
 * rows for the user-owned tables; both A and B blocked on service-role-only).
 * Phase Testing Sweep (Task 3.7) re-runs full suite as regression — both-
 * directions coverage accumulates across the per-task specs (testing-strategy
 * §2.4 reconciliation note: 28 here + 14 from profiles.test.ts + others).
 *
 * Naming note: file uses `.test.ts` (not `.spec.ts` per briefing) to match the
 * vitest.config.ts include glob (tests/rls/**\/*.test.ts). The briefing's
 * `.spec.ts` mention is internally inconsistent with the rest of its own File
 * table (which uses `.test.ts` for client-id-idempotency). Decision logged in
 * `Planning/.tmp/task-3.1-output.md` Briefing Gaps.
 *
 * Setup pattern (briefing §7):
 *   - Per-suite `beforeAll`: `setupRlsHarness()` → 2 fresh users with JWTs
 *   - Seed User A's baseline rows via the admin client (bypasses RLS) for
 *     each of the 5 user-owned tables. service-role-only tables get one
 *     admin-side row each so SELECT can prove the row exists yet is invisible
 *     to authenticated users.
 *   - `afterAll`: harness.teardown() — cascade via `on delete cascade` sweeps
 *     all rows on user delete; no explicit per-table cleanup needed.
 *
 * Local skip gate matches `tests/rls/profiles.test.ts`: when env absent, suite
 * is `describe.skip` so `pnpm test` stays green locally without live DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

interface SeededRows {
  food_entries: string;
  food_library_items: string;
  weight_log: string;
  water_log: string;
  weekly_reviews: string;
}

maybe('I1: food schema RLS — 4 verbs × 7 tables (28 assertions)', () => {
  let harness: RlsHarness;
  let rowIds: SeededRows;

  beforeAll(async () => {
    harness = await setupRlsHarness();

    // Seed User A's baseline rows via admin (bypasses RLS).
    // Each insert returns the new row id so cross-user UPDATE/DELETE attempts
    // have a concrete target.
    const cid = () => crypto.randomUUID();

    // food_library_items (no FK deps; seed FIRST so food_entries can FK to it).
    const { data: libRow, error: libErr } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        normalized_name: 'rls test item',
        display_name: 'RLS Test Item',
        nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 5, fat_g: 2 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    if (libErr) throw new Error(`seed food_library_items: ${libErr.message}`);

    // food_entries (FK to food_library_items via library_item_id).
    const { data: entryRow, error: entryErr } = await harness.admin
      .from('food_entries')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        meal_category: 'breakfast',
        source: 'text',
        items: [{ name: 'test', portion: 1, unit: 'serving', kcal: 100 }],
        logged_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (entryErr) throw new Error(`seed food_entries: ${entryErr.message}`);

    // weight_log
    const { data: weightRow, error: weightErr } = await harness.admin
      .from('weight_log')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        date: new Date().toISOString().slice(0, 10),
        weight_kg: 70,
      })
      .select('id')
      .single();
    if (weightErr) throw new Error(`seed weight_log: ${weightErr.message}`);

    // water_log
    const { data: waterRow, error: waterErr } = await harness.admin
      .from('water_log')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        date: new Date().toISOString().slice(0, 10),
        count: 4,
        unit: 'glass',
      })
      .select('id')
      .single();
    if (waterErr) throw new Error(`seed water_log: ${waterErr.message}`);

    // weekly_reviews
    const monday = new Date();
    monday.setDate(monday.getDate() - monday.getDay() + 1); // approx Monday
    const expires = new Date(monday);
    expires.setDate(expires.getDate() + 7);
    const { data: weeklyRow, error: weeklyErr } = await harness.admin
      .from('weekly_reviews')
      .insert({
        user_id: harness.userA.id,
        week_start_on: monday.toISOString().slice(0, 10),
        insights: { body_markdown: 'rls test review', summary: 'ok', sparse_data: false },
        expires_at: expires.toISOString(),
      })
      .select('id')
      .single();
    if (weeklyErr) throw new Error(`seed weekly_reviews: ${weeklyErr.message}`);

    // Service-role-only tables: seed one row each so SELECT-blocked assertions
    // prove the row EXISTS and is invisible (not a "no rows in table" pass).
    const { error: aiCacheErr } = await harness.admin.from('ai_response_cache').insert({
      input_hash: `rls-test-${cid()}`,
      call_type: 'text-parse',
      user_id: harness.userA.id,
      parsed_payload: { stub: true },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    if (aiCacheErr) throw new Error(`seed ai_response_cache: ${aiCacheErr.message}`);

    const { error: aiLogErr } = await harness.admin.from('ai_call_log').insert({
      user_id: harness.userA.id,
      call_type: 'text-parse',
      input_hash: `rls-test-${cid()}`,
      tokens: 0,
      cost_estimate: 0,
      latency_ms: 1,
      cached_flag: true,
    });
    if (aiLogErr) throw new Error(`seed ai_call_log: ${aiLogErr.message}`);

    rowIds = {
      food_entries: entryRow!.id as string,
      food_library_items: libRow!.id as string,
      weight_log: weightRow!.id as string,
      water_log: waterRow!.id as string,
      weekly_reviews: weeklyRow!.id as string,
    };
  }, 60_000);

  afterAll(async () => {
    await harness?.teardown();
  }, 30_000);

  // --- 5 user-owned tables × 4 verbs = 20 assertions -----------------------
  //
  // For each user-owned table: User B attempts each of SELECT/INSERT/UPDATE/
  // DELETE on User A's row.
  //   - SELECT blocked: empty array, no error
  //   - INSERT (mismatched user_id) blocked by `with check`: error returned
  //   - UPDATE on other user's row: empty array, no error
  //   - DELETE on other user's row: empty array, no error

  // food_entries
  it('food_entries SELECT-B-on-A: blocked (empty array)', async () => {
    const { data, error } = await harness.userB.client
      .from('food_entries')
      .select('id')
      .eq('id', rowIds.food_entries);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('food_entries INSERT-B-as-A: blocked by with-check', async () => {
    const { data, error } = await harness.userB.client.from('food_entries').insert({
      user_id: harness.userA.id, // mismatched: B authenticated, A in row
      client_id: crypto.randomUUID(),
      meal_category: 'lunch',
      source: 'text',
      items: [{ name: 'attack', portion: 1, unit: 'serving', kcal: 100 }],
      logged_at: new Date().toISOString(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('food_entries UPDATE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('food_entries')
      .update({ meal_category: 'dinner' })
      .eq('id', rowIds.food_entries)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('food_entries DELETE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('food_entries')
      .delete()
      .eq('id', rowIds.food_entries)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // food_library_items
  it('food_library_items SELECT-B-on-A: blocked (empty array)', async () => {
    const { data, error } = await harness.userB.client
      .from('food_library_items')
      .select('id')
      .eq('id', rowIds.food_library_items);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('food_library_items INSERT-B-as-A: blocked by with-check', async () => {
    const { data, error } = await harness.userB.client.from('food_library_items').insert({
      user_id: harness.userA.id,
      client_id: crypto.randomUUID(),
      normalized_name: 'attack',
      display_name: 'Attack',
      nutrition: { kcal: 100, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
      created_from: 'text',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('food_library_items UPDATE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('food_library_items')
      .update({ display_name: 'Hacked' })
      .eq('id', rowIds.food_library_items)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('food_library_items DELETE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('food_library_items')
      .delete()
      .eq('id', rowIds.food_library_items)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // weight_log
  it('weight_log SELECT-B-on-A: blocked (empty array)', async () => {
    const { data, error } = await harness.userB.client
      .from('weight_log')
      .select('id')
      .eq('id', rowIds.weight_log);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('weight_log INSERT-B-as-A: blocked by with-check', async () => {
    const { data, error } = await harness.userB.client.from('weight_log').insert({
      user_id: harness.userA.id,
      client_id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      weight_kg: 75,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('weight_log UPDATE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('weight_log')
      .update({ weight_kg: 99 })
      .eq('id', rowIds.weight_log)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('weight_log DELETE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('weight_log')
      .delete()
      .eq('id', rowIds.weight_log)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // water_log
  it('water_log SELECT-B-on-A: blocked (empty array)', async () => {
    const { data, error } = await harness.userB.client
      .from('water_log')
      .select('id')
      .eq('id', rowIds.water_log);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('water_log INSERT-B-as-A: blocked by with-check', async () => {
    const { data, error } = await harness.userB.client.from('water_log').insert({
      user_id: harness.userA.id,
      client_id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      count: 1,
      unit: 'glass',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('water_log UPDATE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('water_log')
      .update({ count: 99 })
      .eq('id', rowIds.water_log)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('water_log DELETE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('water_log')
      .delete()
      .eq('id', rowIds.water_log)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // weekly_reviews
  it('weekly_reviews SELECT-B-on-A: blocked (empty array)', async () => {
    const { data, error } = await harness.userB.client
      .from('weekly_reviews')
      .select('id')
      .eq('id', rowIds.weekly_reviews);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('weekly_reviews INSERT-B-as-A: blocked by with-check', async () => {
    const { data, error } = await harness.userB.client.from('weekly_reviews').insert({
      user_id: harness.userA.id,
      week_start_on: new Date().toISOString().slice(0, 10),
      insights: { body_markdown: 'attack' },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('weekly_reviews UPDATE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('weekly_reviews')
      .update({ insights: { body_markdown: 'hacked' } })
      .eq('id', rowIds.weekly_reviews)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('weekly_reviews DELETE-B-on-A: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('weekly_reviews')
      .delete()
      .eq('id', rowIds.weekly_reviews)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // --- 2 service-role-only tables × 4 verbs = 8 assertions ----------------
  //
  // ai_response_cache + ai_call_log have RLS enabled but ZERO user-facing
  // policies. Postgres default-deny means any authenticated user (A or B) is
  // blocked across all 4 verbs.
  //
  // We test User B (any authenticated user other than the row's user_id) for
  // SELECT/UPDATE/DELETE — these return empty arrays under Postgres
  // default-deny + REST. INSERT is rejected with an explicit error (no policy
  // satisfies the with-check).

  it('ai_response_cache SELECT-as-user: blocked (no policy)', async () => {
    const { data, error } = await harness.userB.client
      .from('ai_response_cache')
      .select('input_hash');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('ai_response_cache INSERT-as-user: blocked (no policy)', async () => {
    const { data, error } = await harness.userB.client.from('ai_response_cache').insert({
      input_hash: `rls-attack-${crypto.randomUUID()}`,
      call_type: 'text-parse',
      user_id: harness.userB.id,
      parsed_payload: { attack: true },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('ai_response_cache UPDATE-as-user: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('ai_response_cache')
      .update({ parsed_payload: { hacked: true } })
      .neq('input_hash', '')
      .select('input_hash');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('ai_response_cache DELETE-as-user: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('ai_response_cache')
      .delete()
      .neq('input_hash', '')
      .select('input_hash');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('ai_call_log SELECT-as-user: blocked (no policy)', async () => {
    const { data, error } = await harness.userB.client.from('ai_call_log').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('ai_call_log INSERT-as-user: blocked (no policy)', async () => {
    const { data, error } = await harness.userB.client.from('ai_call_log').insert({
      user_id: harness.userB.id,
      call_type: 'text-parse',
      input_hash: `attack-${crypto.randomUUID()}`,
      tokens: 0,
      cost_estimate: 0,
      latency_ms: 1,
      cached_flag: true,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('ai_call_log UPDATE-as-user: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('ai_call_log')
      .update({ tokens: 999 })
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('ai_call_log DELETE-as-user: zero rows affected', async () => {
    const { data, error } = await harness.userB.client
      .from('ai_call_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // --- Codex R1 B1: service-role positive-path assertions ----------------
  //
  // The negative-path assertions above prove RLS hides ai_response_cache /
  // ai_call_log rows from authenticated users. They do NOT prove the service-
  // role client bypasses RLS for SELECT/UPDATE/DELETE — which is the exact
  // contract Phase 3.2 (`lib/ai/cache.ts`, `lib/ai/cost-log.ts`) depends on.
  // If service-role bypass were silently broken, Task 3.2 would discover it
  // by failing in production. Pin the round-trip here.
  //
  // Uses `harness.admin` (service-role client built via `getAdminSupabase()`).
  // We run a fresh INSERT inside each test so prior tests can pass/fail
  // independently and no test depends on `beforeAll`-seeded row positions.

  it('ai_response_cache (service-role): INSERT + SELECT + UPDATE + DELETE round-trip succeeds', async () => {
    const inputHash = `r1-b1-cache-${crypto.randomUUID()}`;

    // INSERT
    const { error: insertErr } = await harness.admin.from('ai_response_cache').insert({
      input_hash: inputHash,
      call_type: 'text-parse',
      user_id: harness.userA.id,
      parsed_payload: { stub: 'r1-b1', v: 1 },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(insertErr).toBeNull();

    // SELECT
    const { data: selectData, error: selectErr } = await harness.admin
      .from('ai_response_cache')
      .select('input_hash, parsed_payload')
      .eq('input_hash', inputHash);
    expect(selectErr).toBeNull();
    expect(selectData).toHaveLength(1);
    expect(selectData?.[0]?.parsed_payload).toEqual({ stub: 'r1-b1', v: 1 });

    // UPDATE
    const { data: updateData, error: updateErr } = await harness.admin
      .from('ai_response_cache')
      .update({ parsed_payload: { stub: 'r1-b1', v: 2 } })
      .eq('input_hash', inputHash)
      .select('input_hash, parsed_payload');
    expect(updateErr).toBeNull();
    expect(updateData).toHaveLength(1);
    expect(updateData?.[0]?.parsed_payload).toEqual({ stub: 'r1-b1', v: 2 });

    // DELETE
    const { data: deleteData, error: deleteErr } = await harness.admin
      .from('ai_response_cache')
      .delete()
      .eq('input_hash', inputHash)
      .select('input_hash');
    expect(deleteErr).toBeNull();
    expect(deleteData).toHaveLength(1);
  });

  it('ai_call_log (service-role): INSERT + SELECT + UPDATE + DELETE round-trip succeeds', async () => {
    const inputHash = `r1-b1-log-${crypto.randomUUID()}`;

    // INSERT
    const { data: insertData, error: insertErr } = await harness.admin
      .from('ai_call_log')
      .insert({
        user_id: harness.userA.id,
        call_type: 'text-parse',
        input_hash: inputHash,
        tokens: 100,
        cost_estimate: 0.000123,
        latency_ms: 42,
        cached_flag: false,
      })
      .select('id')
      .single();
    expect(insertErr).toBeNull();
    const insertedId = insertData?.id as string;
    expect(insertedId).toBeTruthy();

    // SELECT
    const { data: selectData, error: selectErr } = await harness.admin
      .from('ai_call_log')
      .select('id, tokens')
      .eq('id', insertedId);
    expect(selectErr).toBeNull();
    expect(selectData).toHaveLength(1);
    expect(selectData?.[0]?.tokens).toBe(100);

    // UPDATE
    const { data: updateData, error: updateErr } = await harness.admin
      .from('ai_call_log')
      .update({ tokens: 999 })
      .eq('id', insertedId)
      .select('id, tokens');
    expect(updateErr).toBeNull();
    expect(updateData).toHaveLength(1);
    expect(updateData?.[0]?.tokens).toBe(999);

    // DELETE
    const { data: deleteData, error: deleteErr } = await harness.admin
      .from('ai_call_log')
      .delete()
      .eq('id', insertedId)
      .select('id');
    expect(deleteErr).toBeNull();
    expect(deleteData).toHaveLength(1);
  });

  // --- Codex R1 B2: food_entries.library_item_id SET NULL survival --------
  //
  // Briefing §6.C invariant: entry history must survive library pruning.
  // Architecture.md §6 ships `food_entries.library_item_id REFERENCES
  // food_library_items(id) ON DELETE SET NULL` (NOT cascade). The migration
  // verification SQL §12 step 6 already proves the FK shape in the catalog;
  // this assertion proves the runtime semantics.

  it('food_entries.library_item_id ON DELETE SET NULL: entry survives library item deletion', async () => {
    const cid = () => crypto.randomUUID();

    // Seed library item via admin (RLS-safe regardless of test order).
    const { data: libRow, error: libErr } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        normalized_name: 'r1 b2 set null source',
        display_name: 'R1 B2 Set Null Source',
        nutrition: { kcal: 50, macros: { protein_g: 5, carbs_g: 5, fat_g: 1 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(libErr).toBeNull();
    const libraryItemId = libRow?.id as string;

    // Seed entry referencing the library item.
    const { data: entryRow, error: entryErr } = await harness.admin
      .from('food_entries')
      .insert({
        user_id: harness.userA.id,
        client_id: cid(),
        library_item_id: libraryItemId,
        meal_category: 'snack',
        source: 'library',
        items: [{ name: 'r1 b2', portion: 1, unit: 'serving', kcal: 50 }],
        logged_at: new Date().toISOString(),
      })
      .select('id, library_item_id')
      .single();
    expect(entryErr).toBeNull();
    const entryId = entryRow?.id as string;
    expect(entryRow?.library_item_id).toBe(libraryItemId);

    // Delete the library item. With ON DELETE SET NULL, the entry must
    // survive with library_item_id reset to NULL — NOT cascade-delete.
    const { error: deleteLibErr } = await harness.admin
      .from('food_library_items')
      .delete()
      .eq('id', libraryItemId);
    expect(deleteLibErr).toBeNull();

    // Confirm entry still exists with library_item_id = NULL.
    const { data: surviving, error: survivingErr } = await harness.admin
      .from('food_entries')
      .select('id, library_item_id')
      .eq('id', entryId);
    expect(survivingErr).toBeNull();
    expect(surviving).toHaveLength(1);
    expect(surviving?.[0]?.library_item_id).toBeNull();
  });
});
