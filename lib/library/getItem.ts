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

import { signThumbnailUrl } from '@/lib/storage/sign-thumbnail';
import { getServerSupabase } from '@/lib/supabase/server';

import type { LibraryItem } from './fetch';

function portionFallbackFromEntryItems(items: unknown): {
  default_portion: number | null;
  default_unit: string | null;
} | null {
  if (!Array.isArray(items)) return null;
  const first = items[0];
  if (!first || typeof first !== 'object') return null;
  const portion = (first as { portion?: unknown }).portion;
  const unit = (first as { unit?: unknown }).unit;
  const defaultPortion = typeof portion === 'number' && Number.isFinite(portion) ? portion : null;
  const defaultUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : null;
  if (defaultPortion === null && defaultUnit === null) return null;
  return { default_portion: defaultPortion, default_unit: defaultUnit };
}

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
        'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, thumbnail_kind, recipe_eligibility, recipe_eligibility_reason, recipe_eligibility_checked_at, log_count, last_used_at, user_edited_flag, created_from, created_at',
      )
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`library_item_fetch_failed: ${error.message}`);
    }
    const row = (data as LibraryItem | null) ?? null;
    if (!row) return null;

    let hydratedRow = row;
    if (row.default_portion === null || row.default_unit === null) {
      const { data: entry } = (await supabase
        .from('food_entries')
        .select('items')
        .eq('library_item_id', id)
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as { data: { items?: unknown } | null };
      const fallback = portionFallbackFromEntryItems(entry?.items);
      if (fallback) {
        hydratedRow = {
          ...row,
          default_portion: row.default_portion ?? fallback.default_portion,
          default_unit: row.default_unit ?? fallback.default_unit,
        };
      }
    }

    // Codex Round 1 Critical #1 — sign-on-read for the single-item
    // detail page. Sketch rows store the storage path in
    // `thumbnail_url`; the renderer needs a signed URL with a short
    // TTL.
    if (hydratedRow.thumbnail_url) {
      const signed = await signThumbnailUrl(hydratedRow.thumbnail_url, supabase);
      return { ...hydratedRow, thumbnail_url: signed };
    }
    return hydratedRow;
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

    // Bug 1 (library detail false "Never logged") — totalLogCount is now
    // read from the canonical `food_library_items.log_count` column, NOT
    // from a `COUNT(food_entries WHERE library_item_id=id)` query. Some
    // save paths bump `log_count` without populating
    // `food_entries.library_item_id`, leaving the FK-based count at 0
    // while the library list (which reads `log_count`) correctly shows
    // the item as logged. Sourcing both surfaces from the same column
    // eliminates the divergence.
    //
    // `recent` and `firstLoggedAt` continue to walk `food_entries` — they
    // produce useful (if incomplete) data and degrade gracefully when an
    // entry lacks the FK.
    const { data: libRow, error: libErr } = await supabase
      .from('food_library_items')
      .select('log_count')
      .eq('id', libraryItemId)
      .eq('user_id', userId)
      .maybeSingle();
    if (libErr) {
      throw new Error(`library_item_history_count_failed: ${libErr.message}`);
    }

    const rows = (recentData ?? []) as Array<{
      id: string;
      logged_at: string;
      meal_category: string;
    }>;

    return {
      firstLoggedAt: (firstRow?.logged_at as string | undefined) ?? null,
      totalLogCount: (libRow?.log_count as number | undefined) ?? 0,
      recent: rows.map((r) => ({
        id: r.id,
        loggedAt: r.logged_at,
        mealCategory: r.meal_category,
      })),
    };
  },
);
