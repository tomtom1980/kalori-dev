/**
 * Task 5.3 Codex R1 C3 — `profiles.deleting_at` mutation fence helper.
 *
 * Returns a ready-to-send 423 Response when the calling user's
 * `profiles.deleting_at` is set; otherwise returns null and the caller
 * proceeds to its normal write path.
 *
 * Wired into every server route that performs a user-data mutation. See
 * migration `0016_profiles_deleting_at.sql` for the column + trigger +
 * authorised mutator (`set_account_deleting`).
 *
 * Codex Round 2 NEW-I1 — fail-closed semantics. Earlier the helper
 * silently returned null on read error (timeout, connection drop). For a
 * load-bearing deletion safety fence that is the wrong default: an
 * "unknown" read state must be treated as "potentially deleting →
 * reject." The helper now throws a typed `FenceReadError` on read
 * failure; mutation routes catch it and return HTTP 503
 * `{ error: 'deletion_state_unknown' }`. Sentry picks up the thrown
 * error so the failure is observable instead of silently bypassing the
 * fence.
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Thrown by `rejectIfDeleting` when the underlying `profiles.deleting_at`
 * read fails (DB error, network drop, exception). Routes should catch
 * this and respond with HTTP 503 `{ error: 'deletion_state_unknown' }`.
 */
export class FenceReadError extends Error {
  override readonly cause: string;
  constructor(message = 'fence_read_failed', cause = 'fence_read_failed') {
    super(message);
    this.name = 'FenceReadError';
    this.cause = cause;
  }
}

/**
 * Convenience wrapper for routes: invokes `rejectIfDeleting` and maps a
 * thrown `FenceReadError` to a HTTP 503 Response. Returns the 423
 * Response when the user is being deleted, the 503 Response when the
 * fence read errors, or null when it is safe to proceed.
 */
export async function rejectIfDeletingOrUnavailable(
  supabase: SupabaseClient,
  userId: string,
): Promise<Response | null> {
  try {
    return await rejectIfDeleting(supabase, userId);
  } catch (err) {
    if (err instanceof FenceReadError) {
      return NextResponse.json({ error: 'deletion_state_unknown' }, { status: 503 });
    }
    throw err;
  }
}

/**
 * Check whether the user-scoped client's calling user has been marked for
 * deletion. Returns a 423 NextResponse if so, null otherwise.
 *
 * Throws `FenceReadError` on DB read failure (Codex Round 2 NEW-I1
 * fail-closed). Routes that want a one-call fence path should use
 * `rejectIfDeletingOrUnavailable` which catches this and returns 503.
 *
 * @param supabase user-scoped SSR Supabase client (caller already
 *                 ran the auth guard and confirmed `userId` is the
 *                 authenticated user)
 * @param userId   the authenticated user id
 */
export async function rejectIfDeleting(
  supabase: SupabaseClient,
  userId: string,
): Promise<Response | null> {
  let data: unknown = null;
  try {
    const result = await supabase
      .from('profiles')
      .select('deleting_at')
      .eq('id', userId)
      .maybeSingle();
    if (result.error) {
      // Codex Round 2 NEW-I1 — fail closed. An unknown read state must
      // not be silently swallowed; the calling route should respond 503
      // so the failure is loud + observable in Sentry.
      throw new FenceReadError(
        'fence_read_failed',
        String(result.error.message ?? result.error ?? 'fence_read_failed'),
      );
    }
    data = result.data;
  } catch (err) {
    if (err instanceof FenceReadError) throw err;
    // Re-wrap any other thrown read error (e.g. network exception,
    // transport-level failure) as FenceReadError so the route can map
    // it uniformly to 503.
    throw new FenceReadError('fence_read_failed', err instanceof Error ? err.message : String(err));
  }
  const row = data as { deleting_at?: string | null } | null;
  if (row?.deleting_at) {
    return NextResponse.json({ error: 'account_deleting' }, { status: 423 });
  }
  return null;
}
