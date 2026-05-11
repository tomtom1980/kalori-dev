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
  it('rounds to integer', () => {
    expect(formatMilligrams(140.7)).toBe('141');
  });
  it('em-dash for null', () => {
    expect(formatMilligrams(null)).toBe('—');
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
