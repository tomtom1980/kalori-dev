/**
 * Task 3.5 Milestone 4.4 — ChronometerRing tests.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChronometerRing } from '@/components/charts/ChronometerRing';
import type { ChronometerData } from '@/lib/dashboard/types';

describe('<ChronometerRing />', () => {
  it('renders center calorie hero number in default status', () => {
    const data: ChronometerData = {
      status: 'default',
      consumed: 1200,
      target: 2000,
      fiber: { consumed: 10, target: 25 },
      nowAngle: 180,
      entryCount: 3,
      lastLoggedAt: '2026-04-22T10:00:00.000Z',
    };
    render(<ChronometerRing data={data} />);
    expect(screen.getByTestId('chrono-consumed')).toBeInTheDocument();
    const consumed = screen.getByTestId('chrono-consumed');
    expect(consumed.textContent).toContain('1,200');
  });

  it('renders wrapper with role=img and aria-label mentioning consumed and target', () => {
    const data: ChronometerData = {
      status: 'default',
      consumed: 800,
      target: 2000,
      fiber: { consumed: 5, target: 25 },
      nowAngle: 90,
      entryCount: 2,
      lastLoggedAt: null,
    };
    render(<ChronometerRing data={data} />);
    const wrapper = screen.getByRole('img');
    const label = wrapper.getAttribute('aria-label') ?? '';
    expect(label).toContain('800');
    // Target is formatted via formatNumber() (F-UI-3.7-B) → "2,000" with
    // locale-aware thousands separator instead of the raw "2000".
    expect(label).toContain('2,000');
  });

  it('empty status renders 0 + emptyCaption', () => {
    const data: ChronometerData = { status: 'empty', target: 2000 };
    render(<ChronometerRing data={data} />);
    expect(screen.getByTestId('chrono-consumed').textContent).toContain('0');
    expect(screen.getByText(/— no entries yet today —/i)).toBeInTheDocument();
  });

  it('renders <details> data-table fallback', () => {
    const data: ChronometerData = {
      status: 'default',
      consumed: 500,
      target: 2000,
      fiber: { consumed: 5, target: 25 },
      nowAngle: 90,
      entryCount: 1,
      lastLoggedAt: null,
    };
    render(<ChronometerRing data={data} />);
    const summary = screen.getByText(/View as data table/i);
    expect(summary).toBeInTheDocument();
  });

  it('formats last logged time in the supplied local timezone', () => {
    const data: ChronometerData = {
      status: 'default',
      consumed: 500,
      target: 2000,
      fiber: { consumed: 5, target: 25 },
      nowAngle: 90,
      entryCount: 1,
      lastLoggedAt: '2026-04-22T08:00:00.000Z',
    };
    render(<ChronometerRing data={data} timezone="Asia/Bangkok" />);
    expect(screen.getByTestId('chrono-delta')).toBeInTheDocument();
    expect(document.body.textContent).toContain('last logged 15:00');
  });

  it('over-target status renders past-the-mark delta copy', () => {
    const data: ChronometerData = {
      status: 'over-target',
      consumed: 2500,
      target: 2000,
      fiber: { consumed: 20, target: 25 },
      nowAngle: 270,
      entryCount: 5,
      lastLoggedAt: null,
    };
    render(<ChronometerRing data={data} />);
    expect(screen.getByTestId('chrono-delta').textContent).toMatch(/past the mark/i);
  });
});
