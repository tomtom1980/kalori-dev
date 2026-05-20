/**
 * @vitest-environment node
 *
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — AI text-parse route
 * response-shape parsing with AI-derived alcohol fields per item.
 *
 * This is a SHAPE test only (no live Gemini call): we exercise the Zod
 * validation contract used by `app/api/ai/text-parse/route.ts` against a
 * mock response whose `items[]` carry alcohol metadata. The route
 * forwards the parsed JSON straight through to the client, so the only
 * thing under test here is whether the AI response schema accepts the
 * new alcohol contract — guaranteeing the round-trip from Gemini → Zod
 * parse → client preserves `is_alcoholic` / `volume_ml` / `abv_percent`.
 */
import { describe, expect, it } from 'vitest';

import { ParseResult } from '@/lib/ai/schemas';

describe('ParseResult round-trip with AI-derived alcohol', () => {
  const baseItem = {
    name: 'lager',
    portion: 1,
    unit: 'can',
    kcal: 153,
    macros: { protein_g: 1.6, carbs_g: 12.6, fat_g: 0, fiber_g: 0 },
    micros: {},
    confidence: 0.85,
  };

  it('parses an alcoholic item with is_alcoholic, volume_ml, abv_percent', () => {
    const result = ParseResult.safeParse({
      items: [{ ...baseItem, is_alcoholic: true, volume_ml: 355, abv_percent: 5 }],
      reasoning: 'beer detected, canonical 355 ml can at 5% ABV',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).toMatchObject({
        is_alcoholic: true,
        volume_ml: 355,
        abv_percent: 5,
      });
    }
  });

  it('parses a non-alcoholic item with is_alcoholic=false', () => {
    const result = ParseResult.safeParse({
      items: [{ ...baseItem, name: 'water', is_alcoholic: false }],
      reasoning: 'plain water, not alcoholic',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const item = result.data.items[0];
      expect(item?.is_alcoholic).toBe(false);
      expect(item?.volume_ml).toBeUndefined();
      expect(item?.abv_percent).toBeUndefined();
    }
  });

  it('parses a mixed-items response: one alcoholic + one food', () => {
    const result = ParseResult.safeParse({
      items: [
        { ...baseItem, name: 'burger', is_alcoholic: false },
        { ...baseItem, name: 'IPA', is_alcoholic: true, volume_ml: 473, abv_percent: 6.5 },
      ],
      reasoning: 'burger and a pint of IPA',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]?.is_alcoholic).toBe(false);
      expect(result.data.items[1]?.is_alcoholic).toBe(true);
      expect(result.data.items[1]?.volume_ml).toBe(473);
      expect(result.data.items[1]?.abv_percent).toBe(6.5);
    }
  });

  it('rejects a response with is_alcoholic=true but missing volume_ml', () => {
    const result = ParseResult.safeParse({
      items: [{ ...baseItem, is_alcoholic: true, abv_percent: 5 }],
      reasoning: 'incomplete',
    });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-bounds abv_percent (>100)', () => {
    const result = ParseResult.safeParse({
      items: [{ ...baseItem, is_alcoholic: true, volume_ml: 355, abv_percent: 150 }],
      reasoning: 'impossible ABV',
    });
    expect(result.success).toBe(false);
  });

  it('parses an empty items array (no alcohol fields involved)', () => {
    const result = ParseResult.safeParse({ items: [], reasoning: 'no food detected' });
    expect(result.success).toBe(true);
  });

  it('accepts a legacy response without any alcohol fields (back-compat)', () => {
    const result = ParseResult.safeParse({
      items: [{ ...baseItem }],
      reasoning: 'legacy shape, no alcohol contract',
    });
    expect(result.success).toBe(true);
  });
});
