/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { AI_PROMPT_CONTRACT_VERSION, computeCacheKey } from '@/lib/ai/cache';
import { v1_foodParse, v1_libraryRecipe, v1_visionFoodParse } from '@/lib/ai/prompts';
import { ParsedItem, RecipeResult } from '@/lib/ai/schemas';

function systemText(
  payload: ReturnType<typeof v1_foodParse> | ReturnType<typeof v1_visionFoodParse>,
) {
  return payload.systemInstruction.parts
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
}

function baseParsedItem(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Pho Bo',
    portion: 1,
    unit: 'bowl',
    kcal: 520,
    macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
    micros: {},
    confidence: 0.9,
    ...overrides,
  };
}

describe('library recipe AI contract', () => {
  it('ParsedItem defaults recipeEligible to false for legacy AI payloads', () => {
    const result = ParsedItem.parse(baseParsedItem());
    expect(result.recipeEligible).toBe(false);
  });

  it('ParsedItem accepts recipe eligibility and a bounded reason', () => {
    const result = ParsedItem.parse(
      baseParsedItem({
        recipeEligible: true,
        recipeEligibilityReason: 'mixed_dish',
      }),
    );
    expect(result.recipeEligible).toBe(true);
    expect(result.recipeEligibilityReason).toBe('mixed_dish');
  });

  it('food parse and vision prompts request recipe eligibility fields', () => {
    expect(systemText(v1_foodParse({ userText: 'pho bo' }))).toContain('"recipeEligible"');
    expect(systemText(v1_visionFoodParse({ userText: '', imageBase64: 'AAAA' }))).toContain(
      '"recipeEligibilityReason"',
    );
  });

  it('cache key supports library-recipe and includes the bumped contract version', () => {
    expect(AI_PROMPT_CONTRACT_VERSION).toMatch(/recipe/i);
    const key = computeCacheKey({
      callType: 'library-recipe',
      userId: 'user-alpha',
      normalizedInput: 'lib-1:pho-bo',
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('RecipeResult validates a UI-friendly recipe shape', () => {
    const parsed = RecipeResult.parse({
      title: 'Pho Bo at Home',
      servings: 2,
      total_time_minutes: 45,
      ingredients: ['beef bones', 'rice noodles', 'herbs'],
      steps: ['Simmer broth.', 'Cook noodles.', 'Assemble bowls.'],
      nutrition_note: 'Approximate nutrition depends on broth richness.',
      confidence: 0.82,
    });
    expect(parsed.ingredients).toHaveLength(3);
    expect(parsed.confidence).toBe(0.82);
  });

  it('library recipe prompt embeds the strict recipe JSON keys', () => {
    const payload = v1_libraryRecipe({
      item: {
        displayName: 'Pho Bo',
        defaultPortion: 1,
        defaultUnit: 'bowl',
        nutrition: { kcal: 520 },
        recipeEligibilityReason: 'mixed_dish',
      },
    });
    const text = systemText(payload);
    for (const key of [
      'title',
      'servings',
      'total_time_minutes',
      'ingredients',
      'steps',
      'nutrition_note',
      'confidence',
    ]) {
      expect(text).toContain(`"${key}"`);
    }
  });
});
