/**
 * @vitest-environment node
 *
 * Unit tests for `lib/storage/sign-thumbnail.ts` — Codex Round 1 Critical #1
 * fix (library overhaul 2026-05-16).
 *
 * Contract:
 *   - signThumbnailUrl(path, supabase): Promise<string | null>
 *   - Returns a 1-hour signed URL when given a storage path.
 *   - Returns null when signing fails (graceful → letter-mark fallback).
 *   - Pass-through: when given an already-signed URL (legacy back-compat
 *     during the path-vs-URL transition), returns it as-is.
 *   - Null/empty input returns null.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isStoragePath,
  signThumbnailUrl,
  signThumbnailUrlBatch,
} from '@/lib/storage/sign-thumbnail';

function makeSupabaseMock(signedUrl: string | null, error: unknown = null) {
  return {
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: vi.fn(async (_path: string, _ttl: number) => ({
          data: signedUrl ? { signedUrl } : null,
          error,
        })),
      }),
    },
  };
}

describe('signThumbnailUrl', () => {
  it('returns null for null input', async () => {
    const supabase = makeSupabaseMock('ignored');
    const result = await signThumbnailUrl(null, supabase as never);
    expect(result).toBeNull();
  });

  it('returns null for empty string input', async () => {
    const supabase = makeSupabaseMock('ignored');
    const result = await signThumbnailUrl('', supabase as never);
    expect(result).toBeNull();
  });

  it('passes through legacy http(s) URLs unchanged (no re-sign)', async () => {
    const supabase = makeSupabaseMock('https://signed.replacement/x.webp');
    const legacyUrl = 'https://signed.legacy/old.webp';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await signThumbnailUrl(legacyUrl, supabase as never);
    expect(result).toBe(legacyUrl);
    warnSpy.mockRestore();
  });

  // Bugfix R1 C1 — signed URL persistence hazard. When a caller passes a
  // signed `https://` URL into the signer (which happens when the merge
  // dialog copies a sign-on-read thumbnail_url and round-trips it), emit
  // a console.warn so the regression has a telemetry signal even though
  // the existing pass-through stays for legacy back-compat.
  it('emits a warn signal when given a legacy http(s) URL (telemetry for the persistence hazard)', async () => {
    const supabase = makeSupabaseMock('ignored');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await signThumbnailUrl('https://signed.legacy/old.webp', supabase as never);
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0]?.[0];
    expect(String(message)).toMatch(/signed url/i);
    warnSpy.mockRestore();
  });

  it('signs storage paths with a 1-hour TTL', async () => {
    const signSpy = vi.fn(async (_path: string, _ttl: number) => ({
      data: { signedUrl: 'https://signed.test/sketch.webp' },
      error: null,
    }));
    const supabase = {
      storage: { from: () => ({ createSignedUrl: signSpy }) },
    };
    const path = '00000000-0000-0000-0000-000000000001/sketch_abc.webp';
    const result = await signThumbnailUrl(path, supabase as never);
    expect(result).toBe('https://signed.test/sketch.webp');
    expect(signSpy).toHaveBeenCalledOnce();
    const [calledPath, calledTtl] = signSpy.mock.calls[0]!;
    expect(calledPath).toBe(path);
    expect(calledTtl).toBe(60 * 60); // 1 hour
  });

  it('returns null when signing errors', async () => {
    const supabase = makeSupabaseMock(null, { message: 'object not found' });
    const result = await signThumbnailUrl('u-1/sketch_x.webp', supabase as never);
    expect(result).toBeNull();
  });

  it('returns null when supabase returns no signedUrl payload', async () => {
    const supabase = makeSupabaseMock(null);
    const result = await signThumbnailUrl('u-1/sketch_x.webp', supabase as never);
    expect(result).toBeNull();
  });
});

// Bugfix R1 C2 — concurrency cap + per-call timeout + graceful degradation.
// The library list render previously called Promise.all over up to 500 raw
// signing calls with no cap, no timeout, and no failure boundary; a single
// stuck call could block the whole render. The batched helper now enforces
// a max-in-flight cap and degrades per-item on failure.
describe('signThumbnailUrlBatch — concurrency cap + timeout + degradation', () => {
  it('caps in-flight signing calls at 20 (default concurrency)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slowSign = vi.fn(async (path: string, _ttl: number) => {
      inFlight += 1;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      // Yield to let other queued signs accumulate before we resolve.
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    });
    const supabase = {
      storage: { from: () => ({ createSignedUrl: slowSign }) },
    };

    const paths = Array.from({ length: 100 }, (_, i) => `u-1/sketch_${i}.webp`);
    const results = await signThumbnailUrlBatch(paths, supabase as never);

    expect(results).toHaveLength(100);
    expect(slowSign).toHaveBeenCalledTimes(100);
    // The cap is 20 — even with 100 input paths, at any moment at most 20
    // should be in flight.
    expect(maxInFlight).toBeLessThanOrEqual(20);
  });

  it('per-item failure does NOT crash the batch — null falls back for that row only', async () => {
    let callIndex = 0;
    const signFn = vi.fn(async (path: string, _ttl: number) => {
      const idx = callIndex++;
      if (idx === 5) throw new Error('transient supabase failure');
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    });
    const supabase = {
      storage: { from: () => ({ createSignedUrl: signFn }) },
    };

    const paths = Array.from({ length: 10 }, (_, i) => `u-1/sketch_${i}.webp`);
    const results = await signThumbnailUrlBatch(paths, supabase as never);

    expect(results).toHaveLength(10);
    // Exactly one slot is null (the failed call). Others are signed URLs.
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => typeof r === 'string')).toHaveLength(9);
  });

  it('respects an override concurrency option', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slowSign = vi.fn(async (path: string, _ttl: number) => {
      inFlight += 1;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise((r) => setTimeout(r, 3));
      inFlight -= 1;
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    });
    const supabase = {
      storage: { from: () => ({ createSignedUrl: slowSign }) },
    };

    const paths = Array.from({ length: 30 }, (_, i) => `u-1/sketch_${i}.webp`);
    await signThumbnailUrlBatch(paths, supabase as never, { concurrency: 5 });

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });
});

describe('isStoragePath', () => {
  it('classifies signed URLs as NOT a storage path', () => {
    expect(isStoragePath('https://signed.test/sketch.webp')).toBe(false);
    expect(isStoragePath('http://example.com/x')).toBe(false);
  });

  it('classifies bare path strings as a storage path', () => {
    expect(isStoragePath('00000000-0000-0000-0000-000000000001/sketch_abc.webp')).toBe(true);
    expect(isStoragePath('u-1/sketch_x.webp')).toBe(true);
  });

  it('classifies null/empty as NOT a path', () => {
    expect(isStoragePath(null)).toBe(false);
    expect(isStoragePath('')).toBe(false);
  });
});
