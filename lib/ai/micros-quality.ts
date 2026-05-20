import type { ParseResultT, ParsedItemT } from '@/lib/ai/schemas';

function hasOnlyZeroMicros(item: ParsedItemT): boolean {
  const values = Object.values(item.micros).filter((value) => Number.isFinite(value));
  return values.length > 0 && values.every((value) => value === 0);
}

function isSubstantialFood(item: ParsedItemT): boolean {
  const unit = item.unit.toLowerCase();
  const grams =
    unit === 'g' || unit === 'gram' || unit === 'grams' ? item.portion : item.approxGrams;
  const macros = item.macros;
  const macroEnergy =
    macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9 + macros.fiber_g * 2;

  return item.kcal >= 75 || macroEnergy >= 75 || (typeof grams === 'number' && grams >= 50);
}

export function hasSuspiciousAllZeroMicros(result: ParseResultT): boolean {
  return result.items.some((item) => isSubstantialFood(item) && hasOnlyZeroMicros(item));
}
