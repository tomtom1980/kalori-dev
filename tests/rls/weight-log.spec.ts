/**
 * @vitest-environment node
 *
 * Task 4.3b — weight_log RLS regression (4 verbs × 2 directions = 8 assertions).
 *
 * No new table — re-runs isolation checks against the existing `weight_log`
 * table to catch regressions from the 4.3b API route shipping. Skipped when
 * SUPABASE_TEST_* env vars are absent (CI Linux gate).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

type Direction = 'A->B' | 'B->A';

interface DirectionContext {
  label: Direction;
  actor: () => RlsHarness['userA'];
  target: () => RlsHarness['userA'];
}

maybe('weight_log RLS — 4 verbs × 2 directions', () => {
  let harness: RlsHarness;
  const seededTargetRowIds: string[] = [];

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    // Best-effort cleanup via admin client (bypasses RLS).
    for (const id of seededTargetRowIds) {
      try {
        await harness.admin.from('weight_log').delete().eq('id', id);
      } catch {
        // swallow
      }
    }
    await harness?.teardown();
  }, 30_000);

  afterEach(async () => {
    // No-op — setup happens in directional tests themselves.
  });

  // Seed one row for each user via admin so selects have something to hit.
  async function seedTargetRow(userId: string): Promise<string> {
    const clientId = crypto.randomUUID();
    const { data, error } = await harness.admin
      .from('weight_log')
      .insert({
        user_id: userId,
        client_id: clientId,
        date: new Date().toISOString().slice(0, 10),
        weight_kg: 70.0,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`seed failed: ${error?.message ?? 'no row'}`);
    }
    seededTargetRowIds.push(data.id as string);
    return data.id as string;
  }

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
    it(`RLS-SELECT-${dir.label}: actor SELECT on target's row returns zero rows`, async () => {
      await seedTargetRow(dir.target().id);
      const { data, error } = await dir
        .actor()
        .client.from('weight_log')
        .select('id')
        .eq('user_id', dir.target().id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`RLS-INSERT-${dir.label}: actor INSERT as target fails WITH CHECK`, async () => {
      const { data, error } = await dir
        .actor()
        .client.from('weight_log')
        .insert({
          user_id: dir.target().id,
          client_id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          weight_kg: 70,
        });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it(`RLS-UPDATE-${dir.label}: actor UPDATE of target row affects zero rows`, async () => {
      const targetRowId = await seedTargetRow(dir.target().id);
      const { data, error } = await dir
        .actor()
        .client.from('weight_log')
        .update({ weight_kg: 99 })
        .eq('id', targetRowId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`RLS-DELETE-${dir.label}: actor DELETE of target row affects zero rows`, async () => {
      const targetRowId = await seedTargetRow(dir.target().id);
      const { data, error } = await dir
        .actor()
        .client.from('weight_log')
        .delete()
        .eq('id', targetRowId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  }
});
