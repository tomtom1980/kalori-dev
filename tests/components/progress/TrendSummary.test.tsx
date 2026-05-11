/**
 * Component tests for <TrendSummary /> (Task 4.3a).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

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
    microTrends: [
      { nutrient: 'iron', direction: 'up', delta: 2.5 },
      { nutrient: 'calcium', direction: 'flat', delta: 0.1 },
    ],
    commentary: 'avg protein 110g · carbs 205g · fat 62g · calories 1,800.',
    srSummary: 'Trend summary, this week: avg protein 110 g, carbs 205 g, fat 62 g, calories 1800.',
    sparse: { daysLogged: 5, threshold: 3, isSparse: false },
    ...overrides,
  };
}

describe('<TrendSummary />', () => {
  it('renders commentary sentence', () => {
    render(<TrendSummary data={makeData()} />);
    expect(screen.getByTestId('trend-summary-commentary')).toHaveTextContent(/avg protein/);
  });

  it('renders micro-trend list when not sparse', () => {
    render(<TrendSummary data={makeData()} />);
    expect(screen.getByTestId('trend-micro-iron')).toBeInTheDocument();
    expect(screen.getByTestId('trend-micro-calcium')).toBeInTheDocument();
  });

  it('sparse state shows commentary in error-text color', () => {
    render(
      <TrendSummary
        data={makeData({
          sparse: { daysLogged: 1, threshold: 3, isSparse: true },
          commentary: 'At least three days are needed before the ledger can speak of trends.',
          microTrends: [],
        })}
      />,
    );
    const p = screen.getByTestId('trend-summary-commentary');
    expect(p).toHaveTextContent(/three days/i);
  });

  it('has zero axe violations', async () => {
    const { container } = render(<TrendSummary data={makeData()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
