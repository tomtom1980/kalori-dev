/**
 * VISION_SYSTEM canonical shape contract — Gemini vision prompt must inline
 * the full JSON shape exemplar so the model emits canonical field names
 * (`name`, `kcal`, `reasoning`, etc.) rather than free-form alternates
 * (`food_name`, `calories`, `analysis`) when `responseSchema` is not used.
 *
 * Regression guard for the May 18 2026 vision route ZodError outage: hotfix
 * d9fd163 removed `responseSchema` to fix HTTP 400 errors, which exposed the
 * gap in VISION_SYSTEM that previously referred Gemini to "the same shape as
 * text-parse" — but Gemini sees only the vision system prompt.
 */
import { describe, expect, it } from 'vitest';

import { v1_visionFoodParse, v1_visionFoodParseVnFallback } from '@/lib/ai/prompts';

function joinSystemText(payload: ReturnType<typeof v1_visionFoodParse>): string {
  return payload.systemInstruction.parts
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
}

describe('VISION_SYSTEM canonical shape contract', () => {
  const visionSystemText = joinSystemText(
    v1_visionFoodParse({ userText: 'photo of food', imageBase64: 'AAAA' }),
  );

  const itemKeys = ['name', 'portion', 'unit', 'kcal', 'macros', 'micros', 'confidence'];
  itemKeys.forEach((key) => {
    it(`vision prompt embeds canonical item key "${key}" as quoted JSON literal`, () => {
      expect(visionSystemText).toContain(`"${key}"`);
    });
  });

  const topLevelKeys = ['items', 'reasoning'];
  topLevelKeys.forEach((key) => {
    it(`vision prompt embeds canonical top-level key "${key}" as quoted JSON literal`, () => {
      expect(visionSystemText).toContain(`"${key}"`);
    });
  });

  const macroKeys = ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'cholesterol_mg'];
  macroKeys.forEach((key) => {
    it(`vision prompt embeds canonical macro key "${key}" as quoted JSON literal`, () => {
      expect(visionSystemText).toContain(`"${key}"`);
    });
  });

  it('vision prompt explicitly names the alternate field name "food_name" as forbidden', () => {
    expect(visionSystemText).toMatch(/food_name/i);
  });

  it('vision prompt explicitly names the alternate field name "calories" as forbidden', () => {
    expect(visionSystemText).toMatch(/calories/i);
  });

  it('vision prompt carries an explicit "literal field names / do not substitute" directive', () => {
    expect(visionSystemText).toMatch(/Do not substitute|Field names are literal/i);
  });

  it('VISION_VN_FALLBACK_SYSTEM inherits VISION_SYSTEM verbatim as its prefix', () => {
    const vnFallbackText = joinSystemText(
      v1_visionFoodParseVnFallback({
        userText: 'photo of food',
        imageBase64: 'AAAA',
      }),
    );
    expect(vnFallbackText.startsWith(visionSystemText)).toBe(true);
  });
});
