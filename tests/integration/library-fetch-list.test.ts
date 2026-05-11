/**
 * @vitest-environment node
 *
 * Task 4.1 sub-step 2 — `lib/library/fetch.ts` `fetchLibraryPage(uid)`.
 *
 * Asserts:
 *   1. Returns only rows where `deleted_at IS NULL`.
 *   2. Lazy tombstone sweep runs BEFORE the SELECT — hard-deletes rows whose
 *      `deleted_at < now() - interval '5 seconds'`.
 *   3. Recently-tombstoned rows (within the 5s window) survive the sweep AND
 *      are correctly excluded from the active list return value.
 *
 * The sweep is idempotent + race-safe per Postgres row-level locking. This test
 * proves the three canonical state transitions rather than concurrent-sweep
 * races (those would need a dedicated stress test).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('fetchLibraryPage — lazy sweep + active list', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    if (harness) await harness.teardown();
  }, 30_000);

  async function seedRow(label: string, overrides: Record<string, unknown> = {}) {
    const clientId = crypto.randomUUID();
    const { data, error } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: clientId,
        normalized_name: label.toLowerCase(),
        display_name: label,
        nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 5, fat_g: 2 } },
        created_from: 'text',
        ...overrides,
      })
      .select('id, client_id, deleted_at')
      .single();
    expect(error).toBeNull();
    return data as { id: string; client_id: string; deleted_at: string | null };
  }

  it('lazy sweep hard-deletes rows tombstoned >5s ago; recent tombstones survive; active list excludes both tombstoned sets', async () => {
    const active = await seedRow(`Active ${Date.now()}`);
    const freshTomb = await seedRow(`FreshTomb ${Date.now()}`, {
      deleted_at: new Date().toISOString(),
    });
    const staleTomb = await seedRow(`StaleTomb ${Date.now()}`, {
      deleted_at: new Date(Date.now() - 10_000).toISOString(),
    });

    // Module-fresh import so any caller memoization inside `cache()` is
    // scoped to this test invocation. The helper depends on getServerSupabase
    // which depends on next/headers cookies — we bypass that by mocking the
    // getServerSupabase export to return the userA's authenticated client
    // (which carries the RLS-enforcing JWT via Authorization header).
    // `server-only` is a build-time guard not available at Vitest runtime;
    // stubbed per the existing `dashboard-ssr-regression.test.ts` precedent.
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => harness.userA.client,
    }));

    try {
      const { fetchLibraryPage } = await import('@/lib/library/fetch');
      const page = await fetchLibraryPage(harness.userA.id);

      const returnedIds = new Set(page.items.map((i) => i.id));

      // Active row present.
      expect(returnedIds.has(active.id)).toBe(true);
      // Fresh tombstone NOT in active list.
      expect(returnedIds.has(freshTomb.id)).toBe(false);
      // Stale tombstone NOT in active list.
      expect(returnedIds.has(staleTomb.id)).toBe(false);

      // Post-sweep DB state: stale tombstone hard-deleted, fresh tombstone
      // still present (for undo). Use admin to see across RLS.
      const { data: activeCheck } = await harness.admin
        .from('food_library_items')
        .select('id, deleted_at')
        .eq('id', active.id)
        .maybeSingle();
      expect(activeCheck).not.toBeNull();
      expect(activeCheck!.deleted_at).toBeNull();

      const { data: freshCheck } = await harness.admin
        .from('food_library_items')
        .select('id, deleted_at')
        .eq('id', freshTomb.id)
        .maybeSingle();
      expect(freshCheck).not.toBeNull();
      expect(freshCheck!.deleted_at).not.toBeNull();

      const { data: staleCheck } = await harness.admin
        .from('food_library_items')
        .select('id, deleted_at')
        .eq('id', staleTomb.id)
        .maybeSingle();
      expect(staleCheck).toBeNull();
    } finally {
      vi.doUnmock('@/lib/supabase/server');
      vi.doUnmock('server-only');
    }
  }, 30_000);
});
