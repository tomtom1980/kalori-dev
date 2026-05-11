import { describe, expect, it } from 'vitest';

import { formatTimeInTimeZone } from '@/lib/time/format';

describe('time formatting helpers', () => {
  it('formats UTC instants in the requested IANA timezone', () => {
    expect(formatTimeInTimeZone('2026-04-22T08:00:00.000Z', 'Asia/Bangkok')).toBe('15:00');
    expect(formatTimeInTimeZone('2026-04-22T08:00:00.000Z', 'America/New_York')).toBe('04:00');
  });

  it('falls back to UTC for invalid timezone values', () => {
    expect(formatTimeInTimeZone('2026-04-22T08:00:00.000Z', 'bad-zone')).toBe('08:00');
  });
});
