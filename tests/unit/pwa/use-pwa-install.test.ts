/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.4 — `usePWAInstall` hook unit tests.
 *
 * AC1 (hook captures `beforeinstallprompt`, `install()` resolves, dismissal
 * persists in localStorage), partial AC2 (iOS detection drives platform
 * variant), AC6 (already-installed silences install path), R3 (hydration-safe
 * conservative defaults).
 *
 * Briefing: `planning/.tmp/task-5.1.4-briefing.md` §11 + §13a.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kalori.pwa-prompt.dismissed';
const DAYS = 24 * 60 * 60 * 1000;

function dispatchBeforeInstallPrompt(opts?: { userChoice?: 'accepted' | 'dismissed' }): {
  prompt: ReturnType<typeof vi.fn>;
  preventDefault: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
} {
  // Constructed event with the methods Chrome's BeforeInstallPromptEvent
  // exposes. Tests dispatch it via window.dispatchEvent so the hook's
  // 'beforeinstallprompt' listener fires the same code path as production.
  const userChoice = Promise.resolve({
    outcome: opts?.userChoice ?? 'accepted',
    platform: 'web',
  });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const preventDefault = vi.fn();
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: typeof prompt;
    preventDefault: typeof preventDefault;
    userChoice: typeof userChoice;
  };
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'preventDefault', { value: preventDefault });
  Object.defineProperty(event, 'userChoice', { value: userChoice });
  window.dispatchEvent(event);
  return { prompt, preventDefault, userChoice };
}

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
}

function clearDismissalStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // happy-dom localStorage is always present; ignore failures.
  }
}

beforeEach(async () => {
  clearDismissalStorage();
  // Default UA — Android Chromium (the install-supported path).
  setUserAgent(
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  );
  // Ensure standalone is not set globally.
  delete (navigator as unknown as { standalone?: boolean }).standalone;
  // Reset module-scoped store so prior tests' hydration / dismissal does not
  // bleed into this run (the hook's external store is module-scoped to
  // survive React 19 strict-mode double-mount cleanly).
  const mod = await import('@/lib/pwa/use-pwa-install');
  mod.__resetPWAInstallStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('usePWAInstall — beforeinstallprompt capture', () => {
  it('AC1: returns conservative defaults on first render before any event fires', async () => {
    // AC1 + R3: hydration-safe defaults so SSR / first paint never branches
    // on platform-specific state.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.isIOSWithoutA2HS).toBe(false);
    expect(result.current.platform).toBe('android-chromium');
    expect(typeof result.current.promptInstall).toBe('function');
    expect(typeof result.current.dismiss).toBe('function');
    expect(result.current.isRecentlyDismissed).toBe(false);
  });

  it('AC1: captures beforeinstallprompt and flips canInstall to true', async () => {
    // AC1: deferred prompt capture is the gate that unlocks promptInstall.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      dispatchBeforeInstallPrompt();
    });
    await waitFor(() => {
      expect(result.current.canInstall).toBe(true);
    });
  });

  it('AC1: preventDefault is called on the captured event', async () => {
    // AC1: capturing the event without preventDefault would let Chrome show
    // its native mini-infobar — exactly what the design rejects.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    renderHook(() => usePWAInstall());
    let preventDefault: ReturnType<typeof vi.fn>;
    act(() => {
      preventDefault = dispatchBeforeInstallPrompt().preventDefault;
    });
    expect(preventDefault!).toHaveBeenCalledTimes(1);
  });
});

describe('usePWAInstall — promptInstall', () => {
  it('AC1: promptInstall calls deferredPrompt.prompt and resolves with outcome', async () => {
    // AC1: install flow forwards userChoice outcome to caller for telemetry.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    let prompt!: ReturnType<typeof vi.fn>;
    act(() => {
      prompt = dispatchBeforeInstallPrompt({ userChoice: 'accepted' }).prompt;
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));
    let outcome: 'accepted' | 'dismissed' | 'unsupported' = 'unsupported';
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('accepted');
  });

  it('AC1: promptInstall forwards dismissed outcome and persists dismissal flag', async () => {
    // AC1: when the user dismisses the system prompt the hook records that
    // dismissal so we honour the 30-day quiet window.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      dispatchBeforeInstallPrompt({ userChoice: 'dismissed' });
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));
    let outcome: 'accepted' | 'dismissed' | 'unsupported' = 'unsupported';
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('dismissed');
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
  });

  it('AC1: promptInstall resolves with "unsupported" on iOS path', async () => {
    // AC1: iOS has no beforeinstallprompt; promptInstall should signal that
    // upstream so the modal can show manual A2HS instructions instead.
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    let outcome: 'accepted' | 'dismissed' | 'unsupported' = 'accepted';
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('unsupported');
  });
});

describe('usePWAInstall — dismissal persistence', () => {
  it('AC1: dismiss() writes a timestamp to localStorage', async () => {
    // AC1: timestamp form drives the 30-day re-prompt window calculation.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    const before = Date.now();
    act(() => {
      result.current.dismiss();
    });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = Number(stored);
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });

  it('AC1: isRecentlyDismissed=true within 30 days', async () => {
    // AC1: ≤ 30 days since the last dismissal silences auto-trigger.
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() - 29 * DAYS));
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.isRecentlyDismissed).toBe(true);
    });
  });

  it('AC1: isRecentlyDismissed=false past 30 days', async () => {
    // AC1: > 30 days lets the auto-trigger surface again.
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() - 31 * DAYS));
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.isRecentlyDismissed).toBe(false);
    });
  });
});

describe('usePWAInstall — appinstalled event', () => {
  it('AC1: appinstalled event flips isInstalled and persists dismissal', async () => {
    // AC1: a successful install should silence both auto + manual triggers.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    act(() => {
      dispatchBeforeInstallPrompt();
    });
    await waitFor(() => expect(result.current.canInstall).toBe(true));
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.canInstall).toBe(false);
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('usePWAInstall — iOS path detection', () => {
  it('AC1 + AC2: iPhone UA without standalone sets isIOSWithoutA2HS=true', async () => {
    // AC1 + AC2: iOS path drives the "Three steps" copy variant.
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.platform).toBe('ios-safari');
      expect(result.current.isIOSWithoutA2HS).toBe(true);
      expect(result.current.canInstall).toBe(false);
    });
  });

  it('AC1: navigator.standalone===true marks isInstalled and skips install path', async () => {
    // AC1: already-installed iOS PWAs should be silent.
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.isIOSWithoutA2HS).toBe(false);
      expect(result.current.canInstall).toBe(false);
    });
    delete (navigator as unknown as { standalone?: boolean }).standalone;
  });
});

describe('usePWAInstall — iPadOS desktop-mode Safari detection (Codex F2)', () => {
  function setMaxTouchPoints(n: number): void {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => n,
    });
  }

  it('AC5: iPadOS desktop-mode Safari (Macintosh UA + maxTouchPoints>1) classifies as ios-safari', async () => {
    // Codex F2: modern iPadOS Safari reports a desktop UA containing
    // "Macintosh" while exposing touch via navigator.maxTouchPoints. Without
    // this branch the install hook returns platform: 'unknown' and the iOS
    // manual-A2HS modal variant never shows, leaving iPad users with a
    // disabled install button.
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    setMaxTouchPoints(5);
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.platform).toBe('ios-safari');
      expect(result.current.isIOSWithoutA2HS).toBe(true);
    });
    setMaxTouchPoints(0);
  });

  it('AC5 (negative): real desktop Mac Safari (Macintosh UA + maxTouchPoints=0) does NOT classify as ios-safari', async () => {
    // Codex F2 negative case: a real Mac with Safari and no touch support
    // must NOT match the iPadOS desktop-mode branch — it has no Add to Home
    // Screen path.
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    setMaxTouchPoints(0);
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.platform).not.toBe('ios-safari');
      expect(result.current.isIOSWithoutA2HS).toBe(false);
    });
  });

  it('AC5 (negative): Chromium with desktop-mode-fake (Chrome UA + Macintosh + maxTouchPoints>1) is NOT iOS', async () => {
    // Codex F2 negative case: the Safari-engine constraint must reject UAs
    // that contain Chrome / Chromium / Edge etc., even if they happen to
    // include "Macintosh" and report touch points (UA spoofing or touch-Mac
    // hardware emulation should not trip the iPadOS branch).
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    );
    setMaxTouchPoints(5);
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(result.current.platform).not.toBe('ios-safari');
      expect(result.current.isIOSWithoutA2HS).toBe(false);
    });
    setMaxTouchPoints(0);
  });
});

describe('usePWAInstall — dismissal persistence failure (R2-F3)', () => {
  it('AC1/R2-F3: dismiss() does NOT update in-memory state when localStorage.setItem throws', async () => {
    // R2-F3 (Codex Round 2 Improvement): when the underlying storage write
    // is denied (Safari private mode, quota exceeded), the hook MUST NOT
    // update its in-memory dismissedAt as if persistence succeeded.
    // Otherwise the cooldown silently disappears on the next reload — the
    // user is re-prompted despite having dismissed in the previous session.
    //
    // The chosen behaviour: leave dismissedAt unchanged on write failure.
    // The user CAN see the prompt again in this session — that is honest
    // (the alternative is to lie about persistence).
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    // Wait for hydration — without it, `isRecentlyDismissed` may flicker.
    await waitFor(() => {
      // Hydration probe: any post-mount derived value reads as defined.
      expect(typeof result.current.isRecentlyDismissed).toBe('boolean');
    });
    const before = result.current.isRecentlyDismissed;

    // Force every setItem call to throw (mimics QuotaExceededError).
    const origSetItem = window.localStorage.setItem.bind(window.localStorage);
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      act(() => {
        result.current.dismiss();
      });

      // In-memory state did not change — caller can re-attempt next session.
      // (Crucially, NOT the silent-success behaviour where dismissedAt is
      // set in memory but the next reload reads localStorage as empty.)
      expect(result.current.isRecentlyDismissed).toBe(before);
      // localStorage was probed (the call was attempted), but raised.
      expect(setItemSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      // Re-bind to ensure later tests have a clean storage surface.
      window.localStorage.setItem = origSetItem;
    }
  });

  it('AC1/R2-F3: dismiss() DOES update in-memory state when localStorage.setItem succeeds (positive control)', async () => {
    // Positive control: the happy path still flips isRecentlyDismissed.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const { result } = renderHook(() => usePWAInstall());
    await waitFor(() => {
      expect(typeof result.current.isRecentlyDismissed).toBe('boolean');
    });
    expect(result.current.isRecentlyDismissed).toBe(false);

    act(() => {
      result.current.dismiss();
    });

    await waitFor(() => {
      expect(result.current.isRecentlyDismissed).toBe(true);
    });
    // localStorage was actually written.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('usePWAInstall — strict-mode safety', () => {
  it('AC1: unmount cleans up event listeners', async () => {
    // AC1: React 19 strict-mode dev double-mount must not duplicate listeners,
    // and unmount must remove them so subsequent dispatches are inert.
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePWAInstall());
    const addedBeforeUnmount = addSpy.mock.calls.filter(([type]) => {
      const t = type as string;
      return t === 'beforeinstallprompt' || t === 'appinstalled';
    }).length;
    expect(addedBeforeUnmount).toBeGreaterThanOrEqual(2);
    unmount();
    const removedAfterUnmount = removeSpy.mock.calls.filter(([type]) => {
      const t = type as string;
      return t === 'beforeinstallprompt' || t === 'appinstalled';
    }).length;
    expect(removedAfterUnmount).toBeGreaterThanOrEqual(2);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
