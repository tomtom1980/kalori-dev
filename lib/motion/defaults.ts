/**
 * Motion foundation — Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul)
 *
 * Implements the prescribed Framer Motion foundation per
 * `Planning/ui-design.md` §2.6 (lines 217–228) and §2.7 (`lib/tokens.ts`
 * shape). Every consumer of motion in this codebase MUST import from
 * THIS module — never directly from `framer-motion` — so the
 * `LazyMotion + m` tree-shaking discipline (4.6 KB initial vs ~32 KB)
 * is preserved, and so the editorial cubic-bezier / duration tokens
 * stay coherent across components.
 *
 * Design contract:
 *   - `EASE_EDITORIAL`     — the cubic-bezier that defines "Ledger feel"
 *   - `durations`          — millisecond token map for ad-hoc consumers
 *   - `motion`             — pre-baked Framer `transition` objects
 *   - `variants`           — re-usable variants for inkFade / emberPulse / pageSettle
 *   - `useReducedMotionVariants(v)` — collapses transform-bearing variants
 *     to opacity-only when the user prefers reduced motion, while
 *     preserving variant key shape so consumer `animate=` props don't
 *     blow up
 *   - Re-exports `LazyMotion`, `domAnimation`, `m`, `AnimatePresence`,
 *     `useReducedMotion` — every consumer should import from this
 *     module, not from `framer-motion` directly
 *
 * Bundle policy: this module is the ONLY place `framer-motion` is
 * imported in production code. ESLint enforcement is deferred (proposal
 * §3) but the convention starts here.
 */
import {
  AnimatePresence as FMAnimatePresence,
  LazyMotion as FMLazyMotion,
  domAnimation as fmDomAnimation,
  m as fmM,
  useReducedMotion as fmUseReducedMotion,
  type Transition,
  type Variants,
} from 'framer-motion';
import { useSyncExternalStore } from 'react';

/**
 * The Ledger editorial cubic-bezier — `Planning/ui-design.md` §2.6
 * line 202: `--ease-editorial: cubic-bezier(0.2, 0.8, 0.2, 1);`
 *
 * Typed as a 4-tuple so Framer Motion accepts it directly as
 * `ease: EASE_EDITORIAL`.
 */
export const EASE_EDITORIAL = [0.2, 0.8, 0.2, 1] as const;

/**
 * Duration tokens (in milliseconds). Mirrors the spec table in
 * `Planning/ui-design.md` §2.6 lines 209–215 and the `motion.duration`
 * map in §2.7 line 249.
 *
 * Keep this in lockstep with `app/globals.css` `--motion-*` custom
 * properties — the audit at `tests/integration/reduced-motion-audit.test.ts`
 * keeps the CSS side honest; the `defaults.test.ts` contract test keeps
 * THIS side honest.
 */
export const durations = {
  micro: 120,
  standard: 180,
  expressive: 320,
  chrono: 600,
  pageTurn: 480,
  shimmer: 1600,
} as const;

type EditorialEase = readonly [number, number, number, number];

const ease: EditorialEase = EASE_EDITORIAL;

const t = (durationMs: number): Transition =>
  ({
    duration: durationMs / 1000,
    ease: ease as unknown as Transition['ease'],
  }) as Transition;

/**
 * Pre-baked Framer Motion transition objects keyed by Ledger token
 * name. Pass directly as `transition={motion.standard}` on any `m.*`
 * component to inherit the editorial ease + the spec-mandated duration.
 */
export const motion = {
  micro: t(durations.micro),
  standard: t(durations.standard),
  expressive: t(durations.expressive),
  chrono: t(durations.chrono),
  pageTurn: t(durations.pageTurn),
} as const;

/**
 * Reusable variants. Names match `Planning/ui-design.md` §2.7
 * line 228: `variants.{inkFade,emberPulse,pageSettle}`.
 *
 * `pulse` is the canonical state name on `emberPulse` because the
 * variant fires on confirm/save (one-shot), not as a steady visible
 * state. Consumers spell `animate="pulse"` then drop back to
 * `animate="visible"` once the pulse completes.
 */
export const variants = {
  /**
   * Hover/focus/number crossfade — opacity-only, micro duration.
   */
  inkFade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: motion.micro },
  } satisfies Variants,

  /**
   * Save confirmation / nudge entry — 1 → 1.02 → 1 scale pulse at
   * standard duration. Per spec line 213.
   */
  emberPulse: {
    hidden: { opacity: 0, scale: 1 },
    visible: { opacity: 1, scale: 1, transition: motion.standard },
    pulse: {
      opacity: 1,
      scale: [1, 1.02, 1],
      transition: motion.standard,
    },
  } satisfies Variants,

  /**
   * Route change / main content settle — opacity 0 → 1 at expressive
   * duration. Per spec line 214.
   */
  pageSettle: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: motion.expressive },
  } satisfies Variants,
} as const;

/**
 * Collapse transform-bearing variant keys (`scale`, `x`, `y`,
 * `rotate`, `translate*`) to opacity-only when the user prefers
 * reduced motion. Returns the input unchanged otherwise.
 *
 * The function preserves variant key shape so consumer code like
 * `animate="pulse"` continues to resolve to a defined variant — it
 * just becomes a no-op (opacity:1) instead of a scale animation.
 *
 * MUST be called inside a React component (uses the `useReducedMotion`
 * hook).
 */
export function useReducedMotionVariants<V extends Variants>(input: V): V {
  const reduced = fmUseReducedMotion();
  if (!reduced) return input;
  const out: Variants = {};
  for (const [stateName, def] of Object.entries(input)) {
    if (typeof def === 'function') {
      // Function variants are passed through unchanged — runtime
      // consumer is responsible for honoring reduced motion within
      // the function body if needed.
      out[stateName] = def;
      continue;
    }
    if (def == null || typeof def !== 'object') {
      out[stateName] = def as Variants[string];
      continue;
    }
    const collapsed: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(def as Record<string, unknown>)) {
      if (
        prop === 'scale' ||
        prop === 'x' ||
        prop === 'y' ||
        prop === 'z' ||
        prop === 'rotate' ||
        prop === 'rotateX' ||
        prop === 'rotateY' ||
        prop === 'rotateZ' ||
        prop === 'skew' ||
        prop === 'skewX' ||
        prop === 'skewY' ||
        prop === 'translateX' ||
        prop === 'translateY' ||
        prop === 'translateZ'
      ) {
        // Drop transform keys under reduced motion.
        continue;
      }
      collapsed[prop] = value;
    }
    // Guarantee `opacity: 1` on the visible/pulse end-states so the
    // consumer always lands on a fully-visible final frame.
    if (
      stateName === 'visible' ||
      stateName === 'pulse' ||
      stateName === 'shown' ||
      stateName === 'open'
    ) {
      if (typeof collapsed.opacity !== 'number') collapsed.opacity = 1;
    }
    out[stateName] = collapsed as Variants[string];
  }
  return out as V;
}

/**
 * Re-exports — every consumer in the app should import these from
 * `@/lib/motion/defaults` (not from `framer-motion`) so the
 * `LazyMotion + m` discipline is enforced by convention.
 */
export const LazyMotion = FMLazyMotion;
export const domAnimation = fmDomAnimation;
export const m = fmM;
export const AnimatePresence = FMAnimatePresence;

/**
 * Codex Round 3 (I-R2-1): the in-app accessibility toggle (Settings →
 * Reduce Motion) writes to `localStorage['kalori.reduce-motion']` and
 * `document.documentElement.dataset.reduceMotion`. CSS animations honor
 * this via the `html[data-reduce-motion='1']` mirror block in
 * `app/globals.css`, but the original Bug 3 wiring re-exported Framer's
 * `useReducedMotion` directly — Framer reads ONLY the OS pref via
 * `matchMedia('(prefers-reduced-motion: reduce)')`, so toggling the
 * Settings switch did nothing for Framer-driven components
 * (LogFlowModal, WizardShell, MobileWheelSheet, MobileWheelPicker).
 *
 * The wrapper below ORs three signals — OS pref, dataset attribute,
 * localStorage key — so the in-app toggle propagates to every Framer
 * consumer. Subscriptions cover:
 *   1. OS-level `matchMedia` change events (re-uses Framer's hook).
 *   2. MutationObserver on `<html>` for `data-reduce-motion` flips
 *      driven by the Settings toggle.
 *   3. Cross-tab `storage` events (the Settings toggle in another tab
 *      writes the localStorage key).
 *   4. Same-tab `kalori:reduce-motion-change` CustomEvent dispatched
 *      by `ReduceMotionToggle.notifyOverrideChange()`.
 *
 * SSR-safe: `getSnapshot` returns false when `document` is undefined,
 * subscribe is a no-op when `window` is undefined, and the module-top
 * remains free of browser API access.
 */
const REDUCE_MOTION_STORAGE_KEY = 'kalori.reduce-motion';

function readAppReduceSnapshot(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement?.dataset.reduceMotion === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readAppReduceServerSnapshot(): boolean {
  return false;
}

function subscribeAppReduce(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => listener());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduce-motion'],
    });
  }
  const onStorage = (event: StorageEvent): void => {
    if (event.key === REDUCE_MOTION_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  const onCustom = (): void => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener('kalori:reduce-motion-change', onCustom);
  return () => {
    observer?.disconnect();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('kalori:reduce-motion-change', onCustom);
  };
}

export function useReducedMotion(): boolean {
  const osReduce = fmUseReducedMotion();
  const appReduce = useSyncExternalStore<boolean>(
    subscribeAppReduce,
    readAppReduceSnapshot,
    readAppReduceServerSnapshot,
  );
  return Boolean(osReduce) || appReduce;
}

export type { Variants, Transition };
