/**
 * `POST /api/library/bulk-delete` — Task 4.1 sub-step 2.
 *
 * Soft-deletes (tombstones) up to 100 library items owned by the caller.
 * The 5s-undoable pattern is completed by `POST /api/library/bulk-delete/undo`
 * (which NULLs `deleted_at`) and `lib/library/fetch.ts` lazy sweep (which
 * hard-deletes past the 5s window).
 *
 * Contract (reconciled spec §9.1):
 *   Request:  { ids: string[] (1..100), delete_client_ids: string[] }
 *             (both arrays same length — one `client_id` per tombstone event;
 *             renamed from briefing's `client_ids` to avoid collision with
 *             undo route's `client_ids` which reference row creation keys)
 *   Response: { deleted_count: number, replayed?: boolean }
 *             replayed=true when returned-count < requested-count AND the
 *             remainder are already tombstoned (re-POSTing the same ids is a
 *             no-op, for I11-style idempotency under interceptor retry).
 *
 * R1 note: client caller MUST route through `authPost` from
 * `lib/auth/refresh-interceptor.ts`. Server side does not enforce.
 *
 * Cache invalidation: `revalidateTag(TAGS.userLibrary(uid))` on success.
 * No `user_entries` tag invalidation — FK is ON DELETE SET NULL, so historical
 * entries retain their `library_item_id` reference until the row is actually
 * DELETEd on sweep (at which point nothing else needs invalidation — entries
 * cache-tag is scoped to entry state, not library JOIN state).
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
    ids: z.array(z.string().uuid()).min(1).max(100),
    delete_client_ids: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
  .refine((v) => v.ids.length === v.delete_client_ids.length, {
    message: 'ids and delete_client_ids must be the same length',
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
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/library/bulk-delete' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { ids } = parsed.data;

  // Idempotent tombstone write. `deleted_at IS NULL` filter excludes
  // already-tombstoned rows so the returned row set tells us the real effect:
  // requested-count - returned-count = already-tombstoned count.
  const nowIso = new Date().toISOString();
  const { data, error } = (await supabase
    .from('food_library_items')
    .update({ deleted_at: nowIso })
    .in('id', ids)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')) as { data: Array<{ id: string }> | null; error: { message?: string } | null };

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const deletedCount = data?.length ?? 0;

  revalidateTag(TAGS.userLibrary(userId), 'max');

  // Replay detection: zero rows updated for a non-zero request = all were
  // already tombstoned (or no rows matched ownership — same externally-visible
  // behavior: no state change).
  if (deletedCount === 0 && ids.length > 0) {
    return NextResponse.json({ deleted_count: 0, replayed: true }, { status: 200 });
  }

  return NextResponse.json({ deleted_count: deletedCount }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
