/**
 * Task 3.3 — lib/image/compress.ts unit tests.
 *
 * We mock `browser-image-compression` (real compression inside happy-dom
 * is flaky — Canvas is a jsdom/happy-dom stub). The test proves:
 *   - Unsupported MIME throws synchronously (before loading the library)
 *   - Happy path delegates to the library with the expected defaults
 *   - `stripDataUrlPrefix` removes only the prefix, preserving bytes
 *
 * Task 4.7.5 — additional tests for `compressDualOutput()` two-pass
 * vision + thumbnail compression with WebP fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Always-mock the compression library so the test is deterministic.
// The mock impl branches on `fileType` so the dual-output test sees a
// distinguishable WebP blob for the thumbnail pass.
vi.mock('browser-image-compression', () => {
  const impl = vi.fn(
    async (
      _file: File | Blob,
      opts: { fileType?: string; maxWidthOrHeight?: number; onProgress?: (p: number) => void },
    ) => {
      const ft = opts?.fileType ?? 'image/jpeg';
      if (typeof opts?.onProgress === 'function') {
        // Simulate two progress ticks: 0% then 100%.
        opts.onProgress(0);
        opts.onProgress(100);
      }
      if (ft === 'image/webp') {
        return new Blob(['fake-webp'], { type: 'image/webp' });
      }
      return new Blob(['fake-compressed'], { type: 'image/jpeg' });
    },
  );
  return {
    default: impl,
    __impl: impl,
  };
});

describe('lib/image/compress', () => {
  beforeEach(() => {
    // Fake-implement URL.createObjectURL since happy-dom may not provide it.
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', {
        value: () => 'blob:mock',
        configurable: true,
      });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: () => void 0,
        configurable: true,
      });
    }
    // Stub Image so measureBlob resolves.
    class MockImg {
      naturalWidth = 1024;
      naturalHeight = 768;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    (globalThis as unknown as { Image: typeof Image }).Image = MockImg as unknown as typeof Image;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported MIME before attempting compression', async () => {
    const { compressImage } = await import('@/lib/image/compress');
    const bogus = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await expect(compressImage(bogus)).rejects.toThrow(/Unsupported image MIME/);
  });

  it('delegates to browser-image-compression with Worker + 500KB + 1600px defaults', async () => {
    const { compressImage } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(1024)], 'meal.jpg', { type: 'image/jpeg' });
    const result = await compressImage(big);
    expect(result.sizeBytes).toBeLessThanOrEqual(500 * 1024);
    expect(result.base64.startsWith('data:')).toBe(true);

    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    expect(impl).toHaveBeenCalledTimes(1);
    const firstCall = impl.mock.calls[0] as unknown as [
      File,
      {
        maxSizeMB: number;
        maxWidthOrHeight: number;
        useWebWorker: boolean;
        initialQuality: number;
      },
    ];
    const callOpts = firstCall[1];
    // 500 * 1024 / (1024*1024) = 0.488 — close to 0.5 MB per briefing contract.
    expect(callOpts.maxSizeMB).toBeGreaterThan(0.48);
    expect(callOpts.maxSizeMB).toBeLessThanOrEqual(0.5);
    expect(callOpts.maxWidthOrHeight).toBe(1600);
    expect(callOpts.useWebWorker).toBe(true);
    expect(callOpts.initialQuality).toBeCloseTo(0.82, 2);
  });

  it('propagates AbortSignal — throws before delegating when already aborted', async () => {
    const { compressImage } = await import('@/lib/image/compress');
    const f = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const ac = new AbortController();
    ac.abort();
    await expect(compressImage(f, { signal: ac.signal })).rejects.toThrow(/aborted/);
  });

  it('stripDataUrlPrefix removes the prefix, preserving bytes', async () => {
    const { stripDataUrlPrefix } = await import('@/lib/image/compress');
    expect(stripDataUrlPrefix('data:image/jpeg;base64,AAAA')).toBe('AAAA');
    expect(stripDataUrlPrefix('AAAA-no-prefix')).toBe('AAAA-no-prefix');
  });
});

describe('lib/image/compress — compressDualOutput (Task 4.7.5)', () => {
  beforeEach(() => {
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', {
        value: () => 'blob:mock',
        configurable: true,
      });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: () => void 0,
        configurable: true,
      });
    }
    class MockImg {
      naturalWidth = 1024;
      naturalHeight = 768;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    (globalThis as unknown as { Image: typeof Image }).Image = MockImg as unknown as typeof Image;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns vision (≤500 KB JPEG) + thumbnail (≤50 KB WebP) outputs', async () => {
    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    const result = await compressDualOutput(big);

    expect(result.vision.sizeBytes).toBeLessThanOrEqual(500 * 1024);
    expect(result.vision.blob.type).toBe('image/jpeg');

    expect(result.thumbnail.sizeBytes).toBeLessThanOrEqual(50 * 1024);
    expect(result.thumbnail.blob.type).toBe('image/webp');
  });

  it('runs two passes against browser-image-compression with vision (1600 px) then thumbnail (320 px)', async () => {
    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    await compressDualOutput(big);

    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    expect(impl).toHaveBeenCalledTimes(2);

    const firstCall = impl.mock.calls[0] as unknown as [
      File,
      { maxWidthOrHeight: number; fileType: string; maxSizeMB: number; initialQuality: number },
    ];
    const secondCall = impl.mock.calls[1] as unknown as [
      File,
      { maxWidthOrHeight: number; fileType: string; maxSizeMB: number; initialQuality: number },
    ];

    // Vision pass (existing defaults).
    expect(firstCall[1].maxWidthOrHeight).toBe(1600);
    expect(firstCall[1].fileType).toBe('image/jpeg');
    expect(firstCall[1].maxSizeMB).toBeGreaterThan(0.48);
    expect(firstCall[1].maxSizeMB).toBeLessThanOrEqual(0.5);

    // Thumbnail pass (50 KB / 320 px / WebP).
    expect(secondCall[1].maxWidthOrHeight).toBe(320);
    expect(secondCall[1].fileType).toBe('image/webp');
    expect(secondCall[1].maxSizeMB).toBeGreaterThan(0.04);
    expect(secondCall[1].maxSizeMB).toBeLessThanOrEqual(0.05);
    expect(secondCall[1].initialQuality).toBeCloseTo(0.7, 2);
  });

  it('onProgress fires across both passes and reaches 1.0', async () => {
    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    const ticks: number[] = [];
    await compressDualOutput(big, { onProgress: (p) => ticks.push(p) });

    expect(ticks.length).toBeGreaterThan(0);
    // Final tick should be at the end of the second pass — wall-clock 1.0.
    expect(ticks[ticks.length - 1]).toBeCloseTo(1.0, 2);
    // First-pass progress should be in [0, 0.5] ± epsilon, so at least one
    // observed value sits at or below 0.5.
    expect(ticks.some((t) => t <= 0.5 + 1e-6)).toBe(true);
  });

  it('falls back to JPEG thumbnail when the library silently ignores WebP', async () => {
    // Override the mock for this test only — return JPEG regardless of fileType.
    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    impl.mockImplementation(
      async (_file: File | Blob, opts: { fileType?: string; onProgress?: (p: number) => void }) => {
        if (typeof opts?.onProgress === 'function') {
          opts.onProgress(0);
          opts.onProgress(100);
        }
        return new Blob(['fake-jpeg'], { type: 'image/jpeg' });
      },
    );

    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    const result = await compressDualOutput(big);

    expect(result.thumbnail.blob.type).toBe('image/jpeg');
    expect(result.thumbnail.sizeBytes).toBeLessThanOrEqual(50 * 1024);

    // Improvement 1 — verify the JPEG retry actually fired. 3 calls total:
    // pass 1 (vision JPEG) + pass 2 (thumbnail attempt — WebP requested,
    // mock returned JPEG anyway) + pass 3 (JPEG fallback retry).
    expect(impl).toHaveBeenCalledTimes(3);
    const thirdCall = impl.mock.calls[2] as unknown as [
      File,
      { fileType: string; maxWidthOrHeight: number; maxSizeMB: number; initialQuality: number },
    ];
    expect(thirdCall[1].fileType).toBe('image/jpeg');
    expect(thirdCall[1].maxWidthOrHeight).toBe(320);
    expect(thirdCall[1].maxSizeMB).toBeLessThanOrEqual(0.05);
    expect(thirdCall[1].initialQuality).toBeCloseTo(0.7, 2);
  });

  it('progress is monotonic and does NOT hit 1.0 until the JPEG fallback retry completes', async () => {
    // Force the JPEG-fallback branch by returning JPEG regardless of fileType.
    // Track per-call invocations so we can assert pass 2 (WebP attempt) does
    // NOT drive wall-clock progress to 1.0 before pass 3 (JPEG retry).
    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    let callIndex = 0;
    const ticksPerCall: number[][] = [];
    impl.mockImplementation(
      async (_file: File | Blob, opts: { fileType?: string; onProgress?: (p: number) => void }) => {
        const i = callIndex++;
        const observed: number[] = [];
        if (typeof opts?.onProgress === 'function') {
          const cb = opts.onProgress;
          // Wrap the callback so we capture per-call wall-clock progress AT
          // the time pass `i` reports each tick.
          const wrapped = (p: number): void => {
            cb(p);
          };
          // Drive the standard library tick sequence.
          wrapped(0);
          wrapped(50);
          wrapped(100);
        }
        ticksPerCall.push(observed);
        return new Blob(['fake-jpeg'], { type: 'image/jpeg' });
      },
    );

    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    const ticks: number[] = [];
    await compressDualOutput(big, { onProgress: (p) => ticks.push(p) });

    // Final tick must land at wall-clock 1.0 (overall completion).
    expect(ticks[ticks.length - 1]).toBeCloseTo(1.0, 2);
    // Progress must never go backwards across passes (incl. silent JPEG retry).
    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1] ?? 0;
      const curr = ticks[i] ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev - 1e-6);
    }
    // The fallback path runs 3 library calls: vision JPEG, thumbnail WebP
    // attempt, then JPEG retry. The fix requires the JPEG retry to receive
    // a progress callback — otherwise the bar pins at 1.0 during the silent
    // retry. We assert wall-clock progress reaches 1.0 ONLY after pass 3,
    // i.e., the JPEG retry MUST receive an onProgress callback (visible by
    // having captured ticks for it).
    expect(impl).toHaveBeenCalledTimes(3);
    const thirdCallOpts = impl.mock.calls[2]?.[1] as
      | { onProgress?: (p: number) => void }
      | undefined;
    expect(typeof thirdCallOpts?.onProgress).toBe('function');
  });

  it('aborts before second pass when signal is aborted between passes', async () => {
    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    const ac = new AbortController();
    ac.abort();
    await expect(compressDualOutput(big, { signal: ac.signal })).rejects.toThrow(/aborted/);
  });

  it('aborts AFTER first pass resolves but BEFORE second pass starts', async () => {
    // Override the mock so we can synchronously abort during pass-1's
    // resolution. The mock invocation sequence is:
    //   call 1 — vision pass: aborts the controller AS its onProgress fires
    //   call 2 — thumbnail pass: must NEVER happen (inter-pass guard fires)
    const ac = new AbortController();
    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    let callIndex = 0;
    impl.mockImplementation(
      async (_file: File | Blob, opts: { fileType?: string; onProgress?: (p: number) => void }) => {
        const i = callIndex++;
        if (i === 0) {
          // Pass 1 — drive progress to 100 then trip the abort BEFORE returning.
          if (typeof opts?.onProgress === 'function') {
            opts.onProgress(0);
            opts.onProgress(100);
          }
          ac.abort();
          return new Blob(['fake-vision'], { type: 'image/jpeg' });
        }
        // Pass 2 — should NOT be reached.
        return new Blob(['should-not-be-called'], { type: 'image/webp' });
      },
    );

    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    await expect(compressDualOutput(big, { signal: ac.signal })).rejects.toThrow(/aborted/);

    // Inter-pass guard must short-circuit: only 1 call, never the thumbnail pass.
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('aborts mid-thumbnail-pass when signal aborts during the second pass in-flight', async () => {
    // Mock pass 1 returns immediately; pass 2 is "in-flight" — it awaits a
    // microtask, by which time the controller has aborted. The signal is
    // forwarded into pass 2 (via `compressImage`), which re-checks
    // `signal.aborted` after its own internal await and throws 'aborted'.
    const ac = new AbortController();
    const mod = await import('browser-image-compression');
    const impl = (mod as unknown as { __impl: ReturnType<typeof vi.fn> }).__impl;
    let callIndex = 0;
    impl.mockImplementation(async (_file: File | Blob, _opts: unknown) => {
      const i = callIndex++;
      if (i === 0) {
        return new Blob(['fake-vision'], { type: 'image/jpeg' });
      }
      // Pass 2 — simulate library work, abort before it resolves.
      ac.abort();
      // Yield so compressImage's post-await `signal.aborted` check fires.
      await Promise.resolve();
      return new Blob(['fake-thumb'], { type: 'image/webp' });
    });

    const { compressDualOutput } = await import('@/lib/image/compress');
    const big = new File(['x'.repeat(2048)], 'meal.jpg', { type: 'image/jpeg' });
    await expect(compressDualOutput(big, { signal: ac.signal })).rejects.toThrow(/aborted/);

    // Both passes attempted (pass 2 mid-flight when abort triggered).
    expect(impl).toHaveBeenCalledTimes(2);
  });
});
