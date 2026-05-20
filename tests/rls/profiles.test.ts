/**
 * @vitest-environment node
 *
 * I1 — profiles RLS integration test (Task 2.1b + Codex fix).
 *
 * Contract (testing-strategy.md §2.6 + tasks.md AC line 355):
 *   - Two distinct Supabase users (A + B) created via the shared `_harness`.
 *   - Auto-create trigger (migration 0002_profiles.sql) pre-seeds each user's
 *     `profiles` row with safe defaults (bio_sex='male', age=30,
 *     height_cm=170, current_weight_kg=70, activity_level='moderate').
 *   - For each of the 4 DML verbs, we run the negative-path assertion in BOTH
 *     directions: User A trying to touch User B's row AND User B trying to
 *     touch User A's row. RLS `using` / `with check` must reject or silently
 *     zero-row each attempt regardless of which client is the attacker.
 *   - Positive-path assertions confirm both users CAN read/update their OWN
 *     row, and that the trigger produced the expected default row for each.
 *
 * Why both directions?
 *   Codex adversarial review noted that asymmetric coverage (A-attacks-B only)
 *   would still pass if the RLS policy accidentally compared to a hardcoded
 *   id or mis-scoped by always allowing one specific actor. Symmetric testing
 *   (A↔B) proves `auth.uid() = id` is enforced regardless of direction.
 *
 * Execution:
 *   - Runs under Vitest (happy-dom top-level, node env via pragma).
 *   - SKIPPED when `SUPABASE_TEST_*` env vars are absent (local-without-live-DB
 *     falls back to skip so `pnpm test` stays green; CI Linux runs with
 *     secrets configured and is the authoritative gate).
 *   - Migration 0002 MUST be applied to `SUPABASE_TEST_URL` project before
 *     this suite will pass. Suite is TDD RED until the migration is applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

type Direction = 'A->B' | 'B->A';

interface DirectionContext {
  label: Direction;
  /** Actor whose authenticated client performs the attempt. */
  actor: () => RlsHarness['userA'];
  /** Target user whose row the actor tries to reach. */
  target: () => RlsHarness['userA'];
}

maybe('I1: profiles RLS — 4 verbs × 2 directions', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness?.teardown();
  }, 30_000);

  // --- Positive-path smoke tests per user ------------------------------------

  it('trigger auto-created User A profile with expected defaults', async () => {
    const { data, error } = await harness.userA.client
      .from('profiles')
      .select('id, bio_sex, age, height_cm, current_weight_kg, activity_level, target_mode')
      .eq('id', harness.userA.id)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(harness.userA.id);
    expect(data?.bio_sex).toBe('male');
    expect(data?.age).toBe(30);
    // numeric(5,1) / numeric(5,2) arrive as strings from PostgREST; compare loosely.
    expect(Number(data?.height_cm)).toBe(170);
    expect(Number(data?.current_weight_kg)).toBe(70);
    expect(data?.activity_level).toBe('moderate');
    expect(data?.target_mode).toBe('auto');
  });

  it('trigger auto-created User B profile with expected defaults', async () => {
    const { data, error } = await harness.userB.client
      .from('profiles')
      .select('id, bio_sex, age, height_cm, current_weight_kg, activity_level, target_mode')
      .eq('id', harness.userB.id)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(harness.userB.id);
    expect(data?.bio_sex).toBe('male');
    expect(data?.age).toBe(30);
    expect(Number(data?.height_cm)).toBe(170);
    expect(Number(data?.current_weight_kg)).toBe(70);
    expect(data?.activity_level).toBe('moderate');
    expect(data?.target_mode).toBe('auto');
  });

  it('A reads own: User A SELECT on own row returns exactly one row', async () => {
    const { data, error } = await harness.userA.client
      .from('profiles')
      .select('id')
      .eq('id', harness.userA.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(harness.userA.id);
  });

  it('B reads own: User B SELECT on own row returns exactly one row', async () => {
    const { data, error } = await harness.userB.client
      .from('profiles')
      .select('id')
      .eq('id', harness.userB.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(harness.userB.id);
  });

  it('A updates own: User A UPDATE on own row changes the row', async () => {
    const { error } = await harness.userA.client
      .from('profiles')
      .update({ age: 40 })
      .eq('id', harness.userA.id);
    expect(error).toBeNull();

    const { data, error: readErr } = await harness.userA.client
      .from('profiles')
      .select('age')
      .eq('id', harness.userA.id)
      .single();
    expect(readErr).toBeNull();
    expect(data?.age).toBe(40);

    // Restore default so downstream verbs see baseline state.
    await harness.userA.client.from('profiles').update({ age: 30 }).eq('id', harness.userA.id);
  });

  it('B updates own: User B UPDATE on own row changes the row', async () => {
    const { error } = await harness.userB.client
      .from('profiles')
      .update({ age: 45 })
      .eq('id', harness.userB.id);
    expect(error).toBeNull();

    const { data, error: readErr } = await harness.userB.client
      .from('profiles')
      .select('age')
      .eq('id', harness.userB.id)
      .single();
    expect(readErr).toBeNull();
    expect(data?.age).toBe(45);

    // Restore default so downstream verbs see baseline state.
    await harness.userB.client.from('profiles').update({ age: 30 }).eq('id', harness.userB.id);
  });

  // --- 4-verb RLS enforcement × 2 directions ---------------------------------
  //
  // We parameterize over { actor, target } pairs so every verb runs twice:
  // once A-attacks-B, once B-attacks-A. This proves the `auth.uid() = id`
  // check is symmetric and not accidentally comparing to a hardcoded id.

  const directions: DirectionContext[] = [
    {
      label: 'A->B',
      actor: () => harness.userA,
      target: () => harness.userB,
    },
    {
      label: 'B->A',
      actor: () => harness.userB,
      target: () => harness.userA,
    },
  ];

  for (const dir of directions) {
    it(`RLS-SELECT-${dir.label}: actor SELECT on target row returns zero rows`, async () => {
      const { data, error } = await dir
        .actor()
        .client.from('profiles')
        .select('id')
        .eq('id', dir.target().id);

      // RLS hides target's row from actor's session: PostgREST returns an
      // empty array without raising a permission error.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`RLS-INSERT-${dir.label}: actor INSERT as target fails WITH CHECK`, async () => {
      const { data, error } = await dir.actor().client.from('profiles').insert({
        id: dir.target().id,
        bio_sex: 'male',
        age: 25,
        height_cm: 180,
        current_weight_kg: 80,
        activity_level: 'active',
      });

      // Two acceptable failure modes:
      //   - RLS with-check rejection surfaces as PostgREST error 42501 /
      //     PGRST code "PGRST116" or similar. `error` is non-null.
      //   - Duplicate-primary-key rejection (since trigger auto-populated
      //     target's row already) surfaces as 23505. Either way, insert MUST
      //     NOT succeed and MUST NOT return a row.
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it(`RLS-UPDATE-${dir.label}: actor UPDATE of target row affects zero rows`, async () => {
      const { data, error } = await dir
        .actor()
        .client.from('profiles')
        .update({ age: 99 })
        .eq('id', dir.target().id)
        .select('id');

      // RLS update on another user's row: PostgREST returns empty result set;
      // no error, no rows affected.
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Confirm via target's own client that target's `age` was not mutated.
      const { data: targetAge } = await dir
        .target()
        .client.from('profiles')
        .select('age')
        .eq('id', dir.target().id)
        .single();
      expect(targetAge?.age).toBe(30);
    });

    it(`RLS-DELETE-${dir.label}: actor DELETE of target row affects zero rows`, async () => {
      const { data, error } = await dir
        .actor()
        .client.from('profiles')
        .delete()
        .eq('id', dir.target().id)
        .select('id');

      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Confirm via target's own client that target's row still exists.
      const { data: targetRow, error: targetErr } = await dir
        .target()
        .client.from('profiles')
        .select('id')
        .eq('id', dir.target().id)
        .single();
      expect(targetErr).toBeNull();
      expect(targetRow?.id).toBe(dir.target().id);
    });
  }
});
