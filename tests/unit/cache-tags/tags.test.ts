/**
 * Unit test for `lib/cache/tags.ts` typed TAGS factory (Task 1.3 AC; I12).
 *
 * Canonical shape per architecture.md §7.1:
 *   - userEntries(uid, day)    → `user:${uid}:entries:${day}`
 *   - userLibrary(uid)         → `user:${uid}:library`
 *   - profile(uid)             → `user:${uid}:profile`
 *   - weeklyReview(uid, week)  → `user:${uid}:weekly-review:${week}`
 *   - userProgress(uid, range) → `user:${uid}:progress:${range}`
 *     where range ∈ '7d' | '30d' | '90d' | '1y'
 *
 * Every tag must begin `user:${uid}:` — user-scoped invalidation is the point
 * of the `lib/cache/tags.ts` module. A tag that forgot the `user:` prefix
 * would leak cached data between users after Task 3.1 lands.
 */
import { describe, expect, it } from 'vitest';

import { TAGS, type CacheTagKey } from '@/lib/cache/tags';

describe('lib/cache/tags', () => {
  it('userEntries returns the canonical per-user-per-day tag', () => {
    expect(TAGS.userEntries('user-1', '2026-04-20')).toBe('user:user-1:entries:2026-04-20');
  });

  it('userLibrary returns the canonical per-user library tag', () => {
    expect(TAGS.userLibrary('user-2')).toBe('user:user-2:library');
  });

  it('profile returns the canonical per-user profile tag', () => {
    expect(TAGS.profile('user-3')).toBe('user:user-3:profile');
  });

  it('weeklyReview returns the canonical per-user per-week-start tag', () => {
    expect(TAGS.weeklyReview('user-4', '2026-04-20')).toBe('user:user-4:weekly-review:2026-04-20');
  });

  it('userProgress returns the canonical per-user per-range tag for each allowed range', () => {
    // Task 4.3a: union extended with '24h' | 'D' so D-range caches can key
    // independently from W/M. The UI renders 3 chips (D/W/M); aggregation
    // layer maps D→24h at the tag call site.
    expect(TAGS.userProgress('user-5', '24h')).toBe('user:user-5:progress:24h');
    expect(TAGS.userProgress('user-5', 'D')).toBe('user:user-5:progress:D');
    expect(TAGS.userProgress('user-5', '7d')).toBe('user:user-5:progress:7d');
    expect(TAGS.userProgress('user-5', '30d')).toBe('user:user-5:progress:30d');
    expect(TAGS.userProgress('user-5', '90d')).toBe('user:user-5:progress:90d');
    expect(TAGS.userProgress('user-5', '1y')).toBe('user:user-5:progress:1y');
  });

  it('every factory produces a tag that begins `user:${uid}:` (user-scoped invalidation)', () => {
    const uid = 'abc123';
    const samples = [
      TAGS.userEntries(uid, '2026-04-20'),
      TAGS.userLibrary(uid),
      TAGS.profile(uid),
      TAGS.weeklyReview(uid, '2026-04-20'),
      TAGS.userProgress(uid, '7d'),
    ];
    for (const tag of samples) {
      expect(tag).toMatch(new RegExp(`^user:${uid}:`));
    }
  });

  it('exposes a CacheTagKey type that enumerates every factory name', () => {
    // Compile-time assertion — the type must be a union of the factory keys.
    // We exercise it at runtime by iterating the actual keys.
    const keys: CacheTagKey[] = [
      'userEntries',
      'userLibrary',
      'profile',
      'weeklyReview',
      'userProgress',
    ];
    for (const key of keys) {
      expect(TAGS).toHaveProperty(key);
      expect(typeof TAGS[key]).toBe('function');
    }
  });
});
