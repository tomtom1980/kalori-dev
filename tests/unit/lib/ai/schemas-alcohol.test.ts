/**
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — `ParsedItem` Zod schema
 * alcohol-detection contract.
 *
 * The schema must accept:
 *   - items without any alcohol fields (legacy entries, non-alcoholic items)
 *   - items with `is_alcoholic: false` and no volume/abv
 *   - items with `is_alcoholic: true` AND `volume_ml` AND `abv_percent`
 *
 * The schema must reject:
 *   - is_alcoholic=true without volume_ml or abv_percent
 *   - volume_ml or abv_percent out of bounds (volume in (0, 5000],
 *     abv in (0, 100])
 *   - non-finite values (NaN, Infinity)
 *   - negative values
 *
 * Defense-in-depth — these bounds mirror the Gemini prompt directive AND
 * the entries-save route Zod schema. Three-layer guard against AI
 * hallucinations producing unrealistic BAC math.
 */
import { describe, expect, it } from 'vitest';

import { ParsedItem } from '@/lib/ai/schemas';

function baseItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'beer',
    portion: 1,
    unit: 'can',
    kcal: 153,
    macros: { protein_g: 1.6, carbs_g: 12.6, fat_g: 0, fiber_g: 0 },
    micros: {},
    confidence: 0.85,
    ...overrides,
  };
}

describe('ParsedItem alcohol fields', () => {
  it('accepts an item WITHOUT any alcohol fields (legacy compat)', () => {
    const result = ParsedItem.safeParse(baseItem());
    expect(result.success).toBe(true);
  });

  it('accepts an item with is_alcoholic=false and no volume/abv', () => {
    const result = ParsedItem.safeParse(baseItem({ is_alcoholic: false }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_alcoholic).toBe(false);
      expect(result.data.volume_ml).toBeUndefined();
      expect(result.data.abv_percent).toBeUndefined();
    }
  });

  it('accepts an item with is_alcoholic=true plus valid volume_ml and abv_percent', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 355, abv_percent: 5 }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_alcoholic).toBe(true);
      expect(result.data.volume_ml).toBe(355);
      expect(result.data.abv_percent).toBe(5);
    }
  });

  it('rejects is_alcoholic=true WITHOUT volume_ml', () => {
    const result = ParsedItem.safeParse(baseItem({ is_alcoholic: true, abv_percent: 5 }));
    expect(result.success).toBe(false);
  });

  it('rejects is_alcoholic=true WITHOUT abv_percent', () => {
    const result = ParsedItem.safeParse(baseItem({ is_alcoholic: true, volume_ml: 355 }));
    expect(result.success).toBe(false);
  });

  it('rejects volume_ml = 0 (must be > 0)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 0, abv_percent: 5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects volume_ml > 5000 (upper bound)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 5001, abv_percent: 5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects abv_percent = 0 (must be > 0)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 355, abv_percent: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects abv_percent > 100 (upper bound)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 355, abv_percent: 101 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects negative volume_ml', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: -10, abv_percent: 5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects negative abv_percent', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 355, abv_percent: -5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects non-finite volume_ml (NaN)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: Number.NaN, abv_percent: 5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects non-finite abv_percent (Infinity)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 355, abv_percent: Number.POSITIVE_INFINITY }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts volume_ml = 5000 and abv_percent = 100 (inclusive upper bounds)', () => {
    const result = ParsedItem.safeParse(
      baseItem({ is_alcoholic: true, volume_ml: 5000, abv_percent: 100 }),
    );
    expect(result.success).toBe(true);
  });
});
