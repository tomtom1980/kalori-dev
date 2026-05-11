/**
 * @vitest-environment happy-dom
 *
 * Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — Motion foundation
 *
 * Asserts the contract for `lib/motion/defaults.ts`:
 *   - `EASE_EDITORIAL` matches the Ledger spec (`Planning/ui-design.md` §2.6).
 *   - Duration tokens match the spec table verbatim.
 *   - `motion` preset object exposes `{micro, standard, expressive, chrono, pageTurn}`
 *     with the duration + ease wired to the editorial cubic-bezier.
 *   - `variants` exposes the prescribed `{inkFade, emberPulse, pageSettle}` keys.
 *   - `useReducedMotionVariants(variants)` collapses transform/translate/scale
 *     keys to opacity-only WHEN `useReducedMotion()` returns true.
 *   - `LazyMotion` and `m` are re-exported (Ledger pattern: `LazyMotion + m`).
 *   - `useReducedMotion` is re-exported.
 *
 * Codex Round 3 (I-R2-1): the wrapped `useReducedMotion` ORs OS pref
 * with the in-app accessibility toggle (`localStorage['kalori.reduce-motion']`
 * + `html[data-reduce-motion='1']`) so Framer-driven components honor the
 * Settings switch the same way CSS animations already do.
 *
 * The first run of this file MUST fail because `lib/motion/defaults.ts`
 * does not yet exist. After the implementation lands, every assertion
 * here is the canonical contract guard against silent drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock framer-motion's `useReducedMotion` so the helper test is
// deterministic (happy-dom doesn't carry a meaningful media-query
// signal for prefers-reduced-motion).
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

describe('lib/motion/defaults — contract', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EASE_EDITORIAL is the Ledger cubic-bezier (0.2, 0.8, 0.2, 1)', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(mod.EASE_EDITORIAL).toEqual([0.2, 0.8, 0.2, 1]);
  });

  it('exports the `durations` token map per ui-design.md §2.6 + lib/tokens.ts §2.7', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(mod.durations).toEqual({
      micro: 120,
      standard: 180,
      expressive: 320,
      chrono: 600,
      pageTurn: 480,
      shimmer: 1600,
    });
  });

  it('exports a `motion` preset map keyed by `{micro, standard, expressive, chrono, pageTurn}`', async () => {
    const mod = await import('@/lib/motion/defaults');
    const keys = ['micro', 'standard', 'expressive', 'chrono', 'pageTurn'] as const;
    for (const k of keys) {
      expect(mod.motion[k]).toBeDefined();
      // Each preset must be a Framer Motion `transition` object.
      expect(mod.motion[k]).toHaveProperty('duration');
      expect(mod.motion[k]).toHaveProperty('ease');
    }
    // Durations are seconds (Framer convention), not ms.
    expect(mod.motion.micro.duration).toBeCloseTo(0.12, 3);
    expect(mod.motion.standard.duration).toBeCloseTo(0.18, 3);
    expect(mod.motion.expressive.duration).toBeCloseTo(0.32, 3);
    expect(mod.motion.chrono.duration).toBeCloseTo(0.6, 3);
    expect(mod.motion.pageTurn.duration).toBeCloseTo(0.48, 3);
    // Ease is wired to editorial cubic-bezier.
    expect(mod.motion.standard.ease).toEqual([0.2, 0.8, 0.2, 1]);
  });

  it('exports `variants.inkFade` (opacity 0 → 1)', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(mod.variants.inkFade).toBeDefined();
    // Hidden / visible state must be opacity-driven.
    expect(mod.variants.inkFade.hidden).toMatchObject({ opacity: 0 });
    expect(mod.variants.inkFade.visible).toMatchObject({ opacity: 1 });
  });

  it('exports `variants.emberPulse` (transform: scale pulse)', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(mod.variants.emberPulse).toBeDefined();
    // Pulse must encode the 1 → 1.02 → 1 scale per spec.
    expect(mod.variants.emberPulse.pulse).toBeDefined();
    const pulseScale = mod.variants.emberPulse.pulse.scale;
    expect(Array.isArray(pulseScale)).toBe(true);
    expect(pulseScale).toEqual([1, 1.02, 1]);
  });

  it('exports `variants.pageSettle` (opacity 0 → 1 at expressive duration)', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(mod.variants.pageSettle).toBeDefined();
    expect(mod.variants.pageSettle.hidden).toMatchObject({ opacity: 0 });
    expect(mod.variants.pageSettle.visible).toMatchObject({ opacity: 1 });
  });

  it('useReducedMotionVariants — when reduced, collapses transforms to opacity-only', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const mod = await import('@/lib/motion/defaults');
    const collapsed = mod.useReducedMotionVariants(mod.variants.emberPulse);

    // Pulse variant must NO LONGER carry a scale array under reduced motion.
    expect(collapsed.pulse).toBeDefined();
    // The collapsed variant must keep the `pulse` state as a no-op
    // (opacity:1) so consumer animation code can still target it.
    expect(collapsed.pulse).toMatchObject({ opacity: 1 });
    // Crucially, no `scale` key remains under reduced motion.
    expect((collapsed.pulse as { scale?: unknown }).scale).toBeUndefined();
  });

  it('useReducedMotionVariants — when NOT reduced, returns the input unchanged', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const mod = await import('@/lib/motion/defaults');
    const passthrough = mod.useReducedMotionVariants(mod.variants.emberPulse);

    // Full variant: scale array intact.
    expect((passthrough.pulse as { scale?: unknown }).scale).toEqual([1, 1.02, 1]);
  });

  it('re-exports `LazyMotion` from framer-motion', async () => {
    const mod = await import('@/lib/motion/defaults');
    const fm = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    expect(mod.LazyMotion).toBe(fm.LazyMotion);
  });

  it('re-exports `domAnimation` from framer-motion (LazyMotion features prop)', async () => {
    const mod = await import('@/lib/motion/defaults');
    const fm = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    expect(mod.domAnimation).toBe(fm.domAnimation);
  });

  it('re-exports `m` namespace from framer-motion', async () => {
    const mod = await import('@/lib/motion/defaults');
    const fm = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    expect(mod.m).toBe(fm.m);
  });

  it('re-exports `AnimatePresence` from framer-motion', async () => {
    const mod = await import('@/lib/motion/defaults');
    const fm = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    expect(mod.AnimatePresence).toBe(fm.AnimatePresence);
  });

  it('re-exports `useReducedMotion` (under a stable name)', async () => {
    const mod = await import('@/lib/motion/defaults');
    expect(typeof mod.useReducedMotion).toBe('function');
  });
});

/**
 * Codex Round 3 (I-R2-1) — wrapped `useReducedMotion` integrates the
 * in-app accessibility toggle with the OS-level signal.
 *
 * Contract:
 *   - The hook reads OS pref via Framer's `useReducedMotion` AND the
 *     in-app override (`localStorage['kalori.reduce-motion'] === '1'`
 *     OR `document.documentElement.dataset.reduceMotion === '1'`).
 *   - Result is `osReduce || appReduce`. If EITHER source says reduce,
 *     the hook returns true.
 *   - SSR-safe: no module-top-level access to `document` / `localStorage`.
 *   - Reactive to `dataset.reduceMotion` changes via MutationObserver.
 *   - Reactive to cross-tab `kalori.reduce-motion` storage events.
 */
describe('lib/motion/defaults — useReducedMotion (in-app toggle integration, R3 I-R2-1)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.removeAttribute('data-reduce-motion');
    try {
      window.localStorage.clear();
    } catch {
      // ignore — happy-dom always exposes localStorage
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('data-reduce-motion');
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('returns true when ONLY OS pref says reduce (in-app toggle off)', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { renderHook } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('returns true when ONLY html[data-reduce-motion] is set (OS = no preference)', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
    document.documentElement.setAttribute('data-reduce-motion', '1');

    const { renderHook } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('returns true when ONLY localStorage override is set (OS = no preference, dataset = unset)', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
    window.localStorage.setItem('kalori.reduce-motion', '1');

    const { renderHook } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('returns false when neither OS pref nor in-app toggle is set', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { renderHook } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('reacts to html[data-reduce-motion] mutations during the hook lifetime', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { renderHook, act } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    // Initial state: nothing set.
    expect(result.current).toBe(false);

    // Simulate ReduceMotionToggle setting the data attribute.
    await act(async () => {
      document.documentElement.setAttribute('data-reduce-motion', '1');
      // MutationObserver callbacks are scheduled microtask-style; flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(true);

    // Toggle back off.
    await act(async () => {
      document.documentElement.removeAttribute('data-reduce-motion');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(false);
  });

  it('reacts to cross-tab StorageEvent for kalori.reduce-motion', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { renderHook, act } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(false);

    await act(async () => {
      // Cross-tab: another tab wrote the override. Storage events fire
      // in OTHER tabs (not the one that set), but happy-dom doesn't
      // emit them automatically — dispatch manually and seed the value
      // so the hook re-reads via getSnapshot.
      window.localStorage.setItem('kalori.reduce-motion', '1');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'kalori.reduce-motion',
          newValue: '1',
        }),
      );
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });

  it('reacts to same-tab kalori:reduce-motion-change CustomEvent dispatched by ReduceMotionToggle', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { renderHook, act } = await import('@testing-library/react');
    const mod = await import('@/lib/motion/defaults');
    const { result } = renderHook(() => mod.useReducedMotion());

    expect(result.current).toBe(false);

    await act(async () => {
      window.localStorage.setItem('kalori.reduce-motion', '1');
      window.dispatchEvent(new CustomEvent('kalori:reduce-motion-change'));
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });
});
