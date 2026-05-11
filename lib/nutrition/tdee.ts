/**
 * `lib/nutrition/tdee.ts` — pure Total Daily Energy Expenditure calculation.
 *
 * TDEE = BMR × activity_multiplier, where multipliers are the canonical
 * Harris-Benedict set aligned with `profiles.activity_level` DDL check
 * constraint (architecture.md §2.2):
 *
 *   sedentary    × 1.2     (desk job, minimal movement)
 *   light        × 1.375   (1-3 workouts/wk)
 *   moderate     × 1.55    (3-5 workouts/wk)
 *   active       × 1.725   (6-7 workouts/wk or physical job)
 *   very_active  × 1.9     (twice-daily training / heavy labor)
 *
 * I5 contract: pure function, no IO, deterministic. Output rounded to nearest
 * integer (design-doc §10.3 — kcal/day never fractional in UI).
 */

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/**
 * Harris-Benedict activity multipliers keyed by `profiles.activity_level` enum.
 * Any change to these values MUST update the TDEE_FIXTURES expected values
 * (the fixtures are the specification of record).
 */
const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Calculate Total Daily Energy Expenditure from BMR + activity level.
 *
 * @param bmr - Basal Metabolic Rate in kcal/day (typically from `calcBMR`)
 * @param activityLevel - one of the 5 `profiles.activity_level` enum values
 * @returns TDEE in kcal/day, rounded to nearest integer
 */
export function calcTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
}
