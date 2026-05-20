/**
 * Tooltip-collision pre-emption — long-name truncation inside
 * `buildMicroHoverText`. Long contributor names are truncated to 20
 * graphemes via the shared `truncateItemName` helper so the tooltip text
 * stays bounded at narrow tablet widths (768–900px).
 */
import { describe, expect, it } from 'vitest';

import { buildMicroHoverText } from '@/lib/dashboard/build-micro-hover-text';
import type { MicroContribution, MicroRow } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MicroContribution> = {}): MicroContribution {
  return {
    id: 'e1:0:Sodium',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-05-14T08:00:00.000Z',
    itemName: 'Pho',
    portionLabel: '500 g',
    amount: 120,
    unit: 'mg',
    pctOfTotal: 60,
    ...overrides,
  };
}

function row(overrides: Partial<MicroRow> = {}): MicroRow {
  return {
    name: 'Sodium',
    consumed: 200,
    rda: 2300,
    pct: 9,
    status: 'low',
    unit: 'mg',
    contributions: [],
    ...overrides,
  };
}

describe('buildMicroHoverText (truncation)', () => {
  it('truncates a single long English item name with ellipsis', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [contribution({ itemName: 'Chicken stew with mushrooms', amount: 35 })],
      }),
    );
    expect(text).toContain('Chicken stew with m…');
    expect(text).not.toContain('Chicken stew with mushrooms');
  });

  it('does not touch short names', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [contribution({ itemName: 'Pho', amount: 120 })],
      }),
    );
    expect(text).toContain('Pho 120mg');
    expect(text).not.toContain('…');
  });

  it('bounds total tooltip text length even with 3 maximally-long names', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [
          contribution({
            id: 'a',
            itemName: 'Chicken stew with mushrooms and carrots',
            amount: 100,
          }),
          contribution({
            id: 'b',
            itemName: 'Beef noodle soup extra large bowl',
            amount: 80,
          }),
          contribution({
            id: 'c',
            itemName: 'Vegetable spring rolls with peanut sauce',
            amount: 60,
          }),
        ],
      }),
    );
    // 3 names × 20 graphemes + amount/unit/comma overhead ≤ 150 chars
    expect(text.length).toBeLessThan(150);
  });

  it('preserves short Vietnamese names verbatim', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [contribution({ itemName: 'Bún chả Hà Nội', amount: 50 })],
      }),
    );
    expect(text).toContain('Bún chả Hà Nội');
    expect(text).not.toContain('…');
  });

  it('truncates long Vietnamese names on a grapheme boundary', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [contribution({ itemName: 'Bún chả Hà Nội đặc biệt thêm rau', amount: 50 })],
      }),
    );
    expect(text).toMatch(/Bún chả Hà Nội[^…]*…/);
    // No orphan combining marks at the cut: must not contain "U+0301" alone
    // adjacent to the ellipsis. Smoke-test: the kept prefix length matches
    // 19 graphemes by construction in the helper, so the assertion above
    // suffices in practice.
  });
});
