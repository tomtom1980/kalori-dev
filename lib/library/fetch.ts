/**
 * Library read helper — canonical active-list query + lazy tombstone sweep.
 *
 * Task 4.1 sub-step 2 (reconciled spec §9.4).
 *
 * Two concerns:
 *   1. Sweep — hard-delete rows whose `deleted_at < now() - 5 seconds` BEFORE
 *      the SELECT. Idempotent; race-safe per Postgres row-level locking (two
 *      concurrent sweeps of the same row both attempt the DELETE; one wins,
 *      the other produces 0-row delta).
 *   2. Active list — `deleted_at IS NULL` rows only, ordered by
 *      `last_used_at DESC NULLS LAST`.
 *
 * The `cache()` wrapper dedupes this helper's invocation WITHIN a single
 * request render tree (React server-component `cache()`, not Next.js cache).
 * The sweep runs at most once per request even with many consumers.
 *
 * **Architecture invariant (reconciled spec §18.8):** the sweep MUST run
 * OUTSIDE any future `use cache` boundary. When Phase 5 migrates to
 * `use cache` + `cacheTag`, this `cache()`-wrapped helper stays in place —
 * its purpose is per-request deduplication, not cross-request cache hits.
 * A `use cache` boundary sitting ABOVE this helper would cause cached reads
 * to skip the sweep on cache hits, breaking the 5s-tombstone contract.
 */
import 'server-only';
import { cache } from 'react';

import { getServerSupabase } from '@/lib/supabase/server';

export interface LibraryItem {
  id: string;
  client_id: string;
  display_name: string;
  normalized_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: {
    kcal: number;
    macros?: { protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number };
    micros?: Record<string, number>;
  };
  thumbnail_url: string | null;
  log_count: number;
  last_used_at: string | null;
  user_edited_flag: boolean;
  created_from: 'text' | 'photo';
  created_at: string;
}

/**
 * Fetch the active library page for `uid`. Runs lazy sweep first, then
 * active-list SELECT. Wrapped in React `cache()` so concurrent consumers
 * within the same request share a single execution.
 */
export const fetchLibraryPage = cache(async (uid: string): Promise<{ items: LibraryItem[] }> => {
  const supabase = await getServerSupabase();

  // Lazy tombstone sweep (Q6) — hard-delete rows past the 5s undo window.
  // `.select()` at the end is REQUIRED by supabase-js to actually execute
  // the DELETE; without it the builder is never awaited.
  const sweepCutoff = new Date(Date.now() - 5_000).toISOString();
  await supabase
    .from('food_library_items')
    .delete()
    .eq('user_id', uid)
    .not('deleted_at', 'is', null)
    .lt('deleted_at', sweepCutoff)
    .select('id');

  const { data, error } = await supabase
    .from('food_library_items')
    .select(
      'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at',
    )
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`library_fetch_failed: ${error.message}`);
  }
  return { items: (data ?? []) as LibraryItem[] };
});
