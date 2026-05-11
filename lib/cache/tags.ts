/**
 * Typed cache-tag constants — canonical shape per architecture.md §7.1
 * (Task 1.3; invariant I12 load-bearing).
 *
 * Every `cacheTag(...)` / `updateTag(...)` call in the app MUST route its tag
 * through one of these factories. Direct string-literal arguments are
 * forbidden by the `kalori/no-inline-cache-tags` ESLint rule — typos like
 * `'entries'` vs `'entry'` are silent in Next.js Cache Components (they
 * produce a tag the cache system accepts without warning yet never matches
 * any write-side `updateTag`), so constant-based enforcement eliminates the
 * entire class of bug at lint time.
 *
 * Shape rules:
 *   - Every tag begins `user:${uid}:` — user-scoped invalidation is the
 *     point of the module. A missing `user:` prefix would leak cached data
 *     across users once Task 3.1 lands the real DB writes.
 *   - `day` is `YYYY-MM-DD` in the user's timezone (resolved server-side
 *     before tagging — NOT the raw UTC date).
 *   - `weekStartOn` is `YYYY-MM-DD` of the Monday of the user's timezone week.
 *   - `range` is strictly `'24h' | 'D' | '7d' | '30d' | '90d' | '1y'` — a TS
 *     literal-type union guards against typos at compile time. Task 4.3a
 *     extended this union with `'24h' | 'D'` so the D-range progress chart
 *     (rolling 24h from most recent user-TZ midnight) can key caches
 *     independently from W (7d rolling) and M (30d rolling). The UI control
 *     renders only 3 chips (D/W/M); the aggregation-call boundary maps
 *     D→'24h' at runtime. `'90d' | '1y'` stay for future range expansion.
 */
export const TAGS = {
  userEntries: (uid: string, day: string) => `user:${uid}:entries:${day}` as const,
  userLibrary: (uid: string) => `user:${uid}:library` as const,
  profile: (uid: string) => `user:${uid}:profile` as const,
  weeklyReview: (uid: string, weekStartOn: string) =>
    `user:${uid}:weekly-review:${weekStartOn}` as const,
  userProgress: (uid: string, range: '24h' | 'D' | '7d' | '30d' | '90d' | '1y') =>
    `user:${uid}:progress:${range}` as const,
} as const;

export type CacheTagKey = keyof typeof TAGS;
