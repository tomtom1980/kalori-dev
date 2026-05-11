/**
 * Component tests for <CalorieAdherenceBar /> (Task 4.3a).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { CalorieAdherenceBar } from '@/components/charts/CalorieAdherenceBar';

import type { CalorieAdherenceData } from '@/lib/aggregations/progress';

function makeData(overrides?: Partial<CalorieAdherenceData>): CalorieAdherenceData {
  return {
    range: 'W',
    tz: 'Asia/Ho_Chi_Minh',
    points: [
      { bucket: '2026-04-18', kcalConsumed: 1800, kcalTarget: 2000, adherenceClass: 'on-target' },
      { bucket: '2026-04-19', kcalConsumed: 2100, kcalTarget: 2000, adherenceClass: 'over' },
      { bucket: '2026-04-20', kcalConsumed: 1000, kcalTarget: 2000, adherenceClass: 'under' },
      { bucket: '2026-04-21', kcalConsumed: 1900, kcalTarget: 2000, adherenceClass: 'on-target' },
      { bucket: '2026-04-22', kcalConsumed: 2050, kcalTarget: 2000, adherenceClass: 'on-target' },
      { bucket: '2026-04-23', kcalConsumed: 1850, kcalTarget: 2000, adherenceClass: 'on-target' },
      { bucket: '2026-04-24', kcalConsumed: 1700, kcalTarget: 2000, adherenceClass: 'on-target' },
    ],
    sparse: { daysLogged: 7, threshold: 3, isSparse: false },
    srSummary: 'Calorie adherence, this week: 5 of 7 days on target.',
    window: {
      range: 'W',
      tz: 'Asia/Ho_Chi_Minh',
      startUtc: '2026-04-17T17:00:00.000Z',
      endUtc: '2026-04-24T17:00:00.000Z',
      userTzStartDay: '2026-04-18',
      userTzEndDay: '2026-04-24',
      bucketCount: 7,
      buckets: [
        '2026-04-18',
        '2026-04-19',
        '2026-04-20',
        '2026-04-21',
        '2026-04-22',
        '2026-04-23',
        '2026-04-24',
      ],
    },
    ...overrides,
  };
}

describe('<CalorieAdherenceBar />', () => {
  it('renders one bar per point with correct adherence-class data attribute', () => {
    render(<CalorieAdherenceBar data={makeData()} />);
    const bars = screen.getAllByTestId(/^cab-bar-/);
    expect(bars).toHaveLength(7);
    expect(bars[1]).toHaveAttribute('data-adherence', 'over');
    expect(bars[2]).toHaveAttribute('data-adherence', 'under');
  });

  it('exposes the sr-only summary', () => {
    render(<CalorieAdherenceBar data={makeData()} />);
    expect(screen.getByTestId('chart-calorie-adherence-sr')).toHaveTextContent(
      /calorie adherence, this week/i,
    );
  });

  it('role=img with aria-label on the figure', () => {
    render(<CalorieAdherenceBar data={makeData()} />);
    const fig = screen.getByRole('img');
    expect(fig).toHaveAttribute('aria-label');
  });

  it('renders sparse banner when sparse.isSparse + daysLogged >= 1', () => {
    const data = makeData({
      points: makeData().points.slice(0, 2),
      sparse: { daysLogged: 2, threshold: 3, isSparse: true },
    });
    render(<CalorieAdherenceBar data={data} />);
    expect(screen.getByTestId('chart-calorie-adherence-sparse-banner')).toBeInTheDocument();
  });

  it('renders empty state at zero days', () => {
    const data = makeData({
      points: [],
      sparse: { daysLogged: 0, threshold: 3, isSparse: true },
    });
    render(<CalorieAdherenceBar data={data} />);
    expect(screen.getByTestId('chart-calorie-adherence-empty')).toBeInTheDocument();
    expect(screen.getByText(/BEGIN LOGGING/i)).toBeInTheDocument();
  });

  it('renders <details> data-table drawer', () => {
    render(<CalorieAdherenceBar data={makeData()} />);
    expect(screen.getByText('View as data table')).toBeInTheDocument();
  });

  it('has zero axe violations', async () => {
    const { container } = render(<CalorieAdherenceBar data={makeData()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
