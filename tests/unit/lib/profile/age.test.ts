import { describe, expect, it } from 'vitest';

import {
  addYearsToIsoDay,
  calculateAgeOnDate,
  isAgeInSupportedRange,
  isIsoDay,
} from '@/lib/profile/age';

describe('profile age helpers', () => {
  it('calculates full years after birthday has passed', () => {
    expect(calculateAgeOnDate('1990-05-10', '2026-05-18')).toBe(36);
  });

  it('calculates full years before birthday has passed', () => {
    expect(calculateAgeOnDate('1990-12-10', '2026-05-18')).toBe(35);
  });

  it('rejects invalid calendar days', () => {
    expect(isIsoDay('2026-02-31')).toBe(false);
    expect(calculateAgeOnDate('2026-02-31', '2026-05-18')).toBeNull();
  });

  it('checks supported app age range', () => {
    expect(isAgeInSupportedRange(13)).toBe(true);
    expect(isAgeInSupportedRange(120)).toBe(true);
    expect(isAgeInSupportedRange(12)).toBe(false);
  });

  it('shifts leap-day bounds to February 28 in non-leap years', () => {
    expect(addYearsToIsoDay('2024-02-29', 1)).toBe('2025-02-28');
  });
});
