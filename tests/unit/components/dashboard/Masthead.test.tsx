import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Masthead } from '@/components/dashboard/Masthead';
import type { Edition } from '@/lib/dashboard/types';

const baseEdition: Edition = {
  n: 42,
  weekday: 'Wednesday',
  day: 22,
  month: 'April',
  year: 2026,
};

describe('<Masthead />', () => {
  it('renders the dashboard page title as h1', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Dashboard');
  });

  it('renders the date line without the edition number', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    const line = screen.getByTestId('masthead-edition');
    expect(line.textContent).toContain("Today's date is:");
    expect(line.textContent).not.toContain('42');
    expect(line.textContent).toContain('Wednesday');
    expect(line.textContent).toContain('22');
    expect(line.textContent).toContain('April');
    expect(line.textContent).toContain('2026');
  });

  it('shows the inspiration subline when firstVisit=true', () => {
    render(<Masthead edition={baseEdition} firstVisit={true} />);
    expect(
      screen.getByText(/A clear record makes the next meal easier to choose\./i),
    ).toBeInTheDocument();
  });

  it('shows the inspiration subline on returning visits', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(
      screen.getByText(/A clear record makes the next meal easier to choose\./i),
    ).toBeInTheDocument();
  });

  it('does not render the old section kicker', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(screen.queryByText(/§ 01 · Dashboard/i)).toBeNull();
  });

  it('renders the tagline', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(
      screen.getByText(/A record of what you eat, kept like a journal\./i),
    ).toBeInTheDocument();
  });
});
