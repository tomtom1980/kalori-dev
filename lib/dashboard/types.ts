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
  bio_sex: 'male' | 'female';
  current_weight_kg: number;
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

export interface AlcoholLogEntry {
  id: string;
  user_id: string;
  entry_id: string;
  volume_ml: number;
  abv_percent: number;
  alcohol_grams: number;
  consumed_at: string;
  created_at: string;
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
  /**
   * Numeric value in the macro's native unit. For protein/carbs/fat/fiber
   * this is grams (kept for backward-compat with existing UI consumers).
   * For cholesterol this is milligrams — semantically `grams` is wrong
   * but the field name is preserved so renaming doesn't ripple through
   * 20+ files. Prefer `amount` + the row's `unit` field for new code.
   */
  grams: number;
  /**
   * Unit-aware sibling of `grams`. Same numeric value, but new code
   * should pair this with `MacroRow.unit` (`'g'` or `'mg'`) for display.
   * Added 2026-05-16 alongside cholesterol_mg. Optional to keep legacy
   * test fixtures compiling — the aggregator ALWAYS produces it.
   */
  amount?: number;
  pctOfTotal: number;
}

export interface MacroRow {
  key: 'protein' | 'carbs' | 'fat' | 'fiber' | 'cholesterol';
  /**
   * Display unit. `'g'` for protein/carbs/fat/fiber, `'mg'` for cholesterol.
   * UI components branch on this when rendering the value suffix.
   * Optional to keep legacy test fixtures compiling — the aggregator
   * ALWAYS produces it; default to `'g'` when reading from older fixtures.
   */
  unit?: 'g' | 'mg';
  /**
   * Numeric consumed value in the row's native unit. Field name kept as
   * `consumedG` for backward-compat with existing UI; semantically it
   * carries mg when `unit === 'mg'` (cholesterol).
   */
  consumedG: number;
  /**
   * Numeric target value in the row's native unit. Same name caveat as
   * `consumedG`.
   */
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
  /**
   * Cholesterol — 5th tracked macro, mg/day target. Optional to keep
   * legacy test fixtures compiling — the aggregator ALWAYS produces it.
   */
  cholesterol?: MacroRow;
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

/**
 * Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) — fifth
 * status value `'unknown'` distinguishes RDA-unknown rows (sugar, caffeine,
 * orphan keys) from actually-low measurable rows. R1 fix flipped
 * `includeUnknownRda: true` to keep these rows visible on the dashboard
 * panel, but the public row shape still carried `status: 'low'`, so the
 * renderer painted them red with a "0%" label + "below reference" aria
 * copy — a user-visible false nutrition signal.
 *
 * Renderer contract:
 *   - `'low'` / `'mid'` / `'good'` / `'over'` — measurable rows, render as
 *     before (color-coded bar fill + integer `{pct}%` label + status word
 *     aria copy).
 *   - `'unknown'` — RDA-unknown rows, render with neutral palette (no
 *     oxblood/ember), em-dash placeholder instead of "0%", and aria copy
 *     "no daily reference" instead of "below reference".
 */
export type MicroStatus = 'low' | 'mid' | 'good' | 'over' | 'unknown';

/**
 * MicroContribution — per-source breakdown for one micronutrient row.
 *
 * Parallel to `MacroContribution`, but the value field is `amount` (with a
 * unit-aware `unit` discriminator) because micros come in mg / mcg / IU
 * and using `grams` would mislead. The `unit` is sourced from the
 * canonical micros-rda table where known; otherwise it falls back to an
 * empty string so the renderer can decide how to handle unknown units.
 *
 * Added 2026-05-16 alongside the cholesterol 5th-macro extension to give
 * micros hover+click breakdown parity with macros.
 */
export interface MicroContribution {
  id: string;
  entryId: string;
  mealCategory: MealCategory;
  loggedAt: string;
  itemName: string;
  portionLabel: string;
  amount: number;
  unit: string;
  pctOfTotal: number;
}

export interface MicroRow {
  name: string;
  consumed: number;
  rda: number | null;
  pct: number; // 0..Infinity; UI clamps visual bar at 100%.
  status: MicroStatus;
  /**
   * Canonical unit (e.g. `'mg'`, `'mcg'`, `'g'`) sourced from
   * `DEFAULT_MICROS_LIST` when the micro name resolves to a canonical
   * entry; empty string for orphan / non-canonical rows (e.g. legacy
   * `made_up_key` entries the dashboard chooses to render as-is).
   * Optional to keep legacy test fixtures compiling — the aggregator
   * ALWAYS produces it.
   */
  unit?: string;
  /**
   * Per-source breakdown sorted by amount desc, then loggedAt asc.
   * Empty array when no entries contributed to this micro (the row
   * itself is hidden in that case by the daily-audit filter, so an
   * empty list here is only ever transient). Optional to keep legacy
   * test fixtures compiling — the aggregator ALWAYS produces it.
   */
  contributions?: MicroContribution[];
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

// Task C.1 — `MicroRdaRow` is owned by `lib/dashboard/micros-rda-resolver.ts`.
// We import-and-re-export here so downstream consumers (`MicrosRdaPanel.tsx`,
// integration tests, `DashboardSnapshot.microsRda`) only need to depend on
// `@/lib/dashboard/types` for the public type surface — same convention used
// for the existing `MicroRow`.
export type { MicroRdaRow } from './micros-rda-resolver';
import type { MicroRdaRow } from './micros-rda-resolver';

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
  bac: {
    value: number;
    calculatedAt: string;
  };
  micros: MicroRow[];
  /** Task C.1 — 30-row today's-RDA snapshot keyed by `DEFAULT_MICROS_LIST`. */
  microsRda: MicroRdaRow[];
}
