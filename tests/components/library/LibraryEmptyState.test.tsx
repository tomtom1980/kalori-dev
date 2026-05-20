/**
 * <LibraryEmptyState /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LibraryEmptyState } from '@/app/(app)/library/_components/LibraryEmptyState';

describe('<LibraryEmptyState />', () => {
  it('first-time renders a simple "no library items" heading without a CTA link', () => {
    render(<LibraryEmptyState kind="first-time" />);
    expect(screen.getByTestId('library-empty-first-time')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /no library items yet/i })).toBeInTheDocument();
    // The old "Open the log flow" CTA has been removed — the page-level
    // "Add Item" button at the top of the library is now the single entry
    // point for adding items.
    expect(screen.queryByTestId('library-empty-cta')).not.toBeInTheDocument();
  });

  it('filtered-zero renders heading + body + optional reset button', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<LibraryEmptyState kind="filtered-zero" onReset={onReset} />);
    expect(screen.getByTestId('library-empty-filtered')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('filtered-zero without onReset does not render reset button', () => {
    render(<LibraryEmptyState kind="filtered-zero" />);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});
