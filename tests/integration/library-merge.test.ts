/**
 * @vitest-environment node
 *
 * Task 4.1 sub-step 2 — `POST /api/library/merge` integration (FK repoint
 * correctness via real RPC + kalori-dev).
 *
 * Covers:
 *   1. Happy path: seeds winner + loser + `food_entries` referencing loser,
 *      POSTs merge, asserts:
 *        - food_entries.library_item_id NOW points to winner for all affected
 *        - loser row hard-deleted (row count delta = -1)
 *        - winner row reflects picked fields + log_count sum + max last_used_at
 *        - response body is { winner, replayed: false }
 *   2. Idempotent replay: second POST with same client_id → { replayed: true },
 *      no additional state change.
 *   3. Winner-not-found → 409.
 *   4. Unauthorized → 401.
 *   5. Validation errors (missing fields, bad UUIDs) → 400.
 *
 * This test hits the real RPC `library_merge_atomic` in kalori-dev. The Route
 * Handler wraps `supabase.rpc(...)` — we test it directly against the harness
 * user's authenticated client through the route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('POST /api/library/merge — atomic FK repoint + winner update + loser delete', () => {
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

  async function seedWinnerLoserWithEntry() {
    const winnerClient = crypto.randomUUID();
    const loserClient = crypto.randomUUID();
    const entryClient = crypto.randomUUID();

    const { data: winner, error: we } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: winnerClient,
        normalized_name: 'winner',
        display_name: 'Winner',
        nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 10, fat_g: 5 } },
        created_from: 'text',
        log_count: 5,
        last_used_at: '2026-01-01T00:00:00Z',
      })
      .select('id, client_id')
      .single();
    expect(we).toBeNull();

    const { data: loser, error: le } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: loserClient,
        normalized_name: 'loser',
        display_name: 'Loser',
        nutrition: { kcal: 150, macros: { protein_g: 15, carbs_g: 8, fat_g: 3 } },
        created_from: 'photo',
        log_count: 3,
        last_used_at: '2026-02-01T00:00:00Z',
      })
      .select('id, client_id')
      .single();
    expect(le).toBeNull();

    const { data: entry, error: ee } = await harness.admin
      .from('food_entries')
      .insert({
        user_id: harness.userA.id,
        client_id: entryClient,
        library_item_id: loser!.id,
        meal_category: 'breakfast',
        source: 'library',
        items: [{ name: 'loser', portion: 1, unit: 'unit', kcal: 150 }],
        logged_at: '2026-03-01T10:00:00Z',
      })
      .select('id, library_item_id')
      .single();
    expect(ee).toBeNull();

    return {
      winner: winner as { id: string; client_id: string },
      loser: loser as { id: string; client_id: string },
      entry: entry as { id: string; library_item_id: string },
    };
  }

  function mockServerClientAs(client: SupabaseClient, uid: string) {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => {
        // Wrap the SupabaseClient so .auth.getUser() returns userA.id
        // deterministically without another network round-trip.
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

  it('happy path: FK repoint + winner fields + loser delete + cache tags', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    const { winner, loser, entry } = await seedWinnerLoserWithEntry();
    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const mergeClientId = crypto.randomUUID();
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: mergeClientId,
          winnerId: winner.id,
          loserId: loser.id,
          fields: {
            display_name: 'Merged Winner',
            nutrition: {
              kcal: 250,
              macros: { protein_g: 25, carbs_g: 15, fat_g: 6 },
            },
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      winner: { id: string; display_name: string; log_count: number; last_used_at: string };
      replayed?: boolean;
    };
    expect(body.winner.id).toBe(winner.id);
    expect(body.winner.display_name).toBe('Merged Winner');
    expect(body.winner.log_count).toBe(8); // 5 + 3
    // last_used_at = max(2026-01-01, 2026-02-01) = 2026-02-01
    expect(new Date(body.winner.last_used_at).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(body.replayed).toBe(false);

    // FK repoint: entry now points to winner.
    const { data: entryCheck } = await harness.admin
      .from('food_entries')
      .select('library_item_id')
      .eq('id', entry.id)
      .single();
    expect(entryCheck!.library_item_id).toBe(winner.id);

    // Loser row is GONE.
    const { data: loserCheck } = await harness.admin
      .from('food_library_items')
      .select('id')
      .eq('id', loser.id)
      .maybeSingle();
    expect(loserCheck).toBeNull();

    // Cache tag was invalidated (at least the library tag).
    expect(revalidateTag).toHaveBeenCalled();
    const calls = revalidateTag.mock.calls.map((c) => c[0]);
    expect(calls).toContain(`user:${harness.userA.id}:library`);
  }, 30_000);

  it('idempotent replay: second POST with same client_id returns replayed=true', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));

    const { winner, loser } = await seedWinnerLoserWithEntry();
    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const mergeClientId = crypto.randomUUID();
    const body = {
      client_id: mergeClientId,
      winnerId: winner.id,
      loserId: loser.id,
      fields: { nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 10, fat_g: 5 } } },
    };

    // First call — real merge.
    const r1 = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { replayed?: boolean };
    expect(j1.replayed).toBe(false);

    // Second call — loser is gone, RPC short-circuits to replayed=true.
    const r2 = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { replayed?: boolean };
    expect(j2.replayed).toBe(true);
  }, 30_000);

  it('409 when winner_id does not exist', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const { loser } = await seedWinnerLoserWithEntry();
    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          winnerId: '00000000-0000-4000-8000-000000000000',
          loserId: loser.id,
          fields: { nutrition: { kcal: 0, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } } },
        }),
      }),
    );
    expect(res.status).toBe(409);
  }, 30_000);

  it('401 when no session', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          winnerId: '22222222-2222-4222-8222-222222222222',
          loserId: '33333333-3333-4333-8333-333333333333',
          fields: { nutrition: { kcal: 0, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } } },
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      }),
    }));

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winnerId: 'not-a-uuid' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  /**
   * CF-1 (Codex adversarial round 1): rejects self-merge (winnerId ===
   * loserId). Without the Zod refine + RPC P0002 guard, the RPC would
   * load the same row into both v_winner_row + v_loser_row, update
   * winner with doubled log_count, then DELETE the winner — silent data
   * loss. Defensive belt-and-suspenders: Zod catches ahead of the RPC,
   * RPC's `winner_equals_loser` guard catches if a client bypasses the
   * HTTP layer (direct supabase.rpc() call, etc.).
   */
  it('rejects self-merge (winnerId === loserId) and preserves the row', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const { winner } = await seedWinnerLoserWithEntry();
    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/merge/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          winnerId: winner.id,
          loserId: winner.id,
          fields: { nutrition: { kcal: 0, macros: { protein_g: 0, carbs_g: 0, fat_g: 0 } } },
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('same_ids');

    // The row MUST still exist — no data loss.
    const { data: survivor } = await harness.admin
      .from('food_library_items')
      .select('id')
      .eq('id', winner.id)
      .maybeSingle();
    expect(survivor).not.toBeNull();
    expect(survivor!.id).toBe(winner.id);
  }, 30_000);
});
