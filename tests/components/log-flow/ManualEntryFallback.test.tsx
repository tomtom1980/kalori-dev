/**
 * Task 3.3 — <ManualEntryFallback /> component tests (I7 pre-fill contract).
 *
 * After the Phase-3 fix loop: the `role="alert"` banner is hoisted to
 * <LogFlowErrorBanner /> (rendered above the tab panel by LogFlowTabs).
 * ManualEntryFallback now owns ONLY the manual-entry region.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const isMobileMock = vi.hoisted(() => vi.fn<() => boolean>(() => false));

vi.mock('@/lib/hooks/use-is-mobile', () => ({
  useIsMobile: () => isMobileMock(),
  MOBILE_QUERY: '(max-width: 1279px)',
}));

import { ManualEntryFallback } from '@/app/(app)/log/_components/ManualEntryFallback';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<ManualEntryFallback />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    isMobileMock.mockReturnValue(false);
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
    expect(screen.getByText(/photo was kept/i)).toBeInTheDocument();
  });

  it('form region carries role="region" and aria-labelledby', () => {
    useLogFlowStore.getState().setFailureMode('timeout', 'x');
    render(<ManualEntryFallback forceMode="type" />);
    const region = screen.getByTestId('manual-entry-fallback');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('does not render a nested form warning when mounted inside the Type tab form', () => {
    useLogFlowStore.getState().setFailureMode('network', 'pho bo');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <form>
          <ManualEntryFallback forceMode="type" />
        </form>,
      );
    } finally {
      const nestedFormWarnings = consoleError.mock.calls.filter((call) =>
        call.some((part) =>
          String(part).includes('In HTML, <form> cannot be a descendant of <form>'),
        ),
      );
      expect(nestedFormWarnings).toHaveLength(0);
      expect(screen.getByTestId('manual-entry-fallback').querySelector('form')).toBeNull();
      consoleError.mockRestore();
    }
  });

  it('exposes RETRY and SAVE ENTRY buttons with accessible names', () => {
    useLogFlowStore.getState().setFailureMode('rate-limit', 'x');
    render(<ManualEntryFallback forceMode="type" />);
    const retry = screen.getByTestId('manual-entry-fallback-retry');
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveTextContent(/^TRY AGAIN$/i);
    expect(retry).not.toHaveTextContent(/photo/i);
    expect(screen.getByTestId('manual-entry-fallback-submit')).toBeInTheDocument();
  });

  it('uses photo-specific retry copy only for snap fallback mode', () => {
    useLogFlowStore.getState().setFailureMode('zod', '<image>');
    useLogFlowStore.getState().setSnapDraft({
      status: 'error',
      error: 'test',
      thumbnailDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    render(<ManualEntryFallback forceMode="snap" />);
    expect(screen.getByTestId('manual-entry-fallback-retry')).toHaveTextContent(
      /^TRY PHOTO AGAIN$/i,
    );
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

  it('lets users choose a unit and preset, then submits the edited manual payload', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/food name/i), 'banana');
    await user.click(screen.getByRole('radio', { name: /^piece$/i }));
    await user.click(screen.getByRole('button', { name: /^2 piece$/i }));
    await user.type(screen.getByLabelText(/kcal|calories/i), '210');
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    expect(onManualSubmit).toHaveBeenCalledTimes(1);
    expect(onManualSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        foodName: 'banana',
        quantity: 2,
        portionGrams: 2,
        unit: 'piece',
        kcal: 210,
        source: 'manual',
      }),
    );
  });

  it('submits from text inputs on Enter without requiring an inner form', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/food name/i), 'banana');
    await user.type(screen.getByLabelText(/quantity/i), '100');
    await user.type(screen.getByLabelText(/kcal|calories/i), '210{Enter}');

    expect(onManualSubmit).toHaveBeenCalledTimes(1);
    expect(onManualSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        foodName: 'banana',
        quantity: 100,
        unit: 'g',
        kcal: 210,
      }),
    );
  });

  it('keeps optional macros collapsed until requested and includes entered macros', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    expect(screen.queryByLabelText(/protein/i)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /optional macros/i }));
    await user.type(screen.getByLabelText(/food name/i), 'rice bowl');
    await user.type(screen.getByLabelText(/quantity/i), '1');
    await user.type(screen.getByLabelText(/kcal|calories/i), '420');
    await user.type(screen.getByLabelText(/protein/i), '12');
    await user.type(screen.getByLabelText(/carbs/i), '70');
    await user.type(screen.getByLabelText(/^fat/i), '8');
    await user.type(screen.getByLabelText(/fiber/i), '4');
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    expect(onManualSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        macros: {
          protein_g: 12,
          carbs_g: 70,
          fat_g: 8,
          fiber_g: 4,
        },
      }),
    );
  });

  it('shows and focuses field-level errors for invalid optional macros', async () => {
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /optional macros/i }));
    await user.type(screen.getByLabelText(/food name/i), 'rice bowl');
    await user.type(screen.getByLabelText(/quantity/i), '1');
    await user.type(screen.getByLabelText(/kcal|calories/i), '420');
    const proteinInput = screen.getByLabelText(/protein/i);
    await user.type(proteinInput, '-1');
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    expect(onManualSubmit).not.toHaveBeenCalled();
    expect(proteinInput).toHaveAttribute('aria-invalid', 'true');
    expect(proteinInput.getAttribute('aria-errormessage')).toBeTruthy();
    expect(screen.getByTestId('manual-entry-fallback-error-protein')).toHaveTextContent(
      /positive number/i,
    );
    expect(document.activeElement).toBe(proteinInput);
  });

  it('mobile renders a wheel-sheet quantity picker and commits the selected value', async () => {
    isMobileMock.mockReturnValue(true);
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/food name/i), 'yogurt');
    await user.type(screen.getByLabelText(/kcal|calories/i), '120');

    await user.click(screen.getByTestId('manual-entry-fallback-quantity-wheel-trigger'));
    const wheel = await screen.findByTestId('manual-entry-fallback-quantity-wheel');
    expect(wheel).toBeInTheDocument();
    const row150 = Array.from(wheel.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent?.trim() === '150 g',
    );
    expect(row150).toBeDefined();
    await user.click(row150 as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Done$/i }));
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    expect(onManualSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 150,
        unit: 'g',
        kcal: 120,
      }),
    );
  });

  it('mobile resets stale gram wheel values when switching to a count unit', async () => {
    isMobileMock.mockReturnValue(true);
    useLogFlowStore.getState().setFailureMode('network', '');
    const onManualSubmit = vi.fn();
    render(<ManualEntryFallback forceMode="type" onManualSubmit={onManualSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/food name/i), 'egg');
    await user.type(screen.getByLabelText(/kcal|calories/i), '80');

    await user.click(screen.getByTestId('manual-entry-fallback-quantity-wheel-trigger'));
    let wheel = await screen.findByTestId('manual-entry-fallback-quantity-wheel');
    const row250 = Array.from(wheel.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent?.trim() === '250 g',
    );
    expect(row250).toBeDefined();
    await user.click(row250 as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Done$/i }));
    expect(screen.getByTestId('manual-entry-fallback-quantity-wheel-trigger')).toHaveTextContent(
      '250 g',
    );

    await user.click(screen.getByRole('radio', { name: /^piece$/i }));
    expect(screen.getByTestId('manual-entry-fallback-quantity-wheel-trigger')).toHaveTextContent(
      '1 piece',
    );

    await user.click(screen.getByTestId('manual-entry-fallback-quantity-wheel-trigger'));
    wheel = await screen.findByTestId('manual-entry-fallback-quantity-wheel');
    expect(wheel).toHaveTextContent('1 piece');
    await user.click(screen.getByRole('button', { name: /^Done$/i }));
    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    expect(onManualSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        unit: 'piece',
        kcal: 80,
      }),
    );
  });
});
