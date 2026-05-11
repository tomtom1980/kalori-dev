/**
 * `lib/log-flow/classify-error.ts` — shared failure-mode classifier used
 * by TypeTab + SnapTab (Task 3.3, I5 fix).
 *
 * Codex round 1 (I5): the inline TypeTab/SnapTab classifier used the
 * regex /zod|validation|parse/iu to detect Zod errors. That matches
 * 'parse' as a substring — so any Error whose message includes
 * '/api/ai/text-parse' (as thrown by refresh-interceptor on 5xx) was
 * mis-classified as 'zod'. This module tightens the regex and centralises
 * the logic, exercised via `tests/unit/log-flow/classifyError.test.ts`.
 */
import type { FailureMode } from '@/lib/stores/useLogFlowStore';

export type ClassifiedFailure = Exclude<FailureMode, null>;

/**
 * Map an arbitrary thrown value into one of four user-visible failure
 * modes. Order is significant: timeout (DOMException) and rate-limit
 * (most specific) are checked before generic zod/network.
 */
export function classifyError(err: unknown): ClassifiedFailure {
  // AbortError from a user-triggered AbortController (unmount, Cancel button) is
  // semantically "cancelled", but the store currently maps both to the same
  // ManualEntryFallback surface, so we route through 'timeout' and document the gap.
  // If a future task adds a distinct 'cancelled' mode, update this branch.
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'timeout';
  }

  const msg = err instanceof Error ? err.message : String(err);

  // Rate-limit indicators — HTTP 429 or the word 'rate'.
  if (/\b429\b|\brate\b/iu.test(msg)) return 'rate-limit';

  // Timeout — either a 'timeout' substring (from the interceptor's own
  // AbortController message) or a literal 'abort'. `text-parse` does NOT
  // match because we require word boundary on 'abort'.
  if (/\btimeout\b|\babort(?:ed)?\b/iu.test(msg)) return 'timeout';

  // Zod / validation failures. I5 fix: the previous regex matched 'parse'
  // as a bare substring, mis-classifying messages like
  // `authPost /api/ai/text-parse failed: 500` (URL segment `text-parse`)
  // as 'zod'. We now match:
  //   - The word 'zod' with word boundaries.
  //   - 'validation' as a substring (matches ValidationError / validation_error).
  //   - The phrase 'parse error' for legitimate AI parse errors.
  // 'parse' on its own (inside URL paths) is NOT a match.
  if (/\bzod\b|validation|\bparse error\b/iu.test(msg)) return 'zod';

  // Default — generic network-ish failure (includes 500-class responses
  // from authPost, which are the real case the broken regex was hitting).
  return 'network';
}
