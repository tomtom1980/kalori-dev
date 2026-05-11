/**
 * Task 2.2 — shared Zod schema for the 8-step onboarding wizard.
 *
 * Single source of truth for both the client (Zustand store drafts +
 * per-step validation) and the server (`app/api/profile/save/route.ts`
 * finalize branch). Column names match `profiles` DDL verbatim
 * (`architecture.md` §2.2) so a bare spread of a parsed object is a
 * safe upsert payload.
 *
 * Design notes:
 *   - Module-scope schemas only — never construct `z.object({...})`
 *     inside a component render (react-perf §9).
 *   - `.strict()` applied at the root so unknown keys raise 400 at the
 *     server route; per-step projections inherit strictness via
 *     `.pick()`.
 *   - Every numeric bound matches the DDL CHECK constraint — keeps
 *     client + server + DB consistent.
 */
import { z } from 'zod';

export const BIO_SEX_VALUES = ['male', 'female', 'other'] as const;
export const ACTIVITY_LEVEL_VALUES = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const;
export const GOAL_PACE_VALUES = ['slow', 'moderate', 'fast'] as const;
export const UNIT_SYSTEM_VALUES = ['metric', 'imperial'] as const;

/** Canonical root schema for a complete onboarding patch. */
export const OnboardingPatchSchema = z
  .object({
    bio_sex: z.enum(BIO_SEX_VALUES),
    age: z.number().int().min(13).max(120),
    height_cm: z.number().min(100).max(250),
    current_weight_kg: z.number().min(30).max(350),
    goal_weight_kg: z.number().min(30).max(350),
    goal_pace: z.enum(GOAL_PACE_VALUES),
    activity_level: z.enum(ACTIVITY_LEVEL_VALUES),
    unit_pref: z.enum(UNIT_SYSTEM_VALUES),
    timezone: z.string().min(1).max(100),
    onboarding_completed_at: z.string().datetime(),
  })
  .strict();

/** Per-step projection — each step only carries the column(s) it captures. */
export const Step1BioSexSchema = OnboardingPatchSchema.pick({ bio_sex: true });
export const Step2AgeSchema = OnboardingPatchSchema.pick({ age: true });
export const Step3HeightSchema = OnboardingPatchSchema.pick({ height_cm: true });
export const Step4WeightSchema = OnboardingPatchSchema.pick({ current_weight_kg: true });
export const Step5GoalWeightSchema = OnboardingPatchSchema.pick({ goal_weight_kg: true });
export const Step6PaceSchema = OnboardingPatchSchema.pick({ goal_pace: true });
export const Step7ActivitySchema = OnboardingPatchSchema.pick({ activity_level: true });

/** Step 8 finalize: all 7 input fields present + the completion timestamp. */
export const Step8FinalizeSchema = OnboardingPatchSchema.pick({
  bio_sex: true,
  age: true,
  height_cm: true,
  current_weight_kg: true,
  goal_weight_kg: true,
  goal_pace: true,
  activity_level: true,
  onboarding_completed_at: true,
});

/**
 * Pace-enum to weeks mapping (ux-specialist §5). Named here so both the
 * UI (StepPace target-date calc, StepResults target calc) and the
 * server finalize branch use the same values.
 */
export const PACE_WEEKS: Record<(typeof GOAL_PACE_VALUES)[number], number> = {
  slow: 24,
  moderate: 16,
  fast: 8,
};

export type BioSex = (typeof BIO_SEX_VALUES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVEL_VALUES)[number];
export type GoalPace = (typeof GOAL_PACE_VALUES)[number];
export type UnitSystem = (typeof UNIT_SYSTEM_VALUES)[number];
