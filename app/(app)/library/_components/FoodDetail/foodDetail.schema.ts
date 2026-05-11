/**
 * FoodDetail edit-mode schema — Task 4.2.
 *
 * Shared between the client edit form (on-commit validation) and the
 * server route handler. Matches the briefing §API Contracts Zod schema.
 */
import { z } from 'zod';

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
  })
  .strict();

export const MicrosPartialSchema = z.record(z.string(), z.number().finite().nonnegative());

export const NutritionFullSchema = z
  .object({
    kcal: z.number().int().nonnegative(),
    macros: MacrosFullSchema,
    micros: MicrosPartialSchema.optional(),
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
  });

export const EditBodySchema = z
  .object({
    client_id: z.string().uuid(),
    fields: EditFieldsSchema,
  })
  .strict();

export type EditFields = z.infer<typeof EditFieldsSchema>;
