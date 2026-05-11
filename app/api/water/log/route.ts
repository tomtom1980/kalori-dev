/**
 * `POST /api/water/log` — Task 3.5 water-log idempotent writer.
 *
 * Contract (architecture §5 + briefing §6.1):
 *   - Zod-strict body { client_id (UUID), unit, count, logged_on }.
 *   - Auth guard via `getServerSupabase().auth.getUser()`.
 *   - I11 idempotency: pre-insert SELECT by (user_id, client_id). If
 *     present, return 200 + existing row + `replayed: true`. Else INSERT;
 *     on 23505 race, re-SELECT + treat as replay.
 *   - I12 cache-tag: `revalidateTag(TAGS.userEntries(uid, logged_on))`
 *     fires on every success path (fresh + replay). Water reuses
 *     userEntries tag per synthesis §7 — no TAGS.userWater factory.
 *
 * Wire format: client sends semantic payload `{ unit: 'glass'|'bottle'|'ml',
 * count: 1 }` rather than raw ml. Readers convert to ml via
 * `mlFromWaterRow` in `lib/dashboard/types.ts`. This matches the
 * `water_log.count + water_log.unit` columns in migration 0003.
 *
 * R1 contract: the client caller MUST route through `authPost<T>` from
 * `lib/auth/refresh-interceptor.ts`. Server side does not enforce — the
 * R1 grep check + integration tests do.
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import { MAX_DAILY_WATER_ML } from '@/lib/dashboard/types';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — split per-row
// `count` cap by `unit`. The original schema cap (`max(200)`) was
// pre-Bug-2: when the wire format only carried whole `glass` (250 ml) or
// whole `bottle` (500 ml) units, 200 was already excessive. Bug-2's
// custom-amount EDIT surface POSTs `{ unit: 'ml', count: <delta> }`
// where the delta can be up to 5000 (the full daily allowance landing
// in one POST). For `unit: 'glass' | 'bottle'` the cap stays at 200 —
// no rationale to lift it. We use `discriminatedUnion` so the type
// system narrows on `unit` and each branch carries its own cap. The
// daily-total cap (5 L) is still enforced at the aggregate layer
// below.
const BaseFields = {
  client_id: z.string().uuid(),
  logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};
const BodySchema = z.discriminatedUnion('unit', [
  z
    .object({
      ...BaseFields,
      unit: z.literal('glass'),
      count: z.number().int().positive().max(200),
    })
    .strict(),
  z
    .object({
      ...BaseFields,
      unit: z.literal('bottle'),
      count: z.number().int().positive().max(200),
    })
    .strict(),
  z
    .object({
      ...BaseFields,
      unit: z.literal('ml'),
      count: z
        .number()
        .int()
        .min(-5000)
        .max(5000)
        .refine((value) => value !== 0),
    })
    .strict(),
]);

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
  const fenced = await requireProfileOrJson401({ route: '/api/water/log' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;

  // Codex Round 1 C1 + C2 (bugfix-tomi 2026-05-09-water-custom-button) —
  // single atomic RPC replaces the prior SUM-then-insert flow. The RPC
  // (`public.log_water_with_cap`, migration 0018) performs the
  // following inside a per-(user, date) advisory lock:
  //   1. I11 pre-insert SELECT by (user_id, client_id) — replay
  //      returns the existing row + replayed=true WITHOUT re-evaluating
  //      the cap (replays add no new ml).
  //   2. Pre-write SUM — daily total in ml, derived per-unit
  //      (Postgres mirror of `mlFromWaterRow`).
  //   3. Cap check — if (current + incoming) > 5000 ml, raises P0010
  //      'over_daily_limit'. Mapped to HTTP 409 below with the contract
  //      body { error, currentTotalMl, limitMl }.
  //   4. INSERT — on 23505 (concurrent same-client_id race) re-SELECT
  //      the racing row and return as a replay (same semantics as the
  //      prior route's 23505 handler).
  //   5. Post-write SUM — authoritative `total_ml` returned to the
  //      client without a second round-trip.
  //
  // C1 (fail-open on totals SELECT error): the cap evaluation now
  // lives INSIDE the transaction. Any DB read failure raises out of
  // the RPC into `rpcError` and we return 500 — there is no `?? 0`
  // fallback any more.
  //
  // C2 (SUM-then-insert not atomic): the advisory lock serializes
  // concurrent posts on the same user-day, so chip + FAB cannot both
  // pass a stale local cap check at current=4500 and overflow to
  // 5300 ml.
  type RpcResponse = {
    row: Record<string, unknown>;
    replayed: boolean;
    total_ml: number;
  };
  type RpcError = { code?: string; message?: string; details?: string | null };
  const { data: rpcData, error: rpcError } = (await supabase.rpc('log_water_with_cap', {
    p_client_id: body.client_id,
    p_date: body.logged_on,
    p_count: body.count,
    p_unit: body.unit,
  })) as { data: RpcResponse | null; error: RpcError | null };

  if (rpcError) {
    const msg = rpcError.message ?? '';
    // P0010 — cap reject. The RPC raises with `detail` set to the
    // current pre-write total so we can echo it in the 409 body.
    if (rpcError.code === 'P0010' || msg.includes('over_daily_limit')) {
      const currentTotalMl = Number.parseInt(rpcError.details ?? '0', 10);
      return NextResponse.json(
        {
          error: 'OVER_DAILY_LIMIT',
          currentTotalMl: Number.isFinite(currentTotalMl) ? currentTotalMl : 0,
          limitMl: MAX_DAILY_WATER_ML,
        },
        { status: 409 },
      );
    }
    if (rpcError.code === 'P0013' || msg.includes('under_daily_limit')) {
      const currentTotalMl = Number.parseInt(rpcError.details ?? '0', 10);
      return NextResponse.json(
        {
          error: 'UNDER_DAILY_LIMIT',
          currentTotalMl: Number.isFinite(currentTotalMl) ? currentTotalMl : 0,
          limitMl: 0,
        },
        { status: 409 },
      );
    }
    // Any other DB error — including the C1 case where the cap-check
    // SELECT itself errored — surfaces as 500 (fail closed).
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!rpcData) {
    return NextResponse.json({ error: 'empty_rpc_result' }, { status: 500 });
  }

  // Cache-tag invalidation fires on every success path (fresh insert
  // AND replay) per the I12 contract. Water reuses userEntries tag
  // (synthesis §7) — no TAGS.userWater factory.
  revalidateTag(TAGS.userEntries(userId, body.logged_on), 'max');

  const responseBody: Record<string, unknown> = {
    row: rpcData.row,
    totalMl: rpcData.total_ml,
  };
  if (rpcData.replayed) {
    responseBody.replayed = true;
  }
  return NextResponse.json(responseBody, { status: 200 });
}

/**
 * R3-C2-prime (bugfix-tomi 2026-05-09-water-fab-ux Codex round 3, Option B)
 * was implemented inline as a separate post-write SELECT. As of bugfix-tomi
 * 2026-05-09-water-custom-button Codex Round 1 C1+C2 fix, the
 * authoritative `total_ml` is now returned by the
 * `public.log_water_with_cap` RPC (migration 0018) so that the cap
 * evaluation, the INSERT, and the post-write aggregation all share the
 * same atomic transaction. The previous `computeDayTotalMl` helper was
 * removed because:
 *   - It returned `null` on aggregation error and the route coerced
 *     that to 0 for the cap input — exactly the C1 fail-open path.
 *   - The RPC now performs the post-write SUM in PL/pgSQL, so the
 *     route no longer needs a second JS-side aggregation pass.
 */

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
