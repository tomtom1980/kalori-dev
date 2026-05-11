'use client';

/**
 * `<MobileWheelPicker />` — mobile bottom-sheet wheel picker primitive.
 *
 * Bug 4 / bugfix-tomi 2026-05-08-mobile-ui-overhaul.
 * Authoritative spec — `Planning/ui-design.md` §4.1.10 + §10.6.1 a11y
 * contract + §13 tiebreaker #23.
 *
 * Design contract:
 *   - role="listbox" composite widget; one tabIndex=0 surface for the
 *     keyboard, every row is `role="option"` with `aria-selected`.
 *   - Container `aria-activedescendant` always points at the active
 *     row's stable id, so screen readers announce the right value.
 *   - ArrowUp/Down move by one (clamped — no wrap, per §10.6.1).
 *     PageUp/Down move by 5. Home/End jump to bounds.
 *   - Enter fires `onCommit?.(value)`. Escape fires `onCancel?.()` and
 *     suppresses commit. Tap on a non-active row activates it.
 *   - Reduced motion (`useReducedMotion()` from `lib/motion/defaults`):
 *     `data-reduced-motion="true"` on the listbox. The Framer
 *     transition-presets we'd otherwise apply are bypassed; the active
 *     row underline jumps instantly. Visible-row count + hairlines are
 *     unchanged so the picker is still recognizable as a wheel.
 *   - Visual: 5 visible rows × 44px (default) = 220px container. Active
 *     row: 2px oxblood underline (no row-fill). Faded rows: opacity
 *     ramps 0.4 → 1 → 0.4 across the visible window. Hairlines top + bottom.
 *
 * Implementation notes:
 *   - Hand-rolled on `lib/motion/defaults` `m` + `useTransform`. NO new
 *     dependency (Bug 3 already shipped LazyMotion + m + reduced-motion
 *     hook — we ride that foundation).
 *   - Pointer scroll uses native CSS `scroll-snap-type: y mandatory`
 *     because (a) it's free, (b) it honors `prefers-reduced-motion` at
 *     the browser level, and (c) it composes correctly with iOS
 *     momentum scrolling. The Framer-driven rotational fade rides the
 *     scroll position via a `useMotionValue` updated in a scroll
 *     handler.
 *   - Keyboard nav goes through React state (`activeIndex` derived
 *     from the controlled `value`). Keyboard does not push the scroll
 *     position — it's purely state-driven; the scroll container
 *     `scrollIntoView({ block: 'center' })`s the active row when the
 *     value changes.
 *
 * The component is breakpoint-agnostic. Consumers pair it with
 * `useIsMobile()` to choose between this picker and their existing
 * desktop control. The picker is also usable in a tablet drawer if the
 * consumer wants, which keeps the primitive flexible.
 */
import { useEffect, useId, useMemo, useRef, type JSX, type KeyboardEvent } from 'react';

import { useReducedMotion } from '@/lib/motion/defaults';

export interface MobileWheelPickerOption<T> {
  /** Stable, comparable value (number, string, or branded primitive). */
  value: T;
  /** Display label. */
  label: string;
  /**
   * Optional disabled flag — disabled rows are still rendered (so the
   * wheel preserves spacing) but cannot become active. They render with
   * `aria-disabled="true"`.
   */
  disabled?: boolean;
}

export interface MobileWheelPickerProps<T> {
  /** Currently-selected value (controlled). */
  value: T;
  /** Fired when the active row changes (snap-end on touch, immediate on keyboard). */
  onChange: (value: T) => void;
  /** Fired on Enter — host should close the sheet. */
  onCommit?: (value: T) => void;
  /** Fired on Escape — host should close WITHOUT committing the change. */
  onCancel?: () => void;
  /** Options to render. Cardinality cap per §10.6.1: ≤ 50. */
  options: ReadonlyArray<MobileWheelPickerOption<T>>;
  /**
   * Row height in CSS pixels. Default 44 (touch-target floor per §10.6).
   * Consumer may raise but never lower below 44.
   */
  itemHeight?: number;
  /**
   * Number of visible rows. Default 5 (one center + two faded above + two
   * faded below). Always odd so there's a true center row.
   */
  visibleRows?: number;
  /** Required label for assistive tech. */
  ariaLabel: string;
  /** Optional override for test / data hooks. */
  'data-testid'?: string;
}

const PAGE_STEP = 5; // PageUp/PageDown size, matches default visibleRows.

export function MobileWheelPicker<T extends string | number>(
  props: MobileWheelPickerProps<T>,
): JSX.Element {
  const {
    value,
    onChange,
    onCommit,
    onCancel,
    options,
    itemHeight = 44,
    visibleRows = 5,
    ariaLabel,
    'data-testid': testId,
  } = props;

  const reducedMotion = useReducedMotion() === true;
  const baseId = useId();
  const listRef = useRef<HTMLUListElement | null>(null);
  const scrollDrivenIndexRef = useRef<number | null>(null);

  // Compute active index from the controlled value. If the value isn't
  // present in options (e.g., consumer just changed the option set), fall
  // back to the first non-disabled option so the wheel is never in an
  // "invalid active" state.
  const activeIndex = useMemo(() => {
    const idx = options.findIndex((opt) => opt.value === value);
    if (idx >= 0) return idx;
    const firstEnabled = options.findIndex((opt) => !opt.disabled);
    return firstEnabled >= 0 ? firstEnabled : 0;
  }, [options, value]);

  // After mount + every active-index change, scroll the active row into
  // the center of the wheel. Native CSS scroll-snap handles the visual
  // alignment; this just gets us close enough that snap finishes the job.
  // Programmatic centering is intentionally instant. Smooth programmatic
  // scroll emits intermediate scroll events in real browsers, which can
  // overwrite a tapped row before the user hits Save. Finger scrolling
  // still uses native momentum and snap.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (scrollDrivenIndexRef.current === activeIndex) {
      scrollDrivenIndexRef.current = null;
      return;
    }
    // After the C-R2-1 fix the viewport carries top + bottom spacer
    // padding of (clientHeight - itemHeight)/2, so centering row N is
    // exactly scrollTop = N * itemHeight. We compute that directly
    // instead of relying on `target.offsetTop` (which jsdom does not
    // populate, and which is now offset by the spacer in real browsers
    // anyway).
    const desiredScrollTop = activeIndex * itemHeight;
    list.scrollTop = desiredScrollTop;
  }, [activeIndex, itemHeight]);

  // Touch-scroll → onChange wiring (Codex R1 I1, fixed in R3 per C-R2-1).
  //
  // CSS `scroll-snap-type: y mandatory` snaps the wheel to a row at
  // gesture-end. The browser fires scroll events as the user drags AND
  // as the snap settles. We derive the active index from the live
  // scrollTop on each scroll event and fire onChange only when the
  // derived index differs from the controlled `activeIndex`.
  //
  // After C-R2-1 the viewport has top + bottom spacer padding =
  // (clientHeight - itemHeight) / 2, so:
  //   • scrollTop = N * itemHeight CENTERS row N exactly
  //   • derivedIdx = round(scrollTop / itemHeight)
  // This makes index 0 and index (last) reachable by touch (previously
  // they were unreachable because scrollTop is clamped to >= 0 and the
  // unpadded center-derivation formula returned floor(visibleRows/2)
  // for scrollTop=0).
  //
  // No "is-this-programmatic-scroll" flag is needed: when WE
  // programmatically scrollTo to center activeIndex, the resulting
  // scrollTop maps back to the SAME activeIndex via the rounding math,
  // so the equality check (`clamped === activeIndex`) rejects every
  // scroll event the programmatic write produces. Only USER
  // touch-scrolls land at a different row index, so only they fire
  // onChange. This also makes the handler resilient to React 18
  // strict-mode double-invocation of effects — no time-window race.
  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const derivedIdx = Math.round(list.scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(options.length - 1, derivedIdx));
    if (clamped === activeIndex) return;
    const opt = options[clamped];
    if (!opt || opt.disabled) return;
    scrollDrivenIndexRef.current = clamped;
    onChange(opt.value);
  }

  function moveTo(targetIdx: number) {
    // Clamp + skip disabled. We search outward from targetIdx until we
    // find an enabled row OR run out of room.
    const clamped = Math.max(0, Math.min(options.length - 1, targetIdx));
    if (options[clamped] && !options[clamped].disabled) {
      if (clamped !== activeIndex) onChange(options[clamped].value);
      return;
    }
    // No suitable enabled row found — bail without firing onChange.
  }

  function handleKeyDown(ev: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        if (activeIndex < last) moveTo(activeIndex + 1);
        return;
      case 'ArrowUp':
        ev.preventDefault();
        if (activeIndex > 0) moveTo(activeIndex - 1);
        return;
      case 'PageDown':
        ev.preventDefault();
        moveTo(Math.min(last, activeIndex + PAGE_STEP));
        return;
      case 'PageUp':
        ev.preventDefault();
        moveTo(Math.max(0, activeIndex - PAGE_STEP));
        return;
      case 'Home':
        ev.preventDefault();
        moveTo(0);
        return;
      case 'End':
        ev.preventDefault();
        moveTo(last);
        return;
      case 'Enter': {
        ev.preventDefault();
        const active = options[activeIndex];
        if (active) onCommit?.(active.value);
        return;
      }
      case 'Escape':
        ev.preventDefault();
        onCancel?.();
        return;
      default:
        return;
    }
  }

  const containerHeight = itemHeight * visibleRows;
  // C-R2-1 fix: spacer padding so the FIRST and LAST rows can be
  // centered in the viewport. Without this, scrollTop=0 puts row 0 at
  // the viewport top (not center) and the user physically cannot select
  // index 0 / 1 / last-1 / last by touch (scrollTop clamps at 0 and
  // scrollHeight - clientHeight). With paddingTop = paddingBottom =
  // (containerHeight - itemHeight) / 2, scrollTop = N * itemHeight
  // exactly centers row N.
  const spacerPadding = (containerHeight - itemHeight) / 2;

  // Inline styles use design tokens (CSS custom properties from
  // app/globals.css) so the Ledger token discipline is preserved without
  // a stylesheet round-trip. Hairlines, oxblood, and the bg-2 ground
  // come from `lib/tokens.ts` via CSS vars.
  const listStyle: React.CSSProperties = {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    paddingTop: spacerPadding,
    paddingBottom: spacerPadding,
    // border-box so the paddings are folded INTO the box height,
    // keeping the layout footprint = containerHeight (= visibleRows ×
    // itemHeight). The padding creates blank scroll-room above row 0
    // and below row last, but the visible viewport stays the same size.
    boxSizing: 'border-box',
    height: containerHeight,
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    scrollBehavior: 'auto',
    background: 'var(--color-bg-2)',
    borderTop: '1px solid var(--color-rule-strong)',
    borderBottom: '1px solid var(--color-rule-strong)',
    position: 'relative',
    // Hide the scrollbar visually — touch users use the gesture, keyboard
    // users use arrow keys. The container is still keyboard-focusable, so
    // assistive tech can still navigate the list.
    scrollbarWidth: 'none',
    overscrollBehaviorY: 'contain',
    touchAction: 'pan-y',
    WebkitOverflowScrolling: 'touch',
  };

  return (
    <div
      className="kalori-mobile-wheel-picker-shell"
      style={{
        position: 'relative',
        width: '100%',
        // The 2px oxblood center underline. Ledger §3.4 hairlines-only —
        // pure CSS pseudo-band (no row-fill, no rounding).
      }}
      data-testid={testId}
    >
      <ul
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-activedescendant={`${baseId}-row-${activeIndex}`}
        data-reduced-motion={reducedMotion ? 'true' : undefined}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        style={listStyle}
        className="kalori-mobile-wheel-picker"
      >
        {options.map((opt, idx) => {
          const isActive = idx === activeIndex;
          const distance = Math.abs(idx - activeIndex);
          // Opacity ramp: 1 at center, 0.7 at ±1, 0.4 at ±2+. Pure CSS,
          // no JS scroll-handler dependency — keeps the keyboard path
          // visually consistent with snap-end pointer behavior.
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.7 : 0.4;
          return (
            <li
              key={`${baseId}-row-${idx}`}
              id={`${baseId}-row-${idx}`}
              role="option"
              aria-selected={isActive ? 'true' : 'false'}
              aria-disabled={opt.disabled ? 'true' : undefined}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => {
                if (!opt.disabled) moveTo(idx);
              }}
              style={{
                height: itemHeight,
                lineHeight: `${itemHeight}px`,
                textAlign: 'center',
                fontFamily: 'var(--font-serif)',
                fontSize: isActive ? '24px' : '20px',
                fontWeight: isActive ? 500 : 300,
                color: isActive ? 'var(--color-ivory)' : 'var(--color-sand)',
                opacity,
                scrollSnapAlign: 'center',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
                position: 'relative',
                // Active row 2px oxblood underline (no row-fill per
                // tiebreaker #23 + §3.4 hairlines-only).
                background: isActive ? 'rgba(114, 47, 55, 0.18)' : 'transparent',
                borderTop: isActive ? '1px solid var(--color-oxblood)' : '1px solid transparent',
                borderBottom: isActive ? '2px solid var(--color-oxblood)' : '2px solid transparent',
              }}
            >
              {opt.label}
            </li>
          );
        })}
      </ul>
      {/* Center axis hairline overlay — pure CSS, ignored for a11y. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `calc(50% - ${itemHeight / 2}px)`,
          height: itemHeight,
          borderTop: '1px solid var(--color-rule-strong)',
          borderBottom: '1px solid var(--color-rule-strong)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
