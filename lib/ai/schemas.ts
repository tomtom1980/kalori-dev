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

export const ParsedItem = z.object({
  name: z.string().max(200),
  portion: z.number().positive(),
  unit: z.string().max(32),
  kcal: z.number().nonnegative(),
  macros: z.object({
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
  }),
  micros: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});

export const ParseResult = z.object({
  items: z.array(ParsedItem).min(0).max(20),
  reasoning: z
    .string()
    .max(500)
    .transform((s) => stripControlChars(s)),
});

export type ParsedItemT = z.infer<typeof ParsedItem>;
export type ParseResultT = z.infer<typeof ParseResult>;

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
