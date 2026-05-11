/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.4 — Codex Round 2 Finding R2-F1.
 *
 * AC2 + R2-F1: the install prompt listener (`beforeinstallprompt`) MUST be
 * registered by code that ships in the always-mounted host bundle. If the
 * listener registration depends on the lazy modal chunk resolving, then any
 * `beforeinstallprompt` event fired before the chunk loads is lost forever
 * (the event is one-shot per Chromium's installability heuristics).
 *
 * Two assertions in this file:
 *
 * 1. The `beforeinstallprompt` listener is added on the FIRST mount of
 *    `<PWAInstallPromptHost />` — synchronously, before any lazy modal
 *    chunk has had a chance to resolve.
 * 2. A `beforeinstallprompt` event dispatched immediately after host mount
 *    (before the lazy modal chunk resolves) is captured: the host's
 *    internal eligibility state flips so that — once the chunk resolves —
 *    the modal CAN be rendered with `INSTALL` enabled. We prove (2) by
 *    forcing a deferred `next/dynamic` resolution.
 *
 * Briefing: `planning/.tmp/task-5.1.4-codex-round2.md` R2-F1.
 */
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kalori.pwa-prompt.dismissed';

// ---------------------------------------------------------------------------
// next/dynamic — deferred-resolution mock
// ---------------------------------------------------------------------------
// We capture the resolver of every dynamic-loaded module so the test body
// can trigger resolution AFTER dispatching `beforeinstallprompt`. This proves
// the host's `usePWAInstall()` listener is wired before the lazy chunk
// arrives. The mock supports both the `mod => mod.NamedExport` shape (our
// host's loader) and the `{ default }` shape.

let pendingResolvers: Array<() => Promise<void>> = [];

vi.mock('next/dynamic', async () => {
  const { Suspense, lazy, createElement } = await import('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<unknown>) => {
      const Lazy = lazy(
        () =>
          new Promise<{ default: React.ComponentType<Record<string, unknown>> }>((resolve) => {
            pendingResolvers.push(async () => {
              const result = (await loader()) as
                | React.ComponentType<Record<string, unknown>>
                | { default?: React.ComponentType<Record<string, unknown>> }
                | Record<string, React.ComponentType<Record<string, unknown>>>;
              let Comp: React.ComponentType<Record<string, unknown>> | undefined;
              if (typeof result === 'function') {
                Comp = result;
              } else if (result && typeof result === 'object') {
                const r = result as {
                  default?: React.ComponentType<Record<string, unknown>>;
                };
                Comp =
                  r.default ??
                  (Object.values(result).find((v) => typeof v === 'function') as
                    | React.ComponentType<Record<string, unknown>>
                    | undefined);
              }
              if (!Comp) {
                throw new Error('next/dynamic mock: could not unwrap component');
              }
              resolve({ default: Comp });
            });
          }),
      );
      const Wrapper = (props: Record<string, unknown>) =>
        createElement(Suspense, { fallback: null }, createElement(Lazy, props));
      return Wrapper;
    },
  };
});

async function flushPendingDynamic(): Promise<void> {
  const resolvers = pendingResolvers.splice(0);
  for (const r of resolvers) {
    await r();
  }
}

// `useOutbox` is consumed by the modal. Stub it to avoid an IDB dependency.
vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: true,
    queueDepth: 0,
    lastFlushAt: null,
    replayStatus: 'idle' as const,
    conflicts: [],
    actions: {
      requestFlush: vi.fn().mockResolvedValue(undefined),
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn().mockResolvedValue(undefined),
    },
    meta: { isReducedMotion: false, isPending: false, isFlushing: false },
  }),
}));

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
}

function dispatchBeforeInstallPrompt(): void {
  const userChoice = Promise.resolve({
    outcome: 'accepted' as const,
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
}

beforeEach(async () => {
  pendingResolvers = [];
  setUserAgent(
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  );
  delete (navigator as unknown as { standalone?: boolean }).standalone;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // Reset the hook's module-scoped store to avoid bleed.
  const mod = await import('@/lib/pwa/use-pwa-install');
  mod.__resetPWAInstallStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PWAInstallPromptHost — install-event capture timing (R2-F1)', () => {
  it('AC2/R2-F1: `beforeinstallprompt` listener is registered synchronously on host mount, not after lazy chunk resolves', async () => {
    // Spy `window.addEventListener` BEFORE the host renders so we can prove
    // the listener was added during the host's first effect cycle — not via
    // a code path that requires the lazy modal chunk to resolve first.
    const addSpy = vi.spyOn(window, 'addEventListener');

    const { PWAInstallPromptHost } = await import('@/components/pwa/pwa-install-prompt-host');

    render(<PWAInstallPromptHost />);
    // Important: at this point pendingResolvers is non-empty IF the host
    // attempts to load the lazy chunk eagerly. We do NOT flush them yet.
    // The listener must already be registered.
    const beforeFlushAdds = addSpy.mock.calls.filter(
      ([type]) => (type as string) === 'beforeinstallprompt',
    ).length;
    expect(beforeFlushAdds).toBeGreaterThanOrEqual(1);

    addSpy.mockRestore();
  });

  it('AC2/R2-F1: `beforeinstallprompt` fired BEFORE the lazy chunk resolves is captured (not lost)', async () => {
    // Render the host. The beforeinstallprompt listener registers via the
    // hook's effect on mount.
    const { PWAInstallPromptHost } = await import('@/components/pwa/pwa-install-prompt-host');
    const { usePWAInstall } = await import('@/lib/pwa/use-pwa-install');

    render(<PWAInstallPromptHost />);

    // Dispatch before the lazy chunk has any chance to resolve. If the hook
    // were inside the lazy child, this event would be dropped.
    act(() => {
      dispatchBeforeInstallPrompt();
    });

    // Now resolve any deferred dynamic-import chunks. After fix the host
    // does NOT eagerly request the chunk if `shouldExpose` is false — but
    // dispatching the event flips `canInstall` to true, which flips
    // `shouldExpose` to true, which causes the chunk to be requested on
    // the NEXT render. Either way, the event was captured.
    await act(async () => {
      await flushPendingDynamic();
    });

    // Direct probe of the hook's store: canInstall must be true. Use a
    // minimal probe component whose render captures the value.
    let captured: { canInstall: boolean; deferredEverSeen: boolean } = {
      canInstall: false,
      deferredEverSeen: false,
    };
    function Probe(): React.ReactElement | null {
      const s = usePWAInstall();
      captured = {
        canInstall: s.canInstall,
        // `canInstall` is true ONLY if the deferred prompt was captured AND
        // hydration completed AND not isInstalled AND not recentlyDismissed.
        deferredEverSeen: s.canInstall || s.isIOSWithoutA2HS,
      };
      return null;
    }
    render(<Probe />);

    await waitFor(() => {
      expect(captured.canInstall).toBe(true);
    });
  });
});
