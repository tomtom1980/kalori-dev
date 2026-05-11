/**
 * `POST /api/weight/log` — Task 4.3b weight log + auto-recalc pipeline.
 *
 * Contract (briefing §"Route Contract"):
 *   1. Zod-strict body {client_id, date, weight_kg, note?}.
 *   2. Auth guard via `getServerSupabase().auth.getUser()`.
 *   3. 30-day backfill server guard (I8).
 *   4. I11 idempotency: pre-insert SELECT by (user_id, client_id); if present,
 *      return 200 + existing row + replayed:true — AND do NOT re-fire the
 *      recalc branch. The first POST already persisted the recalc; the
 *      retry's purpose is just to tell the client "you're safe", not to
 *      double-write profiles. Codex R1 C-1 ALSO forbids re-invalidating
 *      cache tags on replay — downstream readers must not thrash on retry.
 *   5. INSERT weight_log row (RLS with check gate).
 *   6. Load profiles row; compute `recalcTargetIfNeeded`; if
 *      `shouldPersistRecalc('auto', result)` → UPDATE profiles + include
 *      `recalc` block in response. Codex R1 C-4: the profile update's
 *      error field MUST be captured. If the DB rejects the UPDATE, the
 *      route returns 500 + NO recalc block + NO tag invalidation — the
 *      client cannot be told "target updated" when nothing persisted.
 *   7. `revalidateTag(TAGS.profile(uid))` + `TAGS.userProgress(uid, range)`
 *      for every range in the union (defensive — cache reads key off range).
 *
 * Weight range `[30, 350]` is authoritative per briefing §Route Contract
 * line 63 AND the `weight_log` table CHECK constraint in architecture.md
 * §2.5 (`weight_kg between 30 and 350`). Codex R1 I-1 flagged the
 * `[20, 500]` prompt range; the prompt was stale, the code + DDL match.
 *
 * Cache-tag range union is `24h | D | 7d | 30d | 90d | 1y` per
 * `lib/cache/tags.ts:34`. Codex R1 I-2 flagged `D/W/M/Q/Y/A`; the prompt
 * was stale, the code matches the canonical constants file.
 *
 * R1 contract: the browser caller MUST route through `authPost` from
 * `lib/auth/refresh-interceptor.ts`. Server side does not enforce; the
 * integration test + grep check does.
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import {
  recalcTargetIfNeeded,
  shouldPersistRecalc,
  type RecalcProfileInput,
  type TargetMode,
} from '@/lib/nutrition/recalc';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    // Range authoritative per briefing §Route Contract line 63 + DDL
    // CHECK (`weight_kg between 30 and 350`) in architecture.md §2.5.
    weight_kg: z.number().min(30).max(350),
    note: z.string().max(500).trim().optional(),
  })
  .strict();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function invalidateProfileAndProgress(revalidate: (tag: string) => void, userId: string) {
  revalidate(TAGS.profile(userId));
  // Progress page range caches see weight-dependent aggregates. Briefing §
  // Route Contract #9 says emit across active ranges (defensive). The
  // canonical union in `lib/cache/tags.ts` is `'24h' | 'D' | '7d' | '30d'
  // | '90d' | '1y'` — we emit the full set so whichever range key the
  // Progress page reader is on today, the cache invalidates.
  revalidate(TAGS.userProgress(userId, '24h'));
  revalidate(TAGS.userProgress(userId, 'D'));
  revalidate(TAGS.userProgress(userId, '7d'));
  revalidate(TAGS.userProgress(userId, '30d'));
  revalidate(TAGS.userProgress(userId, '90d'));
  revalidate(TAGS.userProgress(userId, '1y'));
  // Day bucket for the weight entry — dashboard aggregator surfaces the
  // weight log row alongside food entries.
  revalidate(TAGS.userEntries(userId, new Date().toISOString().slice(0, 10)));
}

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

  const body = parsed.data;

  // I8 — 30-day backfill server guard. Accept dates within the last 30 days
  // (inclusive) up to and including today. Future dates rejected to match
  // the client-side `<input type="date" max={today}>` guard.
  const dateMs = Date.parse(body.date + 'T00:00:00Z');
  const nowMs = Date.now();
  if (!Number.isFinite(dateMs)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (dateMs > nowMs + 60 * 60 * 1000) {
    // Allow ~1h skew for timezone edge but reject clearly-future.
    return NextResponse.json({ error: 'date_in_future' }, { status: 400 });
  }
  if (dateMs < nowMs - THIRTY_DAYS_MS - 60 * 60 * 1000) {
    return NextResponse.json({ error: 'date_too_old' }, { status: 400 });
  }

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/weight/log' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  // I11 — pre-insert SELECT by (user_id, client_id). Replay path: return
  // existing row + replayed:true WITHOUT re-firing recalc (that already
  // happened on the original POST).
  const { data: existing } = (await supabase
    .from('weight_log')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', body.client_id)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  if (existing) {
    // Codex R1 C-1: replay MUST NOT re-invalidate cache tags. The original
    // POST already invalidated them; a retry just tells the client
    // "you're safe" — it does not re-run persistence, so there's nothing
    // downstream readers would learn by re-invalidating.
    return NextResponse.json({ row: existing, replayed: true }, { status: 200 });
  }

  // Fresh insert.
  const { data: inserted, error: insertErr } = (await supabase
    .from('weight_log')
    .insert({
      user_id: userId,
      client_id: body.client_id,
      date: body.date,
      weight_kg: body.weight_kg,
      note: body.note ?? null,
    })
    .select()
    .single()) as {
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string } | null;
  };

  if (insertErr) {
    // 23505 — concurrent-race replay. Re-SELECT + treat as replay (NO recalc
    // re-fire — original race winner already did the work).
    if (insertErr.code === '23505') {
      const { data: raceRow } = (await supabase
        .from('weight_log')
        .select('*')
        .eq('user_id', userId)
        .eq('client_id', body.client_id)
        .maybeSingle()) as { data: Record<string, unknown> | null };
      if (raceRow) {
        // Codex R1 C-1: race-replay path also MUST NOT re-invalidate.
        return NextResponse.json({ row: raceRow, replayed: true }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Recalc pipeline — load profile + decide via pure helper.
  const { data: profileRow, error: profileErr } = (await supabase
    .from('profiles')
    .select(
      'target_mode, current_weight_kg, recalc_threshold_pct, bio_sex, age, height_cm, activity_level, goal_weight_kg, goal_pace',
    )
    .eq('id', userId)
    .maybeSingle()) as {
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string } | null;
  };

  let recalcBlock: { newBmr: number; newTdee: number; newTarget: number } | undefined;

  if (!profileErr && profileRow) {
    const profile: RecalcProfileInput = {
      bio_sex: profileRow.bio_sex as RecalcProfileInput['bio_sex'],
      age: Number(profileRow.age),
      height_cm: Number(profileRow.height_cm),
      current_weight_kg:
        profileRow.current_weight_kg === null ? null : Number(profileRow.current_weight_kg),
      activity_level: profileRow.activity_level as RecalcProfileInput['activity_level'],
      goal_weight_kg: profileRow.goal_weight_kg === null ? null : Number(profileRow.goal_weight_kg),
      goal_pace: (profileRow.goal_pace as RecalcProfileInput['goal_pace']) ?? null,
    };
    const thresholdPct = Number(profileRow.recalc_threshold_pct ?? 2.0);
    const mode = (profileRow.target_mode as TargetMode) ?? 'auto';

    const result = recalcTargetIfNeeded({
      profile,
      newWeightKg: body.weight_kg,
      thresholdPct,
    });

    if (
      shouldPersistRecalc(mode, result) &&
      result.newBmr !== undefined &&
      result.newTdee !== undefined &&
      result.newTarget !== undefined
    ) {
      // Codex R1 C-4: the profile update's `{ error }` MUST be checked.
      // If the DB rejects (RLS, network, CHECK violation), the route
      // cannot return `recalc` — the client would see "target updated"
      // while the DB row is stale. Return 5xx + omit recalc; skip cache
      // invalidation since nothing persisted downstream readers would
      // want refreshed.
      const { error: profileUpdateErr } = (await supabase
        .from('profiles')
        .update({
          current_weight_kg: body.weight_kg,
          bmr: result.newBmr,
          tdee: result.newTdee,
          calorie_target: result.newTarget,
          last_target_recalc_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)) as { error: { code?: string; message?: string } | null };

      if (profileUpdateErr) {
        return NextResponse.json(
          { error: 'profile_update_failed', pg_code: profileUpdateErr.code ?? null },
          { status: 500 },
        );
      }
      recalcBlock = {
        newBmr: result.newBmr,
        newTdee: result.newTdee,
        newTarget: result.newTarget,
      };
    }
  }

  invalidateProfileAndProgress((tag) => revalidateTag(tag, 'max'), userId);

  return NextResponse.json(
    { row: inserted, ...(recalcBlock ? { recalc: recalcBlock } : {}) },
    { status: 200 },
  );
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
