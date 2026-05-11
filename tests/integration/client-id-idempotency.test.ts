/**
 * @vitest-environment node
 *
 * I11 — DB-level `client_id` UNIQUE constraint test (Task 3.1 AC; briefing §9).
 *
 * Scope: DB-level only. The Route Handler "200 + existing row on retry"
 * replay logic is owned by Task 3.4 (`/api/entries/save`). This test proves
 * the foundation: the Postgres UNIQUE constraint on `client_id` per table
 * raises `23505 unique_violation` when the same `client_id` is reused.
 *
 * Coverage (4 user-write tables × 1 case = 4 assertions):
 *   - food_entries
 *   - food_library_items
 *   - weight_log
 *   - water_log
 *
 * Per-table: User A inserts a row with `client_id = X` (succeeds), then
 * inserts a second row with the SAME `client_id = X` (must fail with code
 * 23505 referencing column `client_id`).
 *
 * Briefing §9 also notes that cross-user collisions raise 23505 because the
 * UNIQUE is single-column scope (NOT composite `(user_id, client_id)`). That
 * is the WANTED behaviour: client-generated UUIDv4 is globally-unique-by-
 * construction; cross-user collision means a client got bad RNG and we want
 * to fail loudly. We do NOT test cross-user here directly because the
 * RLS-blocked insert from User B would surface as an RLS error before the
 * UNIQUE constraint fires; same-user duplicate is the precise constraint
 * shape Task 3.4 depends on.
 *
 * Local skip gate matches `tests/rls/profiles.test.ts` — when env absent,
 * suite is `describe.skip` so `pnpm test` stays green locally without live
 * DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('I11: client_id UNIQUE constraint enforces single-column-per-table', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness?.teardown();
  }, 30_000);

  it('food_entries: duplicate client_id same user raises 23505', async () => {
    const cid = crypto.randomUUID();

    const { error: firstErr } = await harness.userA.client.from('food_entries').insert({
      user_id: harness.userA.id,
      client_id: cid,
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'first', portion: 1, unit: 'serving', kcal: 100 }],
      logged_at: new Date().toISOString(),
    });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await harness.userA.client.from('food_entries').insert({
      user_id: harness.userA.id,
      client_id: cid,
      meal_category: 'lunch',
      source: 'text',
      items: [{ name: 'second', portion: 1, unit: 'serving', kcal: 50 }],
      logged_at: new Date().toISOString(),
    });
    expect(dupErr?.code).toBe('23505');
    expect(dupErr?.message).toMatch(/client_id/i);
  });

  it('food_library_items: duplicate client_id same user raises 23505', async () => {
    const cid = crypto.randomUUID();

    const { error: firstErr } = await harness.userA.client.from('food_library_items').insert({
      user_id: harness.userA.id,
      client_id: cid,
      normalized_name: 'idempotency test item',
      display_name: 'Idempotency Test Item',
      nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 5, fat_g: 2 } },
      created_from: 'text',
    });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await harness.userA.client.from('food_library_items').insert({
      user_id: harness.userA.id,
      client_id: cid,
      normalized_name: 'idempotency test item v2',
      display_name: 'Idempotency Test Item v2',
      nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 10, fat_g: 4 } },
      created_from: 'text',
    });
    expect(dupErr?.code).toBe('23505');
    expect(dupErr?.message).toMatch(/client_id/i);
  });

  it('weight_log: duplicate client_id same user raises 23505', async () => {
    const cid = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    const { error: firstErr } = await harness.userA.client.from('weight_log').insert({
      user_id: harness.userA.id,
      client_id: cid,
      date: today,
      weight_kg: 70,
    });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await harness.userA.client.from('weight_log').insert({
      user_id: harness.userA.id,
      client_id: cid,
      date: today,
      weight_kg: 71,
    });
    expect(dupErr?.code).toBe('23505');
    expect(dupErr?.message).toMatch(/client_id/i);
  });

  it('water_log: duplicate client_id same user raises 23505', async () => {
    const cid = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    const { error: firstErr } = await harness.userA.client.from('water_log').insert({
      user_id: harness.userA.id,
      client_id: cid,
      date: today,
      count: 4,
      unit: 'glass',
    });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await harness.userA.client.from('water_log').insert({
      user_id: harness.userA.id,
      client_id: cid,
      date: today,
      count: 5,
      unit: 'glass',
    });
    expect(dupErr?.code).toBe('23505');
    expect(dupErr?.message).toMatch(/client_id/i);
  });
});
