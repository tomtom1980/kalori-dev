/**
 * Task 3.3 — <LogFlowModal /> shell tests.
 *
 * Contract surface:
 *   - role=dialog + aria-modal=true when open
 *   - close button dismisses
 *   - initialOpen opens the modal on mount
 *   - 3 panel containers (type / snap / library) exist once opened
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowModal } from '@/app/(app)/log/_components/LogFlowModal';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<LogFlowModal />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useLogFlowStore.getState().closeModal();
  });

  it('renders nothing while closed', () => {
    render(<LogFlowModal />);
    expect(screen.queryByTestId('log-flow-modal')).toBeNull();
  });

  it('initialOpen=true opens the modal and renders role=dialog with testid', () => {
    render(<LogFlowModal initialOpen />);
    const modal = screen.getByTestId('log-flow-modal');
    expect(modal).toBeInTheDocument();
    // Radix Dialog.Content has role="dialog" intrinsically.
    expect(modal.getAttribute('role')).toBe('dialog');
  });

  it('renders tablist + 3 tab triggers + section kicker once open', () => {
    render(<LogFlowModal initialOpen />);
    expect(screen.getByTestId('log-flow-tablist')).toBeInTheDocument();
    expect(screen.getByTestId('log-flow-tab-type')).toBeInTheDocument();
    expect(screen.getByTestId('log-flow-tab-snap')).toBeInTheDocument();
    expect(screen.getByTestId('log-flow-tab-library')).toBeInTheDocument();
  });

  it('modal has aria-labelledby + aria-describedby wired (compliance §M1)', () => {
    render(<LogFlowModal initialOpen />);
    const modal = screen.getByTestId('log-flow-modal');
    const labelledBy = modal.getAttribute('aria-labelledby');
    const describedBy = modal.getAttribute('aria-describedby');
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    // The referenced ids must exist in the DOM.
    expect(document.getElementById(labelledBy!)).not.toBeNull();
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it('Task 3.7 regression — Radix-owned DialogTitle id matches Dialog.Content aria-labelledby', async () => {
    // Task 3.7 regression fix: when `Dialog.Title asChild` wrapped a `<p>`
    // with a custom `id={kickerId}`, that id overrode Radix's
    // `context.titleId` and the TitleWarning check (`document.getElementById
    // (titleId)`) failed — producing the "DialogContent requires a
    // DialogTitle for the component to be accessible for screen reader
    // users" console warning on every `/log` open. This test asserts the
    // wiring survives now that we no longer override Radix's id.
    //
    // Radix runs the warning check in a useEffect; tolerate one microtask
    // turn before asserting, and spy on console.error so any regression
    // would fail the test instead of silently producing a console message.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<LogFlowModal initialOpen />);
      // Yield once so Radix's TitleWarning useEffect has run.
      await Promise.resolve();
      const modal = screen.getByTestId('log-flow-modal');
      const labelledBy = modal.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      // The title id must exist in DOM AND point at the kicker paragraph.
      const titleEl = document.getElementById(labelledBy!);
      expect(titleEl).not.toBeNull();
      expect(titleEl?.tagName.toLowerCase()).toBe('p');
      // No Radix TitleWarning console.error fired.
      const titleWarnings = spy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('requires a `DialogTitle`'),
      );
      expect(titleWarnings).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('close button collapses the modal when no draft', async () => {
    const user = userEvent.setup();
    render(<LogFlowModal initialOpen />);
    const close = screen.getByTestId('log-flow-close');
    await user.click(close);
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('Task 3.4 — close with dirty draft opens Radix AlertDialog (not window.confirm)', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().openModal('type');
    useLogFlowStore.getState().setTypeDraft('some typing');
    // Regression guard: window.confirm must NOT be invoked — we replaced
    // the 3.3 placeholder with DiscardDraftAlertDialog (synthesis §2.9).
    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn<(msg?: string) => boolean>(() => false);
    (window as unknown as { confirm: typeof window.confirm }).confirm =
      confirmSpy as unknown as typeof window.confirm;
    try {
      render(<LogFlowModal />);
      const close = screen.getByTestId('log-flow-close');
      await user.click(close);
      // window.confirm is no longer used.
      expect(confirmSpy).not.toHaveBeenCalled();
      // The Radix AlertDialog is open; modal stays visible.
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByTestId('discard-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('discard-confirm')).toBeInTheDocument();
      expect(useLogFlowStore.getState().isOpen).toBe(true);
      expect(useLogFlowStore.getState().typeDraft).toBe('some typing');
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
