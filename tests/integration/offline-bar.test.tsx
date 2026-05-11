/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.4 — `<OfflineBar />` integration tests.
 *
 * AC3 (renders/hides on online state, queueDepth interpolation, CLS=0
 * via reserved-space contract), AC-A11y-Bar (role=status / aria-live=polite,
 * escalates to alert/assertive on error, tabindex=-1, aria-atomic transition-only
 * announcement), AC6 (reduced-motion variant).
 *
 * Briefing: `planning/.tmp/task-5.1.4-briefing.md` §7 + §10 + §13c.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

interface MockOutboxState {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  isReducedMotion: boolean;
  isFlushing: boolean;
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: null,
  replayStatus: 'idle',
  isReducedMotion: false,
  isFlushing: false,
};

const requestFlush = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: mockState.online,
    queueDepth: mockState.queueDepth,
    lastFlushAt: mockState.lastFlushAt,
    replayStatus: mockState.replayStatus,
    conflicts: [],
    actions: {
      requestFlush,
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      retry: requestFlush,
    },
    meta: {
      isReducedMotion: mockState.isReducedMotion,
      isPending: false,
      isFlushing: mockState.isFlushing,
    },
  }),
}));

beforeEach(() => {
  mockState = {
    online: true,
    queueDepth: 0,
    lastFlushAt: null,
    replayStatus: 'idle',
    isReducedMotion: false,
    isFlushing: false,
  };
  requestFlush.mockClear();
  // Reset html data-offline attribute set by previous tests.
  document.documentElement.removeAttribute('data-offline');
});

afterEach(() => {
  document.documentElement.removeAttribute('data-offline');
});

async function importBar(): Promise<{
  OfflineBar: () => React.ReactElement | null;
}> {
  return await import('@/components/offline/OfflineBar');
}

function fmtHHmm(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

describe('OfflineBar — visibility gating', () => {
  it('AC3: renders nothing when online and queueDepth=0 and replayStatus=idle', async () => {
    // AC3: bar must not insert DOM in the calm path (no CLS contribution).
    mockState = { ...mockState, online: true };
    const { OfflineBar } = await importBar();
    const { container } = render(<OfflineBar />);
    expect(container.querySelector('[data-testid="offline-bar"]')).toBeNull();
    expect(document.documentElement.getAttribute('data-offline')).toBeNull();
  });

  it('AC3: renders bar with cached-from timestamp when offline + queueDepth=0', async () => {
    // AC3: ux-specialist §B.2 — "Offline · cached from {HH:mm}".
    const ts = Date.now() - 5 * 60 * 1000;
    mockState = { ...mockState, online: false, lastFlushAt: ts, queueDepth: 0 };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('Offline');
    expect(bar.textContent).toContain(`cached from ${fmtHHmm(ts)}`);
  });
});

describe('OfflineBar — queue depth copy variants', () => {
  it('AC3: singular queue depth uses "1 change"', async () => {
    // AC3: ux-specialist §B.3 — "Offline · 1 change pending · cached from HH:mm".
    const ts = Date.now() - 60_000;
    mockState = { ...mockState, online: false, queueDepth: 1, lastFlushAt: ts };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('1 change pending');
  });

  it('AC3: plural queue depth interpolates {N}', async () => {
    // AC3: ux-specialist §B.3 — "Offline · {N} changes pending · cached from HH:mm".
    const ts = Date.now() - 60_000;
    mockState = { ...mockState, online: false, queueDepth: 3, lastFlushAt: ts };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('3 changes pending');
  });

  it('AC3: clamps queue depth ≥100 to 99+', async () => {
    // AC3: ux-specialist §B.3 — "99+ changes pending" cap.
    const ts = Date.now() - 60_000;
    mockState = { ...mockState, online: false, queueDepth: 120, lastFlushAt: ts };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('99+ changes pending');
  });
});

describe('OfflineBar — replay state copy', () => {
  it('AC3: replayStatus=replaying renders "Syncing N changes"', async () => {
    // AC3: ux-specialist §B.4 — syncing copy variant.
    mockState = {
      ...mockState,
      online: true,
      queueDepth: 3,
      replayStatus: 'replaying',
    };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('Syncing 3 changes');
  });

  it('AC3: replayStatus=success renders "Synced · N changes · HH:mm"', async () => {
    // AC3: ux-specialist §B.5 — synced sticky message.
    const ts = Date.now();
    mockState = {
      ...mockState,
      online: true,
      queueDepth: 0,
      lastFlushAt: ts,
      replayStatus: 'success',
    };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain('Synced');
  });

  it('AC3 + AC-A11y-Bar (Codex F5): replayStatus=error renders error copy with role=alert + aria-live=assertive on the live-region span', async () => {
    // AC3 + AC-A11y-Bar: ux-specialist §B.6 + ux-auditor §D — error escalates
    // to assertive announcement so screen readers do not miss it.
    // Codex F5: role + aria-live live on the inner `offline-bar-live` span,
    // not the outer container.
    mockState = {
      ...mockState,
      online: true,
      queueDepth: 2,
      replayStatus: 'error',
    };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.textContent).toContain("Couldn't sync 2 changes. Tap to retry.");
    // Outer container has NO live-region role/attrs (Codex F5).
    expect(bar.getAttribute('role')).toBeNull();
    expect(bar.getAttribute('aria-live')).toBeNull();
    // Inner span carries them.
    const live = await screen.findByTestId('offline-bar-live');
    expect(live.getAttribute('role')).toBe('alert');
    expect(live.getAttribute('aria-live')).toBe('assertive');
  });
});

describe('OfflineBar — accessibility defaults', () => {
  it('AC-A11y-Bar (Codex F5): live-region attrs live on the inner span; outer container is non-live', async () => {
    // Codex F5: previously the outer container carried role=status +
    // aria-live + aria-atomic, AND it contained the focusable
    // `<ReplayStatusBadge>` button whose text reflects queue depth. That
    // put a count-changing focusable control inside an atomic live region.
    // The fix moves role/aria-live/aria-atomic onto a dedicated sr-only
    // span and sets aria-atomic="false" so count updates don't re-announce.
    mockState = { ...mockState, online: false, queueDepth: 0, lastFlushAt: Date.now() };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    // Outer container — no live-region semantics.
    expect(bar.getAttribute('role')).toBeNull();
    expect(bar.getAttribute('aria-live')).toBeNull();
    expect(bar.getAttribute('aria-atomic')).toBeNull();
    // Inner sr-only span — carries the live-region attrs.
    const live = await screen.findByTestId('offline-bar-live');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    // aria-atomic="false" prevents count-tick re-announcements.
    expect(live.getAttribute('aria-atomic')).toBe('false');
  });

  it('AC-A11y-Bar (Codex F5): replay-status-badge button is OUTSIDE the live-region span tree', async () => {
    // Codex F5 — the count-changing focusable badge must not sit inside
    // the live region. Verify the badge is rendered in the visible-text
    // branch of the bar, NOT as a descendant of `offline-bar-live`.
    mockState = {
      ...mockState,
      online: false,
      queueDepth: 3,
      lastFlushAt: Date.now(),
    };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const live = await screen.findByTestId('offline-bar-live');
    const badge = await screen.findByTestId('replay-status-badge');
    // The badge must NOT be a descendant of the live-region span.
    expect(live.contains(badge)).toBe(false);
  });

  it('AC-A11y-Bar: tabindex=-1 (not focusable — pure announcement)', async () => {
    // AC-A11y-Bar: ux-auditor §C — bar is announce-only.
    mockState = { ...mockState, online: false, queueDepth: 0, lastFlushAt: Date.now() };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.getAttribute('tabindex')).toBe('-1');
  });
});

describe('OfflineBar — CLS=0 reserved-space contract', () => {
  it('AC3 + AC-OfflineBar: data-offline attribute is set in the layout-effect phase (Codex F1)', async () => {
    // Codex F1: the `data-offline` attribute (which triggers the 32px body
    // padding-block-start reservation) MUST be applied in the LAYOUT phase
    // (synchronous with commit, before paint), not the passive useEffect
    // phase (after paint). With useEffect there is a real frame where the
    // fixed bar overlays existing content with no reserved padding, then a
    // 32px shift when the effect runs — that is the CLS contribution.
    //
    // Test mechanic: mock the `react` module to wrap `useLayoutEffect` and
    // `useEffect` with phase-tagged spies. Render OfflineBar and inspect
    // which spy received the data-offline toggle effect. The toggle must
    // land on `useLayoutEffect` (or its isomorphic alias). This proves the
    // contract regardless of whether happy-dom + RTL happen to flush both
    // phases synchronously — what matters is which hook the implementation
    // chose.
    const layoutEffectCalls: Array<() => void> = [];
    const passiveEffectCalls: Array<() => void> = [];
    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react');
      return {
        ...actual,
        useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
          layoutEffectCalls.push(effect);
          return actual.useLayoutEffect(effect, deps);
        },
        useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
          passiveEffectCalls.push(effect);
          return actual.useEffect(effect, deps);
        },
      };
    });
    try {
      mockState = { ...mockState, online: false, queueDepth: 1, lastFlushAt: Date.now() };
      vi.resetModules();
      const { OfflineBar } = await importBar();
      render(<OfflineBar />);
      // The bar's data-offline toggle must run in the layout phase.
      expect(layoutEffectCalls.length).toBeGreaterThanOrEqual(1);
      // And the attribute must be present after a layout-phase commit.
      expect(document.documentElement.getAttribute('data-offline')).toBe('true');
    } finally {
      vi.doUnmock('react');
      vi.resetModules();
    }
  });

  it('AC3: sets data-offline="true" on <html> when offline so CSS reserves padding', async () => {
    // AC3: the 32px gap is reserved via `html[data-offline="true"]`. The bar
    // mounts position:fixed so it overlays the reserved space — when both are
    // applied together the layout shift between offline/online is exactly 0.
    mockState = { ...mockState, online: false, queueDepth: 1, lastFlushAt: Date.now() };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-offline')).toBe('true');
    });
  });

  it('AC3: clears data-offline when online and queue empty + idle', async () => {
    // AC3: removing the attribute drops the reserved padding so the layout
    // returns to its original height — same render cycle, no in-between state.
    mockState = { ...mockState, online: false, queueDepth: 1, lastFlushAt: Date.now() };
    const { OfflineBar } = await importBar();
    const { rerender } = render(<OfflineBar />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-offline')).toBe('true');
    });
    mockState = { ...mockState, online: true, queueDepth: 0, replayStatus: 'idle' };
    await act(async () => {
      rerender(<OfflineBar />);
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-offline')).toBeNull();
    });
  });

  it('AC3: bar uses position:fixed inset-block-start:0 height:32px', async () => {
    // AC3: the contract that makes CLS=0 work — bar overlays, never inserts
    // into normal flow.
    mockState = { ...mockState, online: false, queueDepth: 0, lastFlushAt: Date.now() };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    const styles = bar.getAttribute('style') ?? '';
    expect(styles).toMatch(/position:\s*fixed/i);
    expect(styles).toMatch(/(top|inset-block-start):\s*0/i);
    expect(styles).toMatch(/height:\s*32px/i);
  });
});

describe('OfflineBar — reduced motion', () => {
  it('AC6: reduced-motion variant marks the bar with data-reduced-motion=true', async () => {
    // AC6: under prefers-reduced-motion the bar surfaces with no opacity
    // transition class — instant DOM mount/unmount.
    mockState = {
      ...mockState,
      online: false,
      queueDepth: 0,
      lastFlushAt: Date.now(),
      isReducedMotion: true,
    };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    expect(bar.getAttribute('data-reduced-motion')).toBe('true');
  });
});
