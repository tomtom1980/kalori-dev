/**
 * <BulkActionsBar /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BulkActionsBar } from '@/app/(app)/library/_components/BulkActionsBar';

function setup(overrides: Partial<Parameters<typeof BulkActionsBar>[0]> = {}) {
  const props = {
    selectedCount: 2,
    hiddenCount: 0,
    onMerge: vi.fn(),
    onBulkDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const utils = render(<BulkActionsBar {...props} />);
  return { ...utils, props };
}

describe('<BulkActionsBar />', () => {
  it('renders the selected count', () => {
    setup({ selectedCount: 3 });
    expect(screen.getByTestId('library-bulk-count').textContent).toMatch(/3/);
  });

  it('+K HIDDEN chip renders when hiddenCount > 0', () => {
    setup({ hiddenCount: 2 });
    expect(screen.getByTestId('library-bulk-hidden').textContent).toMatch(/2/);
  });

  it('MERGE button aria-disabled=true when N != 2', () => {
    setup({ selectedCount: 3 });
    expect(screen.getByTestId('library-merge-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('MERGE button aria-disabled=false when N == 2', () => {
    setup({ selectedCount: 2 });
    expect(screen.getByTestId('library-merge-button')).toHaveAttribute('aria-disabled', 'false');
  });

  it('clicking MERGE calls onMerge when N=2', async () => {
    const user = userEvent.setup();
    const { props } = setup({ selectedCount: 2 });
    await user.click(screen.getByTestId('library-merge-button'));
    expect(props.onMerge).toHaveBeenCalledTimes(1);
  });

  it('clicking BULK DELETE calls onBulkDelete', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByTestId('library-bulk-delete-button'));
    expect(props.onBulkDelete).toHaveBeenCalledTimes(1);
  });

  it('clicking CANCEL calls onCancel', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByTestId('library-bulk-cancel-button'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('Delete key triggers onBulkDelete', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.keyboard('{Delete}');
    expect(props.onBulkDelete).toHaveBeenCalledTimes(1);
  });

  it('M key triggers onMerge only when N=2', async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup({ selectedCount: 3 });
    await user.keyboard('m');
    expect(props.onMerge).not.toHaveBeenCalled();

    rerender(
      <BulkActionsBar
        selectedCount={2}
        hiddenCount={0}
        onMerge={props.onMerge}
        onBulkDelete={props.onBulkDelete}
        onCancel={props.onCancel}
      />,
    );
    await user.keyboard('m');
    expect(props.onMerge).toHaveBeenCalledTimes(1);
  });
});
