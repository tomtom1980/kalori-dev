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
import {
  aggregateAlcoholFromItems,
  type AlcoholAggregatableItem,
  type LegacyAlcoholSlot,
} from '@/lib/alcohol/aggregate-entry-logs';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { findDuplicateFoodLog } from '@/lib/entries/duplicate-log';
import { getLibraryCreateQuota } from '@/lib/library/create-quota';
import { MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';
import { isWholeStyleQuantity, normalizePortionUnit } from '@/lib/log/portion-unit';
import { enqueueSketchGeneration } from '@/lib/library/sketch-enqueue';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeName } from '@/lib/text/normalize';
import { userTzDayFrom } from '@/lib/time/day';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

const ParsedItemSchema = z
  .object({
    name: z.string().min(1).max(200),
    portion: z.number().positive(),
    unit: z.string().max(32),
    approxGrams: z.number().positive().finite().optional(),
    kcal: z.number().nonnegative(),
    macros: z
      .object({
        protein_g: z.number().nonnegative(),
        carbs_g: z.number().nonnegative(),
        fat_g: z.number().nonnegative(),
        fiber_g: z.number().nonnegative(),
        // Phase 2C — cholesterol_mg, optional for pre-cholesterol clients.
        // Mirrors `ParsedItem` in `lib/ai/schemas.ts`.
        cholesterol_mg: z.number().nonnegative().optional(),
      })
      .optional(),
    // Bugfix 2026-05-17 R3 C2-R2-1 — when `save_to_library: true` the route
    // writes `firstItem.micros` directly into the `food_library_items`
    // `nutrition.micros` JSONB column. Without `.finite()` /
    // `.nonnegative()` / `.max(MAX_MICRO_VALUE)`, a direct authenticated
    // POST could persist values >1e6 (or NaN / negatives) and bypass the
    // C3 R1 integrity claim across the same column. The bound mirrors
    // the client clamp in `useFoodDetailEdit.ts` + the server bounds in
    // `library/[id]/update` and `library/create`. Shared constant lives
    // at `lib/library/micros-bounds.ts` (extracted from 4 duplicates per
    // the rule-of-four heuristic).
    micros: z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE)).optional(),
    recipeEligible: z.boolean().optional(),
    recipeEligibilityReason: z.string().max(240).optional(),
    confidence: z.number().min(0).max(1).optional(),
    // Bug A (bugfix-tomi 2026-05-19-bac-improvements) — AI-derived per-item
    // alcohol fields. Mirrors `ParsedItem` in `lib/ai/schemas.ts`. Bounds
    // match the alcohol_logs DB check constraints (migration 0026) AND the
    // legacy top-level `body.alcohol` slot below. Three-layer defense:
    // Gemini prompt directive → AI Zod schema (lib/ai/schemas) → route
    // Zod (here). The `superRefine` below enforces volume_ml + abv_percent
    // are present when is_alcoholic=true.
    is_alcoholic: z.boolean().optional(),
    volume_ml: z.number().positive().finite().max(5000).optional(),
    abv_percent: z.number().positive().finite().max(100).optional(),
  })
  .superRefine((item, ctx) => {
    if (!isWholeStyleQuantity(item.unit, item.portion)) {
      ctx.addIssue({
        code: 'custom',
        path: ['portion'],
        message: 'portion must be a whole number for this unit',
      });
    }
    // Bug A — when AI flags an item alcoholic, volume + ABV are mandatory.
    if (item.is_alcoholic === true) {
      // Security Review (bugfix-tomi 2026-05-19-bac-improvements) H1
      // (HIGH): cap alcoholic portions before BAC aggregation, without
      // blocking legitimate non-alcoholic gram portions such as 1400 g
      // watermelon. The shared aggregator also clamps output as a second
      // layer for persisted legacy rows and future callers.
      if (item.portion > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['portion'],
          message: 'portion must be <= 100 for alcoholic items',
        });
      }
      if (item.volume_ml === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['volume_ml'],
          message: 'volume_ml is required when is_alcoholic=true',
        });
      }
      if (item.abv_percent === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['abv_percent'],
          message: 'abv_percent is required when is_alcoholic=true',
        });
      }
    }
  });

function shouldPersistApproxGrams(unit: string | undefined | null, approxGrams: unknown): boolean {
  const normalized = normalizePortionUnit(unit);
  return (
    typeof approxGrams === 'number' &&
    Number.isFinite(approxGrams) &&
    approxGrams > 0 &&
    normalized !== 'g' &&
    normalized !== 'gram' &&
    normalized !== 'grams'
  );
}

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
    allow_duplicate: z.boolean().optional(),
    /**
     * Optional free-text description forwarded to the sketch prompt when
     * a library row is created. Source-agnostic — the client picks the
     * most informative text it has (user's typed input for text source,
     * AI reasoning for photo source). Capped at 500 chars; trimmed and
     * truncated again inside the prompt builder.
     */
    description: z.string().max(500).nullable().optional(),
    alcohol: z
      .object({
        volume_ml: z.number().positive().max(5000),
        abv_percent: z.number().positive().max(100),
      })
      .strict()
      .optional(),
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
  if (body.alcohol && body.meal_category !== 'drink') {
    return NextResponse.json({ error: 'alcohol_requires_drink_category' }, { status: 400 });
  }

  /**
   * Bug A (bugfix-tomi 2026-05-19-bac-improvements) + Codex Round 2 C1-r2 fix
   * — alcohol_logs writer.
   *
   * Source of the items[] (and the legacy `body.alcohol` slot) varies by
   * caller:
   *
   *   - Fresh insert / race-replay (23505): use the just-persisted row's
   *     items, which by construction equal the request body (the INSERT
   *     payload was `items: body.items`). Pass `body.items` directly +
   *     the legacy `body.alcohol` slot (legacy slot is a per-REQUEST
   *     contract from the original caller).
   *   - Replay (existing entry for same client_id): the CANONICAL alcohol
   *     state comes from the ORIGINAL entry's stored items. The retry's
   *     `body.items` may have drifted (user edited then re-submitted under
   *     the same client_id — I6 contract: edited content is dropped on
   *     replay). Pass `existing.items` and DO NOT use `body.alcohol`,
   *     because the legacy slot is a property of the original request, not
   *     of this retry. If a retry happens to omit the legacy slot, we
   *     cannot reconstruct it — but the replay-noop path covers the
   *     "alcohol_logs already exists" case below, so reconstruction only
   *     applies to the repair branch and only for entries whose ORIGINAL
   *     items[] carry per-item alcohol metadata.
   *
   * Codex R1 C1 / I1 fix (aggregator extracted to
   * `lib/alcohol/aggregate-entry-logs.ts`):
   *   - `alcohol_logs.entry_id` is UNIQUE (migration 0026 line 48–49), so
   *     all alcoholic items for an entry collapse into ONE row.
   *   - `volume_ml` is per-serving; multiply by `portion`.
   *   - ABV on the aggregate row is volume-weighted so the triple is
   *     internally consistent.
   *
   * The aggregator helper accepts `items` + `mealCategory` + optional
   * `legacy` slot. Non-drink meal_category short-circuits to no
   * contributions (silent skip on AI false-positives like kombucha/
   * mocktail).
   */
  async function ensureAlcoholLogForEntry(
    entry: Record<string, unknown>,
    consumedAt: string,
    items: readonly AlcoholAggregatableItem[],
    legacy?: LegacyAlcoholSlot | undefined,
  ): Promise<Response | null> {
    const mealCategory = typeof entry.meal_category === 'string' ? entry.meal_category : '';

    // Short-circuit on no alcoholic contributions — saves an unnecessary
    // alcohol_logs read for the overwhelmingly common non-drink path
    // (breakfast / lunch / dinner / snack) and preserves the prior
    // ensureAlcoholLogForEntry contract where the alcohol_logs table is
    // only touched when there is actually alcohol to write.
    const aggregate = aggregateAlcoholFromItems({ items, mealCategory, legacy });
    if (!aggregate) return null;

    const entryId = typeof entry.id === 'string' ? entry.id : null;
    if (!entryId) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    // Replay-safe: if any alcohol_logs row already exists for this entry,
    // skip the insert. Idempotent on retries and protects the canonical
    // alcohol state from being overwritten by a same-client_id retry whose
    // items[] have drifted. Codex R2 C1-r2 — without this short-circuit
    // and with `items` derived from the (drifted) retry body, the replay
    // would either duplicate (UNIQUE constraint catches it as 23505 but
    // we'd already have surfaced a misleading 500) or, in the repair
    // branch, fabricate a row that lies about the original drink.
    const { data: existingAlcohol, error: alcoholReadErr } = (await supabase
      .from('alcohol_logs')
      .select('id')
      .eq('entry_id', entryId)
      .maybeSingle()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };
    if (alcoholReadErr) {
      Sentry.captureException(alcoholReadErr, {
        tags: { component: 'entries-save', route: 'save', phase: 'alcohol_read' },
        extra: { user_id: userId, entry_id: entryId, pg_code: alcoholReadErr.code },
      });
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    if (existingAlcohol) return null;

    const alcoholPayload = {
      user_id: userId,
      entry_id: entryId,
      volume_ml: aggregate.volume_ml,
      abv_percent: aggregate.abv_percent,
      alcohol_grams: aggregate.alcohol_grams,
      consumed_at: consumedAt,
    };
    const { error: alcoholInsertErr } = (await supabase
      .from('alcohol_logs')
      .insert(alcoholPayload)) as { error: { code?: string; message?: string } | null };
    if (alcoholInsertErr) {
      Sentry.captureException(alcoholInsertErr, {
        tags: { component: 'entries-save', route: 'save', phase: 'alcohol_insert' },
        extra: { user_id: userId, entry_id: entryId, pg_code: alcoholInsertErr.code },
      });
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    return null;
  }

  /**
   * Helper: coerce the unknown `entry.items` JSONB column into the
   * minimal item shape the aggregator needs. The DB column accepts any
   * JSONB; production rows are an array of objects matching ParsedItem,
   * but defensive narrowing here protects against legacy / malformed
   * rows from manual SQL.
   */
  function entryItemsToAggregatable(
    entry: Record<string, unknown>,
  ): readonly AlcoholAggregatableItem[] {
    const raw = entry.items;
    if (!Array.isArray(raw)) return [];
    return raw.filter((it): it is AlcoholAggregatableItem => typeof it === 'object' && it !== null);
  }

  // F-UI-3.6-B-3 (I10) — Zod `z.string().datetime()` only validates format,
  // not bounds. Guard against future timestamps (buggy or crafted client)
  // that would corrupt day buckets + dashboard aggregates. Allow only 30s
  // skew for legitimate clock drift.
  //
  // Future-skew guard position (PRESERVED across Codex R2): runs BEFORE the
  // idempotency SELECT. Rationale: a future-timestamped retry is a buggy or
  // crafted payload regardless of replay state — rejecting eagerly prevents
  // corrupted timestamps from being accepted as "replays" of valid rows.
  const loggedAtMs = Date.parse(body.logged_at);
  const FUTURE_SKEW_MS = 30_000;
  if (Number.isFinite(loggedAtMs) && loggedAtMs > Date.now() + FUTURE_SKEW_MS) {
    return NextResponse.json({ error: 'logged_at_future' }, { status: 400 });
  }

  // Timezone lookup for user-TZ day (I12 + F6).
  //
  // Codex C.CODEX Finding (HIGH) — `profiles.timezone` is `unknown` at the
  // query layer (JSON column / legacy text). Malformed legacy strings
  // (e.g. abandoned onboarding rows, `'invalid/zone'`, empty string) would
  // crash `userTzDayFrom` (`Intl.DateTimeFormat` with unknown IANA →
  // RangeError) and surface a 500 BEFORE the entry insert. Mirrors the
  // normalization path in `/api/library/[id]/log-now` so save / edit /
  // delete / log-now all share one shared helper and one UTC-fallback
  // policy. Invalid values are Sentry-captured for operator visibility.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: unknown } | null };
  const tz = normalizeProfileTimezone(profile?.timezone, {
    sentryTag: 'entries-save',
    userId,
  });

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
    // Codex R2 C1-r2 — REPLAY path uses the PERSISTED entry's items, not
    // the retry body's items. A retry with drifted items must NOT mutate
    // the canonical alcohol log; the legacy `body.alcohol` slot is also
    // dropped on replay because it is a per-request property of the
    // ORIGINAL caller, not of this retry.
    const alcoholReplayError = await ensureAlcoholLogForEntry(
      existing,
      existingLoggedAt || body.logged_at,
      entryItemsToAggregatable(existing),
    );
    if (alcoholReplayError) return alcoholReplayError;
    revalidateTag(TAGS.userEntries(userId, existingDay), 'max');
    // Task 4.5 R1 Pass 2 C2: invalidate ALL canonical progress ranges
    // (24h/D/7d/30d/90d/1y) via shared helper; previously only 3 emitted.
    revalidateAllProgressRanges(userId);
    return NextResponse.json({ entry: existing, replayed: true }, { status: 200 });
  }

  // Task C.5 — 30-day backfill window (PRD §3.5 + §6 + F-VERIFY-203). The
  // server contract is "30 days inclusive" — anything older than `now() - 30d`
  // is rejected. Inclusive boundary (`<` not `<=`) per PRD §6. Mirrors the
  // client-side clamp on the `<input type="datetime-local" min=...>` in
  // `app/(app)/log/_components/Confirmation/TimeEditor.tsx`. Parallel
  // imperative guard rather than a Zod refinement so the existing
  // `'logged_at_future'` error shape is preserved verbatim (load-bearing for
  // client error-message routing).
  //
  // Codex R2 Finding #1 — guard placement: this block runs AFTER the
  // idempotency SELECT/replay (line ~179). Rationale: a retry under the same
  // client_id for an entry already persisted >30d+grace ago must return
  // 200/replayed (the original idempotency contract), NOT 400. The guard
  // applies only to FRESH inserts — replays are honoured regardless of the
  // persisted row's age. Future-skew guard above keeps its eager position.
  //
  // Codex R1 Finding #1 — `BACKFILL_GRACE_MS`. The TimeEditor pins `nowAtMount`
  // lazily at mount time and formats the `min` attribute to MINUTE precision.
  // The server recomputes its bound with a fresh `Date.now()` at request
  // receipt. Without a grace buffer, the client's displayed `min` is up to
  // ~150s STALER than the server's bound (minute-slice truncation + mount-to-
  // submit delay + network latency). The 4-minute grace (expanded from R1's
  // 2 minutes per Codex R2 Finding #2) covers worst-case staleness. The grace
  // is intentionally narrow so the 30-day contract is not silently extended
  // by hours — `tests/integration/entries-save-30day-window.test.ts` asserts
  // "30d + 5min" still rejects.
  const BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  // Codex R2 Finding #2: 4 min = minute-trunc (~59s) + modal-open drift (~90s) + network latency
  const BACKFILL_GRACE_MS = 4 * 60 * 1000;
  if (
    Number.isFinite(loggedAtMs) &&
    loggedAtMs < Date.now() - BACKFILL_WINDOW_MS - BACKFILL_GRACE_MS
  ) {
    return NextResponse.json({ error: 'logged_at_too_old' }, { status: 400 });
  }

  // Fresh-insert path only — day comes from the incoming body.
  const day = userTzDayFrom(body.logged_at, tz);

  if (!body.allow_duplicate) {
    const duplicate = await findDuplicateFoodLog({
      supabase,
      userId,
      loggedAtIso: body.logged_at,
      timezone: tz,
      mealCategory: body.meal_category,
      libraryItemId: body.library_item_id ?? null,
      itemNames: body.items.map((item) => item.name),
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'duplicate_food_entry', existing_entry_id: duplicate.id },
        { status: 409 },
      );
    }
  }

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
        // Codex R2 C1-r2 — race-replay (23505) treated as REPLAY: the
        // winning writer's items are canonical, so aggregate from
        // raceRow.items (drop body.alcohol — same rationale as the
        // existing-row branch).
        const alcoholRaceError = await ensureAlcoholLogForEntry(
          raceRow,
          raceLoggedAt || body.logged_at,
          entryItemsToAggregatable(raceRow),
        );
        if (alcoholRaceError) return alcoholRaceError;
        revalidateTag(TAGS.userEntries(userId, raceDay), 'max');
        // Task 4.5 R1 Pass 2 C2: full canonical range set on race-replay too.
        revalidateAllProgressRanges(userId);
        return NextResponse.json({ entry: raceRow, replayed: true }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Fresh insert: items just persisted equal body.items by construction,
  // and the legacy body.alcohol slot is a property of THIS request.
  const alcoholFreshError = inserted
    ? await ensureAlcoholLogForEntry(inserted, body.logged_at, body.items, body.alcohol)
    : null;
  if (alcoholFreshError) {
    const insertedId = typeof inserted?.id === 'string' ? inserted.id : null;
    if (insertedId) {
      await supabase.from('food_entries').delete().eq('id', insertedId).eq('user_id', userId);
    }
    return alcoholFreshError;
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
  //
  // Codex R2 Finding 1 (CRITICAL) fix — three-branch error handling.
  //
  // The original recheck destructured only `data: stillActive`, making
  // transient PostgREST/RLS/schema failures (data:null, error:!!)
  // INDISTINGUISHABLE from concurrent tombstones (data:null, error:null).
  // A read blip would fire the compensating delete on a legitimately-
  // inserted entry → user-visible data loss + hidden DB failure (silent
  // swallow of pg error, lesson #9 violation).
  //
  // Three branches (mirrors /api/library/[id]/log-now/route.ts:411-505):
  //   1. error !== null            → unknown state; Sentry capture + 500
  //                                  with `recheck_failed`; NO compensating
  //                                  delete (deleting on a read failure
  //                                  would lose legitimately-inserted data).
  //   2. error === null && !data   → confirmed tombstone landed in the
  //                                  SELECT/INSERT gap; compensating-delete
  //                                  fires + uniform 404 (R1 path).
  //   3. error === null && data    → happy path; row still active; proceed
  //                                  to counter bump + cache invalidation.
  if (body.library_item_id && inserted) {
    const { data: stillActive, error: recheckError } = (await supabase
      .from('food_library_items')
      .select('id')
      .eq('id', body.library_item_id)
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
          component: 'entries-save',
          route: 'save',
          phase: 'post_insert_recheck',
          pg_code: recheckError.code,
        },
        extra: {
          user_id: userId,
          library_item_id: body.library_item_id,
          entry_id: typeof inserted.id === 'string' ? inserted.id : null,
          error_code: recheckError.code,
          error_message: recheckError.message,
        },
      });
      return NextResponse.json({ error: 'recheck_failed' }, { status: 500 });
    }

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

    // Task C.4 — bump `log_count` + `last_used_at` on re-log so the
    // Library tab "frequency-sorted by default" contract (PRD §3.4) holds.
    // F-VERIFY-201 fix. Mirrors the save/route ownership + tombstone guard
    // pattern (lines ~124-136): the WHERE predicate
    // `id = $1 AND user_id = $2 AND deleted_at IS NULL` is the TOCTOU +
    // tombstone defense — if the row was tombstoned in the window between
    // the recheck above and this UPDATE, the predicate matches 0 rows and
    // the UPDATE silently no-ops (AC3). Soft-fail policy: library bump is
    // enrichment, entry INSERT is authoritative (design-doc §10.3) — any
    // Sentry-captured error here does NOT 5xx the response.
    //
    // Codex Round 1 fix (High #1 + #2, Medium): the previous SELECT-then-
    // increment pattern produced durable counter drift in three classes:
    //   (a) Paths that set `library_item_id` without going through this
    //       bump (PATCH edits, copy-yesterday, future flows) leave the
    //       counter low, so an undo using `-1` over-decrements.
    //   (b) Concurrent re-logs both read N and both write N+1 → silent
    //       under-bump (lost update).
    //   (c) A failed read produces a `null` write that conflates "no
    //       remaining entries" with "could not read remaining entries".
    // Mitigation: **derive log_count from COUNT(*) AFTER the INSERT
    // commits**. The post-INSERT COUNT is idempotent (re-running converges
    // to truth), self-correcting for orphan paths (they become consistent
    // on the next save/undo), and concurrency-tolerant (the later writer's
    // COUNT observes both INSERTs and writes the correct sum; the earlier
    // writer may write a stale sum, but the later writer overwrites it).
    // `food_entries` is hard-deleted (no `deleted_at` column on entries —
    // confirmed via architecture.md §2.3), so the COUNT predicate does
    // NOT need a `deleted_at IS NULL` filter on entries.
    try {
      const { count: trueCount, error: countError } = (await supabase
        .from('food_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('library_item_id', body.library_item_id)) as {
        count: number | null;
        error: { code?: string; message?: string } | null;
      };
      if (countError) {
        // Codex Round 1 High #2 analogue (save side): never write a derived
        // value from a failed read. Capture and skip the bump UPDATE.
        Sentry.captureException(countError, {
          tags: {
            component: 'entries-save',
            scope: 'library_log_count_bump_count',
            pg_code: countError.code,
          },
          extra: { userId, libraryItemId: body.library_item_id },
        });
      } else {
        // Floor at 1 — the INSERT we just committed guarantees at least
        // one row exists. PostgREST `count: 'exact'` returns `null` only
        // on protocol/parse error (which `countError` already caught), but
        // we defend explicitly for type-safety.
        const nextLogCount = Math.max(1, trueCount ?? 1);
        const { error: bumpError } = (await supabase
          .from('food_library_items')
          .update({
            log_count: nextLogCount,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', body.library_item_id)
          .eq('user_id', userId)
          .is('deleted_at', null)) as { error: { code?: string; message?: string } | null };
        if (bumpError) {
          Sentry.captureException(bumpError, {
            tags: {
              component: 'entries-save',
              scope: 'library_log_count_bump',
              pg_code: bumpError.code,
            },
            extra: { userId, libraryItemId: body.library_item_id },
          });
        } else {
          // Cache invalidation so the frequency-sort reorder lands on the
          // next render. Mirrors Task A.1 (REV 2) pattern at lines 362-371.
          // The UPDATE silently no-ops on tombstoned rows via the
          // `.is('deleted_at', null)` predicate — that's acceptable for the
          // cache invalidate because nothing visible changed anyway.
          revalidateTag(TAGS.userLibrary(userId), 'max');
          revalidatePath('/library', 'page');
        }
      }
    } catch (bumpThrown) {
      Sentry.captureException(bumpThrown, {
        tags: { component: 'entries-save', scope: 'library_log_count_bump' },
        extra: { userId, libraryItemId: body.library_item_id },
      });
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
  let libraryQuotaExceeded = false;

  if (
    body.save_to_library &&
    !body.library_item_id &&
    (body.source === 'text' || body.source === 'photo')
  ) {
    const firstItem = body.items[0];
    const computedNormalized = firstItem ? normalizeName(firstItem.name) : '';
    if (firstItem && computedNormalized) {
      try {
        const quota = await getLibraryCreateQuota({ supabase, userId, tz });
        if (quota.exceeded) {
          libraryQuotaExceeded = true;
          throw new Error('library_create_quota_exceeded');
        }
        const macros = firstItem.macros ?? {
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
        };
        const micros = firstItem.micros ?? {};
        const nutrition: Record<string, unknown> = { kcal: firstItem.kcal, macros, micros };
        if (shouldPersistApproxGrams(firstItem.unit, firstItem.approxGrams)) {
          nutrition.approxGrams = firstItem.approxGrams;
        }
        const recipeEligibility =
          firstItem.recipeEligible === undefined
            ? 'unknown'
            : firstItem.recipeEligible
              ? 'eligible'
              : 'ineligible';
        // Task A.1 Codex Round 1 (Critical Finding B): destructure `error`
        // from the insert chain. Supabase RESOLVES PostgREST errors rather
        // than throwing — the previous code awaited the chain without
        // inspecting the error field, so cache invalidation fired even when
        // the row never landed (RLS denial, 23505 unique violation, schema
        // drift). That produced the exact "cache lying about library state"
        // symptom Task A.1 was created to fix. Guard the revalidate calls
        // behind `!libError`, and emit a Sentry signal on the error branch
        // so PostgREST failures surface in production observability.
        // Bug 5 (library overhaul 2026-05-16) — INSERT shape.
        //
        // Codex Round 1 Critical #3 fix: do NOT pre-set
        // `thumbnail_kind='photo'` on photo-source library rows here.
        // The entries-save body does not carry a `thumbnail_url`, and
        // marking the row `thumbnail_kind='photo'` without a URL traps
        // the row in letter-mark-fallback purgatory — the sketch
        // pipeline's photo-wins guard short-circuits it forever while
        // the renderer has no URL to display.
        //
        // Both source paths now ship with `thumbnail_kind=null`, which
        // makes the row sketch-eligible. The sketch enqueue fires for
        // both `text` and `photo` source. If a separate photo-upload
        // path later threads a real `thumbnail_url` into the row, that
        // write should also set `thumbnail_kind='photo'` atomically so
        // the pipeline's photo-wins guard reactivates from that point.
        const { data: libRow, error: libError } = (await supabase
          .from('food_library_items')
          .insert({
            user_id: userId,
            client_id: crypto.randomUUID(),
            normalized_name: computedNormalized,
            display_name: firstItem.name,
            default_portion: firstItem.portion,
            default_unit: firstItem.unit,
            nutrition,
            created_from: body.source, // 'text' | 'photo' only — guard above.
            thumbnail_kind: null,
            recipe_eligibility: recipeEligibility,
            recipe_eligibility_reason: firstItem.recipeEligibilityReason ?? null,
            recipe_eligibility_checked_at:
              firstItem.recipeEligible !== undefined || firstItem.recipeEligibilityReason
                ? new Date().toISOString()
                : null,
          })
          .select('id, display_name')
          .single()) as {
          data: { id: string; display_name: string } | null;
          error: { code?: string; message?: string } | null;
        };

        // Bug 1 + Codex R1 (C1 + I1) — entry↔library link + 23505 recovery.
        //
        // The original Bug 1 fix hardcoded `log_count: 1` on the INSERT
        // payload. Codex R1 surfaced two issues with that approach:
        //
        //   C1 (Critical): the food_entries INSERT earlier in this same
        //   request had `library_item_id: body.library_item_id ?? null` —
        //   it CANNOT point at the just-created library row. The re-log
        //   COUNT(*)-derivation path (`/api/library/[id]/log-now` lines
        //   ~511-519 + the in-file re-log bump at lines ~450-509) reads
        //   COUNT(food_entries) WHERE library_item_id = libRow.id. For an
        //   item created by THIS path, the first later re-log would write
        //   log_count = 1 (only the re-log entry counted) instead of 2;
        //   every subsequent count would stay under by one.
        //
        //   I1 (Improvement): the partial unique index
        //   `food_library_items_user_normalized_name_unique` on active
        //   (user_id, normalized_name) means two simultaneous save-to-
        //   library requests for the same food → one INSERT wins, the
        //   other gets 23505. The losing tab's food_entries row remained
        //   orphaned (library_item_id null) and its contribution was lost
        //   from log_count.
        //
        // Unified fix:
        //   1. On 23505, SELECT the existing active row by
        //      (user_id, normalized_name) to recover the winner's id.
        //   2. UPDATE this request's just-inserted food_entries row to
        //      set library_item_id = recovered/new id (the missing C1 link).
        //   3. Derive log_count via COUNT(*) FROM food_entries WHERE
        //      library_item_id = id — matches the re-log path's pattern.
        //      Fresh path: COUNT = 1 → log_count = 1 (replaces the
        //      previous hardcoded 1, but now CONSISTENT with re-log).
        //      Race path:  COUNT = 2 → log_count = 2 (both entries linked).
        //
        // Library failure is still swallowed (entry write is authoritative
        // per design-doc §10.3), but on 23505 the recovery succeeds — the
        // user's badge reflects the correct count.
        let libraryItemId: string | null = null;
        if (libRow) {
          libraryItemId = libRow.id;
        } else if (libError?.code === '23505') {
          // I1 — concurrent-tab race lost. SELECT existing active row by
          // (user_id, normalized_name). Predicate mirrors the partial
          // unique index in `supabase/migrations/0020_food_library_dedup_index.sql`
          // (`WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`).
          const { data: existingLib, error: recoverError } = (await supabase
            .from('food_library_items')
            .select('id, log_count')
            .eq('user_id', userId)
            .eq('normalized_name', computedNormalized)
            .is('deleted_at', null)
            .maybeSingle()) as {
            data: { id: string; log_count: number } | null;
            error: { code?: string; message?: string } | null;
          };
          if (recoverError) {
            // Recovery read failed — fall through to the Sentry-capture
            // path below so the operator can audit. Entry write already
            // committed; library remains orphaned for this request (the
            // food_entries row stays null-linked). This is enrichment-only
            // failure per design-doc §10.3.
            Sentry.captureException(recoverError, {
              tags: {
                component: 'entries-save',
                scope: 'library_recover_23505',
                pg_code: recoverError.code,
              },
              extra: { userId, normalizedName: computedNormalized },
            });
          } else if (existingLib) {
            libraryItemId = existingLib.id;
          }
        }

        // Codex R2 C1-R2 — link-confirmed gate.
        //
        // The R1 fix added the food_entries.library_item_id UPDATE between
        // the library INSERT and the COUNT-derived bump, but did NOT gate
        // the downstream chain on the link result. If the link UPDATE
        // errors, matches 0 rows (entry tombstoned in the window), or is
        // skipped (non-string inserted.id), the original code fell
        // through to the COUNT/bump path. `Math.max(1, trueCount ?? 1)`
        // floors COUNT=0 to 1 → the route would write log_count=1 and
        // invalidate /library for an orphaned library row, permanently
        // breaking the R1 invariant `log_count == COUNT(entries linked)`.
        //
        // Fix: pass `{ count: 'exact' }` to the link UPDATE so PostgREST
        // returns the affected-row count, then gate bump + cache
        // invalidation + sketch enqueue (below) behind `linkConfirmed`.
        //
        // Rollback policy: do NOT delete the library row on link failure.
        //   - Fresh INSERT + link failure: the orphan library row keeps
        //     its DB-default `log_count = 0` (never bumped), consistent
        //     with reality. The next re-log via `/api/library/[id]/log-now`
        //     self-heals via COUNT-from-statement (architecture.md §3.5).
        //   - 23505-recovery + link failure: the row belongs to the
        //     winner, who has already linked their own entry. DELETE
        //     would orphan the winner's entry too. Same self-heal.
        //
        // Returns 200 either way — entry write is authoritative per
        // design-doc §10.3; library is enrichment-only. Sentry captures
        // the link failure for production observability.
        let linkConfirmed = false;
        if (libraryItemId && inserted) {
          // C1 — link the just-inserted food_entries row to the library row.
          // Without this link, COUNT(*) re-log derivation undercounts forever.
          // RLS already enforces user_id; the explicit predicate is defense-
          // in-depth. `{ count: 'exact' }` requests the affected-row count
          // so we can detect the (vanishingly rare) "entry tombstoned in
          // the window" case (linkCount === 0) and short-circuit before the
          // bump path mis-publishes log_count=1 on an orphan row.
          const insertedId = typeof inserted.id === 'string' ? inserted.id : null;
          if (insertedId) {
            const { error: linkError, count: linkCount } = (await supabase
              .from('food_entries')
              .update({ library_item_id: libraryItemId }, { count: 'exact' })
              .eq('id', insertedId)
              .eq('user_id', userId)) as {
              error: { code?: string; message?: string } | null;
              count: number | null;
            };
            linkConfirmed = !linkError && linkCount === 1;
            if (!linkConfirmed) {
              // Codex R2 C1-R2 — Sentry rejects null/undefined `error` and
              // drops the event entirely. When `linkError` is null (the
              // 0-row-match case), synthesise an Error so the operator
              // gets a stack trace + the `extra` payload.
              const reportError =
                linkError ??
                new Error(`entries-save link UPDATE affected ${linkCount ?? 0} rows (expected 1)`);
              Sentry.captureException(reportError, {
                tags: {
                  component: 'entries-save',
                  scope: linkError ? 'library_entry_link' : 'library_entry_link_zero_rows',
                  pg_code: linkError?.code,
                },
                extra: { userId, libraryItemId, insertedId, count: linkCount },
              });
            }
          }

          // Bump log_count via COUNT(*) — concurrency-tolerant pattern.
          // Mirrors the re-log path at lines ~450-509 + the log-now route's
          // pattern at lines ~511-549. food_entries is hard-deleted (no
          // deleted_at column), so the COUNT predicate does not need a
          // `deleted_at IS NULL` filter on entries.
          if (linkConfirmed) {
            try {
              const { count: trueCount, error: countError } = (await supabase
                .from('food_entries')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('library_item_id', libraryItemId)) as {
                count: number | null;
                error: { code?: string; message?: string } | null;
              };
              if (countError) {
                Sentry.captureException(countError, {
                  tags: {
                    component: 'entries-save',
                    scope: 'library_save_count',
                    pg_code: countError.code,
                  },
                  extra: { userId, libraryItemId },
                });
              } else {
                // Floor at 1 — the INSERT we just committed AND linked
                // (linkConfirmed === true) guarantees at least one row.
                const nextLogCount = Math.max(1, trueCount ?? 1);
                const { error: bumpError } = (await supabase
                  .from('food_library_items')
                  .update({
                    log_count: nextLogCount,
                    last_used_at: new Date().toISOString(),
                  })
                  .eq('id', libraryItemId)
                  .eq('user_id', userId)
                  .is('deleted_at', null)) as {
                  error: { code?: string; message?: string } | null;
                };
                if (bumpError) {
                  Sentry.captureException(bumpError, {
                    tags: {
                      component: 'entries-save',
                      scope: 'library_save_bump',
                      pg_code: bumpError.code,
                    },
                    extra: { userId, libraryItemId },
                  });
                } else {
                  // Cache invalidation lives at the bump-success boundary so
                  // the badge reflects the just-written count on next render.
                  revalidateTag(TAGS.userLibrary(userId), 'max');
                  revalidatePath('/library', 'page');
                }
              }
            } catch (bumpThrown) {
              Sentry.captureException(bumpThrown, {
                tags: { component: 'entries-save', scope: 'library_save_bump' },
                extra: { userId, libraryItemId },
              });
            }
          }
        }

        if (libError && libError.code !== '23505') {
          // Non-23505 errors are NOT the recovery path — preserve the
          // original swallow + Sentry contract (RLS denial, schema drift,
          // 5xx). Cache invalidation is NOT fired here because no library
          // row landed. (The bump-success branch above is the sole
          // owner of the success-path cache invalidate.)
          Sentry.captureException(libError, {
            tags: {
              component: 'entries-save',
              scope: 'library_insert',
              pg_code: libError.code,
            },
            extra: { userId, normalizedName: computedNormalized },
          });
        } else if (libRow && linkConfirmed) {
          // Bug 5 (library overhaul 2026-05-16) — fire sketch generation
          // out-of-band for save-to-library inserts that LANDED a new row
          // (libRow truthy). The 23505 recovery path does NOT enqueue
          // because the winning tab already did, and the sketch pipeline's
          // idempotency guards would short-circuit a duplicate enqueue
          // anyway.
          //
          // Codex Round 1 Critical #3 fix: fire for both `text` and `photo`
          // sources (text-only assumption was wrong — see save-route
          // history). Cache invalidation lives in the COUNT/bump-success
          // branch above and is NOT duplicated here.
          enqueueSketchGeneration({
            libraryItemId: libRow.id,
            userId,
            displayName: libRow.display_name,
            description: body.description ?? body.ai_reasoning ?? undefined,
            timezone: tz,
          });
        }
      } catch (libraryInsertError) {
        // Swallow — library is enrichment, entry already committed
        // (design-doc §10.3). Capture for production observability so
        // silent dedup-poisoning bugs surface in Sentry rather than
        // disappearing into the catch.
        if (!libraryQuotaExceeded) {
          Sentry.captureException(libraryInsertError, {
            tags: { component: 'entries-save', scope: 'library_insert' },
            extra: { userId, normalizedName: computedNormalized },
          });
        }
      }
    }
  }

  revalidateTag(TAGS.userEntries(userId, day), 'max');
  // Task 4.5 R1 Pass 2 C2: invalidate ALL canonical progress ranges
  // (24h/D/7d/30d/90d/1y) — previously only 3 of 6 emitted.
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ entry: inserted, libraryQuotaExceeded }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
