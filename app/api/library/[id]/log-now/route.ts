/**
 * `POST /api/library/[id]/log-now` — Task C.2 (US-STAB-C2) AC4.
 *
 * Atomically snapshots a `food_library_items` row at click-time and
 * inserts a corresponding `food_entries` row, so re-logging a library
 * item ships the CURRENT macros + micros — NEVER stale client-cached
 * data (design-doc §10 Concern P-1 mitigation contract).
 *
 * ## Snapshot freshness contract (P-1)
 *
 * The route MUST read `food_library_items` via a fresh SELECT keyed on
 * `(id = :id AND user_id = :userId AND deleted_at IS NULL)` and embed
 * THAT row's `display_name + nutrition` into the inserted `food_entries.
 * items[0]` payload. The client is NEVER trusted to ship the snapshot —
 * stale list-view data would otherwise log outdated macros (e.g. user
 * edited macros in another tab but the open library page still shows the
 * old card). The server-side fresh read closes the TOCTOU window.
 *
 * ## Contract
 *
 *   Request:  { client_id: string (UUID), logged_at?: ISO, meal_category? }
 *   Response 200 fresh:    { entry }                  (newly inserted row)
 *   Response 200 replayed: { entry, replayed: true }  (I11 retry)
 *   Response 400:          invalid body / bad UUID id / future logged_at
 *   Response 401:          no session
 *   Response 404:          library item not found / tombstoned / not owned
 *   Response 423:          deletion fence (account being deleted)
 *   Response 500:          snapshot read failed (Sentry-captured)
 *
 * ## I11 idempotency
 *
 *   - `client_id` is the idempotency anchor (per architecture §3.4 + Task
 *     5.1.2 convention — body, NOT header).
 *   - Pre-insert SELECT-by-`(user_id, client_id)` returns existing row +
 *     `replayed: true` on 200 if present.
 *
 * ## R1 firewall
 *
 *   - Clients MUST call via `authPost<T>` from
 *     `lib/auth/refresh-interceptor.ts`.
 *   - Server-side returns 401 → interceptor refreshes session + retries.
 *
 * ## Cache invalidation
 *
 *   - `TAGS.userLibrary(uid)` AND `TAGS.userEntries(uid, day)` (user-TZ
 *     day) — both fire BEFORE the 200 response so `router.refresh()` on
 *     the client races AFTER the cache is busted.
 *
 * ## Counter bump (F-C4 contract)
 *
 *   - Library `log_count` derived from `COUNT(food_entries)` AFTER the
 *     entry INSERT commits (concurrency-tolerant; matches the pattern in
 *     `/api/entries/save`). `last_used_at` stamped to `now()`. Bump
 *     failure is swallowed + Sentry-captured (library = enrichment).
 */
import * as Sentry from '@sentry/nextjs';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { findDuplicateFoodLog } from '@/lib/entries/duplicate-log';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    logged_at: z.string().datetime().optional(),
    meal_category: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']).optional(),
    allow_duplicate: z.boolean().optional(),
  })
  .strict();

/**
 * Heuristic time-slot mapping (local user time) → meal_category. Matches
 * the L4 confirmation default convention so log-now and the standard log
 * flow produce the same default on first click.
 *
 * Codex R1 Finding 2 (HIGH) fix — `getUTCHours()` ignored the profile
 * timezone and corrupted meal slots for non-UTC users (Bangkok 08:00
 * → 01:00 UTC → "snack" instead of "breakfast"). The route already
 * fetches `profile.timezone` for day-bucketing; this helper now reuses
 * it via `Intl.DateTimeFormat` to extract the local hour in IANA tz.
 *
 * `timezone` defaults to `'UTC'` for backward compatibility (existing
 * unit-test fixtures and tests asserting on `inferMealCategory(iso)`
 * still work without breaking changes).
 */
function inferMealCategory(
  loggedAtIso: string,
  timezone: string = 'UTC',
): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  let h: number;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(loggedAtIso));
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    // `hour12: false` with `en-US` returns 0-23. Defensive: an unknown IANA
    // zone (Intl throws RangeError) falls through to the catch below.
    const parsed = parseInt(hourStr, 10);
    h = Number.isFinite(parsed)
      ? parsed === 24
        ? 0
        : parsed
      : new Date(loggedAtIso).getUTCHours();
  } catch {
    // Unknown IANA zone — fall back to UTC. Profile timezone is validated
    // upstream during onboarding, so this branch is defense-in-depth.
    h = new Date(loggedAtIso).getUTCHours();
  }
  if (h >= 4 && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

interface LibrarySnapshotRow {
  id: string;
  display_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: {
    kcal: number;
    macros?: Record<string, number>;
    micros?: Record<string, number>;
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Defense-in-depth: validate the route segment is a UUID. The Next.js
  // router has already matched the path, but the segment itself is
  // user-controlled and could trip the query layer (500) without this.
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let parsed;
  try {
    const raw = (await request.json()) as unknown;
    parsed = BodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Task A.3 — orphan-profile fence before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/library/[id]/log-now' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence.
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;
  const loggedAtIso = body.logged_at ?? new Date().toISOString();

  // F-UI-3.6-B-3 (I10) parity — reject future timestamps with the same 30s
  // skew tolerance used by `/api/entries/save`. Prevents corrupted day
  // buckets in dashboard aggregates.
  const loggedAtMs = Date.parse(loggedAtIso);
  const FUTURE_SKEW_MS = 30_000;
  if (Number.isFinite(loggedAtMs) && loggedAtMs > Date.now() + FUTURE_SKEW_MS) {
    return NextResponse.json({ error: 'logged_at_future' }, { status: 400 });
  }

  // Profile timezone lookup for user-TZ day bucketing (I12 + F6 hazard).
  //
  // Codex R2 Finding 2 (MEDIUM) fix — `profiles.timezone` is `unknown` at
  // the query layer (JSON column / legacy text). Malformed legacy strings
  // (e.g. abandoned onboarding rows from older code) would crash both
  // `userTzDayFrom` (Intl.DateTimeFormat with unknown IANA → RangeError)
  // and route into a 500 BEFORE the entry insert. Normalize at the boundary;
  // invalid values fall back to UTC and are Sentry-captured for operator
  // visibility (matches the post-insert recheck error-handling philosophy:
  // observability > silent degradation).
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: unknown } | null };
  const tz = normalizeProfileTimezone(profile?.timezone, {
    sentryTag: 'log-now',
    userId,
  });

  // I11 idempotency — pre-insert SELECT by (user_id, client_id). Matches
  // the pattern in `/api/entries/save`. NOTE: the ownership probe runs
  // AFTER this to keep the I11 contract identical to the save route —
  // a retry with the same client_id is honoured regardless of whether
  // the library item is still active (the original entry persists with
  // ON DELETE SET NULL semantics on `library_item_id`).
  const { data: existing } = (await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', body.client_id)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  if (existing) {
    // Replay path — fire cache invalidation (cheap, idempotent) and return
    // the persisted row.
    const existingLoggedAt =
      typeof existing.logged_at === 'string' ? existing.logged_at : loggedAtIso;
    const replayDay = userTzDayFrom(existingLoggedAt, tz);
    revalidateTag(TAGS.userEntries(userId, replayDay), 'max');
    revalidateTag(TAGS.userLibrary(userId), 'max');
    revalidateAllProgressRanges(userId);
    return NextResponse.json({ entry: existing, replayed: true }, { status: 200 });
  }

  // Task C.CODEX Fix 1 — 30-day backfill window (mirror of /api/entries/save
  // guard, PRD §3.5 + §6 + F-VERIFY-203). Without this, an authenticated
  // crafted request can ship an arbitrarily old `logged_at` via the optional
  // body field and persist food_entries rows outside the allowed backfill
  // window, corrupting historical aggregates/counters.
  //
  // Placement: AFTER the I11 SELECT/replay above (line ~213). Rationale
  // matches /api/entries/save R2 Finding #1 — a retry under the same
  // client_id for an entry already persisted >30d+grace ago must return
  // 200/replayed (idempotency contract), NOT 400. The guard applies only to
  // FRESH inserts — replays are honoured regardless of the persisted row's
  // age. Future-skew guard above keeps its eager position.
  //
  // The 4-minute grace mirrors the save-route grace (Codex R2 Finding #2 on
  // C.5): minute-trunc (~59s) + modal-open drift (~90s) + network latency.
  // The grace is intentionally narrow so the 30-day contract is not silently
  // extended by hours.
  const BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const BACKFILL_GRACE_MS = 4 * 60 * 1000;
  if (
    Number.isFinite(loggedAtMs) &&
    loggedAtMs < Date.now() - BACKFILL_WINDOW_MS - BACKFILL_GRACE_MS
  ) {
    return NextResponse.json({ error: 'logged_at_too_old' }, { status: 400 });
  }

  // ====================================================================
  // P-1 mitigation: atomic snapshot read at click-time.
  // ====================================================================
  //
  // Read the library row directly from `food_library_items` keyed on
  // (id, user_id, deleted_at IS NULL). This is the snapshot source — the
  // client is NEVER trusted to ship `food_name`/`kcal`/macros/micros. A
  // stale list-view item would otherwise log outdated macros if the user
  // edited the row in another tab and the open library page still shows
  // the old card.
  //
  // The triple filter is load-bearing:
  //   - `.eq('id', id)`           — the requested item
  //   - `.eq('user_id', userId)`  — RLS defense-in-depth (RLS already
  //                                 scopes, but a missing filter would
  //                                 leak the lookup surface)
  //   - `.is('deleted_at', null)` — tombstoned items cannot be logged
  //                                 (matches the /update + /delete routes)
  //
  // On error (transient DB blip): Sentry-capture BEFORE returning 500
  // (project lesson #9 — never silently swallow).
  const { data: liveItem, error: libErr } = (await supabase
    .from('food_library_items')
    .select('id, display_name, default_portion, default_unit, nutrition')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()) as {
    data: LibrarySnapshotRow | null;
    error: { code?: string; message?: string } | null;
  };

  if (libErr) {
    Sentry.captureException(libErr, {
      tags: {
        component: 'library-log-now',
        scope: 'snapshot_read',
        pg_code: libErr.code,
      },
      extra: { userId, libraryItemId: id },
    });
    return NextResponse.json({ error: 'snapshot_read_failed' }, { status: 500 });
  }

  if (!liveItem) {
    // Either row doesn't exist, is tombstoned, or owned by another user
    // (RLS) — surface uniformly as 404 to avoid leaking existence.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Build the food_entries.items[0] snapshot from the fresh DB row.
  // Mirrors the shape `/api/entries/save` accepts via its ParsedItemSchema
  // (name + portion + unit + kcal + macros + micros).
  const macros = liveItem.nutrition?.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };
  const micros = liveItem.nutrition?.micros ?? {};
  const snapshot = {
    name: liveItem.display_name,
    portion: liveItem.default_portion ?? 1,
    unit: liveItem.default_unit ?? 'serving',
    kcal: liveItem.nutrition?.kcal ?? 0,
    macros,
    micros,
  };

  // Codex R1 Finding 2 fix — pass `profile.timezone` so the meal slot is
  // derived in user-local time, not UTC. Falls back to 'UTC' if profile
  // lookup returned null.
  const mealCategory = body.meal_category ?? inferMealCategory(loggedAtIso, tz);
  const day = userTzDayFrom(loggedAtIso, tz);

  if (!body.allow_duplicate) {
    const duplicate = await findDuplicateFoodLog({
      supabase,
      userId,
      loggedAtIso,
      timezone: tz,
      mealCategory,
      libraryItemId: id,
      itemNames: [snapshot.name],
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'duplicate_food_entry', existing_entry_id: duplicate.id },
        { status: 409 },
      );
    }
  }

  const insertPayload = {
    user_id: userId,
    client_id: body.client_id,
    logged_at: loggedAtIso,
    meal_category: mealCategory,
    source: 'library' as const,
    library_item_id: id,
    items: [snapshot],
    ai_reasoning: null,
  };

  const { data: inserted, error: insertErr } = (await supabase
    .from('food_entries')
    .insert(insertPayload)
    .select()
    .single()) as {
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string } | null;
  };

  if (insertErr) {
    // 23505 concurrent-race replay — re-SELECT the committed row.
    if (insertErr.code === '23505') {
      const { data: raceRow } = (await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('client_id', body.client_id)
        .maybeSingle()) as { data: Record<string, unknown> | null };
      if (raceRow) {
        const raceLoggedAt =
          typeof raceRow.logged_at === 'string' ? raceRow.logged_at : loggedAtIso;
        const raceDay = userTzDayFrom(raceLoggedAt, tz);
        revalidateTag(TAGS.userEntries(userId, raceDay), 'max');
        revalidateTag(TAGS.userLibrary(userId), 'max');
        revalidateAllProgressRanges(userId);
        return NextResponse.json({ entry: raceRow, replayed: true }, { status: 200 });
      }
    }
    Sentry.captureException(insertErr, {
      tags: {
        component: 'library-log-now',
        scope: 'entry_insert',
        pg_code: insertErr.code,
      },
      extra: { userId, libraryItemId: id, clientId: body.client_id },
    });
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // ====================================================================
  // Codex R1 Finding 1 (HIGH) — TOCTOU compensating recheck.
  // ====================================================================
  //
  // Closes the time-of-check-to-time-of-use window between the snapshot
  // SELECT at line ~207 and the INSERT above. A sibling tab can soft-delete
  // the library row via `/api/library/[id]/delete` in the gap; the FK
  // SET NULL trigger does NOT fire for soft-deletes (tombstones), so the
  // entry would persist with `library_item_id` pointing at a deleted row
  // (orphan against list views that filter `deleted_at IS NULL`).
  //
  // Mirrors the `/api/entries/save` defense (route.ts:260-335).
  //
  // Mechanism — re-verify the library row is still active POST-insert. If
  // a tombstone landed in the window, issue a compensating DELETE on the
  // just-inserted entry (brand-new row, owned by caller — RLS allows it)
  // and return the same 404 shape as the pre-insert tombstone branch
  // (no `entry_id` leaked).
  //
  // Idempotency note — the compensating delete is naturally idempotent:
  // it is keyed on `(id, user_id)` and uses `count: 'exact'` so a retry
  // against an already-deleted row reports count=0 and Sentry-captures
  // (the operator can investigate the orphan).
  //
  // A residual race for tombstones AFTER this recheck commits is
  // indistinguishable from "user logged then deleted" — out-of-scope for
  // this fix. The recheck closes the SELECT/INSERT inversion class only.
  //
  // Codex R2 Finding 1 (HIGH) fix — three-branch error handling.
  //
  // The R1 fix destructured only `data: stillActive` from the recheck,
  // making transient PostgREST/RLS/schema failures (data: null, error: !!)
  // INDISTINGUISHABLE from concurrent tombstones (data: null, error: null).
  // A read blip → compensating delete fires → user-visible data loss +
  // hidden DB failure (silent swallow of pg error, lesson #9 violation).
  //
  // The three branches:
  //   1. error !== null            → unknown state; Sentry capture + 500
  //                                  with a distinct `recheck_failed` code;
  //                                  DO NOT compensating-delete (we don't
  //                                  know if the row is active or not, and
  //                                  deleting on a read failure would lose
  //                                  legitimate data)
  //   2. error === null && !data   → confirmed tombstone landed in the
  //                                  SELECT/INSERT gap; compensating-delete
  //                                  fires + 404 (existing R1 path)
  //   3. error === null && data    → happy path; row still active; proceed
  //                                  to counter bump + cache invalidation
  if (inserted) {
    const { data: stillActive, error: recheckError } = (await supabase
      .from('food_library_items')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (recheckError) {
      // Branch 1: read failed. Active-row state is unknown. Sentry-capture
      // + return 500 with `recheck_failed`. Do NOT compensating-delete —
      // the inserted entry may legitimately reference an active row, and
      // a delete on a read blip is permanent data loss. Operator can audit
      // the orphan-if-any via the captured tags.
      Sentry.captureException(recheckError, {
        tags: {
          component: 'library-log-now',
          route: 'log-now',
          phase: 'post_insert_recheck',
          pg_code: recheckError.code,
        },
        extra: {
          user_id: userId,
          library_item_id: id,
          entry_id: typeof inserted.id === 'string' ? inserted.id : null,
          error_code: recheckError.code,
          error_message: recheckError.message,
        },
      });
      return NextResponse.json({ error: 'recheck_failed' }, { status: 500 });
    }

    if (!stillActive) {
      // Branch 2: confirmed tombstone landed during SELECT/INSERT gap.
      const insertedId = typeof inserted.id === 'string' ? inserted.id : null;
      if (insertedId) {
        const { error: compensatingDeleteError, count: compensatingDeleteCount } = (await supabase
          .from('food_entries')
          .delete({ count: 'exact' })
          .eq('id', insertedId)
          .eq('user_id', userId)) as {
          error: { code?: string; message?: string } | null;
          count: number | null;
        };
        if (compensatingDeleteError || compensatingDeleteCount !== 1) {
          // Compensation failure leaves an orphan — Sentry-capture so an
          // operator can clean up. Surface 500 with a distinct error code
          // (do NOT leak `entry_id`).
          Sentry.captureException(
            compensatingDeleteError ??
              new Error(`compensating delete affected ${compensatingDeleteCount ?? 0} rows`),
            {
              tags: { component: 'library-log-now', scope: 'toctou_compensate' },
              extra: {
                userId,
                insertedId,
                libraryItemId: id,
                count: compensatingDeleteCount,
              },
            },
          );
          return NextResponse.json({ error: 'library_item_compensation_failed' }, { status: 500 });
        }
      }
      // Uniform 404 — same shape as the pre-insert tombstone branch
      // (line ~233). No entry_id leaked.
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // Branch 3: happy path — `stillActive` truthy, fall through to bump +
    // cache invalidation below.
  }

  // Counter bump (F-C4 concurrency-tolerant contract — derive from COUNT
  // AFTER insert, NOT increment from a SELECT). Bump failure is swallowed
  // + Sentry-captured per design-doc §10.3 (library = enrichment, entry
  // INSERT is authoritative).
  try {
    const { count: trueCount, error: countError } = (await supabase
      .from('food_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('library_item_id', id)) as {
      count: number | null;
      error: { code?: string; message?: string } | null;
    };
    if (countError) {
      Sentry.captureException(countError, {
        tags: {
          component: 'library-log-now',
          scope: 'bump_count_read',
          pg_code: countError.code,
        },
        extra: { userId, libraryItemId: id },
      });
    } else {
      const nextLogCount = Math.max(1, trueCount ?? 1);
      const { error: bumpError } = (await supabase
        .from('food_library_items')
        .update({
          log_count: nextLogCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)) as { error: { code?: string; message?: string } | null };
      if (bumpError) {
        Sentry.captureException(bumpError, {
          tags: {
            component: 'library-log-now',
            scope: 'bump_update',
            pg_code: bumpError.code,
          },
          extra: { userId, libraryItemId: id },
        });
      }
    }
  } catch (bumpThrown) {
    Sentry.captureException(bumpThrown, {
      tags: { component: 'library-log-now', scope: 'bump_throw' },
      extra: { userId, libraryItemId: id },
    });
  }

  // Cache invalidation — BOTH tags, BEFORE returning. Order is
  // load-bearing: server revalidateTag fires; response 200; client
  // `router.refresh()` fires AFTER, so the RSC re-render hits busted
  // caches.
  revalidateTag(TAGS.userEntries(userId, day), 'max');
  revalidateTag(TAGS.userLibrary(userId), 'max');
  revalidateAllProgressRanges(userId);
  revalidatePath('/library', 'page');

  return NextResponse.json({ entry: inserted }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
