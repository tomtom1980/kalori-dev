/**
 * Task 3.3 — <LogFlowErrorBanner /> (Phase-3 fix: style critical #12).
 *
 * The banner is hoisted from inside ManualEntryFallback up to LogFlowTabs
 * so it appears ABOVE the active panel content (style spec §9).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowErrorBanner } from '@/app/(app)/log/_components/LogFlowErrorBanner';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<LogFlowErrorBanner />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('renders nothing when failureMode is null', () => {
    render(<LogFlowErrorBanner onRetry={() => {}} />);
    expect(screen.queryByTestId('log-flow-error-banner')).toBeNull();
  });

  it('renders role=alert + aria-live=assertive when failureMode is set', () => {
    useLogFlowStore.getState().setFailureMode('network', 'x');
    render(<LogFlowErrorBanner onRetry={() => {}} />);
    const banner = screen.getByTestId('log-flow-error-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
  });

  it('retry button dispatches onRetry', async () => {
    useLogFlowStore.getState().setFailureMode('timeout', 'x');
    const onRetry = vi.fn();
    render(<LogFlowErrorBanner onRetry={onRetry} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('log-flow-error-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('headline text tracks activeTab (type / snap / library)', () => {
    useLogFlowStore.getState().setActiveTab('snap');
    useLogFlowStore.getState().setFailureMode('zod', 'x');
    render(<LogFlowErrorBanner onRetry={() => {}} />);
    expect(screen.getByText(/read the photo/i)).toBeInTheDocument();
  });

  it('uses neutral retry copy for type failures and photo copy for snap failures', () => {
    useLogFlowStore.getState().setActiveTab('type');
    useLogFlowStore.getState().setFailureMode('network', 'x');
    const { rerender } = render(<LogFlowErrorBanner onRetry={() => {}} />);
    expect(screen.getByTestId('log-flow-error-retry')).toHaveTextContent(/^TRY AGAIN$/i);
    expect(screen.getByTestId('log-flow-error-retry')).not.toHaveTextContent(/photo/i);

    useLogFlowStore.getState().setActiveTab('snap');
    useLogFlowStore.getState().setFailureMode('zod', 'x');
    rerender(<LogFlowErrorBanner onRetry={() => {}} />);
    expect(screen.getByTestId('log-flow-error-retry')).toHaveTextContent(/^TRY PHOTO AGAIN$/i);
  });
});
