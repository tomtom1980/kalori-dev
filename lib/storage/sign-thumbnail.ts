/**
 * `lib/storage/sign-thumbnail.ts` — Codex Round 1 Critical #1 fix
 * (library overhaul 2026-05-16).
 *
 * Single-purpose helper for signing library thumbnail paths from the
 * `food-thumbnails` bucket. The library schema repurposes the
 * `thumbnail_url` column to store the **storage path**
 * (e.g. `{userId}/sketch_{client_id}.webp`); the read path signs
 * on-demand with a short TTL so URLs cannot expire while the row is
 * marked permanently generated.
 *
 * Architecture (per architecture.md §4.2):
 *   - `food-thumbnails` is a private bucket.
 *   - Reads request a signed URL with a 1-hour TTL via this helper.
 *   - The 1-hour TTL is intentionally shorter than the previous 7-day
 *     signed URLs Codex flagged — short enough that even cached
 *     responses don't outlive the URL.
 *
 * Back-compat: legacy rows from the pre-fix deployment may still carry
 * full `https://...` URLs as `thumbnail_url`. Pass those through
 * unchanged (the URL is what the renderer needs; re-signing a URL
 * literal is impossible and would 400 against Supabase). Once the
 * legacy rows expire (or are reset via the maintenance script), all
 * thumbnail_url values will be paths.
 *
 * Failure mode: when signing fails (object missing, transient Supabase
 * error), this helper returns `null`. Callers should treat `null` as
 * "no thumbnail" and fall back to the letter-mark renderer — that's
 * graceful degradation rather than rendering a broken image. The
 * caller never throws on a per-thumbnail signing failure.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const THUMBNAILS_BUCKET = 'food-thumbnails';
const SIGN_TTL_SECONDS = 60 * 60; // 1 hour — short enough to never outlive a render cycle.

/**
 * Detect whether a `thumbnail_url` column value is a storage path or a
 * legacy signed URL. URLs start with http(s); paths don't (they look
 * like `{uuid}/sketch_{client_id}.webp`).
 *
 * Exported so consumers can branch without re-implementing the heuristic.
 */
export function isStoragePath(value: string | null): boolean {
  if (!value) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  return true;
}

/**
 * Sign a thumbnail storage path with a 1-hour TTL. Returns `null` on
 * any failure (missing object, transient Supabase error, etc.) so
 * callers can fall back to the letter-mark renderer.
 *
 * If the input already looks like a full URL (legacy back-compat for
 * pre-fix rows), it is returned unchanged.
 *
 * Bugfix R1 C1 — when a legacy `http(s)://` URL flows in, emit a
 * `console.warn` so the regression has telemetry. Legitimate callers
 * never round-trip a signed URL through here (the read path stores
 * raw paths post-fix; legacy rows are the only valid case). If the
 * value originated as a sign-on-read result from `fetchLibraryPage`
 * and round-tripped through the merge dialog, the merge route's
 * upstream guard re-resolves it to the raw path BEFORE this helper
 * is ever called for a write — so a warn here is a strong signal.
 */
export async function signThumbnailUrl(
  pathOrUrl: string | null,
  supabase: Pick<SupabaseClient, 'storage'>,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (!isStoragePath(pathOrUrl)) {
    // Legacy URL — pass through (we cannot re-sign a literal URL).
    // Emit a warn signal so the persistence-hazard regression has
    // telemetry without breaking back-compat for legacy rows.
    console.warn(
      '[sign-thumbnail] received an already-signed URL (legacy back-compat passthrough). ' +
        'A signed URL should never reach a write path — verify upstream guards. ' +
        'Input prefix: ' +
        pathOrUrl.slice(0, 32),
    );
    return pathOrUrl;
  }
  try {
    const { data, error } = await supabase.storage
      .from(THUMBNAILS_BUCKET)
      .createSignedUrl(pathOrUrl, SIGN_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Default max concurrent signing calls. Chosen to balance throughput
 * vs. avoiding storage-API saturation when a large library renders.
 * Supabase signed URLs are JWT-only (no remote round-trip in steady
 * state), so 20 is generous; a much larger value made the previous
 * 500-fanout pathological under any storage latency.
 *
 * Bugfix R1 C2 — replaces the previous unbounded `Promise.all` fanout
 * in `fetchLibraryPage`.
 */
const DEFAULT_SIGN_CONCURRENCY = 20;

/**
 * Convenience helper to sign many thumbnail paths with bounded
 * concurrency.
 *
 * Used by the library list fetch path which receives a batch of rows
 * and needs to attach a signed URL to each before returning to the
 * client island. Per-row failure does not break the batch — failed
 * signs return `null` and that row falls back to the letter-mark
 * renderer.
 *
 * Bugfix R1 C2 — concurrency cap. Default in-flight ceiling is 20;
 * callers can override via the `concurrency` option. Output preserves
 * input ordering (index N in output corresponds to index N in input).
 */
export interface SignBatchOptions {
  concurrency?: number;
}

export async function signThumbnailUrlBatch(
  paths: ReadonlyArray<string | null>,
  supabase: Pick<SupabaseClient, 'storage'>,
  options: SignBatchOptions = {},
): Promise<Array<string | null>> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_SIGN_CONCURRENCY);
  const results: Array<string | null> = new Array(paths.length).fill(null);
  let cursor = 0;

  // Worker pulls the next index until exhausted. Up to `concurrency`
  // workers run in parallel; each worker is a tight async loop.
  // Per-item failure (signer throws) is caught here so the entire
  // batch survives — the failed slot stays null.
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= paths.length) return;
      const path = paths[index]!;
      try {
        results[index] = await signThumbnailUrl(path, supabase);
      } catch {
        results[index] = null;
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
