/**
 * Task 3.5 Milestone 4.2 - MacroBars tests.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MacroBars } from '@/components/dashboard/MacroBars';
import type { MacroContribution, MacrosByKey } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MacroContribution> = {}): MacroContribution {
  return {
    id: 'e1:0:protein',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-04-22T08:00:00.000Z',
    itemName: 'Eggs',
    portionLabel: '100 g',
    grams: 12,
    pctOfTotal: 75,
    ...overrides,
  };
}

function makeMacros(over?: {
  protein?: 'over' | 'empty';
  carbs?: 'over' | 'empty';
  fat?: 'over' | 'empty';
  fiber?: 'over' | 'empty';
}): MacrosByKey {
  const empty = {
    protein: {
      key: 'protein' as const,
      consumedG: 0,
      targetG: 125,
      pct: 0,
      status: 'empty' as const,
      contributions: [],
    },
    carbs: {
      key: 'carbs' as const,
      consumedG: 0,
      targetG: 225,
      pct: 0,
      status: 'empty' as const,
      contributions: [],
    },
    fat: {
      key: 'fat' as const,
      consumedG: 0,
      targetG: 67,
      pct: 0,
      status: 'empty' as const,
      contributions: [],
    },
    fiber: {
      key: 'fiber' as const,
      consumedG: 0,
      targetG: 25,
      pct: 0,
      status: 'empty' as const,
      contributions: [],
    },
  };
  if (!over) return empty;
  return {
    protein:
      over.protein === 'over'
        ? {
            key: 'protein',
            consumedG: 200,
            targetG: 125,
            pct: 160,
            status: 'over',
            contributions: [contribution({ grams: 200, pctOfTotal: 100 })],
          }
        : over.protein === 'empty'
          ? empty.protein
          : {
              key: 'protein',
              consumedG: 100,
              targetG: 125,
              pct: 80,
              status: 'default',
              contributions: [
                contribution({ entryId: 'e1', itemName: 'Eggs', grams: 60, pctOfTotal: 60 }),
                contribution({
                  id: 'e2:0:protein',
                  entryId: 'e2',
                  mealCategory: 'lunch',
                  itemName: 'Chicken',
                  grams: 40,
                  pctOfTotal: 40,
                }),
              ],
            },
    carbs:
      over.carbs === 'over'
        ? {
            key: 'carbs',
            consumedG: 400,
            targetG: 225,
            pct: 178,
            status: 'over',
            contributions: [contribution({ id: 'e1:0:carbs', grams: 400, pctOfTotal: 100 })],
          }
        : over.carbs === 'empty'
          ? empty.carbs
          : {
              key: 'carbs',
              consumedG: 150,
              targetG: 225,
              pct: 67,
              status: 'default',
              contributions: [contribution({ id: 'e1:0:carbs', grams: 150, pctOfTotal: 100 })],
            },
    fat:
      over.fat === 'over'
        ? {
            key: 'fat',
            consumedG: 150,
            targetG: 67,
            pct: 224,
            status: 'over',
            contributions: [contribution({ id: 'e1:0:fat', grams: 150, pctOfTotal: 100 })],
          }
        : over.fat === 'empty'
          ? empty.fat
          : {
              key: 'fat',
              consumedG: 40,
              targetG: 67,
              pct: 60,
              status: 'default',
              contributions: [contribution({ id: 'e1:0:fat', grams: 40, pctOfTotal: 100 })],
            },
    fiber:
      over.fiber === 'over'
        ? {
            key: 'fiber',
            consumedG: 40,
            targetG: 25,
            pct: 160,
            status: 'over',
            contributions: [contribution({ id: 'e1:0:fiber', grams: 40, pctOfTotal: 100 })],
          }
        : over.fiber === 'empty'
          ? empty.fiber
          : {
              key: 'fiber',
              consumedG: 12,
              targetG: 25,
              pct: 48,
              status: 'default',
              contributions: [
                contribution({ id: 'e1:0:fiber', itemName: 'Toast', grams: 12, pctOfTotal: 100 }),
              ],
            },
  };
}

describe('<MacroBars />', () => {
  it('renders 4 macro breakdown buttons (protein, carbs, fat, fiber)', () => {
    render(<MacroBars macros={makeMacros()} />);
    expect(screen.getByRole('button', { name: /show protein breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show carbs breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show fat breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show fiber breakdown/i })).toBeInTheDocument();
  });

  it('keeps macro status in the accessible trigger label', () => {
    render(<MacroBars macros={makeMacros({ protein: 'over' })} />);
    const protein = screen.getByTestId('macro-row-protein');
    expect(protein.getAttribute('aria-label')).toContain('Over target');
    expect(protein.getAttribute('aria-label')).toContain('200 grams');
  });

  it('over-target shows "OVER" suffix text', () => {
    render(<MacroBars macros={makeMacros({ fat: 'over' })} />);
    expect(screen.getByTestId('macro-row-fat').textContent).toContain('OVER');
  });

  it('empty state shows dash in grams field', () => {
    render(<MacroBars macros={makeMacros()} />);
    const protein = screen.getByTestId('macro-row-protein');
    expect(protein.textContent).toContain('—');
  });

  it('opens a macro breakdown dialog grouped by meal', async () => {
    const user = userEvent.setup();
    render(<MacroBars macros={makeMacros({ carbs: 'empty', fat: 'empty', fiber: 'empty' })} />);

    await user.click(screen.getByRole('button', { name: /show protein breakdown/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Protein breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('macro-breakdown-meal-breakfast')).toHaveTextContent('Eggs');
    expect(screen.getByTestId('macro-breakdown-meal-lunch')).toHaveTextContent('Chicken');
    expect(screen.getByText('40% of total')).toBeInTheDocument();

    await user.click(screen.getByTestId('macro-breakdown-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
