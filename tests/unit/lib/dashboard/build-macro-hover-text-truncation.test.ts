/**
 * Tooltip-collision pre-emption — macro-row hover text truncation.
 *
 * `buildMacroHoverText` mirrors `buildMicroHoverText` but for the macro
 * grams/mg side-by-side row. Same risk: at 768–900px the macro column is
 * roughly half-width, and a single long contributor name (e.g. "Chicken
 * stew with mushrooms") can blow past the 280px tooltip cap. Truncating
 * to 20 graphemes keeps the text bounded.
 */
import { describe, expect, it } from 'vitest';

import { buildMacroHoverText } from '@/lib/dashboard/build-hover-text-utils';
import type { MacroContribution, MacroRow } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MacroContribution> = {}): MacroContribution {
  return {
    id: 'e1:0:protein',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-05-14T08:00:00.000Z',
    itemName: 'Pho',
    portionLabel: '500 g',
    grams: 30,
    amount: 30,
    pctOfTotal: 50,
    ...overrides,
  };
}

function row(overrides: Partial<MacroRow> = {}): MacroRow {
  return {
    key: 'protein',
    unit: 'g',
    consumedG: 60,
    targetG: 125,
    pct: 48,
    status: 'default',
    contributions: [],
    ...overrides,
  };
}

describe('buildMacroHoverText', () => {
  it('returns the empty-state message when there are 0 contributors', () => {
    const text = buildMacroHoverText(row());
    expect(text).toMatch(/No Protein entries yet/i);
  });

  it('lists short names with the unit suffix', () => {
    const text = buildMacroHoverText(
      row({ contributions: [contribution({ itemName: 'Pho', amount: 30 })] }),
    );
    expect(text).toContain('Pho 30g');
  });

  it('truncates long names with ellipsis', () => {
    const text = buildMacroHoverText(
      row({
        contributions: [contribution({ itemName: 'Chicken stew with mushrooms', amount: 35 })],
      }),
    );
    expect(text).toContain('Chicken stew with m…');
    expect(text).not.toContain('Chicken stew with mushrooms');
  });

  it('bounds total length even with 3 long names', () => {
    const text = buildMacroHoverText(
      row({
        contributions: [
          contribution({
            id: 'a',
            itemName: 'Chicken stew with mushrooms and carrots',
            amount: 50,
          }),
          contribution({
            id: 'b',
            itemName: 'Beef noodle soup extra large bowl',
            amount: 40,
          }),
          contribution({
            id: 'c',
            itemName: 'Vegetable spring rolls with peanut sauce',
            amount: 30,
          }),
        ],
      }),
    );
    expect(text.length).toBeLessThan(150);
  });

  it('uses mg suffix for cholesterol row', () => {
    const text = buildMacroHoverText(
      row({
        key: 'cholesterol',
        unit: 'mg',
        contributions: [contribution({ itemName: 'Egg', amount: 186 })],
      }),
    );
    expect(text).toContain('Egg 186mg');
  });

  it('renders decimal amounts with one fractional digit', () => {
    const text = buildMacroHoverText(row({ contributions: [contribution({ amount: 0.5 })] }));
    expect(text).toContain('0.5g');
  });
});
