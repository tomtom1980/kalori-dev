/**
 * Letter-mark first-grapheme unit tests — Task 4.1 sub-step 3 §15.1.
 * Verbatim cases from ui-design.md §7.3.4 tiebreaker #7.
 */
import { describe, expect, it } from 'vitest';

import { firstGrapheme } from '@/lib/library/letter-mark';

describe('firstGrapheme (letter-mark)', () => {
  const CASES: Array<readonly [string, string, string]> = [
    ['Phở bò tái nạm', 'P', 'Vietnamese diacritic stripped'],
    ['Crème brûlée', 'C', 'French diacritic stripped'],
    ['2-egg omelet', '2', 'Leading digit kept'],
    ['🍎 Gala apple', 'G', 'Leading emoji skipped, first letter wins'],
    ['Żurek', 'Z', 'Polish combining stripped'],
    ['', '?', 'Empty string fallback'],
    ['🍎🍊', '?', 'Emoji-only collapses to ?'],
  ];

  for (const [input, expected, label] of CASES) {
    it(`"${input}" → "${expected}" (${label})`, () => {
      expect(firstGrapheme(input)).toBe(expected);
    });
  }

  it('uppercases lowercase inputs', () => {
    expect(firstGrapheme('banh mi')).toBe('B');
  });

  it('strips leading whitespace then picks first letter', () => {
    expect(firstGrapheme('   tea ')).toBe('T');
  });

  it('returns ? when only punctuation', () => {
    expect(firstGrapheme('...—— ’')).toBe('?');
  });
});
