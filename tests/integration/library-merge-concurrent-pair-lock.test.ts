/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 1 C2 — `library_merge_atomic` advisory lock keyed on
 * `(user_id, ordered-id-pair)` (migration 0010).
 *
 * Pre-migration the lock was `hashtext(p_client_id::text)` — only retries
 * sharing a client_id serialized. Two DIFFERENT clients merging the same
 * (winner, loser) pair concurrently could race the FK repoint + delete,
 * producing inconsistent state. This test exercises the new behavior:
 *   - 2 concurrent merge requests on the same (winner, loser) pair from
 *     DIFFERENT client_ids
 *   - Exactly ONE acquires the per-pair lock first → completes the FK
 *     repoint + winner update + loser hard-delete with replayed=false.
 *   - The OTHER waits for the lock, then sees the loser already gone and
 *     returns replayed=true (idempotent short-circuit).
 *   - No partial state: loser is gone, winner reflects merged values, no
 *     orphaned food_entries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('library_merge_atomic — concurrent same-pair lock (Task 4.5 R1 C2)', () => {
  let harness: RlsHarness;

  beforeEach(async () => {
    harness = await setupRlsHarness();
    vi.resetModules();
  }, 30_000);

  afterEach(async () => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    if (harness) await harness.teardown();
  }, 30_000);

  function mockServerClientAs(client: SupabaseClient, uid: string) {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => {
        return new Proxy(client, {
          get(target, prop) {
            if (prop === 'auth') {
              return {
                ...target.auth,
                getUser: async () => ({ data: { user: { id: uid } }, error: null }),
              };
            }
            return Reflect.get(target, prop);
          },
        });
      },
    }));
  }

  it('two concurrent merges with DIFFERENT client_ids on the same (winner, loser) pair → exactly one fresh + one replayed=true', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    // Seed winner + loser.
    const { data: winner } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'winner-conc',
        display_name: 'Winner',
        nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 10, fat_g: 5 } },
        created_from: 'text',
        log_count: 5,
      })
      .select('id')
      .single();

    const { data: loser } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'loser-conc',
        display_name: 'Loser',
        nutrition: { kcal: 150, macros: { protein_g: 15, carbs_g: 8, fat_g: 3 } },
        created_from: 'photo',
        log_count: 3,
      })
      .select('id')
      .single();

    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');

    // Two DIFFERENT client_ids — pre-migration these would NOT serialize
    // (each one would key its own lock).
    const buildBody = () =>
      JSON.stringify({
        client_id: crypto.randomUUID(),
        winnerId: winner!.id,
        loserId: loser!.id,
        fields: {
          display_name: 'Merged',
          nutrition: { kcal: 250, macros: { protein_g: 25, carbs_g: 15, fat_g: 6 } },
        },
      });

    // Fire 2 merges in parallel.
    const [r1, r2] = await Promise.all([
      POST(
        new Request('http://kalori.test/api/library/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: buildBody(),
        }),
      ),
      POST(
        new Request('http://kalori.test/api/library/merge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: buildBody(),
        }),
      ),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const j1 = (await r1.json()) as { replayed?: boolean; winner: { id: string } };
    const j2 = (await r2.json()) as { replayed?: boolean; winner: { id: string } };

    // Exactly one fresh merge + one replayed.
    const replayedCount = [j1.replayed, j2.replayed].filter((x) => x === true).length;
    expect(replayedCount).toBe(1);

    // Loser row hard-deleted.
    const { data: loserCheck } = await harness.admin
      .from('food_library_items')
      .select('id')
      .eq('id', loser!.id)
      .maybeSingle();
    expect(loserCheck).toBeNull();

    // Winner survives + still owned by user.
    const { data: winnerCheck } = await harness.admin
      .from('food_library_items')
      .select('id, log_count')
      .eq('id', winner!.id)
      .maybeSingle();
    expect(winnerCheck).not.toBeNull();
    // log_count was 5 (winner) + 3 (loser) on the fresh path; replay returns
    // current state — both responses should reflect the post-merge value.
    expect(winnerCheck!.log_count).toBe(8);
  }, 60_000);
});
