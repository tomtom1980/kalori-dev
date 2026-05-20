import { describe, expect, it } from 'vitest';

import { normalizeParsedPortions } from '@/lib/ai/portion-sanity';
import type { ParseResultT, ParsedItemT } from '@/lib/ai/schemas';

function item(overrides: Partial<ParsedItemT>): ParsedItemT {
  return {
    name: 'food',
    portion: 1,
    unit: 'g',
    kcal: 100,
    macros: { protein_g: 10, carbs_g: 10, fat_g: 2, fiber_g: 1 },
    micros: {},
    confidence: 0.95,
    ...overrides,
  };
}

function result(items: ParsedItemT[]): ParseResultT {
  return { items, reasoning: 'Initial model estimate.' };
}

describe('normalizeParsedPortions', () => {
  it('repairs impossible gram portions for countable foods', () => {
    const normalized = normalizeParsedPortions(result([item({ name: 'chicken sandwich' })]));

    expect(normalized.items[0]).toMatchObject({
      name: 'chicken sandwich',
      portion: 1,
      unit: 'piece',
      approxGrams: 150,
      kcal: 100,
    });
    expect(normalized.items[0]!.confidence).toBe(0.85);
    expect(normalized.reasoning).toMatch(/adjusted chicken sandwich from 1 g to 1 piece/i);
  });

  it('uses scoops for tiny gram portions of ice cream', () => {
    const normalized = normalizeParsedPortions(result([item({ name: 'vanilla ice cream' })]));

    expect(normalized.items[0]).toMatchObject({
      name: 'vanilla ice cream',
      portion: 1,
      unit: 'scoop',
      approxGrams: 65,
    });
    expect(normalized.reasoning).toMatch(/1 scoop/i);
  });

  it('uses bowls for tiny gram portions of Vietnamese noodle-bowl dishes such as cao lau', () => {
    const normalized = normalizeParsedPortions(result([item({ name: 'cao lau' })]));

    expect(normalized.items[0]).toMatchObject({
      name: 'cao lau',
      portion: 1,
      unit: 'bowl',
      approxGrams: 450,
    });
    expect(normalized.items[0]!.confidence).toBe(0.85);
    expect(normalized.reasoning).toMatch(/adjusted cao lau from 1 g to 1 bowl/i);
  });

  it('falls back to a serving for unknown foods with impossible tiny gram portions', () => {
    const normalized = normalizeParsedPortions(result([item({ name: 'mystery food' })]));

    expect(normalized.items[0]).toMatchObject({
      name: 'mystery food',
      portion: 1,
      unit: 'serving',
      approxGrams: 150,
    });
    expect(normalized.reasoning).toMatch(/adjusted mystery food from 1 g to 1 serving/i);
  });

  it('uses a plausible gram serving for weighed protein foods', () => {
    const normalized = normalizeParsedPortions(result([item({ name: 'grilled salmon' })]));

    expect(normalized.items[0]).toMatchObject({
      name: 'grilled salmon',
      portion: 100,
      unit: 'g',
    });
    expect(normalized.reasoning).toMatch(/100 g/i);
  });

  it('leaves plausible gram portions unchanged', () => {
    const original = result([item({ name: 'grilled salmon', portion: 150, unit: 'g' })]);
    const normalized = normalizeParsedPortions(original);

    expect(normalized).toBe(original);
  });

  it('leaves legitimate tiny gram portions for seasonings unchanged', () => {
    const original = result([item({ name: 'salt', portion: 1, unit: 'g' })]);
    const normalized = normalizeParsedPortions(original);

    expect(normalized).toBe(original);
  });

  it('strips absurd approximate grams and lowers confidence for non-gram foods', () => {
    const normalized = normalizeParsedPortions(
      result([item({ name: 'breakfast sandwich', unit: 'piece', approxGrams: 3000 })]),
    );

    expect(normalized.items[0]).not.toHaveProperty('approxGrams');
    expect(normalized.items[0]!.confidence).toBe(0.85);
    expect(normalized.reasoning).toMatch(/removed implausible approxGrams/i);
  });

  it('keeps plausible food-related approximate grams for non-gram foods', () => {
    const original = result([
      item({ name: 'breakfast sandwich', unit: 'piece', approxGrams: 180 }),
    ]);
    const normalized = normalizeParsedPortions(original);

    expect(normalized).toBe(original);
  });

  it('normalizes localized portion units to English labels', () => {
    const normalized = normalizeParsedPortions(
      result([
        item({ name: 'pho', unit: 'bát', approxGrams: 450 }),
        item({ name: 'cake', unit: 'lát', approxGrams: 80 }),
        item({ name: 'goulash', unit: 'tál', approxGrams: 350 }),
        item({ name: 'apple', unit: 'darab', approxGrams: 150 }),
        item({ name: 'rice', unit: 'đĩa', approxGrams: 300 }),
      ]),
    );

    expect(normalized.items.map((entry) => entry.unit)).toEqual([
      'bowl',
      'slice',
      'bowl',
      'piece',
      'plate',
    ]);
    expect(normalized.items[0]).toMatchObject({ name: 'pho', kcal: 100 });
    expect(normalized.reasoning).toMatch(/normalized unit for pho from bát to bowl/i);
    expect(normalized.reasoning).toMatch(/normalized unit for apple from darab to piece/i);
  });

  it('leaves already-English portion units unchanged without a reasoning note', () => {
    const original = result([item({ name: 'pho', unit: 'bowl', approxGrams: 450 })]);
    const normalized = normalizeParsedPortions(original);

    expect(normalized).toBe(original);
  });
});
