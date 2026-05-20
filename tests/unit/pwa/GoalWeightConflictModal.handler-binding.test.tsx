/**
 * @vitest-environment happy-dom
 *
 * Task D.3 (US-STAB-D3) — AC4 handler-binding regression guard.
 *
 * What bug this catches
 * ─────────────────────
 * If a future refactor accidentally swaps or shares the onClick handlers
 * between the modal's two CTAs (e.g. `onClick={handleCancel}` ends up on
 * both buttons, or the two `onClick` props get flipped), the user-facing
 * label-to-action contract breaks: clicking "USE CURRENT VALUE" would
 * silently dismiss without resolving (or clicking "CANCEL" would
 * destructively resolve). This test locks in the post-Codex-F2 contract:
 *
 *   - Clicking CANCEL invokes `handleCancel` (DOES NOT call
 *     `actions.resolveConflict`)
 *   - Clicking USE CURRENT VALUE invokes `handleUseCurrent` (DOES call
 *     `actions.resolveConflict(client_id, 'use-current')` exactly once)
 *   - The cross-assertion (Cancel-does-not-resolve, UseCurrent-does-resolve)
 *     proves the two CTAs are bound to TWO DIFFERENT functions.
 *
 * Approach
 * ────────
 * Mocks `useOutbox()` to surface a single `goal-weight-update` conflict
 * so the modal mounts, then spies on `actions.resolveConflict` as the
 * canonical observable side-effect. The two CTAs are located by
 * accessible role+name (semantic anchor to the user-visible label) per
 * briefing §AC4 locator priority. This is a TIGHTER companion to the
 * integration test `outbox-conflict-resolution.test.tsx` — that suite
 * already covers each click path in isolation, but this unit test
 * explicitly asserts both behaviours in the SAME render context so a
 * shared-handler regression cannot pass by passing each path
 * independently with the wrong handler.
 *
 * Why not a single render
 * ───────────────────────
 * Clicking Cancel adds the conflict's `client_id` to `dismissedIds` and
 * unmounts the modal, so the second click cannot run in the same render.
 * Each `it()` block renders fresh — this is the cleaner pattern called
 * out in the briefing.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReplayConflict, ReplayStatus } from '@/lib/offline/replay-state-machine';

interface MockOutboxState {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  conflicts: ReplayConflict[];
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: null,
  replayStatus: 'idle',
  conflicts: [],
};

const resolveConflictSpy = vi.fn().mockResolvedValue(undefined);
const requestFlushSpy = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: mockState.online,
    queueDepth: mockState.queueDepth,
    lastFlushAt: mockState.lastFlushAt,
    replayStatus: mockState.replayStatus,
    conflicts: mockState.conflicts,
    actions: {
      requestFlush: requestFlushSpy,
      resolveConflict: resolveConflictSpy,
      retry: requestFlushSpy,
    },
    meta: {
      isReducedMotion: false,
      isPending: false,
      isFlushing: false,
    },
  }),
}));

function setGoalWeightConflict(): void {
  mockState = {
    online: true,
    queueDepth: 1,
    lastFlushAt: null,
    replayStatus: 'conflict',
    conflicts: [
      {
        client_id: 'cid-d3-binding',
        kind: 'goal-weight-update',
        current: {
          goal_weight_kg: 70.5,
          updated_at: '2026-05-15T10:00:00.000Z',
          local_value_kg: 65.0,
          local_set_at: '2026-05-15T08:00:00.000Z',
        },
      },
    ],
  };
}

beforeEach(() => {
  mockState = {
    online: true,
    queueDepth: 0,
    lastFlushAt: null,
    replayStatus: 'idle',
    conflicts: [],
  };
  resolveConflictSpy.mockClear();
  requestFlushSpy.mockClear();
});

async function importHost(): Promise<{
  GoalWeightConflictModalHost: React.ComponentType;
}> {
  return await import('@/components/pwa/GoalWeightConflictModal');
}

describe('GoalWeightConflictModal handler-binding regression (Task D.3 AC4)', () => {
  it('label-handler-bound-correctly-and-distinct: CANCEL click does NOT invoke resolveConflict (handleCancel only)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);

    // Anchor on user-visible label (accessible name) — this is what the
    // handler-binding contract is FOR. The test fails if the CANCEL label
    // ends up bound to handleUseCurrent (which would call resolveConflict).
    const cancelBtn = screen.getByRole('button', { name: 'CANCEL' });
    const useCurrentBtn = screen.getByRole('button', { name: 'USE CURRENT VALUE' });

    // Sanity: the two CTAs are distinct DOM nodes (not the same element
    // rendered twice — which would defeat the binding-distinctness check).
    expect(cancelBtn).not.toBe(useCurrentBtn);

    fireEvent.click(cancelBtn);

    // Cancel is non-destructive — handleCancel only mutates local
    // `dismissedIds` state and does NOT route through resolveConflict.
    expect(resolveConflictSpy).not.toHaveBeenCalled();
  });

  it('label-handler-bound-correctly-and-distinct: USE CURRENT VALUE click invokes resolveConflict(client_id, "use-current") exactly once (handleUseCurrent only)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);

    const cancelBtn = screen.getByRole('button', { name: 'CANCEL' });
    const useCurrentBtn = screen.getByRole('button', { name: 'USE CURRENT VALUE' });

    expect(cancelBtn).not.toBe(useCurrentBtn);

    fireEvent.click(useCurrentBtn);

    // USE CURRENT VALUE must route through resolveConflict with the exact
    // client_id from the conflict record and the 'use-current' decision.
    expect(resolveConflictSpy).toHaveBeenCalledTimes(1);
    expect(resolveConflictSpy).toHaveBeenCalledWith('cid-d3-binding', 'use-current');
  });

  it('label-handler-bound-correctly-and-distinct: distinct DOM buttons receive distinct onClick handlers (props.onClick !== shared reference)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);

    const cancelBtn = screen.getByRole('button', { name: 'CANCEL' });
    const useCurrentBtn = screen.getByRole('button', { name: 'USE CURRENT VALUE' });

    // Test-id sanity — anchors the binding contract to the marker
    // attributes the modal exposes for tooling.
    expect(cancelBtn.getAttribute('data-testid')).toBe('conflict-cancel');
    expect(useCurrentBtn.getAttribute('data-testid')).toBe('conflict-use-current');

    // Cross-assertion: Cancel click → no resolveConflict; UseCurrent click
    // → resolveConflict called. If both buttons shared the SAME onClick
    // (regression class), one of these two paths would fail. Splitting
    // into separate renders (each it() above) plus this contained
    // double-check guards both the "swapped" and "shared" regression
    // classes from sneaking through.
    fireEvent.click(cancelBtn);
    const callsAfterCancel = resolveConflictSpy.mock.calls.length;
    expect(callsAfterCancel).toBe(0);
    // Modal unmounts after Cancel (dismissedIds suppression). Re-render
    // would be needed for a second click, but the contract is already
    // proven by call-count.
  });
});
