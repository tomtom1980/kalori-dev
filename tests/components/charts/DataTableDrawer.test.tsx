/**
 * Regression tests for sortable data table drawers.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DataTableDrawer } from '@/components/charts/DataTableDrawer';

describe('<DataTableDrawer />', () => {
  it('keeps column headers sticky and exposes sortable header buttons', async () => {
    const user = userEvent.setup();
    render(
      <DataTableDrawer
        summaryLabel="View table"
        caption="Example metrics"
        columns={['Day', 'Kcal']}
        rows={[{ cells: ['2026-05-17', 1200] }, { cells: ['2026-05-18', 1900] }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View table' }));

    const kcalHeader = screen.getByRole('columnheader', { name: /kcal/i });
    expect(kcalHeader).toHaveAttribute('aria-sort', 'none');
    expect(kcalHeader).toHaveStyle({
      position: 'sticky',
      top: '0px',
      zIndex: '2',
    });
    expect(kcalHeader.style.background).not.toMatch(/transparent/i);
    expect(within(kcalHeader).getByRole('button', { name: /sort by kcal/i })).toBeTruthy();
  });

  it('sorts numeric columns high-to-low first, then low-to-high', async () => {
    const user = userEvent.setup();
    render(
      <DataTableDrawer
        summaryLabel="View table"
        caption="Example metrics"
        columns={['Day', 'Kcal']}
        rows={[
          { cells: ['2026-05-17', 1200] },
          { cells: ['2026-05-18', 1900] },
          { cells: ['2026-05-19', 1600] },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View table' }));
    const kcalButton = screen.getByRole('button', { name: /sort by kcal/i });

    await user.click(kcalButton);
    let rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getAllByRole('cell')[0]).toHaveTextContent('2026-05-18');
    expect(screen.getByRole('columnheader', { name: /kcal/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await user.click(kcalButton);
    rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getAllByRole('cell')[0]).toHaveTextContent('2026-05-17');
    expect(screen.getByRole('columnheader', { name: /kcal/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });
});
