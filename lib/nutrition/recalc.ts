/**
 * `lib/nutrition/recalc.ts` — pure auto-recalc evaluator for Task 4.3b.
 *
 * Composes the Task 2.1 primitives `calcBMR` / `calcTDEE` / `calcCalorieTarget`
 * to answer one question: "Given a user's profile and a new weight, should
 * the calorie target be recomputed, and if so, what are the new numbers?"
 *
 * Purity contract (I5 / R1):
 *   - NO fetch, NO network IO, NO Supabase client, NO DOM, NO globals.
 *   - Deterministic: identical inputs → identical outputs.
 *   - `lib/nutrition/{mifflin-st-jeor, tdee, target}.ts` are consumed (not
 *     re-implemented) to keep the BMR/TDEE/target math single-source.
 *
 * Decision rules (briefing §"Example Auto-Recalc Trigger Math" + §13):
 *   1. If `current_weight_kg` is null-ish (first-ever entry), didRecalc=true.
 *   2. If `newWeightKg === current_weight_kg` exactly (zero delta), didRecalc=false.
 *   3. Else compute `deltaPct = |new − current| / current * 100`. If
 *      `deltaPct >= thresholdPct` (inclusive), didRecalc=true.
 *   4. `thresholdPct === 0` → any non-zero delta triggers recalc.
 *
 * Persistence filter (`shouldPersistRecalc`):
 *   - `target_mode === 'auto'` AND `didRecalc === true` → persist.
 *   - Any other combination (manual mode, or no recalc needed) → do not
 *     persist. This is the load-bearing F9-nudge gate — the route handler
 *     wraps its UPDATE in this guard.
 *
 * Idempotency key (`buildRecalcIdempotencyKey`):
 *   - Deterministic fingerprint keyed on `(userId, clientId, newWeightKg)` so
 *     a replayed POST (I11) with the same bytes yields the same key. The
 *     route handler uses this to log + guard against double-recalc.
 */

import { calcBMR, type BioSex } from '@/lib/nutrition/mifflin-st-jeor';
import { calcTDEE, type ActivityLevel } from '@/lib/nutrition/tdee';
import { calcCalorieTarget } from '@/lib/nutrition/target';
import { PACE_WEEKS, type GoalPace } from '@/lib/validation/onboarding';

export type TargetMode = 'auto' | 'manual';

export interface RecalcProfileInput {
  bio_sex: BioSex;
  age: number;
  height_cm: number;
  current_weight_kg: number | null;
  activity_level: ActivityLevel;
  goal_weight_kg: number | null;
  goal_pace: GoalPace | null;
}

export interface RecalcParams {
  profile: RecalcProfileInput;
  newWeightKg: number;
  thresholdPct: number;
}

export interface RecalcResult {
  didRecalc: boolean;
  newBmr?: number | undefined;
  newTdee?: number | undefined;
  newTarget?: number | undefined;
  /**
   * Percentage delta between `current_weight_kg` and `newWeightKg`. Returned
   * for observability/telemetry; NOT used as a gate by downstream code.
   */
  deltaPct?: number | undefined;
}

/**
 * Pure recalc evaluator. Never reads `target_mode` — that's the route
 * handler's responsibility via `shouldPersistRecalc`.
 */
export function recalcTargetIfNeeded(params: RecalcParams): RecalcResult {
  const { profile, newWeightKg, thresholdPct } = params;
  const current = profile.current_weight_kg;

  // Rule 1 — first-ever entry establishes baseline, fire recalc.
  if (current === null || current === undefined || !Number.isFinite(current)) {
    return finaliseRecalc(profile, newWeightKg, undefined);
  }

  const delta = newWeightKg - current;

  // Rule 2 — exact zero delta: no recalc, regardless of threshold.
  if (delta === 0) {
    return { didRecalc: false, deltaPct: 0 };
  }

  // Rule 3/4 — compare percentage delta to threshold.
  const deltaPct = current === 0 ? Infinity : (Math.abs(delta) / current) * 100;

  // Threshold behaviour: 0 means "any non-zero delta triggers recalc". The
  // `>=` comparison makes the threshold inclusive (at-or-above), which
  // matches the briefing's 2.14% > 2.0% example math.
  if (deltaPct >= thresholdPct) {
    return finaliseRecalc(profile, newWeightKg, deltaPct);
  }

  return { didRecalc: false, deltaPct };
}

/**
 * Combines mode + recalc result into the "should we write?" boolean. Route
 * handler uses this as the last gate before the UPDATE.
 */
export function shouldPersistRecalc(mode: TargetMode, result: RecalcResult): boolean {
  return mode === 'auto' && result.didRecalc === true;
}

export interface IdempotencyKeyParams {
  userId: string;
  clientId: string;
  newWeightKg: number;
}

/**
 * Stable, deterministic fingerprint — used by the route handler as the recalc
 * branch's idempotency anchor. Formatted as a colon-joined string so it's
 * human-readable in logs and trivially comparable across the original and
 * retry paths.
 *
 * `newWeightKg` is rounded to 2 decimals to match DB numeric(5,2) precision,
 * preventing floating-point drift between retries from generating a different
 * key for effectively identical requests.
 */
export function buildRecalcIdempotencyKey(params: IdempotencyKeyParams): string {
  const weightStr = (Math.round(params.newWeightKg * 100) / 100).toFixed(2);
  return `recalc:${params.userId}:${params.clientId}:${weightStr}`;
}

// --- internals -------------------------------------------------------------

function finaliseRecalc(
  profile: RecalcProfileInput,
  newWeightKg: number,
  deltaPct: number | undefined,
): RecalcResult {
  const newBmr = calcBMR(profile.bio_sex, newWeightKg, profile.height_cm, profile.age);
  const newTdee = calcTDEE(newBmr, profile.activity_level);
  const goalDelta =
    profile.goal_weight_kg !== null && profile.goal_weight_kg !== undefined
      ? profile.goal_weight_kg - newWeightKg
      : 0;
  const paceWeeks =
    profile.goal_pace !== null && profile.goal_pace !== undefined
      ? PACE_WEEKS[profile.goal_pace]
      : 12;
  const newTarget = calcCalorieTarget(newTdee, goalDelta, paceWeeks);

  return {
    didRecalc: true,
    newBmr,
    newTdee,
    newTarget,
    deltaPct,
  };
}
