/**
 * FoodDetail edit-mode schema — Task 4.2.
 *
 * Shared between the client edit form (on-commit validation) and the
 * server route handler. Matches the briefing §API Contracts Zod schema.
 */
import { z } from 'zod';

import { isWholeStyleQuantity } from '@/lib/log/portion-unit';

// Task 4.2 round 1 C2 fix — nutrition payloads MUST carry the full macros
// shape + kcal when `nutrition` is present. See route.ts for the
// rationale: Supabase `.update({ nutrition })` is a shallow JSONB
// replacement, so partial client diffs would silently null siblings.
// Client-side merge is the contract; the schema enforces it.
export const MacrosFullSchema = z
  .object({
    protein_g: z.number().finite().nonnegative(),
    carbs_g: z.number().finite().nonnegative(),
    fat_g: z.number().finite().nonnegative(),
    fiber_g: z.number().finite().nonnegative(),
    sugar_g: z.number().finite().nonnegative(),
    // Phase 2C + Codex R1 F2 — optional WITHOUT a default so absence
    // round-trips through the schema. `.default(0)` would materialise a
    // literal 0mg in the post-parse output and defeat the absence-vs-zero
    // semantic the resolver in `useFoodDetailEdit.ts` now enforces. Kept
    // in sync with the server `MacrosFull` in `route.ts`.
    cholesterol_mg: z.number().finite().nonnegative().optional(),
  })
  .strict();

export const MicrosPartialSchema = z.record(z.string(), z.number().finite().nonnegative());

export const NutritionFullSchema = z
  .object({
    kcal: z.number().int().nonnegative(),
    macros: MacrosFullSchema,
    micros: MicrosPartialSchema.optional(),
    approxGrams: z.number().positive().finite().optional(),
  })
  .strict();

export const EditFieldsSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120).optional(),
    default_portion: z.number().positive().nullable().optional(),
    default_unit: z.string().min(1).max(16).nullable().optional(),
    nutrition: NutritionFullSchema.optional(),
    thumbnail_url: z.string().url().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field required',
  })
  .superRefine((fields, ctx) => {
    if (
      typeof fields.default_portion === 'number' &&
      fields.default_unit &&
      !isWholeStyleQuantity(fields.default_unit, fields.default_portion)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['default_portion'],
        message: 'default_portion must be a whole number for this unit',
      });
    }
  });

export const EditBodySchema = z
  .object({
    client_id: z.string().uuid(),
    fields: EditFieldsSchema,
  })
  .strict();

export type EditFields = z.infer<typeof EditFieldsSchema>;
