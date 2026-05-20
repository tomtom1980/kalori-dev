'use client';

/**
 * `<MobileWheelSheet />` — Radix Dialog wrapper that hosts one or two
 * `MobileWheelPicker` columns in a bottom-sheet shell.
 *
 * Bug 4 / bugfix-tomi 2026-05-08-mobile-ui-overhaul.
 * Authoritative spec — `Planning/ui-design.md` §7.2.5 line 1171
 * (existing bottom-sheet shell), §7.2.6 TimeEditor (two-column hours +
 * minutes), §10.6.1 commit/cancel grammar.
 *
 * Design contract:
 *   - Radix `<Dialog>` — gives us focus-trap, Escape-to-close, and
 *     outside-click-to-close for free.
 *   - Outside-click and Escape close WITHOUT firing `onCommit` — this
 *     matches the §10.6.1 invariant: snap-end fires `onChange` so the
 *     consumer can preview, but commit-to-form-state happens only on
 *     explicit DONE.
 *   - The sheet is the only mandatory UX-wrap for the wheel; consumers
 *     that need a side-by-side variant (e.g., TimeEditor hours+minutes)
 *     pass the picker children as `children` and supply `onDone` /
 *     `onCancel` callbacks that have already grabbed the per-wheel
 *     drafts.
 *   - Slide-up entrance: 180ms via Framer `motion.standard` (per §9.4
 *     and Bug 3's foundation). Reduced motion: instant.
 */
import * as Dialog from '@radix-ui/react-dialog';
import type { JSX, ReactNode } from 'react';

import {
  m,
  motion as motionPresets,
  useReducedMotion,
  type Transition,
  type Variants,
} from '@/lib/motion/defaults';

const MOBILE_WHEEL_OVERLAY_Z_INDEX = 90;
const MOBILE_WHEEL_CONTENT_Z_INDEX = 91;

export interface MobileWheelSheetProps {
  /** Controls whether the sheet is mounted/visible. */
  open: boolean;
  /** Fires for any non-DONE close (Escape, outside-click, or onCancel button). */
  onCancel: () => void;
  /** Fires when the user taps DONE — host commits the wheel's draft to form state then. */
  onDone: () => void;
  /** Sheet title — wired to `aria-labelledby` per Radix convention. */
  title: string;
  /** Optional title-row caption shown under the title (e.g., "Eggs · 2 portions"). */
  description?: string;
  /** The wheel(s) — typically one `<MobileWheelPicker />` or two side-by-side. */
  children: ReactNode;
  /** DONE button label. Default: "Done". */
  doneLabel?: string;
  /**
   * CANCEL button label. Default: "Cancel". Mirrors the `doneLabel`
   * prop so consumers can supply localized copy via `t.*.*` while the
   * primitive itself stays free of inline JSX user-strings (the default
   * value is a non-JSX TS literal — `kalori/no-inline-user-strings`
   * scopes JSX only, so module-level defaults are safe).
   */
  cancelLabel?: string;
  /**
   * If true, the DONE button renders disabled (cannot be clicked, native
   * disabled + aria-disabled="true"). Used by consumers that need to gate
   * commit on a user-interaction signal — e.g., the WaterTracker EDIT
   * sheet disables Save until the user has moved the wheel, so the
   * rounded-up prefill cannot be silently posted (Codex round 1 I2 —
   * silent off-step write). Default: false (enabled).
   */
  doneDisabled?: boolean;
  /** Optional override for testing hooks. */
  'data-testid'?: string;
}

export function MobileWheelSheet(props: MobileWheelSheetProps): JSX.Element {
  const {
    open,
    onCancel,
    onDone,
    title,
    description,
    children,
    doneLabel = 'Done',
    cancelLabel = 'Cancel',
    doneDisabled = false,
    'data-testid': testId,
  } = props;
  const reducedMotion = useReducedMotion() === true;

  // Slide-up entrance — 180ms, motion.standard from defaults.
  // Reuse the pre-baked editorial transition from `lib/motion/defaults` (the
  // canonical cubic-bezier cast lives there — line 71). For the
  // reduced-motion branch we use a typed zero-duration `Transition` so the
  // union does not collapse to `unknown` under `exactOptionalPropertyTypes`.
  const reducedTransition: Transition = { duration: 0 } as Transition;
  const sheetVariants: Variants = {
    hidden: { y: reducedMotion ? 0 : '100%', opacity: reducedMotion ? 1 : 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: reducedMotion ? reducedTransition : motionPresets.standard,
    },
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid={testId ? `${testId}-overlay` : undefined}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: MOBILE_WHEEL_OVERLAY_Z_INDEX,
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid={testId}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--color-bg-2)',
            borderTop: '1px solid var(--color-rule-strong)',
            zIndex: MOBILE_WHEEL_CONTENT_Z_INDEX,
            // 50vh per §7.2.5 line 1171.
            maxHeight: '50vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          asChild
        >
          <m.div initial="hidden" animate="visible" variants={sheetVariants}>
            <header
              style={{
                padding: '16px',
                borderBottom: '1px solid var(--color-rule)',
              }}
            >
              <Dialog.Title
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--color-sand)',
                }}
              >
                {title}
              </Dialog.Title>
              {description ? (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontFamily: 'var(--font-serif)',
                    fontStyle: 'italic',
                    fontSize: '14px',
                    color: 'var(--color-sand)',
                  }}
                >
                  {description}
                </p>
              ) : null}
            </header>

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '8px',
                padding: '16px',
                flex: '1 1 auto',
                minHeight: 0,
              }}
            >
              {children}
            </div>

            <footer
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--color-rule)',
                display: 'flex',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: '0 0 auto',
                  height: 56,
                  padding: '0 24px',
                  background: 'transparent',
                  color: 'var(--color-dust)',
                  border: '1px solid var(--color-rule-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={doneDisabled}
                aria-disabled={doneDisabled ? 'true' : 'false'}
                style={{
                  flex: '1 1 auto',
                  height: 56,
                  background: 'var(--color-oxblood)',
                  color: 'var(--color-ivory)',
                  border: '0',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: doneDisabled ? 'not-allowed' : 'pointer',
                  opacity: doneDisabled ? 0.55 : 1,
                }}
              >
                {doneLabel}
              </button>
            </footer>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
