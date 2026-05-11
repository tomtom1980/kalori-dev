/**
 * `lib/time/day.ts` — Task 3.4, user-TZ day helpers.
 *
 * Load-bearing for cache-tag invariant I12 (architecture §7.1 + synthesis
 * §2.5): `TAGS.userEntries(uid, day)` tags MUST derive `day` from the user's
 * timezone, never raw UTC — otherwise a log entry made at 23:30 local in
 * Asia/Ho_Chi_Minh (UTC-07:00 local → 16:30 UTC) would be bucketed into the
 * wrong day-tag and the F6 3AM hazard (design-doc §18.3) surfaces.
 *
 * Strategy — use `Intl.DateTimeFormat` with `timeZone` option which handles
 * DST + IANA zone data correctly across Node 20+, browsers, and Edge runtime.
 */

/**
 * Return the user-TZ day as 'YYYY-MM-DD' for the given UTC ISO string.
 * Pure, no I/O. Accepts any ISO 8601 string the JS Date parser accepts.
 */
export function userTzDayFrom(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${year}-${month}-${day}`;
}

/** Today in user TZ as 'YYYY-MM-DD'. */
export function userTzToday(tz: string): string {
  return userTzDayFrom(new Date().toISOString(), tz);
}

/** Current UTC time as an ISO string. The `tz` param is accepted for
 * symmetry with the other helpers but not used — callers pair this with
 * `userTzDayFrom` when they need TZ-aware day bucketing. */
export function userTzNowIso(tz: string): string {
  // `tz` is accepted for symmetry with other helpers; UTC ISO is always
  // the right wire format. Caller passes it to `userTzDayFrom` when a
  // TZ-aware day-string is needed downstream.
  void tz;
  return new Date().toISOString();
}

/**
 * Return a UTC ISO timestamp that is safely inside the supplied user-TZ
 * calendar day. This is useful when the UI is adding a historical record and
 * only has a date, not a precise local time.
 */
export function userTzDayMidpointIso(day: string, tz: string): string {
  const { startUtc, endUtc } = userTzDayUtcRange(day, tz);
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return new Date().toISOString();
  }
  return new Date(startMs + Math.floor((endMs - startMs) / 2)).toISOString();
}

/**
 * Return the UTC ISO range for the user-TZ calendar day N days before the
 * given `today` string. Emitted as `{ startUtc, endUtc }` — both ISO 8601.
 *
 * Correctness — `new Date('YYYY-MM-DDT00:00:00Z').getTime() - 86400000`
 * computes UTC-midnight minus 24h, which for a TZ east of UTC (Asia/
 * Ho_Chi_Minh = UTC+7) is the wrong day boundary. This helper scans
 * candidate UTC timestamps 12h-36h before the next-day's UTC midnight and
 * finds the first UTC instant whose user-TZ day matches `target`, giving
 * a correct range even across DST. Skill G13 fix.
 */
export function userTzYesterdayUtcRange(
  today: string,
  tz: string,
): { startUtc: string; endUtc: string; targetDay: string } {
  // Compute yesterday's calendar date in the user's TZ.
  const [y, m, d] = today.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) {
    return {
      startUtc: new Date().toISOString(),
      endUtc: new Date().toISOString(),
      targetDay: today,
    };
  }
  const todayUtcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const targetMs = todayUtcMidnight - 24 * 60 * 60 * 1000;
  return scanUtcRangeForDay(targetMs, tz);
}

/**
 * Task 3.5 — generalized form of `userTzYesterdayUtcRange`. Given a user-TZ
 * calendar day as `'YYYY-MM-DD'`, return the UTC range `{ startUtc, endUtc }`
 * that covers that local calendar day. Used by the Dashboard RSC fetch to
 * query `food_entries` / `water_log` for "today" in the user's timezone
 * without needing the `userTzYesterdayUtcRange(tomorrow, tz)` trick.
 *
 * DST-safe: scans hourly ticks ±36h around a seed UTC instant. On DST
 * spring-forward days the local day spans 23 hours; on fall-back days, 25.
 */
export function userTzDayUtcRange(
  day: string,
  tz: string,
): { startUtc: string; endUtc: string; targetDay: string } {
  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) {
    return {
      startUtc: new Date().toISOString(),
      endUtc: new Date().toISOString(),
      targetDay: day,
    };
  }
  // Seed at UTC noon of the same calendar date. Starting at UTC midnight
  // would land on the *previous* local day for any timezone west of UTC
  // (e.g. at 2026-03-08T00:00Z, America/Los_Angeles is still on
  // 2026-03-07 16:00). Noon gives us a ±12h margin to the nearest IANA
  // zone boundary; the ±36h scan below then trims to the correct day.
  const seedMs = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  return scanUtcRangeForDay(seedMs, tz);
}

// Private — shared scan between the day-range helpers. Finds the first and
// last hourly UTC ticks (±36h around `seedMs`) whose user-TZ day matches
// the user-TZ day of the seed itself.
function scanUtcRangeForDay(
  seedMs: number,
  tz: string,
): { startUtc: string; endUtc: string; targetDay: string } {
  const targetDay = userTzDayFrom(new Date(seedMs).toISOString(), tz);
  let startUtc: number | null = null;
  let endUtc: number | null = null;
  for (let hour = -36; hour <= 36; hour += 1) {
    const ms = seedMs + hour * 60 * 60 * 1000;
    const dayAtMs = userTzDayFrom(new Date(ms).toISOString(), tz);
    if (dayAtMs === targetDay && startUtc === null) startUtc = ms;
    if (dayAtMs === targetDay) endUtc = ms + 60 * 60 * 1000;
  }
  if (startUtc === null || endUtc === null) {
    // Fallback to naive 24h window — should never hit in practice.
    startUtc = seedMs;
    endUtc = seedMs + 24 * 60 * 60 * 1000;
  }
  return {
    startUtc: new Date(startUtc).toISOString(),
    endUtc: new Date(endUtc).toISOString(),
    targetDay,
  };
}
