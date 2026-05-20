/**
 * Shared unit contract for quantity controls and API validation.
 *
 * Measurement units (g, ml, tbsp, oz, etc.) admit fractional quantities.
 * Whole-style units (piece, slice, egg, serving, cup, bowl, large egg,
 * medium fruit, unknown count nouns, etc.) are integer-only.
 *
 * Default for empty / unrecognized units is whole-style. The AI's free-form
 * output ranges from "piece" to "scoop" to "stick"; treating an exotic
 * count as fractional ("0.5 sticks") is a more glaring UX bug than treating
 * an exotic measurement as integer.
 */
const DECIMAL_CAPABLE_UNITS = new Set<string>([
  // mass
  'g',
  'gr',
  'gram',
  'grams',
  'mg',
  'milligram',
  'milligrams',
  'kg',
  'kilo',
  'kilos',
  'kilogram',
  'kilograms',
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  // volume measurements. Cups are intentionally excluded: product policy
  // treats cup/cups as whole-style for this app's serving controls.
  'ml',
  'milliliter',
  'milliliters',
  'l',
  'liter',
  'liters',
  'litre',
  'litres',
  'dl',
  'deciliter',
  'deciliters',
  'cl',
  'centiliter',
  'centiliters',
  'fl oz',
  'floz',
  'fluid ounce',
  'fluid ounces',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'teaspoon',
  'teaspoons',
  'pint',
  'pints',
  'quart',
  'quarts',
  'gallon',
  'gallons',
  // tiny measurement quantities
  'drop',
  'drops',
  'splash',
  'splashes',
  'dash',
  'dashes',
  'pinch',
  'pinches',
]);

export function normalizePortionUnit(unit: string | undefined | null): string {
  if (!unit) return '';
  return unit.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function isWholeStyleUnit(unit: string | undefined | null): boolean {
  const normalized = normalizePortionUnit(unit);
  if (!normalized) return true;
  return !DECIMAL_CAPABLE_UNITS.has(normalized);
}

export function isDiscreteUnit(unit: string | undefined | null): boolean {
  return isWholeStyleUnit(unit);
}

export function isWholeStyleQuantity(unit: string | undefined | null, quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  return !isWholeStyleUnit(unit) || Number.isInteger(quantity);
}
