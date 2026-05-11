/**
 * Component tests for <LoggingConsistencyCalendar /> (Task 4.3a).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { LoggingConsistencyCalendar } from '@/components/charts/LoggingConsistencyCalendar';

import type { LoggingConsistencyData } from '@/lib/aggregations/progress';

function makeData(overrides?: Partial<LoggingConsistencyData>): LoggingConsistencyData {
  return {
    range: 'W',
    tz: 'UTC',
    days: [
      { date: '2026-04-18', logged: true, entryCount: 3 },
      { date: '2026-04-19', logged: true, entryCount: 2 },
      { date: '2026-04-20', logged: false, entryCount: 0 },
      { date: '2026-04-21', logged: true, entryCount: 1 },
      { date: '2026-04-22', logged: true, entryCount: 3 },
      { date: '2026-04-23', logged: true, entryCount: 2 },
      { date: '2026-04-24', logged: false, entryCount: 0 },
    ],
    weekdayStart: 'monday',
    srSummary: 'Logging consistency, this week: 5 of 7 days logged. 11 meals in range.',
    sparse: { daysLogged: 5, threshold: 3, isSparse: false },
    totalMealsInRange: 11,
    window: {
      range: 'W',
      tz: 'UTC',
      startUtc: '',
      endUtc: '',
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

describe('<LoggingConsistencyCalendar />', () => {
  it('renders 7 gridcells for W range', () => {
    render(<LoggingConsistencyCalendar data={makeData()} />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(7);
  });

  it('cell for logged day has bucket attr > 0', () => {
    render(<LoggingConsistencyCalendar data={makeData()} />);
    expect(screen.getByTestId('lcc-cell-2026-04-18').getAttribute('data-bucket')).toBe('3');
    expect(screen.getByTestId('lcc-cell-2026-04-20').getAttribute('data-bucket')).toBe('0');
  });

  it('renders empty-state caption when totalMealsInRange=0', () => {
    const data = makeData({
      days: makeData().days.map((d) => ({ ...d, logged: false, entryCount: 0 })),
      totalMealsInRange: 0,
      sparse: { daysLogged: 0, threshold: 3, isSparse: true },
    });
    render(<LoggingConsistencyCalendar data={data} />);
    expect(screen.getByTestId('chart-logging-consistency-empty')).toBeInTheDocument();
  });

  it('has zero axe violations', async () => {
    const { container } = render(<LoggingConsistencyCalendar data={makeData()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
