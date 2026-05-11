/**
 * Bug 3 — LogFlowModal motion migration regression test.
 *
 * The mobile/tablet enter/exit animations on `.kalori-log-content`
 * migrated from CSS @keyframes (`kalori-log-enter-mobile`,
 * `kalori-log-exit-mobile`) to a Framer Motion `m.div` wrapping the
 * Dialog.Content children. The Radix Dialog primitive itself is
 * unchanged so:
 *   - aria-modal / role / focus-trap / aria-labelledby contracts hold
 *   - existing tests that assert `getByTestId('log-flow-modal')` still
 *     resolve to Radix's Dialog.Content
 *   - the testid wrapper lives INSIDE Dialog.Content, not outside it
 *
 * This test asserts the migration didn't break:
 *   - the modal renders open and finds the testid
 *   - the close button still dismisses
 *   - aria-labelledby + aria-describedby still resolve to live nodes
 *   - reduced-motion path renders without throwing
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

import { LogFlowModal } from '@/app/(app)/log/_components/LogFlowModal';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import * as fm from 'framer-motion';

describe('<LogFlowModal /> — motion migration', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useLogFlowStore.getState().closeModal();
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the testid + role=dialog when initialOpen', () => {
    render(<LogFlowModal initialOpen />);
    const modal = screen.getByTestId('log-flow-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('role')).toBe('dialog');
  });

  it('aria-labelledby + aria-describedby still wired post-migration', () => {
    render(<LogFlowModal initialOpen />);
    const modal = screen.getByTestId('log-flow-modal');
    const labelledBy = modal.getAttribute('aria-labelledby');
    const describedBy = modal.getAttribute('aria-describedby');
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).not.toBeNull();
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it('close button collapses the modal post-migration', async () => {
    const user = userEvent.setup();
    render(<LogFlowModal initialOpen />);
    const close = screen.getByTestId('log-flow-close');
    await user.click(close);
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('renders without throwing under reduced motion', () => {
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<LogFlowModal initialOpen />);
    expect(screen.getByTestId('log-flow-modal')).toBeInTheDocument();
  });

  it('Codex C1 — centering element has no inline transform (Framer y does not overwrite translate(-50%, -50%))', () => {
    // Codex Round 1 finding C1: framer-motion's `animate={{ y: 0 }}` writes
    // an inline `transform: translateY(...)` style on the m.div, which
    // overrides the CSS `.kalori-log-content { transform: translate(-50%,
    // -50%) }` centering rule (CSS transforms are NOT additive — the inline
    // style fully replaces the class rule). The fix is to keep
    // `.kalori-log-content` as the static centering layer and animate an
    // INNER wrapper, so Framer's transform never collides with the
    // viewport-centering transform.
    //
    // This test captures the contract: the element that owns the
    // `kalori-log-content` class (which provides `position: fixed; top:
    // 50%; left: 50%; transform: translate(-50%, -50%)`) must NOT have any
    // inline transform style — Framer must not be allowed to mutate that
    // node's transform.
    render(<LogFlowModal initialOpen />);
    const centeringEl = document.querySelector('.kalori-log-content') as HTMLElement | null;
    expect(centeringEl).not.toBeNull();
    // The inline transform set by Framer would appear in `style.transform`
    // (jsdom records inline styles). The centering element must be free of
    // any inline transform — its transform comes purely from CSS.
    expect(centeringEl!.style.transform).toBe('');
  });

  it('Codex C1 — animated m.div is a descendant of (not the same node as) the centering element', () => {
    // Structural assertion: the centering element exists, and the
    // dedicated animator (testid `log-flow-modal-animator`) is a strict
    // descendant. They MUST be separate DOM nodes — if they were the same
    // node, Framer's inline transform would clobber the centering
    // transform exactly as Codex C1 reported.
    render(<LogFlowModal initialOpen />);
    const centeringEl = document.querySelector('.kalori-log-content') as HTMLElement | null;
    expect(centeringEl).not.toBeNull();
    const animatorEl = screen.getByTestId('log-flow-modal-animator');
    expect(animatorEl).not.toBe(centeringEl);
    expect(centeringEl!.contains(animatorEl)).toBe(true);
    // And the animator must NOT carry the centering class — only the
    // outer wrapper owns `.kalori-log-content`.
    expect(animatorEl.classList.contains('kalori-log-content')).toBe(false);
  });
});
