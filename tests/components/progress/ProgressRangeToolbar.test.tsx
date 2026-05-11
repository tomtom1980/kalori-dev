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
  useSearchParams: () => new URLSearchParams('range=W'),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('<ProgressRangeToolbar />', () => {
  it('renders three chips with correct labels, active chip has aria-selected=true', () => {
    render(<ProgressRangeToolbar active="W" windowLabel="WINDOW · TEST" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(['day.', 'week.', 'month.']);
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    expect(active?.textContent).toBe('week.');
    const nonActive = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(nonActive).toHaveLength(2);
  });

  it('uses roving tabindex: only the active chip has tabindex=0', () => {
    render(<ProgressRangeToolbar active="D" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('renders as WAI-ARIA tablist with aria-label', () => {
    render(<ProgressRangeToolbar active="W" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-label', 'Progress date range');
  });

  it('all chips have min-height ≥ 44 via inline style', () => {
    render(<ProgressRangeToolbar active="W" />);
    const tabs = screen.getAllByRole('tab') as HTMLElement[];
    for (const tab of tabs) {
      expect(tab.style.minHeight).toBe('44px');
    }
  });

  it('URL href uses ?range=X for each chip', () => {
    render(<ProgressRangeToolbar active="W" />);
    const tabs = screen.getAllByRole('tab') as HTMLAnchorElement[];
    expect(tabs[0]?.href).toContain('range=D');
    expect(tabs[1]?.href).toContain('range=W');
    expect(tabs[2]?.href).toContain('range=M');
  });

  it('calls router.replace on chip click with scroll:false', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="W" />);
    await user.click(screen.getByText('month.'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=M'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('ArrowRight moves focus + activates next chip', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="W" />);
    const week = screen.getByText('week.') as HTMLAnchorElement;
    week.focus();
    await user.keyboard('{ArrowRight}');
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=M'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('ArrowLeft wraps at the first chip', async () => {
    const user = userEvent.setup();
    mockReplace.mockClear();
    render(<ProgressRangeToolbar active="D" />);
    const day = screen.getByText('day.') as HTMLAnchorElement;
    day.focus();
    await user.keyboard('{ArrowLeft}');
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('range=M'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('has zero axe violations', async () => {
    const { container } = render(<ProgressRangeToolbar active="W" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
