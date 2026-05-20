import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TrendSummary } from '@/components/charts/TrendSummary';

import type { TrendSummaryData } from '@/lib/aggregations/progress';

function makeData(overrides?: Partial<TrendSummaryData>): TrendSummaryData {
  return {
    range: 'W',
    tz: 'UTC',
    caloriesAvg: 1800,
    proteinAvgG: 110,
    carbsAvgG: 205,
    fatAvgG: 62,
    fiberAvgG: 22,
    cholesterolAvgMg: 220,
    cholesterolTargetMg: 300,
    microTrends: [
      { nutrient: 'iron', direction: 'up', delta: 2.5 },
      { nutrient: 'calcium', direction: 'flat', delta: 0.1 },
    ],
    commentary:
      'avg protein 110g · carbs 205g · fat 62g · fiber 22g · cholesterol 220mg · calories 1,800.',
    srSummary:
      'Trend summary, this week: avg protein 110 g, carbs 205 g, fat 62 g, fiber 22 g, cholesterol 220 mg, calories 1800.',
    sparse: { daysLogged: 5, threshold: 3, isSparse: false },
    ...overrides,
  };
}

describe('<TrendSummary /> — cholesterol (Phase 2D)', () => {
  it('renders a Cholesterol avg row in the data-table dialog with mg unit', async () => {
    const user = userEvent.setup();
    render(<TrendSummary data={makeData()} />);

    await user.click(screen.getByRole('button', { name: /view as data table/i }));

    const rowLabel = await screen.findByText(/Cholesterol avg/i);
    expect(rowLabel).toBeInTheDocument();
    expect(rowLabel.textContent ?? '').toMatch(/mg/i);
  });

  it('renders the cholesterol average value (220) in the data table', async () => {
    const user = userEvent.setup();
    render(<TrendSummary data={makeData()} />);

    await user.click(screen.getByRole('button', { name: /view as data table/i }));

    expect(await screen.findByText('220')).toBeInTheDocument();
  });

  it('cholesterol surfaces in the srSummary string', () => {
    const { container } = render(<TrendSummary data={makeData()} />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent ?? '').toMatch(/cholesterol/i);
  });

  it('cholesterol appears in commentary alongside the four energy macros', () => {
    render(<TrendSummary data={makeData()} />);
    expect(screen.getByTestId('trend-summary-commentary')).toHaveTextContent(/cholesterol/i);
  });
});
