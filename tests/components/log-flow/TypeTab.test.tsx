/**
 * Task 3.3 — <TypeTab /> smoke test.
 *   - textarea with visible label "DESCRIBE YOUR MEAL"
 *   - PARSE button disabled until ≥ 3 chars
 *   - char counter updates live
 *   - failure mode mounts <ManualEntryFallback /> inline
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TypeTab } from '@/app/(app)/log/_components/TypeTab';
import { t } from '@/lib/i18n/en';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const authPostMock = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPostMock(...args),
  SessionExpiredError: class SE extends Error {},
}));

describe('<TypeTab />', () => {
  beforeEach(() => {
    authPostMock.mockReset();
    useLogFlowStore.getState().resetDraft();
  });

  it('renders textarea with a visible DESCRIBE YOUR MEAL label', () => {
    render(<TypeTab />);
    const label = screen.getByText(/describe your meal/i);
    expect(label).toBeInTheDocument();
    expect(screen.getByTestId('type-tab-textarea')).toBeInTheDocument();
  });

  it('PARSE button aria-disabled when textarea is empty, but remains focusable (WCAG C2)', () => {
    render(<TypeTab />);
    const btn = screen.getByTestId('type-tab-parse-button') as HTMLButtonElement;
    // aria-disabled (NOT HTML disabled) so SR users can focus + hear reason.
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    // Button must be focusable via keyboard (disabled would remove it from tab order).
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('PARSE aria-disabled flips to false once ≥ 3 chars typed', async () => {
    const user = userEvent.setup();
    render(<TypeTab />);
    const ta = screen.getByTestId('type-tab-textarea');
    await user.type(ta, 'pho');
    const btn = screen.getByTestId('type-tab-parse-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('mounts <ManualEntryFallback /> when failureMode is set', () => {
    useLogFlowStore.getState().setFailureMode('network', 'abc');
    render(<TypeTab />);
    expect(screen.getByTestId('manual-entry-fallback')).toBeInTheDocument();
  });

  it('shows a spinner and blocks repeat clicks while parsing', async () => {
    const user = userEvent.setup();
    let resolveParse: (value: unknown) => void = () => {};
    authPostMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveParse = resolve;
      }),
    );
    const onParseSuccess = vi.fn();

    render(<TypeTab onParseSuccess={onParseSuccess} />);

    await user.type(screen.getByTestId('type-tab-textarea'), 'sandwich');
    const button = screen.getByTestId('type-tab-parse-button');
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(within(button).getByTestId('type-tab-parse-spinner')).toBeInTheDocument();
    expect(within(button).getByText(t.log.typeParseLoadingCTA)).toBeInTheDocument();

    await user.click(button);
    expect(authPostMock).toHaveBeenCalledTimes(1);

    resolveParse({
      result: {
        items: [
          {
            name: 'sandwich',
            portion: 1,
            unit: 'piece',
            kcal: 550,
            macros: { protein_g: 25, carbs_g: 55, fat_g: 22, fiber_g: 4 },
            micros: {},
            confidence: 0.9,
          },
        ],
        reasoning: 'sandwich estimate',
      },
    });

    await waitFor(() => {
      expect(onParseSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
