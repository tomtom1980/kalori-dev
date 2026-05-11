import { describe, expect, it } from 'vitest';

import { getDeviceTimeZone, isValidTimeZone, normalizeTimeZone } from '@/lib/time/device-timezone';

describe('device timezone helpers', () => {
  it('validates IANA timezone identifiers', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
    expect(isValidTimeZone('not-a-timezone')).toBe(false);
  });

  it('normalizes invalid values to a valid fallback', () => {
    expect(normalizeTimeZone('Europe/London')).toBe('Europe/London');
    expect(normalizeTimeZone('', 'America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('bad-zone', 'UTC')).toBe('UTC');
  });

  it('returns a valid timezone from the current JS runtime', () => {
    expect(isValidTimeZone(getDeviceTimeZone('UTC'))).toBe(true);
  });
});
