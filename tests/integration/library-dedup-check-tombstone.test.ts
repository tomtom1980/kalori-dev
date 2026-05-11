/**
 * @vitest-environment node
 *
 * Task 4.7.2 — B5 route fix: `POST /api/library/dedup-check` MUST filter out
 * tombstoned `food_library_items` rows (`deleted_at IS NOT NULL`).
 *
 * Why: A tombstoned library item that is still resurfaced by the dedup-check
 * preflight prompts the user to "match this existing item" and re-mints an
 * orphan FK reference on save. Sister filter to the active-list query in
 * `lib/library/fetch.ts` (Task 4.1) and the ownership guard in
 * `app/api/entries/save/route.ts:120` (`.is('deleted_at', null)` chained after
 * `.eq('user_id', userId)`).
 *
 * RED → GREEN: Pre-fix, the route's `.maybeSingle()` returns the tombstoned
 * row (CHECK passes, normalized_name matches). Post-fix, the same call
 * returns `{ match: null }` because the chained `.is('deleted_at', null)` ANDs
 * tombstones out.
 *
 * Negative control: an un-tombstoned row (refresh `deleted_at = null`) MUST
 * still match — proves the filter doesn't over-filter.
 *
 * Test pattern: real-DB harness (`setupRlsHarness`) + direct route handler
 * import + auth proxy mock (mirrors `library-merge-tombstone-real-db.test.ts`).
 * `getServerSupabase` is mocked to return the userA harness client whose JWT
 * carries the right RLS context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('POST /api/library/dedup-check — tombstone filter (real DB)', () => {
  let harness: RlsHarness;

  beforeEach(async () => {
    harness = await setupRlsHarness();
    vi.resetModules();
  }, 30_000);

  afterEach(async () => {
    vi.doUnmock('@/lib/supabase/server');
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

  it('returns match:null for tombstoned row; returns match for un-tombstoned row', async () => {
    const normalized = `dedup-tombstone-${Date.now()}`;
    const displayName = 'Tombstoned Item';

    const { data: inserted, error: insertErr } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: crypto.randomUUID(),
        normalized_name: normalized,
        display_name: displayName,
        nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 5, fat_g: 2 } },
        created_from: 'text',
      })
      .select('id')
      .single();
    expect(insertErr).toBeNull();
    const itemId = inserted!.id as string;

    // Tombstone the row.
    const { error: tombErr } = await harness.admin
      .from('food_library_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', itemId);
    expect(tombErr).toBeNull();

    mockServerClientAs(harness.userA.client, harness.userA.id);

    const { POST } = await import('@/app/api/library/dedup-check/route');

    // Tombstoned: route MUST return match:null.
    const res1 = await POST(
      new Request('http://kalori.test/api/library/dedup-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalized_name: normalized }),
      }),
    );
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { match: unknown };
    expect(body1.match).toBeNull();

    // Negative control: un-tombstone the row → match must reappear.
    const { error: undoErr } = await harness.admin
      .from('food_library_items')
      .update({ deleted_at: null })
      .eq('id', itemId);
    expect(undoErr).toBeNull();

    const res2 = await POST(
      new Request('http://kalori.test/api/library/dedup-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalized_name: normalized }),
      }),
    );
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { match: { id: string } | null };
    expect(body2.match).not.toBeNull();
    expect(body2.match!.id).toBe(itemId);
  }, 30_000);
});
