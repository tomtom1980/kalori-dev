/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 1 C1 — END-TO-END verification of the tombstone guard
 * inside `library_merge_atomic` (migration 0010) against kalori-dev. Seeds
 * a winner + loser, tombstones the loser via `deleted_at = now()`, then POSTs
 * the merge route and asserts:
 *   - response is 409 + error=merge_target_tombstoned
 *   - the loser row is STILL tombstoned (no hard-delete)
 *   - the winner row is unchanged (no log_count doubling, no field overwrite)
 *
 * This complements the unit-mocked test (`library-merge-tombstone-guard.test.ts`)
 * by exercising the actual PL/pgSQL `raise exception 'merge_target_tombstoned'`
 * path against the real Postgres function in kalori-dev.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('POST /api/library/merge — tombstone guard (real DB, migration 0010)', () => {
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

  it('rejects merge when LOSER is tombstoned (deleted_at IS NOT NULL)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    // Seed winner + loser.
    const { data: winner, error: we } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'winner-tombstone',
        display_name: 'Winner',
        nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 10, fat_g: 5 } },
        created_from: 'text',
        log_count: 5,
        last_used_at: '2026-01-01T00:00:00Z',
      })
      .select('id, log_count, display_name')
      .single();
    expect(we).toBeNull();

    const { data: loser, error: le } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'loser-tombstone',
        display_name: 'Loser',
        nutrition: { kcal: 150, macros: { protein_g: 15, carbs_g: 8, fat_g: 3 } },
        created_from: 'photo',
        log_count: 3,
        last_used_at: '2026-02-01T00:00:00Z',
      })
      .select('id, deleted_at')
      .single();
    expect(le).toBeNull();

    // Tombstone the loser.
    const tombstoneAt = new Date().toISOString();
    const { error: te } = await harness.admin
      .from('food_library_items')
      .update({ deleted_at: tombstoneAt })
      .eq('id', loser!.id);
    expect(te).toBeNull();

    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          winnerId: winner!.id,
          loserId: loser!.id,
          fields: {
            display_name: 'Should Not Apply',
            nutrition: { kcal: 999, macros: { protein_g: 99, carbs_g: 99, fat_g: 99 } },
          },
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('merge_target_tombstoned');

    // Loser STILL tombstoned (not hard-deleted by the guarded RPC).
    const { data: loserCheck } = await harness.admin
      .from('food_library_items')
      .select('id, deleted_at')
      .eq('id', loser!.id)
      .maybeSingle();
    expect(loserCheck).not.toBeNull();
    expect(loserCheck!.deleted_at).not.toBeNull();

    // Winner unchanged: log_count + display_name preserved.
    const { data: winnerCheck } = await harness.admin
      .from('food_library_items')
      .select('id, log_count, display_name')
      .eq('id', winner!.id)
      .maybeSingle();
    expect(winnerCheck).not.toBeNull();
    expect(winnerCheck!.log_count).toBe(5);
    expect(winnerCheck!.display_name).toBe('Winner');
  }, 30_000);

  it('rejects merge when WINNER is tombstoned', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const { data: winner } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: 'winner-w-tombstone',
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
        normalized_name: 'loser-w-tombstone',
        display_name: 'Loser',
        nutrition: { kcal: 150, macros: { protein_g: 15, carbs_g: 8, fat_g: 3 } },
        created_from: 'photo',
        log_count: 3,
      })
      .select('id')
      .single();

    // Tombstone the WINNER.
    await harness.admin
      .from('food_library_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', winner!.id);

    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          winnerId: winner!.id,
          loserId: loser!.id,
          fields: {
            nutrition: { kcal: 0, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } },
          },
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('merge_target_tombstoned');
  }, 30_000);
});
