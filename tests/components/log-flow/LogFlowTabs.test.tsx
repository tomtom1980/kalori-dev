/**
 * Task 3.3 — <LogFlowTabs /> smoke test. Radix Tabs owns the ARIA; we
 * assert the wrapper wires Zustand correctly.
 *
 * Task 3.4 extension — phase switchboard: when `phase === 'confirmation'`
 * the tabs are replaced by <ConfirmationScreen />. Tab triggers are
 * UNMOUNTED (not CSS-hidden) so there are no ghost tabstops.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Mock refresh-interceptor to keep tests offline (ConfirmationScreen's
// preflight dedup-check fires via authFetch on mount).
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ match: null }), { status: 200 })),
  ),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

// ConfirmationScreen calls useRouter() for router.refresh() after save —
// happy-dom has no app router, so stub it.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('<LogFlowTabs />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders all 3 tab triggers', () => {
    render(<LogFlowTabs />);
    expect(screen.getByTestId('log-flow-tab-type')).toBeInTheDocument();
    expect(screen.getByTestId('log-flow-tab-snap')).toBeInTheDocument();
    expect(screen.getByTestId('log-flow-tab-library')).toBeInTheDocument();
  });

  it('tab triggers carry role=tab (via Radix)', () => {
    render(<LogFlowTabs />);
    const typeTab = screen.getByTestId('log-flow-tab-type');
    expect(typeTab.getAttribute('role')).toBe('tab');
  });

  it('clicking SNAP tab updates activeTab in the store', async () => {
    const user = userEvent.setup();
    render(<LogFlowTabs />);
    await user.click(screen.getByTestId('log-flow-tab-snap'));
    expect(useLogFlowStore.getState().activeTab).toBe('snap');
  });

  it('list carries role=tablist with aria-label', () => {
    render(<LogFlowTabs />);
    const list = screen.getByTestId('log-flow-tablist');
    expect(list.getAttribute('role')).toBe('tablist');
    expect(list.getAttribute('aria-label')).toBe('Log entry method');
  });

  it('tab triggers have NO aria-label override — visible text IS the accessible name (WCAG 2.5.3, compliance §C1)', () => {
    render(<LogFlowTabs />);
    const typeTab = screen.getByTestId('log-flow-tab-type');
    const snapTab = screen.getByTestId('log-flow-tab-snap');
    const libraryTab = screen.getByTestId('log-flow-tab-library');
    expect(typeTab.getAttribute('aria-label')).toBeNull();
    expect(snapTab.getAttribute('aria-label')).toBeNull();
    expect(libraryTab.getAttribute('aria-label')).toBeNull();
    // Visible text is the accessible name.
    expect(typeTab.textContent).toMatch(/TYPE/);
    expect(snapTab.textContent).toMatch(/SNAP/);
    expect(libraryTab.textContent).toMatch(/LIBRARY/);
  });

  // Task 3.4 — phase switchboard: ConfirmationScreen wiring (C1 blocker fix).
  it('renders <ConfirmationScreen /> when phase === "confirmation" and tabs are UNMOUNTED', () => {
    act(() => {
      useLogFlowStore.getState().enterConfirmation({
        source: 'text',
        tab: 'type',
        items: [
          {
            name: 'eggs',
            portion: 2,
            unit: 'unit',
            kcal: 140,
            macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
            micros: {},
            confidence: 0.9,
          },
        ],
        reasoning: '2 eggs at 70 kcal each',
        dedupMatch: null,
      });
    });
    render(<LogFlowTabs />);
    // ConfirmationScreen rendered.
    expect(screen.getByTestId('confirmation-screen')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-item-0')).toBeInTheDocument();
    // Tab triggers UNMOUNTED (not CSS-hidden) — assert not in DOM.
    expect(screen.queryByTestId('log-flow-tab-type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-flow-tab-snap')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-flow-tab-library')).not.toBeInTheDocument();
  });

  it('ConfirmationScreen does NOT nest a second role="dialog" — relies on outer Radix Dialog', () => {
    act(() => {
      useLogFlowStore.getState().enterConfirmation({
        source: 'text',
        tab: 'type',
        items: [
          {
            name: 'eggs',
            portion: 2,
            unit: 'unit',
            kcal: 140,
            macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
            micros: {},
            confidence: 0.9,
          },
        ],
        reasoning: null,
        dedupMatch: null,
      });
    });
    render(<LogFlowTabs />);
    const section = screen.getByTestId('confirmation-screen');
    expect(section.getAttribute('role')).not.toBe('dialog');
    expect(section.getAttribute('aria-modal')).toBeNull();
  });
});
