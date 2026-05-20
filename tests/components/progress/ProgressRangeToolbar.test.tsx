/**
 * Component tests for <ProgressRangeToolbar /> (Task 4.3a).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ProgressRangeToolbar } from '@/app/(app)/progress/_components/ProgressRangeToolbar';

// Shared mock router used across tests; exposed via `getMockRouter()` below
// instead of a typescript-confusing `__router` escape hatch.
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/progress',
  useSearchParams: () => new URLSearchParams('range=last_7'),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('<ProgressRangeToolbar />', () => {
  it('renders Last 7 days, Last 30 days, and Custom segments', () => {
    render(
      <ProgressRangeToolbar
        active="last_7"
        today="2026-05-18"
        windowLabel="LAST 7 DAYS · 2026-05-12 - 2026-05-18"
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Last 7 days', 'Last 30 days', 'Custom']);
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    expect(active?.textContent).toBe('Last 7 days');
    const nonActive = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(nonActive).toHaveLength(2);
  });

  it('renders the date range as an accessible bold label below the toolbar row', () => {
    render(
      <ProgressRangeToolbar
        active="last_7"
        today="2026-05-18"
        windowLabel="LAST 7 DAYS · 2026-05-12 - 2026-05-18"
      />,
    );

    const toolbar = screen.getByTestId('progress-range-toolbar');
    const label = screen.getByTestId('progress-range-window-label');
    expect(label).toHaveTextContent('LAST 7 DAYS · 2026-05-12 - 2026-05-18');
    expect(label).not.toHaveAttribute('aria-hidden');
    expect(toolbar.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.getAttribute('style')).toContain('color: var(--color-oxblood-soft)');
    expect(label.getAttribute('style')).toContain('font-weight: 700');
    expect(label.getAttribute('style')).toContain('text-transform: uppercase');
  });

  it('uses roving tabindex: only the active chip has tabindex=0', () => {
    render(<ProgressRangeToolbar active="last_30" today="2026-05-18" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('renders as WAI-ARIA tablist with aria-label', () => {
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-label', 'Progress date range');
  });

  it('all chips have min-height ≥ 44 via inline style', () => {
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    const tabs = screen.getAllByRole('tab') as HTMLElement[];
    for (const tab of tabs) {
      expect(tab.style.minHeight).toBe('44px');
    }
  });

  it('URL href uses the new canonical range slugs without auto-applying custom', () => {
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    const tabs = screen.getAllByRole('tab') as HTMLAnchorElement[];
    expect(tabs[0]?.href).toContain('range=last_7');
    expect(tabs[1]?.href).toContain('range=last_30');
    expect(tabs[2]?.href).toContain('range=custom');
  });

  it('calls router.replace on chip click with scroll:false', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    await user.click(screen.getByText('Last 30 days'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=last_30'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('marks the requested range busy until the server-rendered active range catches up', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);

    const nextRange = screen.getByTestId('progress-range-chip-last_30');
    await user.click(nextRange);

    expect(nextRange).toHaveAttribute('aria-busy', 'true');
    expect(nextRange).toHaveAttribute('aria-disabled', 'true');
    expect(nextRange).toHaveAttribute('data-pending', 'true');
    expect(screen.getByTestId('progress-range-loading-overlay')).toHaveTextContent(
      'Refreshing range',
    );
    expect(screen.getByTestId('progress-range-loading-overlay')).toHaveTextContent(
      'Loading last 30 days data.',
    );
    expect(
      screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
  });

  it('ArrowRight moves focus + activates next chip', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    const last7 = screen.getByText('Last 7 days') as HTMLAnchorElement;
    last7.focus();
    await user.keyboard('{ArrowRight}');
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=last_30'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('ArrowLeft wraps at the first chip', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    const last7 = screen.getByText('Last 7 days') as HTMLAnchorElement;
    last7.focus();
    await user.keyboard('{ArrowLeft}');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('progress-custom-range-popover')).toBeTruthy();
  });

  it('opens the custom editor without navigating, then commits a valid custom range', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);

    await user.click(screen.getByTestId('progress-range-chip-custom'));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('progress-custom-range-popover')).toBeTruthy();

    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-05-03');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-05-12');
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=custom&start=2026-05-03&end=2026-05-12'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('blocks invalid custom ranges inline without navigating', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);

    await user.click(screen.getByTestId('progress-range-chip-custom'));
    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-05-12');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-05-11');
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start date must be on or before end date.',
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('syncs custom date inputs when URL-derived props change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProgressRangeToolbar
        active="custom"
        today="2026-05-18"
        customStart="2026-05-01"
        customEnd="2026-05-10"
      />,
    );

    await user.click(screen.getByTestId('progress-range-chip-custom'));
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-05-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-05-10');

    rerender(
      <ProgressRangeToolbar
        active="custom"
        today="2026-05-18"
        customStart="2026-05-03"
        customEnd="2026-05-12"
      />,
    );

    expect(screen.getByLabelText('Start date')).toHaveValue('2026-05-03');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-05-12');
  });

  it('blocks future and overlong custom ranges inline without navigating', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);

    await user.click(screen.getByTestId('progress-range-chip-custom'));
    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-05-17');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-05-19');
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(screen.getByRole('alert')).toHaveTextContent('End date cannot be in the future.');
    expect(mockReplace).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2025-05-01');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-05-18');
    await user.click(screen.getByRole('button', { name: 'Apply custom range' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Custom range cannot exceed 365 days.');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps native date inputs as the accessible 44px controls', async () => {
    const user = userEvent.setup();
    render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);

    await user.click(screen.getByTestId('progress-range-chip-custom'));

    const start = screen.getByLabelText('Start date') as HTMLInputElement;
    const end = screen.getByLabelText('End date') as HTMLInputElement;
    expect(start.type).toBe('date');
    expect(end.type).toBe('date');
    expect(start.style.minHeight).toBe('44px');
    expect(end.style.minHeight).toBe('44px');
  });

  it('has zero axe violations', async () => {
    const { container } = render(<ProgressRangeToolbar active="last_7" today="2026-05-18" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
