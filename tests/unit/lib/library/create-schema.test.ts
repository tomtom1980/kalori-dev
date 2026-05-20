/**
 * Unit tests for `lib/library/create-schema.ts` — Bug 6 (library overhaul
 * 2026-05-16).
 *
 * The schema is shared by `app/api/library/create/route.ts` (server) and
 * `app/(app)/library/_components/AddLibraryItemDialog.tsx` (client form
 * inline validation). Drift between the two would surface as confusing
 * "form passed but server 400'd" UX — these tests lock the shape so a
 * future refactor cannot silently widen one side.
 */
import { describe, expect, it } from 'vitest';

import { CreateLibraryBodySchema } from '@/lib/library/create-schema';

const validBody = () => ({
  client_id: crypto.randomUUID(),
  display_name: 'Apple',
  default_portion: 1,
  default_unit: 'piece',
  nutrition: {
    kcal: 95,
    macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
  },
});

describe('CreateLibraryBodySchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = CreateLibraryBodySchema.safeParse(validBody());
    expect(result.success).toBe(true);
  });

  it('accepts a payload with portion/unit omitted', () => {
    const body = validBody() as Record<string, unknown>;
    delete body.default_portion;
    delete body.default_unit;
    const result = CreateLibraryBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('rejects empty display_name (after trim)', () => {
    const body = { ...validBody(), display_name: '   ' };
    const result = CreateLibraryBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects display_name > 120 chars', () => {
    const body = { ...validBody(), display_name: 'x'.repeat(121) };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects negative macros', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        macros: { protein_g: -1, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects negative kcal', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: -1,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects non-integer kcal', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95.5,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects missing macro fields', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        // missing fat_g and fiber_g
        macros: { protein_g: 0.5, carbs_g: 25 } as unknown,
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects non-UUID client_id', () => {
    const body = { ...validBody(), client_id: 'not-a-uuid' };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects unknown root fields (strict)', () => {
    const body = { ...validBody(), brand: 'Acme' };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects negative default_portion', () => {
    const body = { ...validBody(), default_portion: -1 };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects zero default_portion (must be positive)', () => {
    const body = { ...validBody(), default_portion: 0 };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects decimal default_portion for whole-style units such as cup', () => {
    const body = { ...validBody(), default_portion: 1.5, default_unit: 'cup' };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('accepts decimal default_portion for gram and milliliter units', () => {
    expect(
      CreateLibraryBodySchema.safeParse({
        ...validBody(),
        default_portion: 87.5,
        default_unit: 'g',
      }).success,
    ).toBe(true);
    expect(
      CreateLibraryBodySchema.safeParse({
        ...validBody(),
        default_portion: 240.5,
        default_unit: 'ml',
      }).success,
    ).toBe(true);
  });

  it('accepts optional AI-provided approxGrams metadata in nutrition', () => {
    const body = {
      ...validBody(),
      default_portion: 1,
      default_unit: 'bowl',
      nutrition: {
        ...validBody().nutrition,
        approxGrams: 420,
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(true);
  });

  it('accepts optional recipe eligibility fields for manual creates without requiring AI', () => {
    const result = CreateLibraryBodySchema.safeParse({
      ...validBody(),
      recipe_eligibility: 'eligible',
      recipe_eligibility_reason: 'mixed_dish',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid recipe eligibility values and overlong reasons', () => {
    expect(
      CreateLibraryBodySchema.safeParse({
        ...validBody(),
        recipe_eligibility: 'maybe',
      }).success,
    ).toBe(false);
    expect(
      CreateLibraryBodySchema.safeParse({
        ...validBody(),
        recipe_eligibility: 'ineligible',
        recipe_eligibility_reason: 'x'.repeat(241),
      }).success,
    ).toBe(false);
  });

  // ---------------------------------------------------------------
  // Bugfix R1 C3 (2026-05-17 library-micros-parse) — MAX_MICRO_VALUE
  // server bound parity with `useFoodDetailEdit.MAX_MICRO_VALUE`.
  // Without this, an authenticated POST to /api/library/create can
  // bypass the 1e6 client clamp and persist arbitrarily large values
  // into nutrition.micros JSONB.
  // ---------------------------------------------------------------

  it('C3: rejects a micro value above MAX_MICRO_VALUE (1e6)', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
        micros: { iron_mg: 1.5e6 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('C3: rejects extreme micro values (1e10) that would corrupt RDA math', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
        micros: { sodium_mg: 9_999_999_999 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
  });

  it('C3: accepts a micro value exactly at MAX_MICRO_VALUE (1e6) — boundary inclusive', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
        micros: { iron_mg: 1_000_000 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(true);
  });

  it('C3: accepts realistic micro values under the cap', () => {
    const body = {
      ...validBody(),
      nutrition: {
        kcal: 95,
        macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
        micros: { iron_mg: 2.4, sodium_mg: 350 },
      },
    };
    expect(CreateLibraryBodySchema.safeParse(body).success).toBe(true);
  });
});
