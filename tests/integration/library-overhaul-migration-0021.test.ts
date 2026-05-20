/**
 * @vitest-environment node
 *
 * bugfix-tomi batch `2026-05-16-library-overhaul` — migration 0021 contract test.
 *
 * Covers DB-layer changes shipped by `supabase/migrations/0021_library_overhaul.sql`:
 *
 *   Bug 5 (Gemini sketch tracking) — adds 4 columns to `food_library_items`:
 *     - thumbnail_kind        text NULL  CHECK in ('photo','sketch')
 *     - sketch_generated_at   timestamptz NULL
 *     - sketch_attempt_count  int NOT NULL DEFAULT 0
 *     - sketch_last_error     text NULL
 *
 *   Bug 6 (manual library creation) — widens the `created_from` CHECK from
 *     ('text','photo') to ('text','photo','manual') so manual rows insert.
 *
 * Test framing (real DB, RLS harness pattern):
 *   - AC-5a: `created_from = 'manual'` INSERT now succeeds (pre-migration this
 *     would fail with 23514 check_violation).
 *   - AC-5b: All four new columns exist on `food_library_items` with the
 *     expected nullability + defaults — proven by inserting a row that sets
 *     the values directly and verifying the round-trip.
 *   - AC-5c: `thumbnail_kind` CHECK rejects values other than 'photo'/'sketch'.
 *   - AC-5d: `sketch_attempt_count` defaults to 0 NOT NULL.
 *   - AC-6a: RLS isolation still holds — User B cannot SELECT or UPDATE
 *     User A's sketch_* columns even via the new column surface.
 *
 * Skip gate matches other real-DB integration tests in this directory: when
 * `SUPABASE_TEST_*` env vars are absent, suite is `describe.skip` so local
 * `pnpm test` stays green without a live DB connection.
 *
 * Pattern reference: `tests/integration/library-create-real-db-dedup.test.ts`
 * (migration 0020 contract test).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('food_library_items migration 0021 (library overhaul) — real DB', () => {
  let harness: RlsHarness;

  beforeEach(async () => {
    harness = await setupRlsHarness();
  }, 60_000);

  afterEach(async () => {
    if (harness) await harness.teardown();
  }, 30_000);

  // Bug 6 — widened CHECK accepts 'manual'.
  it("AC-6: created_from = 'manual' INSERT succeeds after migration", async () => {
    const userId = harness.userA.id;

    const insert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 ac6 manual rice',
        display_name: 'Manual Rice (AC-6)',
        nutrition: { kcal: 200, macros: { protein_g: 4, carbs_g: 44, fat_g: 0 } },
        created_from: 'manual',
      })
      .select('id, created_from')
      .single();

    expect(insert.error, `manual insert failed: ${insert.error?.message}`).toBeNull();
    expect(insert.data?.created_from).toBe('manual');
  }, 30_000);

  // Bug 6 — invalid created_from still rejected.
  it("AC-6: created_from = 'bogus' INSERT still rejected with 23514 check_violation", async () => {
    const userId = harness.userA.id;

    const insert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 ac6 bogus',
        display_name: 'Bogus Source (AC-6)',
        nutrition: { kcal: 10, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        created_from: 'bogus' as any,
      })
      .select('id')
      .single();

    expect(insert.data).toBeNull();
    expect(insert.error).not.toBeNull();
    expect(insert.error!.code).toBe('23514');
  }, 30_000);

  // Bug 5 — four new columns exist and round-trip.
  it('AC-5: new sketch tracking columns round-trip on INSERT/SELECT', async () => {
    const userId = harness.userA.id;
    const sketchTime = new Date().toISOString();

    const insert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 ac5 sketch',
        display_name: 'Sketch Round-Trip (AC-5)',
        nutrition: { kcal: 50, macros: { protein_g: 1, carbs_g: 10, fat_g: 0 } },
        created_from: 'text',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnail_kind: 'sketch' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_generated_at: sketchTime as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_attempt_count: 3 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_last_error: 'gemini 500 transient' as any,
      })
      .select('id, thumbnail_kind, sketch_generated_at, sketch_attempt_count, sketch_last_error')
      .single();

    expect(insert.error, `sketch round-trip insert failed: ${insert.error?.message}`).toBeNull();
    expect(insert.data).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = insert.data as any;
    expect(row.thumbnail_kind).toBe('sketch');
    expect(new Date(row.sketch_generated_at).toISOString()).toBe(sketchTime);
    expect(row.sketch_attempt_count).toBe(3);
    expect(row.sketch_last_error).toBe('gemini 500 transient');
  }, 30_000);

  // Bug 5 — thumbnail_kind CHECK rejects invalid values.
  it('AC-5: thumbnail_kind CHECK rejects values other than photo/sketch with 23514', async () => {
    const userId = harness.userA.id;

    const insert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 ac5 bad kind',
        display_name: 'Bad Thumbnail Kind (AC-5)',
        nutrition: { kcal: 10, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
        created_from: 'text',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnail_kind: 'illustration' as any,
      })
      .select('id')
      .single();

    expect(insert.data).toBeNull();
    expect(insert.error).not.toBeNull();
    expect(insert.error!.code).toBe('23514');
  }, 30_000);

  // Bug 5 — sketch_attempt_count defaults to 0 NOT NULL.
  it('AC-5: sketch_attempt_count defaults to 0 when omitted on INSERT', async () => {
    const userId = harness.userA.id;

    const insert = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 ac5 default count',
        display_name: 'Default Count (AC-5)',
        nutrition: { kcal: 10, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
        created_from: 'text',
      })
      .select('id, sketch_attempt_count, sketch_generated_at, sketch_last_error, thumbnail_kind')
      .single();

    expect(insert.error, `default-count insert failed: ${insert.error?.message}`).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = insert.data as any;
    expect(row.sketch_attempt_count).toBe(0);
    expect(row.sketch_generated_at).toBeNull();
    expect(row.sketch_last_error).toBeNull();
    expect(row.thumbnail_kind).toBeNull();
  }, 30_000);

  // RLS regression — new columns inherit per-user policies; User B cannot
  // SELECT or UPDATE User A's sketch_* fields.
  it('RLS: User B cannot SELECT or UPDATE User A sketch columns on the new row', async () => {
    const userAId = harness.userA.id;

    // Admin-seed a row for User A so we know the row exists across RLS clients.
    const seed = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: userAId,
        client_id: crypto.randomUUID(),
        normalized_name: '0021 rls userA sketch',
        display_name: 'User A Sketch Row',
        nutrition: { kcal: 30, macros: { protein_g: 1, carbs_g: 5, fat_g: 0 } },
        created_from: 'manual',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnail_kind: 'sketch' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_attempt_count: 1 as any,
      })
      .select('id')
      .single();
    expect(seed.error, `seed insert failed: ${seed.error?.message}`).toBeNull();
    const rowId = seed.data!.id as string;

    // User B SELECT: should return 0 rows (RLS hides User A's row).
    const bSelect = await harness.userB.client
      .from('food_library_items')
      .select('id, thumbnail_kind, sketch_attempt_count')
      .eq('id', rowId);
    expect(bSelect.error).toBeNull();
    expect(bSelect.data ?? []).toEqual([]);

    // User B UPDATE attempting to mutate sketch_* on User A's row: RLS turns
    // this into a no-op (zero rows affected). The PostgREST response carries
    // an empty data array — no error code is raised by Postgres because RLS
    // simply restricts the row scope, but the row in the DB is unchanged.
    const bUpdate = await harness.userB.client
      .from('food_library_items')
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_attempt_count: 999 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sketch_last_error: 'tampered' as any,
      })
      .eq('id', rowId)
      .select('id, sketch_attempt_count, sketch_last_error');
    // No PG error; just 0 rows affected.
    expect(bUpdate.data ?? []).toEqual([]);

    // Admin re-read confirms the row was NOT mutated.
    const verify = await harness.admin
      .from('food_library_items')
      .select('sketch_attempt_count, sketch_last_error')
      .eq('id', rowId)
      .single();
    expect(verify.error).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyRow = verify.data as any;
    expect(verifyRow.sketch_attempt_count).toBe(1);
    expect(verifyRow.sketch_last_error).toBeNull();
  }, 30_000);
});
