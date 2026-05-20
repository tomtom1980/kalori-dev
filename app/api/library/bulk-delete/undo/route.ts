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

  // F-CODEX-D-02 (Round 2) — restore name-conflict guard.
  //
  // Migration 0020 added a partial unique index on
  // `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL
  //  AND normalized_name IS NOT NULL`. Sequence: user deletes item A, creates
  // a new item B with the same `normalized_name` inside the 5s undo window,
  // then triggers UNDO on A. Without this guard the blind
  // `UPDATE ... SET deleted_at = NULL` hits Postgres `23505`, the route maps
  // it to a generic 500, and the client revert path swallows the error —
  // silent restore loss.
  //
  // Strategy:
  //   1. Read the `normalized_name` of every tombstoned row we are asked to
  //      restore (scoped to this user + matching client_ids + still
  //      tombstoned).
  //   2. Check whether any of those `normalized_name` values is already
  //      claimed by an active row for the same user.
  //   3. If any conflict exists, fail-fast with a structured 409 so the UI
  //      can prompt rename-and-merge. The batch is all-or-nothing — we do
  //      NOT half-restore (matches the bulk-delete sibling's atomic-batch
  //      semantics).
  //   4. If no conflict, fall through to the existing UPDATE path.
  const { data: tombstoneRows, error: tombstoneErr } = (await supabase
    .from('food_library_items')
    .select('client_id, normalized_name')
    .in('client_id', client_ids)
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)) as {
    data: Array<{ client_id: string; normalized_name: string | null }> | null;
    error: { message?: string } | null;
  };

  if (tombstoneErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Names worth conflict-checking — skip null `normalized_name` rows because
  // the partial unique index excludes them (predicate
  // `WHERE ... normalized_name IS NOT NULL`).
  const namesToProbe = Array.from(
    new Set(
      (tombstoneRows ?? [])
        .map((row) => row.normalized_name)
        .filter((n): n is string => n !== null && n.length > 0),
    ),
  );

  if (namesToProbe.length > 0) {
    const { data: activeConflicts, error: conflictErr } = (await supabase
      .from('food_library_items')
      .select('id, client_id, normalized_name')
      .eq('user_id', userId)
      .in('normalized_name', namesToProbe)
      .is('deleted_at', null)) as {
      data: Array<{ id: string; client_id: string; normalized_name: string }> | null;
      error: { message?: string } | null;
    };

    if (conflictErr) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    if (activeConflicts && activeConflicts.length > 0) {
      // Build one conflict entry per tombstoned client_id whose
      // normalized_name collides with an active row.
      const activeByName = new Map(activeConflicts.map((row) => [row.normalized_name, row]));
      const conflicts = (tombstoneRows ?? [])
        .filter(
          (row): row is { client_id: string; normalized_name: string } =>
            row.normalized_name !== null && activeByName.has(row.normalized_name),
        )
        .map((row) => ({
          client_id: row.client_id,
          normalized_name: row.normalized_name,
          existing_id: activeByName.get(row.normalized_name)!.id,
        }));

      return NextResponse.json({ error: 'restore_name_conflict', conflicts }, { status: 409 });
    }
  }

  // `not('deleted_at', 'is', null)` guards against a race where the row was
  // already swept. A post-sweep undo is a semantic no-op; returning the
  // restored_count based on the actual state change is correct.
  const { data, error } = (await supabase
    .from('food_library_items')
    .update({ deleted_at: null })
    .in('client_id', client_ids)
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .select('id')) as {
    data: Array<{ id: string }> | null;
    error: { code?: string; message?: string } | null;
  };

  if (error) {
    // F-CODEX-D-R2-02 (Round 3) — TOCTOU race close-out.
    //
    // The pre-flight probe above narrows the window but does NOT close it:
    // a concurrent INSERT can commit with the same `normalized_name`
    // between the probe and this UPDATE. Postgres surfaces the resulting
    // partial-unique-index violation as error code `23505`. Without this
    // catch the handler would return a generic `500 db_error` and clients
    // would see a silent restore loss.
    //
    // We reuse the same `409 restore_name_conflict` payload shape as the
    // pre-flight branch so callers don't need to differentiate sync-vs-race.
    // The conflicts list uses the tombstone rows we tried to restore;
    // `existing_id` is null because the racing INSERT's id is not known to
    // the handler in this path (only its normalized_name + the user_id
    // that produced the partial-unique-index collision).
    if (error.code === '23505') {
      const conflicts = (tombstoneRows ?? [])
        .filter(
          (row): row is { client_id: string; normalized_name: string } =>
            row.normalized_name !== null,
        )
        .map((row) => ({
          client_id: row.client_id,
          normalized_name: row.normalized_name,
          existing_id: null,
        }));
      return NextResponse.json({ error: 'restore_name_conflict', conflicts }, { status: 409 });
    }
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
