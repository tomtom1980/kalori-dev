/**
 * `lib/nutrition/micros-rda.ts` — Task C.1 (US-STAB-C1, sprint Phase C).
 *
 * Canonical 30-entry micronutrient reference table consumed by:
 *   1. `lib/ai/prompts.ts` — Gemini text-parse + vision system prompts
 *      enumerate every `code` so the AI returns a stable `micros` shape.
 *   2. `lib/dashboard/micros-rda-resolver.ts` — dashboard resolver iterates
 *      this list in declared order and produces `MicroRdaRow[]` rows for
 *      `<MicrosRdaPanel />`.
 *
 * Per design-doc §6 + DT-8 the AI prompt and the dashboard both read from
 * this single source of truth. Per-user RDA override is DEFERRED per
 * DT-5/O-2 (followup `F-MICROS-RDA-OVERRIDE-COLUMN`); no `profile` lookup
 * lives in the resolver until that followup lands.
 *
 * RDA values are derived from FDA Daily Values (21 CFR §101.9 reference
 * tables for adults & children ≥4y, updated 2016/2020) cross-referenced
 * with WHO/FAO RNIs. Where the two diverge, FDA Daily Values win because
 * the audit is a US-baseline reference (briefing §11). Each entry carries
 * a short inline citation so the value is auditable without leaving the
 * file.
 *
 * Units:
 *   - mg  = milligrams
 *   - mcg = micrograms
 *   - g   = grams (macro-scale minerals — sodium, chloride, potassium)
 *
 * Order: vitamins (fat-soluble → water-soluble) then minerals (macro →
 * trace). Order is rendered verbatim in `<MicrosRdaPanel />`.
 *
 * Invariants:
 *   - Every code MUST be a stable snake_case identifier (no spaces, no
 *     accents). The AI prompt enumerates these codes verbatim, so renaming
 *     ANY code post-launch is a P1 schema migration.
 *   - Every entry MUST have a positive RDA. Null RDA is forbidden by
 *     spec — the empty-state branch on the panel is gated on `value === 0`
 *     across ALL rows, not on `rda === null`.
 *   - Unit MUST be one of `'mg' | 'mcg' | 'g'` — the resolver does not
 *     unit-convert; the AI is expected to return values already in the
 *     declared unit.
 */

export interface MicroRdaEntry {
  /** Stable snake_case key embedded in the Gemini prompt. */
  readonly code: string;
  /** Human-readable display name for the dashboard chip. */
  readonly name: string;
  /** Recommended daily allowance in the declared `unit`. Always positive. */
  readonly rda: number;
  /** Unit the AI must report values in (`mg`, `mcg`, or `g`). */
  readonly unit: 'mg' | 'mcg' | 'g';
}

/**
 * Canonical sprint-time micronutrient set — 30 entries derived from FDA
 * Daily Values + WHO RNI baselines. Single source of truth for AC1 + AC4.
 */
export const DEFAULT_MICROS_LIST = [
  // ---- Fat-soluble vitamins ----
  { code: 'vitamin_a', name: 'Vitamin A', rda: 900, unit: 'mcg' }, // FDA DV 900mcg RAE
  { code: 'vitamin_d', name: 'Vitamin D', rda: 20, unit: 'mcg' }, // FDA DV 20mcg (800 IU)
  { code: 'vitamin_e', name: 'Vitamin E', rda: 15, unit: 'mg' }, // FDA DV 15mg alpha-tocopherol
  { code: 'vitamin_k', name: 'Vitamin K', rda: 120, unit: 'mcg' }, // FDA DV 120mcg
  // ---- Water-soluble vitamins ----
  { code: 'vitamin_c', name: 'Vitamin C', rda: 90, unit: 'mg' }, // FDA DV 90mg
  { code: 'thiamin', name: 'Thiamin (B1)', rda: 1.2, unit: 'mg' }, // FDA DV 1.2mg
  { code: 'riboflavin', name: 'Riboflavin (B2)', rda: 1.3, unit: 'mg' }, // FDA DV 1.3mg
  { code: 'niacin', name: 'Niacin (B3)', rda: 16, unit: 'mg' }, // FDA DV 16mg NE
  { code: 'pantothenic_acid', name: 'Pantothenic acid (B5)', rda: 5, unit: 'mg' }, // FDA DV 5mg
  { code: 'vitamin_b6', name: 'Vitamin B6', rda: 1.7, unit: 'mg' }, // FDA DV 1.7mg
  { code: 'biotin', name: 'Biotin (B7)', rda: 30, unit: 'mcg' }, // FDA DV 30mcg
  { code: 'folate', name: 'Folate (B9)', rda: 400, unit: 'mcg' }, // FDA DV 400mcg DFE
  { code: 'vitamin_b12', name: 'Vitamin B12', rda: 2.4, unit: 'mcg' }, // FDA DV 2.4mcg
  { code: 'choline', name: 'Choline', rda: 550, unit: 'mg' }, // FDA DV 550mg
  // ---- Macro-minerals ----
  { code: 'calcium', name: 'Calcium', rda: 1300, unit: 'mg' }, // FDA DV 1300mg
  { code: 'phosphorus', name: 'Phosphorus', rda: 1250, unit: 'mg' }, // FDA DV 1250mg
  { code: 'magnesium', name: 'Magnesium', rda: 420, unit: 'mg' }, // FDA DV 420mg
  { code: 'sodium', name: 'Sodium', rda: 2300, unit: 'mg' }, // FDA DV 2300mg upper guidance
  { code: 'chloride', name: 'Chloride', rda: 2300, unit: 'mg' }, // FDA DV 2300mg
  { code: 'potassium', name: 'Potassium', rda: 4700, unit: 'mg' }, // FDA DV 4700mg
  // ---- Trace minerals ----
  { code: 'iron', name: 'Iron', rda: 18, unit: 'mg' }, // FDA DV 18mg
  { code: 'zinc', name: 'Zinc', rda: 11, unit: 'mg' }, // FDA DV 11mg
  { code: 'copper', name: 'Copper', rda: 0.9, unit: 'mg' }, // FDA DV 0.9mg
  { code: 'manganese', name: 'Manganese', rda: 2.3, unit: 'mg' }, // FDA DV 2.3mg
  { code: 'selenium', name: 'Selenium', rda: 55, unit: 'mcg' }, // FDA DV 55mcg
  { code: 'iodine', name: 'Iodine', rda: 150, unit: 'mcg' }, // FDA DV 150mcg
  { code: 'chromium', name: 'Chromium', rda: 35, unit: 'mcg' }, // FDA DV 35mcg
  { code: 'molybdenum', name: 'Molybdenum', rda: 45, unit: 'mcg' }, // FDA DV 45mcg
  { code: 'fluoride', name: 'Fluoride', rda: 4, unit: 'mg' }, // IOM AI adult male 4mg
  { code: 'sulfur', name: 'Sulfur', rda: 850, unit: 'mg' }, // WHO/EFSA reference (no FDA DV)
] as const satisfies readonly MicroRdaEntry[];

/** Compile-time union of valid micronutrient codes. */
export type MicroCode = (typeof DEFAULT_MICROS_LIST)[number]['code'];

/** Compile-time count of canonical micros (currently 30). */
export const MICROS_COUNT = DEFAULT_MICROS_LIST.length;

/**
 * Canonical-code → display-name lookup. Built once at module load.
 *
 * Use this to convert a stable AI key (`vitamin_c`) into the user-facing
 * label (`Vitamin C`). Required by `aggregateMicros` (Task 3.5's existing
 * 7-day micronutrient panel) so AI responses using the canonical snake_case
 * shape converge with legacy display-name entries on the same row.
 */
export const CANONICAL_CODE_TO_DISPLAY_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.code, m.name])),
);

/**
 * Display-name → canonical-code lookup (inverse of `CANONICAL_CODE_TO_DISPLAY_NAME`).
 *
 * Task C.1 Codex Round 2 (HIGH 2) fix. Existing persisted entries and warm
 * AI-cache rows may carry display-name keys like `"Vitamin C"` because the
 * save + PATCH request schemas accept arbitrary `micros` maps. Without this
 * inverse map, the new `<MicrosRdaPanel />` resolver dropped those
 * contributions silently, underreporting the user's actual intake.
 *
 * Built once at module load from the same single source of truth so any
 * future rename to a `name` field cascades to BOTH lookups in lockstep —
 * the resolver can never see a canonical→display map that disagrees with
 * the display→canonical map.
 */
export const DISPLAY_NAME_TO_CANONICAL_CODE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.name, m.code])),
);

/**
 * Canonical-code → unit lookup. Built once at module load from
 * `DEFAULT_MICROS_LIST` so any future unit change in the source-of-truth
 * table cascades automatically to the dashboard resolver, the AI prompt,
 * the RDA panel, AND the library detail view.
 *
 * Bug 2 (library-micros batch 2026-05-17) — the library detail view's
 * collapsible micros block previously inferred its unit from snake_case
 * suffixes (`*_mg`, `*_mcg`, ...) via `unitFromMicroKey`. That worked while
 * every persisted micro carried a suffix, but it dropped the unit silently
 * the moment an AI-canonical bare code (`vitamin_c`, `vitamin_a`) arrived.
 * The library renderer now delegates to `canonicalMicroUnit` in
 * `lib/dashboard/micros-rda-resolver.ts`, which pipes through
 * `canonicalizeMicroKey` first and then reads this map — so every shape the
 * canonicalizer accepts (suffixed legacy alias / bare canonical /
 * display-name) returns the same canonical unit.
 */
export const CANONICAL_CODE_TO_UNIT: Readonly<Record<string, 'mg' | 'mcg' | 'g'>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.code, m.unit])),
);
