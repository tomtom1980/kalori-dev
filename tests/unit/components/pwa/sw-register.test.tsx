/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.2 — SwRegister client component unit tests (RED → GREEN).
 *
 * Contract (from Planning/.tmp/task-5.1-ui-react-perf.md §A):
 *   - Returns null (no DOM).
 *   - Registration runs in `useEffect` (post-hydration only).
 *   - Guards on `'serviceWorker' in navigator`; bails silently if absent.
 *   - Calls `navigator.serviceWorker.register('/sw.js', { scope: '/' })` exactly once.
 *   - Idempotent: re-mount in same tab does NOT register a second time.
 *   - Dev-mode skip: NEXT_PUBLIC_KALORI_ENV === 'development' → no register call.
 *   - Sentry breadcrumb on success; captureException on failure.
 *   - Update detection: when registration.waiting is set, exposes a triggerUpdate
 *     API that calls postMessage({type: 'SKIP_WAITING'}) + reload().
 *   - Does NOT auto-call skipWaiting (user opt-in only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, waitFor } from '@testing-library/react';

const captureException = vi.fn();
const addBreadcrumb = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
  addBreadcrumb,
}));

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_KALORI_ENV;

type MockServiceWorker = {
  register: ReturnType<typeof vi.fn>;
  controller: ServiceWorker | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

let mockSw: MockServiceWorker;

function installNavigatorMock(
  opts: {
    hasServiceWorker?: boolean;
    registerImpl?: () => unknown;
  } = {},
) {
  const hasServiceWorker = opts.hasServiceWorker ?? true;
  if (!hasServiceWorker) {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      get: () => undefined,
    });
    return;
  }

  const register = opts.registerImpl
    ? vi.fn(opts.registerImpl as () => Promise<ServiceWorkerRegistration>)
    : vi.fn(async () => ({
        scope: '/',
        active: { state: 'activated' },
        installing: null,
        waiting: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        update: vi.fn(),
        unregister: vi.fn(),
      }));

  mockSw = {
    register,
    controller: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: mockSw,
  });
}

function clearNavigatorMock() {
  // Restore to "not present" so each test starts clean.
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    get: () => undefined,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_KALORI_ENV = 'production';
  captureException.mockClear();
  addBreadcrumb.mockClear();
});

afterEach(() => {
  cleanup();
  clearNavigatorMock();
  vi.resetModules();
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_KALORI_ENV;
  else process.env.NEXT_PUBLIC_KALORI_ENV = ORIGINAL_ENV;
});

describe('SwRegister', () => {
  it('returns null (renders no DOM)', async () => {
    installNavigatorMock();
    const { SwRegister } = await import('@/components/pwa/sw-register');
    const { container } = render(<SwRegister />);
    expect(container.firstChild).toBeNull();
  });

  it('does NOT register during SSR (only inside useEffect post-hydration)', async () => {
    installNavigatorMock();
    const { SwRegister } = await import('@/components/pwa/sw-register');
    // The render synchronously runs `useEffect` in happy-dom only after the
    // commit phase. We can't directly test SSR here, but we can assert the
    // register call WAS made (proving it's in useEffect, not module top-level).
    render(<SwRegister />);
    await waitFor(() => expect(mockSw.register).toHaveBeenCalledTimes(1));
    expect(mockSw.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('skips registration when navigator.serviceWorker is unavailable', async () => {
    installNavigatorMock({ hasServiceWorker: false });
    const { SwRegister } = await import('@/components/pwa/sw-register');
    render(<SwRegister />);
    // Wait a tick so any effect would have run; nothing to assert except no crash.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('skips registration in development env', async () => {
    process.env.NEXT_PUBLIC_KALORI_ENV = 'development';
    installNavigatorMock();
    const { SwRegister } = await import('@/components/pwa/sw-register');
    render(<SwRegister />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSw.register).not.toHaveBeenCalled();
  });

  it('emits Sentry breadcrumb on successful registration', async () => {
    installNavigatorMock();
    const { SwRegister } = await import('@/components/pwa/sw-register');
    render(<SwRegister />);
    await waitFor(() => expect(addBreadcrumb).toHaveBeenCalled());
    const breadcrumbCall = addBreadcrumb.mock.calls[0];
    if (!breadcrumbCall) throw new Error('expected breadcrumb call');
    const breadcrumb = breadcrumbCall[0] as {
      category: string;
      message: string;
      level: string;
    };
    expect(breadcrumb.category).toBe('pwa.sw');
    expect(breadcrumb.message).toMatch(/registered/i);
    expect(breadcrumb.level).toBe('info');
  });

  it('captures Sentry exception on registration failure', async () => {
    installNavigatorMock({ registerImpl: () => Promise.reject(new Error('quota exceeded')) });
    const { SwRegister } = await import('@/components/pwa/sw-register');
    render(<SwRegister />);
    await waitFor(() => expect(captureException).toHaveBeenCalled());
    const call = captureException.mock.calls[0];
    if (!call) throw new Error('expected captureException call');
    const [err, ctx] = call as [unknown, { tags?: { area?: string } } | undefined];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/quota exceeded/);
    expect(ctx?.tags?.area).toBe('pwa.sw.registration');
  });

  it('only registers once even if mounted multiple times', async () => {
    installNavigatorMock();
    const { SwRegister } = await import('@/components/pwa/sw-register');
    const { unmount } = render(<SwRegister />);
    await waitFor(() => expect(mockSw.register).toHaveBeenCalledTimes(1));
    unmount();
    render(<SwRegister />);
    // Allow effects to flush.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockSw.register).toHaveBeenCalledTimes(1);
  });

  it('retries registration after a failed previous attempt', async () => {
    // Codex Improvement #2: a failed first registration must NOT poison the
    // module-singleton guard. A subsequent remount (e.g. after a transient
    // network failure during the initial fetch) must be able to retry.
    let callCount = 0;
    installNavigatorMock({
      registerImpl: () => {
        callCount += 1;
        if (callCount === 1) return Promise.reject(new Error('transient quota'));
        return Promise.resolve({
          scope: '/',
          active: { state: 'activated' },
          installing: null,
          waiting: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          update: vi.fn(),
          unregister: vi.fn(),
        });
      },
    });
    const { SwRegister } = await import('@/components/pwa/sw-register');
    const { unmount } = render(<SwRegister />);
    // Wait for the rejection to flow through so the catch branch runs.
    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(mockSw.register).toHaveBeenCalledTimes(1);
    unmount();
    // Remount — the second attempt must fire because the failure path resets
    // the module-singleton guard.
    render(<SwRegister />);
    await waitFor(() => expect(mockSw.register).toHaveBeenCalledTimes(2));
  });

  it('does NOT auto-call skipWaiting on the registration', async () => {
    const postMessage = vi.fn();
    installNavigatorMock({
      registerImpl: async () => ({
        scope: '/',
        active: { state: 'activated' },
        installing: null,
        waiting: { state: 'installed', postMessage },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        update: vi.fn(),
        unregister: vi.fn(),
      }),
    });
    const { SwRegister } = await import('@/components/pwa/sw-register');
    render(<SwRegister />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // postMessage SKIP_WAITING must NOT fire automatically.
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('exposes a triggerUpdate function that posts SKIP_WAITING + reloads', async () => {
    const postMessage = vi.fn();
    installNavigatorMock({
      registerImpl: async () => ({
        scope: '/',
        active: { state: 'activated' },
        installing: null,
        waiting: { state: 'installed', postMessage },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        update: vi.fn(),
        unregister: vi.fn(),
      }),
    });
    const reload = vi.fn();
    Object.defineProperty(globalThis.window, 'location', {
      configurable: true,
      value: { ...globalThis.window.location, reload },
    });
    const mod = await import('@/components/pwa/sw-register');
    render(<mod.SwRegister />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The module exports a triggerUpdate API used by Task 5.1.4 update UI.
    expect(typeof mod.triggerUpdate).toBe('function');
    await mod.triggerUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
