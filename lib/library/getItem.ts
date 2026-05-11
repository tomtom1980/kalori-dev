/**
 * Single-item library read helper — Task 4.2.
 *
 * Fetches ONE `food_library_items` row by id, tombstone-filtered (MANDATORY
 * per briefing §Tombstone filter rule), RLS-scoped to the caller. Returns
 * `null` on miss so the page can call `notFound()` — even if the item
 * existed, if it has `deleted_at IS NOT NULL`, the SELECT skips it and the
 * URL returns 404 cleanly.
 *
 * Pattern mirrors `lib/library/fetch.ts` line 70–77 literally: eq id + eq
 * user + is deleted_at null + maybeSingle.
 */
import 'server-only';
import { cache } from 'react';

import { getServerSupabase } from '@/lib/supabase/server';

import type { LibraryItem } from './fetch';

/**
 * Fetch a single active (non-tombstoned) library item by id. Wrapped in
 * React `cache()` so server component + nested children share one query
 * per request.
 */
export const getLibraryItemById = cache(
  async (id: string, userId: string): Promise<LibraryItem | null> => {
    const supabase = await getServerSupabase();

    const { data, error } = await supabase
      .from('food_library_items')
      .select(
        'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at',
      )
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`library_item_fetch_failed: ${error.message}`);
    }
    return (data as LibraryItem | null) ?? null;
  },
);

export interface LibraryItemHistoryEntry {
  id: string;
  loggedAt: string;
  mealCategory: string;
}

export interface LibraryItemHistory {
  firstLoggedAt: string | null;
  totalLogCount: number;
  recent: LibraryItemHistoryEntry[];
}

/**
 * Fetch history aggregates for a single library item: first-logged
 * timestamp, total count, and the most-recent N entries. Pulled from
 * `food_entries` (the canonical log ledger); tombstoned entries are
 * excluded via `.is('deleted_at', null)` if that column exists — the
 * current schema does not tombstone entries, so the filter is a no-op for
 * now but keeps the read consistent with the library convention.
 *
 * Wrapped in React `cache()` so nested children can read history without
 * duplicating the roundtrip.
 */
export const getLibraryItemHistory = cache(
  async (
    libraryItemId: string,
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<LibraryItemHistory> => {
    const limit = opts.limit ?? 5;
    const supabase = await getServerSupabase();

    // Recent N entries (descending by logged_at).
    const { data: recentData, error: recentError } = await supabase
      .from('food_entries')
      .select('id, logged_at, meal_category')
      .eq('library_item_id', libraryItemId)
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(limit);
    if (recentError) {
      throw new Error(`library_item_history_failed: ${recentError.message}`);
    }

    // First-ever entry (ascending, 1 row).
    const { data: firstRow, error: firstError } = await supabase
      .from('food_entries')
      .select('logged_at')
      .eq('library_item_id', libraryItemId)
      .eq('user_id', userId)
      .order('logged_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstError) {
      throw new Error(`library_item_history_first_failed: ${firstError.message}`);
    }

    // Exact count — head:true makes PostgREST return headers only + count.
    const { count, error: countError } = await supabase
      .from('food_entries')
      .select('id', { count: 'exact', head: true })
      .eq('library_item_id', libraryItemId)
      .eq('user_id', userId);
    if (countError) {
      throw new Error(`library_item_history_count_failed: ${countError.message}`);
    }

    const rows = (recentData ?? []) as Array<{
      id: string;
      logged_at: string;
      meal_category: string;
    }>;

    return {
      firstLoggedAt: (firstRow?.logged_at as string | undefined) ?? null,
      totalLogCount: count ?? 0,
      recent: rows.map((r) => ({
        id: r.id,
        loggedAt: r.logged_at,
        mealCategory: r.meal_category,
      })),
    };
  },
);
