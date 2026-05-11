/**
 * `POST /api/entries/save` — Task 3.4, food entry idempotent writer.
 *
 * Contract (synthesis §5.1 + architecture §3.1):
 *   - Zod-strict body with client_id, logged_at, meal_category, source, items.
 *   - Auth guard via `getServerSupabase().auth.getUser()`.
 *   - I11 idempotency: pre-insert SELECT by (user_id, client_id). If present,
 *     return 200 + existing row + `replayed: true`. Else INSERT; on 23505
 *     unique-violation race, re-SELECT + treat as replay.
 *   - I12 cache-tag: `revalidateTag(TAGS.userEntries(uid, day))` fires on
 *     every success path (fresh AND replay — idempotent tag-write is cheap).
 *   - Save-to-library: if `save_to_library === true` and source is text|photo,
 *     insert a `food_library_items` row with a fresh client_id and
 *     `revalidateTag(TAGS.userLibrary(uid))`. Library insert failure does NOT
 *     roll back the entry write (library = enrichment, entry = load-bearing).
 *   - Day string resolved via `userTzDayFrom(logged_at, profile.timezone)` —
 *     user-TZ, never UTC (F6 3AM hazard).
 *
 * R1 contract: the client caller MUST route through `authFetch` /
 * `authPost<T>` from `lib/auth/refresh-interceptor.ts`. The server side does
 * not enforce this; the grep-based CI check does.
 */
import * as Sentry from '@sentry/nextjs';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeName } from '@/lib/text/normalize';
import { userTzDayFrom } from '@/lib/time/day';

export const runtime = 'nodejs';

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

const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    logged_at: z.string().datetime(),
    meal_category: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']),
    source: z.enum(['text', 'photo', 'library', 'manual']),
    library_item_id: z.string().uuid().nullable().optional(),
    items: z.array(ParsedItemSchema).min(1).max(20),
    ai_reasoning: z.string().max(500).nullable().optional(),
    save_to_library: z.boolean().optional(),
    normalized_name: z.string().max(200).optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
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

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/entries/save' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence. If the cascade
  // marked this user as deleting, no new rows accepted (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;

  // F-UI-3.6-B-3 (I10) — Zod `z.string().datetime()` only validates format,
  // not bounds. Guard against future timestamps (buggy or crafted client)
  // that would corrupt day buckets + dashboard aggregates. Allow a 5-minute
  // skew for legitimate clock drift.
  const loggedAtMs = Date.parse(body.logged_at);
  const FUTURE_SKEW_MS = 5 * 60 * 1000;
  if (Number.isFinite(loggedAtMs) && loggedAtMs > Date.now() + FUTURE_SKEW_MS) {
    return NextResponse.json({ error: 'logged_at_future' }, { status: 400 });
  }

  // Timezone lookup for user-TZ day (I12 + F6).
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: string } | null };
  const tz = profile?.timezone ?? 'UTC';

  // Task 4.2 round 1 C1 fix — ownership + tombstone guard on
  // `library_item_id`. The 4.2 `/library/[id]` detail "Log this now"
  // deep-link (`?tab=library&item=<uuid>`) lets a crafted URL smuggle any
  // UUID into the save payload. RLS on `food_entries` only gates the
  // entry's OWN `user_id` — it does NOT enforce that the foreign-key
  // points at an owned library row. Without this check, an attacker who
  // guessed a victim's library-item UUID could persist a cross-user
  // reference. Defense-in-depth: reject BEFORE the insert.
  if (body.library_item_id) {
    const { data: ownedItem } = (await supabase
      .from('food_library_items')
      .select('id')
      .eq('id', body.library_item_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()) as { data: { id: string } | null };
    if (!ownedItem) {
      // Don't leak whether the row exists but is owned elsewhere vs.
      // never existed at all — 404 uniformly.
      return NextResponse.json({ error: 'library_item_not_found' }, { status: 404 });
    }
  }

  // I11 — pre-insert SELECT by (user_id, client_id). Defense-in-depth
  // `.eq('user_id', userId)` ensures cross-user collision scope stays correct
  // even if RLS ever fails open.
  //
  // I6 contract (intentional, non-obvious): `client_id` is the idempotency
  // anchor — content bytes are NOT hashed. A 2nd POST with the same
  // `client_id` but DIFFERENT body (e.g., user edited and re-submitted)
  // returns the ORIGINAL row and silently DROPS the new content. Clients
  // that want to persist edited content MUST mint a fresh `client_id`
  // (`clearClientId(mode)` then `ensureClientId(mode)`). This is enforced
  // by `tests/integration/entries-save-idempotency.test.ts` (content-change
  // replay case).
  const { data: existing } = (await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', body.client_id)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  if (existing) {
    // F-UI-3.6-B-4 — derive the revalidation day from the PERSISTED row's
    // logged_at, not the incoming body. A client that edits logged_at and
    // retries under the same client_id would otherwise invalidate the cache
    // for the wrong day bucket.
    const existingLoggedAt = typeof existing.logged_at === 'string' ? existing.logged_at : '';
    const existingDay = existingLoggedAt
      ? userTzDayFrom(existingLoggedAt, tz)
      : userTzDayFrom(body.logged_at, tz);
    revalidateTag(TAGS.userEntries(userId, existingDay), 'max');
    // Task 4.5 R1 Pass 2 C2: invalidate ALL canonical progress ranges
    // (24h/D/7d/30d/90d/1y) via shared helper; previously only 3 emitted.
    revalidateAllProgressRanges(userId);
    return NextResponse.json({ entry: existing, replayed: true }, { status: 200 });
  }

  // Fresh-insert path only — day comes from the incoming body.
  const day = userTzDayFrom(body.logged_at, tz);

  // Fresh insert. Server-supplied user_id — never trust the payload.
  const insertPayload = {
    user_id: userId,
    client_id: body.client_id,
    logged_at: body.logged_at,
    meal_category: body.meal_category,
    source: body.source,
    library_item_id: body.library_item_id ?? null,
    items: body.items,
    ai_reasoning: body.ai_reasoning ?? null,
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
    // 23505 — concurrent-race replay. Re-SELECT the committed row.
    if (insertErr.code === '23505') {
      const { data: raceRow } = (await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('client_id', body.client_id)
        .maybeSingle()) as { data: Record<string, unknown> | null };
      if (raceRow) {
        // F-UI-3.6-B-4 — derive day from the RACE ROW, not the incoming body.
        const raceLoggedAt = typeof raceRow.logged_at === 'string' ? raceRow.logged_at : '';
        const raceDay = raceLoggedAt ? userTzDayFrom(raceLoggedAt, tz) : day;
        revalidateTag(TAGS.userEntries(userId, raceDay), 'max');
        // Task 4.5 R1 Pass 2 C2: full canonical range set on race-replay too.
        revalidateAllProgressRanges(userId);
        return NextResponse.json({ entry: raceRow, replayed: true }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // F-TASK-4.2-TOCTOU fix — close the time-of-check-to-time-of-use race
  // window between the pre-insert ownership SELECT (line ~117) and the
  // INSERT above. A sibling tab can tombstone the library row via
  // /api/library/[id]/delete in the gap; the FK SET NULL trigger does NOT
  // fire for soft-deletes, so the entry would persist with library_item_id
  // pointing at a tombstoned row (referential-integrity scar — orphaned on
  // list views that filter `deleted_at IS NULL`).
  //
  // Mechanism: re-verify the library row is still active POST-insert. If
  // a concurrent tombstone landed in the window, issue a compensating
  // DELETE on the just-inserted entry (the row is brand-new with no
  // children and is owned by the caller — RLS allows it) and return 404
  // to match the pre-insert tombstone-detection branch.
  //
  // A residual race remains for tombstones that land AFTER this recheck
  // commits, but that case is indistinguishable from "user logged then
  // deleted in another tab" — the entry survives with a stale FK by user
  // intent, not by TOCTOU. The recheck closes the bug class where the
  // SELECT/INSERT inversion creates an orphan against the user's wishes.
  if (body.library_item_id && inserted) {
    const { data: stillActive } = (await supabase
      .from('food_library_items')
      .select('id')
      .eq('id', body.library_item_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()) as { data: { id: string } | null };
    if (!stillActive) {
      const insertedId = typeof inserted.id === 'string' ? inserted.id : null;
      if (insertedId) {
        // Compensating delete — keyed on id AND user_id for defense-in-
        // depth (RLS already enforces user_id). `count: 'exact'` asks
        // PostgREST to return the affected row count so we can detect
        // partial failures.
        //
        // Aggregate Codex A2 follow-up: Supabase resolves with
        // `{ error, count }` rather than throwing — the previous try/catch
        // wrapper missed RLS denials, constraint violations, and
        // count=0 outcomes (orphan persists despite a "clean" 404 to the
        // client). We now inspect both fields. On compensation failure we
        // surface 500 (`library_item_compensation_failed`) so the operator
        // can investigate the orphan; only on success do we return the
        // uniform 404 used by the pre-insert tombstone branch.
        const { error: compensatingDeleteError, count: compensatingDeleteCount } = (await supabase
          .from('food_entries')
          .delete({ count: 'exact' })
          .eq('id', insertedId)
          .eq('user_id', userId)) as {
          error: { code?: string; message?: string } | null;
          count: number | null;
        };
        if (compensatingDeleteError || compensatingDeleteCount !== 1) {
          Sentry.captureException(
            compensatingDeleteError ??
              new Error(`compensating delete affected ${compensatingDeleteCount ?? 0} rows`),
            {
              tags: { component: 'entries-save', scope: 'toctou_compensate' },
              extra: {
                userId,
                insertedId,
                libraryItemId: body.library_item_id,
                count: compensatingDeleteCount,
              },
            },
          );
          return NextResponse.json(
            {
              error: 'library_item_compensation_failed',
              detail: compensatingDeleteError?.message ?? 'no row deleted',
            },
            { status: 500 },
          );
        }
      }
      return NextResponse.json({ error: 'library_item_not_found' }, { status: 404 });
    }
  }

  // Save-to-library enrichment (design-doc §10.3 + synthesis §2.11).
  // Library failure swallowed — entry is authoritative.
  //
  // Task 4.7.3 (B2 fix):
  //   1. Server computes `normalized_name` from `items[0].name` via the
  //      canonical helper (`lib/text/normalize.ts`). Client no longer sends
  //      it (the prior `body.normalized_name` gate was a silent no-op
  //      because ConfirmationScreen never populated the field). The Zod
  //      schema still ACCEPTS `normalized_name` for backward compat but the
  //      server IGNORES the client-supplied value to keep dedup parity with
  //      the `/library/dedup-check` route (single source of truth).
  //   2. The source guard skips `'library'` (re-log path — no enrichment)
  //      AND `'manual'` (food_library_items.created_from CHECK constraint
  //      only allows 'text'|'photo'; inserting with 'manual' would 23514).
  //   3. Empty-after-normalize names (e.g. whitespace-only) skip the insert
  //      to avoid violating the `normalized_name text not null` column AND
  //      poisoning dedup with empty strings.
  //   4. The persisted JSONB `nutrition` carries the FULL nutrition row
  //      (kcal + macros + micros), not just kcal — re-log via library_item_id
  //      would otherwise lose protein/carbs/fat/fiber.
  if (body.save_to_library && (body.source === 'text' || body.source === 'photo')) {
    const firstItem = body.items[0];
    const computedNormalized = firstItem ? normalizeName(firstItem.name) : '';
    if (firstItem && computedNormalized) {
      try {
        const macros = firstItem.macros ?? {
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
        };
        const micros = firstItem.micros ?? {};
        // Task A.1 Codex Round 1 (Critical Finding B): destructure `error`
        // from the insert chain. Supabase RESOLVES PostgREST errors rather
        // than throwing — the previous code awaited the chain without
        // inspecting the error field, so cache invalidation fired even when
        // the row never landed (RLS denial, 23505 unique violation, schema
        // drift). That produced the exact "cache lying about library state"
        // symptom Task A.1 was created to fix. Guard the revalidate calls
        // behind `!libError`, and emit a Sentry signal on the error branch
        // so PostgREST failures surface in production observability.
        const { error: libError } = (await supabase
          .from('food_library_items')
          .insert({
            user_id: userId,
            client_id: crypto.randomUUID(),
            normalized_name: computedNormalized,
            display_name: firstItem.name,
            nutrition: { kcal: firstItem.kcal, macros, micros },
            created_from: body.source, // 'text' | 'photo' only — guard above.
          })
          .select()
          .single()) as {
          data: Record<string, unknown> | null;
          error: { code?: string; message?: string } | null;
        };
        if (libError) {
          Sentry.captureException(libError, {
            tags: {
              component: 'entries-save',
              scope: 'library_insert',
              pg_code: libError.code,
            },
            extra: { userId, normalizedName: computedNormalized },
          });
        } else {
          revalidateTag(TAGS.userLibrary(userId), 'max');
          // Task A.1 (REV 2) — invalidate Next.js Router Cache (segment cache)
          // for /library so a post-save navigation does NOT replay the stale
          // prefetched payload captured before this insert. The prefetch TTL
          // would otherwise hide the new row for ~30s. Pairs with the existing
          // `revalidateTag` call above (the tag is forward-compat for the
          // eventual `cacheComponents:true` flip; the path-revalidate is the
          // load-bearing fix under the current cache mode).
          revalidatePath('/library', 'page');
        }
      } catch (libraryInsertError) {
        // Swallow — library is enrichment, entry already committed
        // (design-doc §10.3). Capture for production observability so
        // silent dedup-poisoning bugs surface in Sentry rather than
        // disappearing into the catch.
        Sentry.captureException(libraryInsertError, {
          tags: { component: 'entries-save', scope: 'library_insert' },
          extra: { userId, normalizedName: computedNormalized },
        });
      }
    }
  }

  revalidateTag(TAGS.userEntries(userId, day), 'max');
  // Task 4.5 R1 Pass 2 C2: invalidate ALL canonical progress ranges
  // (24h/D/7d/30d/90d/1y) — previously only 3 of 6 emitted.
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ entry: inserted }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
