/**
 * Phase 2A — MacroBars cholesterol (5th macro) row.
 *
 * Confirms the cholesterol row renders with mg unit suffix (NOT `g`) in both
 * the inline display and the hover/dialog breakdown text, that its label is
 * "Cholesterol", and that the breakdown dialog shows mg-formatted
 * contributions when opened.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MacroBars } from '@/components/dashboard/MacroBars';
import { buildMacroHoverText } from '@/lib/dashboard/build-hover-text-utils';
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

function buildMacros(opts: {
  cholesterolConsumed?: number;
  cholesterolStatus?: 'empty' | 'default' | 'over';
  contributions?: MacroContribution[];
}): MacrosByKey {
  const consumed = opts.cholesterolConsumed ?? 250;
  const status = opts.cholesterolStatus ?? 'default';
  return {
    protein: emptyMacroRow('protein'),
    carbs: emptyMacroRow('carbs'),
    fat: emptyMacroRow('fat'),
    fiber: emptyMacroRow('fiber'),
    cholesterol: {
      key: 'cholesterol',
      unit: 'mg',
      consumedG: consumed,
      targetG: 300,
      pct: Math.round((consumed / 300) * 100),
      status,
      contributions: opts.contributions ?? [
        contribution({ itemName: 'Egg', grams: 186, amount: 186, pctOfTotal: 62 }),
        contribution({
          id: 'e2:0:cholesterol',
          entryId: 'e2',
          mealCategory: 'lunch',
          itemName: 'Beef',
          grams: 80,
          amount: 80,
          pctOfTotal: 27,
        }),
        contribution({
          id: 'e3:0:cholesterol',
          entryId: 'e3',
          mealCategory: 'snack',
          itemName: 'Cheese',
          grams: 27,
          amount: 27,
          pctOfTotal: 11,
        }),
      ],
    },
  };
}

describe('<MacroBars /> — cholesterol (5th macro)', () => {
  it('renders a 5th macro row keyed "cholesterol"', () => {
    render(<MacroBars macros={buildMacros({})} />);
    expect(screen.getByTestId('macro-row-cholesterol')).toBeInTheDocument();
  });

  it('uses "Cholesterol" / "CHOLESTEROL" as the row label', () => {
    render(<MacroBars macros={buildMacros({})} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    // Inline label is uppercase per the existing label pattern.
    expect(row.textContent?.toLowerCase()).toContain('cholesterol');
  });

  it('renders the value in mg (not g): "250mg / 300mg"', () => {
    render(<MacroBars macros={buildMacros({ cholesterolConsumed: 250 })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    // Inline display must use mg.
    expect(row.textContent).toContain('250mg');
    expect(row.textContent).toContain('/ 300mg');
    // And must NOT use the bare "g" suffix attached to the consumed/target.
    // (We accept the substring "300mg" preceded by a digit; the legacy
    // string would have been "250g" / "/ 300g".)
    expect(row.textContent).not.toMatch(/\b250g\b/);
    expect(row.textContent).not.toMatch(/\b300g\b/);
  });

  it('hover text uses mg unit for contributors', () => {
    // The hover popup body is supplied by `buildMacroHoverText` and
    // rendered inside the Radix Tooltip portal. We test the helper output
    // directly — DOM-level tooltip assertions would require simulating
    // the Radix hover-open lifecycle, which is overhead for verifying
    // pure formatting logic.
    const macros = buildMacros({});
    if (!macros.cholesterol) throw new Error('expected cholesterol row');
    const text = buildMacroHoverText(macros.cholesterol);
    // Top 3 contributors come through with mg-formatted amounts.
    expect(text).toContain('Egg 186mg');
    expect(text).toContain('Beef 80mg');
    expect(text).toContain('Cheese 27mg');
    expect(text).not.toMatch(/Egg 186g/);
  });

  it('breakdown dialog renders mg-formatted contributions when opened', async () => {
    const user = userEvent.setup();
    render(<MacroBars macros={buildMacros({})} />);
    await user.click(screen.getByRole('button', { name: /show cholesterol breakdown/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Per-meal totals + per-item amounts must use mg, not g.
    const dialog = screen.getByTestId('macro-breakdown-dialog');
    expect(dialog.textContent).toContain('186mg');
    expect(dialog.textContent).toContain('80mg');
    expect(dialog.textContent).toContain('27mg');
    // Target line in the description: "250mg logged of 300mg target".
    expect(dialog.textContent).toContain('250mg');
    expect(dialog.textContent).toContain('300mg');
    // Guard: no stray bare-g amounts (the contribution units are mg).
    expect(dialog.textContent).not.toMatch(/\b186g\b/);

    await user.click(screen.getByTestId('macro-breakdown-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves the existing 4 macro rows (does not regress protein/carbs/fat/fiber)', () => {
    render(<MacroBars macros={buildMacros({})} />);
    expect(screen.getByTestId('macro-row-protein')).toBeInTheDocument();
    expect(screen.getByTestId('macro-row-carbs')).toBeInTheDocument();
    expect(screen.getByTestId('macro-row-fat')).toBeInTheDocument();
    expect(screen.getByTestId('macro-row-fiber')).toBeInTheDocument();
    expect(screen.getByTestId('macro-row-cholesterol')).toBeInTheDocument();
  });
});
