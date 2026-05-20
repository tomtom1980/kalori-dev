/**
 * Task C.2 (US-STAB-C2) AC1 — Recent Entries section data source.
 *
 * Returns the user's most-recent `food_entries` rows (capped + windowed)
 * for the new "Recent Entries" section on `/library`. Mirrors the pattern
 * used by `lib/library/fetch.ts` (RLS-scoped, server-only, `cache()`-
 * wrapped for per-request dedup).
 *
 * Public return shape — consumed directly by `<RecentEntriesSection />`
 * as a `ReadonlyArray<RecentEntry>` (no wrapper object — soft-fail
 * returns `[]` and the component renders the empty state).
 *
 * Contract (briefing §"Files NEW" + UI fragment recent-entries-section.md):
 *
 *   - Last-N rows by `logged_at DESC` (default `maxRows = 20`, capped via
 *     PostgREST `.range(0, maxRows-1)` per lesson #5 — `.select('*')`
 *     truncates at 1000 without warning).
 *   - Configurable window via `windowDays` option (default 14).
 *   - RLS-scoped: caller passes `userId`, helper enforces
 *     `.eq('user_id', userId)` defense-in-depth.
 *   - **Soft-fail:** on Supabase error, returns `[]`. The Supabase error
 *     itself is captured via `Sentry.captureException` BEFORE returning
 *     so the outage is distinguishable from a genuine empty state in
 *     production (Codex R1 Finding 4 fix — PostgREST errors are resolved
 *     values, not thrown exceptions, so auto-instrumentation does NOT see
 *     this path; the comment about middleware-level capture was wrong).
 *     The frontend `errored` prop on `<RecentEntriesSection />` remains a
 *     followup (F-C2-FRONTEND-BACKEND-CONTRACT-RECONCILE) — for now the
 *     return shape is unchanged (`RecentEntry[]`) so the contract holds.
 */
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { cache } from 'react';

import { getServerSupabase } from '@/lib/supabase/server';

export interface RecentEntry {
  /** PK of the food_entries row — React key + future drill-in. */
  entry_id: string;
  /** Display name of the food (from items[0].name). */
  food_name: string;
  /** kcal of the first item — right-rail value. */
  calories: number;
  /** UTC ISO timestamp the user logged at. */
  logged_at: string;
  /** Meal slot — mirrors the food_entries.meal_category CHECK enum (0003 line 91). */
  meal_category: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  /** Source enum (text/photo/library/manual) mirrored from food_entries.source. */
  source: 'text' | 'photo' | 'library' | 'manual';
  /** Library item FK (nullable — ON DELETE SET NULL). */
  library_item_id: string | null;
  /** Pre-formatted portion + unit string for the secondary label (e.g. "400 g"). */
  portion_label: string;
}

export interface FetchRecentEntriesOptions {
  /** Max rows to return. Default 20 (Ledger UI cap per ui-design.md §7.3). */
  maxRows?: number;
  /** Window in days. Default 14. */
  windowDays?: number;
}

const DEFAULT_MAX_ROWS = 20;
const DEFAULT_WINDOW_DAYS = 14;

interface RawEntryItem {
  name?: unknown;
  kcal?: unknown;
  portion?: unknown;
  unit?: unknown;
}

interface RawEntryRow {
  id?: unknown;
  logged_at?: unknown;
  meal_category?: unknown;
  source?: unknown;
  library_item_id?: unknown;
  items?: unknown;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function mapRow(row: RawEntryRow): RecentEntry | null {
  const id = asString(row.id);
  const loggedAt = asString(row.logged_at);
  if (!id || !loggedAt) return null;

  const items = Array.isArray(row.items) ? (row.items as RawEntryItem[]) : [];
  const first = items[0] ?? {};
  const foodName = asString(first.name, '(unnamed)');
  const kcal = asNumber(first.kcal);
  const portion = asNumber(first.portion);
  const unit = asString(first.unit);
  const portionLabel = portion > 0 ? `${portion} ${unit}`.trim() : unit;

  const meal = asString(row.meal_category, 'snack');
  const validMeal: RecentEntry['meal_category'] =
    meal === 'breakfast' || meal === 'lunch' || meal === 'dinner' || meal === 'drink'
      ? meal
      : 'snack';

  const src = asString(row.source, 'manual');
  const validSrc: RecentEntry['source'] =
    src === 'text' || src === 'photo' || src === 'library' ? src : 'manual';

  return {
    entry_id: id,
    food_name: foodName,
    calories: kcal,
    logged_at: loggedAt,
    meal_category: validMeal,
    source: validSrc,
    library_item_id: typeof row.library_item_id === 'string' ? row.library_item_id : null,
    portion_label: portionLabel,
  };
}

/**
 * Fetch the user's most-recent `food_entries` rows for the Recent Entries
 * section. Wrapped in React `cache()` for per-request dedup (matches
 * `lib/library/fetch.ts` pattern).
 *
 * Soft-fail on Supabase error → returns `[]` (caller renders empty state).
 */
export const fetchRecentEntries = cache(
  async (userId: string, opts: FetchRecentEntriesOptions = {}): Promise<RecentEntry[]> => {
    const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
    const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
    const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const supabase = await getServerSupabase();
    const result = (await supabase
      .from('food_entries')
      .select('id, logged_at, meal_category, source, library_item_id, items')
      .eq('user_id', userId)
      .gte('logged_at', cutoffIso)
      .order('logged_at', { ascending: false })
      .range(0, Math.max(0, maxRows - 1))) as {
      data: unknown;
      error: unknown;
    };

    if (result.error || !Array.isArray(result.data)) {
      // Codex R1 Finding 4 fix — capture the Supabase resolved-error BEFORE
      // returning the empty fallback so an RLS/schema/outage regression is
      // distinguishable from "no recent logs" in Sentry. The data === null
      // && error === null branch (PostgREST malformed response) is also
      // captured as a synthetic error so the operator sees the protocol blip.
      const err =
        result.error ?? new Error('fetchRecentEntries: non-array data with no Supabase error');
      Sentry.captureException(err, {
        tags: { component: 'fetch-recent-entries', scope: 'supabase_query' },
        extra: { userId, maxRows, windowDays, cutoffIso },
      });
      return [];
    }

    const rows = result.data as RawEntryRow[];
    return rows.map(mapRow).filter((r): r is RecentEntry => r !== null);
  },
);
