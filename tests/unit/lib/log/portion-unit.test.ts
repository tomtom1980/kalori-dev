/**
 * Unit tests for `lib/log/portion-unit` — the heuristic that decides
 * whether a parsed `unit` string represents a discrete count (whole-
 * number stepping) or a continuous measurement (fractional stepping).
 */
import { describe, expect, it } from 'vitest';

import { isDiscreteUnit, isWholeStyleUnit, isWholeStyleQuantity } from '@/lib/log/portion-unit';

describe('isDiscreteUnit', () => {
  it('returns true for piece-like / serving-like units', () => {
    for (const u of ['piece', 'pieces', 'slice', 'slices', 'serving', 'unit', 'scoop', 'egg']) {
      expect(isDiscreteUnit(u)).toBe(true);
    }
  });

  it('returns false for known continuous mass units', () => {
    for (const u of ['g', 'gram', 'grams', 'kg', 'oz', 'lb', 'pound']) {
      expect(isDiscreteUnit(u)).toBe(false);
    }
  });

  it('returns false for known continuous volume units', () => {
    for (const u of ['ml', 'l', 'liter', 'tbsp', 'tsp']) {
      expect(isDiscreteUnit(u)).toBe(false);
    }
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isDiscreteUnit('  G  ')).toBe(false);
    expect(isDiscreteUnit('GRAMS')).toBe(false);
    expect(isDiscreteUnit('Cup')).toBe(true);
    expect(isDiscreteUnit('Piece')).toBe(true);
  });

  it('defaults to discrete for empty, null, or undefined', () => {
    expect(isDiscreteUnit('')).toBe(true);
    expect(isDiscreteUnit('   ')).toBe(true);
    expect(isDiscreteUnit(null)).toBe(true);
    expect(isDiscreteUnit(undefined)).toBe(true);
  });

  it('defaults to discrete for unknown exotic units (safer UX)', () => {
    for (const u of ['handful', 'stick', 'wedge', 'patty', 'dumpling']) {
      expect(isDiscreteUnit(u)).toBe(true);
    }
  });
});

describe('whole-style unit helpers', () => {
  it('treats cup, serving, portion, and adjective+noun foods as integer-only', () => {
    for (const u of [
      'cup',
      'cups',
      'serving',
      'servings',
      'portion',
      'large egg',
      'medium fruit',
    ]) {
      expect(isWholeStyleUnit(u)).toBe(true);
      expect(isWholeStyleQuantity(u, 1.5)).toBe(false);
      expect(isWholeStyleQuantity(u, 2)).toBe(true);
    }
  });

  it('keeps gram and milliliter style units decimal-capable', () => {
    for (const u of ['g', 'grams', 'ml', 'milliliters']) {
      expect(isWholeStyleUnit(u)).toBe(false);
      expect(isWholeStyleQuantity(u, 12.5)).toBe(true);
    }
  });
});
