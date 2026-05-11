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
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';

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

  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: string } | null };
  const tz = profile?.timezone ?? 'UTC';
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
  const { data: row } = (await supabase
    .from('food_entries')
    .select('id, logged_at')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()) as { data: { id: string; logged_at: string } | null };

  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Resolve user-TZ day via profiles.timezone.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: string } | null };
  const tz = profile?.timezone ?? 'UTC';
  const dayDeleted = userTzDayFrom(row.logged_at, tz);

  const { error: deleteError } = await supabase
    .from('food_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  revalidateTag(TAGS.userEntries(userId, dayDeleted), 'max');
  // Task 4.5 R2 S3: invalidate ALL 6 canonical progress range tags via the
  // shared helper. Pre-fix only 3 (24h/7d/30d) emitted, leaving D/90d/1y stale.
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ ok: true, deletedRowId: id, dayDeleted }, { status: 200 });
}
