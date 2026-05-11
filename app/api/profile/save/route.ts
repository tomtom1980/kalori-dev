/**
 * `POST /api/profile/save` — profile upsert with Step 8 finalize.
 *
 * Task 2.1d shipped the minimum F12-canary-ready handler; Task 2.2
 * extends it with SERVER-SIDE derived-nutrition recompute on finalize.
 *
 * Two modes:
 *
 *   1. Per-step delta save (non-finalize). `patch.onboarding_completed_at`
 *      is absent. Upsert the patch onto `profiles` and return the
 *      merged row. Same behavior as Task 2.1d.
 *
 *   2. Finalize (Step 8). `patch.onboarding_completed_at` is present.
 *      The route validates the payload against the strict Step 8
 *      schema (every field required, `goal_pace` as proper enum),
 *      computes bmr / tdee / calorie_target authoritatively via
 *      `lib/nutrition/*`, and issues a SINGLE atomic update that
 *      carries the patch fields + derived fields + the completion
 *      timestamp together. If the update fails, nothing commits —
 *      `onboarding_completed_at` stays NULL and the user can retry.
 *
 *      Phase 2 Codex R1 F1 — NO PRE-READ. The earlier pre-read →
 *      merge → compute → update sequence had a race window between
 *      the SELECT and the UPDATE, during which a concurrent request
 *      could update `profiles` and leave the finalize committing
 *      derived values computed from stale state. Since Step 8 is
 *      reached only after Steps 1–7 have individually saved every
 *      input column AND the client re-sends all of them on Step 8,
 *      `Step8FinalizeSchema` on the client guarantees the payload
 *      carries every field the server needs. The server validates
 *      the payload directly and derives nutrition from it — no row
 *      snapshot needed, no race window.
 *
 *      Codex Round 1 (Task 2.2) HIGH atomicity fix is preserved:
 *      completion flag + derived fields land together or not at all.
 *
 * R1 defense-in-depth (Round 3 F1 hardening, PRESERVED verbatim):
 *   - Uses `supabase.auth.getUser()` — a network call that validates
 *     the access token against `/auth/v1/user`. NEVER `getSession()`
 *     (which only reads a locally-forgeable cookie). Extra roundtrip
 *     cost accepted for mutation correctness.
 *   - RLS enforces per-user scope via `auth.uid() = id`; the route
 *     does NOT use the admin/service-role client.
 *
 * Whitelisted columns: bio_sex, age, height_cm,
 * current_weight_kg, goal_weight_kg, activity_level, goal_pace,
 * region, unit_pref, timezone, target_mode, manual_override_value,
 * onboarding_completed_at, last_dashboard_visit_at. `.strict()` zod
 * catches unknown keys with 400.
 *
 * Codex R1 C-2 (Task 4.3b): `last_dashboard_visit_at` added to the
 * whitelist so the dashboard nudge's Dismiss handler can persist "user
 * acknowledged the target update" without needing a dedicated endpoint.
 * The column is user-owned (RLS `id = auth.uid()`), so exposing it via
 * the existing profile-save path is safe.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { calcBMR } from '@/lib/nutrition/mifflin-st-jeor';
import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { calcCalorieTarget } from '@/lib/nutrition/target';
import { calcTDEE } from '@/lib/nutrition/tdee';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  ACTIVITY_LEVEL_VALUES,
  BIO_SEX_VALUES,
  GOAL_PACE_VALUES,
  PACE_WEEKS,
} from '@/lib/validation/onboarding';

// Trigger defaults from `handle_new_user()` in migration 0002. If the
// `profiles` row is missing for an authenticated user (orphan from
// pre-trigger sign-in), the non-finalize path merges these defaults
// with the patch so all NOT NULL columns land on the INSERT and the
// 23502 null-violation that surfaced as a generic "Save failed" cannot
// recur.
const PROFILE_TRIGGER_DEFAULTS = {
  bio_sex: 'other' as const,
  age: 30,
  height_cm: 170,
  current_weight_kg: 70,
  activity_level: 'moderate' as const,
};

const PatchSchema = z
  .object({
    bio_sex: z.enum(['male', 'female', 'other']).optional(),
    age: z.number().int().min(13).max(120).optional(),
    height_cm: z.number().min(100).max(250).optional(),
    current_weight_kg: z.number().min(30).max(350).optional(),
    goal_weight_kg: z.number().min(30).max(350).optional(),
    activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
    goal_pace: z.enum(['slow', 'moderate', 'fast']).optional(),
    region: z.string().max(100).optional(),
    unit_pref: z.enum(['metric', 'imperial']).optional(),
    timezone: z.string().max(100).optional(),
    target_mode: z.enum(['auto', 'manual']).optional(),
    manual_override_value: z.number().min(0).max(10000).optional(),
    onboarding_completed_at: z.string().datetime().optional(),
    // Codex R1 C-2 (Task 4.3b) — nudge dismiss persistence.
    last_dashboard_visit_at: z.string().datetime().optional(),
  })
  .strict();

const BodySchema = z.object({
  client_id: z.string().min(1).max(100),
  patch: PatchSchema,
});

/**
 * Strict schema for the finalize payload. Every field is REQUIRED —
 * no silent defaults. `goal_pace` is a proper enum so an undefined or
 * unknown value fails closed with a descriptive 400.
 *
 * Phase 2 Codex R1 F1 — this schema is applied directly to the
 * validated request patch (no pre-read, no merge). The client ALWAYS
 * sends a complete Step 8 payload via `Step8FinalizeSchema`, so every
 * field is present when finalize reaches the server. Removing the
 * pre-read closes the read-compute-write race window.
 */
const FinalizeRequiredSchema = z.object({
  bio_sex: z.enum(BIO_SEX_VALUES),
  age: z.number().int().min(13).max(120),
  height_cm: z.number().min(100).max(250),
  current_weight_kg: z.number().min(30).max(350),
  goal_weight_kg: z.number().min(30).max(350),
  goal_pace: z.enum(GOAL_PACE_VALUES),
  activity_level: z.enum(ACTIVITY_LEVEL_VALUES),
  onboarding_completed_at: z.string().datetime(),
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
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const supabase = await getServerSupabase();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { patch } = parsed.data;

  // RLS codes shared by the upsert and update branches.
  const RLS_CODES = new Set(['42501', 'PGRST116']);
  const isRlsError = (err: unknown): boolean => {
    const code = (err as { code?: string } | null)?.code;
    return typeof code === 'string' && RLS_CODES.has(code);
  };

  // Non-finalize path — per-step delta save. Self-healing contract:
  // some auth.users rows predate migration 0002's `handle_new_user`
  // trigger, so their `profiles` row is missing. A bare
  // `upsert({id, ...patch})` degenerates to INSERT with partial
  // columns and fails NOT NULL (23502). To avoid that:
  //   - If the profile row is MISSING → INSERT with trigger defaults
  //     merged with the patch (patch wins) so every NOT NULL column
  //     lands.
  //   - If the profile row EXISTS → plain UPDATE (not UPSERT) so
  //     defaults never clobber user-entered column values.
  if (!patch.onboarding_completed_at) {
    const { data: existing, error: probeError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (probeError) {
      if (isRlsError(probeError)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const pgCode = (probeError as { code?: string }).code;
      Sentry.captureException(probeError, {
        tags: { component: 'profile-save' },
        extra: { operation: 'profile_save_probe', pg_code: pgCode },
      });
      return NextResponse.json({ error: 'db_error', pg_code: pgCode }, { status: 500 });
    }

    const { data: saved, error: writeError } = existing
      ? await supabase.from('profiles').update(patch).eq('id', userId).select().single()
      : await supabase
          .from('profiles')
          .insert({ id: userId, ...PROFILE_TRIGGER_DEFAULTS, ...patch })
          .select()
          .single();

    if (writeError) {
      if (isRlsError(writeError)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const pgCode = (writeError as { code?: string }).code;
      Sentry.captureException(writeError, {
        tags: { component: 'profile-save' },
        extra: {
          operation: 'profile_save_write',
          pg_code: pgCode,
          branch: existing ? 'update' : 'insert',
        },
      });
      return NextResponse.json({ error: 'db_error', pg_code: pgCode }, { status: 500 });
    }
    return NextResponse.json({ ok: true, profile: saved }, { status: 200 });
  }

  // Finalize path — Codex Round 1 HIGH atomicity contract +
  // Phase 2 Codex R1 F1 no-pre-read contract.
  //
  // 1. Validate the payload directly. `goal_pace` is a strict enum —
  //    an undefined or unknown value fails closed here, NOT via a
  //    silent default. Every field is required. The error payload
  //    names the offending fields so the client and logs can see why
  //    finalize was refused.
  const finalizeCheck = FinalizeRequiredSchema.safeParse({
    bio_sex: patch.bio_sex,
    age: patch.age,
    height_cm: patch.height_cm,
    current_weight_kg: patch.current_weight_kg,
    goal_weight_kg: patch.goal_weight_kg,
    goal_pace: patch.goal_pace,
    activity_level: patch.activity_level,
    onboarding_completed_at: patch.onboarding_completed_at,
  });
  if (!finalizeCheck.success) {
    const fields = finalizeCheck.error.issues.map((issue) => issue.path.join('.'));
    return NextResponse.json({ error: 'finalize_incomplete', fields }, { status: 400 });
  }

  const finalize = finalizeCheck.data;

  // 2. Compute derived nutrition authoritatively. Every value used
  //    here came through the schema validation above — no nullable
  //    paths, no defaults, no stale-row risk.
  const bmr = calcBMR(
    finalize.bio_sex,
    finalize.current_weight_kg,
    finalize.height_cm,
    finalize.age,
  );
  const tdee = calcTDEE(bmr, finalize.activity_level);
  const goalDeltaKg = finalize.goal_weight_kg - finalize.current_weight_kg;
  const paceWeeks = PACE_WEEKS[finalize.goal_pace];
  const target = calcCalorieTarget(tdee, goalDeltaKg, paceWeeks);

  // 3. Single atomic write. The completion flag and derived fields
  //    land together or not at all. If this fails, the profile row
  //    stays as-is (onboarding_completed_at remains NULL), so the
  //    user is redirected back to the wizard and can retry.
  //
  //    Use upsert (not update) so a finalize against a brand-new
  //    profile row still lands. Under normal flow Steps 1-7 have
  //    already upserted rows, but the server should not depend on
  //    that — the single write should be self-contained.
  const { data: finalRow, error: writeError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        ...patch,
        bmr,
        tdee,
        calorie_target: target,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  if (writeError) {
    if (isRlsError(writeError)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile: finalRow }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
