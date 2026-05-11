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
  })
  .strict();

const MicrosPartial = z.record(z.string(), z.number().finite().nonnegative());

const NutritionFull = z
  .object({
    kcal: z.number().int().nonnegative(),
    macros: MacrosFull,
    micros: MicrosPartial.optional(),
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

  // Build the UPDATE patch. `last_edit_client_id` is NOT a column on
  // `food_library_items` (no migration in 4.2 per briefing §Idempotency
  // leanest path) — `client_id` acts as an audit token delivered by the
  // client and preserved by `authPost` across retries. The UPDATE itself
  // is idempotent (same bytes → same final row).
  const patch: Record<string, unknown> = { ...fields };
  // `user_edited_flag` flips true on any explicit edit (briefing-adjacent).
  patch.user_edited_flag = true;

  const { data, error } = await supabase
    .from('food_library_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select(
      'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at',
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

  revalidateTag(TAGS.userLibrary(userId), 'max');

  return NextResponse.json({ item: data }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
