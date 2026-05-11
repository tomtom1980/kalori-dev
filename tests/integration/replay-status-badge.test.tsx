/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.5 — `<ReplayStatusBadge />` integration tests.
 *
 * AC1: composes into OfflineBar when queueDepth > 0; reactive to replay
 *      state machine via `useOutbox()`.
 * AC6: zero serious/critical axe violations across all 5 visible states.
 *
 * Briefing §5a + §7b.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

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
});

afterEach(() => {
  document.documentElement.removeAttribute('data-offline');
});

async function importBadge(): Promise<{
  ReplayStatusBadge: React.ComponentType;
}> {
  return await import('@/components/pwa/ReplayStatusBadge');
}

describe('ReplayStatusBadge — visibility gating', () => {
  it('AC1: renders nothing when queueDepth === 0', async () => {
    mockState = { ...mockState, queueDepth: 0 };
    const { ReplayStatusBadge } = await importBadge();
    const { container } = render(<ReplayStatusBadge />);
    expect(container.querySelector('[data-testid="replay-status-badge"]')).toBeNull();
  });

  it('AC1: renders the badge button when queueDepth > 0', async () => {
    mockState = { ...mockState, queueDepth: 3 };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('BUTTON');
  });
});

describe('ReplayStatusBadge — per-state copy', () => {
  it('AC1: idle + queueDepth>0 renders [Q · {N}] with dust color via data attribute', async () => {
    mockState = { ...mockState, queueDepth: 3, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.textContent).toContain('Q · 3');
    expect(badge.getAttribute('data-replay-status')).toBe('idle');
  });

  it('AC1: replaying renders [Q · {N} →] in ember', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'replaying' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.textContent).toContain('Q · 2');
    expect(badge.textContent).toContain('→');
    expect(badge.getAttribute('data-replay-status')).toBe('replaying');
  });

  it('AC1: conflict renders [Q · {N} ⚠] in ember', async () => {
    mockState = { ...mockState, queueDepth: 1, replayStatus: 'conflict' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.textContent).toContain('Q · 1');
    expect(badge.textContent).toContain('⚠');
    expect(badge.getAttribute('data-replay-status')).toBe('conflict');
  });

  it('AC1: error renders [Q · {N} !] in oxblood', async () => {
    mockState = { ...mockState, queueDepth: 4, replayStatus: 'error' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.textContent).toContain('Q · 4');
    expect(badge.textContent).toContain('!');
    expect(badge.getAttribute('data-replay-status')).toBe('error');
  });

  it('AC1: singular variant uses "Q · 1" (no plural change but verifies template applied)', async () => {
    mockState = { ...mockState, queueDepth: 1, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.textContent).toContain('Q · 1');
  });
});

describe('ReplayStatusBadge — interaction + ARIA', () => {
  it('AC1: aria-haspopup="dialog" + aria-controls referencing the drawer id', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-haspopup')).toBe('dialog');
    expect(badge.getAttribute('aria-controls')).toBe('replay-drawer');
  });

  it('AC1: aria-expanded toggles when clicked (drawer opens)', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(badge);
    expect(badge.getAttribute('aria-expanded')).toBe('true');
  });

  it('AC1: aria-label updates per replayStatus', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    const { rerender } = render(<ReplayStatusBadge />);
    let badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-label')).toMatch(/2 changes pending\. Click to review\./i);

    mockState = { ...mockState, queueDepth: 2, replayStatus: 'replaying' };
    rerender(<ReplayStatusBadge />);
    badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-label')).toMatch(/Syncing 2 changes/i);

    mockState = { ...mockState, queueDepth: 2, replayStatus: 'conflict' };
    rerender(<ReplayStatusBadge />);
    badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-label')).toMatch(
      /2 changes need attention\. Click to review\./i,
    );

    mockState = { ...mockState, queueDepth: 2, replayStatus: 'error' };
    rerender(<ReplayStatusBadge />);
    badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('aria-label')).toMatch(/2 changes failed\. Click to review\./i);
  });

  it('AC1: button is type="button" to avoid form submit semantics', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    render(<ReplayStatusBadge />);
    const badge = await screen.findByTestId('replay-status-badge');
    expect(badge.getAttribute('type')).toBe('button');
  });
});

describe('ReplayStatusBadge — a11y (vitest-axe)', () => {
  it('AC6: zero violations in idle state', async () => {
    mockState = { ...mockState, queueDepth: 3, replayStatus: 'idle' };
    const { ReplayStatusBadge } = await importBadge();
    const { container } = render(<ReplayStatusBadge />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AC6: zero violations in replaying state', async () => {
    mockState = { ...mockState, queueDepth: 3, replayStatus: 'replaying' };
    const { ReplayStatusBadge } = await importBadge();
    const { container } = render(<ReplayStatusBadge />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AC6: zero violations in conflict state', async () => {
    mockState = { ...mockState, queueDepth: 1, replayStatus: 'conflict' };
    const { ReplayStatusBadge } = await importBadge();
    const { container } = render(<ReplayStatusBadge />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AC6: zero violations in error state', async () => {
    mockState = { ...mockState, queueDepth: 2, replayStatus: 'error' };
    const { ReplayStatusBadge } = await importBadge();
    const { container } = render(<ReplayStatusBadge />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
