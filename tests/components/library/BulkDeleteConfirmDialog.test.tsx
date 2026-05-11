/**
 * <BulkDeleteConfirmDialog /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BulkDeleteConfirmDialog } from '@/app/(app)/library/_components/BulkDeleteConfirmDialog';

function setup(overrides: Partial<Parameters<typeof BulkDeleteConfirmDialog>[0]> = {}) {
  // IF-2 (Codex adversarial round 1): onConfirm now returns
  // `{ ok: true } | { ok: false; error }` so the dialog can stay open +
  // render an inline error banner on mutation failure.
  const onConfirm = vi.fn().mockResolvedValue({ ok: true });
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    previewNames: ['Banh Mi', 'Pho Bo'],
    totalCount: 2,
    onConfirm,
    ...overrides,
  };
  render(<BulkDeleteConfirmDialog {...props} />);
  return { onConfirm, onOpenChange };
}

describe('<BulkDeleteConfirmDialog />', () => {
  it('renders the plural title with N when totalCount > 1', () => {
    setup({ totalCount: 3 });
    expect(screen.getByTestId('library-bulk-delete-dialog')).toBeInTheDocument();
    expect(screen.getByText(/strike 3 titles/i)).toBeInTheDocument();
  });

  it('renders the singular title when totalCount === 1', () => {
    setup({ totalCount: 1, previewNames: ['Only'] });
    expect(screen.getByText(/strike this title/i)).toBeInTheDocument();
  });

  it('renders CANCEL + STRIKE buttons', () => {
    setup();
    expect(screen.getByTestId('library-bulk-delete-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('library-bulk-delete-confirm')).toBeInTheDocument();
  });

  it('STRIKE button click invokes onConfirm', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByTestId('library-bulk-delete-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CANCEL button click closes the dialog via onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByTestId('library-bulk-delete-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('limits the preview list to 3 names and appends "AND N MORE" when more', () => {
    setup({ totalCount: 5, previewNames: ['A', 'B', 'C', 'D', 'E'] });
    expect(screen.getByText(/and 2 more/i)).toBeInTheDocument();
  });
});
