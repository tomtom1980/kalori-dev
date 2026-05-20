/**
 * Phase 2B — <MicrosOverflowToggle /> interactive behavior.
 *
 * The toggle now hosts hover (Tooltip top-contributors preview) + click
 * (full breakdown dialog) for each micro row. Mirrors the MacroBars
 * pattern. Rows with `consumed === 0` are non-interactive (filtered out
 * by the aggregator anyway, but defended at the component layer too).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MicrosOverflowToggle } from '@/components/dashboard/MicrosOverflowToggle';
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
    amount: 186,
    unit: 'mg',
    pctOfTotal: 30,
    ...overrides,
  };
}

const rowsWithContribs: MicroRow[] = [
  {
    name: 'Sodium',
    consumed: 1820,
    rda: 2300,
    pct: 79,
    status: 'mid',
    unit: 'mg',
    contributions: [
      contribution({ id: 'a', itemName: 'Pho', amount: 1200, unit: 'mg', pctOfTotal: 66 }),
      contribution({ id: 'b', itemName: 'Bread', amount: 620, unit: 'mg', pctOfTotal: 34 }),
    ],
  },
  {
    name: 'Iron',
    consumed: 9,
    rda: 18,
    pct: 50,
    status: 'mid',
    unit: 'mg',
    contributions: [
      contribution({ id: 'c', itemName: 'Spinach', amount: 9, unit: 'mg', pctOfTotal: 100 }),
    ],
  },
];

describe('<MicrosOverflowToggle /> interactive', () => {
  it('renders a button trigger with an accessible label for each contributing row', () => {
    render(<MicrosOverflowToggle rows={rowsWithContribs} visibleCount={10} overflowId="ov" />);
    expect(
      screen.getByRole('button', { name: /open sodium contributors breakdown/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open iron contributors breakdown/i }),
    ).toBeInTheDocument();
  });

  it('clicking a row opens the breakdown dialog for that row', async () => {
    const user = userEvent.setup();
    render(<MicrosOverflowToggle rows={rowsWithContribs} visibleCount={10} overflowId="ov" />);
    await user.click(screen.getByRole('button', { name: /open sodium contributors breakdown/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Sodium breakdown/i)).toBeInTheDocument();
  });

  it('closing the dialog removes it from the document', async () => {
    const user = userEvent.setup();
    render(<MicrosOverflowToggle rows={rowsWithContribs} visibleCount={10} overflowId="ov" />);
    await user.click(screen.getByRole('button', { name: /open sodium contributors breakdown/i }));
    await user.click(screen.getByTestId('micro-breakdown-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hover text for a row includes the top contributor with mg units', () => {
    // The hover popup body is supplied by `buildMicroHoverText` and
    // rendered inside the Radix Tooltip portal. We test the helper output
    // directly — DOM-level tooltip assertions would require simulating
    // the Radix hover-open lifecycle.
    const sodiumRow = rowsWithContribs[0];
    if (!sodiumRow) throw new Error('expected sodium row');
    const text = buildMicroHoverText(sodiumRow);
    expect(text).toMatch(/Pho 1200mg/);
  });

  it('rows with consumed === 0 are not wrapped in a clickable trigger', () => {
    const zero: MicroRow[] = [
      {
        name: 'Phantom',
        consumed: 0,
        rda: 10,
        pct: 0,
        status: 'low',
        unit: 'mg',
        contributions: [],
      },
    ];
    render(<MicrosOverflowToggle rows={zero} visibleCount={10} overflowId="ov" />);
    // No "Open Phantom contributors breakdown" button exists.
    expect(
      screen.queryByRole('button', { name: /open phantom contributors breakdown/i }),
    ).toBeNull();
    // But the meter row itself is still rendered.
    expect(screen.getByTestId('micro-row-Phantom')).toBeInTheDocument();
  });

  it('preserves the existing role=meter on the row even when interactive', () => {
    render(<MicrosOverflowToggle rows={rowsWithContribs} visibleCount={10} overflowId="ov" />);
    const meter = screen.getByTestId('micro-row-Sodium');
    expect(meter.getAttribute('role')).toBe('meter');
  });
});
