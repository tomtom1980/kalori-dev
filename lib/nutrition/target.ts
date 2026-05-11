/**
 * `lib/nutrition/target.ts` — pure daily-calorie-target calculation.
 *
 * Given a TDEE and a goal (Δkg over paceWeeks), compute the daily calorie
 * target that — if held — achieves the goal over the pace window:
 *
 *   dailyDelta = (goalDeltaKg × 7700) / (paceWeeks × 7)
 *   target     = TDEE + dailyDelta
 *   return     Math.round(target / 10) × 10         // nearest 10 kcal
 *
 * Conventions:
 *   - 7,700 kcal ≈ 1 kg of body fat (industry-standard energy-mass equivalence).
 *   - `goalDeltaKg` positive = gain, negative = loss, zero = maintenance.
 *   - Rounded to nearest 10 kcal per testing-strategy §2.1.
 *
 * I5 contract: pure function, no IO, deterministic. This helper is also the
 * recalc primitive used by the auto↔manual target-mode transition (see
 * `target-mode.ts`).
 *
 * No hard floor (e.g. minimum 1200 kcal) is applied — the briefing does not
 * specify one, and the Kalori onboarding wizard (Task 2.2) owns any UX-layer
 * warnings for unsafe targets.
 */

/**
 * Kilocalories per kilogram of body fat (industry convention).
 * Exported so downstream callers (e.g. weight-recalc pipeline) can derive
 * projections against the same constant.
 */
export const KCAL_PER_KG = 7700;

/**
 * Calculate the daily calorie target needed to meet a weight-change goal.
 *
 * @param tdee - Total Daily Energy Expenditure in kcal/day
 * @param goalDeltaKg - desired weight change over paceWeeks (positive=gain,
 *   negative=loss, zero=maintenance)
 * @param paceWeeks - timeline in weeks over which `goalDeltaKg` is achieved.
 *   Caller is responsible for ensuring paceWeeks > 0 when goalDeltaKg ≠ 0;
 *   when goalDeltaKg = 0, paceWeeks is irrelevant.
 * @returns daily calorie target in kcal, rounded to nearest 10
 */
export function calcCalorieTarget(tdee: number, goalDeltaKg: number, paceWeeks: number): number {
  const dailyDelta = goalDeltaKg === 0 ? 0 : (goalDeltaKg * KCAL_PER_KG) / (paceWeeks * 7);
  const raw = tdee + dailyDelta;
  return Math.round(raw / 10) * 10;
}
