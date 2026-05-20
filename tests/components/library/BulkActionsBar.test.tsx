/**
 * <BulkActionsBar /> component test — Task 4.1 sub-step 3.
 *
 * Bug 2 (library bulk overhaul 2026-05-17): the MERGE CTA has been
 * replaced with a "LOG" (bulk log items) CTA. The bar now exposes
 * `onBulkLog` instead of `onMerge`; keyboard shortcut migrated from `m`
 * to `l`; the disabled-tooltip / aria-disabled semantics are dropped
 * because bulk log enables whenever the bar is mounted (the parent
 * already gates rendering on N>=2).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BulkActionsBar } from '@/app/(app)/library/_components/BulkActionsBar';
import { t } from '@/lib/i18n/en';

function setup(overrides: Partial<Parameters<typeof BulkActionsBar>[0]> = {}) {
  const props = {
    selectedCount: 2,
    hiddenCount: 0,
    onBulkLog: vi.fn(),
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

  it('renders Log button instead of Merge', () => {
    setup();
    const logButton = screen.getByTestId('library-bulk-log-button');
    expect(logButton).toBeInTheDocument();
    expect(logButton.textContent).toMatch(t.library.bulkLogButton);
    expect(screen.queryByTestId('library-merge-button')).not.toBeInTheDocument();
  });

  it('clicking LOG calls onBulkLog', async () => {
    const user = userEvent.setup();
    const { props } = setup({ selectedCount: 2 });
    await user.click(screen.getByTestId('library-bulk-log-button'));
    expect(props.onBulkLog).toHaveBeenCalledTimes(1);
  });

  it('LOG button does NOT carry an aria-disabled=true at N>=2', () => {
    // Bulk log enables whenever the bar is mounted (parent gates N>=2).
    setup({ selectedCount: 5 });
    const logButton = screen.getByTestId('library-bulk-log-button');
    // Either aria-disabled is absent, or it is "false". Both are fine.
    const ariaDisabled = logButton.getAttribute('aria-disabled');
    expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true);
  });

  it('marks the whole bulk bar busy and disables conflicting actions while bulk log is pending', () => {
    setup({ busy: true });
    expect(screen.getByTestId('library-bulk-actions-bar')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('library-bulk-log-button')).toHaveTextContent('LOGGING');
    expect(screen.getByTestId('library-bulk-log-button')).toBeDisabled();
    expect(screen.getByTestId('library-bulk-delete-button')).toBeDisabled();
    expect(screen.getByTestId('library-bulk-cancel-button')).toBeDisabled();
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

  it('L key triggers onBulkLog when N>=2', async () => {
    const user = userEvent.setup();
    const { props } = setup({ selectedCount: 2 });
    await user.keyboard('l');
    expect(props.onBulkLog).toHaveBeenCalledTimes(1);
  });

  it('L key still triggers onBulkLog at any N >= 2 (no exact-count gate)', async () => {
    const user = userEvent.setup();
    const { props } = setup({ selectedCount: 5 });
    await user.keyboard('l');
    expect(props.onBulkLog).toHaveBeenCalledTimes(1);
  });
});
