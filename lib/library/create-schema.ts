/**
 * Shared Zod schema for `POST /api/library/create` — Bug 6 (library
 * overhaul 2026-05-16).
 *
 * Used by:
 *   - server route handler for body validation
 *   - client form (AddLibraryItemDialog) for inline validation parity
 *
 * Single source of truth. Drift between client + server caused by
 * duplicated literals is the exact bug class this file exists to prevent.
 *
 * Field shape:
 *   - `client_id` — UUID, idempotency token per the I11 contract. Client
 *     generates via `crypto.randomUUID()` once via `useRef`; same value
 *     survives retries so a duplicate POST is replayed (200 + replayed:true)
 *     instead of inserting twice.
 *   - `display_name` — 1..120 chars after trim. Server normalizes via
 *     `lib/text/normalize.ts` for the dedup query (single source of truth
 *     parity with `/api/library/dedup-check`).
 *   - `default_portion` / `default_unit` — optional. Nullable to align
 *     with the existing `food_library_items` schema.
 *   - `nutrition` — kcal + 4 macros required (P, C, F, Fiber). Micros
 *     omitted (manual entries don't carry micro detail; user edits via
 *     FoodDetail edit-mode later).
 *   - `brand` — optional, deferred to a follow-up. Not in v1 schema.
 */
import { z } from 'zod';

import { isWholeStyleQuantity } from '@/lib/log/portion-unit';

// Bugfix R1 C3 (2026-05-17) — server-side upper bound on per-micro value.
// Bugfix R3 2026-05-17 — extracted to shared module after R3 added the
// bound to `entries/save` + `library/merge` (5 surfaces total: 4 server
// + 1 client clamp). See `lib/library/micros-bounds.ts` for the constant
// + the importer list.
import { MAX_MICRO_VALUE } from './micros-bounds';

export const CreateLibraryMacrosSchema = z
  .object({
    protein_g: z.number().finite().nonnegative(),
    carbs_g: z.number().finite().nonnegative(),
    fat_g: z.number().finite().nonnegative(),
    fiber_g: z.number().finite().nonnegative(),
    // Phase 2C — cholesterol_mg is the 5th tracked macro (unit: mg).
    // Optional + default(0) keeps back-compat: pre-cholesterol clients
    // still POST valid payloads. Zod runs `.default()` BEFORE `.strict()`
    // field-set check, so unknown-key rejection (typos like
    // `cholestrol_mg`) is preserved.
    cholesterol_mg: z.number().finite().nonnegative().optional().default(0),
  })
  .strict();

export const CreateLibraryNutritionSchema = z
  .object({
    kcal: z.number().int().nonnegative(),
    macros: CreateLibraryMacrosSchema,
    // Micros are optional + free-shape: any AI-parsed canonical micro
    // code passes through. The AI schema (`lib/ai/schemas.ts → Micros`)
    // is already strict about canonical-code membership upstream, so by
    // the time the parsed payload reaches the library-only save body the
    // keys are trustworthy. We accept `z.record(string, nonneg number)`
    // here to avoid coupling the create endpoint to the canonical-code
    // list (which would force a schema bump every time a new micro is
    // added). Persisted as-is into the `food_library_items.nutrition`
    // JSONB column. Manual-add (no AI parse) callers can omit it
    // entirely; legacy library rows continue to read back cleanly.
    micros: z.record(z.string(), z.number().nonnegative().finite().max(MAX_MICRO_VALUE)).optional(),
    approxGrams: z.number().positive().finite().optional(),
  })
  .strict();

const CreateLibraryBodySchemaBase = z
  .object({
    client_id: z.string().uuid(),
    display_name: z.string().trim().min(1).max(120),
    default_portion: z.number().positive().nullable().optional(),
    default_unit: z.string().min(1).max(16).nullable().optional(),
    nutrition: CreateLibraryNutritionSchema,
    recipe_eligibility: z.enum(['eligible', 'ineligible', 'unknown']).optional(),
    recipe_eligibility_reason: z.string().max(240).nullable().optional(),
  })
  .strict();

export const CreateLibraryBodySchema = CreateLibraryBodySchemaBase.superRefine((body, ctx) => {
  if (
    typeof body.default_portion === 'number' &&
    body.default_unit &&
    !isWholeStyleQuantity(body.default_unit, body.default_portion)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['default_portion'],
      message: 'default_portion must be a whole number for this unit',
    });
  }
});

export type CreateLibraryBody = z.infer<typeof CreateLibraryBodySchema>;
export type CreateLibraryMacros = z.infer<typeof CreateLibraryMacrosSchema>;
export type CreateLibraryNutrition = z.infer<typeof CreateLibraryNutritionSchema>;
