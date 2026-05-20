import { createHash } from 'node:crypto';

import { sanitizeStringArray } from '@/lib/ai/sanitize';
import { mlFromWaterRow, type WaterLogEntry } from '@/lib/dashboard/types';
import { userTzDayFrom, userTzDayUtcRange } from '@/lib/time/day';

export type NutritionSummaryScope = 'dashboard-day' | 'progress-range';
export type NutritionSummaryRangePreset = 'dashboard-day' | 'last_7' | 'last_30' | 'custom';

export interface NutritionSummaryRange {
  readonly preset: NutritionSummaryRangePreset;
  readonly start_on: string;
  readonly end_on: string;
}

export interface NutritionSummaryProfile {
  readonly calorie_target: number | null;
  readonly protein_target_g: number | null;
  readonly carbs_target_g: number | null;
  readonly fat_target_g: number | null;
  readonly fiber_target_g: number | null;
  readonly cholesterol_target_mg: number | null;
  readonly current_weight_kg: number | null;
  readonly goal_weight_kg: number | null;
  readonly activity_level: string | null;
  readonly goal_pace: string | null;
  readonly target_mode: string | null;
  readonly unit_pref: string | null;
}

export interface NutritionTotals {
  readonly kcal: number;
  readonly protein_g: number;
  readonly carbs_g: number;
  readonly fat_g: number;
  readonly fiber_g: number;
  readonly cholesterol_mg: number;
}

export interface NutritionSummaryContext {
  readonly scope: NutritionSummaryScope;
  readonly range: NutritionSummaryRange;
  readonly timezone: string;
  readonly profile: NutritionSummaryProfile;
  readonly food: {
    readonly entry_count: number;
    readonly logged_days: number;
    readonly missing_days: readonly string[];
    readonly totals: NutritionTotals;
    readonly highlights: readonly string[];
    readonly daily: readonly {
      readonly date: string;
      readonly entry_count: number;
      readonly totals: NutritionTotals;
      readonly highlights: readonly string[];
    }[];
  };
  readonly water: {
    readonly log_count: number;
    readonly total_ml: number;
    readonly target_ml: number;
    readonly daily: readonly {
      readonly date: string;
      readonly total_ml: number;
      readonly log_count: number;
    }[];
  };
  readonly weight: {
    readonly log_count: number;
    readonly latest_kg: number | null;
    readonly latest_on: string | null;
    readonly trend_kg: number | null;
    readonly logs: readonly { readonly date: string; readonly weight_kg: number }[];
  };
  readonly caveats: readonly string[];
  readonly is_empty: boolean;
}

interface FoodEntryRow {
  readonly logged_at: string;
  readonly items?: unknown;
}

interface ItemLike {
  readonly name?: unknown;
  readonly kcal?: unknown;
  readonly macros?: {
    readonly protein_g?: unknown;
    readonly carbs_g?: unknown;
    readonly fat_g?: unknown;
    readonly fiber_g?: unknown;
    readonly cholesterol_mg?: unknown;
  };
}

interface WeightLogRow {
  readonly date: string;
  readonly weight_kg: unknown;
}

interface BuildInput {
  readonly supabase: {
    from: (table: string) => unknown;
  };
  readonly userId: string;
  readonly scope: NutritionSummaryScope;
  readonly day?: string | undefined;
  readonly range?: NutritionSummaryRange | undefined;
  readonly timezone: string;
  readonly profile: Record<string, unknown>;
}

const WATER_TARGET_ML = 2000;
const EMPTY_TOTALS: NutritionTotals = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  cholesterol_mg: 0,
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nullableString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function addTotals(a: NutritionTotals, b: NutritionTotals): NutritionTotals {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fiber_g: a.fiber_g + b.fiber_g,
    cholesterol_mg: a.cholesterol_mg + b.cholesterol_mg,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundTotals(totals: NutritionTotals): NutritionTotals {
  return {
    kcal: round1(totals.kcal),
    protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g),
    fat_g: round1(totals.fat_g),
    fiber_g: round1(totals.fiber_g),
    cholesterol_mg: round1(totals.cholesterol_mg),
  };
}

function itemTotals(item: ItemLike): NutritionTotals {
  return {
    kcal: num(item.kcal),
    protein_g: num(item.macros?.protein_g),
    carbs_g: num(item.macros?.carbs_g),
    fat_g: num(item.macros?.fat_g),
    fiber_g: num(item.macros?.fiber_g),
    cholesterol_mg: num(item.macros?.cholesterol_mg),
  };
}

function dayBuckets(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = start.split('-').map((p) => Number.parseInt(p, 10));
  const [ey, em, ed] = end.split('-').map((p) => Number.parseInt(p, 10));
  if (!sy || !sm || !sd || !ey || !em || !ed) return out;
  let cursor = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const limit = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  while (cursor <= limit) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

function profileFromRow(row: Record<string, unknown>): NutritionSummaryProfile {
  const calorie = nullableNum(row.calorie_target);
  return {
    calorie_target: calorie,
    protein_target_g: calorie === null ? null : Math.round((calorie * 0.25) / 4),
    carbs_target_g: calorie === null ? null : Math.round((calorie * 0.45) / 4),
    fat_target_g: calorie === null ? null : Math.round((calorie * 0.3) / 9),
    fiber_target_g: 30,
    cholesterol_target_mg: 300,
    current_weight_kg: nullableNum(row.current_weight_kg),
    goal_weight_kg: nullableNum(row.goal_weight_kg),
    activity_level: nullableString(row.activity_level),
    goal_pace: nullableString(row.goal_pace),
    target_mode: nullableString(row.target_mode),
    unit_pref: nullableString(row.unit_pref),
  };
}

export class NutritionSummaryContextReadError extends Error {
  constructor(
    readonly source: 'food_entries' | 'water_log' | 'weight_log',
    readonly causeValue: unknown,
  ) {
    super(`nutrition_summary_context_read_failed:${source}`);
    this.name = 'NutritionSummaryContextReadError';
  }
}

function aggregateFood(
  rows: readonly FoodEntryRow[],
  days: readonly string[],
  timezone: string,
): NutritionSummaryContext['food'] {
  const byDay = new Map<
    string,
    { entry_count: number; totals: NutritionTotals; highlights: string[] }
  >();
  for (const day of days) {
    byDay.set(day, { entry_count: 0, totals: { ...EMPTY_TOTALS }, highlights: [] });
  }
  for (const row of rows) {
    if (typeof row.logged_at !== 'string') continue;
    const day = userTzDayFrom(row.logged_at, timezone);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.entry_count += 1;
    const items = Array.isArray(row.items) ? (row.items as ItemLike[]) : [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      bucket.totals = addTotals(bucket.totals, itemTotals(item));
      if (typeof item.name === 'string' && bucket.highlights.length < 4) {
        bucket.highlights.push(item.name);
      }
    }
  }

  const daily = Array.from(byDay.entries()).map(([date, bucket]) => ({
    date,
    entry_count: bucket.entry_count,
    totals: roundTotals(bucket.totals),
    highlights: sanitizeStringArray(bucket.highlights),
  }));
  const totals = roundTotals(daily.reduce((sum, day) => addTotals(sum, day.totals), EMPTY_TOTALS));
  const logged = daily.filter((day) => day.entry_count > 0);
  return {
    entry_count: rows.length,
    logged_days: logged.length,
    missing_days: daily.filter((day) => day.entry_count === 0).map((day) => day.date),
    totals,
    highlights: sanitizeStringArray(logged.flatMap((day) => day.highlights)).slice(0, 8),
    daily: daily.filter(
      (day) => day.entry_count > 0 || day.totals.kcal > 0 || day.highlights.length > 0,
    ),
  };
}

function aggregateWater(
  rows: readonly WaterLogEntry[],
  days: readonly string[],
): NutritionSummaryContext['water'] {
  const byDay = new Map<string, { total_ml: number; log_count: number }>();
  for (const day of days) byDay.set(day, { total_ml: 0, log_count: 0 });
  for (const row of rows) {
    const bucket = byDay.get(row.date);
    if (!bucket) continue;
    bucket.total_ml += mlFromWaterRow(row);
    bucket.log_count += 1;
  }
  const daily = Array.from(byDay.entries())
    .map(([date, bucket]) => ({ date, total_ml: bucket.total_ml, log_count: bucket.log_count }))
    .filter((day) => day.log_count > 0);
  return {
    log_count: rows.length,
    total_ml: daily.reduce((sum, day) => sum + day.total_ml, 0),
    target_ml: WATER_TARGET_ML,
    daily,
  };
}

function aggregateWeight(rows: readonly WeightLogRow[]): NutritionSummaryContext['weight'] {
  const logs = rows
    .map((row) => ({ date: row.date, weight_kg: nullableNum(row.weight_kg) }))
    .filter((row): row is { date: string; weight_kg: number } => row.weight_kg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = logs[0];
  const latest = logs[logs.length - 1];
  return {
    log_count: logs.length,
    latest_kg: latest?.weight_kg ?? null,
    latest_on: latest?.date ?? null,
    trend_kg:
      first && latest && first !== latest ? round1(latest.weight_kg - first.weight_kg) : null,
    logs,
  };
}

function caveatsFor(context: Omit<NutritionSummaryContext, 'caveats' | 'is_empty'>): string[] {
  const caveats: string[] = [];
  const totalDays = dayBuckets(context.range.start_on, context.range.end_on).length;
  if (context.food.logged_days > 0 && context.food.logged_days < totalDays) {
    caveats.push(`Only ${context.food.logged_days} of ${totalDays} days have food entries.`);
  }
  if (context.food.entry_count === 0) caveats.push('No food entries are present in this range.');
  if (context.water.log_count === 0) caveats.push('No water logs are present in this range.');
  if (context.weight.log_count === 0) caveats.push('No weight logs are present in this range.');
  return caveats;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, stable(val)]),
    );
  }
  return value;
}

export function computeNutritionSummaryFingerprint(context: NutritionSummaryContext): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(context)))
    .digest('hex');
}

function table<T>(supabase: BuildInput['supabase'], name: string): T {
  return supabase.from(name) as T;
}

export async function buildNutritionSummaryContext(
  input: BuildInput,
): Promise<NutritionSummaryContext> {
  const range =
    input.scope === 'dashboard-day'
      ? { preset: 'dashboard-day' as const, start_on: input.day!, end_on: input.day! }
      : input.range!;
  const days = dayBuckets(range.start_on, range.end_on);
  const startUtc = userTzDayUtcRange(range.start_on, input.timezone).startUtc;
  const endUtc = userTzDayUtcRange(range.end_on, input.timezone).endUtc;

  const foodQuery = table<{
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        gte: (
          col: string,
          val: string,
        ) => {
          lt: (col: string, val: string) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  }>(input.supabase, 'food_entries');
  const waterQuery = table<{
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        gte: (
          col: string,
          val: string,
        ) => {
          lte: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      };
    };
  }>(input.supabase, 'water_log');
  const weightQuery = table<{
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        gte: (
          col: string,
          val: string,
        ) => {
          lte: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      };
    };
  }>(input.supabase, 'weight_log');

  const [foodResult, waterResult, weightResult] = await Promise.all([
    foodQuery
      .select('logged_at, items')
      .eq('user_id', input.userId)
      .gte('logged_at', startUtc)
      .lt('logged_at', endUtc),
    waterQuery
      .select('id, client_id, date, count, unit')
      .eq('user_id', input.userId)
      .gte('date', range.start_on)
      .lte('date', range.end_on)
      .order('date', { ascending: true }),
    weightQuery
      .select('date, weight_kg')
      .eq('user_id', input.userId)
      .gte('date', range.start_on)
      .lte('date', range.end_on)
      .order('date', { ascending: true }),
  ]);
  if (foodResult.error) {
    throw new NutritionSummaryContextReadError('food_entries', foodResult.error);
  }
  if (waterResult.error) {
    throw new NutritionSummaryContextReadError('water_log', waterResult.error);
  }
  if (weightResult.error) {
    throw new NutritionSummaryContextReadError('weight_log', weightResult.error);
  }

  const partial = {
    scope: input.scope,
    range,
    timezone: input.timezone,
    profile: profileFromRow(input.profile),
    food: aggregateFood((foodResult.data ?? []) as FoodEntryRow[], days, input.timezone),
    water: aggregateWater((waterResult.data ?? []) as WaterLogEntry[], days),
    weight: aggregateWeight((weightResult.data ?? []) as WeightLogRow[]),
  };
  const isEmpty =
    partial.food.entry_count === 0 &&
    partial.water.log_count === 0 &&
    partial.weight.log_count === 0;
  return {
    ...partial,
    caveats: caveatsFor(partial),
    is_empty: isEmpty,
  };
}
