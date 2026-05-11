/**
 * Task 3.4 — `lib/text/normalize.ts` unit tests.
 *
 * Contract (synthesis §5.1 + briefing §8 step 1):
 *   - lowercase
 *   - strip diacritics (NFD + remove combining marks). Vietnamese + Western.
 *   - strip punctuation
 *   - collapse whitespace (multiple spaces → single)
 *   - trim leading/trailing whitespace
 *   - sort tokens alphabetically (so "eggs two" and "two eggs" normalize equal
 *     BUT "2 eggs" stays distinct — we do NOT coerce numerals to words; MVP
 *     no-fuzzy per design-doc §18.3)
 *   - return '' on empty / whitespace-only input
 *
 * Critical negative case: "two eggs" !== "2 eggs" (briefing §2 acceptance).
 */
import { describe, expect, it } from 'vitest';

import { normalizeName } from '@/lib/text/normalize';

describe('normalizeName', () => {
  it('lowercases input', () => {
    expect(normalizeName('Eggs')).toBe('eggs');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeName('  eggs  ')).toBe('eggs');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeName('two   eggs')).toBe('eggs two');
  });

  it('strips punctuation', () => {
    expect(normalizeName('two, eggs!')).toBe('eggs two');
  });

  it('strips Vietnamese diacritics ("phở" → "pho")', () => {
    expect(normalizeName('phở')).toBe('pho');
  });

  it('strips Western diacritics ("café" → "cafe")', () => {
    expect(normalizeName('café')).toBe('cafe');
  });

  it('sorts tokens alphabetically', () => {
    expect(normalizeName('eggs and toast')).toBe('and eggs toast');
    expect(normalizeName('toast and eggs')).toBe('and eggs toast');
  });

  it('"two eggs" is NOT equal to "2 eggs" — no numeral-to-word coercion (MVP strict)', () => {
    const twoWords = normalizeName('two eggs');
    const twoNumeric = normalizeName('2 eggs');
    expect(twoWords).not.toBe(twoNumeric);
  });

  it('returns "" for empty input', () => {
    expect(normalizeName('')).toBe('');
  });

  it('returns "" for whitespace-only input', () => {
    expect(normalizeName('   ')).toBe('');
  });

  it('handles mixed case + diacritics + punctuation + whitespace in one pass', () => {
    expect(normalizeName('  Café, Crème!   ')).toBe('cafe creme');
  });

  it('preserves internal numerals as separate tokens', () => {
    // "2 eggs" sorts as "2 eggs" (digits sort before letters in ASCII).
    expect(normalizeName('2 eggs')).toBe('2 eggs');
  });
});
