/**
 * Task 3.5 — Milestone 1.1 tests for `userTzDayUtcRange(day, tz)`.
 *
 * Generalizes the scan loop from `userTzYesterdayUtcRange` so any user-TZ
 * calendar day string can be resolved to a UTC range. Used by the Dashboard
 * RSC fetch to query `food_entries` for "today" without the
 * `userTzYesterdayUtcRange(tomorrow, tz)` trick.
 *
 * Coverage:
 *   - UTC+7 (Asia/Ho_Chi_Minh) — east of UTC, "today" spans ~17:00 UTC prior
 *     day → 17:00 UTC current.
 *   - UTC identity — range is raw UTC midnight to midnight.
 *   - America/Los_Angeles DST spring-forward (2026-03-08, 02:00 local skipped).
 *   - America/Los_Angeles DST fall-back (2026-11-01, 02:00 local repeats).
 *   - Every hourly tick inside the range MUST resolve back to the input day.
 */
import { describe, expect, it } from 'vitest';

import { userTzDayFrom, userTzDayUtcRange } from '@/lib/time/day';

describe('userTzDayUtcRange', () => {
  it('east-of-UTC (Asia/Ho_Chi_Minh, UTC+7) maps a local day to ~24h UTC range', () => {
    const { startUtc, endUtc, targetDay } = userTzDayUtcRange('2026-04-21', 'Asia/Ho_Chi_Minh');
    expect(targetDay).toBe('2026-04-21');
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    // Range length is ~24h (allowing 1h scan granularity).
    expect(endMs - startMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(endMs - startMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    // Every hourly tick inside the window rounds back to the target day.
    for (let ms = startMs; ms < endMs; ms += 60 * 60 * 1000) {
      const day = userTzDayFrom(new Date(ms).toISOString(), 'Asia/Ho_Chi_Minh');
      expect(day).toBe('2026-04-21');
    }
  });

  it('UTC identity maps day-string to straight UTC-midnight range', () => {
    const { startUtc, endUtc, targetDay } = userTzDayUtcRange('2026-04-21', 'UTC');
    expect(targetDay).toBe('2026-04-21');
    expect(new Date(startUtc).toISOString()).toBe('2026-04-21T00:00:00.000Z');
    expect(new Date(endUtc).toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });

  it('DST spring-forward (America/Los_Angeles 2026-03-08) produces ~23h range', () => {
    // On 2026-03-08 America/Los_Angeles, clocks jump 02:00 → 03:00 local.
    // The local calendar day spans only 23 hours.
    const { startUtc, endUtc, targetDay } = userTzDayUtcRange('2026-03-08', 'America/Los_Angeles');
    expect(targetDay).toBe('2026-03-08');
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    // Must cover the entire local day; at 1h scan granularity this lands
    // somewhere in 22-24h depending on where the skipped hour falls.
    expect(endMs - startMs).toBeGreaterThanOrEqual(22 * 60 * 60 * 1000);
    expect(endMs - startMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    // Every hourly tick rounds back to 2026-03-08 locally.
    for (let ms = startMs; ms < endMs; ms += 60 * 60 * 1000) {
      const day = userTzDayFrom(new Date(ms).toISOString(), 'America/Los_Angeles');
      expect(day).toBe('2026-03-08');
    }
  });

  it('DST fall-back (America/Los_Angeles 2026-11-01) produces ~25h range', () => {
    // On 2026-11-01 America/Los_Angeles, clocks rewind 02:00 → 01:00 local.
    // The local calendar day spans 25 hours.
    const { startUtc, endUtc, targetDay } = userTzDayUtcRange('2026-11-01', 'America/Los_Angeles');
    expect(targetDay).toBe('2026-11-01');
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    expect(endMs - startMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    expect(endMs - startMs).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
    for (let ms = startMs; ms < endMs; ms += 60 * 60 * 1000) {
      const day = userTzDayFrom(new Date(ms).toISOString(), 'America/Los_Angeles');
      expect(day).toBe('2026-11-01');
    }
  });

  it('matches userTzYesterdayUtcRange(today) when asked for yesterday', async () => {
    // Symmetry check: `userTzDayUtcRange('2026-04-20', tz)` should produce the
    // same shape as `userTzYesterdayUtcRange('2026-04-21', tz)`.
    const { userTzYesterdayUtcRange } = await import('@/lib/time/day');
    const dayRange = userTzDayUtcRange('2026-04-20', 'Asia/Ho_Chi_Minh');
    const yesterdayRange = userTzYesterdayUtcRange('2026-04-21', 'Asia/Ho_Chi_Minh');
    expect(dayRange.startUtc).toBe(yesterdayRange.startUtc);
    expect(dayRange.endUtc).toBe(yesterdayRange.endUtc);
    expect(dayRange.targetDay).toBe(yesterdayRange.targetDay);
  });
});
