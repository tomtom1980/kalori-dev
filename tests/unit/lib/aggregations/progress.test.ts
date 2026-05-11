/**
 * Unit tests for `lib/aggregations/progress.ts` (Task 4.3a).
 *
 * Covers the five aggregation functions fed into the /progress page Suspense
 * boundaries + the deterministic trend commentary used by TrendSummary and
 * the heatmap footer. Deterministic, zero-I/O: the functions consume raw
 * rows (shape-compatible with Supabase's `food_entries` + `water_log`) and
 * return Zod-parsed output.
 *
 * TDD contract (briefing §6 "TDD Contract — test matrix"):
 *   - D = rolling 24h from most recent user-TZ midnight (hourly buckets)
 *   - W = rolling 7 days ending today (user-TZ)
 *   - M = rolling 30 days ending today (NOT calendar month)
 *   - Sparse threshold = 3 distinct logged user-TZ days in the window
 *   - Tombstone tolerance: food_entries rows whose `library_item_id` points
 *     at a tombstoned library item MUST still aggregate via the row's own
 *     nutrition snapshot (per Task 4.2 carried-context #3)
 *   - TZ: every window boundary computed via `profiles.timezone` (I5)
 */
import { describe, expect, it } from 'vitest';

import {
  aggregateProgress,
  computeWindow,
  rampClassForPct,
  type AggregateProgressInput,
  type FoodEntryRow,
  type ProgressRange,
} from '@/lib/aggregations/progress';

// Deterministic 2026-04-24 anchor. The test fixtures and the `now` input
// are pinned to this so the rolling windows are reproducible across runs.
const NOW_ISO = '2026-04-24T07:15:00.000Z'; // 14:15 in UTC+7 (Asia/Ho_Chi_Minh)
const TZ = 'Asia/Ho_Chi_Minh';

function entry(
  loggedAt: string,
  opts: {
    kcal?: number;
    p?: number;
    c?: number;
    f?: number;
    fiber?: number;
    micros?: Record<string, number>;
    libraryItemId?: string | null;
  } = {},
): FoodEntryRow {
  return {
    id: `e-${loggedAt}-${Math.random().toString(36).slice(2, 8)}`,
    logged_at: loggedAt,
    meal_category: 'lunch',
    library_item_id: opts.libraryItemId ?? null,
    items: [
      {
        name: 'Bún bò Huế',
        portion: 1,
        unit: 'bowl',
        kcal: opts.kcal ?? 500,
        macros: {
          protein_g: opts.p ?? 25,
          carbs_g: opts.c ?? 60,
          fat_g: opts.f ?? 15,
          fiber_g: opts.fiber ?? 4,
        },
        micros: opts.micros ?? { iron: 3, calcium: 80 },
        confidence: 0.92,
      },
    ],
  };
}

function baseInput(entries: FoodEntryRow[], range: ProgressRange): AggregateProgressInput {
  return {
    range,
    now: NOW_ISO,
    tz: TZ,
    profile: {
      calorie_target: 2000,
      protein_target_g: 125,
      carbs_target_g: 225,
      fat_target_g: 67,
      fiber_target_g: 30,
    },
    entries,
  };
}

describe('lib/aggregations/progress', () => {
  describe('computeWindow', () => {
    it('D range = rolling 24h from most recent user-TZ midnight', () => {
      // 14:15 Apr 24 UTC+7 → most recent midnight = Apr 24 00:00 UTC+7 =
      // Apr 23 17:00Z. Window = [Apr 23 17:00Z, Apr 24 07:15Z].
      const win = computeWindow('D', NOW_ISO, TZ);
      expect(win.startUtc).toBe('2026-04-23T17:00:00.000Z');
      // endUtc = now (the current instant)
      expect(new Date(win.endUtc).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-04-24T07:15:00.000Z').getTime(),
      );
      expect(win.userTzStartDay).toBe('2026-04-24');
      expect(win.userTzEndDay).toBe('2026-04-24');
      expect(win.bucketCount).toBe(24); // hourly bins
    });

    it('W range = rolling 7 days ending today, user-TZ', () => {
      const win = computeWindow('W', NOW_ISO, TZ);
      // 7-day window inclusive of today (Apr 24) → Apr 18 through Apr 24.
      expect(win.userTzStartDay).toBe('2026-04-18');
      expect(win.userTzEndDay).toBe('2026-04-24');
      expect(win.bucketCount).toBe(7);
    });

    it('M range = rolling 30 days ending today (NOT calendar month)', () => {
      const win = computeWindow('M', NOW_ISO, TZ);
      // 30-day window inclusive of today → Mar 26 through Apr 24.
      expect(win.userTzStartDay).toBe('2026-03-26');
      expect(win.userTzEndDay).toBe('2026-04-24');
      expect(win.bucketCount).toBe(30);
    });

    it('M range rolls forward across month-end without snap-back', () => {
      // On May 1 UTC+7, the window should be Apr 2 → May 1. NOT Apr 1 → Apr
      // 30 (which a calendar-month reading would produce).
      const win = computeWindow('M', '2026-05-01T06:00:00.000Z', TZ);
      expect(win.userTzStartDay).toBe('2026-04-02');
      expect(win.userTzEndDay).toBe('2026-05-01');
    });

    it('W range respects UTC-12 boundary', () => {
      const win = computeWindow('W', '2026-04-24T11:00:00.000Z', 'Etc/GMT+12');
      // UTC 11:00 Apr 24 = 23:00 Apr 23 at UTC-12. Today in user TZ = Apr 23.
      expect(win.userTzEndDay).toBe('2026-04-23');
    });

    it('W range respects UTC+13 boundary', () => {
      const win = computeWindow('W', '2026-04-24T11:00:00.000Z', 'Pacific/Tongatapu');
      // UTC 11:00 Apr 24 = 00:00 Apr 25 at UTC+13. Today in user TZ = Apr 25.
      expect(win.userTzEndDay).toBe('2026-04-25');
    });

    // -----------------------------------------------------------------
    // Codex Round 1 — Critical C-2: non-integer-offset zones.
    // These tests FAILED prior to the fix: the old `userTzMidnightUtc`
    // scanned whole-hour UTC ticks and picked the first whose user-TZ
    // day string matched. For zones like Asia/Kathmandu (UTC+5:45) or
    // Asia/Kolkata (UTC+5:30), user-TZ midnight never falls on a whole
    // UTC hour — it's at 18:15 / 18:30 UTC. The old scan's startUtc was
    // off by 15/30/45 minutes, mis-bucketing boundary entries.
    // -----------------------------------------------------------------

    it('D range places user-TZ midnight at :45 for Asia/Kathmandu (UTC+5:45)', () => {
      // Apr 24 06:00 UTC = Apr 24 11:45 Asia/Kathmandu.
      // Most recent user-TZ midnight = Apr 24 00:00 local = Apr 23 18:15 UTC.
      const win = computeWindow('D', '2026-04-24T06:00:00.000Z', 'Asia/Kathmandu');
      expect(win.userTzStartDay).toBe('2026-04-24');
      expect(win.userTzEndDay).toBe('2026-04-24');
      expect(win.startUtc).toBe('2026-04-23T18:15:00.000Z');
    });

    it('D range places user-TZ midnight at :30 for Asia/Kolkata (UTC+5:30)', () => {
      // Apr 24 06:00 UTC = Apr 24 11:30 Asia/Kolkata.
      // Most recent user-TZ midnight = Apr 24 00:00 local = Apr 23 18:30 UTC.
      const win = computeWindow('D', '2026-04-24T06:00:00.000Z', 'Asia/Kolkata');
      expect(win.userTzStartDay).toBe('2026-04-24');
      expect(win.startUtc).toBe('2026-04-23T18:30:00.000Z');
    });

    it('D range places user-TZ midnight at :30 for Pacific/Marquesas (UTC-9:30)', () => {
      // Apr 24 20:00 UTC = Apr 24 10:30 Pacific/Marquesas.
      // Most recent user-TZ midnight = Apr 24 00:00 local = Apr 24 09:30 UTC.
      const win = computeWindow('D', '2026-04-24T20:00:00.000Z', 'Pacific/Marquesas');
      expect(win.userTzStartDay).toBe('2026-04-24');
      expect(win.startUtc).toBe('2026-04-24T09:30:00.000Z');
    });

    it('D range places user-TZ midnight at :30 for Australia/Adelaide (UTC+9:30/+10:30)', () => {
      // Pick a date safely in AEST (Australian non-DST, UTC+9:30).
      // July 15 02:00 UTC = July 15 11:30 Australia/Adelaide.
      // Most recent user-TZ midnight = July 15 00:00 local = July 14 14:30 UTC.
      const win = computeWindow('D', '2026-07-15T02:00:00.000Z', 'Australia/Adelaide');
      expect(win.userTzStartDay).toBe('2026-07-15');
      expect(win.startUtc).toBe('2026-07-14T14:30:00.000Z');
    });

    it('D range places user-TZ midnight at :00 for Pacific/Kiritimati (UTC+14, extreme)', () => {
      // Apr 24 05:00 UTC = Apr 24 19:00 Pacific/Kiritimati.
      // Most recent user-TZ midnight = Apr 24 00:00 local = Apr 23 10:00 UTC.
      const win = computeWindow('D', '2026-04-24T05:00:00.000Z', 'Pacific/Kiritimati');
      expect(win.userTzStartDay).toBe('2026-04-24');
      expect(win.startUtc).toBe('2026-04-23T10:00:00.000Z');
    });
  });

  describe('rampClassForPct (heatmap c0..c9 mapping)', () => {
    it('maps 0% to c0', () => {
      expect(rampClassForPct(0)).toBe('c0');
    });
    it('maps 5% (near-empty) to c0', () => {
      expect(rampClassForPct(5)).toBe('c0');
    });
    it('maps 12% (mid c1) to c1', () => {
      expect(rampClassForPct(12)).toBe('c1');
    });
    it('maps 55% to c4 (c4 band 45-60)', () => {
      expect(rampClassForPct(55)).toBe('c4');
    });
    it('maps 95% (on-target band) to c7', () => {
      expect(rampClassForPct(95)).toBe('c7');
    });
    it('maps 110% (over) to c8', () => {
      expect(rampClassForPct(110)).toBe('c8');
    });
    it('maps 200% (way over) to c9', () => {
      expect(rampClassForPct(200)).toBe('c9');
    });
  });

  describe('aggregateProgress — CalorieAdherence', () => {
    it('W: computes per-day kcal totals and adherence classes', () => {
      const entries = [
        entry('2026-04-18T05:00:00.000Z', { kcal: 1800 }), // Apr 18 UTC+7 (12:00 local)
        entry('2026-04-20T05:00:00.000Z', { kcal: 2100 }), // Apr 20
        entry('2026-04-22T05:00:00.000Z', { kcal: 950 }), // Apr 22 — approaching
        entry('2026-04-24T03:00:00.000Z', { kcal: 1900 }), // Apr 24 — under
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));

      expect(result.calorie.points).toHaveLength(7);
      // Day 2026-04-18 = 1800 kcal (target 2000) → status 'approaching' per
      // the 75-100% band — but we standardize on a 3-tier rule:
      // under <80%, on-target 80-105%, over >105%. Tests validate 1800/2000
      // = 90% → on-target.
      const apr18 = result.calorie.points.find((p) => p.bucket === '2026-04-18');
      expect(apr18).toBeDefined();
      expect(apr18?.kcalConsumed).toBe(1800);
      expect(apr18?.adherenceClass).toBe('on-target');

      const apr20 = result.calorie.points.find((p) => p.bucket === '2026-04-20');
      expect(apr20?.adherenceClass).toBe('over');

      const apr22 = result.calorie.points.find((p) => p.bucket === '2026-04-22');
      expect(apr22?.adherenceClass).toBe('under'); // 950/2000 = 48% <80%
    });

    it('populates sparse.isSparse = true when <3 distinct days logged', () => {
      const entries = [
        entry('2026-04-22T05:00:00.000Z', { kcal: 1800 }),
        entry('2026-04-24T03:00:00.000Z', { kcal: 1900 }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.calorie.sparse.daysLogged).toBe(2);
      expect(result.calorie.sparse.isSparse).toBe(true);
      expect(result.calorie.sparse.threshold).toBe(3);
    });

    it('excludes entries outside the window', () => {
      const entries = [
        entry('2026-04-10T05:00:00.000Z', { kcal: 9999 }), // outside 7d window
        entry('2026-04-22T05:00:00.000Z', { kcal: 1800 }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      // The Apr 10 entry must NOT appear in the 7 buckets.
      const allBuckets = result.calorie.points.map((p) => p.bucket);
      expect(allBuckets).not.toContain('2026-04-10');
    });
  });

  describe('aggregateProgress — MacroDistribution', () => {
    it('W: sums protein, carbs, fat, fiber per day', () => {
      const entries = [
        entry('2026-04-22T05:00:00.000Z', { p: 40, c: 90, f: 20, fiber: 10 }),
        entry('2026-04-22T12:00:00.000Z', { p: 35, c: 60, f: 15, fiber: 8 }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      const apr22 = result.macro.points.find((p) => p.bucket === '2026-04-22');
      expect(apr22?.proteinG).toBe(75);
      expect(apr22?.carbsG).toBe(150);
      expect(apr22?.fatG).toBe(35);
      expect(apr22?.fiberG).toBe(18);
      expect(apr22?.proteinTargetG).toBe(125);
      expect(apr22?.carbsTargetG).toBe(225);
      expect(apr22?.fatTargetG).toBe(67);
      expect(apr22?.fiberTargetG).toBe(30);
    });
  });

  describe('aggregateProgress — MicronutrientHeatmap', () => {
    it('W: emits 5 minor nutrient rows x bucketCount cells (5 x 7 = 35)', () => {
      const entries = [
        entry('2026-04-24T03:00:00.000Z', {
          p: 100,
          fiber: 25,
          micros: { vitamin_a: 800, vitamin_c: 90, vitamin_d: 10, iron: 12, calcium: 800 },
        }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.heatmap.nutrients).toEqual([
        'vitamin_a',
        'vitamin_c',
        'vitamin_d',
        'iron',
        'calcium',
      ]);
      expect(result.heatmap.cells).toHaveLength(5 * 7);
      const apr24 = result.heatmap.cells.filter((c) => c.bucket === '2026-04-24');
      expect(apr24).toHaveLength(5); // one cell per minor nutrient for today
    });

    it('assigns rampClass based on pctDv', () => {
      const entries = [
        entry('2026-04-24T03:00:00.000Z', {
          micros: { vitamin_a: 900, vitamin_c: 45, vitamin_d: 20, iron: 18, calcium: 1000 },
        }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      const vitaminAApr24 = result.heatmap.cells.find(
        (c) => c.nutrient === 'vitamin_a' && c.bucket === '2026-04-24',
      );
      expect(vitaminAApr24?.pctDv).toBe(100);
      expect(vitaminAApr24?.rampClass).toBe('c7'); // on-target band
      const vitaminCApr24 = result.heatmap.cells.find(
        (c) => c.nutrient === 'vitamin_c' && c.bucket === '2026-04-24',
      );
      expect(vitaminCApr24?.pctDv).toBe(50);
      // 50% is within the c3 band (40-55%); ramp bands per briefing §5.
      expect(vitaminCApr24?.rampClass).toBe('c3');
    });
  });

  describe('aggregateProgress — TrendSummary', () => {
    it('W: computes avg protein, carbs, fat, fiber, calories across logged days', () => {
      const entries = [
        entry('2026-04-18T05:00:00.000Z', { kcal: 1800, p: 100, c: 200, f: 60, fiber: 18 }),
        entry('2026-04-20T05:00:00.000Z', { kcal: 2000, p: 120, c: 220, f: 65, fiber: 20 }),
        entry('2026-04-22T05:00:00.000Z', { kcal: 2200, p: 140, c: 240, f: 70, fiber: 22 }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.trend.caloriesAvg).toBe(2000);
      expect(result.trend.proteinAvgG).toBe(120);
      expect(result.trend.carbsAvgG).toBe(220);
      expect(result.trend.fatAvgG).toBe(65);
      expect(result.trend.fiberAvgG).toBe(20);
    });

    it('emits a deterministic italic-serif commentary sentence', () => {
      const entries = [
        entry('2026-04-22T05:00:00.000Z', { p: 100, c: 200, f: 60, kcal: 1800 }),
        entry('2026-04-23T05:00:00.000Z', { p: 100, c: 200, f: 60, kcal: 1800 }),
        entry('2026-04-24T03:00:00.000Z', { p: 100, c: 200, f: 60, kcal: 1800 }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.trend.commentary).toMatch(/avg/i);
      expect(result.trend.commentary).toContain('1,800');
    });
  });

  describe('aggregateProgress — LoggingConsistency', () => {
    it('W: emits one cell per day in bucketCount, marks logged=true iff any entry', () => {
      const entries = [
        entry('2026-04-22T05:00:00.000Z'),
        entry('2026-04-22T12:00:00.000Z'),
        entry('2026-04-24T03:00:00.000Z'),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.logging.days).toHaveLength(7);

      const apr22 = result.logging.days.find((d) => d.date === '2026-04-22');
      expect(apr22?.logged).toBe(true);
      expect(apr22?.entryCount).toBe(2);

      const apr23 = result.logging.days.find((d) => d.date === '2026-04-23');
      expect(apr23?.logged).toBe(false);
      expect(apr23?.entryCount).toBe(0);
    });
  });

  describe('aggregateProgress — tombstone / orphan FK tolerance', () => {
    it('aggregates entries whose library_item_id is null (pre-snapshot manual entries)', () => {
      const entries = [entry('2026-04-24T03:00:00.000Z', { libraryItemId: null, kcal: 500 })];
      const result = aggregateProgress(baseInput(entries, 'W'));
      const apr24 = result.calorie.points.find((p) => p.bucket === '2026-04-24');
      expect(apr24?.kcalConsumed).toBe(500);
    });

    it('aggregates entries with orphaned library_item_id (tombstoned library item) via snapshot items', () => {
      // Entry row carries its own nutrition snapshot in `items[]` per Task
      // 3.4 contract, so a tombstoned library item on the other side of the
      // FK cannot corrupt the aggregate.
      const entries = [
        entry('2026-04-24T03:00:00.000Z', {
          libraryItemId: '00000000-0000-0000-0000-0000deadbeef',
          kcal: 620,
          p: 30,
          c: 70,
          f: 18,
        }),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      const apr24 = result.calorie.points.find((p) => p.bucket === '2026-04-24');
      expect(apr24?.kcalConsumed).toBe(620);
    });
  });

  describe('aggregateProgress — D range hourly bucketing', () => {
    it('D: emits 24 hourly buckets for calorie + macro', () => {
      const entries = [
        entry('2026-04-24T01:00:00.000Z'), // 08:00 local
        entry('2026-04-24T05:30:00.000Z'), // 12:30 local
      ];
      const result = aggregateProgress(baseInput(entries, 'D'));
      expect(result.calorie.points).toHaveLength(24);
      expect(result.macro.points).toHaveLength(24);
    });
  });

  // -------------------------------------------------------------------
  // Codex Round 1 — Critical C-3 + I-3: DST transitions.
  // Old impl unconditionally emitted 24 hourly buckets for the D range,
  // which is wrong on DST transition days. On spring-forward days local
  // time skips an hour so the day has 23 buckets; on fall-back days it
  // repeats an hour so the day has 25. Old impl's hour-label bucketing
  // also collapsed the two distinct local hours into one bucket on the
  // fall-back day.
  // -------------------------------------------------------------------
  describe('computeWindow — DST transitions (C-3)', () => {
    it('D: spring-forward day has 23 buckets in Europe/London (2026-03-29)', () => {
      // Europe/London spring-forward: 2026-03-29 01:00 local → 02:00 local
      // (the 01:xx hour does not exist). Day has 23 hours.
      // 2026-03-29 11:00 UTC = 12:00 London (BST after switch).
      const win = computeWindow('D', '2026-03-29T11:00:00.000Z', 'Europe/London');
      expect(win.userTzStartDay).toBe('2026-03-29');
      expect(win.bucketCount).toBe(23);
      expect(win.buckets).toHaveLength(23);
    });

    it('D: fall-back day has 25 buckets in America/New_York (2026-11-01)', () => {
      // America/New_York fall-back: 2026-11-01 02:00 local → 01:00 local
      // (the 01:xx hour repeats). Day has 25 hours.
      // 2026-11-01 18:00 UTC = 13:00 EST after switch.
      const win = computeWindow('D', '2026-11-01T18:00:00.000Z', 'America/New_York');
      expect(win.userTzStartDay).toBe('2026-11-01');
      expect(win.bucketCount).toBe(25);
      expect(win.buckets).toHaveLength(25);
    });

    it('D: non-DST day still has 24 buckets in Europe/London', () => {
      // Normal day mid-April; must not regress integer offsets.
      const win = computeWindow('D', '2026-04-15T12:00:00.000Z', 'Europe/London');
      expect(win.userTzStartDay).toBe('2026-04-15');
      expect(win.bucketCount).toBe(24);
    });

    it('D: non-DST day still has 24 buckets in America/New_York', () => {
      const win = computeWindow('D', '2026-04-15T16:00:00.000Z', 'America/New_York');
      expect(win.userTzStartDay).toBe('2026-04-15');
      expect(win.bucketCount).toBe(24);
    });
  });

  describe('aggregateProgress — DST bucketing (C-3 + I-3)', () => {
    it('D: placement at 01:30 local on NY fall-back day lands in the correct bucket', () => {
      // Nov 1 2026 fall-back in America/New_York:
      //   01:00-02:00 EDT (UTC-4) — the "first" 1:xx hour
      //   01:00-02:00 EST (UTC-5) — the "repeated" 1:xx hour
      // Entry at 2026-11-01T05:30:00Z = 01:30 EDT (first 1:xx hour).
      // Entry at 2026-11-01T06:30:00Z = 01:30 EST (second 1:xx hour).
      const entries = [
        entry('2026-11-01T05:30:00.000Z', { kcal: 100 }),
        entry('2026-11-01T06:30:00.000Z', { kcal: 200 }),
      ];
      const result = aggregateProgress({
        ...baseInput(entries, 'D'),
        now: '2026-11-01T18:00:00.000Z',
        tz: 'America/New_York',
      });
      // 25 buckets; both entries fall into the 1am region of the day.
      // Total kcal summed across the two 1:xx buckets should be 300.
      const totalKcal = result.calorie.points.reduce((sum, p) => sum + p.kcalConsumed, 0);
      expect(totalKcal).toBe(300);
      expect(result.calorie.points).toHaveLength(25);
    });

    it('D: spring-forward day in London produces 23 calorie buckets', () => {
      const entries = [
        entry('2026-03-29T10:00:00.000Z', { kcal: 500 }), // 11:00 local BST
      ];
      const result = aggregateProgress({
        ...baseInput(entries, 'D'),
        now: '2026-03-29T11:00:00.000Z',
        tz: 'Europe/London',
      });
      expect(result.calorie.points).toHaveLength(23);
      const totalKcal = result.calorie.points.reduce((sum, p) => sum + p.kcalConsumed, 0);
      expect(totalKcal).toBe(500);
    });

    it('D: entry at :45 local in Asia/Kathmandu is bucketed correctly', () => {
      // Apr 24 05:00 UTC = Apr 24 10:45 Asia/Kathmandu.
      const entries = [entry('2026-04-24T05:00:00.000Z', { kcal: 400 })];
      const result = aggregateProgress({
        ...baseInput(entries, 'D'),
        now: '2026-04-24T06:00:00.000Z',
        tz: 'Asia/Kathmandu',
      });
      const totalKcal = result.calorie.points.reduce((sum, p) => sum + p.kcalConsumed, 0);
      expect(totalKcal).toBe(400);
    });

    it('W: entries across DST fall-back boundary bucket into correct user-TZ days', () => {
      // DST fall-back in NY is Nov 1. Entries on Oct 31, Nov 1, Nov 2 should
      // land in their respective day buckets despite the repeated hour.
      const entries = [
        entry('2026-10-31T15:00:00.000Z', { kcal: 1800 }), // Oct 31 11:00 EDT
        entry('2026-11-01T16:00:00.000Z', { kcal: 2000 }), // Nov 1 11:00 EST (after switch)
        entry('2026-11-02T16:00:00.000Z', { kcal: 1900 }), // Nov 2 11:00 EST
      ];
      const result = aggregateProgress({
        ...baseInput(entries, 'W'),
        now: '2026-11-02T20:00:00.000Z',
        tz: 'America/New_York',
      });
      const oct31 = result.calorie.points.find((p) => p.bucket === '2026-10-31');
      const nov01 = result.calorie.points.find((p) => p.bucket === '2026-11-01');
      const nov02 = result.calorie.points.find((p) => p.bucket === '2026-11-02');
      expect(oct31?.kcalConsumed).toBe(1800);
      expect(nov01?.kcalConsumed).toBe(2000);
      expect(nov02?.kcalConsumed).toBe(1900);
    });
  });

  describe('aggregateProgress — SR summary for every chart', () => {
    it('emits non-empty srSummary for each chart', () => {
      const entries = [
        entry('2026-04-22T05:00:00.000Z'),
        entry('2026-04-23T05:00:00.000Z'),
        entry('2026-04-24T05:00:00.000Z'),
      ];
      const result = aggregateProgress(baseInput(entries, 'W'));
      expect(result.calorie.srSummary).toMatch(/calorie/i);
      expect(result.macro.srSummary).toMatch(/macro|protein|carb|fat/i);
      expect(result.heatmap.srSummary).toMatch(/micronutrient|heatmap/i);
      expect(result.trend.srSummary).toMatch(/trend|avg/i);
      expect(result.logging.srSummary).toMatch(/logg|days/i);
    });
  });
});
