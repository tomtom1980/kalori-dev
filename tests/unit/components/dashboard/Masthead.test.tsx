/**
 * Task 3.5 Milestone 4.1 — Masthead tests.
 *
 * Contract (design-lead §3 + briefing §5.1):
 *   - Renders edition line formatted per `t.masthead.editionFormat`.
 *   - h1 is KALORI wordmark (ux-auditor §1.1 "brand is primary page identity").
 *   - First-visit variant shows welcome subline.
 *   - Double-hairline bottom present.
 */
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
  it('renders the Kalori wordmark as h1', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('KALORI');
  });

  it('renders the edition line with all four parts (n, weekday, day, month, year)', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    const line = screen.getByTestId('masthead-edition');
    expect(line.textContent).toContain('42');
    expect(line.textContent).toContain('Wednesday');
    expect(line.textContent).toContain('22');
    expect(line.textContent).toContain('April');
    expect(line.textContent).toContain('2026');
  });

  it('shows the welcome subline when firstVisit=true', () => {
    render(<Masthead edition={baseEdition} firstVisit={true} />);
    expect(screen.getByText(/First entry. Welcome to the ledger./i)).toBeInTheDocument();
  });

  it('does not show the welcome subline on returning visits', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(screen.queryByText(/First entry. Welcome to the ledger./i)).toBeNull();
  });

  it('renders the section kicker "§ DASHBOARD"', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(screen.getByText(/§ 01 · Dashboard/i)).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<Masthead edition={baseEdition} firstVisit={false} />);
    expect(
      screen.getByText(/A record of what you eat, kept like a journal\./i),
    ).toBeInTheDocument();
  });
});
