/**
 * Zod schemas for Gemini response validation (Task 3.2, F11 Layer 3 + I10).
 *
 * RED-phase stub: the Zod shapes below are the contract (verbatim from
 * design-doc §7 / architecture.md §8.6) and MUST remain verbatim in GREEN.
 * They are declared now so test files can import the schema identifiers,
 * but NOTHING in this file integrates them into request flow — that
 * integration is the GREEN-phase work (route handlers, cache, etc).
 *
 * Control-char strip pattern: strips U+0000–U+001F except \t (0x09),
 * \n (0x0A), \r (0x0D). Carved character-by-character to avoid relying
 * on regex control-character-class behavior across engines.
 */
import { z } from 'zod';

import { DEFAULT_MICROS_LIST, type MicroCode } from '@/lib/nutrition/micros-rda';

/**
 * Control-character strip used on any string field in the parsed output.
 * Strips U+0000–U+001F except \t (0x09), \n (0x0A), \r (0x0D). The
 * replacement runs once across every string the Zod output touches.
 */
export function stripControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    const isControl = code >= 0 && code <= 0x1f;
    const isAllowed = code === 0x09 || code === 0x0a || code === 0x0d;
    if (isControl && !isAllowed) continue;
    out += ch;
  }
  return out;
}

/**
 * Canonical micronutrient code set — derived from `DEFAULT_MICROS_LIST` at
 * module load. Used by the `Micros` Zod schema to validate AI responses.
 */
const CANONICAL_MICRO_CODES: ReadonlySet<MicroCode> = new Set(
  DEFAULT_MICROS_LIST.map((m) => m.code),
);

/**
 * Task C.1 Codex Round 1 Finding 3 — production runtime micros schema.
 *
 * Before this hardening the schema was `z.record(z.string(), z.number())`
 * which accepted: missing required keys, unknown extra keys, negative
 * numbers, NaN, +Infinity. The Gemini contract states `micros` is an
 * object keyed by the 30 canonical codes with nonnegative finite numbers
 * per the declared unit.
 *
 * Strictness mode (option b from the briefing):
 *   - Numbers MUST be finite + nonnegative. NaN / Infinity / negatives → reject.
 *   - Unknown keys (outside `DEFAULT_MICROS_LIST`) → reject.
 *   - Missing canonical keys → transform to 0 (preserve resilience against
 *     mild AI drift; the dashboard treats 0 as "no contribution" already).
 *
 * Rationale for "fill missing with 0" instead of strict-require:
 *   - The 30-key contract is enforced at the PROMPT level (MICROS_DIRECTIVE
 *     is part of every system prompt and the `tests/unit/ai/
 *     micros-extraction.test.ts` suite asserts this).
 *   - The DASHBOARD resolver (`lib/dashboard/micros-rda-resolver.ts`) reads
 *     `DEFAULT_MICROS_LIST` and defaults missing keys to 0 already. Aligning
 *     the runtime schema to that contract avoids the Zod-level rejection
 *     blocking dashboard rendering when Gemini omits a single key.
 *   - Negative / non-finite values are HARD-REJECTED because they would
 *     poison downstream sums + RDA percentage math.
 *
 * Round-trip invariant: a fully-populated 30-key response from Gemini
 * parses to an object whose keys are EXACTLY the 30 canonical codes (no
 * extras, no missing), preserving the existing test that asserts
 * `Object.keys(result.data.micros).sort() === DEFAULT_MICROS_LIST.codes.sort()`.
 */
const Micros = z
  .record(z.string(), z.number().nonnegative().finite())
  .superRefine((micros, ctx) => {
    for (const key of Object.keys(micros)) {
      if (!CANONICAL_MICRO_CODES.has(key as MicroCode)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `Unknown micronutrient key "${key}" — must be one of the ${DEFAULT_MICROS_LIST.length} canonical codes in DEFAULT_MICROS_LIST.`,
        });
      }
    }
  })
  .transform((micros): Record<string, number> => {
    // Fill missing canonical keys with 0 so downstream code can read every
    // canonical code unconditionally. Return type widened to
    // `Record<string, number>` (not `Record<MicroCode, number>`) so existing
    // call sites — `FoodEntry.items[].micros = {}` style fixtures, legacy
    // entries that may carry display-name keys via the canonical-translation
    // path in `aggregateMicros` — continue to type-check unchanged.
    const filled: Record<string, number> = {};
    for (const entry of DEFAULT_MICROS_LIST) {
      filled[entry.code] = micros[entry.code] ?? 0;
    }
    return filled;
  });

export const ParsedItem = z
  .object({
    name: z.string().max(200),
    portion: z.number().positive(),
    unit: z.string().max(32),
    approxGrams: z.number().positive().finite().optional(),
    kcal: z.number().nonnegative(),
    macros: z.object({
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
      fiber_g: z.number().nonnegative(),
      // Cholesterol is the 5th tracked macro. Unit is `mg` (matches USDA /
      // FDA Daily Value convention). `.optional()` (NOT `.default(0)`) is
      // critical — historical AI responses + library items + food_entries
      // rows pre-date this field and MUST continue to parse cleanly. The
      // OUTPUT type therefore stays `number | undefined` so DB rows read
      // back through the `FoodEntry.items` typing remain valid without
      // synthesising a phantom `0` value at parse time. Consumers default
      // missing values to 0 at the aggregation layer
      // (`lib/dashboard/aggregate.ts` → `entryMacros`). The explicit
      // `.finite()` guard mirrors the runtime micros schema: negatives /
      // NaN / +Infinity would poison downstream sums.
      cholesterol_mg: z.number().nonnegative().finite().optional(),
    }),
    micros: Micros,
    recipeEligible: z.boolean().default(false),
    recipeEligibilityReason: z
      .string()
      .max(240)
      .transform((s) => stripControlChars(s))
      .optional(),
    confidence: z.number().min(0).max(1),
    /**
     * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — alcohol detection
     * fields. Gemini emits `is_alcoholic` per item; alcoholic items also
     * carry `volume_ml` + `abv_percent` so the save route can compute
     * `alcohol_grams` via `lib/alcohol/bac.ts:calculateAlcoholGrams`
     * without a separate manual toggle.
     *
     * All three fields are `.optional()` so historical rows + non-alcohol
     * AI parses parse cleanly. The `.superRefine` below enforces the
     * cross-field invariant: when `is_alcoholic === true`, both
     * `volume_ml` and `abv_percent` MUST be present.
     *
     * Bounds are repeated at the entries-save route Zod (`route.ts`
     * `BodySchema`) and in the Gemini prompt directive — three-layer
     * defense against AI drift producing impossible BAC math.
     */
    is_alcoholic: z.boolean().optional(),
    volume_ml: z.number().positive().finite().max(5000).optional(),
    abv_percent: z.number().positive().finite().max(100).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.is_alcoholic === true) {
      if (item.volume_ml === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['volume_ml'],
          message: 'volume_ml is required when is_alcoholic=true',
        });
      }
      if (item.abv_percent === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['abv_percent'],
          message: 'abv_percent is required when is_alcoholic=true',
        });
      }
    }
  });

export const ParseResult = z.object({
  items: z.array(ParsedItem).min(0).max(20),
  reasoning: z
    .string()
    .max(500)
    .transform((s) => stripControlChars(s)),
});

export type ParsedItemT = z.input<typeof ParsedItem>;
export type ParseResultT = {
  items: ParsedItemT[];
  reasoning: string;
};

/**
 * Weekly-review response shape per architecture.md §6 row 3 + design-doc §7.
 * The weekly-review route has a DIFFERENT output contract than text-parse /
 * vision: Gemini returns an editorial body_markdown string + a sparse_data
 * boolean. Both values are persisted to `weekly_reviews.insights` jsonb.
 *
 * sparse_data=true is only emitted on the Gemini path when Gemini itself
 * judges the input insufficient; the route's own <3-distinct-days fallback
 * still returns sparse_data=true WITHOUT a Gemini call.
 */
export const WeeklyReviewResult = z.object({
  body_markdown: z
    .string()
    .max(8_000)
    .transform((s) => stripControlChars(s)),
  sparse_data: z.boolean(),
});

export type WeeklyReviewResultT = z.infer<typeof WeeklyReviewResult>;

const SummaryString = z
  .string()
  .max(8_000)
  .transform((s) => stripControlChars(s));
const SummaryShortString = z
  .string()
  .max(500)
  .transform((s) => stripControlChars(s));

export const NutritionSummaryModelResult = z.object({
  body_markdown: SummaryString,
  bullets: z.array(SummaryShortString).max(8).default([]),
  caveats: z.array(SummaryShortString).max(8).default([]),
});

export const NutritionSummaryResult = NutritionSummaryModelResult.extend({
  generated_at: z.string().datetime(),
  source: z.enum(['ai', 'cache', 'fallback']),
  data_fingerprint: z.string().min(1).max(128),
});

export type NutritionSummaryModelResultT = z.infer<typeof NutritionSummaryModelResult>;
export type NutritionSummaryResultT = z.infer<typeof NutritionSummaryResult>;

const RecipeString = z
  .string()
  .min(1)
  .max(500)
  .transform((s) => stripControlChars(s));

export const RecipeResult = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .transform((s) => stripControlChars(s)),
  servings: z.number().int().min(1).max(24),
  total_time_minutes: z.number().int().min(1).max(480).nullable().optional(),
  ingredients: z.array(RecipeString).min(1).max(40),
  steps: z.array(RecipeString).min(1).max(20),
  nutrition_note: z
    .string()
    .max(500)
    .transform((s) => stripControlChars(s))
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1),
});

export type RecipeResultT = z.infer<typeof RecipeResult>;
