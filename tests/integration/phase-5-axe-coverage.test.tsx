/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — Codex Round 1 (C-5) regression: axe-core coverage on every
 * Phase-5 PWA surface that doesn't sit on a public route.
 *
 * The Playwright AC6 matrix only visits `/` + `/offline` + `/login` —
 * everything auth-gated (Settings ReduceMotionToggle, OfflineBar in
 * non-success states, ReplayStatusBadge, ReplayDrawer,
 * GoalWeightConflictModal, PWAInstallPrompt) is component-instance
 * tested here via vitest-axe so we still meet the AC6 contract:
 * "zero serious/critical on every Phase-5 page or relevant component
 * instance".
 *
 * Coverage matrix:
 *   - OfflineBar: idle (offline) / replaying / error / success.
 *   - ReplayStatusBadge: idle / replaying / error.
 *   - PWAInstallPrompt: Android variant + iOS variant rendered open.
 *   - GoalWeightConflictModalHost: open with a goal-weight conflict.
 *
 * Settings ReduceMotionToggle is already axe-covered by
 * `tests/components/settings/ReduceMotionToggle.test.tsx`.
 * ReplayDrawer is already axe-covered by
 * `tests/integration/replay-drawer.test.tsx`.
 */
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

interface ConflictRow {
  client_id: string;
  kind:
    | 'goal-weight-update'
    | 'entry-create'
    | 'entry-delete'
    | 'water-log'
    | 'weight-log'
    | 'library-update'
    | 'library-bulk-delete';
  current: unknown;
}

interface MockOutboxState {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  conflicts: ConflictRow[];
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: 1714000000000,
  replayStatus: 'idle',
  conflicts: [],
};

const requestFlush = vi.fn().mockResolvedValue(undefined);
const resolveConflictAction = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: mockState.online,
    queueDepth: mockState.queueDepth,
    lastFlushAt: mockState.lastFlushAt,
    replayStatus: mockState.replayStatus,
    conflicts: mockState.conflicts,
    actions: {
      requestFlush,
      resolveConflict: resolveConflictAction,
      retry: requestFlush,
    },
    meta: {
      isReducedMotion: false,
      isPending: false,
      isFlushing: false,
    },
  }),
}));

beforeEach(() => {
  mockState = {
    online: true,
    queueDepth: 1,
    lastFlushAt: 1714000000000,
    replayStatus: 'idle',
    conflicts: [],
  };
  requestFlush.mockClear();
  resolveConflictAction.mockClear();
  document.documentElement.removeAttribute('data-offline');
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-offline');
});

const OFFLINE_BAR_STATES: { name: string; online: boolean; replayStatus: ReplayStatus }[] = [
  { name: 'idle (offline)', online: false, replayStatus: 'idle' },
  { name: 'replaying', online: true, replayStatus: 'replaying' },
  { name: 'error', online: true, replayStatus: 'error' },
  { name: 'success', online: true, replayStatus: 'success' },
];

describe('Task 5.1.6 Codex Round 1 (C-5) — Phase-5 axe coverage', () => {
  describe('OfflineBar per-state', () => {
    for (const scenario of OFFLINE_BAR_STATES) {
      it(`OfflineBar (${scenario.name}) — zero axe violations`, async () => {
        mockState = {
          ...mockState,
          online: scenario.online,
          replayStatus: scenario.replayStatus,
        };
        const { OfflineBar } = await import('@/components/offline/OfflineBar');
        const { container } = render(<OfflineBar />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    }
  });

  describe('ReplayStatusBadge per-state', () => {
    const states: ReplayStatus[] = ['idle', 'replaying', 'error'];
    for (const state of states) {
      it(`ReplayStatusBadge (${state}) — zero axe violations`, async () => {
        mockState = { ...mockState, queueDepth: 1, replayStatus: state };
        const { ReplayStatusBadge } = await import('@/components/pwa/ReplayStatusBadge');
        const { container } = render(<ReplayStatusBadge />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    }
  });

  describe('PWAInstallPrompt rendered open', () => {
    it('Android variant — zero axe violations', async () => {
      const { PWAInstallPrompt } = await import('@/components/pwa/PWAInstallPrompt');
      const { container } = render(
        <PWAInstallPrompt
          open={true}
          onOpenChange={vi.fn()}
          canInstall={true}
          isIOSWithoutA2HS={false}
          platform="android-chromium"
          promptInstall={vi.fn().mockResolvedValue('accepted')}
          dismiss={vi.fn()}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('iOS variant — zero axe violations', async () => {
      const { PWAInstallPrompt } = await import('@/components/pwa/PWAInstallPrompt');
      const { container } = render(
        <PWAInstallPrompt
          open={true}
          onOpenChange={vi.fn()}
          canInstall={false}
          isIOSWithoutA2HS={true}
          platform="ios-safari"
          promptInstall={vi.fn().mockResolvedValue('unsupported')}
          dismiss={vi.fn()}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('GoalWeightConflictModalHost rendered open', () => {
    it('goal-weight conflict — zero axe violations', async () => {
      mockState = {
        ...mockState,
        replayStatus: 'conflict',
        conflicts: [
          {
            client_id: 'cid-goal-weight-axe',
            kind: 'goal-weight-update',
            current: { goal_weight: 68.5 },
          },
        ],
      };
      const { GoalWeightConflictModalHost } =
        await import('@/components/pwa/GoalWeightConflictModal');
      const { container } = render(<GoalWeightConflictModalHost />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
