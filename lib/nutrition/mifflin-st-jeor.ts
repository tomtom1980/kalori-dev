/**
 * `lib/nutrition/mifflin-st-jeor.ts` - pure Basal Metabolic Rate calculation.
 *
 * Mifflin-St Jeor:
 *   BMR (male)   = 10 * weight_kg + 6.25 * height_cm - 5 * age_years + 5
 *   BMR (female) = 10 * weight_kg + 6.25 * height_cm - 5 * age_years - 161
 */

export type BioSex = 'male' | 'female';

const SEX_CONSTANT: Record<BioSex, number> = {
  male: 5,
  female: -161,
};

export function calcBMR(
  bioSex: BioSex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const sexConstant = SEX_CONSTANT[bioSex];
  if (sexConstant === undefined) {
    throw new Error('unsupported_bio_sex');
  }
  const raw = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexConstant;
  return Math.round(raw);
}
