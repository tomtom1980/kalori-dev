/**
 * Task 3.3 I5 — classifyError routing unit test.
 *
 * Adversarial reviewer found that TypeTab + SnapTab shared a classifier
 * whose `/zod|validation|parse/iu` regex matched 'parse' as a substring.
 * When the refresh-interceptor throws `authPost /api/ai/text-parse failed: 500`,
 * the URL segment 'text-parse' matched the 'parse' token and mis-classified
 * a 500 network error as 'zod' validation failure.
 *
 * After fix: the shared `lib/log-flow/classify-error.ts` uses word-bounded
 * patterns and routes correctly across the 4 failure modes
 * (network / timeout / rate-limit / zod) regardless of URL path.
 */
import { describe, expect, it } from 'vitest';

import { classifyError } from '@/lib/log-flow/classify-error';

describe('classifyError — routes each failure-mode class correctly', () => {
  it('returns "timeout" for DOMException("AbortError")', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(classifyError(err)).toBe('timeout');
  });

  it('returns "timeout" for a message containing "timeout"', () => {
    expect(classifyError(new Error('request timeout after 30s'))).toBe('timeout');
  });

  it('returns "rate-limit" for a 429 status-coded message', () => {
    expect(classifyError(new Error('authPost /api/ai/text-parse failed: 429'))).toBe('rate-limit');
  });

  it('returns "rate-limit" for a message containing the word "rate"', () => {
    expect(classifyError(new Error('rate limit exceeded'))).toBe('rate-limit');
  });

  it('returns "zod" for a message containing "zod"', () => {
    expect(classifyError(new Error('Zod ValidationError on items[0].name'))).toBe('zod');
  });

  it('returns "zod" for a message containing "validation"', () => {
    expect(classifyError(new Error('server returned ValidationError'))).toBe('zod');
  });

  it('returns "zod" for the explicit phrase "parse error"', () => {
    // This is the ONLY 'parse'-adjacent match we preserve, per the I5
    // fix: legitimate parse-error copy still classifies as zod.
    expect(classifyError(new Error('gemini returned parse error'))).toBe('zod');
  });

  it('I5 — returns "network" (NOT "zod") for a 500 message whose URL contains "text-parse"', () => {
    // BEFORE fix: substring 'parse' in '/api/ai/text-parse' matched the
    // old /zod|validation|parse/ regex and classified a 500 as 'zod'.
    // AFTER fix: word-bounded matching + 'parse error' phrase only.
    expect(classifyError(new Error('authPost /api/ai/text-parse failed: 500'))).toBe('network');
  });

  it('I5 — returns "network" (NOT "zod") for a longer 500 message with "text-parse" URL', () => {
    expect(
      classifyError(new Error('authPost /api/ai/text-parse failed: 500 Internal Server Error')),
    ).toBe('network');
  });

  it('returns "network" for a generic Error with no known substring', () => {
    expect(classifyError(new Error('something went wrong'))).toBe('network');
  });

  it('returns "network" for a raw string', () => {
    expect(classifyError('unknown failure')).toBe('network');
  });
});
