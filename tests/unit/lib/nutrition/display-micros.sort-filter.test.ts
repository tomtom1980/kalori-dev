/**
 * `sortAndFilterMicrosByRdaPct` — shared cross-surface display rule helper.
 *
 * Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency).
 *
 * User rule (verbatim, 2026-05-17):
 *
 *   "Anytime we display the micronutrients, including when we're adding on
 *    dashboard, we add it to library or viewing the library item, I want it
 *    to be ordered from top to bottom for the most percentage used and
 *    anything which is less than 1% should not be displayed."
 *
 * Final design rule (per Phase 2 clarification):
 *   - RDA-having rows with pct < minPct (default 1)  → HIDE
 *   - RDA-having rows with pct >= minPct             → SHOW, sorted DESC by pct
 *   - RDA-unknown rows (pct === null)                → ALWAYS SHOW (when
 *                                                       includeUnknownRda),
 *                                                       sorted to END,
 *                                                       stable-sorted by
 *                                                       displayName
 *
 * The helper is row-shape agnostic via generic `T extends DisplayMicroRow` so
 * each surface (dashboard, confirmation, library) can pass its native row
 * type and have caller-specific fields preserved on the way back out.
 */
import { describe, expect, it } from 'vitest';

import { sortAndFilterMicrosByRdaPct, type DisplayMicroRow } from '@/lib/nutrition/display-micros';

type Row = DisplayMicroRow & { tag?: string };

const r = (key: string, pct: number | null, displayName?: string, tag?: string): Row => ({
  key,
  pct,
  displayName: displayName ?? key,
  ...(tag !== undefined ? { tag } : {}),
});

describe('sortAndFilterMicrosByRdaPct', () => {
  it('empty input returns empty output', () => {
    expect(sortAndFilterMicrosByRdaPct([])).toEqual([]);
  });

  it('RDA-having row with pct >= minPct (default 1) is included', () => {
    const out = sortAndFilterMicrosByRdaPct([r('iron', 50, 'Iron')]);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe('iron');
  });

  it('RDA-having row with pct < minPct (default 1) is excluded', () => {
    const out = sortAndFilterMicrosByRdaPct([r('selenium', 0, 'Selenium')]);
    expect(out).toEqual([]);
  });

  it('RDA-having rows are sorted desc by pct', () => {
    const rows = [
      r('iron', 50, 'Iron'),
      r('vitamin_c', 100, 'Vitamin C'),
      r('calcium', 25, 'Calcium'),
    ];
    const out = sortAndFilterMicrosByRdaPct(rows);
    expect(out.map((row) => row.key)).toEqual(['vitamin_c', 'iron', 'calcium']);
  });

  it('RDA-unknown rows (pct=null) are always included regardless of minPct', () => {
    const out = sortAndFilterMicrosByRdaPct([r('sugar', null, 'Sugar')], { minPct: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe('sugar');
  });

  it('RDA-unknown rows are sorted to END (after all RDA-having rows)', () => {
    const rows = [
      r('sugar', null, 'Sugar'),
      r('vitamin_c', 50, 'Vitamin C'),
      r('iron', 100, 'Iron'),
    ];
    const out = sortAndFilterMicrosByRdaPct(rows);
    expect(out.map((row) => row.key)).toEqual(['iron', 'vitamin_c', 'sugar']);
  });

  it('RDA-unknown rows are sorted among themselves by displayName (alpha) for stable order', () => {
    const rows = [r('zorb', null, 'Zorb'), r('apple', null, 'Apple'), r('mango', null, 'Mango')];
    const out = sortAndFilterMicrosByRdaPct(rows);
    expect(out.map((row) => row.displayName)).toEqual(['Apple', 'Mango', 'Zorb']);
  });

  it('minPct: 0 disables filter — all RDA-having rows included regardless of pct', () => {
    const rows = [
      r('iron', 50, 'Iron'),
      r('selenium', 0, 'Selenium'),
      r('calcium', 0.4, 'Calcium'),
    ];
    const out = sortAndFilterMicrosByRdaPct(rows, { minPct: 0 });
    expect(out).toHaveLength(3);
    // Sort desc still applies.
    expect(out.map((row) => row.key)).toEqual(['iron', 'calcium', 'selenium']);
  });

  it('minPct: 5 — only rows with pct >= 5 are shown (boundary inclusive on the 5 line)', () => {
    const rows = [r('a', 4, 'A'), r('b', 5, 'B'), r('c', 10, 'C')];
    const out = sortAndFilterMicrosByRdaPct(rows, { minPct: 5 });
    expect(out.map((row) => row.key)).toEqual(['c', 'b']);
  });

  it('mixed input with 3 RDA-having + 2 RDA-unknown produces correct ordering', () => {
    const rows = [
      r('sugar', null, 'Sugar'),
      r('vitamin_c', 33, 'Vitamin C'),
      r('omega', null, 'Omega'),
      r('iron', 50, 'Iron'),
      r('calcium', 10, 'Calcium'),
    ];
    const out = sortAndFilterMicrosByRdaPct(rows);
    // RDA-having: iron(50), vitamin_c(33), calcium(10)
    // RDA-unknown: Omega, Sugar (alpha by displayName)
    expect(out.map((row) => row.key)).toEqual(['iron', 'vitamin_c', 'calcium', 'omega', 'sugar']);
  });

  it('preserves caller-specific fields on rows that survive the filter', () => {
    const rows: Row[] = [
      r('iron', 50, 'Iron', 'meta-iron'),
      r('vitamin_c', 100, 'Vitamin C', 'meta-c'),
      r('selenium', 0, 'Selenium', 'meta-se'),
    ];
    const out = sortAndFilterMicrosByRdaPct(rows);
    expect(out.map((row) => row.tag)).toEqual(['meta-c', 'meta-iron']);
  });

  it('includeUnknownRda: false drops RDA-unknown rows', () => {
    const rows = [r('iron', 50, 'Iron'), r('sugar', null, 'Sugar')];
    const out = sortAndFilterMicrosByRdaPct(rows, { includeUnknownRda: false });
    expect(out.map((row) => row.key)).toEqual(['iron']);
  });

  it('RDA-having rows are stable-sorted among ties (preserve input order)', () => {
    const rows = [r('first', 50, 'First'), r('second', 50, 'Second'), r('third', 50, 'Third')];
    const out = sortAndFilterMicrosByRdaPct(rows);
    expect(out.map((row) => row.key)).toEqual(['first', 'second', 'third']);
  });
});
