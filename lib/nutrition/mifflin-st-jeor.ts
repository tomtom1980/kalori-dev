/**
 * `lib/nutrition/mifflin-st-jeor.ts` — pure Basal Metabolic Rate calculation.
 *
 * Canonical reference: Mifflin MD, St Jeor ST, et al. "A new predictive
 * equation for resting energy expenditure in healthy individuals."
 * Am J Clin Nutr 1990;51:241-7. Industry standard; referenced by
 * design-doc §10.3 and kalori-project-blueprint §4.
 *
 *   BMR (male)   = 10 × weight_kg + 6.25 × height_cm − 5 × age_years + 5
 *   BMR (female) = 10 × weight_kg + 6.25 × height_cm − 5 × age_years − 161
 *   BMR (other)  = 10 × weight_kg + 6.25 × height_cm − 5 × age_years − 78
 *
 * The 'other' constant (−78) is the exact midpoint of the male (+5) and
 * female (−161) constants — the canonical MyFitnessPal/Cronometer approach
 * for non-binary bio_sex where no sex-specific published coefficient exists.
 *
 * I5 contract: pure function, no IO, deterministic. Inputs are metric only
 * (design-doc §18.2 I6 — unit conversion happens at presentation layer).
 * Output rounded to nearest integer (design-doc §10.3 — kcal/day never
 * fractional in UI).
 */

export type BioSex = 'male' | 'female' | 'other';

/**
 * Mifflin-St Jeor constant per bio_sex branch.
 *
 * These three constants are the ONLY sex-dependent difference in the
 * formula; everything else (weight, height, age coefficients) is shared.
 */
const SEX_CONSTANT: Record<BioSex, number> = {
  male: 5,
  female: -161,
  other: -78, // midpoint of +5 and −161 per canonical non-binary handling
};

/**
 * Calculate Basal Metabolic Rate (BMR) via Mifflin-St Jeor.
 *
 * @param bioSex - 'male' | 'female' | 'other' (matches `profiles.bio_sex` enum)
 * @param weightKg - mass in kilograms (metric only)
 * @param heightCm - height in centimetres (metric only)
 * @param ageYears - age in whole years
 * @returns BMR in kcal/day, rounded to nearest integer
 */
export function calcBMR(
  bioSex: BioSex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const raw = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + SEX_CONSTANT[bioSex];
  return Math.round(raw);
}
