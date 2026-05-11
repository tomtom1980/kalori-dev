/**
 * @vitest-environment node
 *
 * Task 4.7.2 — B1 schema fix: `food_entries.source` CHECK constraint must
 * accept `'manual'` in addition to `'text' | 'photo' | 'library'`.
 *
 * Why: Phase 5 ships the offline outbox replay path. Queued mutations replay
 * through `/api/entries/save` with `source: 'manual'` for the offline-fallback
 * flow. The Zod schema in `app/api/entries/save/route.ts` already accepts
 * `'manual'`, but migration 0003 line 92 wrote
 * `check (source in ('text','photo','library'))` — so the row hits the DB
 * CHECK constraint and Postgres raises `23514`. This test asserts the post-
 * migration state where a `source: 'manual'` insert succeeds.
 *
 * RED → GREEN: Pre-migration 0012, this insert fails with `23514` referencing
 * `food_entries_source_check`. Post-migration, the same insert returns one
 * row whose `source === 'manual'`.
 *
 * Skip gate matches the rest of the RLS-backed integration suite (mirrors
 * `tests/integration/library-tombstone.test.ts:36–47`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('migration 0012 — food_entries.source accepts "manual"', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    if (harness) await harness.teardown();
  }, 30_000);

  it('inserts food_entries row with source="manual" and returns it', async () => {
    const clientId = crypto.randomUUID();
    const { data, error } = await harness.userA.client
      .from('food_entries')
      .insert({
        user_id: harness.userA.id,
        client_id: clientId,
        meal_category: 'breakfast',
        source: 'manual',
        items: [{ name: 'manual entry', portion: 1, unit: 'serving', kcal: 250 }],
        logged_at: new Date().toISOString(),
      })
      .select('id, source')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.source).toBe('manual');
  }, 15_000);
});
