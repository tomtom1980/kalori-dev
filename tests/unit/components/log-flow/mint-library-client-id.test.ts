/**
 * POST-MVP-BUGFIX-2026-05-17-LM-SEC-2 — `mintLibraryClientId` v4 fallback
 * must use cryptographically secure entropy (`crypto.getRandomValues`) per
 * RFC 4122 §4.4 instead of `Math.random()`.
 *
 * Coverage:
 *   1. Fast path: `crypto.randomUUID` → uses it verbatim.
 *   2. Failing-first driver: `crypto.randomUUID` absent → MUST call
 *      `crypto.getRandomValues` (NOT Math.random) and return valid v4.
 *   3. No crypto API at all → last-resort Math.random fallback, still v4
 *      shape (schema-valid).
 *   4. All three branches produce strings that pass `z.string().uuid()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mintLibraryClientId } from '@/app/(app)/log/_components/ConfirmationScreen';
import { CreateLibraryBodySchema } from '@/lib/library/create-schema';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('mintLibraryClientId — LM-SEC-2', () => {
  // Save references to the original APIs so we can restore precisely after
  // each test (vi.unstubAllGlobals would also wipe globals we did not set).
  const originalCrypto: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalCrypto) {
      // happy-dom's crypto is restored automatically by unstubAllGlobals,
      // but we re-assert it here to keep the assertions in the next test
      // block deterministic regardless of test ordering.
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  it('Test 1: uses crypto.randomUUID fast path when available', () => {
    const sentinel = '11111111-2222-4333-8444-555555555555';
    vi.stubGlobal('crypto', {
      randomUUID: () => sentinel,
      // getRandomValues is also defined — but the fast path should win.
      getRandomValues: (buf: Uint8Array) => buf,
    });

    const id = mintLibraryClientId();

    expect(id).toBe(sentinel);
  });

  it('Test 2 (failing-first driver): when crypto.randomUUID is absent, uses crypto.getRandomValues and returns valid v4 — NOT Math.random', () => {
    // Spy that records whether getRandomValues was called and fills the
    // buffer deterministically with 0xff so we can verify the bit-twiddle.
    const getRandomValues = vi.fn((buf: Uint8Array) => {
      buf.fill(0xff);
      return buf;
    });
    // Spy that records whether Math.random was used (it MUST NOT be).
    const mathRandomSpy = vi.spyOn(Math, 'random');

    vi.stubGlobal('crypto', {
      // randomUUID intentionally undefined to force the fallback branch.
      getRandomValues,
    });

    const id = mintLibraryClientId();

    // getRandomValues was the entropy source.
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    // Math.random was NOT called — proves we did not regress into the
    // insecure path.
    expect(mathRandomSpy).not.toHaveBeenCalled();
    // The shape is a valid v4 UUID per RFC 4122.
    expect(id).toMatch(UUID_V4_RE);
    // Bit-twiddle sanity check: with all bytes 0xff, the resulting hex
    // string MUST have the version nibble = 4 at position 14 and the
    // variant nibble in {8,9,a,b} at position 19.
    expect(id.charAt(14)).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
  });

  it('Test 3: when neither crypto.randomUUID NOR crypto.getRandomValues is present, falls through to Math.random last-resort but still returns valid v4', () => {
    vi.stubGlobal('crypto', {}); // empty crypto object → both APIs undefined.

    const id = mintLibraryClientId();

    expect(id).toMatch(UUID_V4_RE);
  });

  it('Test 4: every branch produces a string that satisfies CreateLibraryBodySchema.client_id (z.string().uuid())', () => {
    // Branch A: randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
      getRandomValues: (buf: Uint8Array) => buf,
    });
    const idA = mintLibraryClientId();

    // Branch B: getRandomValues fallback
    vi.unstubAllGlobals();
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: Uint8Array) => {
        // Use a non-uniform pattern so the byte twiddle is exercised.
        for (let i = 0; i < buf.length; i++) buf[i] = (i * 17) & 0xff;
        return buf;
      },
    });
    const idB = mintLibraryClientId();

    // Branch C: no crypto at all
    vi.unstubAllGlobals();
    vi.stubGlobal('crypto', {});
    const idC = mintLibraryClientId();

    const minimalBody = {
      display_name: 'x',
      nutrition: {
        kcal: 1,
        macros: {
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
        },
      },
    };

    for (const id of [idA, idB, idC]) {
      const result = CreateLibraryBodySchema.safeParse({
        ...minimalBody,
        client_id: id,
      });
      expect(result.success).toBe(true);
    }
  });
});
