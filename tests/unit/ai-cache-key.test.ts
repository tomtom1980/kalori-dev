/**
 * @vitest-environment node
 *
 * F8 CRITICAL — cache-key must include user_id (Task 3.2 RED).
 *
 * If the key omits user_id, user A's cached response can serve user B,
 * leaking region/dietary inference. These specs lock the composite
 * contract: `{call_type, user_id, normalized_input}` → SHA-256 PK.
 *
 * Concrete bindings:
 *   - computeCacheKey takes `{callType, userId, normalizedInput}` and returns
 *     a non-empty string (SHA-256 hex is deterministic, 64 chars, but the
 *     test only asserts "stable string; same inputs → same output").
 *   - Two users with identical input MUST produce DIFFERENT keys.
 *   - Two call types with same user/input MUST produce DIFFERENT keys.
 *   - Missing / empty user_id MUST throw (defence in depth — the server-role
 *     table has no RLS; the key IS the tenant-isolation rail).
 *
 * These tests import `computeCacheKey` from the RED-phase stub which throws
 * `not implemented` — so each assertion fails on the throw. GREEN implements
 * the real SHA-256 hash.
 */
import { describe, expect, it } from 'vitest';

import { computeCacheKey } from '@/lib/ai/cache';

describe('F8 — computeCacheKey (Task 3.2 cache key contract)', () => {
  it('produces a stable non-empty string for a given {callType, userId, normalizedInput}', () => {
    const a = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    const b = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });

  it('different userId + same input → different key (F8 cross-user isolation)', () => {
    const a = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    const b = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-beta',
      normalizedInput: 'pho bo',
    });
    expect(a).not.toBe(b);
  });

  it('different callType + same user/input → different key (call-type is part of the composite)', () => {
    const a = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    const b = computeCacheKey({
      callType: 'vision',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    expect(a).not.toBe(b);
  });

  it('different normalizedInput + same user/callType → different key', () => {
    const a = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'pho bo',
    });
    const b = computeCacheKey({
      callType: 'text-parse',
      userId: 'user-alpha',
      normalizedInput: 'banh mi',
    });
    expect(a).not.toBe(b);
  });

  it('missing / empty userId throws with a userId-specific error (defence-in-depth — service-role table has no RLS)', () => {
    // The stub throws 'not implemented' — we assert on a userId-specific
    // message so the RED-phase stub failure does NOT falsely satisfy this
    // test. GREEN must throw with /userId/i to prove the F8 guard exists.
    expect(() =>
      computeCacheKey({
        callType: 'text-parse',
        userId: '',
        normalizedInput: 'pho bo',
      }),
    ).toThrow(/userId|user_id/i);
  });
});
