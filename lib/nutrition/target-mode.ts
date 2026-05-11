/**
 * `lib/nutrition/target-mode.ts` — pure auto↔manual transition logic.
 *
 * Binding rule from design-doc §10.9 line 613 + AC line 359:
 *
 *   manual → auto : recalc target from current inputs; nudge fires
 *                   (dashboard will surface a "target updated" card).
 *   auto   → manual: copy current auto-calculated target into
 *                    manualOverrideValue; no nudge.
 *   same mode → same mode: no-op; shape of result is still fully populated
 *                          so callers can treat it as idempotent.
 *
 * Task 2.1 owns ONLY the pure transition logic. The DB write, dashboard
 * nudge card render, and `/api/profile/save` wiring are Task 2.2 / 4.3b.
 *
 * I5 contract: no IO, no React, no DB. Callers forward the `TargetModeResult`
 * into their write path.
 */
import { calcBMR, type BioSex } from '@/lib/nutrition/mifflin-st-jeor';
import { calcCalorieTarget } from '@/lib/nutrition/target';
import { calcTDEE, type ActivityLevel } from '@/lib/nutrition/tdee';

export type TargetMode = 'auto' | 'manual';

export interface TargetModeContext {
  readonly bioSex: BioSex;
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly activityLevel: ActivityLevel;
  readonly goalDeltaKg: number;
  readonly paceWeeks: number;
  /**
   * Caller's existing `profiles.manual_override_value` at transition time.
   * Used for `manual → manual` idempotency: if the user edited a manual
   * target without toggling mode, the helper preserves that value.
   *
   * Optional because callers may not have one yet (fresh user on first mode
   * toggle) — the helper falls back to the recomputed auto target.
   */
  readonly priorManualOverrideValue?: number;
}

export interface TargetModeResult {
  readonly mode: TargetMode;
  readonly calorieTarget: number;
  /** null iff mode === 'auto' */
  readonly manualOverrideValue: number | null;
  /** true iff the transition should trigger the dashboard nudge card */
  readonly nudgeFired: boolean;
}

/**
 * Compute the result of toggling between auto and manual target modes.
 *
 * @param from - current `profiles.target_mode`
 * @param to   - desired `profiles.target_mode`
 * @param ctx  - current profile snapshot needed to recompute the auto target
 * @returns TargetModeResult describing the mode, calorieTarget,
 *          manualOverrideValue, and whether the nudge should fire.
 */
export function transitionTargetMode(
  from: TargetMode,
  to: TargetMode,
  ctx: TargetModeContext,
): TargetModeResult {
  const autoTarget = computeAutoTarget(ctx);

  if (from === 'auto' && to === 'manual') {
    return {
      mode: 'manual',
      calorieTarget: autoTarget,
      manualOverrideValue: autoTarget,
      nudgeFired: false,
    };
  }

  if (from === 'manual' && to === 'auto') {
    return {
      mode: 'auto',
      calorieTarget: autoTarget,
      manualOverrideValue: null,
      nudgeFired: true,
    };
  }

  if (from === 'manual' && to === 'manual') {
    const preserved = ctx.priorManualOverrideValue ?? autoTarget;
    return {
      mode: 'manual',
      calorieTarget: preserved,
      manualOverrideValue: preserved,
      nudgeFired: false,
    };
  }

  // from === 'auto' && to === 'auto'
  return {
    mode: 'auto',
    calorieTarget: autoTarget,
    manualOverrideValue: null,
    nudgeFired: false,
  };
}

/**
 * Recompute the auto target from a profile snapshot via the full
 * BMR → TDEE → target pipeline. Internal helper, not exported.
 */
function computeAutoTarget(ctx: TargetModeContext): number {
  const bmr = calcBMR(ctx.bioSex, ctx.weightKg, ctx.heightCm, ctx.ageYears);
  const tdee = calcTDEE(bmr, ctx.activityLevel);
  return calcCalorieTarget(tdee, ctx.goalDeltaKg, ctx.paceWeeks);
}
