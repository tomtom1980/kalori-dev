/**
 * `lib/dashboard/aggregate.ts` — Task 3.5 pure aggregation.
 *
 * Given raw Supabase rows (today's food_entries, water_log, last-7-days
 * food_entries for the micros union) and the user's profile + timezone,
 * build the `DashboardSnapshot` consumed by RSC islands. Pure; no I/O.
 *
 * F5 contract: day filtering on `food_entries.logged_at` uses user-TZ
 * (`lib/time/day.ts` → `userTzDayFrom`). Entries with `logged_at` that
 * resolves to a different user-TZ day are excluded. The caller typically
 * already constrains by the UTC range but this filter is the authoritative
 * backstop.
 *
 * Tiebreakers:
 *   - MealCategory is the 5-tuple including `drink` (Codex R1 I1 fix).
 *   - Macro target split: default 25/45/30 (P/C/F) of calorie_target,
 *     converted to grams via 4/4/9 kcal/g. This is a display-only default
 *     until the nutrition package ships explicit per-user macro targets.
 *   - Chronometer status: `approaching` 80–100%, `on-target` 95–105%,
 *     `over-target` >105%, `way-over` >120%.
 *   - Edition number: days-since-created_at in user TZ.
 */
import { userTzDayFrom } from '@/lib/time/day';
import {
  formatMicroPercent,
  microStatus,
  sortMicrosByPriority,
} from '@/lib/nutrition/display-micros';

import {
  MEAL_CATEGORIES,
  mlFromWaterRow,
  type ChronometerData,
  type ChronometerStatus,
  type DashboardSnapshot,
  type Edition,
  type FoodEntry,
  type MacroContribution,
  type MacroRow,
  type MacroRowStatus,
  type MacrosByKey,
  type MealColumnData,
  type MealsByCategory,
  type MicroRow,
  type Profile,
  type WaterLogEntry,
} from './types';

// Default water target — 2 litres / day. Design-doc §5: 8 "glasses" baseline.
const DEFAULT_WATER_TARGET_ML = 2000;

// Default macro split of calorie_target. Each macro's kcal share:
// protein 25%, carbs 45%, fat 30%. Converted to grams via kcal/g.
const MACRO_KCAL_SHARE = { protein: 0.25, carbs: 0.45, fat: 0.3 };
const MACRO_KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
const FIBER_TARGET_G = 25;

export interface AggregateDayInput {
  entries: FoodEntry[];
  water: WaterLogEntry[];
  micros7d: FoodEntry[];
  profile: Profile;
  day: string;
  tz: string;
  now: string;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function aggregateDay(input: AggregateDayInput): DashboardSnapshot {
  const { entries, water, micros7d, profile, day, tz, now } = input;

  // Defensive: trust day strings but filter by user-TZ anyway (F5 backstop).
  const todayEntries = entries.filter((e) => userTzDayFrom(e.logged_at, tz) === day);
  const todayWater = water.filter((w) => w.date === day);

  const meals = groupMeals(todayEntries);
  const macros = aggregateMacros(todayEntries, profile);
  const chronometer = buildChronometer(todayEntries, profile, now);
  const waterBlock = {
    consumedMl: todayWater.reduce((n, w) => n + mlFromWaterRow(w), 0),
    targetMl: DEFAULT_WATER_TARGET_ML,
    entries: todayWater,
  };
  const micros = aggregateMicros(micros7d);
  const edition = buildEdition(profile, day, tz);

  return {
    edition,
    chronometer,
    macros,
    meals,
    water: waterBlock,
    micros,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupMeals(entries: FoodEntry[]): MealsByCategory {
  const empty = (): MealColumnData => ({
    category: 'breakfast',
    entries: [],
    totalKcal: 0,
    heaviestEntryId: null,
  });
  const cols: MealsByCategory = {
    breakfast: { ...empty(), category: 'breakfast' },
    lunch: { ...empty(), category: 'lunch' },
    dinner: { ...empty(), category: 'dinner' },
    snack: { ...empty(), category: 'snack' },
    drink: { ...empty(), category: 'drink' },
  };

  for (const e of entries) {
    const col = cols[e.meal_category];
    col.entries.push(e);
  }

  for (const cat of MEAL_CATEGORIES) {
    const col = cols[cat];
    col.entries.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    let total = 0;
    let heaviestId: string | null = null;
    let heaviestKcal = -1;
    for (const e of col.entries) {
      const kcal = entryKcal(e);
      total += kcal;
      if (kcal > heaviestKcal) {
        heaviestKcal = kcal;
        heaviestId = e.id;
      }
    }
    col.totalKcal = total;
    col.heaviestEntryId = heaviestId;
  }

  return cols;
}

function entryKcal(e: FoodEntry): number {
  return e.items.reduce((n, item) => n + item.kcal, 0);
}

function entryMacros(e: FoodEntry): {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
} {
  return e.items.reduce(
    (acc, item) => {
      const m = item.macros ?? {
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
      };
      acc.protein_g += m.protein_g;
      acc.carbs_g += m.carbs_g;
      acc.fat_g += m.fat_g;
      acc.fiber_g += m.fiber_g;
      return acc;
    },
    { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
}

function itemMacroG(item: FoodEntry['items'][number], key: MacroRow['key']): number {
  const m = item.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };
  if (key === 'protein') return m.protein_g;
  if (key === 'carbs') return m.carbs_g;
  if (key === 'fiber') return m.fiber_g;
  return m.fat_g;
}

function formatPortionLabel(item: FoodEntry['items'][number]): string {
  return `${item.portion} ${item.unit}`.trim();
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function macroContributions(
  entries: FoodEntry[],
  key: MacroRow['key'],
  totalG: number,
): MacroContribution[] {
  const rows: MacroContribution[] = [];
  for (const entry of entries) {
    entry.items.forEach((item, index) => {
      const grams = itemMacroG(item, key);
      if (grams <= 0) return;
      rows.push({
        id: `${entry.id}:${index}:${key}`,
        entryId: entry.id,
        mealCategory: entry.meal_category,
        loggedAt: entry.logged_at,
        itemName: item.name,
        portionLabel: formatPortionLabel(item),
        grams: roundOne(grams),
        pctOfTotal: totalG > 0 ? Math.round((grams / totalG) * 100) : 0,
      });
    });
  }
  return rows.sort((a, b) => {
    if (b.grams !== a.grams) return b.grams - a.grams;
    return a.loggedAt.localeCompare(b.loggedAt);
  });
}

function macroRowStatus(consumedG: number, targetG: number): MacroRowStatus {
  if (consumedG === 0 && targetG === 0) return 'empty';
  if (consumedG === 0) return 'empty';
  const pct = (consumedG / Math.max(targetG, 1)) * 100;
  if (pct > 105) return 'over';
  if (pct >= 95 && pct <= 105) return 'on-target';
  return 'default';
}

function aggregateMacros(entries: FoodEntry[], profile: Profile): MacrosByKey {
  const totals = entries.reduce(
    (acc, e) => {
      const m = entryMacros(e);
      acc.protein += m.protein_g;
      acc.carbs += m.carbs_g;
      acc.fat += m.fat_g;
      acc.fiber += m.fiber_g;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  // `calorie_target` is nullable in the DB (pre-onboarding profiles have
  // NULL). The dashboard onboarding guard should prevent reaching this
  // aggregation with a NULL, but treat it as 0 defensively so macro targets
  // degrade to zero rather than producing NaN.
  const target = profile.calorie_target ?? 0;
  const targetG = {
    protein: Math.round((target * MACRO_KCAL_SHARE.protein) / MACRO_KCAL_PER_G.protein),
    carbs: Math.round((target * MACRO_KCAL_SHARE.carbs) / MACRO_KCAL_PER_G.carbs),
    fat: Math.round((target * MACRO_KCAL_SHARE.fat) / MACRO_KCAL_PER_G.fat),
    fiber: FIBER_TARGET_G,
  };

  const build = (key: MacroRow['key'], consumed: number, target: number): MacroRow => {
    const consumedG = Math.round(consumed);
    return {
      key,
      consumedG,
      targetG: target,
      pct: target > 0 ? Math.round((consumed / target) * 100) : 0,
      status: macroRowStatus(consumed, target),
      contributions: macroContributions(entries, key, consumed),
    };
  };

  return {
    protein: build('protein', totals.protein, targetG.protein),
    carbs: build('carbs', totals.carbs, targetG.carbs),
    fat: build('fat', totals.fat, targetG.fat),
    fiber: build('fiber', totals.fiber, targetG.fiber),
  };
}

function buildChronometer(entries: FoodEntry[], profile: Profile, now: string): ChronometerData {
  // Defensive null coalesce — see `aggregateMacros` comment. `ChronometerRing`
  // also guards `formatNumber(null)` → "—" so downstream UI never crashes
  // if this path is ever reached with a pre-onboarding profile.
  const target = profile.calorie_target ?? 0;
  if (entries.length === 0) {
    return { status: 'empty', target };
  }
  const consumed = entries.reduce((n, e) => n + entryKcal(e), 0);
  const fiber = entries.reduce((n, e) => n + entryMacros(e).fiber_g, 0);
  const pct = target > 0 ? (consumed / target) * 100 : 0;
  const status = chronometerStatus(pct);
  const lastLoggedAt = entries.reduce<string | null>((latest, e) => {
    if (!latest) return e.logged_at;
    return e.logged_at > latest ? e.logged_at : latest;
  }, null);

  return {
    status,
    consumed: Math.round(consumed),
    target,
    fiber: { consumed: Math.round(fiber), target: FIBER_TARGET_G },
    nowAngle: nowAngleFromIso(now),
    entryCount: entries.length,
    lastLoggedAt,
  };
}

function chronometerStatus(pct: number): ChronometerStatus {
  if (pct > 120) return 'way-over';
  if (pct > 105) return 'over-target';
  if (pct >= 95 && pct <= 105) return 'on-target';
  if (pct >= 80) return 'approaching';
  return 'default';
}

function nowAngleFromIso(iso: string): number {
  // Map hours-of-day to 0..360 clock angle. 0h = 12 o'clock (top), clockwise.
  const d = new Date(iso);
  const hoursFraction = (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) / 24;
  return Math.round(hoursFraction * 360);
}

function aggregateMicros(weekEntries: FoodEntry[]): MicroRow[] {
  // Union + sum micronutrient values across all items in the 7-day window.
  const totals = new Map<string, number>();
  for (const entry of weekEntries) {
    for (const item of entry.items) {
      const micros = item.micros ?? {};
      for (const [name, value] of Object.entries(micros)) {
        if (typeof value !== 'number') continue;
        totals.set(name, (totals.get(name) ?? 0) + value);
      }
    }
  }
  if (totals.size === 0) return [];

  // RDA lookup — sparse. For micros the app doesn't know an RDA for, the
  // row still renders with pct=0 / status='low'; UI uses that state to
  // surface a caption rather than a bar.
  const rda = rdaLookup();
  const rows: MicroRow[] = [];
  for (const [name, consumed] of totals) {
    const r = rda[name.toLowerCase()] ?? null;
    rows.push({
      name,
      consumed,
      rda: r,
      pct: formatMicroPercent(consumed, r),
      status: microStatus(consumed, r),
    });
  }
  return sortMicrosByPriority(rows);
}

// Minimal baseline RDA table. Values chosen to exercise status transitions;
// the real nutrition pipeline will own the full NIH/NHS table.
function rdaLookup(): Record<string, number> {
  return {
    protein: 50,
    iron: 18,
    'vitamin d': 20,
    'vitamin c': 90,
    calcium: 1000,
    fiber: 28,
    magnesium: 400,
    potassium: 3500,
    zinc: 11,
    sodium: 2300,
    'vitamin a': 900,
    'vitamin b12': 2.4,
    'vitamin e': 15,
    'vitamin k': 120,
    folate: 400,
  };
}

function buildEdition(profile: Profile, day: string, tz: string): Edition {
  // Edition number = days since profile.created_at (user-TZ rounded).
  const createdDay = userTzDayFrom(profile.created_at, tz);
  const n = daysBetween(createdDay, day);

  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  const safeDate = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(safeDate);
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
  }).format(safeDate);

  return {
    n: Math.max(1, n),
    weekday,
    day: d ?? 1,
    month: monthName,
    year: y ?? 2026,
  };
}

function daysBetween(fromDay: string, toDay: string): number {
  const parse = (s: string): number => {
    const [y, m, d] = s.split('-').map((p) => parseInt(p, 10));
    if (!y || !m || !d) return 0;
    return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  };
  const a = parse(fromDay);
  const b = parse(toDay);
  if (a === 0 || b === 0) return 1;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
