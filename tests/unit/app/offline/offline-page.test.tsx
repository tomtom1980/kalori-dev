/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.2 / 5.1.4 — Offline fallback page tests.
 *
 * Contract (from Planning/.tmp/task-5.1-ui-ux-specialist.md §H +
 * task-5.1.4-briefing.md §4):
 *   - Headline: "You're offline." (period, no exclamation)
 *   - Body explains pending changes will sync.
 *   - Task 5.1.4: pending count is now a client-side island
 *     (`PendingCount`) that subscribes to outbox notifications directly
 *     (no provider on the static `/offline` route). The island renders
 *     `data-testid="offline-pending-count-island"` when N > 0.
 *   - Retry button reloads the page.
 *   - <main role="main">, <h1>, <button> semantics.
 *   - No motion-only affordances (motion-safe).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';

const subscribers = new Set<() => void>();
const size = vi.fn();
const peek = vi.fn();

vi.mock('@/lib/offline/outbox', () => ({
  peek: (...args: unknown[]) => peek(...args),
  size: (...args: unknown[]) => size(...args),
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },
}));

beforeEach(() => {
  peek.mockReset();
  size.mockReset();
  subscribers.clear();
});

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe('OfflinePage', () => {
  it('renders headline and body without exclamation marks', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent("You're offline.");
    // Whole page must not contain an exclamation mark — Ledger voice.
    const main = screen.getByRole('main');
    expect(main.textContent ?? '').not.toMatch(/!/);
    // Body explains sync semantics.
    expect(main.textContent).toMatch(/pending changes/i);
  });

  it('renders 0 pending changes (no count line) when outbox is empty', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    // Island renders nothing when count === 0.
    await waitFor(() => {
      expect(screen.queryByTestId('offline-pending-count-island')).toBeNull();
    });
  });

  it('renders singular "1 change pending." when outbox has one row', async () => {
    size.mockResolvedValue(1);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const island = await screen.findByTestId('offline-pending-count-island');
    expect(island).toHaveTextContent('1 change pending.');
  });

  it('renders plural "{N} changes pending." when outbox has multiple rows', async () => {
    size.mockResolvedValue(3);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const island = await screen.findByTestId('offline-pending-count-island');
    expect(island).toHaveTextContent('3 changes pending.');
  });

  it('renders a Retry button that triggers reload', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveAttribute('aria-label', 'Retry loading this page');
  });

  it('Retry button has touch-manipulation class to suppress 300ms tap delay (F-PWA-3)', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry.className).toMatch(/\btouch-manipulation\b/);
  });

  it('falls back to 0 pending when outbox.size() throws (IDB unavailable)', async () => {
    size.mockRejectedValue(new Error('idb unavailable'));
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    // Island swallows the error and stays at count=0 → no DOM.
    await waitFor(() => {
      expect(screen.queryByTestId('offline-pending-count-island')).toBeNull();
    });
    // Page still renders.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("You're offline.");
  });

  it('uses semantic <main> and <h1>', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    const { container } = render(OfflinePage());
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('h1')).not.toBeNull();
  });

  it('does NOT include any framer-motion or pure-motion-only elements (motion-safe)', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    const { container } = render(OfflinePage());
    // No animate-* utility classes that would only convey state through motion.
    expect(container.innerHTML).not.toMatch(/animate-(spin|pulse|ping|bounce)/);
  });
});

/**
 * F-PWA-OFFLINE-HYDRATION — progressive-enhancement contract.
 *
 * The SW caches `/offline` HTML via @serwist navigation fallback, but
 * `_next/static` JS chunks for client islands are only runtime-cached. On
 * a first-time-offline visit the cached document renders but the island
 * cannot hydrate — the live `queueDepth` line never appears.
 *
 * Option 2 (chosen): server-render a static placeholder. The island, when
 * it hydrates, replaces the placeholder with the live count. When JS does
 * not load (true-offline + uncached), the static placeholder remains.
 */
describe('OfflinePage — progressive-enhancement (F-PWA-OFFLINE-HYDRATION)', () => {
  // AC: PendingCount renders placeholder on initial paint (before hydration).
  it('renders the static placeholder on initial paint (before useEffect resolves)', async () => {
    // Defer outbox.size() forever so the post-hydration upgrade never runs.
    size.mockReturnValue(new Promise<number>(() => {}));
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    const placeholder = screen.getByTestId('offline-pending-count-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.textContent).toMatch(/pending changes will appear/i);
  });

  // AC: PendingCount renders live queueDepth after hydration when outbox has data.
  it('replaces the placeholder with the live count after hydration', async () => {
    size.mockResolvedValue(2);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    // After useEffect runs and outbox.size() resolves, the live count appears
    // and the placeholder is removed.
    const island = await screen.findByTestId('offline-pending-count-island');
    expect(island).toHaveTextContent('2 changes pending.');
    expect(screen.queryByTestId('offline-pending-count-placeholder')).toBeNull();
  });

  // AC: When outbox.size() resolves to 0, the placeholder is gone and no
  // count row is rendered (live count of zero is "no row" by 5.1.4 contract).
  it('removes the placeholder when hydration completes with count=0', async () => {
    size.mockResolvedValue(0);
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    await waitFor(() => {
      expect(screen.queryByTestId('offline-pending-count-placeholder')).toBeNull();
    });
    expect(screen.queryByTestId('offline-pending-count-island')).toBeNull();
  });

  // AC: PendingCount stays as placeholder when outbox.size() throws (IDB
  // unavailable / SSR-only environment). The placeholder must remain so the
  // user is not left without context.
  it('keeps the placeholder when outbox.size() throws (IDB unavailable)', async () => {
    size.mockRejectedValue(new Error('idb unavailable'));
    const { default: OfflinePage } = await import('@/app/offline/page');
    render(OfflinePage());
    // The hydration effect runs, but the catch arm leaves count untouched
    // and the placeholder remains visible (vs. silent disappearance).
    await waitFor(() => {
      expect(screen.getByTestId('offline-pending-count-placeholder')).toBeInTheDocument();
    });
    // No live-count island appeared.
    expect(screen.queryByTestId('offline-pending-count-island')).toBeNull();
  });
});
