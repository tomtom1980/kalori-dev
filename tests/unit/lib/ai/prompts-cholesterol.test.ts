/**
 * Cholesterol macro extension — Gemini prompt contract.
 *
 * The text-parse + vision system prompts must enumerate `cholesterol_mg` as
 * a required macro field with explicit `mg` units. The weekly-review prompt
 * must include cholesterol in the per-day totals line so Gemini sees the
 * full nutrient picture.
 */
import { describe, expect, it } from 'vitest';

import { v1_foodParse, v1_visionFoodParse, v1_weeklyReview } from '@/lib/ai/prompts';

function joinSystemText(payload: ReturnType<typeof v1_foodParse>): string {
  return payload.systemInstruction.parts.map((p) => ('text' in p ? p.text : '')).join('\n');
}

describe('cholesterol macro in Gemini prompts', () => {
  it('food-parse system prompt mentions cholesterol_mg', () => {
    const payload = v1_foodParse({ userText: 'apple' });
    const text = joinSystemText(payload);
    expect(text).toContain('cholesterol_mg');
  });

  it('food-parse system prompt declares the mg unit for cholesterol', () => {
    const payload = v1_foodParse({ userText: 'apple' });
    const text = joinSystemText(payload);
    // The string must connect cholesterol_mg to milligrams (mg) somewhere
    // so the model emits values in the correct unit.
    expect(text).toMatch(/cholesterol_mg[\s\S]*mg|milligrams[\s\S]*cholesterol/i);
  });

  it('vision system prompt mentions cholesterol_mg', () => {
    const payload = v1_visionFoodParse({
      userText: 'photo of food',
      imageBase64: 'AAAA',
    });
    const text = joinSystemText(payload);
    expect(text).toContain('cholesterol_mg');
  });

  it('weekly-review prompt formats daily totals with cholesterol_mg', () => {
    const payload = v1_weeklyReview({
      weekStartOn: '2026-05-11',
      recentEntries: [
        {
          date: '2026-05-11',
          totals: {
            kcal: 2000,
            protein_g: 100,
            carbs_g: 250,
            fat_g: 60,
            fiber_g: 28,
            cholesterol_mg: 220,
          },
          entryCount: 3,
          highlights: ['apple'],
        },
      ],
    });
    const userParts = payload.contents[0]?.parts ?? [];
    const userText = userParts.map((p) => ('text' in p ? p.text : '')).join('\n');
    expect(userText).toContain('cholesterol_mg=220');
  });
});
