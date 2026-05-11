/**
 * Task 3.5 Milestone 4.5 — MicronutrientPanel tests.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MicronutrientPanel } from '@/components/dashboard/MicronutrientPanel';
import type { MicroRow } from '@/lib/dashboard/types';

const rows: MicroRow[] = [
  { name: 'protein', consumed: 55, rda: 50, pct: 110, status: 'good' },
  { name: 'iron', consumed: 9, rda: 18, pct: 50, status: 'mid' },
  { name: 'vitamin D', consumed: 5, rda: 20, pct: 25, status: 'low' },
  { name: 'vitamin C', consumed: 120, rda: 90, pct: 133, status: 'over' },
  { name: 'calcium', consumed: 600, rda: 1000, pct: 60, status: 'mid' },
  { name: 'fiber', consumed: 14, rda: 28, pct: 50, status: 'mid' },
  { name: 'magnesium', consumed: 100, rda: 400, pct: 25, status: 'low' },
  { name: 'potassium', consumed: 2000, rda: 3500, pct: 57, status: 'mid' },
  { name: 'zinc', consumed: 5, rda: 11, pct: 45, status: 'low' },
  { name: 'sodium', consumed: 1500, rda: 2300, pct: 65, status: 'mid' },
  { name: 'vitamin A', consumed: 500, rda: 900, pct: 56, status: 'mid' },
];

describe('<MicronutrientPanel />', () => {
  it('shows the visibleCount prefix of rows by default', () => {
    render(<MicronutrientPanel rows={rows} visibleCount={7} />);
    // 7 visible rows; expand toggle button for the remaining 4.
    const meters = screen.getAllByRole('meter');
    expect(meters.length).toBe(7);
  });

  it('clicking expand toggle reveals all rows', async () => {
    render(<MicronutrientPanel rows={rows} visibleCount={7} />);
    const toggle = screen.getByTestId('micros-overflow-toggle');
    await userEvent.click(toggle);
    const meters = screen.getAllByRole('meter');
    expect(meters.length).toBe(rows.length);
  });

  it('no overflow toggle when rows fit within visibleCount', () => {
    render(<MicronutrientPanel rows={rows.slice(0, 6)} visibleCount={10} />);
    expect(screen.queryByTestId('micros-overflow-toggle')).toBeNull();
  });

  it('renders empty state when rows is empty', () => {
    render(<MicronutrientPanel rows={[]} visibleCount={10} />);
    expect(screen.getByText(/— nothing to audit yet —/i)).toBeInTheDocument();
  });

  it('each row has role=meter with aria-valuetext', () => {
    render(<MicronutrientPanel rows={rows.slice(0, 3)} visibleCount={10} />);
    const proteinRow = screen.getByTestId('micro-row-protein');
    expect(proteinRow.getAttribute('role')).toBe('meter');
    expect(proteinRow.getAttribute('aria-valuetext')).toContain('protein');
  });
});
