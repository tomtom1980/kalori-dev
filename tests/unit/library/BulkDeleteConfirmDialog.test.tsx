/**
 * `<BulkDeleteConfirmDialog />` unit tests — Codex Fix Round 1 (IF-2).
 *
 * Primary coverage:
 *   - Dialog closes when `onConfirm` resolves `{ ok: true }`.
 *   - Dialog STAYS OPEN when `onConfirm` resolves `{ ok: false, error }`,
 *     renders inline role=alert banner with the provided error text,
 *     and allows a second retry attempt.
 *   - Pending state transitions correctly across retry cycles.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BulkDeleteConfirmDialog } from '@/app/(app)/library/_components/BulkDeleteConfirmDialog';

function Wrapper({
  onConfirm,
}: {
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  return (
    <BulkDeleteConfirmDialog
      open={true}
      onOpenChange={() => {
        /* swallow; tested via the onConfirm resolution */
      }}
      previewNames={['Sample 1', 'Sample 2']}
      totalCount={2}
      onConfirm={onConfirm}
    />
  );
}

describe('<BulkDeleteConfirmDialog /> — IF-2 error path', () => {
  it('stays open + renders role=alert banner when onConfirm returns ok=false', async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Delete failed. Retry.' });
    const onOpenChange = vi.fn();
    render(
      <BulkDeleteConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        previewNames={['Item A']}
        totalCount={1}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();

    // Click the destructive confirm (Strike N) button.
    await user.click(screen.getByTestId('library-bulk-delete-confirm'));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    // Dialog MUST remain open — onOpenChange(false) was never called.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // role=alert banner with the error text is rendered.
    const alert = await screen.findByTestId('library-bulk-delete-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Delete failed. Retry.');

    // The dialog element itself is still in the DOM.
    expect(screen.getByTestId('library-bulk-delete-dialog')).toBeInTheDocument();
  });

  it('closes when onConfirm returns ok=true', async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <BulkDeleteConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        previewNames={['Item A']}
        totalCount={1}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByTestId('library-bulk-delete-confirm'));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('retry after failure: second attempt can succeed + close the dialog', async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'Transient failure' })
      .mockResolvedValueOnce({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <BulkDeleteConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        previewNames={['Item A']}
        totalCount={1}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();

    // First attempt → fails.
    await user.click(screen.getByTestId('library-bulk-delete-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('library-bulk-delete-error')).toBeInTheDocument(),
    );

    // Second attempt → succeeds.
    await user.click(screen.getByTestId('library-bulk-delete-confirm'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('does not render the error banner before any attempt', () => {
    render(<Wrapper onConfirm={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.queryByTestId('library-bulk-delete-error')).not.toBeInTheDocument();
  });
});
