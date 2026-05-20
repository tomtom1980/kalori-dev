/**
 * Task 4.3b — `<WeightTrajectoryLine />` tests.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeightTrajectoryLine } from '@/components/charts/WeightTrajectoryLine';

describe('<WeightTrajectoryLine />', () => {
  it('renders empty-state copy when entries=[]', () => {
    render(<WeightTrajectoryLine entries={[]} goalWeightKg={65} range="30d" />);
    expect(screen.getByTestId('weight-trajectory-empty')).toBeTruthy();
  });

  it('single-measurement state renders one dot + sparse copy', () => {
    render(
      <WeightTrajectoryLine
        entries={[{ date: '2026-04-24', weightKg: 72 }]}
        goalWeightKg={65}
        range="30d"
      />,
    );
    expect(screen.getByTestId('weight-trajectory-single')).toBeTruthy();
    expect(screen.getByTestId('weight-trajectory-point-0')).toBeTruthy();
  });

  it('2-4 measurement state hides trend + shows low-count notice', () => {
    render(
      <WeightTrajectoryLine
        entries={[
          { date: '2026-04-20', weightKg: 72 },
          { date: '2026-04-22', weightKg: 71.8 },
          { date: '2026-04-24', weightKg: 71.5 },
        ]}
        goalWeightKg={65}
        range="30d"
      />,
    );
    expect(screen.getByTestId('weight-trajectory-low-count')).toBeTruthy();
    expect(screen.queryByTestId('weight-trajectory-trend')).toBeNull();
  });

  it('≥5 measurements renders trend line + projection', () => {
    const entries = [
      { date: '2026-04-10', weightKg: 72.5 },
      { date: '2026-04-12', weightKg: 72.2 },
      { date: '2026-04-14', weightKg: 72.0 },
      { date: '2026-04-16', weightKg: 71.8 },
      { date: '2026-04-18', weightKg: 71.5 },
    ];
    render(<WeightTrajectoryLine entries={entries} goalWeightKg={68} range="30d" />);
    expect(screen.queryByTestId('weight-trajectory-trend')).toBeTruthy();
    // At least one projection segment.
    const proj =
      document.querySelector('[data-testid="weight-trajectory-projection-ember"]') ||
      document.querySelector('[data-testid="weight-trajectory-projection-plum"]');
    expect(proj).toBeTruthy();
  });

  it('renders recorded dates on the x-axis for each measurement point', () => {
    render(
      <WeightTrajectoryLine
        entries={[
          { date: '2026-04-20', weightKg: 72 },
          { date: '2026-04-22', weightKg: 71.8 },
          { date: '2026-04-24', weightKg: 71.5 },
        ]}
        goalWeightKg={65}
        range="30d"
      />,
    );
    expect(screen.getByTestId('weight-trajectory-date-label-0')).toHaveTextContent('Apr 20');
    expect(screen.getByTestId('weight-trajectory-date-label-1')).toHaveTextContent('Apr 22');
    expect(screen.getByTestId('weight-trajectory-date-label-2')).toHaveTextContent('Apr 24');
  });

  it('gap >14 days renders dashed break + annotation', () => {
    const entries = [
      { date: '2026-03-01', weightKg: 72 },
      { date: '2026-03-30', weightKg: 71 }, // 29-day gap
    ];
    render(<WeightTrajectoryLine entries={entries} goalWeightKg={null} range="30d" />);
    expect(document.querySelector('[data-testid="weight-trajectory-gap-line"]')).toBeTruthy();
  });

  it('figure carries role + aria-labelledby for screen-reader semantics', () => {
    const entries = [{ date: '2026-04-24', weightKg: 72 }];
    const { container } = render(
      <WeightTrajectoryLine entries={entries} goalWeightKg={null} range="7d" />,
    );
    const fig = container.querySelector('figure');
    expect(fig).toBeTruthy();
    expect(fig?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(fig?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('renders point, goal, and live values in pounds when unitPref=imperial', () => {
    render(
      <WeightTrajectoryLine
        entries={[
          { date: '2026-04-20', weightKg: 75 },
          { date: '2026-04-24', weightKg: 74 },
        ]}
        goalWeightKg={70}
        range="30d"
        unitPref="imperial"
      />,
    );

    const firstPoint = screen.getByTestId('weight-trajectory-point-0');
    expect(firstPoint).toHaveAttribute('aria-label', expect.stringContaining('165.3 pounds'));
    expect(firstPoint).not.toHaveAttribute('aria-label', expect.stringContaining('75 kilograms'));

    fireEvent.focus(firstPoint);
    expect(screen.getByRole('status')).toHaveTextContent('165.3 lb');
    expect(screen.getByTestId('weight-trajectory-line')).toHaveTextContent('154.3');
  });
});
