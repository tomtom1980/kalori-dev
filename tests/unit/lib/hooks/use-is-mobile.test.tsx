/**
 * Bug 4 — `useIsMobile()` viewport breakpoint hook (bugfix-tomi
 * 2026-05-08-mobile-ui-overhaul). RED tests first per project TDD policy.
 *
 * Contract per `Planning/ui-design.md` §4.1.10 + §13 tiebreaker #23:
 *   - Returns `true` when viewport <1280px (`(max-width: 1279px)` matches)
 *   - Returns `false` at >=1280px
 *   - Reacts to `matchMedia` change events (resize across the breakpoint)
 *   - SSR-safe: returns a defined boolean before hydration (default `false`)
 *
 * The hook is a wrapper around `useSyncExternalStore` over
 * `window.matchMedia('(max-width: 1279px)')`. happy-dom does NOT implement
 * `matchMedia`, so each test stubs `globalThis.matchMedia` with a mock
 * that returns a controllable `MediaQueryList`-shaped object.
 */
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from '@/lib/hooks/use-is-mobile';

type Listener = (ev: { matches: boolean }) => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: '(max-width: 1279px)',
    addEventListener: vi.fn((_evt: 'change', cb: Listener) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_evt: 'change', cb: Listener) => {
      listeners.delete(cb);
    }),
    // Legacy Safari API — older RN-WebKit shims call addListener / removeListener.
    addListener: vi.fn((cb: Listener) => listeners.add(cb)),
    removeListener: vi.fn((cb: Listener) => listeners.delete(cb)),
    dispatchEvent: vi.fn(() => true),
    onchange: null,
  } as unknown as MediaQueryList & { __setMatches: (next: boolean) => void };

  (mql as unknown as { __setMatches: (next: boolean) => void }).__setMatches = (next) => {
    matches = next;
    for (const cb of listeners) cb({ matches: next });
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn((_q: string) => mql),
  );
  // happy-dom: window === globalThis, but be explicit so the spec doesn't
  // depend on that detail.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: globalThis.matchMedia,
    });
  }
  return mql as unknown as { __setMatches: (next: boolean) => void };
}

describe('useIsMobile()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when matchMedia matches the mobile/tablet query (375px viewport)', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns true when matchMedia matches the mobile/tablet query (768px tablet viewport)', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia does not match (1280px viewport)', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when matchMedia fires a change event (resize across the breakpoint)', () => {
    const handle = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      handle.__setMatches(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      handle.__setMatches(false);
    });
    expect(result.current).toBe(false);
  });

  it('SSR-safe: returns false when matchMedia is undefined (no window)', () => {
    // Simulate SSR by removing matchMedia. useSyncExternalStore's getServerSnapshot
    // path must not throw — the hook must use the explicit SSR fallback.
    vi.stubGlobal('matchMedia', undefined as unknown as Window['matchMedia']);
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('subscribes / unsubscribes via addEventListener on mount/unmount (no listener leak)', () => {
    const handle = installMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    const mql = (
      globalThis as unknown as {
        matchMedia: (q: string) => MediaQueryList & {
          addEventListener: ReturnType<typeof vi.fn>;
          removeEventListener: ReturnType<typeof vi.fn>;
        };
      }
    ).matchMedia('(max-width: 1279px)');
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
    // Reference handle so eslint-no-unused doesn't trip on the variable —
    // we rely on the listener-leak invariant directly above.
    void handle;
  });

  it('integrates inside a component (renders mobile/desktop branch correctly)', () => {
    installMatchMedia(true);
    function Probe() {
      const isMobile = useIsMobile();
      return <span data-testid="probe">{isMobile ? 'mobile' : 'desktop'}</span>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('mobile');
  });
});
