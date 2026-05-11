/**
 * Task 3.3 — <ManualEntryFallback /> component tests (I7 pre-fill contract).
 *
 * After the Phase-3 fix loop: the `role="alert"` banner is hoisted to
 * <LogFlowErrorBanner /> (rendered above the tab panel by LogFlowTabs).
 * ManualEntryFallback now owns ONLY the form region.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ManualEntryFallback } from '@/app/(app)/log/_components/ManualEntryFallback';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<ManualEntryFallback />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('pre-fills food-name input with originalInput for type failure', () => {
    useLogFlowStore.getState().setActiveTab('type');
    useLogFlowStore.getState().setFailureMode('network', 'pho bo');
    render(<ManualEntryFallback forceMode="type" />);
    const input = screen.getByLabelText(/food name/i) as HTMLInputElement;
    expect(input.value).toBe('pho bo');
  });

  it('renders photo preview with descriptive alt text and empty food-name for snap failure mode', () => {
    useLogFlowStore.getState().setFailureMode('zod', '<image>');
    useLogFlowStore.getState().setSnapDraft({
      status: 'error',
      error: 'test',
      thumbnailDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    render(<ManualEntryFallback forceMode="snap" />);
    const input = screen.getByLabelText(/food name/i) as HTMLInputElement;
    expect(input.value).toBe('');
    // Phase-3 fix M6: alt is descriptive, not empty.
    const img = screen.getByTestId('manual-entry-fallback-photo') as HTMLImageElement;
    expect(img.src).toContain('data:image/jpeg');
    expect(img.alt).toBeTruthy();
    expect(img.alt.length).toBeGreaterThan(0);
  });

  it('form region carries role="region" and aria-labelledby', () => {
    useLogFlowStore.getState().setFailureMode('timeout', 'x');
    render(<ManualEntryFallback forceMode="type" />);
    const region = screen.getByTestId('manual-entry-fallback');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('exposes RETRY and SAVE ENTRY buttons with accessible names', () => {
    useLogFlowStore.getState().setFailureMode('rate-limit', 'x');
    render(<ManualEntryFallback forceMode="type" />);
    expect(screen.getByTestId('manual-entry-fallback-retry')).toBeInTheDocument();
    expect(screen.getByTestId('manual-entry-fallback-submit')).toBeInTheDocument();
  });

  it('invalid submit sets aria-invalid + aria-errormessage + shows inline error (compliance M4)', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    render(<ManualEntryFallback forceMode="type" />);
    const user = userEvent.setup();
    const submitBtn = screen.getByTestId('manual-entry-fallback-submit');
    await user.click(submitBtn);
    const foodInput = screen.getByLabelText(/food name/i);
    expect(foodInput.getAttribute('aria-invalid')).toBe('true');
    expect(foodInput.getAttribute('aria-errormessage')).toBeTruthy();
    expect(screen.getByTestId('manual-entry-fallback-error-food')).toBeInTheDocument();
    // Summary alert.
    expect(screen.getByTestId('manual-entry-fallback-summary')).toBeInTheDocument();
  });

  it('invalid submit moves focus to first invalid field (compliance M4)', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    render(<ManualEntryFallback forceMode="type" />);
    const user = userEvent.setup();
    // Click elsewhere to shift focus away from the auto-focused food input.
    const submitBtn = screen.getByTestId('manual-entry-fallback-submit');
    submitBtn.focus();
    expect(document.activeElement).toBe(submitBtn);
    await user.click(submitBtn);
    const foodInput = screen.getByLabelText(/food name/i);
    expect(document.activeElement).toBe(foodInput);
  });

  it('Task 3.4 I11 patch: clears the tab client_id before invoking onManualSubmit so the manual entry mints a fresh UUID', async () => {
    // Seed an existing client_id for the type tab — represents the failed
    // parse attempt's UUID. Manual entry is a logically NEW submission and
    // must NOT reuse it (otherwise server-side I11 replay would refuse the
    // post under the same UUID).
    useLogFlowStore.getState().setActiveTab('type');
    useLogFlowStore.getState().setFailureMode('network', 'pho bo');
    useLogFlowStore.getState().ensureClientId('type');
    const beforeId = useLogFlowStore.getState().clientIds.type;
    expect(beforeId).toBeTruthy();

    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/food name/i));
    await user.type(screen.getByLabelText(/food name/i), 'manual eggs');
    await user.type(screen.getByLabelText(/portion/i), '100');
    await user.type(screen.getByLabelText(/kcal/i), '200');
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    // The patch ensures clearClientId fires before submit invokes onManualSubmit.
    expect(onManualSubmit).toHaveBeenCalledTimes(1);
    expect(useLogFlowStore.getState().clientIds.type).toBeUndefined();
  });

  it('focuses food-name input only on first failureMode transition, not on re-failures (M5)', async () => {
    // Arrange: mount with failureMode = 'network' (first transition).
    useLogFlowStore.getState().setFailureMode('network', 'pho bo');
    const { rerender } = render(<ManualEntryFallback forceMode="type" />);
    const foodInput = screen.getByLabelText(/food name/i);
    const portionInput = screen.getByLabelText(/portion/i);

    // Assert: food-name input received initial focus on first transition.
    expect(document.activeElement).toBe(foodInput);

    // Act: user moves focus to portion input and types a value (mid-edit).
    portionInput.focus();
    expect(document.activeElement).toBe(portionInput);

    // Act: a retry re-fails — failureMode flips to a different mode while the
    // fallback is still mounted. This re-renders the component.
    act(() => {
      useLogFlowStore.getState().setFailureMode('timeout', 'pho bo');
    });
    rerender(<ManualEntryFallback forceMode="type" />);

    // Assert: portion input STILL has focus — food-name was NOT yanked back.
    expect(document.activeElement).toBe(portionInput);
  });
});
