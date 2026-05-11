/**
 * `POST /api/library/[id]/delete` — Task 4.2 tombstone route.
 *
 * Soft-deletes a single `food_library_items` row by stamping
 * `deleted_at = now()`. NO hard DELETE (briefing §Delete semantics LOCKED).
 * Physical removal is owned by `lib/library/fetch.ts` lazy sweep (Task 4.1);
 * FK `SET NULL` on `food_entries.library_item_id` fires at sweep time.
 *
 * Contract:
 *   Request:  { delete_client_id: string (UUID) }
 *   Response 200 (first tombstone): { item: { id, deleted_at } }
 *   Response 200 (replay / already tombstoned): { item: null, replayed: true }
 *
 * Idempotency: the `.is('deleted_at', null)` filter on the UPDATE is the
 * "stamp exactly once" guard. A retry (F12) lands on a row that is already
 * tombstoned → UPDATE matches 0 rows → response `{ item: null, replayed: true }`.
 * This covers both the I11 retry case AND legitimate user re-clicks.
 *
 * R1: clients MUST call via `authPost`. Server returns 401 on no session.
 *
 * Cache invalidation: `TAGS.userLibrary(uid)` on success (first tombstone
 * OR replay — identical externally, both invalidate the cached list).
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    delete_client_id: z.string().uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

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
  const fenced = await requireProfileOrJson401({ route: '/api/library/[id]/delete' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('food_library_items')
    .update({ deleted_at: nowIso })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  revalidateTag(TAGS.userLibrary(userId), 'max');

  if (!data) {
    // Either already tombstoned (replay) OR doesn't exist / not owned.
    // Return the replay-shape in both cases; the client's optimistic
    // removal already covers the UI behavior.
    return NextResponse.json({ item: null, replayed: true }, { status: 200 });
  }

  return NextResponse.json({ item: { id: data.id, deleted_at: data.deleted_at } }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
