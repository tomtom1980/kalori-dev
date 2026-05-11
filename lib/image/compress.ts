/**
 * `lib/image/compress.ts` — client-side image compression (Task 3.3).
 *
 * Thin wrapper around `browser-image-compression`. The library is dynamically
 * imported so only users who actually open the Snap tab pay the ~50 KB bundle
 * cost (bundle-conditional rule from vercel-react-best-practices §2).
 *
 * Contract:
 *   - Output ≤ maxSizeBytes (default 500 KB)
 *   - Longest edge ≤ maxWidthOrHeight (default 1600 px)
 *   - Web Worker offload always-on (useWebWorker: true) to keep the main
 *     thread responsive on phone-class photos (see perf spec §9.2)
 *   - EXIF orientation auto-normalized by the library
 *   - Returns `{ blob, base64, widthPx, heightPx, sizeBytes }` where `base64`
 *     is the full `data:image/...;base64,...` URL string (convenience —
 *     callers strip the prefix for Gemini payloads).
 *
 * Browser-only: throws at load time when run inside SSR because
 * `browser-image-compression` depends on `window.document.createElement`
 * (canvas path). The SnapTab component is `'use client'` + dynamically
 * imported, so SSR never reaches here.
 *
 * I1 (Codex round 1) — abort behaviour: `browser-image-compression` v2.x
 * wires `opts.signal` into its yielded results but does NOT call
 * `worker.terminate()` on abort. The Worker thread continues until it
 * naturally completes (~400–800 ms for a 10 MP phone photo). Consequence:
 * aborted compressions still spin the Worker to completion, burning a
 * little CPU/battery; the main-thread code correctly ignores the result
 * via the pre/post `signal.aborted` checks. For a cancel button (Task 3.4)
 * this behaviour may need a bespoke `terminate()` path; MVP accepts it.
 */

export interface CompressOptions {
  maxSizeBytes?: number;
  maxWidthOrHeight?: number;
  quality?: number;
  mimeType?: string;
  /** Progress callback. Called repeatedly with values in [0, 1]. */
  onProgress?: (progress: number) => void;
  /** Abort the compression early. */
  signal?: AbortSignal;
}

export interface CompressResult {
  blob: Blob;
  base64: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}

const DEFAULT_MAX_SIZE = 500 * 1024;
const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MIME = 'image/jpeg';

// Task 4.7.5 — thumbnail-pass targets (50 KB / 320 px / WebP @ q 0.7).
const THUMB_MAX_SIZE = 50 * 1024;
const THUMB_MAX_EDGE = 320;
const THUMB_QUALITY = 0.7;
const THUMB_MIME = 'image/webp';

const SUPPORTED_MIMES = /^image\/(jpeg|png|webp|heic|heif)$/i;

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Measure a decoded image's pixel dimensions.
 *
 * I2 (Codex round 1): the blob: URL is revoked inside img.onload/onerror.
 * In pathological cases (tab suspend during decode, runtime that doesn't
 * wire onerror) the callbacks never fire and the URL sits on the browser's
 * blob-URL table. We add a 10-second fallback revoke so the URL is always
 * released eventually. Calling `URL.revokeObjectURL` on an already-revoked
 * URL is a no-op, so the double-revoke path is safe.
 */
function measureBlob(blob: Blob): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    const fallbackRevoke = setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);

    const done = (): void => {
      clearTimeout(fallbackRevoke);
      URL.revokeObjectURL(url);
    };

    img.onload = () => {
      const dims = { widthPx: img.naturalWidth, heightPx: img.naturalHeight };
      done();
      resolve(dims);
    };
    img.onerror = () => {
      done();
      reject(new Error('Image decode failed'));
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File | Blob,
  opts?: CompressOptions,
): Promise<CompressResult> {
  if (typeof window === 'undefined') {
    throw new Error('compressImage must run in a browser context');
  }

  const type = (file as File).type || DEFAULT_MIME;
  if (!SUPPORTED_MIMES.test(type)) {
    throw new Error(`Unsupported image MIME: ${type}`);
  }

  const maxSizeBytes = opts?.maxSizeBytes ?? DEFAULT_MAX_SIZE;
  const maxWidthOrHeight = opts?.maxWidthOrHeight ?? DEFAULT_MAX_EDGE;
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  const mimeType = opts?.mimeType ?? DEFAULT_MIME;

  if (opts?.signal?.aborted) {
    throw new Error('aborted');
  }

  // Dynamic import — only loaded when SnapTab actually compresses.
  const mod = await import('browser-image-compression');
  const imageCompression = mod.default ?? (mod as unknown as typeof mod.default);

  const compressionOpts: Parameters<typeof imageCompression>[1] = {
    maxSizeMB: maxSizeBytes / (1024 * 1024),
    maxWidthOrHeight,
    useWebWorker: true,
    initialQuality: quality,
    fileType: mimeType,
  };
  if (opts?.onProgress) {
    const onProgress = opts.onProgress;
    compressionOpts.onProgress = (p: number) => {
      try {
        onProgress(Math.max(0, Math.min(1, p / 100)));
      } catch {
        // ignore progress handler errors — they must not break compression
      }
    };
  }
  if (opts?.signal) {
    compressionOpts.signal = opts.signal;
  }
  const compressed = await imageCompression(file as File, compressionOpts);

  if (opts?.signal?.aborted) {
    throw new Error('aborted');
  }

  const [base64, dims] = await Promise.all([blobToDataURL(compressed), measureBlob(compressed)]);

  return {
    blob: compressed,
    base64,
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
    sizeBytes: compressed.size,
  };
}

/**
 * Strip the `data:image/jpeg;base64,` prefix so the result is just the
 * base64-encoded bytes, suitable for Gemini's `inline_data` field or our
 * own JSON-bodied routes. Callers who need the full data URL read
 * `result.base64` directly; callers pushing to an HTTP body call this.
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl;
  return dataUrl.slice(comma + 1);
}

/**
 * Task 4.7.5 — dual-output compression result.
 *
 * Two passes from one source file:
 *   - vision   → ≤500 KB JPEG, ≤1600 px (Gemini Vision payload).
 *   - thumbnail → ≤50 KB WebP, ≤320 px (Storage bucket).
 *
 * The thumbnail pass falls back to JPEG when the host browser can't encode
 * WebP (older Safari): caller forwards `result.thumbnail.blob.type` as the
 * `mimeType` field to the thumbnail route, which accepts both.
 */
export interface CompressDualResult {
  vision: CompressResult;
  thumbnail: CompressResult;
}

/**
 * Compress one source file into BOTH a vision-targeted blob and a
 * thumbnail-targeted blob.
 *
 * Why dual-output: Pre-Task-4.7.5, SnapTab compressed once into a 500 KB
 * vision blob and POSTed the same bytes to the thumbnail route, which has
 * a hard 50 KB ceiling — every realistic photo failed silently. Splitting
 * the compression into two budgeted passes is the only way to satisfy
 * both contracts from a single capture.
 *
 * Wall-clock progress: pass 1 maps to [0, 0.5], pass 2 to [0.5, 1.0].
 *
 * WebP fallback: if the produced thumbnail blob's `.type` does NOT start
 * with `image/webp`, retry the thumbnail pass forcing JPEG. The route's
 * `mimeType` schema accepts JPEG too, and the magic-byte sniff handles
 * both formats. We trust the produced blob's MIME — no UA sniff.
 */
export async function compressDualOutput(
  file: File | Blob,
  opts?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
): Promise<CompressDualResult> {
  if (typeof window === 'undefined') {
    throw new Error('compressDualOutput must run in a browser context');
  }
  if (opts?.signal?.aborted) {
    throw new Error('aborted');
  }

  const onProgress = opts?.onProgress;
  // Map per-pass progress into the wall-clock window. Pass 1 (vision) →
  // [0, 0.5]. Pass 2 (thumbnail WebP attempt) → [0.5, 0.75] reserved range:
  // we cap the WebP attempt at 0.75 so the bar does NOT visibly hit 1.0
  // before the silent JPEG retry runs (Codex R1 Improvement 3 — old
  // Safari sees a progress blip otherwise). If the WebP attempt succeeds
  // (no fallback), we emit a final 1.0 tick to close the bar. If fallback
  // fires, its progress maps to [0.75, 1.0].
  const visionProgress = onProgress
    ? (p: number) => onProgress(Math.max(0, Math.min(1, p)) * 0.5)
    : undefined;
  const thumbnailProgress = onProgress
    ? (p: number) => onProgress(0.5 + Math.max(0, Math.min(1, p)) * 0.25)
    : undefined;
  const fallbackProgress = onProgress
    ? (p: number) => onProgress(0.75 + Math.max(0, Math.min(1, p)) * 0.25)
    : undefined;

  // Pass 1 — vision (existing defaults: 500 KB / 1600 px / JPEG q=0.82).
  const vision = await compressImage(file, {
    ...(visionProgress ? { onProgress: visionProgress } : {}),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  });

  if (opts?.signal?.aborted) {
    throw new Error('aborted');
  }

  // Pass 2 — thumbnail (50 KB / 320 px / WebP q=0.7).
  let thumbnail = await compressImage(file, {
    maxSizeBytes: THUMB_MAX_SIZE,
    maxWidthOrHeight: THUMB_MAX_EDGE,
    quality: THUMB_QUALITY,
    mimeType: THUMB_MIME,
    ...(thumbnailProgress ? { onProgress: thumbnailProgress } : {}),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  });

  // WebP fallback — older Safari may ignore `fileType: 'image/webp'` and
  // return JPEG bytes. Detect by the produced blob's MIME and retry once
  // forcing JPEG so the caller sees a consistent, route-acceptable type.
  if (!thumbnail.blob.type.startsWith('image/webp')) {
    thumbnail = await compressImage(file, {
      maxSizeBytes: THUMB_MAX_SIZE,
      maxWidthOrHeight: THUMB_MAX_EDGE,
      quality: THUMB_QUALITY,
      mimeType: 'image/jpeg',
      ...(fallbackProgress ? { onProgress: fallbackProgress } : {}),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
  } else if (onProgress) {
    // No fallback ran — close the bar at wall-clock 1.0 since pass 2 was
    // capped at 0.75 to reserve room for a potential retry.
    onProgress(1.0);
  }

  return { vision, thumbnail };
}
