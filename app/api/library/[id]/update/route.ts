/**
 * `POST /api/library/[id]/update` — Task 4.2.
 *
 * Updates a single library item. `client_id` is the idempotency token
 * for this edit (per edit, one value). UPDATE is idempotent by construction:
 * re-applying the same fields yields the same result, and the F12 retry
 * re-sends identical bytes via `authPost` (I11 invariant).
 *
 * Contract:
 *   Request: {
 *     client_id: string (UUID),
 *     fields: {
 *       display_name?: string (1..120 after trim),
 *       default_portion?: number | null (positive or null),
 *       default_unit?: string | null (1..16 or null),
 *       nutrition?: { kcal, macros?, micros? } (partial),
 *       thumbnail_url?: string | null (valid URL or null),
 *     }
 *   }
 *   Response 200: { item: LibraryItem }
 *   400/401/404/500 per briefing.
 *
 * R1 note: clients MUST call via `authPost` from
 * `lib/auth/refresh-interceptor.ts`. Server-side returns 401 on no session
 * → interceptor triggers refresh + retry on the client.
 *
 * Cache invalidation: `revalidateTag(TAGS.userLibrary(uid), 'max')` on
 * success — no string literals per I12.
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { TAGS } from '@/lib/cache/tags';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';
import { isWholeStyleQuantity } from '@/lib/log/portion-unit';
import { signThumbnailUrl } from '@/lib/storage/sign-thumbnail';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Nutrition sub-schemas — Task 4.2 round 1 C2 fix.
//
// The server column is JSONB; a `.update({ nutrition: {...} })` call is a
// SHALLOW replacement (Supabase does not deep-merge). If the client sends
// a partial nutrition object (e.g. `{ macros: { protein_g: 42 } }`), every
// sibling macro + micros + kcal is silently nulled in the database.
//
// Round 1 contract: the CLIENT merges `initial.nutrition` with the diff
// locally and POSTs the full post-edit nutrition object. The server's
// Zod schema rejects any partial `macros` payload so a future client
// regression 400s instead of corrupting the row.
//
// `MacrosFull` requires all five macro keys when `nutrition.macros` is
// present. `NutritionFull` likewise requires kcal + macros when
// `nutrition` is present (micros remains optional — not every item has
// recorded micronutrients).
const MacrosFull = z
  .object({
    protein_g: z.number().finite().nonnegative(),
    carbs_g: z.number().finite().nonnegative(),
    fat_g: z.number().finite().nonnegative(),
    fiber_g: z.number().finite().nonnegative(),
    sugar_g: z.number().finite().nonnegative(),
    // Phase 2C + Codex R1 F2 — cholesterol_mg (unit: mg). Optional and
    // intentionally WITHOUT a default. `.default(0)` would re-materialise
    // a literal 0mg in the post-parse payload, defeating the
    // absence-vs-zero semantic the client's resolver now enforces.
    // Edits saved before cholesterol entered the form continue to
    // round-trip — the key simply stays absent on the wire and in the
    // JSONB write.
    cholesterol_mg: z.number().finite().nonnegative().optional(),
  })
  .strict();

// Bugfix R1 C3 (2026-05-17) — server-side upper bound on per-micro value.
// Bugfix R3 2026-05-17 — imported from shared module; see
// `lib/library/micros-bounds.ts` for the importer list across the 5
// mutation surfaces.

const MicrosPartial = z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE));

const NutritionFull = z
  .object({
    kcal: z.number().int().nonnegative(),
    macros: MacrosFull,
    micros: MicrosPartial.optional(),
    approxGrams: z.number().positive().finite().optional(),
  })
  .strict();

const FieldsSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120).optional(),
    default_portion: z.number().positive().nullable().optional(),
    default_unit: z.string().min(1).max(16).nullable().optional(),
    nutrition: NutritionFull.optional(),
    thumbnail_url: z.string().url().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field required',
  })
  .superRefine((fields, ctx) => {
    if (
      typeof fields.default_portion === 'number' &&
      fields.default_unit &&
      !isWholeStyleQuantity(fields.default_unit, fields.default_portion)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['default_portion'],
        message: 'default_portion must be a whole number for this unit',
      });
    }
  });

const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    fields: FieldsSchema,
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Validate the URL segment is a UUID (defense in depth — Next.js routing
  // has already matched `/library/[id]/update` but the id itself is
  // user-controlled; a non-UUID would hit the query layer and likely
  // surface as 500).
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

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/library/[id]/update' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { fields } = parsed.data;

  if (typeof fields.default_portion === 'number' && fields.default_unit === undefined) {
    const { data: currentPortionRow, error: currentPortionError } = (await supabase
      .from('food_library_items')
      .select('default_unit')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()) as {
      data: { default_unit: string | null } | null;
      error: { code?: string; message?: string } | null;
    };

    if (currentPortionError) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    if (!currentPortionRow) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (
      currentPortionRow.default_unit &&
      !isWholeStyleQuantity(currentPortionRow.default_unit, fields.default_portion)
    ) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          issues: [
            {
              code: 'custom',
              path: ['fields', 'default_portion'],
              message: 'default_portion must be a whole number for this unit',
            },
          ],
        },
        { status: 400 },
      );
    }
  }

  // Bugfix R1 C1 — signed URL persistence guard. A signed `http(s)://`
  // URL must never be written to the canonical `thumbnail_url` column
  // (which stores raw storage paths; signed URLs expire in 1 hour and
  // would silently break the row when the TTL elapses). The only
  // legitimate write values are `null` (clear thumbnail) or a raw
  // storage path. Reject signed URLs at the boundary with 400 so the
  // client surfaces a clear error instead of corrupting the row.
  if (typeof fields.thumbnail_url === 'string' && /^https?:\/\//i.test(fields.thumbnail_url)) {
    return NextResponse.json(
      {
        error: 'signed_url_not_writable',
        message: 'thumbnail_url must be null or a raw storage path; signed URLs are never written.',
      },
      { status: 400 },
    );
  }

  // Build the UPDATE patch. `last_edit_client_id` is NOT a column on
  // `food_library_items` (no migration in 4.2 per briefing §Idempotency
  // leanest path) — `client_id` acts as an audit token delivered by the
  // client and preserved by `authPost` across retries. The UPDATE itself
  // is idempotent (same bytes → same final row).
  const patch: Record<string, unknown> = { ...fields };
  // `user_edited_flag` flips true on any explicit edit (briefing-adjacent).
  patch.user_edited_flag = true;

  // E.CODEX Round 2 B-H1 — cholesterol_mg TOCTOU preserve-merge.
  //
  // Background: `Supabase.update({ nutrition: {...} })` is a SHALLOW JSONB
  // replacement. The current client (`useFoodDetailEdit`) sends a fully-
  // merged nutrition object and threads an absence discriminator through
  // `cholesterol_mg` (Codex R1 F2 — commit 037ffd4). However, a SECOND
  // device using a legacy build of the form may not render the
  // cholesterol input at all; that client's full-JSON nutrition payload
  // simply lacks the `cholesterol_mg` key. If it submits an unrelated
  // edit, the server's shallow JSONB replacement silently erases the
  // value Device A wrote.
  //
  // Fix: when `fields.nutrition.macros` is present AND lacks the
  // `cholesterol_mg` key, fetch the row's current
  // `nutrition.macros.cholesterol_mg` and inject it into the patch
  // before writing. Explicit values (number) and explicit clears (the
  // schema does not allow `null`, but absence-vs-presence is the
  // discriminator) from a cholesterol-aware client take precedence.
  //
  // Cost: one extra SELECT per edit that touches nutrition. The single-
  // user MVP can absorb the extra ~150–200ms RTT to Singapore Supabase
  // without UX impact.
  if (patch.nutrition && typeof patch.nutrition === 'object') {
    const incomingNutrition = patch.nutrition as {
      macros?: Record<string, unknown> | undefined;
    };
    const incomingMacros = incomingNutrition.macros;
    if (
      incomingMacros &&
      typeof incomingMacros === 'object' &&
      !Object.prototype.hasOwnProperty.call(incomingMacros, 'cholesterol_mg')
    ) {
      // Pre-write read: fetch the row's current cholesterol_mg ONLY.
      // Scoped by id + user_id + not-deleted so RLS + tombstone fence are
      // honored. `maybeSingle` so a missing/foreign row surfaces as
      // `data: null` rather than throwing.
      const { data: currentRow, error: readError } = await supabase
        .from('food_library_items')
        .select('nutrition')
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (readError) {
        return NextResponse.json({ error: 'db_error' }, { status: 500 });
      }
      // If the row doesn't exist the UPDATE below will surface 404 on
      // its own; we do not preserve anything in that case.
      const currentMacros = (
        currentRow?.nutrition as { macros?: { cholesterol_mg?: number | null } } | null | undefined
      )?.macros;
      if (
        currentMacros &&
        Object.prototype.hasOwnProperty.call(currentMacros, 'cholesterol_mg') &&
        typeof currentMacros.cholesterol_mg === 'number'
      ) {
        // Merge: rebuild macros with the preserved cholesterol_mg appended.
        const mergedMacros: Record<string, unknown> = {
          ...incomingMacros,
          cholesterol_mg: currentMacros.cholesterol_mg,
        };
        patch.nutrition = { ...incomingNutrition, macros: mergedMacros };
      }
      // Else (DB also has no cholesterol_mg): nothing to preserve — the
      // key stays absent on the wire AND on the JSONB write, matching
      // client-side preserveAbsence semantics from `useFoodDetailEdit`.
    }
  }

  // Bug 3 (library overhaul 2026-05-16) — SELECT column list includes
  // `thumbnail_kind` for parity with `fetch.ts` / `getItem.ts` so the
  // post-edit client state preserves the photo/sketch discriminator.
  const { data, error } = await supabase
    .from('food_library_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select(
      'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, thumbnail_kind, log_count, last_used_at, user_edited_flag, created_from, created_at',
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!data) {
    // Either the row doesn't exist, is tombstoned, or is owned by someone
    // else (RLS) — all three surface as 404 to avoid leaking existence.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Bugfix R1 I1 — cache invalidation must run IMMEDIATELY after the
  // DB write, BEFORE thumbnail signing. The DB write is the
  // authoritative mutation; signing is a best-effort display-URL
  // resolve. Previously, a slow/stalled `signThumbnailUrl` could delay
  // the response, and if signing threw the throw bubbled through
  // `revalidateTag` — meaning cache stayed stale despite a successful
  // row update. Reorder: invalidate first, then sign with throw
  // protection.
  revalidateTag(TAGS.userLibrary(userId), 'max');

  // Bug 3 (library overhaul 2026-05-16) — sign-on-write. The database
  // column stores a raw storage path (e.g. `{uid}/sketch_{client_id}.webp`)
  // per the path-vs-URL contract from `architecture.md §4.2`. Sign it
  // here with the same 1-hour TTL as the read paths in `fetch.ts` and
  // `getItem.ts` so the client's optimistic UI / committed item receives
  // a URL `next/image` can validate against `remotePatterns`. The helper
  // returns `null` on signing failure (graceful → letter-mark fallback)
  // and is a no-op for null inputs.
  //
  // The photo-vs-sketch rule lives upstream in the sketch pipeline (a
  // `thumbnail_kind = 'photo'` row skips sketch generation per
  // `backfill/route.ts`). At this layer we sign whatever path is stored
  // and trust the schema — no per-kind branching needed.
  //
  // Bugfix R1 I1 — wrap signing in try/catch so a throw degrades to
  // null (letter-mark) rather than failing the mutation response.
  // `signThumbnailUrl` already swallows storage errors internally, but
  // defense in depth covers transient throws (mock failures, unwrapped
  // network errors).
  let signedThumbnail: string | null = null;
  try {
    signedThumbnail = await signThumbnailUrl(data.thumbnail_url, supabase);
  } catch {
    signedThumbnail = null;
  }
  const item = { ...data, thumbnail_url: signedThumbnail };

  return NextResponse.json({ item }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
