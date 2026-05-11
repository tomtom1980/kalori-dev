/**
 * `lib/dashboard/types.ts` — Task 3.5 pure type contracts.
 *
 * Shapes consumed by RSC islands + aggregation. No runtime — these types
 * flow from the aggregation layer to components via prop-drilling (no
 * client-side TanStack/SWR store per design-doc §11).
 */
import type { ParsedItemT } from '@/lib/ai/schemas';

/**
 * 5-tuple MealCategory — authoritative per `app/api/entries/save/route.ts:54`
 * (Task 3.4 Codex R1 I1 fix). ui-design.md §7.2.6 still shows 4-tuple; the
 * route-handler enum wins.
 */
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export const MEAL_CATEGORIES: readonly MealCategory[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'drink',
] as const;

export type EntrySource = 'text' | 'photo' | 'library' | 'manual';

/**
 * Profile slice the dashboard reads. Matches the columns selected in
 * `lib/dashboard/fetch.ts` → `fetchProfile`.
 *
 * Nullability matches migration 0002: `calorie_target`, `bmr`, `tdee` are
 * `numeric(7,2)` without NOT NULL and stay NULL until the onboarding
 * wizard computes them. The dashboard gates on `onboarding_completed_at`
 * (F-UI-3.7-C) so these should always be non-null by the time the
 * dashboard renders, but the types stay honest as defense-in-depth —
 * `<ChronometerRing />` normalizes null / NaN internally.
 */
export interface Profile {
  id: string;
  calorie_target: number | null;
  bmr: number | null;
  tdee: number | null;
  timezone: string;
  created_at: string;
  last_dashboard_visit_at: string | null;
  target_mode: 'auto' | 'manual' | null;
  manual_override_value: number | null;
}

/**
 * food_entries row shape the dashboard reads. The `items` array is a JSONB
 * column of Gemini-parsed items (kcal + macros + micros). `client_id` is the
 * I11 idempotency anchor.
 */
export interface FoodEntry {
  id: string;
  client_id: string;
  logged_at: string;
  meal_category: MealCategory;
  source: EntrySource;
  library_item_id: string | null;
  items: ParsedItemT[];
  ai_reasoning: string | null;
}

/**
 * water_log row shape. `count + unit` is the semantic payload; readers
 * convert to ml via `mlFromWaterRow`. The calendar column is `date` per
 * migration 0003 / architecture §2.6 — do NOT rename to `logged_on` to
 * match the wire payload on /api/water/log; the wire JSON carries
 * `logged_on` but the DB column name is `date`.
 */
export interface WaterLogEntry {
  id: string;
  client_id: string;
  date: string;
  count: number;
  unit: 'glass' | 'bottle' | 'ml';
}

/** ml conversion factor per unit. */
export const ML_PER_UNIT: Record<WaterLogEntry['unit'], number> = {
  glass: 250,
  bottle: 500,
  ml: 1,
};

/** Derived ml value for a water_log row. */
export function mlFromWaterRow(row: Pick<WaterLogEntry, 'count' | 'unit'>): number {
  return row.count * ML_PER_UNIT[row.unit];
}

/**
 * Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — daily water cap.
 * Single source of truth used by:
 *   - Server: `app/api/water/log/route.ts` rejects writes whose pre-write
 *     SUM + incoming ml would exceed this value with HTTP 409
 *     OVER_DAILY_LIMIT.
 *   - Client (chip): `components/dashboard/WaterTracker.tsx` issues a
 *     pre-emptive guard that suppresses the POST + shows a cap toast
 *     when current consumed + delta would exceed the cap.
 *   - Client (FAB): `components/nav/nav-shell.tsx` relies on the server
 *     409 (the FAB is decoupled chrome with no consumed-ml knowledge per
 *     proposal Recommendation B) and surfaces the same cap toast.
 *   - Bug #2 (custom amount input): caps the set-total range to
 *     [0, MAX_DAILY_WATER_ML] for client-side UX hinting; server still
 *     enforces.
 */
export const MAX_DAILY_WATER_ML = 5000;

// ---------------------------------------------------------------------------
// Chronometer discriminated union (briefing §5.2, design-lead §4).
// ---------------------------------------------------------------------------

export type ChronometerStatus =
  | 'default'
  | 'approaching'
  | 'on-target'
  | 'over-target'
  | 'way-over';

export type ChronometerData =
  | {
      status: ChronometerStatus;
      consumed: number;
      target: number;
      fiber: { consumed: number; target: number };
      nowAngle: number;
      entryCount: number;
      lastLoggedAt: string | null;
    }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty'; target: number };

// ---------------------------------------------------------------------------
// Macro bars (design-lead §4).
// ---------------------------------------------------------------------------

export type MacroRowStatus = 'empty' | 'default' | 'on-target' | 'over';

export interface MacroContribution {
  id: string;
  entryId: string;
  mealCategory: MealCategory;
  loggedAt: string;
  itemName: string;
  portionLabel: string;
  grams: number;
  pctOfTotal: number;
}

export interface MacroRow {
  key: 'protein' | 'carbs' | 'fat' | 'fiber';
  consumedG: number;
  targetG: number;
  pct: number;
  status: MacroRowStatus;
  contributions: MacroContribution[];
}

export interface MacrosByKey {
  protein: MacroRow;
  carbs: MacroRow;
  fat: MacroRow;
  fiber: MacroRow;
}

// ---------------------------------------------------------------------------
// Meals bulletin.
// ---------------------------------------------------------------------------

export interface MealColumnData {
  category: MealCategory;
  entries: FoodEntry[];
  totalKcal: number;
  heaviestEntryId: string | null;
}

export type MealsByCategory = Record<MealCategory, MealColumnData>;

// ---------------------------------------------------------------------------
// Micronutrients (design-lead §4).
// ---------------------------------------------------------------------------

export type MicroStatus = 'low' | 'mid' | 'good' | 'over';

export interface MicroRow {
  name: string;
  consumed: number;
  rda: number | null;
  pct: number; // 0..Infinity; UI clamps visual bar at 100%.
  status: MicroStatus;
}

// ---------------------------------------------------------------------------
// Edition (masthead).
// ---------------------------------------------------------------------------

export interface Edition {
  n: number;
  weekday: string;
  day: number;
  month: string;
  year: number;
}

// ---------------------------------------------------------------------------
// Top-level snapshot handed to islands.
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  edition: Edition;
  chronometer: ChronometerData;
  macros: MacrosByKey;
  meals: MealsByCategory;
  water: {
    consumedMl: number;
    targetMl: number;
    entries: WaterLogEntry[];
  };
  micros: MicroRow[];
}
