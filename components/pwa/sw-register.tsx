'use client';

/**
 * Task 5.1.2 — Service worker registration client component.
 *
 * Mounted ONCE in the root layout. Runs registration inside `useEffect` so it
 * only fires post-hydration on the client. Renders nothing.
 *
 * Hydration safety contract (per Planning/.tmp/task-5.1-ui-react-perf.md §A):
 *   - Returns null — no DOM diff between server / client.
 *   - Uses `useEffect` (NOT `useLayoutEffect`); registration is post-paint.
 *   - Guards on `'serviceWorker' in navigator` — bails silently if absent
 *     (e.g. iOS Safari before 11.3, in-app browsers, SSR).
 *
 * Update strategy:
 *   - Does NOT auto-call `skipWaiting`. The new SW stays in `waiting` state
 *     until the user opts in via the update affordance UI (Task 5.1.4).
 *   - Exports `triggerUpdate()` — Task 5.1.4 wires this to the bottom ribbon
 *     "NEW EDITION READY · REFRESH" tap target. Posts SKIP_WAITING and reloads.
 *
 * Sentry policy (errors-only):
 *   - Breadcrumb on successful registration (one per app load — not spammy).
 *   - captureException on register failure (non-recoverable).
 *   - No breadcrumbs on routine SW lifecycle (installing / waiting / activated).
 */

import { addBreadcrumb, captureException } from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Module-level singleton holders. The component is idempotent — multiple
 * mounts (route transitions, React 19 strict-mode dev double-mount) MUST NOT
 * register the SW twice.
 */
let didRegister = false;
let activeRegistration: ServiceWorkerRegistration | null = null;

function isDev(): boolean {
  return process.env.NEXT_PUBLIC_KALORI_ENV === 'development';
}

/**
 * Register the SW. Idempotent on success — once a registration resolves we
 * stash it on the module singleton and return the same handle for any
 * subsequent caller. On FAILURE we deliberately leave `didRegister = false`
 * so that a future remount (e.g. after a transient network failure during
 * the initial `/sw.js` fetch) can retry. The Sentry exception is still
 * captured per attempt so we don't silently swallow repeated failures.
 *
 * Returns null when the browser does not support service workers OR we are
 * in development env.
 */
async function registerOnce(): Promise<ServiceWorkerRegistration | null> {
  if (didRegister) return activeRegistration;

  if (isDev()) return null;

  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof (navigator as Navigator).serviceWorker?.register !== 'function'
  ) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Mark success ONLY after the registration promise resolves. Setting the
    // guard before `await` would poison the singleton on failure and prevent
    // any retry on subsequent remount (Codex Improvement #2).
    didRegister = true;
    activeRegistration = registration;
    addBreadcrumb({
      category: 'pwa.sw',
      message: 'Service worker registered',
      level: 'info',
      data: { scope: registration.scope },
    });
    return registration;
  } catch (err) {
    // Failure path — leave `didRegister` false so a future mount can retry.
    captureException(err, {
      tags: { area: 'pwa.sw.registration' },
    });
    return null;
  }
}

/**
 * Manually trigger the waiting SW to activate. Exposed for the update
 * affordance UI (Task 5.1.4). Safe to call when no SW is waiting — no-ops.
 */
export async function triggerUpdate(): Promise<void> {
  const registration = activeRegistration;
  if (!registration?.waiting) return;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  // Reload AFTER posting SKIP_WAITING so the new SW takes control on the
  // next document load. We do not wait for `controllerchange` because that
  // event can be racy across browsers; a hard reload is deterministic.
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Test-only escape hatch — resets the module-level guard so each test can
 * exercise the registration path from a clean slate. Not exported in
 * production builds (vitest imports the module fresh per test via
 * `vi.resetModules()`).
 */
export function __resetForTests(): void {
  didRegister = false;
  activeRegistration = null;
}

/**
 * Mount-once SW registration. Returns null. Place inside `<body>` in the root
 * layout — outside any Suspense boundary so it does not block streaming.
 */
export function SwRegister(): null {
  useEffect(() => {
    void registerOnce();
  }, []);
  return null;
}
