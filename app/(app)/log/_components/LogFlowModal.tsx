'use client';

/**
 * <LogFlowModal /> — Radix Dialog wrapper owning the modal shell.
 *
 * Controlled via Zustand: `open={isOpen}` + `onOpenChange=closeModal`.
 * Radix provides focus-trap, scroll-lock, Escape-to-close, and `inert` on
 * background content. Styling goes through the `.kalori-log-*` class system
 * in `globals.css` because Radix `data-state=open/closed` animations +
 * hover/focus pseudo-selectors can't be expressed in inline `style={{}}`.
 *
 * Width: full-sheet at mobile (<768), 640px at tablet (768-1023), 720px at
 * desktop (≥1024) — driven entirely by media queries on `.kalori-log-content`.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t } from '@/lib/i18n/en';
// Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul): the prior CSS
// `kalori-log-enter-mobile` / `kalori-log-exit-mobile` keyframes are
// replaced by a Framer Motion `m.div` wrapping the Dialog.Content
// children. Spring slide+scale gives the surface real mobile-app feel
// (interruptible, layout-aware) which the linear CSS keyframe cannot.
// Reduced-motion is honored via `useReducedMotion`.
import { m, motion as motionPresets, useReducedMotion } from '@/lib/motion/defaults';
import { selectIsOpen, useLogFlowStore } from '@/lib/stores/useLogFlowStore';

import { DiscardDraftAlertDialog } from './DiscardDraftAlertDialog';
import { LogFlowTabs } from './LogFlowTabs';

export interface LogFlowModalProps {
  /**
   * Back-compat prop retained for the component-level tests that mount
   * LogFlowModal in isolation (no chrome). In production the modal is
   * rendered by <LogFlowModalMount /> inside NavShell; direct-nav to
   * /log calls `openModal()` via <LogPageClient /> (C1 fix — a single
   * chrome-level mount point eliminates double-Dialog.Root portals).
   */
  initialOpen?: boolean;
}

export function LogFlowModal({ initialOpen = false }: LogFlowModalProps) {
  const isOpen = useLogFlowStore(selectIsOpen);
  const openModal = useLogFlowStore((s) => s.openModal);
  const closeModal = useLogFlowStore((s) => s.closeModal);
  const typeDraft = useLogFlowStore((s) => s.typeDraft);
  const snapDraft = useLogFlowStore((s) => s.snapDraft);
  const librarySelection = useLogFlowStore((s) => s.librarySelection);

  // Standalone-test convenience: flip the store open on first mount when
  // the caller passed initialOpen. Production never uses this path.
  useEffect(() => {
    if (initialOpen && !isOpen) openModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  const isDirty =
    typeDraft.trim().length > 2 || snapDraft.status !== 'idle' || librarySelection.length > 0;

  // Task 3.4 — Radix AlertDialog gate replaces 3.3's window.confirm M5
  // placeholder. When the user attempts to close a dirty modal, we open
  // the AlertDialog instead of dismissing immediately. Cancel = autofocus
  // (KEEP DRAFT); Discard = destructive secondary.
  const [discardOpen, setDiscardOpen] = useState(false);

  // Bug 3 — reduced-motion gate. When user prefers reduced motion the
  // m.div renders directly at its end-state (no transform animation).
  const reducedMotion = useReducedMotion();

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      openModal();
      return;
    }
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    closeModal();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay data-testid="log-flow-scrim" className="kalori-log-overlay" />
        {/* Task 3.7 regression fix — Radix auto-wires `aria-labelledby` +
            `aria-describedby` to its own internal `Dialog.Title` /
            `Dialog.Description` ids. Do NOT provide custom ids on those
            primitives (nor override them via `asChild` children): the
            TitleWarning check in dev (`DialogContent requires a DialogTitle
            for the component to be accessible...`) fires when the title id
            referenced by `aria-labelledby` is not found in DOM, which is
            exactly what happened when we overrode Radix's `titleId` with a
            custom `useId()`-derived id on the `<p>` child. Letting Radix own
            the id both silences the warning AND keeps the actual a11y
            contract intact. */}
        {/*
         * Bug 3 + Codex Round 1 C1 — Dialog.Content with `asChild` makes
         * the OUTER `<div>` the Radix dialog node (it owns role=dialog,
         * aria-*, data-state, refs, and the `.kalori-log-content`
         * centering CSS — `position: fixed; top: 50%; left: 50%;
         * transform: translate(-50%, -50%)`). The animated m.div lives
         * INSIDE that wrapper and only ever animates `opacity` + `y`.
         *
         * Why split: framer-motion's `animate={{ y }}` writes inline
         * `transform: translateY(...)` directly on the m.div. CSS
         * transforms are NOT additive — an inline transform fully
         * overrides the class-level `translate(-50%, -50%)` centering
         * rule, anchoring the modal at the viewport corner. By moving
         * the animation to an inner element, Framer's transform never
         * collides with the centering transform.
         *
         * Reduced-motion drops the animation to zero-duration via the
         * conditional initial/transition; `useReducedMotion` already
         * gates the y delta to satisfy the reduced-motion audit.
         */}
        <Dialog.Content
          data-testid="log-flow-modal"
          className="kalori-log-modal kalori-log-content"
        >
          {/*
           * The m.div has the OUTER element's flex column layout
           * mirrored on it (display:flex / column / gap-4). Why: the
           * outer `.kalori-log-content` already declares those rules,
           * but with the wrapper split the m.div is the single flex
           * child of the outer — so the outer's `gap` no longer
           * separates the modal's `<header>` from `<LogFlowTabs />`.
           * Re-declaring the flex column on the m.div restores the
           * original sibling-gap. (`width: 100%` so the m.div fills
           * the centered wrapper; `flex: 1 1 auto` so it stretches
           * vertically inside the outer flex container.)
           */}
          <m.div
            data-testid="log-flow-modal-animator"
            className="kalori-log-modal-animator"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-4)',
              width: '100%',
              flex: '1 1 auto',
              minHeight: 0,
            }}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 320,
                    damping: 32,
                    mass: 0.9,
                    opacity: motionPresets.standard,
                  }
            }
          >
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Dialog.Title asChild>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10.5px',
                    fontWeight: 500,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--color-dust)',
                    margin: 0,
                  }}
                >
                  {t.log.modalSectionKicker}
                </p>
              </Dialog.Title>
              <Dialog.Description asChild>
                <span className="sr-only">{t.log.modalDescription}</span>
              </Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t.log.modalClose}
                  data-testid="log-flow-close"
                  className="kalori-log-close"
                >
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>

            <LogFlowTabs />
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
      <DiscardDraftAlertDialog
        open={discardOpen}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={() => {
          setDiscardOpen(false);
          closeModal({ discardDraft: true });
        }}
      />
    </Dialog.Root>
  );
}

export default LogFlowModal;
