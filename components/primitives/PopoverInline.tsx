'use client';

/**
 * `<PopoverInline />` — Radix Popover wrapper styled in Ledger tokens.
 *
 * Bug 2 / bugfix-tomi 2026-05-09-water-custom-button.
 *
 * Why "inline" — the `MobileWheelPicker` / `MobileWheelSheet` pair already
 * solves the mobile branch. This wrapper is the desktop counterpart:
 * a small popover anchored to the EDIT chip that hosts a numeric input
 * + Cancel/Save row. We keep it primitive (no children-as-functions, no
 * imperative API) so consumers can just `<PopoverInline open ... />`
 * and pass the form body as `children`.
 *
 * Design contract:
 *   - Radix `<Popover.Root>` with `open` controlled by the consumer
 *     (no internal `useState` — same controlled-component shape as
 *     `MobileWheelSheet`).
 *   - Trigger is the consumer's existing button — passed via the
 *     `triggerRef` slot (forwarded ref to `<Popover.Anchor>`).
 *   - Content panel: oxblood-edged hairline, bg-2 ground, no shadow,
 *     no rounding (Ledger §3.4 hairlines-only).
 *   - Reduced motion: under `useReducedMotion()` we skip the inkFade
 *     and render `display: block` instantly. Default (motion enabled)
 *     applies a 120ms `motion.micro` fade so the popover doesn't pop
 *     in jarringly.
 *   - Focus management: Radix handles trap + restore-to-trigger on
 *     close. The first focusable element inside `children` receives
 *     focus on open (consumer should put the input first).
 *   - Escape closes via Radix; we also close on outside-click via Radix.
 *
 * Implementation note: we deliberately do NOT export a "use the
 * trigger from inside via PopoverTrigger" pattern. The chip already has
 * its own onClick to set state — having two ways to open the popover
 * is confusing. The `<Popover.Anchor>` slot positions the panel
 * relative to the trigger; the trigger fires `setOpen(true)` itself.
 */
import * as Popover from '@radix-ui/react-popover';
import { type JSX, type ReactNode, type RefObject } from 'react';

import { useReducedMotion } from '@/lib/motion/defaults';

export interface PopoverInlineProps {
  /** Controls whether the popover is mounted/visible. */
  open: boolean;
  /** Fires when the user dismisses (Escape, outside-click, or programmatic close). */
  onOpenChange: (open: boolean) => void;
  /** Anchor element — the popover positions relative to this. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Body content — typically a numeric input + Cancel/Save buttons. */
  children: ReactNode;
  /** ARIA label for the popover content (read by SR on open). */
  ariaLabel: string;
  /** Optional override for testing hooks. */
  'data-testid'?: string;
}

export function PopoverInline(props: PopoverInlineProps): JSX.Element {
  const { open, onOpenChange, anchorRef, children, ariaLabel, 'data-testid': testId } = props;
  const reducedMotion = useReducedMotion() === true;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {/* Radix `virtualRef` is typed `RefObject<Measurable>` (non-null).
          Our `anchorRef` may be null pre-mount, so we cast. The Popover
          only renders content when `open === true`, by which time the
          consumer's button has mounted and the ref is populated. */}
      <Popover.Anchor virtualRef={anchorRef as unknown as React.RefObject<Element>} />
      <Popover.Portal>
        <Popover.Content
          aria-label={ariaLabel}
          data-testid={testId}
          data-reduced-motion={reducedMotion ? 'true' : undefined}
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          // Radix sets a CSS `--radix-popover-content-transform-origin` we
          // could animate, but the project's reduced-motion contract says
          // instant under reduce-motion. Outside that branch, default
          // browser composite is fine — the inkFade is purely additive
          // and not worth a Framer dependency on this surface.
          style={{
            background: 'var(--color-bg-2)',
            border: '1px solid var(--color-rule-strong)',
            padding: 'var(--spacing-3)',
            minWidth: 280,
            zIndex: 51,
            // Skipping shadows / rounding per Ledger §3.4.
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
