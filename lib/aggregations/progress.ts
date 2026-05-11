/**
 * `lib/aggregations/progress.ts` — Task 4.3a progress page aggregation.
 *
 * Five deterministic server-side aggregation functions feeding the /progress
 * Suspense boundaries (CalorieAdherence, MacroDistribution, Micronutrient
 * Heatmap, TrendSummary, LoggingConsistency). Pure; no I/O. The DB reader
 * lives in `lib/aggregations/progress-fetch.ts` and passes raw
 * `food_entries` rows into `aggregateProgress()`.
 *
 * Design decisions (briefing §4 + §0 resolutions):
 *   - D = rolling 24h from the most recent user-TZ midnight (hourly bins).
 *   - W = rolling 7 days ending today (daily bins, user-TZ).
 *   - M = rolling 30 days ending today (daily bins, user-TZ) — NOT calendar
 *     month. Window slides forward one day per calendar day regardless of
 *     DST / month-end rollover (briefing §0 Resolution #6).
 *   - Sparse threshold = 3 distinct logged user-TZ days in the window. When
 *     `sparse.isSparse === true`, chart components render the sparse
 *     fallback copy per design-doc §7.
 *   - Tombstone / orphan-FK tolerance: every aggregate sources nutrition
 *     from the `food_entries.items[]` jsonb snapshot (Task 3.4 contract),
 *     NEVER via a join into `food_library_items`. A tombstoned library
 *     item on the other side of the FK cannot corrupt the aggregate.
 *   - Zod-parsed output (strict) at the aggregate boundary — no `.optional()`
 *     on required keys (briefing §7 Carried Context #4).
 *
 * Heatmap ramp (`colors.heatmap.c0..c9` in globals.css): the 10-step
 * oxblood→ochre→moss earth-tonal ramp. Cell class maps from percent-of-DV
 * via `rampClassForPct`. Lift the ramp bands (not the colors) with design
 * review — moving a boundary here reclassifies every historical cell.
 */
import { z } from 'zod';

import { userTzDayFrom } from '@/lib/time/day';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** URL range param. D = rolling 24h, W = rolling 7d, M = rolling 30d. */
export type ProgressRange = 'D' | 'W' | 'M';

/** Input row shape — matches the Supabase `food_entries` row the reader pulls. */
export interface FoodEntryRow {
  readonly id: string;
  readonly logged_at: string;
  readonly meal_category: string;
  readonly library_item_id: string | null;
  readonly items: ReadonlyArray<{
    readonly name?: string;
    readonly portion?: number;
    readonly unit?: string;
    readonly kcal?: number;
    readonly macros?: {
      readonly protein_g?: number;
      readonly carbs_g?: number;
      readonly fat_g?: number;
      readonly fiber_g?: number;
    };
    readonly micros?: Record<string, number>;
    readonly confidence?: number;
  }>;
}

/** Profile slice relevant to progress aggregation — targets + TZ at the caller. */
export interface ProgressProfile {
  readonly calorie_target: number;
  readonly protein_target_g: number;
  readonly carbs_target_g: number;
  readonly fat_target_g: number;
  readonly fiber_target_g: number;
}

export interface AggregateProgressInput {
  readonly range: ProgressRange;
  readonly now: string;
  readonly tz: string;
  readonly profile: ProgressProfile;
  readonly entries: readonly FoodEntryRow[];
}

export interface ProgressWindow {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly userTzStartDay: string;
  readonly userTzEndDay: string;
  readonly bucketCount: number;
  /** Ordered list of bucket keys. For W/M: `YYYY-MM-DD`; for D: `YYYY-MM-DDTHH`. */
  readonly buckets: readonly string[];
}

export type AdherenceClass = 'under' | 'on-target' | 'over' | 'empty';

export interface CalorieBucket {
  readonly bucket: string;
  readonly kcalConsumed: number;
  readonly kcalTarget: number;
  readonly adherenceClass: AdherenceClass;
}

export interface MacroBucket {
  readonly bucket: string;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly fiberG: number;
  readonly proteinTargetG: number;
  readonly carbsTargetG: number;
  readonly fatTargetG: number;
  readonly fiberTargetG: number;
}

export type HeatmapRampClass = 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' | 'c9';

export const HEATMAP_NUTRIENTS = [
  'vitamin_a',
  'vitamin_c',
  'vitamin_d',
  'iron',
  'calcium',
] as const;

export type HeatmapNutrient = (typeof HEATMAP_NUTRIENTS)[number];

export interface HeatmapCell {
  readonly nutrient: HeatmapNutrient;
  readonly bucket: string;
  readonly actual: number;
  readonly pctDv: number;
  readonly rampClass: HeatmapRampClass;
  readonly isToday: boolean;
}

export interface LoggingCell {
  readonly date: string;
  readonly logged: boolean;
  readonly entryCount: number;
}

export interface Sparse {
  readonly daysLogged: number;
  readonly threshold: 3;
  readonly isSparse: boolean;
}

export interface CalorieAdherenceData {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly points: ReadonlyArray<CalorieBucket>;
  readonly sparse: Sparse;
  readonly srSummary: string;
  readonly window: ProgressWindow;
}

export interface MacroDistributionData {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly points: ReadonlyArray<MacroBucket>;
  readonly sparse: Sparse;
  readonly srSummary: string;
  readonly window: ProgressWindow;
}

export interface MicronutrientHeatmapData {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly nutrients: typeof HEATMAP_NUTRIENTS;
  readonly targets: Readonly<Record<HeatmapNutrient, number>>;
  readonly cells: ReadonlyArray<HeatmapCell>;
  readonly footerCommentary: string;
  readonly scanMeta: {
    readonly lastScan: string;
    readonly nextRecalc: string;
    readonly dataPoints: number;
  };
  readonly sparse: Sparse;
  readonly srSummary: string;
  readonly window: ProgressWindow;
}

export interface TrendSummaryData {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly caloriesAvg: number;
  readonly proteinAvgG: number;
  readonly carbsAvgG: number;
  readonly fatAvgG: number;
  readonly fiberAvgG: number;
  readonly microTrends: ReadonlyArray<{
    readonly nutrient: string;
    readonly direction: 'up' | 'down' | 'flat';
    readonly delta: number;
  }>;
  readonly commentary: string;
  readonly srSummary: string;
  readonly sparse: Sparse;
}

export interface LoggingConsistencyData {
  readonly range: ProgressRange;
  readonly tz: string;
  readonly days: ReadonlyArray<LoggingCell>;
  readonly weekdayStart: 'monday';
  readonly srSummary: string;
  readonly sparse: Sparse;
  readonly totalMealsInRange: number;
  readonly window: ProgressWindow;
}

export interface ProgressAggregate {
  readonly calorie: CalorieAdherenceData;
  readonly macro: MacroDistributionData;
  readonly heatmap: MicronutrientHeatmapData;
  readonly trend: TrendSummaryData;
  readonly logging: LoggingConsistencyData;
}

// ---------------------------------------------------------------------------
// Heatmap target defaults (DV per briefing §5)
// ---------------------------------------------------------------------------

const HEATMAP_DEFAULT_TARGETS: Readonly<Record<HeatmapNutrient, number>> = {
  vitamin_a: 900, // μg RAE
  vitamin_c: 90, // mg
  vitamin_d: 20, // μg / 800 IU
  iron: 18, // mg
  calcium: 1000, // mg
};

// ---------------------------------------------------------------------------
// Zod schemas for strict boundary (briefing §7 carried context #4)
// ---------------------------------------------------------------------------

const CalorieBucketZ = z.object({
  bucket: z.string(),
  kcalConsumed: z.number(),
  kcalTarget: z.number(),
  adherenceClass: z.enum(['under', 'on-target', 'over', 'empty']),
});

const MacroBucketZ = z.object({
  bucket: z.string(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  proteinTargetG: z.number(),
  carbsTargetG: z.number(),
  fatTargetG: z.number(),
  fiberTargetG: z.number(),
});

const SparseZ = z.object({
  daysLogged: z.number(),
  threshold: z.literal(3),
  isSparse: z.boolean(),
});

// ---------------------------------------------------------------------------
// Window math
// ---------------------------------------------------------------------------

/**
 * Compute the UTC start/end bounds + user-TZ bucket list for a given range.
 * All window math lives here; chart components are pure presenters.
 *
 * Codex Round 1 fixes (2026-04-24):
 *   - C-2 — non-integer-offset zones (Asia/Kathmandu UTC+5:45, Asia/Kolkata
 *     UTC+5:30, Pacific/Marquesas UTC-9:30, Australia/Adelaide UTC+9:30 +
 *     DST): user-TZ midnight no longer falls on a whole UTC hour. The old
 *     hour-scan in `userTzMidnightUtc` was off by 15/30/45 min. Now we use
 *     Intl parts to extract the exact local-civil-time of a UTC instant
 *     and solve for the instant whose local civil time == 00:00:00.
 *   - C-3 — DST transitions (spring-forward 23h days, fall-back 25h days):
 *     the D range previously emitted a fixed 24 hourly buckets. Now we
 *     walk from local midnight to the next local midnight via TZ-aware
 *     hour steps and key each bucket by the UTC instant (so fall-back's
 *     two distinct 1:xx local hours don't collapse into one bucket, and
 *     spring-forward's skipped 2:xx hour doesn't generate a phantom).
 */
export function computeWindow(range: ProgressRange, nowIso: string, tz: string): ProgressWindow {
  const endDay = userTzDayFrom(nowIso, tz);

  if (range === 'D') {
    // Start = most recent user-TZ midnight, which is the start of `endDay`.
    const startUtcMs = userTzMidnightUtcMs(endDay, tz);
    const startUtc = new Date(startUtcMs).toISOString();
    const endUtc = nowIso;
    // Walk the local day hour-by-hour and key each bucket by the UTC instant
    // that represents 00:00, 01:00, ..., up to but not past the next local
    // midnight. DST-safe: spring-forward produces 23 buckets (skipping the
    // missing hour); fall-back produces 25 (two distinct instants for the
    // repeated local hour).
    const buckets = buildLocalHourBuckets(endDay, tz);
    return {
      range,
      tz,
      startUtc,
      endUtc,
      userTzStartDay: endDay,
      userTzEndDay: endDay,
      bucketCount: buckets.length,
      buckets,
    };
  }

  // W = 7 days, M = 30 days — both inclusive of today.
  const spanDays = range === 'W' ? 7 : 30;
  const buckets = rollingDayBuckets(endDay, spanDays);
  const startDay = buckets[0]!;
  const startUtc = new Date(userTzMidnightUtcMs(startDay, tz)).toISOString();
  const endUtc = nowIso;
  return {
    range,
    tz,
    startUtc,
    endUtc,
    userTzStartDay: startDay,
    userTzEndDay: endDay,
    bucketCount: spanDays,
    buckets,
  };
}

/**
 * Return the UTC epoch-ms of user-TZ midnight for the given `YYYY-MM-DD` day.
 *
 * Uses Intl.DateTimeFormat parts to decompose a UTC instant into its local
 * civil time, then Newton-steps to the instant whose local civil time is
 * 00:00:00 of `day`. Correct for ALL IANA zones including non-integer
 * offsets (UTC+5:45 Kathmandu, UTC+5:30 Kolkata, UTC-9:30 Marquesas,
 * UTC+9:30/+10:30 Adelaide) and across DST transitions.
 */
function userTzMidnightUtcMs(day: string, tz: string): number {
  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) throw new Error(`invalid day: ${day}`);
  // Seed guess: treat the date's UTC noon as anchor. Ask Intl for the local
  // parts at that instant; shift by the negative of the local time-of-day to
  // land on local midnight. One iteration is sufficient for zones with
  // standard offsets; a verification pass handles edge cases near DST.
  const seedMs = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  let approxMs = solveForLocalMidnight(day, seedMs, tz);
  // Near DST transitions the first solve can land on the wrong side. Verify
  // and — if necessary — re-solve from a different seed.
  if (userTzDayFrom(new Date(approxMs).toISOString(), tz) !== day) {
    approxMs = solveForLocalMidnight(day, seedMs - 24 * 60 * 60 * 1000, tz);
  }
  if (userTzDayFrom(new Date(approxMs).toISOString(), tz) !== day) {
    approxMs = solveForLocalMidnight(day, seedMs + 24 * 60 * 60 * 1000, tz);
  }
  // Final verification that the approx instant represents local 00:00:00
  // by minute-stepping within ±2h if still off. Worst-case this is six
  // Intl calls — still cheap.
  if (!isLocalMidnight(approxMs, day, tz)) {
    for (let delta = -120; delta <= 120; delta += 1) {
      const candidate = approxMs + delta * 60 * 1000;
      if (isLocalMidnight(candidate, day, tz)) {
        return candidate;
      }
    }
  }
  return approxMs;
}

/**
 * Given a seed UTC instant within ~12h of the target local midnight of
 * `day`, return the UTC instant whose local civil time (in `tz`) is
 * exactly 00:00:00 of `day`. Uses Intl parts to read the seed's local
 * hour/minute/second, then subtracts those to reach local midnight.
 */
function solveForLocalMidnight(day: string, seedMs: number, tz: string): number {
  const parts = localParts(seedMs, tz);
  const deltaMin = parts.hour * 60 + parts.minute;
  // Step back by `deltaMin` minutes to reach the most recent local midnight
  // relative to the seed. If the resulting instant still reads a different
  // calendar day, the seed was already before midnight — step forward by
  // (24h - deltaMin) to reach the next local midnight.
  let candidateMs = seedMs - deltaMin * 60 * 1000 - parts.second * 1000;
  if (userTzDayFrom(new Date(candidateMs).toISOString(), tz) !== day) {
    candidateMs = seedMs + (24 * 60 - deltaMin) * 60 * 1000 - parts.second * 1000;
  }
  return candidateMs;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(ms: number, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const pick = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '0';
    // Intl can emit hour "24" for midnight in some locales; normalize to 0.
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? (type === 'hour' && n === 24 ? 0 : n) : 0;
  };
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function isLocalMidnight(ms: number, day: string, tz: string): boolean {
  const p = localParts(ms, tz);
  const candidateDay = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  return candidateDay === day && p.hour === 0 && p.minute === 0;
}

/**
 * Build the list of hourly bucket keys for a D range, walking in local time
 * from 00:00 local `day` up to but not including 00:00 local of the next
 * day. Each bucket key is the UTC ISO of the instant representing
 * `YYYY-MM-DDTHH` local-hour label. DST-safe: 23 buckets spring-forward,
 * 25 fall-back, 24 otherwise.
 *
 * The key shape is `${day}T${HH}` for UI stability (the renderer expects
 * a day-local hour label). On fall-back days the two distinct 1:xx UTC
 * instants both produce `${day}T01` as a key, which previously caused
 * collapse. We disambiguate by suffixing the SECOND occurrence with a
 * `~2` marker so downstream code still sees 25 distinct buckets, but SR
 * label renderers strip the marker for display.
 */
function buildLocalHourBuckets(day: string, tz: string): string[] {
  const midnightMs = userTzMidnightUtcMs(day, tz);
  const nextMidnightMs = userTzMidnightUtcMs(nextDayIso(day), tz);
  const buckets: string[] = [];
  const seen = new Map<string, number>();
  // Step forward in 1h UTC increments; use local parts to compute the
  // actual local-hour label at each instant. Stop when the instant crosses
  // into the next local day OR reaches nextMidnightMs.
  // Hard cap at 30 iterations to defend against pathological infinite loops
  // from malformed zone data.
  let cursor = midnightMs;
  for (let step = 0; step < 30; step += 1) {
    if (cursor >= nextMidnightMs) break;
    const p = localParts(cursor, tz);
    const candidateDay = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    if (candidateDay !== day) break;
    const hourLabel = pad2(p.hour);
    const baseKey = `${day}T${hourLabel}`;
    const count = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, count);
    buckets.push(count === 1 ? baseKey : `${baseKey}~${count}`);
    // Advance one hour of UTC. Local hour typically increments by 1, but
    // on DST spring-forward it jumps by 2 (local 02 skips 01→03) which
    // naturally omits the missing local hour from the bucket list.
    cursor += 60 * 60 * 1000;
  }
  return buckets;
}

function nextDayIso(day: string): string {
  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) throw new Error(`invalid day: ${day}`);
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0, 0) + 24 * 60 * 60 * 1000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Produce an inclusive descending range of N days ending on `endDay`. */
function rollingDayBuckets(endDay: string, spanDays: number): string[] {
  const buckets: string[] = [];
  const [y, m, d] = endDay.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) throw new Error(`invalid endDay: ${endDay}`);
  // Use a UTC anchor to avoid local-TZ arithmetic — we only care about the
  // YYYY-MM-DD strings, not instants.
  const endMs = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  for (let offset = spanDays - 1; offset >= 0; offset -= 1) {
    const dayMs = endMs - offset * 24 * 60 * 60 * 1000;
    const dd = new Date(dayMs);
    const s = `${dd.getUTCFullYear()}-${pad2(dd.getUTCMonth() + 1)}-${pad2(dd.getUTCDate())}`;
    buckets.push(s);
  }
  return buckets;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ---------------------------------------------------------------------------
// Heatmap ramp class mapper
// ---------------------------------------------------------------------------

/**
 * Map percent-of-DV to a heatmap ramp class c0..c9. Bands per briefing §5:
 *   c0: 0-10, c1: 10-25, c2: 25-40, c3: 40-55, c4: 45-60... wait, revised:
 *   c0: 0-10, c1: 10-25, c2: 25-40, c3: 40-55, c4: 55-65, c5: 65-80,
 *   c6: 80-90, c7: 90-100, c8: 100-115, c9: >115.
 * These bands are informational — the on-target visual signal is c7
 * (90-100%) through c8 (100-115%).
 */
export function rampClassForPct(pct: number): HeatmapRampClass {
  if (pct < 10) return 'c0';
  if (pct < 25) return 'c1';
  if (pct < 40) return 'c2';
  if (pct < 55) return 'c3';
  if (pct < 65) return 'c4';
  if (pct < 80) return 'c5';
  if (pct < 90) return 'c6';
  if (pct <= 100) return 'c7'; // on-target band (90-100% inclusive)
  if (pct < 115) return 'c8';
  return 'c9';
}

// ---------------------------------------------------------------------------
// aggregateProgress — the single public aggregator
// ---------------------------------------------------------------------------

export function aggregateProgress(input: AggregateProgressInput): ProgressAggregate {
  const window = computeWindow(input.range, input.now, input.tz);
  const todayTz = window.userTzEndDay;

  // Bucket raw entries into per-bucket rollups. Entries outside the window
  // are dropped up-front.
  const perBucket = new Map<string, BucketAccumulator>();
  for (const bucket of window.buckets) {
    perBucket.set(bucket, emptyAccumulator());
  }
  const daysLoggedSet = new Set<string>();
  let totalMealsInRange = 0;
  let dataPoints = 0;

  for (const entry of input.entries) {
    const entryBucketKey = bucketKeyForEntry(entry.logged_at, input.tz, window);
    if (!entryBucketKey) continue;
    const acc = perBucket.get(entryBucketKey);
    if (!acc) continue;
    acc.entryCount += 1;
    totalMealsInRange += 1;
    const userTzDay = userTzDayFrom(entry.logged_at, input.tz);
    daysLoggedSet.add(userTzDay);
    for (const item of entry.items ?? []) {
      acc.kcal += numOr0(item.kcal);
      acc.protein_g += numOr0(item.macros?.protein_g);
      acc.carbs_g += numOr0(item.macros?.carbs_g);
      acc.fat_g += numOr0(item.macros?.fat_g);
      acc.fiber_g += numOr0(item.macros?.fiber_g);
      const micros = item.micros ?? {};
      for (const nutrient of HEATMAP_NUTRIENTS) {
        const raw = micros[nutrient];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          acc.micros[nutrient] = (acc.micros[nutrient] ?? 0) + raw;
        }
      }
      dataPoints += 1;
    }
  }

  const sparse: Sparse = {
    daysLogged: daysLoggedSet.size,
    threshold: 3,
    isSparse: daysLoggedSet.size < 3,
  };

  // --- CalorieAdherence ---
  const caloriePoints: CalorieBucket[] = window.buckets.map((b) => {
    const acc = perBucket.get(b)!;
    const adherenceClass = classifyAdherence(acc.kcal, input.profile.calorie_target);
    const point: CalorieBucket = {
      bucket: b,
      kcalConsumed: round1(acc.kcal),
      kcalTarget: input.profile.calorie_target,
      adherenceClass,
    };
    return CalorieBucketZ.parse(point) as CalorieBucket;
  });
  const calorie: CalorieAdherenceData = {
    range: input.range,
    tz: input.tz,
    points: caloriePoints,
    sparse: SparseZ.parse(sparse) as Sparse,
    srSummary: buildCalorieSrSummary(caloriePoints, sparse, input.range),
    window,
  };

  // --- MacroDistribution ---
  const macroPoints: MacroBucket[] = window.buckets.map((b) => {
    const acc = perBucket.get(b)!;
    const point: MacroBucket = {
      bucket: b,
      proteinG: round1(acc.protein_g),
      carbsG: round1(acc.carbs_g),
      fatG: round1(acc.fat_g),
      fiberG: round1(acc.fiber_g),
      proteinTargetG: input.profile.protein_target_g,
      carbsTargetG: input.profile.carbs_target_g,
      fatTargetG: input.profile.fat_target_g,
      fiberTargetG: input.profile.fiber_target_g,
    };
    return MacroBucketZ.parse(point) as MacroBucket;
  });
  const macro: MacroDistributionData = {
    range: input.range,
    tz: input.tz,
    points: macroPoints,
    sparse,
    srSummary: buildMacroSrSummary(macroPoints, sparse, input.range),
    window,
  };

  // --- MicronutrientHeatmap ---
  const targets: Record<HeatmapNutrient, number> = {
    ...HEATMAP_DEFAULT_TARGETS,
  };
  const heatmapCells: HeatmapCell[] = [];
  for (const nutrient of HEATMAP_NUTRIENTS) {
    for (const b of window.buckets) {
      const acc = perBucket.get(b)!;
      const actual = valueForNutrient(acc, nutrient);
      const target = targets[nutrient];
      const pctDv = target > 0 ? Math.round((actual / target) * 100) : 0;
      heatmapCells.push({
        nutrient,
        bucket: b,
        actual: round1(actual),
        pctDv,
        rampClass: rampClassForPct(pctDv),
        isToday: bucketIsToday(b, todayTz),
      });
    }
  }
  const heatmap: MicronutrientHeatmapData = {
    range: input.range,
    tz: input.tz,
    nutrients: HEATMAP_NUTRIENTS,
    targets,
    cells: heatmapCells,
    footerCommentary: buildHeatmapCommentary(heatmapCells, sparse),
    scanMeta: {
      lastScan: input.now,
      nextRecalc: nextMondayIso(input.now, input.tz),
      dataPoints,
    },
    sparse,
    srSummary: buildHeatmapSrSummary(heatmapCells, window, sparse),
    window,
  };

  // --- TrendSummary ---
  const loggedBuckets = window.buckets.filter((b) => {
    const acc = perBucket.get(b)!;
    return acc.entryCount > 0;
  });
  const loggedCount = Math.max(1, loggedBuckets.length);
  const sums = window.buckets.reduce(
    (s, b) => {
      const acc = perBucket.get(b)!;
      if (acc.entryCount === 0) return s;
      s.kcal += acc.kcal;
      s.p += acc.protein_g;
      s.c += acc.carbs_g;
      s.f += acc.fat_g;
      s.fiber += acc.fiber_g;
      return s;
    },
    { kcal: 0, p: 0, c: 0, f: 0, fiber: 0 },
  );
  const caloriesAvg = Math.round(sums.kcal / loggedCount);
  const proteinAvg = Math.round(sums.p / loggedCount);
  const carbsAvg = Math.round(sums.c / loggedCount);
  const fatAvg = Math.round(sums.f / loggedCount);
  const fiberAvg = Math.round(sums.fiber / loggedCount);
  const trend: TrendSummaryData = {
    range: input.range,
    tz: input.tz,
    caloriesAvg,
    proteinAvgG: proteinAvg,
    carbsAvgG: carbsAvg,
    fatAvgG: fatAvg,
    fiberAvgG: fiberAvg,
    microTrends: deriveMicroTrends(perBucket, window),
    commentary: buildTrendCommentary(caloriesAvg, proteinAvg, carbsAvg, fatAvg, fiberAvg, sparse),
    srSummary: buildTrendSrSummary(
      caloriesAvg,
      proteinAvg,
      carbsAvg,
      fatAvg,
      fiberAvg,
      input.range,
      sparse,
    ),
    sparse,
  };

  // --- LoggingConsistency ---
  const logging: LoggingConsistencyData = {
    range: input.range,
    tz: input.tz,
    days: loggingDays(perBucket, window),
    weekdayStart: 'monday',
    srSummary: buildLoggingSrSummary(perBucket, window),
    sparse,
    totalMealsInRange,
    window,
  };

  return { calorie, macro, heatmap, trend, logging };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BucketAccumulator {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  entryCount: number;
  micros: Partial<Record<HeatmapNutrient, number>>;
}

function emptyAccumulator(): BucketAccumulator {
  return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, entryCount: 0, micros: {} };
}

function numOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function classifyAdherence(kcal: number, target: number): AdherenceClass {
  if (kcal === 0) return 'empty';
  if (target <= 0) return 'empty';
  const pct = (kcal / target) * 100;
  if (pct < 80) return 'under';
  if (pct >= 105) return 'over';
  return 'on-target';
}

function bucketKeyForEntry(loggedAtIso: string, tz: string, window: ProgressWindow): string | null {
  const day = userTzDayFrom(loggedAtIso, tz);
  if (window.range === 'D') {
    // Match hourly bucket — requires the day to equal the window's single day.
    if (day !== window.userTzEndDay) return null;
    // Compute the hour label in the user TZ via Intl.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(loggedAtIso));
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const hour = hh === '24' ? '00' : hh; // guard against Intl '24:00' quirk
    const baseKey = `${day}T${hour}`;
    // DST fall-back disambiguation (C-3): if the window has both `baseKey`
    // AND `${baseKey}~2`, we must pick the correct one. The SECOND
    // occurrence (later instant) carries the `~2` suffix. Compare the
    // entry's epoch-ms to the instants that the bucket list represents.
    const repeatKey = `${baseKey}~2`;
    const hasRepeat = window.buckets.includes(repeatKey);
    if (!hasRepeat) {
      // Normal / spring-forward path: only one instance (or the bucket
      // doesn't exist because the hour was skipped).
      return window.buckets.includes(baseKey) ? baseKey : null;
    }
    // Fall-back: figure out which of the two instants this entry falls into
    // by locating the transition instant — the UTC instant at which the
    // second 01:xx local hour begins. Entries at-or-after that instant
    // land in `~2`; before that instant land in the base key.
    const transitionMs = fallBackTransitionMs(day, tz);
    const entryMs = Date.parse(loggedAtIso);
    if (transitionMs === null) {
      // Shouldn't happen if `~2` bucket exists, but defensive.
      return window.buckets.includes(baseKey) ? baseKey : null;
    }
    return entryMs >= transitionMs ? repeatKey : baseKey;
  }
  // W/M: daily bucket keyed by user-TZ day.
  if (!window.buckets.includes(day)) return null;
  return day;
}

/**
 * For a fall-back DST day, return the UTC epoch-ms when the repeated
 * local hour begins (e.g., the moment clocks "fall back" from 02:00 EDT
 * to 01:00 EST). Returns null if the day has no fall-back transition.
 */
function fallBackTransitionMs(day: string, tz: string): number | null {
  const midnightMs = userTzMidnightUtcMs(day, tz);
  const nextMidnightMs = userTzMidnightUtcMs(nextDayIso(day), tz);
  // Walk hour-by-hour; look for two consecutive local hours where the
  // local-hour label decreases or repeats (fall-back signature).
  const seenHours = new Map<number, number>();
  let cursor = midnightMs;
  for (let step = 0; step < 30; step += 1) {
    if (cursor >= nextMidnightMs) break;
    const p = localParts(cursor, tz);
    if (p.year !== undefined) {
      const prev = seenHours.get(p.hour);
      if (prev !== undefined) {
        // Second occurrence of this local hour — this is the transition.
        return cursor;
      }
      seenHours.set(p.hour, cursor);
    }
    cursor += 60 * 60 * 1000;
  }
  return null;
}

function valueForNutrient(acc: BucketAccumulator, nutrient: HeatmapNutrient): number {
  return acc.micros[nutrient] ?? 0;
}

function bucketIsToday(bucket: string, todayTz: string): boolean {
  if (bucket.includes('T')) return bucket.startsWith(todayTz);
  return bucket === todayTz;
}

function deriveMicroTrends(
  perBucket: Map<string, BucketAccumulator>,
  window: ProgressWindow,
): TrendSummaryData['microTrends'] {
  // Compare first half vs second half of logged buckets for each nutrient.
  const micros: HeatmapNutrient[] = ['iron', 'calcium', 'vitamin_c', 'vitamin_d'];
  return micros.map((nutrient) => {
    const halves = splitHalves(window.buckets, perBucket, (acc) => valueForNutrient(acc, nutrient));
    const delta = halves.second - halves.first;
    const direction: 'up' | 'down' | 'flat' =
      Math.abs(delta) < 0.5 ? 'flat' : delta > 0 ? 'up' : 'down';
    return { nutrient, direction, delta: round1(delta) };
  });
}

function splitHalves(
  buckets: readonly string[],
  perBucket: Map<string, BucketAccumulator>,
  extract: (acc: BucketAccumulator) => number,
): { first: number; second: number } {
  const mid = Math.floor(buckets.length / 2);
  let first = 0;
  let firstN = 0;
  let second = 0;
  let secondN = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    const acc = perBucket.get(buckets[i]!);
    if (!acc || acc.entryCount === 0) continue;
    const v = extract(acc);
    if (i < mid) {
      first += v;
      firstN += 1;
    } else {
      second += v;
      secondN += 1;
    }
  }
  return {
    first: firstN > 0 ? first / firstN : 0,
    second: secondN > 0 ? second / secondN : 0,
  };
}

function loggingDays(
  perBucket: Map<string, BucketAccumulator>,
  window: ProgressWindow,
): LoggingCell[] {
  if (window.range === 'D') {
    // D range: treat the 24 hourly buckets but collapse to "day" cells of
    // form {hour: N} via the bucket key. For logging-consistency purposes,
    // the renderer wants hour strings, so expose one cell per hour.
    return window.buckets.map((b) => {
      const acc = perBucket.get(b)!;
      return { date: b, logged: acc.entryCount > 0, entryCount: acc.entryCount };
    });
  }
  return window.buckets.map((b) => {
    const acc = perBucket.get(b)!;
    return { date: b, logged: acc.entryCount > 0, entryCount: acc.entryCount };
  });
}

function buildCalorieSrSummary(
  points: readonly CalorieBucket[],
  sparse: Sparse,
  range: ProgressRange,
): string {
  const label = rangeLabel(range);
  if (sparse.isSparse) {
    return `Calorie adherence, ${label}: fewer than three days logged. Log more entries to see a chart.`;
  }
  const onTarget = points.filter((p) => p.adherenceClass === 'on-target').length;
  const over = points.filter((p) => p.adherenceClass === 'over').length;
  const under = points.filter((p) => p.adherenceClass === 'under').length;
  return `Calorie adherence, ${label}: ${onTarget} of ${points.length} buckets on target, ${over} over, ${under} under.`;
}

function buildMacroSrSummary(
  points: readonly MacroBucket[],
  sparse: Sparse,
  range: ProgressRange,
): string {
  const label = rangeLabel(range);
  if (sparse.isSparse) {
    return `Macro distribution, ${label}: fewer than three days logged.`;
  }
  const totalP = points.reduce((a, b) => a + b.proteinG, 0);
  const totalC = points.reduce((a, b) => a + b.carbsG, 0);
  const totalF = points.reduce((a, b) => a + b.fatG, 0);
  const totalFiber = points.reduce((a, b) => a + b.fiberG, 0);
  return `Macro distribution, ${label}: total protein ${formatG(totalP)} grams, carbs ${formatG(totalC)}, fat ${formatG(totalF)}, fiber ${formatG(totalFiber)}.`;
}

function buildHeatmapCommentary(cells: readonly HeatmapCell[], sparse: Sparse): string {
  if (sparse.isSparse) {
    return 'Log three or more days to see the heatmap fill in.';
  }
  // Find the nutrient with the highest average pctDv and the lowest.
  const byNutrient = new Map<HeatmapNutrient, number[]>();
  for (const c of cells) {
    const arr = byNutrient.get(c.nutrient) ?? [];
    arr.push(c.pctDv);
    byNutrient.set(c.nutrient, arr);
  }
  const avgs: Array<[HeatmapNutrient, number]> = [];
  for (const [nutrient, arr] of byNutrient.entries()) {
    const sum = arr.reduce((a, b) => a + b, 0);
    avgs.push([nutrient, arr.length > 0 ? Math.round(sum / arr.length) : 0]);
  }
  avgs.sort((a, b) => b[1] - a[1]);
  const top = avgs[0];
  const bottom = avgs[avgs.length - 1];
  if (!top || !bottom) return 'Not enough data to commentate.';
  return `${humanize(top[0])} averaged ${top[1]}% of target; ${humanize(bottom[0])} remained in the archive at ${bottom[1]}%.`;
}

function buildHeatmapSrSummary(
  cells: readonly HeatmapCell[],
  window: ProgressWindow,
  sparse: Sparse,
): string {
  const label = rangeLabel(window.range);
  if (sparse.isSparse) {
    return `Micronutrient heatmap, ${label}: not enough data. Log three or more days.`;
  }
  return `Micronutrient heatmap, ${label}: ${HEATMAP_NUTRIENTS.length} nutrients by ${window.bucketCount} time buckets.`;
}

function buildTrendCommentary(
  kcal: number,
  p: number,
  c: number,
  f: number,
  fiber: number,
  sparse: Sparse,
): string {
  if (sparse.isSparse) {
    return 'At least three days are needed before the ledger can speak of trends.';
  }
  return `avg protein ${p}g · carbs ${c}g · fat ${f}g · fiber ${fiber}g · calories ${formatThousands(kcal)}.`;
}

function buildTrendSrSummary(
  kcal: number,
  p: number,
  c: number,
  f: number,
  fiber: number,
  range: ProgressRange,
  sparse: Sparse,
): string {
  const label = rangeLabel(range);
  if (sparse.isSparse) {
    return `Trend summary, ${label}: not enough data.`;
  }
  return `Trend summary, ${label}: avg protein ${p} grams, carbs ${c} grams, fat ${f} grams, fiber ${fiber} grams, calories ${kcal}.`;
}

function buildLoggingSrSummary(
  perBucket: Map<string, BucketAccumulator>,
  window: ProgressWindow,
): string {
  const label = rangeLabel(window.range);
  let logged = 0;
  let meals = 0;
  for (const b of window.buckets) {
    const acc = perBucket.get(b)!;
    if (acc.entryCount > 0) logged += 1;
    meals += acc.entryCount;
  }
  if (window.range === 'D') {
    return `Logging consistency, today: ${logged} of ${window.bucketCount} hours with logs. ${meals} meals today.`;
  }
  return `Logging consistency, ${label}: ${logged} of ${window.bucketCount} days logged. ${meals} meals in range.`;
}

function rangeLabel(range: ProgressRange): string {
  if (range === 'D') return 'today';
  if (range === 'W') return 'this week';
  return 'rolling 30 days';
}

function humanize(nutrient: HeatmapNutrient): string {
  if (nutrient === 'vitamin_a') return 'Vitamin A';
  if (nutrient === 'vitamin_c') return 'Vitamin C';
  if (nutrient === 'vitamin_d') return 'Vitamin D';
  if (nutrient === 'iron') return 'Iron';
  return 'Calcium';
}

function formatG(n: number): string {
  return String(Math.round(n));
}

function formatThousands(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function nextMondayIso(nowIso: string, tz: string): string {
  const today = userTzDayFrom(nowIso, tz);
  const [y, m, d] = today.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return today;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  // 1 = Monday; 0 = Sunday. Intl has no locale-independent weekday-number
  // accessor for the user TZ, so approximate via UTC (sufficient for a
  // "next recalc" meta footer).
  const dayNum = dt.getUTCDay();
  const deltaToMonday = dayNum === 0 ? 1 : (8 - dayNum) % 7;
  const target = new Date(dt.getTime() + deltaToMonday * 24 * 60 * 60 * 1000);
  return target.toISOString();
}
