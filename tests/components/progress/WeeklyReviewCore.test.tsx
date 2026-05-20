/**
 * Component tests for <WeeklyReviewCore /> (Task 4.3a shared primitive).
 *
 * Critical invariants covered:
 *   - Drop cap (82px ember) appears ONLY in `variant="full"` + fresh status.
 *   - Drop cap NEVER appears in `variant="compact"` (T6 invariant).
 *   - Sparse-data UI uses verbatim task-card copy.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { WeeklyReviewCore } from '@/components/charts/WeeklyReviewCore';

describe('<WeeklyReviewCore />', () => {
  it('variant=full + fresh → renders drop cap', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="fresh"
        insights={{ body_markdown: 'The protein held steady across three weekdays.' }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(screen.getByTestId('weekly-review-drop-cap')).toBeInTheDocument();
  });

  it('variant=compact + fresh → does NOT render 82px drop cap', () => {
    render(
      <WeeklyReviewCore
        variant="compact"
        status="fresh"
        insights={{ body_markdown: 'The protein held steady.' }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(screen.queryByTestId('weekly-review-drop-cap')).not.toBeInTheDocument();
  });

  it('sparse-data renders verbatim task-card kicker copy', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="sparse-data"
        insights={{
          sparse_data: true,
          logged_days: [{ date: '2026-04-22', summary: '3 meals, 1800 kcal' }],
        }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(screen.getByText(/§ THE EDITOR['’]S NOTE/)).toBeInTheDocument();
    expect(screen.getByText(/Too little logged this week for a full review/)).toBeInTheDocument();
  });

  it('sparse-data renders one bullet per logged day', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="sparse-data"
        insights={{
          sparse_data: true,
          logged_days: [
            { date: '2026-04-22', summary: '3 meals' },
            { date: '2026-04-23', summary: '2 meals' },
          ],
        }}
        weekStartOn="2026-04-21"
      />,
    );
    const bullets = screen.getByTestId('weekly-review-sparse-bullets');
    expect(bullets.querySelectorAll('li')).toHaveLength(2);
  });

  it('sparse-data with zero logged days renders empty-days message', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="sparse-data"
        insights={{ sparse_data: true, logged_days: [] }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(screen.getByText(/No days were logged in the past seven/)).toBeInTheDocument();
  });

  it('period note for D renders today copy without the weekly drop cap', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="fresh"
        insights={{ body_markdown: 'Today shows 2 meals and 1,450 kcal.' }}
        periodRange="D"
      />,
    );

    expect(screen.getByText(/DAILY NOTE/)).toBeInTheDocument();
    expect(screen.getByText(/Today shows 2 meals/)).toBeInTheDocument();
    expect(screen.queryByTestId('weekly-review-drop-cap')).not.toBeInTheDocument();
  });

  it('sparse period note for M names the 30-day window instead of the week', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="sparse-data"
        insights={{ sparse_data: true, logged_days: [] }}
        periodRange="M"
      />,
    );

    expect(screen.getByText(/Too little logged in this 30-day window/)).toBeInTheDocument();
    expect(screen.getByText(/No logs recorded in this 30-day window/)).toBeInTheDocument();
    expect(screen.queryByText(/past seven/)).not.toBeInTheDocument();
  });

  it('custom period note names the selected range instead of the 30-day window', () => {
    render(
      <WeeklyReviewCore
        variant="full"
        status="fresh"
        insights={{ body_markdown: 'The selected range has enough context.' }}
        periodRange="custom"
      />,
    );

    expect(screen.getByText(/SELECTED RANGE NOTE/)).toBeInTheDocument();
    expect(screen.queryByText(/30-DAY NOTE/)).not.toBeInTheDocument();
  });

  it('error status renders role=alert', () => {
    render(
      <WeeklyReviewCore variant="full" status="error" insights={{}} weekStartOn="2026-04-21" />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has zero axe violations — full variant', async () => {
    const { container } = render(
      <WeeklyReviewCore
        variant="full"
        status="fresh"
        insights={{ body_markdown: 'A week in review.' }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has zero axe violations — compact variant', async () => {
    const { container } = render(
      <WeeklyReviewCore
        variant="compact"
        status="fresh"
        insights={{ body_markdown: 'A week in review.' }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has zero axe violations — sparse variant', async () => {
    const { container } = render(
      <WeeklyReviewCore
        variant="full"
        status="sparse-data"
        insights={{ sparse_data: true, logged_days: [] }}
        weekStartOn="2026-04-21"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
