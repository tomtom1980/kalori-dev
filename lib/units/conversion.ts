/**
 * `lib/units/conversion.ts` — pure imperial↔metric converters.
 *
 * Exact conversion constants (ux-specialist §3, briefing §9.4):
 *   1 in = 2.54 cm   (exact)
 *   1 lb = 0.45359237 kg  (exact, NIST)
 *
 * Metric is canonical storage (design-doc §18.2 I6). Display layers
 * convert via these functions and may `roundToOne` for user-facing
 * rendering, but callers persist full-precision metric values.
 */

/** 1 in = 2.54 cm, exact. */
export const CM_PER_IN = 2.54;
/** 1 lb = 0.45359237 kg, exact. */
export const KG_PER_LB = 0.45359237;

/** Convert centimetres to inches with full precision. */
export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

/** Convert inches to centimetres with full precision. */
export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Convert kilograms to pounds with full precision. */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Convert pounds to kilograms with full precision. */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/**
 * Round to one decimal for display rendering. Callers SHOULD store the
 * full-precision metric value and ONLY apply this when formatting.
 */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
