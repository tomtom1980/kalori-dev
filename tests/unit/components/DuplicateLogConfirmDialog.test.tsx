import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DuplicateLogConfirmDialog } from '@/components/primitives/DuplicateLogConfirmDialog';

describe('<DuplicateLogConfirmDialog />', () => {
  it('renders an in-app alert dialog with cancel focused first', async () => {
    render(
      <DuplicateLogConfirmDialog
        open
        message="You have already logged this item for this meal today."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/already logged this item/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('duplicate-log-cancel')).toHaveFocus();
    });
  });

  it('routes cancel and confirm through callbacks', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <DuplicateLogConfirmDialog
        open
        message="Duplicate?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByTestId('duplicate-log-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('duplicate-log-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
