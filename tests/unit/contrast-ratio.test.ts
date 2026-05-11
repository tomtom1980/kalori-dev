/**
 * @vitest-environment node
 *
 * Task 5.1.6 Codex Round 2 — `lib/a11y/contrast-ratio.ts` unit tests.
 *
 * Reference values come from the WebAIM contrast checker for known
 * sRGB pairs. The helper is a pure math primitive — these assertions
 * pin the function shape so the contrast tests in C2-3 / C2-4 can rely
 * on it.
 */
import { describe, expect, it } from 'vitest';

import {
  WCAG_AAA_BODY_TEXT_RATIO,
  contrastRatio,
  parseRgbString,
  ratioBetween,
  relativeLuminance,
} from '@/lib/a11y/contrast-ratio';

describe('contrast-ratio helper', () => {
  it('relativeLuminance(white) ≈ 1.0', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1.0, 4);
  });

  it('relativeLuminance(black) === 0', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
  });

  it('contrastRatio(white, black) === 21', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 4);
  });

  it('contrastRatio is symmetric', () => {
    const a: [number, number, number] = [244, 235, 220]; // ivory
    const b: [number, number, number] = [30, 24, 21]; // bg-2
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });

  it('parseRgbString parses rgb()', () => {
    expect(parseRgbString('rgb(244, 235, 220)')).toEqual([244, 235, 220]);
  });

  it('parseRgbString parses rgba()', () => {
    expect(parseRgbString('rgba(244, 235, 220, 0.8)')).toEqual([244, 235, 220]);
  });

  it('parseRgbString parses #RRGGBB', () => {
    expect(parseRgbString('#F4EBDC')).toEqual([244, 235, 220]);
  });

  it('parseRgbString parses #RGB shorthand', () => {
    expect(parseRgbString('#FFF')).toEqual([255, 255, 255]);
  });

  it('parseRgbString parses space-separated rgb()', () => {
    expect(parseRgbString('rgb(244 235 220)')).toEqual([244, 235, 220]);
  });

  it('ratioBetween(ivory, bg-2) ≥ AAA threshold (7.0)', () => {
    // ivory #f4ebdc on bg-2 #1e1815 — the canonical Phase-5 text/bg pair
    // shipped by the `<ReplayStatusBadge />` and `<OfflineBar />` after
    // the Codex Round 1 fix.
    const ratio = ratioBetween('#f4ebdc', '#1e1815');
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AAA_BODY_TEXT_RATIO);
  });

  it('ratioBetween(oxblood, bg-0) < AAA threshold (regression guard)', () => {
    // oxblood #8a2a1f on bg-0 #0e0a08 = 2.28:1 — the historical FAIL
    // surface that motivated the AC2 / AC4 fixes. Asserts the helper
    // would catch it.
    const ratio = ratioBetween('#8a2a1f', '#0e0a08');
    expect(ratio).toBeLessThan(WCAG_AAA_BODY_TEXT_RATIO);
  });
});
