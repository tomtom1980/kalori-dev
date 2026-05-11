/**
 * <LibraryEmptyState /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LibraryEmptyState } from '@/app/(app)/library/_components/LibraryEmptyState';

describe('<LibraryEmptyState />', () => {
  it('first-time renders the CTA link to /log?tab=type', () => {
    render(<LibraryEmptyState kind="first-time" />);
    const cta = screen.getByTestId('library-empty-cta');
    expect(cta).toHaveAttribute('href', '/log?tab=type');
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
