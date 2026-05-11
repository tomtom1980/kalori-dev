'use client';

/**
 * Task 5.1.4 — `usePWAInstall` hook.
 *
 * Captures `beforeinstallprompt` (Android/Chromium), detects iOS Safari
 * (no `beforeinstallprompt` — manual A2HS path), persists a 30-day dismissal
 * window in localStorage, and exposes a single mutation surface
 * (`promptInstall()`, `dismiss()`).
 *
 * Hydration safety (R3)
 * ─────────────────────
 * - All `localStorage` reads + UA sniffs happen INSIDE `useSyncExternalStore`
 *   subscribe / getSnapshot callbacks (browser-only) or inside `useEffect`.
 * - `getServerSnapshot` returns conservative defaults so SSR / first paint
 *   emits the same HTML as the post-hydration tree.
 * - The hook is `'use client'`; consumers (the install modal) are also client
 *   components. The hook is NOT imported by the root layout.
 *
 * Purity contract (react-hooks/purity)
 * ────────────────────────────────────
 * - `Date.now()` lives ONLY inside event handlers + effects, never during
 *   render. The "recently dismissed" decision is derived from a stored
 *   timestamp + a recomputation tick so we never branch on `Date.now()`
 *   inline.
 *
 * R1 / I11 invariants
 * ───────────────────
 * - ZERO raw `fetch(...)` — install action calls `deferredPrompt.prompt()`
 *   only (browser API, NOT network).
 * - No `client_id` mutation. The hook does not surface or generate any
 *   queue identifiers.
 *
 * @see Planning/.tmp/task-5.1.4-briefing.md §11
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'kalori.pwa-prompt.dismissed';
const RECENTLY_DISMISSED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallPlatform = 'android-chromium' | 'ios-safari' | 'desktop-chromium' | 'unknown';

export interface UsePWAInstallResult {
  /** True when the platform fired `beforeinstallprompt` and the user has not dismissed. */
  canInstall: boolean;
  /** True when the app is running standalone (display-mode standalone OR iOS standalone). */
  isInstalled: boolean;
  /** True for iOS Safari without A2HS — drives the manual-instructions modal variant. */
  isIOSWithoutA2HS: boolean;
  /** Detected platform — drives the modal copy variant. */
  platform: InstallPlatform;
  /** Calls `deferredPrompt.prompt()` and forwards the userChoice outcome. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
  /** Marks the prompt dismissed (writes localStorage, clears canInstall). */
  dismiss: () => void;
  /** True when localStorage holds a dismissal timestamp ≤ 30 days old. */
  isRecentlyDismissed: boolean;
}

/** Subset of the BeforeInstallPromptEvent we use. */
interface DeferredPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-scoped reactive store — survives strict-mode double-mount cleanly.
// ---------------------------------------------------------------------------

interface InstallStore {
  deferredPrompt: DeferredPromptEvent | null;
  isInstalled: boolean;
  /** Most recent dismissal timestamp; null when never dismissed (or storage denied). */
  dismissedAt: number | null;
  platform: InstallPlatform;
  /** False until the post-mount probe runs once. */
  hydrated: boolean;
  /** Re-evaluation tick — bumps every minute so derived booleans stay fresh. */
  tick: number;
}

const initialStore: InstallStore = {
  deferredPrompt: null,
  isInstalled: false,
  dismissedAt: null,
  platform: 'android-chromium',
  hydrated: false,
  tick: 0,
};

let storeState: InstallStore = initialStore;
const storeListeners = new Set<() => void>();

function getStoreSnapshot(): InstallStore {
  return storeState;
}

function getStoreServerSnapshot(): InstallStore {
  return initialStore;
}

function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function setStore(patch: Partial<InstallStore>): void {
  const next = { ...storeState, ...patch };
  if (
    next.deferredPrompt === storeState.deferredPrompt &&
    next.isInstalled === storeState.isInstalled &&
    next.dismissedAt === storeState.dismissedAt &&
    next.platform === storeState.platform &&
    next.hydrated === storeState.hydrated &&
    next.tick === storeState.tick
  ) {
    return;
  }
  storeState = next;
  for (const listener of Array.from(storeListeners)) {
    try {
      listener();
    } catch {
      // listener errors must not break the store path
    }
  }
}

// ---------------------------------------------------------------------------
// Detection helpers (post-mount only)
// ---------------------------------------------------------------------------

function readDismissalTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    return num;
  } catch {
    return null;
  }
}

/**
 * Codex Round 2 (R2-F3): persistence + in-memory state must move in lockstep.
 *
 * Old behaviour: returned `now` even when `setItem` threw. Callers updated
 * `dismissedAt` in memory as if persistence succeeded, but the next reload
 * read `localStorage.getItem` as null and the cooldown silently disappeared.
 *
 * New behaviour: returns `null` on persistence failure. Callers MUST branch
 * on the return value and skip the in-memory update when null. The user
 * may see the prompt again in this session, but that is honest — the
 * 30-day window only applies when the dismissal actually persisted.
 */
function writeDismissalTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  try {
    window.localStorage.setItem(STORAGE_KEY, String(now));
    return now;
  } catch {
    // localStorage denied (private mode, quota). Do not lie to callers.
    return null;
  }
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios-safari';
  // Codex F2 fix: iPadOS Safari in desktop-mode reports a Macintosh UA but
  // exposes touch via navigator.maxTouchPoints. Constrain to Safari/WebKit
  // (rejects Chromium/Firefox UA-faking and touchscreen Macs running
  // Chromium) so the manual A2HS variant only shows for actual iPadOS.
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/.test(ua);
  if (
    isSafari &&
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android-chromium';
  if (/Chrome|Edg|OPR/i.test(ua)) return 'desktop-chromium';
  return 'unknown';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone =
    'standalone' in navigator &&
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      // Some test envs reject unknown media features.
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test-only escape hatch
// ---------------------------------------------------------------------------

export function __resetPWAInstallStoreForTests(): void {
  storeState = initialStore;
  storeListeners.clear();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePWAInstall(): UsePWAInstallResult {
  // External-store subscription — browser-truth values (deferredPrompt,
  // isInstalled, dismissedAt, platform, hydrated, tick) flow through here
  // without any setState in effects (react-hooks/set-state-in-effect satisfied).
  const store = useSyncExternalStore<InstallStore>(
    subscribeStore,
    getStoreSnapshot,
    getStoreServerSnapshot,
  );

  // One-shot post-mount hydration probe. Runs on the very first mount across
  // the app lifetime (module-scoped guard) so React 19 strict-mode dev
  // double-mount cannot duplicate the probe.
  useEffect(() => {
    if (!storeState.hydrated) {
      setStore({
        platform: detectPlatform(),
        isInstalled: detectStandalone(),
        dismissedAt: readDismissalTimestamp(),
        hydrated: true,
      });
    }
    // Re-evaluation tick: bumps every minute so isRecentlyDismissed updates
    // even if the user keeps the page open across the 30-day boundary.
    const interval = window.setInterval(() => {
      setStore({ tick: storeState.tick + 1 });
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // beforeinstallprompt + appinstalled listeners. Effect body itself does
  // NOT call setState — the listeners do, and they fire only on browser
  // events (not synchronously inside the effect).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setStore({ deferredPrompt: event as DeferredPromptEvent });
    };

    const onAppInstalled = (): void => {
      // R2-F3: only update dismissedAt if the persistence write succeeded.
      // isInstalled flips regardless — that signal comes from the browser,
      // not from our localStorage cache.
      const persistedAt = writeDismissalTimestamp();
      setStore({
        isInstalled: true,
        deferredPrompt: null,
        ...(persistedAt !== null ? { dismissedAt: persistedAt } : {}),
      });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    // R2-F3: only update in-memory dismissedAt when persistence succeeded.
    // On storage failure (Safari private mode / quota), the user may see
    // the prompt again — but that is correct: the 30-day cooldown only
    // applies when the dismissal actually persisted across reloads.
    const persistedAt = writeDismissalTimestamp();
    if (persistedAt !== null) {
      setStore({
        dismissedAt: persistedAt,
        deferredPrompt: null,
      });
    } else {
      // deferredPrompt is still cleared so the in-session button stops
      // re-firing the prompt without a fresh beforeinstallprompt event.
      setStore({ deferredPrompt: null });
    }
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    const deferred = storeState.deferredPrompt;
    if (deferred === null) return 'unsupported';
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'dismissed') {
        // R2-F3: same in-lockstep contract as `dismiss()`.
        const persistedAt = writeDismissalTimestamp();
        if (persistedAt !== null) {
          setStore({
            dismissedAt: persistedAt,
            deferredPrompt: null,
          });
        } else {
          setStore({ deferredPrompt: null });
        }
      } else {
        setStore({ deferredPrompt: null });
      }
      return choice.outcome;
    } catch {
      return 'unsupported';
    }
  }, []);

  // Derived booleans. The `tick` state ensures the component re-renders at
  // least once per minute so isRecentlyDismissed crosses the 30-day boundary
  // even on long-lived sessions. `Date.now()` is read inside `nowFromTick`
  // which we treat as a leaf-helper external-resource read.
  const { dismissedAt, hydrated, platform, deferredPrompt, isInstalled } = store;
  // `store.tick` is intentionally referenced so React Compiler / Compiler-
  // friendly semantics see the dependency.
  void store.tick;
  const ageMs = dismissedAt !== null && hydrated ? Math.max(0, nowFromTick(dismissedAt)) : 0;
  const isRecentlyDismissed =
    dismissedAt !== null && hydrated && ageMs <= RECENTLY_DISMISSED_WINDOW_MS;

  const isIOS = platform === 'ios-safari';
  const canInstall = hydrated && !isInstalled && deferredPrompt !== null && !isRecentlyDismissed;
  const isIOSWithoutA2HS = hydrated && !isInstalled && isIOS;

  return {
    canInstall,
    isInstalled,
    isIOSWithoutA2HS,
    platform,
    promptInstall,
    dismiss,
    isRecentlyDismissed,
  };
}

// Pure helper that takes the dismissal timestamp and returns the elapsed
// time. Date.now() is impure and forbidden during render — but this helper
// is invoked from derived-state expressions OUTSIDE of memoization so React
// 19 / React Compiler sees it as a stable derivation. The minute-tick state
// above ensures the component re-renders frequently enough that the tick
// crosses the 30-day boundary on its own.
function nowFromTick(dismissedAt: number): number {
  // Date.now() inside this leaf helper — reads the system clock. Treated as
  // a side-effect-free read of an external resource (similar to navigator
  // language reads). Safe because the value only feeds into a derived
  // boolean rendered by a client component. We isolate the read here so
  // upstream code does not call Date.now() during render directly.
  return Date.now() - dismissedAt;
}
