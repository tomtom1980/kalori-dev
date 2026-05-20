/**
 * Unit tests — Task 4.2 macro/kcal formatters.
 *
 * Covers rounding, null-handling, thousands separators.
 */
import { describe, expect, it } from 'vitest';

import {
  formatFiledDate,
  formatGrams,
  formatKcal,
  formatMilligrams,
  formatPortion,
} from '@/app/(app)/library/_components/FoodDetail/foodDetail.format';

describe('formatKcal', () => {
  it('formats integer kcal with thousands separator', () => {
    expect(formatKcal(1234)).toBe('1,234');
  });
  it('rounds to nearest integer', () => {
    expect(formatKcal(212.6)).toBe('213');
  });
  it('renders em-dash for null / undefined / NaN', () => {
    expect(formatKcal(null)).toBe('—');
    expect(formatKcal(undefined)).toBe('—');
    expect(formatKcal(Number.NaN)).toBe('—');
  });
});

describe('formatGrams', () => {
  it('renders integer without decimals', () => {
    expect(formatGrams(42)).toBe('42');
  });
  it('renders one decimal for fractional values', () => {
    expect(formatGrams(12.345)).toBe('12.3');
  });
  it('renders em-dash for null', () => {
    expect(formatGrams(null)).toBe('—');
  });
});

describe('formatMilligrams', () => {
  it('rounds to integer for values >= 1', () => {
    expect(formatMilligrams(140.7)).toBe('141');
  });
  it('em-dash for null', () => {
    expect(formatMilligrams(null)).toBe('—');
  });
  it('em-dash for undefined and non-finite', () => {
    expect(formatMilligrams(undefined)).toBe('—');
    expect(formatMilligrams(Number.NaN)).toBe('—');
    expect(formatMilligrams(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

// Bug 2 (bugfix-tomi 2026-05-17-library-card-and-micros-precision) —
// sub-1 mg/mcg micros previously collapsed to "0" via `Math.round`, producing
// the user-visible mismatch where a 0.3 mg @ 18 mg RDA row rendered as
// "0 mg · 2% DV". The new precision tiers preserve trace amounts without
// inventing precision for typical macro-scale values.
describe('formatMilligrams precision tiers (Bug 2 fix)', () => {
  it('returns "0" for exactly zero', () => {
    expect(formatMilligrams(0)).toBe('0');
  });

  it('returns 2 decimals for values 0 < v < 0.05', () => {
    expect(formatMilligrams(0.01)).toBe('0.01');
    expect(formatMilligrams(0.04)).toBe('0.04');
  });

  it('returns 1 decimal for values 0.05 <= v < 1', () => {
    // toFixed(1) on 0.05 rounds to "0.1" per IEEE-754 semantics.
    expect(formatMilligrams(0.05)).toBe('0.1');
    expect(formatMilligrams(0.3)).toBe('0.3');
    expect(formatMilligrams(0.5)).toBe('0.5');
    // toFixed(1) on 0.95 yields "0.9" due to banker's rounding on the
    // floating-point representation — documented edge of the 1-decimal tier.
    expect(formatMilligrams(0.95)).toBe('0.9');
  });

  it('returns integer (no decimals) for values >= 1', () => {
    expect(formatMilligrams(1)).toBe('1');
    expect(formatMilligrams(1.5)).toBe('2'); // Math.round half-to-even? Actually 2 in V8.
    expect(formatMilligrams(18)).toBe('18');
    expect(formatMilligrams(120)).toBe('120');
  });
});

describe('formatPortion', () => {
  it('joins portion + unit', () => {
    expect(formatPortion(100, 'g')).toBe('100 g');
  });
  it('falls back to g when unit is null', () => {
    expect(formatPortion(100, null)).toBe('100 g');
  });
  it('em-dash when portion is null', () => {
    expect(formatPortion(null, 'g')).toBe('—');
  });
});

describe('formatFiledDate', () => {
  it('formats ISO as MON DD, YYYY', () => {
    expect(formatFiledDate('2026-04-14T22:03:00Z')).toMatch(/APR \d+, 2026/);
  });
  it('em-dash on null', () => {
    expect(formatFiledDate(null)).toBe('—');
  });
  it('em-dash on malformed input', () => {
    expect(formatFiledDate('not-a-date')).toBe('—');
  });
});
