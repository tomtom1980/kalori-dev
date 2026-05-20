/**
 * `DELETE /api/entries/[id]` — Task 3.4, food entry removal (for undo flow).
 *
 * Contract (synthesis §5.2):
 *   - Path `id` validated as UUID.
 *   - Auth guard; RLS scopes per-user.
 *   - Pre-delete SELECT resolves the user-TZ day for the entry's `logged_at`
 *     so `revalidateTag(TAGS.userEntries(uid, day))` invalidates the right
 *     bucket (F6 — entry restored into ORIGINAL day's bucket).
 *   - 404 when RLS hides the row.
 *   - Body: none. Response: `{ ok, deletedRowId, dayDeleted }` on success.
 */
import * as Sentry from '@sentry/nextjs';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

const IdSchema = z.string().uuid();
const ParsedItemSchema = z.object({
  name: z.string().min(1).max(200),
  portion: z.number().positive(),
  unit: z.string().max(32),
  kcal: z.number().nonnegative(),
  macros: z
    .object({
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
      fiber_g: z.number().nonnegative(),
    })
    .optional(),
  micros: z.record(z.string(), z.number()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
const PatchBodySchema = z
  .object({
    client_id: z.string().uuid().optional(),
    logged_at: z.string().datetime().optional(),
    meal_category: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']),
    source: z.enum(['text', 'photo', 'library', 'manual']).optional(),
    library_item_id: z.string().uuid().nullable().optional(),
    items: z.array(ParsedItemSchema).min(1).max(20),
    ai_reasoning: z.string().max(500).nullable().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const idCheck = IdSchema.safeParse(rawId);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'ValidationError' }, { status: 400 });
  }
  const id = idCheck.data;

  let parsed;
  try {
    const raw = (await request.json()) as unknown;
    parsed = PatchBodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const fenced = await requireProfileOrJson401({ route: '/api/entries/[id]' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { data: row } = (await supabase
    .from('food_entries')
    .select('id, logged_at')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()) as { data: { id: string; logged_at: string } | null };

  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Codex C.CODEX Finding (HIGH) — normalize `profiles.timezone` via the
  // shared helper so a malformed legacy value falls back to UTC instead of
  // throwing uncontrolled from `Intl.DateTimeFormat`. Parity with log-now.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: unknown } | null };
  const tz = normalizeProfileTimezone(profile?.timezone, {
    sentryTag: 'entries-patch',
    userId,
  });
  const dayUpdated = userTzDayFrom(row.logged_at, tz);
  const body = parsed.data;

  if (body.library_item_id) {
    const { data: ownedItem } = (await supabase
      .from('food_library_items')
      .select('id')
      .eq('id', body.library_item_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()) as { data: { id: string } | null };
    if (!ownedItem) {
      return NextResponse.json({ error: 'library_item_not_found' }, { status: 404 });
    }
  }

  const { data: updated, error: updateError } = (await supabase
    .from('food_entries')
    .update({
      meal_category: body.meal_category,
      items: body.items,
      ai_reasoning: body.ai_reasoning ?? null,
      ...(body.library_item_id !== undefined ? { library_item_id: body.library_item_id } : {}),
    })
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single()) as {
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string } | null;
  };

  if (updateError || !updated) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  revalidateTag(TAGS.userEntries(userId, dayUpdated), 'max');
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ entry: updated, dayUpdated }, { status: 200 });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const idCheck = IdSchema.safeParse(rawId);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'ValidationError' }, { status: 400 });
  }
  const id = idCheck.data;

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/entries/[id]' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  // Pre-delete SELECT to learn the row's day for cache-tag invalidation.
  // Task C.4 — also capture `library_item_id` so the F11 undo path can
  // reverse the re-log bump (F-VERIFY-201). Hard-delete on food_entries
  // (no `deleted_at` column) — confirmed via architecture.md §2.4.
  const { data: row } = (await supabase
    .from('food_entries')
    .select('id, logged_at, library_item_id')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()) as {
    data: { id: string; logged_at: string; library_item_id: string | null } | null;
  };

  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Resolve user-TZ day via profiles.timezone.
  //
  // Codex C.CODEX Finding (HIGH) — normalize via the shared helper so a
  // malformed legacy timezone falls back to UTC instead of throwing
  // uncontrolled from `Intl.DateTimeFormat`. Parity with log-now / save / patch.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: unknown } | null };
  const tz = normalizeProfileTimezone(profile?.timezone, {
    sentryTag: 'entries-delete',
    userId,
  });
  const dayDeleted = userTzDayFrom(row.logged_at, tz);

  const { error: deleteError } = await supabase
    .from('food_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Task C.4 — reverse the library bump symmetrically on undo so
  // `food_library_items.log_count` and `last_used_at` never drift away
  // from the true entry count (F-VERIFY-201). Soft-fail policy: entry
  // DELETE is authoritative (F11 undo target); any failure here is
  // logged to Sentry but does NOT 5xx the response. Tombstone-tolerant
  // via `.is('deleted_at', null)` on the WHERE predicate.
  //
  // Codex Round 1 fix (High #1 + #2 + Medium): the previous SELECT-then-
  // decrement pattern over-decremented when the save path's bump had
  // soft-failed or when sibling write paths (PATCH, copy-yesterday) had
  // set `library_item_id` without bumping. It also wrote `last_used_at: null`
  // on a failed MAX read, conflating "no remaining entries" with "read
  // failure". Both errors are durable because `log_count` drives the
  // Library merge-winner selection.
  //
  // Fix: **derive log_count from COUNT(*) AFTER the DELETE commits**, and
  // ONLY write `last_used_at` from a successful MAX read (or set NULL
  // legitimately when COUNT = 0). The post-DELETE COUNT is idempotent and
  // self-correcting for orphan-bump paths.
  if (row.library_item_id) {
    const libraryItemId = row.library_item_id;
    try {
      // Step 1: COUNT remaining entries linked to this library item.
      // `food_entries` is hard-deleted (architecture.md §2.3), so no
      // `deleted_at` filter on the entry table is needed.
      const { count: trueCount, error: countError } = (await supabase
        .from('food_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('library_item_id', libraryItemId)) as {
        count: number | null;
        error: { code?: string; message?: string } | null;
      };
      if (countError) {
        // Codex Round 1 High #2: never write a derived value from a failed
        // read. Capture telemetry and skip the reverse UPDATE entirely.
        Sentry.captureException(countError, {
          tags: {
            component: 'entries-delete',
            scope: 'library_log_count_reverse_count',
            pg_code: countError.code,
          },
          extra: { userId, libraryItemId },
        });
      } else {
        const nextLogCount = Math.max(0, trueCount ?? 0);

        // Step 2: if any entries remain, MAX(logged_at) for the
        // `last_used_at` recompute. Skip entirely when count = 0 (NULL is
        // legitimate — `lib/library/fetch.ts:77` orders `NULLS LAST` so the
        // row correctly sinks). Codex Round 1 High #2: check the SELECT
        // error and skip the reverse UPDATE on read failure.
        let nextLastUsedAt: string | null = null;
        let skipUpdate = false;
        if (nextLogCount > 0) {
          const { data: latestRemaining, error: maxError } = (await supabase
            .from('food_entries')
            .select('logged_at')
            .eq('user_id', userId)
            .eq('library_item_id', libraryItemId)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle()) as {
            data: { logged_at: string } | null;
            error: { code?: string; message?: string } | null;
          };
          if (maxError) {
            Sentry.captureException(maxError, {
              tags: {
                component: 'entries-delete',
                scope: 'library_log_count_reverse_max',
                pg_code: maxError.code,
              },
              extra: { userId, libraryItemId },
            });
            skipUpdate = true;
          } else {
            nextLastUsedAt = latestRemaining?.logged_at ?? null;
          }
        }

        if (!skipUpdate) {
          // Step 3: UPDATE log_count + last_used_at. The
          // `.is('deleted_at', null)` predicate makes this a silent no-op
          // for tombstoned rows (AC3). RLS scopes by `user_id`. No SELECT
          // on `food_library_items` is needed — derive-from-count makes
          // the UPDATE idempotent and concurrency-tolerant (concurrent
          // writers each COUNT after their own write; last writer wins
          // with the truthful sum).
          const { error: reverseError } = (await supabase
            .from('food_library_items')
            .update({
              log_count: nextLogCount,
              last_used_at: nextLastUsedAt,
            })
            .eq('id', libraryItemId)
            .eq('user_id', userId)
            .is('deleted_at', null)) as { error: { code?: string; message?: string } | null };
          if (reverseError) {
            Sentry.captureException(reverseError, {
              tags: {
                component: 'entries-delete',
                scope: 'library_log_count_reverse',
                pg_code: reverseError.code,
              },
              extra: { userId, libraryItemId },
            });
          } else {
            // Cache invalidation so the reordered library tab lands on next
            // render. Mirrors the save-path bump (Task C.4 / Task A.1 REV 2).
            // Silent no-ops on tombstoned rows are harmless here — nothing
            // visible changed.
            revalidateTag(TAGS.userLibrary(userId), 'max');
            revalidatePath('/library', 'page');
          }
        }
      }
    } catch (reverseThrown) {
      Sentry.captureException(reverseThrown, {
        tags: { component: 'entries-delete', scope: 'library_log_count_reverse' },
        extra: { userId, libraryItemId },
      });
    }
  }

  revalidateTag(TAGS.userEntries(userId, dayDeleted), 'max');
  // Task 4.5 R2 S3: invalidate ALL 6 canonical progress range tags via the
  // shared helper. Pre-fix only 3 (24h/7d/30d) emitted, leaving D/90d/1y stale.
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ ok: true, deletedRowId: id, dayDeleted }, { status: 200 });
}
