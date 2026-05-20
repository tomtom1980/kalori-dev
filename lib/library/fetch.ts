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
 *
 * **Codex Round 2 R2-I1 (Round 3 fix) — pagination-aware signing.**
 * Round-1 signed every row's thumbnail via `Promise.all` BEFORE returning
 * to the RSC. A 100-item library produces 100 sequential-fanout
 * `createSignedUrl` calls per `/library` render, even though the client
 * paginates to 10 items per page. The fix bounds the signing fan-out to
 * `SIGN_LIMIT` rows; rows beyond that have their `thumbnail_url` set to
 * null so the letter-mark fallback renders.
 *
 * **Bug 3 (library overhaul 2026-05-16) — cap raised to 500.**
 * The original Round-3 cap of 10 matched `LIBRARY_PAGE_SIZE` and accepted
 * a documented UX regression: "pages 2+ of a large library show
 * letter-mark thumbnails instead of full sketches". The client-side
 * filter/sort/search operates on the full row set though, so e.g. an
 * alphabetic sort shifts items to indices 11+ even on visual page 1 —
 * losing thumbnails despite being above the fold. Raised to 500 to cover
 * a multi-year single-user library comfortably. Per-render cost is
 * bounded: `createSignedUrl` is JWT-sign-only (no Supabase roundtrip; the
 * URL is signed locally with the project signing key), so 500 signs ≈
 * <250ms total. The 1-hour signed-URL TTL from `architecture.md §4.2` is
 * preserved unchanged.
 */
import 'server-only';
import { cache } from 'react';

import { signThumbnailUrlBatch } from '@/lib/storage/sign-thumbnail';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * Max number of thumbnail paths to sign per RSC render. Bug 3 (library
 * overhaul 2026-05-16) raised this from 10 to 500 so that
 * client-side-sorted views (e.g. alphabetic) keep their thumbnails
 * visible past the first page. Rows beyond this index get
 * `thumbnail_url` null'd-out and fall back to the letter-mark renderer.
 * See the comment block at the top of this file for the cost rationale.
 */
const SIGN_LIMIT = 500;

export interface LibraryItem {
  id: string;
  client_id: string;
  display_name: string;
  normalized_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: {
    kcal: number;
    // Phase 2C — `cholesterol_mg` is the 5th tracked macro (unit: mg).
    // Optional for back-compat with legacy rows; consumers default
    // missing values to 0 at the boundary.
    macros?: {
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      fiber_g?: number;
      cholesterol_mg?: number;
    };
    micros?: Record<string, number>;
    approxGrams?: number;
  };
  thumbnail_url: string | null;
  // Bug 5 (library overhaul 2026-05-16) — discriminator for the
  // thumbnail kind. `'photo'` = vision-uploaded; `'sketch'` =
  // Gemini-generated; `null` = no thumbnail (letter-mark fallback).
  // Optional for backward-compat with existing fixtures that pre-date
  // migration 0021.
  thumbnail_kind?: 'photo' | 'sketch' | null;
  recipe_eligibility?: 'eligible' | 'ineligible' | 'unknown';
  recipe_eligibility_reason?: string | null;
  recipe_eligibility_checked_at?: string | null;
  log_count: number;
  last_used_at: string | null;
  user_edited_flag: boolean;
  // Bug 6 (library overhaul 2026-05-16) — `'manual'` widens the union to
  // match the database CHECK constraint after migration 0021. Manually
  // created rows (no entry attached) carry this discriminator.
  created_from: 'text' | 'photo' | 'manual';
  created_at: string;
}

// Pending-sketch helpers live in `./sketch-pending` (isomorphic — this
// module imports `server-only` and can't be reached from the browser).
export { PENDING_SKETCH_WINDOW_MS, isItemPendingSketch } from './sketch-pending';

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
      'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, thumbnail_kind, recipe_eligibility, recipe_eligibility_reason, recipe_eligibility_checked_at, log_count, last_used_at, user_edited_flag, created_from, created_at',
    )
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`library_fetch_failed: ${error.message}`);
  }

  const rows = (data ?? []) as LibraryItem[];

  // Codex Round 1 Critical #1 — sign-on-read for sketch thumbnails.
  // Sketch rows now persist the storage path (not a signed URL) in
  // `thumbnail_url`. Sign each path with a 1-hour TTL before returning
  // to the client island. Legacy URLs (pre-fix rows that may still
  // have full URLs) pass through unchanged. Photo rows store a real
  // path too (when a photo-upload path threads one in) and follow the
  // same sign-on-read flow.
  //
  // Codex Round 2 R2-I1 (Round 3 fix) — bound the signing fan-out to
  // SIGN_LIMIT rows. Rows beyond that have `thumbnail_url` null'd out
  // so the letter-mark fallback renders. SQL already orders by
  // `last_used_at DESC NULLS LAST`, so the first SIGN_LIMIT rows are
  // the most-likely-visible ones (page 1 of the client-side paginator).
  //
  // Why null-out the path: `<Image src={thumbnail_url}>` in LibraryCard
  // calls `next/image` which validates URLs against `remotePatterns` in
  // `next.config.ts` — a bare storage path would fail validation and
  // throw. Setting null lets the existing `thumbnail_url ? <Image /> :
  // <ThumbnailLetterMark />` branch take the fallback cleanly.
  //
  // Bugfix R1 C2 — replaced bare `Promise.all` (unbounded fan-out up to
  // 500 concurrent signing calls) with `signThumbnailUrlBatch` which
  // caps in-flight signs at 20. Per-row signing failure degrades to
  // `thumbnail_url: null` rather than crashing the whole page render.
  const cappedRows = rows.slice(0, SIGN_LIMIT);
  const overflowRows = rows.slice(SIGN_LIMIT);
  const cappedPaths = cappedRows.map((r) => r.thumbnail_url);
  const signed = await signThumbnailUrlBatch(cappedPaths, supabase);
  const cappedItems = cappedRows.map((row, idx) => ({
    ...row,
    thumbnail_url: row.thumbnail_url ? signed[idx]! : null,
  }));
  const overflowItems = overflowRows.map((row) => ({ ...row, thumbnail_url: null }));
  const items = [...cappedItems, ...overflowItems];

  return { items };
});
