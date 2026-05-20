/**
 * `useIsMobile()` — viewport breakpoint hook (Bug 4 / bugfix-tomi
 * 2026-05-08-mobile-ui-overhaul).
 *
 * Returns `true` when the viewport matches `(max-width: 1279px)`. Wired
 * via `useSyncExternalStore` so React 19 concurrent rendering observes
 * the same `MediaQueryList` snapshot every commit (no tearing) and we
 * subscribe / unsubscribe deterministically with the component
 * lifecycle.
 *
 * Authoritative breakpoint per `Planning/ui-design.md` §4.1.10 and §13
 * tiebreaker #23 — the same query the mobile wheel-picker uses to swap
 * inline-stepper / dropdown surfaces for the bottom-sheet wheel.
 *
 * SSR / non-DOM environments: `getServerSnapshot` returns `false`
 * (desktop default) so the rendered HTML is the desktop tree, which the
 * client then reconciles to mobile on hydration if the client viewport
 * matches. This matches the React 19 "render desktop on the server,
 * hydrate to whatever the user actually has" pattern used elsewhere in
 * the app.
 */
import { useSyncExternalStore } from 'react';

/**
 * The single source-of-truth media query for "mobile/tablet viewport". Kept in
 * a constant so consumers can reference it (e.g., `Planning/ui-design.md`
 * §13 tiebreaker #23 cites the literal string).
 */
export const MOBILE_QUERY = '(max-width: 1279px)';

type MQ = MediaQueryList & {
  // Legacy Safari < 14 / older WebKit shims expose addListener / removeListener
  // instead of addEventListener('change', ...). We feature-detect both so the
  // hook works on any browser the project's PWA target list covers.
  addListener?: (cb: (ev: MediaQueryListEvent) => void) => void;
  removeListener?: (cb: (ev: MediaQueryListEvent) => void) => void;
};

function getMql(): MQ | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(MOBILE_QUERY) as MQ;
}

function subscribe(notify: () => void): () => void {
  const mql = getMql();
  if (!mql) return () => {};
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', notify);
    return () => mql.removeEventListener('change', notify);
  }
  // Legacy fallback. The cb signature matches MediaQueryListEvent at runtime;
  // the wrapper exists so the typings line up.
  const cb = () => notify();
  mql.addListener?.(cb);
  return () => mql.removeListener?.(cb);
}

function getSnapshot(): boolean {
  const mql = getMql();
  if (!mql) return false;
  return mql.matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
