/**
 * Codex R1 F3 regression test — MacroBars cholesterol aria text uses
 * milligrams, not grams.
 *
 * Bug: buildAriaValueText() fed every macro row through the i18n
 * `ariaLabel` / `ariaLabelOver` templates which hard-coded "grams". A
 * cholesterol row at 250mg/300mg was announced as "250 grams of 300
 * target" — a 1000x unit error for screen-reader users.
 *
 * Fix: branch on `row.unit`; when `mg`, use the `ariaLabelMg` /
 * `ariaLabelOverMg` siblings which substitute "milligrams".
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroBars } from '@/components/dashboard/MacroBars';
import type { MacroContribution, MacrosByKey } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MacroContribution> = {}): MacroContribution {
  return {
    id: 'e1:0:cholesterol',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-05-16T08:00:00.000Z',
    itemName: 'Egg',
    portionLabel: '1 large',
    grams: 186,
    amount: 186,
    pctOfTotal: 75,
    ...overrides,
  };
}

function emptyMacroRow(key: 'protein' | 'carbs' | 'fat' | 'fiber') {
  const targets = { protein: 125, carbs: 225, fat: 67, fiber: 25 } as const;
  return {
    key,
    unit: 'g' as const,
    consumedG: 0,
    targetG: targets[key],
    pct: 0,
    status: 'empty' as const,
    contributions: [],
  };
}

function buildCholesterolMacros(opts: {
  consumed: number;
  status: 'default' | 'on-target' | 'over';
}): MacrosByKey {
  return {
    protein: emptyMacroRow('protein'),
    carbs: emptyMacroRow('carbs'),
    fat: emptyMacroRow('fat'),
    fiber: emptyMacroRow('fiber'),
    cholesterol: {
      key: 'cholesterol',
      unit: 'mg',
      consumedG: opts.consumed,
      targetG: 300,
      pct: Math.round((opts.consumed / 300) * 100),
      status: opts.status,
      contributions: [contribution()],
    },
  };
}

describe('<MacroBars /> aria text — Codex R1 F3: mg unit, not grams', () => {
  it('announces a default/on-target cholesterol row in milligrams', () => {
    render(<MacroBars macros={buildCholesterolMacros({ consumed: 250, status: 'on-target' })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const ariaLabel = row.getAttribute('aria-label') ?? '';
    // Critical assertion — must say "milligrams", not "grams".
    expect(ariaLabel).toMatch(/milligrams/i);
    // Must NOT use the legacy grams template that produced "250 grams".
    expect(ariaLabel).not.toMatch(/\b\d+\s+grams\b/);
  });

  it('announces an over-target cholesterol row in milligrams', () => {
    render(<MacroBars macros={buildCholesterolMacros({ consumed: 400, status: 'over' })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const ariaLabel = row.getAttribute('aria-label') ?? '';
    // Over-target template must also use milligrams for both consumed
    // and the overage delta.
    expect(ariaLabel).toMatch(/milligrams/i);
    expect(ariaLabel).toMatch(/over\s+300/i);
    expect(ariaLabel).not.toMatch(/\b\d+\s+grams\b/);
  });

  it('still announces protein (unit "g") in grams', () => {
    const macros = buildCholesterolMacros({ consumed: 250, status: 'on-target' });
    // Make protein non-empty so the on-target branch fires for it too.
    macros.protein = {
      key: 'protein',
      unit: 'g',
      consumedG: 100,
      targetG: 125,
      pct: 80,
      status: 'on-target',
      contributions: [contribution({ itemName: 'Chicken' })],
    };
    render(<MacroBars macros={macros} />);
    const proteinRow = screen.getByTestId('macro-row-protein');
    const ariaLabel = proteinRow.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toMatch(/grams/i);
    // The grams template must NOT have been replaced wholesale by mg.
    expect(ariaLabel).not.toMatch(/milligrams/i);
  });
});
