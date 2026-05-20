/**
 * Task 3.5 Milestone 2.4 — `lib/nutrition/display-micros.ts` tests.
 *
 * Contract (briefing §5.6 + §7.1 tests):
 *   - Priority constant: protein > iron > vitamin D > vitamin C > calcium >
 *     fiber > rest (alphabetical).
 *   - `formatMicroPercent(value, rda)` — returns rounded integer percent of
 *     RDA; null rda → 0.
 *   - `microStatus(value, rda, ul?)` — 'under' <80%, 'on' 80-120%, 'over'
 *     >120% (or >UL if provided).
 *   - `sortMicrosByPriority(rows)` — applies the priority order.
 */
import { describe, expect, it } from 'vitest';

import {
  MICRO_PRIORITY,
  formatMicroPercent,
  microStatus,
  sortMicrosByPriority,
} from '@/lib/nutrition/display-micros';

describe('MICRO_PRIORITY', () => {
  it('exposes the 6-element prefix in expected order', () => {
    expect(MICRO_PRIORITY.slice(0, 6)).toEqual([
      'protein',
      'iron',
      'vitamin D',
      'vitamin C',
      'calcium',
      'fiber',
    ]);
  });
});

describe('formatMicroPercent', () => {
  it('rounds to integer percent of RDA', () => {
    expect(formatMicroPercent(50, 100)).toBe(50);
    expect(formatMicroPercent(33.4, 100)).toBe(33);
    expect(formatMicroPercent(33.6, 100)).toBe(34);
  });

  it('returns 0 when rda is null or zero', () => {
    expect(formatMicroPercent(50, null)).toBe(0);
    expect(formatMicroPercent(50, 0)).toBe(0);
  });

  it('handles over-100% values', () => {
    expect(formatMicroPercent(150, 100)).toBe(150);
  });

  it('clamps negative values to 0', () => {
    expect(formatMicroPercent(-5, 100)).toBe(0);
  });
});

describe('microStatus', () => {
  it('returns low when value is below 50% of RDA', () => {
    expect(microStatus(40, 100)).toBe('low');
  });

  it('returns mid when value is 50-100% of RDA', () => {
    expect(microStatus(50, 100)).toBe('mid');
    expect(microStatus(99, 100)).toBe('mid');
  });

  it('returns good when value is 100-120% of RDA', () => {
    expect(microStatus(100, 100)).toBe('good');
    expect(microStatus(110, 100)).toBe('good');
  });

  it('returns over when value is >120% OR exceeds UL', () => {
    expect(microStatus(150, 100)).toBe('over');
    expect(microStatus(80, 100, 70)).toBe('over'); // exceeds UL even though <100% RDA
  });

  it('returns unknown when rda is null or zero (Codex R2 I2 — was "low" before)', () => {
    // Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
    // RDA-unknown rows are now distinguished from actually-low measurable
    // rows so the dashboard renderer can omit the "below reference" red
    // treatment. The library surface already handled `rda === null`
    // separately via a `dvPct === null` branch.
    expect(microStatus(50, null)).toBe('unknown');
    expect(microStatus(50, 0)).toBe('unknown');
  });
});

describe('sortMicrosByPriority', () => {
  it('puts the 6 priority micros first in order, rest alphabetical', () => {
    const rows = [
      { name: 'zinc' },
      { name: 'protein' },
      { name: 'potassium' },
      { name: 'iron' },
      { name: 'fiber' },
      { name: 'calcium' },
      { name: 'vitamin D' },
      { name: 'vitamin C' },
      { name: 'magnesium' },
    ];
    const sorted = sortMicrosByPriority(rows);
    const names = sorted.map((r) => r.name);
    expect(names.slice(0, 6)).toEqual([
      'protein',
      'iron',
      'vitamin D',
      'vitamin C',
      'calcium',
      'fiber',
    ]);
    // The rest are alphabetical.
    expect(names.slice(6)).toEqual(['magnesium', 'potassium', 'zinc']);
  });

  it('is stable when all rows are in the priority set', () => {
    const rows = [{ name: 'iron' }, { name: 'protein' }];
    const sorted = sortMicrosByPriority(rows);
    expect(sorted.map((r) => r.name)).toEqual(['protein', 'iron']);
  });
});
