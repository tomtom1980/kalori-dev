/**
 * @vitest-environment happy-dom
 *
 * Task C.CODEX Round 1 — `<FadeUpCard />` reduced-motion contract.
 *
 * Codex finding: `components/motion/FadeUpCard.tsx` imported
 * `useReducedMotion` directly from `framer-motion`. Framer's hook reads
 * ONLY the OS-level `(prefers-reduced-motion: reduce)` media query, so
 * the in-app Settings → Reduce Motion toggle (which writes
 * `html[data-reduce-motion="1"]` and `localStorage['kalori.reduce-motion']`)
 * never propagated to FadeUpCard. The wrapped `useReducedMotion` exported
 * from `@/lib/motion/defaults` ORs all three signals and is the only
 * acceptable source for Framer-driven components.
 *
 * Contract asserted by this file:
 *   1. With OS pref OFF + in-app toggle ON (data-reduce-motion = "1"),
 *      FadeUpCard renders WITHOUT entrance motion (opacity 1, no
 *      translateY transform).
 *   2. With both OS pref + in-app toggle OFF, FadeUpCard renders with
 *      its entrance motion (initial opacity 0 + translateY(16px)).
 *      Regression guard against accidentally over-suppressing motion.
 *   3. With OS pref ON + in-app toggle OFF, FadeUpCard renders WITHOUT
 *      entrance motion (proves the OS-only path still works).
 *
 * The structure mirrors `defaults.test.ts` — Framer's `useReducedMotion`
 * is mocked so the test stays deterministic under happy-dom (which has
 * no real prefers-reduced-motion signal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

import * as fm from 'framer-motion';
import { FadeUpCard } from '@/components/motion/FadeUpCard';
import { MotionProvider } from '@/lib/motion/MotionProvider';

function getCardEl(): HTMLElement {
  return screen.getByTestId('fade-up-card-child').parentElement as HTMLElement;
}

describe('<FadeUpCard /> — reduced-motion (in-app + OS)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.removeAttribute('data-reduce-motion');
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-reduce-motion');
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
    vi.clearAllMocks();
  });

  it('respects the in-app Reduce Motion toggle (data-reduce-motion="1") when OS pref is OFF', () => {
    // OS pref off, in-app override on (the Codex-flagged scenario).
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
    document.documentElement.setAttribute('data-reduce-motion', '1');

    render(
      <MotionProvider>
        <FadeUpCard>
          <span data-testid="fade-up-card-child">payload</span>
        </FadeUpCard>
      </MotionProvider>,
    );

    const cardEl = getCardEl();
    // Reduced-motion path: initial={false} skips the opacity:0 / y:16
    // starting frame, so the rendered DOM is at the final frame
    // immediately — opacity 1 and no translateY transform.
    const opacity = cardEl.style.opacity;
    // Framer either writes 'opacity: 1' inline or leaves it unset
    // (final-frame default). Either is acceptable — the failing
    // pre-fix scenario writes 'opacity: 0'.
    expect(opacity === '' || opacity === '1').toBe(true);
    // No inline translateY(16px) should be present on the reduced-motion
    // path. The pre-fix code writes `transform: translateY(16px)` here
    // because Framer interprets `initial={{ y: 16 }}`.
    expect(cardEl.style.transform).not.toMatch(/translateY\(\s*16/);
  });

  it('plays the entrance motion when neither OS pref nor in-app toggle is set', () => {
    // Both off → animation plays. Default path.
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
    // No data-reduce-motion attr, no localStorage key set.

    render(
      <MotionProvider>
        <FadeUpCard>
          <span data-testid="fade-up-card-child">payload</span>
        </FadeUpCard>
      </MotionProvider>,
    );

    const cardEl = getCardEl();
    // Animation plays: the initial frame is opacity:0 + translateY(16px).
    // Framer writes these as inline styles on mount.
    expect(cardEl.style.opacity).toBe('0');
    expect(cardEl.style.transform).toMatch(/translateY\(16px\)/);
  });

  it('respects the OS-level prefers-reduced-motion signal (regression guard)', () => {
    // OS pref on, in-app override off — this is the only path the
    // pre-fix code handled. Confirm the fix doesn't break it.
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(true);

    render(
      <MotionProvider>
        <FadeUpCard>
          <span data-testid="fade-up-card-child">payload</span>
        </FadeUpCard>
      </MotionProvider>,
    );

    const cardEl = getCardEl();
    const opacity = cardEl.style.opacity;
    expect(opacity === '' || opacity === '1').toBe(true);
    expect(cardEl.style.transform).not.toMatch(/translateY\(\s*16/);
  });
});
