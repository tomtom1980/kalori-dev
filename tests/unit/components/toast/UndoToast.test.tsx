/**
 * Task 3.4 — <UndoToast /> + <UndoToastMount /> tests.
 *
 * Contract (synthesis §2.4 + §6.2):
 *   - Custom portal at chrome level.
 *   - role="status" aria-live="polite" aria-atomic="true".
 *   - UNDO link focusable in natural tab order.
 *   - data-testid hooks per §12.
 *   - 0 React commits during 5s countdown — countdown is CSS-only.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { UndoToastMount } from '@/components/toast/UndoToastMount';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

describe('<UndoToastMount /> + <UndoToast />', () => {
  beforeEach(() => {
    useUndoQueueStore.setState({ stack: [] });
  });
  afterEach(() => {
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders nothing when stack is empty', () => {
    const { container } = render(<UndoToastMount />);
    expect(container.querySelector('[data-testid="undo-toast"]')).toBeNull();
  });

  it('renders the top live entry with role=status + aria-live=polite + UNDO action', () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED 2 EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    render(<UndoToastMount />);
    const toast = screen.getByTestId('undo-toast');
    expect(toast).toBeInTheDocument();
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.getAttribute('aria-atomic')).toBe('true');
    expect(screen.getByTestId('undo-action')).toBeInTheDocument();
  });

  it('UNDO click runs the entry revert closure', async () => {
    const revert = vi.fn(async () => {});
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'deleted',
        description: 'DELETED ENTRY',
        serverRowId: 'srv-1',
        commit: vi.fn(async () => {}),
        revert,
      });
    });
    render(<UndoToastMount />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('undo-action'));
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it('shows "+N more saved" hint when stack depth > 1', () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
      useUndoQueueStore.getState().pushToast({
        clientId: 'c2',
        kind: 'saved',
        description: 'LOGGED TOAST',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    render(<UndoToastMount />);
    expect(screen.getByText(/\+1\s+more saved/i)).toBeInTheDocument();
  });

  it('countdown bullets render — 5 dots with countdown class (CSS animation owns motion)', () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    render(<UndoToastMount />);
    const dots = screen.getAllByTestId(/^undo-bullet-/);
    expect(dots).toHaveLength(5);
    // aria-hidden — decorative.
    for (const dot of dots) {
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('right-first bullet fade: DOM-order dot 0 has the largest animation-delay', () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    render(<UndoToastMount />);
    const dot0 = screen.getByTestId('undo-bullet-0') as HTMLElement;
    const dot4 = screen.getByTestId('undo-bullet-4') as HTMLElement;
    // Right-first burn: leftmost DOM dot fades LAST (delay 4000ms), rightmost
    // DOM dot fades FIRST (delay 0ms). Ensures the countdown reads L→R.
    expect(dot0.style.animationDelay).toBe('4000ms');
    expect(dot4.style.animationDelay).toBe('0ms');
  });

  // Task 3.5 M1.4 / F-UI-3.4-8 — delete-failed toasts have no functional undo
  // because the commit/revert callbacks are both no-ops. Rendering a UNDO
  // button next to copy like "Couldn't remove entry — it'll be here when the
  // page reloads" would be misleading. Hide the UNDO affordance.
  it('hides the UNDO button for kind="delete-failed"', () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'delete-failed',
        description: 'Couldn’t remove entry',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    render(<UndoToastMount />);
    expect(screen.queryByTestId('undo-action')).toBeNull();
    // Description still renders.
    expect(screen.getByText(/Couldn’t remove entry/i)).toBeInTheDocument();
  });

  it('has no axe-core violations when toast is visible', async () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    const { container } = render(<UndoToastMount />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe-core violations with "+N more saved" hint visible', async () => {
    act(() => {
      useUndoQueueStore.getState().pushToast({
        clientId: 'c1',
        kind: 'saved',
        description: 'LOGGED EGGS',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
      useUndoQueueStore.getState().pushToast({
        clientId: 'c2',
        kind: 'saved',
        description: 'LOGGED TOAST',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });
    });
    const { container } = render(<UndoToastMount />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
