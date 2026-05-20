/**
 * Tooltip-collision pre-emption — shared `truncateItemName` helper.
 *
 * Long contributor names in tooltip text (e.g. "Chicken stew with mushrooms,
 * carrots and a side of …") can blow past the 280px Tooltip max-width at
 * 768–900px viewport widths where MicronutrientPanel sits in a half-width
 * column next to WaterTracker. Truncating the per-item name to ~20 chars
 * keeps each "Top contributors: …" string compact.
 *
 * Vietnamese names contain combining diacritics (e.g. "Bún chả Hà Nội") —
 * naïve `String.slice(0, 20)` would split graphemes. Helper uses
 * `Intl.Segmenter` when available (Node 18+ ships it) and falls back to
 * `Array.from(str)` which iterates by code-point, not UTF-16 code unit.
 */
import { describe, expect, it } from 'vitest';

import { truncateItemName } from '@/lib/dashboard/build-hover-text-utils';

describe('truncateItemName', () => {
  it('returns short names unchanged (5 chars)', () => {
    expect(truncateItemName('Pho')).toBe('Pho');
    expect(truncateItemName('Bread')).toBe('Bread');
  });

  it('returns the empty string when passed an empty string', () => {
    expect(truncateItemName('')).toBe('');
  });

  it('keeps names at the 20-grapheme boundary unchanged', () => {
    // exactly 20 ASCII chars
    const exact = 'a'.repeat(20);
    expect(truncateItemName(exact)).toBe(exact);
  });

  it('truncates 21-grapheme names with an ellipsis suffix', () => {
    const long = 'a'.repeat(21);
    const result = truncateItemName(long);
    expect(result.endsWith('…')).toBe(true);
    // 19 source graphemes + the ellipsis = 20 total visual width
    expect(result).toBe('a'.repeat(19) + '…');
  });

  it('truncates a long English name with ellipsis', () => {
    expect(truncateItemName('Chicken stew with mushrooms')).toBe('Chicken stew with m…');
  });

  it('respects an explicit max argument', () => {
    expect(truncateItemName('abcdefghij', 5)).toBe('abcd…');
    expect(truncateItemName('abc', 5)).toBe('abc');
  });

  it('does not split a Vietnamese combining-diacritic grapheme', () => {
    // "Bún chả Hà Nội" — 14 graphemes, well under 20, must pass through.
    const name = 'Bún chả Hà Nội';
    expect(truncateItemName(name)).toBe(name);
  });

  it('truncates a long Vietnamese name on a grapheme boundary', () => {
    // Construct a 25-grapheme Vietnamese-flavored name. After truncation to
    // 20 graphemes (19 kept + ellipsis), the kept portion must still be a
    // valid grapheme sequence — no orphan combining marks.
    const long = 'Bún chả Hà Nội đặc biệt thêm';
    const truncated = truncateItemName(long);
    expect(truncated.endsWith('…')).toBe(true);
    // Count graphemes in the prefix (everything before the ellipsis). It
    // must be exactly 19 — the helper kept 19 source graphemes + appended
    // one ellipsis character = 20 visual width.
    const prefix = truncated.slice(0, -1);
    const graphemes = Array.from(
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(prefix)
        : Array.from(prefix).map((s) => ({ segment: s })),
    );
    expect(graphemes.length).toBe(19);
  });

  it('handles a string of grapheme count exactly = max + 1 (boundary)', () => {
    // 21-char input vs default max of 20 — must truncate.
    expect(truncateItemName('aaaaaaaaaaaaaaaaaaaaa')).toBe('a'.repeat(19) + '…');
  });
});
