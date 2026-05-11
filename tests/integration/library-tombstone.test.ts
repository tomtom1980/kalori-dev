/**
 * @vitest-environment node
 *
 * Task 4.1 sub-step 1 — migration 0007 `food_library_items.deleted_at` tombstone.
 *
 * Asserts the three shape guarantees that the Phase 2 Library code path depends
 * on:
 *   1. Tombstone column `deleted_at timestamptz NULL` is present.
 *   2. Partial index `idx_food_library_items_deleted_at` exists and is filtered
 *      `WHERE deleted_at IS NOT NULL` — the lazy-sweep query
 *      `WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '5 s'`
 *      scans it, so its presence is load-bearing for §10/Q6 cost bound.
 *   3. The canonical active-list SELECT (the query `lib/library/fetch.ts` will
 *      use) returns rows where `deleted_at IS NULL` only — tombstones vanish
 *      from the browse path, and clearing `deleted_at = NULL` (undo) restores
 *      visibility.
 *
 * RLS posture verified separately via `pg_policies` snapshot in the audit log
 * (see `Planning/.tmp/task-4.1-output.md` §Sub-step 1). The SELECT/UPDATE/DELETE
 * policies on `food_library_items` remain `auth.uid() = user_id` (no
 * `deleted_at` clause) — the app layer filters tombstones out of the active
 * read path and back in for lazy sweep. This test exercises the app-layer
 * filter under a real user JWT, which implicitly re-confirms the policy still
 * scopes to the owner post-migration.
 *
 * Local skip gate matches the rest of the RLS-backed integration suite: when
 * SUPABASE_TEST_* is absent, `describe.skip` keeps `pnpm test` green locally
 * without a live DB.
 *
 * Index introspection uses the Supabase Management API SQL endpoint because
 * PostgREST does not expose `pg_indexes` (and adding an RPC just for this
 * single read would drag schema churn into the migration unnecessarily). The
 * PAT is local-only; CI supplies `SUPABASE_PAT` via a secret if/when this
 * assertion runs there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from '../rls/_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const hasManagementApi = !!process.env.SUPABASE_PAT && !!process.env.SUPABASE_PROJECT_REF;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

async function runAdminSql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const ref = process.env.SUPABASE_PROJECT_REF!;
  const pat = process.env.SUPABASE_PAT!;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(
      `Management API SQL failed (${res.status}): ${await res.text().catch(() => '<no body>')}`,
    );
  }
  return (await res.json()) as T[];
}

maybe('migration 0007 — food_library_items tombstone column + partial index', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    // Harness teardown cascades user delete → library rows (ON DELETE CASCADE).
    // Guard against a partial setup where harness never constructed.
    if (harness) await harness.teardown();
  }, 30_000);

  it('has column food_library_items.deleted_at (timestamptz NULL)', async () => {
    if (!hasManagementApi) {
      throw new Error(
        'SUPABASE_PAT + SUPABASE_PROJECT_REF must be set for this assertion. Locally: add to .env.local from Planning/apikeys.txt. CI: ensure GitHub Actions secrets exist AND are wired into .github/workflows/ci.yml unit-integration job env block. See Planning/setup-state.md §1 + §7.',
      );
    }

    const rows = await runAdminSql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `select column_name, data_type, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'food_library_items'
          and column_name = 'deleted_at';`,
    );

    // Before migration applied: zero rows. After migration applied: exactly one
    // `timestamp with time zone` NULLable column.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data_type).toBe('timestamp with time zone');
    expect(rows[0]!.is_nullable).toBe('YES');
  }, 15_000);

  it('has partial index idx_food_library_items_deleted_at (WHERE deleted_at IS NOT NULL)', async () => {
    if (!hasManagementApi) {
      throw new Error(
        'SUPABASE_PAT + SUPABASE_PROJECT_REF must be set for this assertion. Locally: add to .env.local from Planning/apikeys.txt. CI: ensure GitHub Actions secrets exist AND are wired into .github/workflows/ci.yml unit-integration job env block. See Planning/setup-state.md §1 + §7.',
      );
    }

    const rows = await runAdminSql<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
         from pg_indexes
        where schemaname = 'public'
          and tablename = 'food_library_items'
          and indexname = 'idx_food_library_items_deleted_at';`,
    );

    expect(rows).toHaveLength(1);
    // `indexdef` carries the rendered CREATE INDEX statement — assert it is a
    // PARTIAL index on `deleted_at`. We match the filter predicate shape
    // loosely because Postgres canonicalises `WHERE deleted_at IS NOT NULL` as
    // `(deleted_at IS NOT NULL)`.
    const def = rows[0]!.indexdef.toLowerCase();
    expect(def).toContain('on public.food_library_items');
    expect(def).toContain('(deleted_at)');
    expect(def).toMatch(/where\s+\(?deleted_at\s+is\s+not\s+null\)?/);
  }, 15_000);

  it('tombstone round-trip: row visible → deleted_at=now() hides from active list → NULL restores', async () => {
    const clientId = crypto.randomUUID();
    const displayName = `Tombstone Test ${Date.now()}`;

    // Seed one active row as User A via admin client (bypasses RLS for setup).
    const { data: inserted, error: insertErr } = await harness.admin
      .from('food_library_items')
      .insert({
        user_id: harness.userA.id,
        client_id: clientId,
        normalized_name: displayName.toLowerCase(),
        display_name: displayName,
        nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 5, fat_g: 2 } },
        created_from: 'text',
      })
      .select('id, deleted_at')
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).not.toBeNull();
    const libraryItemId = inserted!.id as string;

    // After insert, `deleted_at` must default to NULL (column is nullable + no
    // default specified in migration).
    expect(inserted!.deleted_at).toBeNull();

    // Canonical active-list SELECT under user A's JWT — mirrors the query
    // `lib/library/fetch.ts` will run in sub-step 2:
    //   SELECT * FROM food_library_items
    //     WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC;
    // Using `.is('deleted_at', null)` is the Supabase-js idiomatic form.
    const activeBefore = await harness.userA.client
      .from('food_library_items')
      .select('id, deleted_at')
      .eq('id', libraryItemId)
      .is('deleted_at', null)
      .maybeSingle();
    expect(activeBefore.error).toBeNull();
    expect(activeBefore.data).not.toBeNull();
    expect(activeBefore.data!.id).toBe(libraryItemId);

    // Tombstone: set deleted_at = now() as user A (their own row; RLS
    // UPDATE policy allows it).
    const tombstoneAt = new Date().toISOString();
    const { error: tombErr } = await harness.userA.client
      .from('food_library_items')
      .update({ deleted_at: tombstoneAt })
      .eq('id', libraryItemId);
    expect(tombErr).toBeNull();

    // Canonical active-list SELECT must now exclude the row.
    const activeAfterTomb = await harness.userA.client
      .from('food_library_items')
      .select('id')
      .eq('id', libraryItemId)
      .is('deleted_at', null)
      .maybeSingle();
    expect(activeAfterTomb.error).toBeNull();
    expect(activeAfterTomb.data).toBeNull();

    // Sweep-path SELECT must still see it (deleted_at IS NOT NULL). This is
    // what lib/library/fetch.ts will run before the filter, and what the lazy
    // sweep DELETE will target.
    const sweepCandidate = await harness.userA.client
      .from('food_library_items')
      .select('id, deleted_at')
      .eq('id', libraryItemId)
      .not('deleted_at', 'is', null)
      .maybeSingle();
    expect(sweepCandidate.error).toBeNull();
    expect(sweepCandidate.data).not.toBeNull();
    expect(sweepCandidate.data!.deleted_at).not.toBeNull();

    // Undo: clear deleted_at = NULL. Row must reappear in the active list.
    const { error: undoErr } = await harness.userA.client
      .from('food_library_items')
      .update({ deleted_at: null })
      .eq('id', libraryItemId);
    expect(undoErr).toBeNull();

    const activeAfterUndo = await harness.userA.client
      .from('food_library_items')
      .select('id, deleted_at')
      .eq('id', libraryItemId)
      .is('deleted_at', null)
      .maybeSingle();
    expect(activeAfterUndo.error).toBeNull();
    expect(activeAfterUndo.data).not.toBeNull();
    expect(activeAfterUndo.data!.deleted_at).toBeNull();
  }, 30_000);
});
