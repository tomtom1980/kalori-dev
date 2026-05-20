/**
 * Cholesterol macro extension — Zod schema contract.
 *
 * `ParsedItem.macros.cholesterol_mg` is the 5th tracked macro. Unit is mg
 * (matches USDA / FDA Daily Value convention). The field is OPTIONAL with
 * a default of 0 — historical AI responses + library items + test fixtures
 * pre-date the field and MUST continue to parse cleanly. Going forward
 * Gemini returns it on every item.
 */
import { describe, expect, it } from 'vitest';

import { ParsedItem } from '@/lib/ai/schemas';

function baseItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'apple',
    portion: 1,
    unit: 'piece',
    kcal: 95,
    macros: {
      protein_g: 0.5,
      carbs_g: 25,
      fat_g: 0.3,
      fiber_g: 4.4,
      ...((overrides.macrosOverride as Record<string, unknown> | undefined) ?? {}),
    },
    micros: {},
    confidence: 0.9,
    ...overrides,
  };
}

describe('ParsedItem.macros.cholesterol_mg', () => {
  it('accepts an item with cholesterol_mg present', () => {
    const item = baseItem({
      macrosOverride: { cholesterol_mg: 50 },
    });
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.macros.cholesterol_mg).toBe(50);
    }
  });

  it('accepts an item WITHOUT cholesterol_mg (historical compat)', () => {
    // No cholesterol_mg key at all — represents legacy entries already in
    // food_entries.items JSONB. MUST parse cleanly, otherwise the entire
    // log path breaks for the user's historical data. The field is
    // optional (not defaulted to 0) so the output type stays honest
    // about historical rows that lack the value.
    const item = baseItem();
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.macros.cholesterol_mg).toBeUndefined();
    }
  });

  it('rejects negative cholesterol_mg', () => {
    const item = baseItem({ macrosOverride: { cholesterol_mg: -5 } });
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('rejects non-finite cholesterol_mg (NaN)', () => {
    const item = baseItem({ macrosOverride: { cholesterol_mg: Number.NaN } });
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('rejects non-finite cholesterol_mg (Infinity)', () => {
    const item = baseItem({ macrosOverride: { cholesterol_mg: Number.POSITIVE_INFINITY } });
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('accepts cholesterol_mg = 0', () => {
    const item = baseItem({ macrosOverride: { cholesterol_mg: 0 } });
    const result = ParsedItem.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.macros.cholesterol_mg).toBe(0);
    }
  });
});

describe('ParsedItem.approxGrams', () => {
  it('accepts AI-provided approximate grams for non-gram serving units', () => {
    const result = ParsedItem.safeParse(baseItem({ unit: 'bowl', approxGrams: 420 }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approxGrams).toBe(420);
    }
  });

  it('rejects negative approximate grams', () => {
    expect(ParsedItem.safeParse(baseItem({ unit: 'piece', approxGrams: -1 })).success).toBe(false);
  });
});
