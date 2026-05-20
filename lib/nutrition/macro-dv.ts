/**
 * Macro Daily Values — FDA 21 CFR §101.9 reference table, 2,000 kcal diet.
 *
 * Used by `<FoodDetailMacros />` (library `/library/[id]`) for at-a-glance
 * "X% DV" rendering per macro row. NOT to be confused with USER targets
 * (Mifflin-St Jeor) used by the dashboard — those depend on profile and
 * are computed in `lib/nutrition/target.ts`.
 *
 * Note: the dashboard's fiber arc reads from `lib/dashboard/aggregate.ts`
 * (`FIBER_TARGET_G = 25`, WHO RNI baseline). This module uses the FDA DV
 * (28g) on the library surface — two surfaces, two meanings. See Bug 8
 * proposal Q1 in `Planning/.tmp/bugfix-2026-05-16-library-overhaul/`.
 */
export const MACRO_DV_G = {
  protein: 50,
  carbs: 275,
  fat: 78,
  fiber: 28,
} as const;

export type MacroDvKey = keyof typeof MACRO_DV_G;

/**
 * Integer DV percent for a macro grams value against its FDA reference.
 * Returns `null` for non-finite, zero, negative, or absent values so the
 * caller can omit the line entirely instead of rendering "0% DV".
 */
export function macroDvPct(value: number | null | undefined, key: MacroDvKey): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.round((value / MACRO_DV_G[key]) * 100);
}
