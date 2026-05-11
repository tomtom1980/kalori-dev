/**
 * `POST /api/library/bulk-delete/undo` — Task 4.1 sub-step 2.
 *
 * Restores tombstoned library items within the 5s grace window by clearing
 * their `deleted_at` column back to NULL. Past the 5s window the lazy sweep
 * in `lib/library/fetch.ts` has already hard-deleted the row — undo becomes a
 * no-op (0 rows updated).
 *
 * Contract (reconciled spec §9.2):
 *   Request:  { client_ids: string[] (1..100) }  — ORIGINAL food_library_items
 *             row-creation keys (NOT the delete-event `delete_client_ids`
 *             used by bulk-delete; undo keys by row identity, not by
 *             deletion-event identity).
 *   Response: { restored_count: number, replayed?: boolean }
 *             replayed=true when zero rows matched (already restored, or
 *             already swept) — matches bulk-delete idempotency shape.
 *
 * R1 note: client caller MUST route through `authPost` from
 * `lib/auth/refresh-interceptor.ts`.
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
    // `client_ids` (not `delete_client_ids`) — these are the ORIGINAL row
    // creation keys from `food_library_items.client_id`, not the delete-event
    // UUIDs produced by bulk-delete. See reconciled spec §18.7 for the
    // rationale for the asymmetric naming.
    client_ids: z.array(z.string().uuid()).min(1).max(100),
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
  const fenced = await requireProfileOrJson401({ route: '/api/library/bulk-delete/undo' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { client_ids } = parsed.data;

  // `not('deleted_at', 'is', null)` guards against a race where the row was
  // already swept. A post-sweep undo is a semantic no-op; returning the
  // restored_count based on the actual state change is correct.
  const { data, error } = (await supabase
    .from('food_library_items')
    .update({ deleted_at: null })
    .in('client_id', client_ids)
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .select('id')) as { data: Array<{ id: string }> | null; error: { message?: string } | null };

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const restoredCount = data?.length ?? 0;

  revalidateTag(TAGS.userLibrary(userId), 'max');

  if (restoredCount === 0 && client_ids.length > 0) {
    return NextResponse.json({ restored_count: 0, replayed: true }, { status: 200 });
  }

  return NextResponse.json({ restored_count: restoredCount }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
