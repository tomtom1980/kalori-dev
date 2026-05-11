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
    });
    expect(normalized.reasoning).toMatch(/1 scoop/i);
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
});
