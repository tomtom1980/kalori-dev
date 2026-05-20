/**
 * Sketch pipeline — Bug 5 (library overhaul 2026-05-16) + Codex Round 1
 * Critical #1 (URL expiration) and Critical #2 (atomicity) fixes.
 *
 * Single-row orchestrator:
 *   1. Re-read the library row (auth check + idempotency checks).
 *   2. If `thumbnail_kind === 'sketch'` and `sketch_generated_at IS NOT NULL`,
 *      no-op (idempotent — second call after success returns without
 *      regenerating, without incrementing retry counters).
 *   3. If `thumbnail_kind === 'photo'`, no-op (photo wins).
 *   4. If `sketch_attempt_count >= MAX_RETRIES`, no-op (dead row — don't
 *      keep hitting Gemini for permanently failing items).
 *   5. **Atomic claim** — conditional UPDATE that increments
 *      `sketch_attempt_count` only when the row is still eligible
 *      (`sketch_generated_at IS NULL`, `thumbnail_kind IS NULL OR =
 *      'sketch'`, `sketch_attempt_count < 3`). The `.select()` makes
 *      PostgREST return the affected rows so we can detect "lost the
 *      race" outcomes — 0 rows means another concurrent invocation got
 *      the slot first. Loser returns `skipped='claim_lost'` without
 *      calling Gemini, without writing a failure (Codex Critical #2).
 *   6. Build the prompt; call Gemini Image.
 *   7. Re-encode the returned PNG to WEBP via sharp at <50 KB.
 *   8. Upload to `food-thumbnails/{userId}/sketch_{client_id}.webp`.
 *   9. **Final UPDATE** writes the storage PATH (not a signed URL) to
 *      `thumbnail_url`, plus `thumbnail_kind='sketch'` +
 *      `sketch_generated_at=now()`. URLs are signed on-read by
 *      `lib/storage/sign-thumbnail.ts` with a short TTL so they cannot
 *      expire while the row is marked permanently generated (Codex
 *      Critical #1).
 *  10. On any failure AFTER the claim succeeded, write
 *      `sketch_last_error` (attempt count was already incremented by
 *      the claim — do NOT double-bump).
 *
 * Server-only. No client surface.
 */
import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

import { logAICall } from '@/lib/ai/cost-log';
import { callGeminiImage } from '@/lib/ai/image-client';
import { getImageAnalysisQuota, IMAGE_ANALYSIS_LIMIT_MESSAGE } from '@/lib/ai/image-analysis-quota';
import { v1_sketchPrompt } from '@/lib/ai/sketch-prompt';
import { getServerSupabase } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

const MAX_RETRIES = 3;
/** Largest webp we'll let through. Matches the existing 50 KB I4 budget. */
const TARGET_WEBP_MAX_BYTES = 50 * 1024;
/**
 * SEC-M1 — defense-in-depth cap on the DECODED PNG bytes accepted from
 * Gemini. The primary cap now lives UPSTREAM in `lib/ai/image-client.ts`
 * (`MAX_RESPONSE_BYTES = 7 MB`), which rejects oversized responses
 * BEFORE the body is materialized in heap (Codex Round 1 Critical #2
 * fix). This 5 MB post-decode check stays as a defensive second wall in
 * case the upstream cap is ever bypassed (header drift, mock fakery,
 * etc.) — it's cheap because it runs after Buffer.from has already
 * allocated.
 *
 * 5 MB is 3-10× the realistic worst case (Nano Banana typically emits
 * 150-500 KB PNGs for line-art at 512×512). See
 * Planning/bugs/2026-05-16-library-overhaul/security-review.md §M1.
 */
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

export interface RunSketchPipelineArgs {
  readonly libraryItemId: string;
  readonly userId: string;
  /** Display name passed in for fresh inserts where the row isn't re-read. */
  readonly displayName?: string;
  /**
   * Free-text description (user input or AI reasoning). Forwarded to the
   * prompt builder so Gemini gets richer cues than the bare display name.
   * Capped to 500 chars inside `v1_sketchPrompt`.
   */
  readonly description?: string | undefined;
  readonly timezone?: string | undefined;
  /**
   * Optional pre-bound supabase client (for backfill which already has
   * a server-supabase from the route). Falls back to fresh one.
   */
  readonly supabase?: SupabaseClient<Database>;
}

export type SketchPipelineOutcome =
  | { status: 'generated'; thumbnailUrl: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string; code?: 'image_analysis_quota_exceeded' };

interface LibraryItemRow {
  readonly id: string;
  readonly user_id: string;
  readonly client_id: string;
  readonly display_name: string;
  readonly thumbnail_url: string | null;
  readonly thumbnail_kind: string | null;
  readonly sketch_generated_at: string | null;
  readonly sketch_attempt_count: number;
}

async function getRow(
  supabase: SupabaseClient<Database>,
  libraryItemId: string,
  userId: string,
): Promise<LibraryItemRow | null> {
  const { data, error } = (await supabase
    .from('food_library_items')
    .select(
      'id, user_id, client_id, display_name, thumbnail_url, thumbnail_kind, sketch_generated_at, sketch_attempt_count',
    )
    .eq('id', libraryItemId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()) as { data: LibraryItemRow | null; error: unknown };
  if (error) return null;
  return data;
}

/**
 * Atomic claim — Codex Round 1 Critical #2 + Codex Round 2 R2-C1 fix
 * (compare-and-set / CAS).
 *
 * Single conditional UPDATE that increments `sketch_attempt_count` ONLY
 * when the row's current state EXACTLY matches the value we read at
 * preflight. The `.select()` makes PostgREST return the affected rows;
 * an empty array means another invocation got the slot first (lost
 * the race).
 *
 * ## Why CAS, not `.lt(..., MAX_RETRIES)`
 *
 * Round-1 used `.lt('sketch_attempt_count', MAX_RETRIES)` in the WHERE
 * clause, intending Postgres row-level locking to serialize concurrent
 * UPDATEs. Codex Round 2 (R2-C1) correctly flagged this as a regression:
 * Postgres only guarantees row-level atomicity WITHIN a single UPDATE
 * statement. At READ COMMITTED isolation, two separate UPDATEs against
 * the same row both re-evaluate their WHERE clause against the
 * post-locking state. With `.lt(..., 3)`:
 *
 *   - Worker A: preflight reads 0. UPDATE matches (0 < 3). Writes 1.
 *     Returns 1 row. Calls Gemini.
 *   - Worker B: preflight reads 0. UPDATE matches (1 < 3 — still!).
 *     Writes 1 (same value). Returns 1 row. ALSO calls Gemini.
 *
 * Both workers think they own the slot. The cost cap is not enforced.
 *
 * ## CAS predicate (Round 3 fix)
 *
 * Pin the WHERE clause to the EXACT preflight value:
 * `.eq('sketch_attempt_count', currentAttempts)`. Now:
 *
 *   - Worker A: preflight reads 0. UPDATE `WHERE attempt_count = 0`
 *     matches. Writes 1. Returns 1 row. Calls Gemini.
 *   - Worker B: preflight reads 0. UPDATE `WHERE attempt_count = 0`
 *     no longer matches (row's current value is 1). Returns 0 rows.
 *     Reports `claim_lost`. Does NOT call Gemini.
 *
 * The loser's UPDATE silently affects 0 rows — exactly the single-winner
 * semantics we need. No advisory locks, no extra columns, no RPC.
 *
 * Eligibility conditions (all must match current row state):
 *   - id matches
 *   - user_id matches (defense-in-depth on top of RLS)
 *   - deleted_at IS NULL
 *   - sketch_generated_at IS NULL
 *   - thumbnail_kind IS NULL OR thumbnail_kind = 'sketch'
 *   - **sketch_attempt_count = currentAttempts** (CAS — Round 3 fix)
 *
 * Returns the new attempt count if claimed; null if lost the race.
 */
async function claimSlot(
  supabase: SupabaseClient<Database>,
  libraryItemId: string,
  userId: string,
  currentAttempts: number,
): Promise<number | null> {
  // Pre-flight cap check — caller already does this before calling
  // claimSlot, but defense-in-depth here too. CAS predicate makes the
  // bounded retry contract work even under contention.
  if (currentAttempts >= MAX_RETRIES) return null;

  const { data, error } = (await supabase
    .from('food_library_items')
    .update({
      sketch_attempt_count: currentAttempts + 1,
      sketch_last_error: null,
    })
    .eq('id', libraryItemId)
    .eq('user_id', userId)
    .eq('sketch_attempt_count', currentAttempts) // ← CAS predicate (R2-C1 fix)
    .is('deleted_at', null)
    .is('sketch_generated_at', null)
    .or('thumbnail_kind.is.null,thumbnail_kind.eq.sketch')
    .select('id, sketch_attempt_count')) as {
    data: Array<{ id: string; sketch_attempt_count: number }> | null;
    error: { message?: string } | null;
  };
  if (error) return null;
  if (!data || data.length === 0) return null;
  return data[0]!.sketch_attempt_count;
}

async function recordFailure(
  supabase: SupabaseClient<Database>,
  libraryItemId: string,
  userId: string,
  errorMessage: string,
): Promise<void> {
  // Attempt count was already incremented by the claim step — do NOT
  // bump again here, or the loop would double-count failures.
  await supabase
    .from('food_library_items')
    .update({
      sketch_last_error: errorMessage.slice(0, 500),
    })
    .eq('id', libraryItemId)
    .eq('user_id', userId);
}

function sketchInputHash(input: {
  userId: string;
  libraryItemId: string;
  rowClientId: string;
  attempt: number;
}): string {
  return createHash('sha256')
    .update(
      `image-analysis-sketch:${input.userId}:${input.libraryItemId}:${input.rowClientId}:${input.attempt}`,
    )
    .digest('hex');
}

/**
 * Run the sketch pipeline for a single library item.
 *
 * Returns a `SketchPipelineOutcome` so callers (backfill) can aggregate
 * counts. Single-row failures are caught + persisted; only catastrophic
 * environment failures (e.g. Supabase unreachable) throw.
 */
export async function runSketchPipeline(
  args: RunSketchPipelineArgs,
): Promise<SketchPipelineOutcome> {
  const supabase = args.supabase ?? (await getServerSupabase());

  // 1. Re-read row (preflight — cheaper than letting an obviously
  // ineligible row hit the conditional UPDATE).
  const row = await getRow(supabase, args.libraryItemId, args.userId);
  if (!row) {
    return { status: 'skipped', reason: 'row_missing' };
  }

  // 2. Idempotency — successful sketch already on the row.
  if (row.thumbnail_kind === 'sketch' && row.sketch_generated_at !== null) {
    return { status: 'skipped', reason: 'already_generated' };
  }

  // 3. Photo rule — a real photo already won; sketch never overwrites.
  if (row.thumbnail_kind === 'photo') {
    return { status: 'skipped', reason: 'photo_present' };
  }

  // 4. Retry cap (pre-claim short-circuit).
  if (row.sketch_attempt_count >= MAX_RETRIES) {
    return { status: 'skipped', reason: 'max_retries' };
  }

  const timezone = args.timezone ?? 'UTC';
  try {
    const quota = await getImageAnalysisQuota({ userId: args.userId, tz: timezone });
    if (quota.exceeded) {
      return {
        status: 'failed',
        code: 'image_analysis_quota_exceeded',
        error: IMAGE_ANALYSIS_LIMIT_MESSAGE,
      };
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'sketch-pipeline', scope: 'image_analysis_quota_check' },
      extra: {
        libraryItemId: args.libraryItemId,
        userId: args.userId,
      },
    });
    return { status: 'failed', error: 'quota_lookup_failed' };
  }

  // 5. Atomic claim. Concurrent invocations race here; the loser
  // returns `claim_lost` without calling Gemini.
  const claimedAttemptCount = await claimSlot(
    supabase,
    args.libraryItemId,
    args.userId,
    row.sketch_attempt_count,
  );
  if (claimedAttemptCount === null) {
    return { status: 'skipped', reason: 'claim_lost' };
  }

  const displayName = args.displayName ?? row.display_name;

  // Storage path. RLS policies key off the first path segment, so
  // user isolation is enforced by the bucket's existing policies.
  // The path goes into the DB column `thumbnail_url`; signing happens
  // at read time (lib/storage/sign-thumbnail.ts).
  const path = `${args.userId}/sketch_${row.client_id}.webp`;
  const inputHash = sketchInputHash({
    userId: args.userId,
    libraryItemId: args.libraryItemId,
    rowClientId: row.client_id,
    attempt: claimedAttemptCount,
  });
  let modelCallStarted = false;
  let modelCallLogged = false;
  const modelCallStart = Date.now();
  async function logSketchModelCall(): Promise<void> {
    if (modelCallLogged) return;
    modelCallLogged = true;
    await logAICall({
      userId: args.userId,
      callType: 'image-analysis-sketch',
      inputHash,
      tokens: 0,
      costEstimate: 0,
      latencyMs: Date.now() - modelCallStart,
      cachedFlag: false,
    });
  }

  try {
    // 6. Call Gemini.
    const payload = v1_sketchPrompt({ displayName, description: args.description });
    modelCallStarted = true;
    const image = await callGeminiImage({ payload });
    await logSketchModelCall();
    if (!image) {
      throw new Error('gemini_no_image');
    }

    // 7. Decode + re-encode to WEBP. Cap to <50 KB by stepping quality
    // down if the first pass overshoots (rare for line art, but
    // defensive).
    //
    // SEC-M1 — primary heap-amplification cap lives upstream in
    // `lib/ai/image-client.ts` (`MAX_RESPONSE_BYTES = 7 MB`,
    // Content-Length pre-check + streamed byte accumulator). By the
    // time we reach here, the response body is ALREADY known to be
    // ≤ 7 MB, which bounds `image.base64.length` to the same.
    //
    // The decoded-Buffer check below stays as defense-in-depth in case
    // the upstream cap is ever bypassed (header drift, mock fakery,
    // proxy that strips Content-Length, etc.). Cheap because Buffer.from
    // has already allocated by the time we test it.
    const pngBuf = Buffer.from(image.base64, 'base64');
    if (pngBuf.byteLength > MAX_INPUT_BYTES) {
      throw new Error(
        `gemini_oversize_response: ${pngBuf.byteLength} bytes exceeds ${MAX_INPUT_BYTES} limit`,
      );
    }
    // SEC-M1 — sharp's default `failOn` is `'warning'` (strictest); the
    // type alias in sharp 0.34.5 is `'none' | 'truncated' | 'error' |
    // 'warning'` (lenient → strict). Codex Round 1 C1 flagged the prior
    // explicit `'truncated'` setting as a regression — it's STRICTLY
    // LESS strict than the default and let malformed-but-not-truncated
    // PNGs slip past validation. We set `'warning'` explicitly so an
    // accidental future edit can't silently weaken it again.
    let webpBuf = await sharp(pngBuf, { failOn: 'warning' }).webp({ quality: 80 }).toBuffer();
    if (webpBuf.byteLength > TARGET_WEBP_MAX_BYTES) {
      webpBuf = await sharp(pngBuf, { failOn: 'warning' }).webp({ quality: 60 }).toBuffer();
    }
    if (webpBuf.byteLength > TARGET_WEBP_MAX_BYTES) {
      webpBuf = await sharp(pngBuf, { failOn: 'warning' })
        .resize({ width: 320 })
        .webp({ quality: 60 })
        .toBuffer();
    }

    // 8. Upload.
    const uploadRes = await supabase.storage.from('food-thumbnails').upload(path, webpBuf, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '604800',
    });
    if (uploadRes.error) {
      throw new Error(`upload_failed: ${uploadRes.error.message}`);
    }

    // 9. Final UPDATE — store the PATH (Codex Critical #1). Read paths
    // sign on demand with a 1-hour TTL via
    // `lib/storage/sign-thumbnail.ts`.
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('food_library_items')
      .update({
        thumbnail_url: path,
        thumbnail_kind: 'sketch',
        sketch_generated_at: nowIso,
        sketch_last_error: null,
      })
      .eq('id', args.libraryItemId)
      .eq('user_id', args.userId);
    if (updateError) {
      throw new Error(`db_update_failed: ${updateError.message}`);
    }

    return { status: 'generated', thumbnailUrl: path };
  } catch (err) {
    if (modelCallStarted && !modelCallLogged) {
      await logSketchModelCall();
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { component: 'sketch-pipeline' },
      extra: {
        libraryItemId: args.libraryItemId,
        userId: args.userId,
        attempt: claimedAttemptCount,
      },
    });
    await recordFailure(supabase, args.libraryItemId, args.userId, errorMessage);
    return { status: 'failed', error: errorMessage };
  }
}
