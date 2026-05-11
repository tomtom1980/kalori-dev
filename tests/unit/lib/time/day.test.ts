/**
 * Task 3.4 — `lib/time/day.ts` unit tests.
 *
 * Contract (synthesis §3.2 + briefing §5 Cache-tag invariant):
 *   - `userTzDayFrom(iso, tz)` → 'YYYY-MM-DD' in IANA tz `tz` derived from
 *     UTC ISO string `iso`.
 *   - `userTzToday(tz)` → 'YYYY-MM-DD' for today in `tz`.
 *   - `userTzNowIso(tz)` → UTC ISO string for "now", but the caller should
 *     assume the epoch hasn't shifted between call and use.
 *
 * The 3AM bucket hazard (F6 per design-doc §18.3): the ENTRY's logged_at
 * determines which day-bucket tag fires; we must resolve that in user TZ,
 * NOT UTC.
 */
import { describe, expect, it } from 'vitest';

import { userTzDayFrom, userTzToday, userTzNowIso, userTzYesterdayUtcRange } from '@/lib/time/day';

describe('userTzDayFrom', () => {
  it('returns YYYY-MM-DD in user TZ from UTC ISO', () => {
    // 2026-04-20 17:00 UTC = 2026-04-21 00:00 Asia/Ho_Chi_Minh
    expect(userTzDayFrom('2026-04-20T17:00:00.000Z', 'Asia/Ho_Chi_Minh')).toBe('2026-04-21');
  });

  it('handles UTC TZ identity case', () => {
    expect(userTzDayFrom('2026-04-20T17:00:00.000Z', 'UTC')).toBe('2026-04-20');
  });

  it('handles west-of-UTC crossing midnight', () => {
    // 2026-04-21 03:00 UTC = 2026-04-20 23:00 America/New_York (EDT, UTC-4)
    expect(userTzDayFrom('2026-04-21T03:00:00.000Z', 'America/New_York')).toBe('2026-04-20');
  });

  it('produces zero-padded month + day', () => {
    expect(userTzDayFrom('2026-01-03T00:00:00.000Z', 'UTC')).toBe('2026-01-03');
  });
});

describe('userTzToday', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const today = userTzToday('Asia/Ho_Chi_Minh');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('userTzNowIso', () => {
  it('returns an ISO UTC string', () => {
    const iso = userTzNowIso('Asia/Ho_Chi_Minh');
    // ISO UTC always ends with Z and has T separator.
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('derives user-TZ day via userTzDayFrom', () => {
    const iso = userTzNowIso('UTC');
    // Round-trip: the ISO should map back to a valid YYYY-MM-DD in UTC.
    const day = userTzDayFrom(iso, 'UTC');
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('userTzYesterdayUtcRange', () => {
  it('produces a UTC range that only contains the target user-TZ calendar day', () => {
    const { startUtc, endUtc, targetDay } = userTzYesterdayUtcRange(
      '2026-04-21',
      'Asia/Ho_Chi_Minh',
    );
    expect(targetDay).toBe('2026-04-20');
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    // Range length is ~24h (allowing 1h for hourly-scan granularity).
    expect(endMs - startMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(endMs - startMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    // Every hourly tick in the window rounds back to targetDay.
    for (let ms = startMs; ms < endMs; ms += 60 * 60 * 1000) {
      const day = userTzDayFrom(new Date(ms).toISOString(), 'Asia/Ho_Chi_Minh');
      expect(day).toBe('2026-04-20');
    }
  });

  it('matches the naive 24h window in UTC', () => {
    const { startUtc, endUtc, targetDay } = userTzYesterdayUtcRange('2026-04-21', 'UTC');
    expect(targetDay).toBe('2026-04-20');
    expect(new Date(startUtc).toISOString()).toBe('2026-04-20T00:00:00.000Z');
    expect(new Date(endUtc).toISOString()).toBe('2026-04-21T00:00:00.000Z');
  });
});
