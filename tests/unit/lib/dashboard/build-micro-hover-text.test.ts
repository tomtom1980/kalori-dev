/**
 * Phase 2B — `buildMicroHoverText` helper.
 *
 * Mirrors `buildHoverText` from `MacroBars.tsx` but is unit-aware (micros
 * carry their unit string on `MicroRow.unit` + each contribution). The
 * helper is extracted to a lib module so it can be unit-tested without
 * pulling in the full client component (Tooltip + Dialog + Radix render).
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

describe('buildMicroHoverText', () => {
  it('returns the empty-state message when there are 0 contributors', () => {
    const text = buildMicroHoverText(row({ contributions: [] }));
    expect(text).toMatch(/No Sodium entries yet/i);
  });

  it('lists 1 contributor with the unit suffix', () => {
    const text = buildMicroHoverText(
      row({ contributions: [contribution({ itemName: 'Pho', amount: 120, unit: 'mg' })] }),
    );
    expect(text).toMatch(/Top contributors:/i);
    expect(text).toContain('Pho 120mg');
  });

  it('lists 3 contributors separated by commas', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [
          contribution({ id: 'a', itemName: 'Pho', amount: 120, unit: 'mg' }),
          contribution({ id: 'b', itemName: 'Bread', amount: 60, unit: 'mg' }),
          contribution({ id: 'c', itemName: 'Tea', amount: 20, unit: 'mg' }),
        ],
      }),
    );
    expect(text).toContain('Pho 120mg');
    expect(text).toContain('Bread 60mg');
    expect(text).toContain('Tea 20mg');
  });

  it('truncates to top 3 contributors when more than 3 are present', () => {
    const text = buildMicroHoverText(
      row({
        contributions: [
          contribution({ id: '1', itemName: 'A', amount: 100, unit: 'mg' }),
          contribution({ id: '2', itemName: 'B', amount: 80, unit: 'mg' }),
          contribution({ id: '3', itemName: 'C', amount: 60, unit: 'mg' }),
          contribution({ id: '4', itemName: 'D', amount: 40, unit: 'mg' }),
          contribution({ id: '5', itemName: 'E', amount: 20, unit: 'mg' }),
        ],
      }),
    );
    expect(text).toContain('A 100mg');
    expect(text).toContain('B 80mg');
    expect(text).toContain('C 60mg');
    expect(text).not.toContain('D 40mg');
    expect(text).not.toContain('E 20mg');
  });

  it('renders integers without decimal trailing', () => {
    const text = buildMicroHoverText(
      row({ contributions: [contribution({ amount: 120, unit: 'mg' })] }),
    );
    expect(text).toContain('120mg');
    expect(text).not.toContain('120.0');
  });

  it('renders decimal amounts with one fractional digit', () => {
    const text = buildMicroHoverText(
      row({ contributions: [contribution({ amount: 0.5, unit: 'mcg' })] }),
    );
    expect(text).toContain('0.5mcg');
  });

  it('handles contributions whose unit is the empty string (orphan micros)', () => {
    const text = buildMicroHoverText(
      row({
        unit: '',
        contributions: [contribution({ itemName: 'Mystery', amount: 7, unit: '' })],
      }),
    );
    // No "undefined" leakage when unit is unknown.
    expect(text).not.toContain('undefined');
    expect(text).toContain('Mystery 7');
  });

  it('treats missing contributions array as empty (legacy fixtures safety)', () => {
    const fixture = row();
    delete (fixture as Partial<MicroRow>).contributions;
    const text = buildMicroHoverText(fixture);
    expect(text).toMatch(/No Sodium entries yet/i);
  });
});
