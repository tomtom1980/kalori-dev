/**
 * `lib/dashboard/fetch.ts` — Task 3.5 server-side data readers.
 *
 * Each fetch is wrapped in React `cache()` for per-request dedupe so the
 * same query is not issued twice when islands read in parallel.
 *
 * Task 3.7 regression fix — the previous revision nested
 * `unstable_cache(...)` inside each reader to wire cross-request cache-tag
 * invalidation for writers' `revalidateTag(...)` calls (F-UI-3.6-C-3).
 * That implementation called `getServerSupabase()` inside the cache lambda,
 * which calls `cookies()`. Next.js 16 hard-errors:
 *   > Route /dashboard used cookies() inside a function cached with
 *   > unstable_cache(). Accessing Dynamic data sources inside a cache
 *   > scope is not supported.
 * The `unstable_cache` wrappers have been removed so the readers only
 * dedupe per-request via React `cache()`. Cross-request cache-tag
 * invalidation is deferred to the `cacheComponents: true` migration
 * (F-UI-3.5-10) where `'use cache'` + `cacheTag(...)` are the idiomatic
 * primitives and per-request context is hoisted by the framework. See
 * `Planning/followups.md` F-UI-3.6-C-3 for the status of the deferred
 * reader-writer tag round-trip.
 *
 * R1: zero raw `fetch(` — data comes through the Supabase SSR client. F5:
 * day boundary derived from `userTzDayUtcRange` in user-TZ.
 */
import 'server-only';
import { cache } from 'react';

import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayUtcRange, userTzDayFrom } from '@/lib/time/day';

import { aggregateDay } from './aggregate';
import type {
  AlcoholLogEntry,
  DashboardSnapshot,
  FoodEntry,
  Profile,
  WaterLogEntry,
} from './types';

export const fetchProfile = cache(async (uid: string): Promise<Profile> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, calorie_target, bmr, tdee, bio_sex, current_weight_kg, timezone, created_at, last_dashboard_visit_at, target_mode, manual_override_value',
    )
    .eq('id', uid)
    .single();
  if (error || !data) {
    throw new Error('profile_fetch_failed');
  }
  return data as Profile;
});

export const fetchTodayEntries = cache(
  async (uid: string, day: string, tz: string): Promise<FoodEntry[]> => {
    const { startUtc, endUtc } = userTzDayUtcRange(day, tz);
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from('food_entries')
      .select(
        'id, client_id, logged_at, meal_category, source, library_item_id, items, ai_reasoning',
      )
      .eq('user_id', uid)
      .gte('logged_at', startUtc)
      .lt('logged_at', endUtc)
      .order('logged_at', { ascending: true });
    if (error) throw new Error('entries_fetch_failed');
    return (data ?? []) as FoodEntry[];
  },
);

export const fetchAlcoholLogs = cache(
  async (uid: string, asOf: string): Promise<AlcoholLogEntry[]> => {
    const asOfDate = new Date(asOf);
    const startUtc = new Date(asOfDate.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from('alcohol_logs')
      .select(
        'id, user_id, entry_id, volume_ml, abv_percent, alcohol_grams, consumed_at, created_at',
      )
      .eq('user_id', uid)
      .gte('consumed_at', startUtc)
      .lte('consumed_at', asOf)
      .order('consumed_at', { ascending: true });
    if (error) throw new Error('alcohol_fetch_failed');
    return (data ?? []) as AlcoholLogEntry[];
  },
);

export const fetchTodayWater = cache(async (uid: string, day: string): Promise<WaterLogEntry[]> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('water_log')
    .select('id, client_id, date, count, unit')
    .eq('user_id', uid)
    .eq('date', day)
    .order('id', { ascending: true });
  if (error) throw new Error('water_fetch_failed');
  return (data ?? []) as WaterLogEntry[];
});

export const fetchMicros7d = cache(
  async (uid: string, todayIso: string, tz: string): Promise<FoodEntry[]> => {
    const today = userTzDayFrom(todayIso, tz);
    // 7-day calendar window inclusive of the user's current day.
    //
    // F-UI-3.6-C-2 (I5 fix): the upper bound is the user-TZ NEXT-midnight,
    // derived from `userTzDayUtcRange(today, tz).endUtc` — NOT
    // `todayStartUtc + 24h`. On DST transitions the local day spans 23h
    // (spring-forward) or 25h (fall-back), so a naive 24h stride would
    // either miss the last hour of the user's day or bleed into the next.
    // Matches the pattern used by `fetchTodayEntries`.
    const { endUtc: dayEndUtc } = userTzDayUtcRange(today, tz);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const startUtc = new Date(new Date(dayEndUtc).getTime() - sevenDaysMs).toISOString();
    const endUtc = dayEndUtc;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from('food_entries')
      .select('items, logged_at')
      .eq('user_id', uid)
      .gte('logged_at', startUtc)
      .lt('logged_at', endUtc);
    if (error) throw new Error('micros_fetch_failed');
    return (data ?? []) as FoodEntry[];
  },
);

/**
 * Orchestrator: runs the three day-scoped fetches in parallel and passes
 * them into `aggregateDay`. The profile is read separately so the caller
 * can use it for auth-gated branches (first-visit banner, masthead edition
 * number) before awaiting the day snapshot.
 */
export async function fetchDaySnapshot(
  uid: string,
  profile: Profile,
  day: string,
  tz: string,
  now: string,
): Promise<DashboardSnapshot> {
  const [entries, water, micros7d, alcoholLogs] = await Promise.all([
    fetchTodayEntries(uid, day, tz),
    fetchTodayWater(uid, day),
    fetchMicros7d(uid, now, tz),
    fetchAlcoholLogs(uid, now),
  ]);
  return aggregateDay({
    entries,
    water,
    micros7d,
    alcoholLogs,
    profile,
    day,
    tz,
    now,
  });
}
