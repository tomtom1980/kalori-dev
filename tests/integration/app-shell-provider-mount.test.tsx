/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.4 — `app/(app)/layout.tsx` provider-mount integration test.
 *
 * AC-Provider-Mount (the (app) layout wraps children with
 * <OfflineQueueProvider> so `useOfflineQueue()` works in any descendant) +
 * R3 (root layout untouched — provider mounts ONLY in the (app) group).
 *
 * Briefing: `planning/.tmp/task-5.1.4-briefing.md` §8 + §13e.
 */
import { render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    // app/(app)/layout.tsx queries `profiles.timezone` via
    // `.from('profiles').select('timezone').eq('id', user.id).maybeSingle()`.
    // The provider-mount test renders the layout but doesn't care about the
    // timezone — return a benign stub so the chain resolves cleanly.
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { timezone: 'UTC' }, error: null })),
        })),
      })),
    })),
  })),
}));

// `<DeviceTimezoneSync>` (mounted in the layout) calls `useRouter()` from
// `next/navigation`. The app-router invariant is not satisfied in vitest's
// happy-dom render. Stub the router with a no-op so the provider-mount
// assertion focuses purely on the OfflineQueueProvider contract.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const subscribers = new Set<() => void>();
const outboxSize = vi.fn().mockResolvedValue(0);
const outboxFlush = vi.fn().mockResolvedValue({
  attempted: 0,
  succeeded: 0,
  failed: [],
  durationMs: 0,
  idbAvailable: true,
});

vi.mock('@/lib/offline/outbox', () => ({
  size: () => outboxSize(),
  flush: () => outboxFlush(),
  peek: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(true),
  enqueue: vi.fn(),
  markFailed: vi.fn(),
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },
}));

vi.mock('@/lib/offline/availability', () => ({
  detectIdbAvailability: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(async () => {
  subscribers.clear();
  outboxSize.mockReset().mockResolvedValue(0);
  outboxFlush.mockReset().mockResolvedValue({
    attempted: 0,
    succeeded: 0,
    failed: [],
    durationMs: 0,
    idbAvailable: true,
  });
  const { __resetOfflineStoreForTests } = await import('@/lib/offline/network-state');
  __resetOfflineStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Task 5.1.4 — provider mount in app/(app)/layout.tsx', () => {
  it('AC-Provider-Mount: layout wraps children with OfflineQueueProvider', async () => {
    // AC-Provider-Mount: the auth-shell layout is the canonical mount point.
    // A descendant calling useOfflineQueue() must succeed.
    const { default: AppGroupLayout } = await import('@/app/(app)/layout');
    const { useOfflineQueue } = await import('@/lib/offline/network-state');

    function ChildProbe(): React.ReactElement {
      // Calling the hook inside a descendant must not throw — that's the
      // entire contract this task closes.
      const ctx = useOfflineQueue();
      return <span data-testid="child-probe">{String(ctx.state.online)}</span>;
    }

    const tree = await AppGroupLayout({ children: <ChildProbe /> });
    render(tree as React.ReactElement);
    expect(screen.getByTestId('child-probe')).toBeInTheDocument();
  });

  it('AC-Provider-Mount: useOutbox throws outside the provider', async () => {
    // AC-Provider-Mount: misuse must fail loudly. This test guards against a
    // future regression where someone consumes the hook in (auth) / marketing
    // routes that have no provider.
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    expect(() => renderHook(() => useOutbox())).toThrow(/OfflineQueueProvider/i);
  });

  it('R3: root layout source does NOT import OfflineQueueProvider', async () => {
    // R3: the root layout stays SSR-safe and bundle-thin. Auth/marketing
    // routes must not pay the provider's bundle cost. Static-source check
    // (instead of rendering — root layout pulls next/font which is hard to
    // simulate in vitest) — we read the source and assert no import of the
    // network-state module.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.resolve(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(src).not.toMatch(/from ['"]@\/lib\/offline\/network-state['"]/);
    expect(src).not.toMatch(/OfflineQueueProvider/);
    expect(src).not.toMatch(/OfflineBar/);
    expect(src).not.toMatch(/PWAInstallPrompt/);
  });
});
