/**
 * `POST /api/library/merge` — Task 4.1 sub-step 2.
 *
 * Atomically merges two user-owned library items: repoints `food_entries`
 * from loser → winner, updates winner with picked fields + summed log_count +
 * max last_used_at, hard-deletes loser. Wraps all DB work in the PL/pgSQL
 * function `library_merge_atomic` (migration 0008) which uses
 * `pg_advisory_xact_lock(client_id)` for concurrent-merge serialization.
 *
 * Contract (reconciled spec §9.3):
 *   Request:  {
 *     client_id: string (UUID),
 *     winnerId: string (UUID),
 *     loserId:  string (UUID),
 *     fields: {
 *       display_name?: string,
 *       thumbnail_url?: string | null,
 *       default_portion?: number,
 *       default_unit?: string,
 *       nutrition: {
 *         kcal: number,
 *         macros: { protein_g, carbs_g, fat_g, fiber_g? },
 *         micros?: Record<string, number>,
 *       },
 *     },
 *   }
 *   Response: { winner: FoodLibraryItem, replayed?: boolean }
 *     - replayed=true when the loser row was already gone (prior merge with
 *       same client_id ran, OR concurrent second invocation won the lock race).
 *     - winner row reflects the merged state from the RPC's RETURNING block.
 *
 * Error mapping:
 *   - RPC raises 'winner_not_found' (P0001) → 409 Conflict.
 *   - Other RPC errors → 500.
 *
 * R1 note: client caller MUST route through `authPost` from
 * `lib/auth/refresh-interceptor.ts`.
 *
 * Cache invalidation: `revalidateTag(TAGS.userLibrary(uid))` always +
 * `revalidateTag(TAGS.userEntries(uid, day))` for each distinct user-TZ day
 * among entries that were FK-repointed (pre-fetched before RPC to know which
 * days to invalidate). No revalidation on replay since no state changed.
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';

export const runtime = 'nodejs';

const NutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  macros: z.object({
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative().optional(),
  }),
  micros: z.record(z.string(), z.number()).optional(),
});

const FieldsSchema = z
  .object({
    display_name: z.string().min(1).max(200).optional(),
    thumbnail_url: z.string().nullable().optional(),
    default_portion: z.number().positive().optional(),
    default_unit: z.string().max(32).optional(),
    nutrition: NutritionSchema,
  })
  .strict();

const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    winnerId: z.string().uuid(),
    loserId: z.string().uuid(),
    fields: FieldsSchema,
  })
  .strict()
  // CF-1 (Codex adversarial round 1): self-merge guard. Without this the
  // RPC would load the same row into both v_winner_row + v_loser_row,
  // update the winner with a doubled log_count, then DELETE it — silent
  // data loss. The `path: ['loserId']` puts the Zod issue on the loser
  // field so the client can point to the right cell in a future UI.
  // Belt-and-suspenders — migration 0009 adds a defensive P0002 guard
  // inside the RPC itself for direct-RPC callers.
  .refine((data) => data.winnerId !== data.loserId, {
    message: 'winnerId and loserId must differ',
    path: ['loserId'],
  });

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    const raw = (await request.json()) as unknown;
    parsed = BodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    // CF-1: map the self-merge refine to a dedicated `same_ids` error
    // code so the client + tests have a stable discriminator without
    // walking Zod's `issues` tree.
    const sameIds = parsed.error.issues.some(
      (issue) =>
        issue.code === 'custom' &&
        Array.isArray(issue.path) &&
        issue.path.includes('loserId') &&
        /differ/i.test(issue.message),
    );
    if (sameIds) {
      return NextResponse.json(
        { error: 'same_ids', message: 'winnerId and loserId must differ' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Task A.3 — orphan-profile fence (US-STAB-A3) runs before any aggregate
  // read. Returns JSON 401 `{error:'profile_lookup_failed'}` for orphan
  // accounts (auth user exists but profiles row missing). Internally
  // performs auth.getUser() + single-pass profiles SELECT.
  const fenced = await requireProfileOrJson401({ route: '/api/library/merge' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;

  // Pre-fetch affected days for cache invalidation. We need the user's
  // timezone + the `logged_at` of each entry that currently points to the
  // loser, BEFORE the RPC repoints them. `distinct-day` resolution happens
  // at the app layer because Postgres doesn't expose a cheap
  // "distinct-userTz-day" aggregate across a timezone that only lives in
  // profiles.timezone.
  //
  // Task 4.5 R1 Pass 1 S2: previously this entire block silently swallowed
  // errors via a top-level try/catch — cache correctness could be lost
  // without any signal. Now we (a) capture to Sentry, (b) record a warning
  // string for the response envelope so the caller can detect partial
  // invalidation, and (c) continue the merge (cache-tag emit is best-
  // effort — entry write is authoritative).
  const cacheInvalidationWarnings: string[] = [];
  let affectedDays: string[] = [];
  try {
    const { data: profile } = (await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single()) as { data: { timezone?: string } | null };
    const tz = profile?.timezone ?? 'UTC';

    const { data: entries } = (await supabase
      .from('food_entries')
      .select('logged_at')
      .eq('user_id', userId)
      .eq('library_item_id', body.loserId)) as {
      data: Array<{ logged_at: string }> | null;
    };
    const daySet = new Set<string>();
    for (const row of entries ?? []) {
      if (typeof row.logged_at === 'string') {
        daySet.add(userTzDayFrom(row.logged_at, tz));
      }
    }
    affectedDays = Array.from(daySet);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'library-merge-cache-invalidation', scope: 'affected-days-prefetch' },
      extra: { userId, loserId: body.loserId },
    });
    cacheInvalidationWarnings.push('affected-days-prefetch-failed');
  }

  // Invoke the atomic merge RPC (migration 0008).
  const { data: rpcData, error: rpcError } = (await supabase.rpc('library_merge_atomic', {
    p_winner_id: body.winnerId,
    p_loser_id: body.loserId,
    p_client_id: body.client_id,
    p_fields: body.fields,
  })) as {
    data: { winner: unknown; replayed: boolean } | null;
    error: { code?: string; message?: string } | null;
  };

  if (rpcError) {
    // P0001 is how the RPC signals 'winner_not_found' (RAISE EXCEPTION).
    // Supabase surfaces this via the `code` field; the human-readable
    // `message` also contains 'winner_not_found' as a substring-safe check.
    const msg = rpcError.message ?? '';
    // CF-1: P0002 is the defensive self-merge guard inside
    // `library_merge_atomic` (migration 0009). Zod catches this ahead of
    // the RPC for normal HTTP callers, but a direct `supabase.rpc(...)`
    // caller bypasses Zod and the RPC guard is the last defense.
    if (rpcError.code === 'P0002' || msg.includes('winner_equals_loser')) {
      return NextResponse.json(
        { error: 'same_ids', message: 'winnerId and loserId must differ' },
        { status: 400 },
      );
    }
    if (rpcError.code === 'P0001' || msg.includes('winner_not_found')) {
      return NextResponse.json({ error: 'winner_not_found' }, { status: 409 });
    }
    // Task 4.5 R1 Pass 1 C1: migration 0010 raises P0003 when either the
    // winner OR loser row is found but tombstoned (deleted_at IS NOT NULL).
    // Surface as 409 so the client can refresh the library view + retry.
    if (rpcError.code === 'P0003' || msg.includes('merge_target_tombstoned')) {
      return NextResponse.json({ error: 'merge_target_tombstoned' }, { status: 409 });
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!rpcData) {
    return NextResponse.json({ error: 'empty_rpc_result' }, { status: 500 });
  }

  // Cache-tag invalidation — always bump library, bump affected entry days.
  // Task 4.5 R1 Pass 1 S2: surface invalidation failures via Sentry + a
  // best-effort response envelope warning. Previously a silent try/catch
  // (or an uncaught throw on a per-tag call) could mask cache staleness.
  // (`cacheInvalidationWarnings` is shared with the pre-fetch try/catch
  // above so the response envelope reflects every silently-swallowed
  // failure across BOTH stages.)
  const safeRevalidate = (tag: string, scope: string) => {
    try {
      revalidateTag(tag, 'max');
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'library-merge-cache-invalidation', scope },
        extra: { tag, userId },
      });
      cacheInvalidationWarnings.push(`${scope}:${tag}`);
    }
  };

  safeRevalidate(TAGS.userLibrary(userId), 'library');
  for (const day of affectedDays) {
    safeRevalidate(TAGS.userEntries(userId, day), 'entries');
  }
  // Task 4.5 R1 Pass 1 S1: invalidate ALL canonical progress ranges
  // (24h/D/7d/30d/90d/1y) via shared helper. Previously only 3 emitted —
  // D / 90d / 1y were stale until next natural revalidation.
  try {
    revalidateAllProgressRanges(userId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'library-merge-cache-invalidation', scope: 'progress' },
      extra: { userId },
    });
    cacheInvalidationWarnings.push('progress:revalidateAllProgressRanges');
  }

  return NextResponse.json(
    {
      winner: rpcData.winner,
      replayed: rpcData.replayed,
      ...(cacheInvalidationWarnings.length > 0
        ? { cache_invalidation_warnings: cacheInvalidationWarnings }
        : {}),
    },
    { status: 200 },
  );
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
