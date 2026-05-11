/**
 * Task 3.4 — <DiscardDraftAlertDialog /> Radix AlertDialog tests.
 *
 * Replaces 3.3's `window.confirm` discard path with a SR-friendly nested
 * Radix AlertDialog (synthesis §2.9). Cancel = autofocus + KEEP DRAFT
 * label (oxblood primary fill). Discard = ember outline destructive.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { DiscardDraftAlertDialog } from '@/app/(app)/log/_components/DiscardDraftAlertDialog';

describe('<DiscardDraftAlertDialog />', () => {
  it('renders nothing when closed', () => {
    render(<DiscardDraftAlertDialog open={false} onCancel={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders with title + description + KEEP DRAFT (oxblood) + DISCARD (ember outline)', () => {
    render(<DiscardDraftAlertDialog open={true} onCancel={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/discard unsaved entry/i)).toBeInTheDocument();
    expect(screen.getByTestId('discard-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('discard-confirm')).toBeInTheDocument();
  });

  it('clicking KEEP DRAFT fires onCancel', async () => {
    const onCancel = vi.fn();
    render(<DiscardDraftAlertDialog open={true} onCancel={onCancel} onDiscard={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('discard-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking DISCARD fires onDiscard', async () => {
    const onDiscard = vi.fn();
    render(<DiscardDraftAlertDialog open={true} onCancel={vi.fn()} onDiscard={onDiscard} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('discard-confirm'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('autofocuses the Cancel (KEEP DRAFT) button on open per APG destructive-emphasis', async () => {
    render(<DiscardDraftAlertDialog open={true} onCancel={vi.fn()} onDiscard={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('discard-cancel')).toHaveFocus();
    });
  });

  it('has no axe-core violations when open', async () => {
    const { container } = render(
      <DiscardDraftAlertDialog open={true} onCancel={vi.fn()} onDiscard={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
