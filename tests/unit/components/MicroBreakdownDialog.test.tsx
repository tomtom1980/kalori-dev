/**
 * Phase 2B — <MicroBreakdownDialog /> tests.
 *
 * Mirrors the dialog inside MacroBars but is unit-aware (mg / mcg / IU
 * instead of just grams) and keyed off `MicroRow.name` + `MicroRow.unit`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MicroBreakdownDialog } from '@/components/dashboard/MicroBreakdownDialog';
import type { MicroContribution, MicroRow } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MicroContribution> = {}): MicroContribution {
  return {
    id: 'e1:0:Sodium',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-05-14T08:00:00.000Z',
    itemName: 'Pho',
    portionLabel: '500 g',
    amount: 186,
    unit: 'mg',
    pctOfTotal: 30,
    ...overrides,
  };
}

function row(overrides: Partial<MicroRow> = {}): MicroRow {
  return {
    name: 'Sodium',
    consumed: 1820,
    rda: 2300,
    pct: 79,
    status: 'mid',
    unit: 'mg',
    contributions: [],
    ...overrides,
  };
}

describe('<MicroBreakdownDialog />', () => {
  it('renders nothing when row is null', () => {
    const { container } = render(<MicroBreakdownDialog row={null} onClose={() => {}} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders dialog with nutrient name + consumed/target with unit', () => {
    render(
      <MicroBreakdownDialog
        row={row({
          name: 'Sodium',
          consumed: 1820,
          rda: 2300,
          unit: 'mg',
          contributions: [contribution()],
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Sodium breakdown/i)).toBeInTheDocument();
    // Target line: "1820mg logged of 2300mg target"
    expect(screen.getByText(/1820mg/)).toBeInTheDocument();
    expect(screen.getByText(/2300mg/)).toBeInTheDocument();
  });

  it('uses no-reference target line when rda is null', () => {
    render(
      <MicroBreakdownDialog
        row={row({
          name: 'Manganese',
          consumed: 1.4,
          rda: null,
          unit: 'mg',
          contributions: [contribution({ unit: 'mg', amount: 1.4 })],
        })}
        onClose={() => {}}
      />,
    );
    // No-RDA mode: shows "no reference" copy rather than a / target part.
    expect(screen.getByText(/no reference/i)).toBeInTheDocument();
  });

  it('groups contributions by meal category', () => {
    render(
      <MicroBreakdownDialog
        row={row({
          contributions: [
            contribution({
              id: 'a',
              entryId: 'e1',
              mealCategory: 'breakfast',
              itemName: 'Eggs',
              amount: 100,
            }),
            contribution({
              id: 'b',
              entryId: 'e2',
              mealCategory: 'lunch',
              itemName: 'Pho',
              amount: 186,
            }),
            contribution({
              id: 'c',
              entryId: 'e3',
              mealCategory: 'dinner',
              itemName: 'Soup',
              amount: 220,
            }),
            contribution({
              id: 'd',
              entryId: 'e4',
              mealCategory: 'snack',
              itemName: 'Crackers',
              amount: 50,
            }),
            contribution({
              id: 'e',
              entryId: 'e5',
              mealCategory: 'drink',
              itemName: 'Broth',
              amount: 70,
            }),
          ],
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('micro-breakdown-meal-breakfast')).toHaveTextContent('Eggs');
    expect(screen.getByTestId('micro-breakdown-meal-lunch')).toHaveTextContent('Pho');
    expect(screen.getByTestId('micro-breakdown-meal-dinner')).toHaveTextContent('Soup');
    expect(screen.getByTestId('micro-breakdown-meal-snack')).toHaveTextContent('Crackers');
    expect(screen.getByTestId('micro-breakdown-meal-drink')).toHaveTextContent('Broth');
  });

  it('contribution amounts include the unit suffix (e.g., "186 mg" or "186mg")', () => {
    render(
      <MicroBreakdownDialog
        row={row({
          unit: 'mg',
          // Two contributions in the same meal so the meal-total and the
          // per-item amount diverge — disambiguates the "186mg" lookup.
          contributions: [
            contribution({ id: 'p1', itemName: 'Pho', amount: 186, unit: 'mg', pctOfTotal: 30 }),
            contribution({ id: 'p2', itemName: 'Bread', amount: 14, unit: 'mg', pctOfTotal: 2 }),
          ],
        })}
        onClose={() => {}}
      />,
    );
    // Amount renders as "186mg" on the Pho line item.
    expect(screen.getByText('186mg')).toBeInTheDocument();
    expect(screen.getByText(/30% of total/i)).toBeInTheDocument();
  });

  it('close button calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MicroBreakdownDialog row={row({ contributions: [contribution()] })} onClose={onClose} />,
    );
    await user.click(screen.getByTestId('micro-breakdown-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when contributions array is empty', () => {
    render(<MicroBreakdownDialog row={row({ contributions: [] })} onClose={() => {}} />);
    expect(screen.getByTestId('micro-breakdown-empty')).toBeInTheDocument();
  });

  it('handles missing unit gracefully (orphan micros)', () => {
    render(
      <MicroBreakdownDialog
        row={row({
          name: 'Mystery',
          unit: '',
          contributions: [contribution({ unit: '', amount: 7 })],
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Mystery breakdown/i)).toBeInTheDocument();
    // No literal "undefined" in the rendered output.
    expect(screen.queryByText(/undefined/i)).toBeNull();
  });
});
