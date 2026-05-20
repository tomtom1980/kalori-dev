/**
 * `lib/aggregations/progress-fetch.ts` — Task 4.3a server-side progress reader.
 *
 * Fetches `food_entries` rows for the user + user-TZ-bucketed range, then
 * delegates to the pure aggregator.
 *
 * Caching (Task 4.3a R2 — 2026-04-24, Codex Round 1 C-1 fix):
 *
 *   Previously this file nested `unstable_cache(...)` around the snapshot
 *   builder with `TAGS.userProgress(uid, tag)` tags for cross-request
 *   eviction. That closure ultimately reaches `getServerSupabase()` which
 *   calls `cookies()` — Next.js 16 hard-errors:
 *     > Route /progress used cookies() inside a function cached with
 *     > unstable_cache(). Accessing Dynamic data sources inside a cache
 *     > scope is not supported.
 *   Precedent: `lib/dashboard/fetch.ts` #L7–L20 removed `unstable_cache`
 *   for the exact same reason after Task 3.7 hit this in production.
 *
 *   Current strategy: React `cache()` ONLY. Dedupes the five chart
 *   Suspense boundaries' reads within a single request; no cross-request
 *   layer. Mutation routes (`entries/save`, `entries/[id]`,
 *   `copy-yesterday`, `library/merge`) still call
 *   `revalidateTag(TAGS.userProgress(uid, …))` — those calls are kept
 *   for forward compatibility with the eventual `cacheComponents: true`
 *   flip which uses `'use cache'` + `cacheTag` primitives that CAN coexist
 *   with request-scoped reads. Until that flip lands the
 *   `revalidateTag` calls are effectively no-ops for /progress and
 *   that's acceptable — the /progress route is already dynamic per
 *   user and re-renders on every request.
 *
 * R1 / RLS — reads go through the cookie-bound anon client
 * (`getServerSupabase`). Service role is NEVER imported here; architecture
 * invariant I1 holds. Tombstone contract is upheld at the aggregator level
 * via the `food_entries.items[]` snapshot (no join to `food_library_items`).
 *
 * Invariant (Codex R1 C-1): the RLS scope is enforced two ways — (a)
 * cookie-bound client means `supabase.auth.getUser()` is the authoritative
 * source of userId in the page RSC (the userId passed into
 * `fetchProgressSnapshot` is derived from that call, never from request
 * body), and (b) the SELECT is `.eq('user_id', userId)` which combines
 * with RLS policy `auth.uid() = user_id` to make a forged userId
 * categorically unable to leak cross-user data.
 */
import 'server-only';
import { cache } from 'react';

import { getServerSupabase } from '@/lib/supabase/server';

import {
  aggregateProgress,
  computeWindow,
  type AggregateProgressInput,
  type FoodEntryRow,
  type ProgressAggregate,
  type ProgressProfile,
  type ProgressRange,
} from './progress';

export type { ProgressRange } from './progress';

/**
 * Map D/W/M UI range → TAGS.userProgress tag value. D is tagged '24h' so
 * the cache key can evict independently of 7d / 30d tags.
 *
 * Kept as a public export: mutation route handlers still call
 * `revalidateTag(TAGS.userProgress(uid, rangeToTag(range)))` for forward
 * compatibility with the `cacheComponents: true` flip (see file header).
 */
export function rangeToTag(range: ProgressRange): '24h' | '7d' | '30d' {
  if (range === 'D') return '24h';
  if (range === 'W') return '7d';
  if (range === 'last_7' || typeof range === 'object') return '7d';
  return '30d';
}

/** Fetch raw food_entries rows for the progress window. */
async function fetchProgressEntriesUncached(
  userId: string,
  range: ProgressRange,
  tz: string,
  nowIso: string,
): Promise<readonly FoodEntryRow[]> {
  const win = computeWindow(range, nowIso, tz);
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('food_entries')
    .select('id, logged_at, meal_category, library_item_id, items')
    .eq('user_id', userId)
    .gte('logged_at', win.startUtc)
    .lte('logged_at', win.endUtc);
  if (error) {
    throw new Error(`progress_entries_fetch_failed: ${error.message}`);
  }
  return (data ?? []) as FoodEntryRow[];
}

export const fetchProgressEntries = cache(fetchProgressEntriesUncached);

/**
 * Build the progress snapshot — pure aggregation over fetched rows.
 * Pulled out of `fetchProgressSnapshot` so `unstable_cache` wraps a
 * well-typed serializable function.
 */
async function buildProgressSnapshot(
  userId: string,
  range: ProgressRange,
  profile: ProgressProfile,
  tz: string,
  nowIso: string,
): Promise<ProgressAggregate> {
  const entries = await fetchProgressEntriesUncached(userId, range, tz, nowIso);
  const input: AggregateProgressInput = {
    range,
    now: nowIso,
    tz,
    profile,
    entries,
  };
  return aggregateProgress(input);
}

/**
 * Compose aggregate + entries fetch + profile lookup into a single snapshot
 * per (user, range). Called from each chart RSC wrapper.
 *
 * React `cache()` only (see file header). The five chart Suspense
 * boundaries all call this with the same `(userId, range, profile, tz,
 * nowIso)` tuple per render, so React `cache()` collapses them to a
 * single Supabase call within the request scope.
 */
export const fetchProgressSnapshot = cache(
  async (
    userId: string,
    range: ProgressRange,
    profile: ProgressProfile,
    tz: string,
    nowIso: string,
  ): Promise<ProgressAggregate> => {
    return buildProgressSnapshot(userId, range, profile, tz, nowIso);
  },
);
