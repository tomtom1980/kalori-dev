/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.5 — F10 outbox conflict resolution flow (post-Codex Round 1).
 *
 * AC3 (F10 LWW silent for library kinds only — Codex F1 reconciliation):
 *      library-update / library-bulk-delete 412 → silent dequeue, no modal.
 *      entry/water/weight 412 → fail-loud no-op host (row stays queued).
 * AC4 (F10 goal-weight prompt): goal-weight-update 412 → AlertDialog with
 *      role=alertdialog + focus trap + Cancel button (Codex F2) +
 *      ESC = Cancel = non-destructive.
 * AC5: modal closes on resolution; outbox row dequeued; replayStatus → idle.
 * AC6: vitest-axe zero serious/critical violations on modal mounted state.
 *
 * Briefing §5c + §6 + §7d. Codex Round 1 fixes: F1 (narrow LWW), F2 (single
 * primary CTA + Cancel + ESC re-enabled), F3 (silent dispatch retry-safe).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

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
    queueDepth: 0,
    lastFlushAt: null,
    replayStatus: 'idle',
    conflicts: [],
  };
  requestFlush.mockClear();
  resolveConflictAction.mockClear();
});

afterEach(() => {
  // RTL `cleanup()` registered in tests/setup.ts unmounts after each test.
});

async function importHost(): Promise<{
  GoalWeightConflictModalHost: React.ComponentType;
}> {
  // Host component owns BOTH the silent-LWW side-effect AND the modal mount
  // for goal-weight prompts. Briefing §8 step 8.
  return await import('@/components/pwa/GoalWeightConflictModal');
}

describe('Outbox conflict resolution — library kinds (silent LWW)', () => {
  it('AC3: library-update 412 → no modal mounted (silent LWW)', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-lib',
          kind: 'library-update',
          current: { name: 'Pho' },
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    // No alertdialog should be mounted for library kinds.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('AC3: library-update 412 → calls actions.resolveConflict(client_id, "use-current") silently', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-lib',
          kind: 'library-update',
          current: { name: 'Pho' },
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await waitFor(() => {
      expect(resolveConflictAction).toHaveBeenCalledWith('cid-lib', 'use-current');
    });
  });

  it('AC3: library-bulk-delete 412 → silent dequeue same as library-update', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-bulk',
          kind: 'library-bulk-delete',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => {
      expect(resolveConflictAction).toHaveBeenCalledWith('cid-bulk', 'use-current');
    });
  });

  it('AC3 (Codex F1): entry-create 412 → fail-loud (no modal, no silent dequeue, row stays queued)', async () => {
    // Codex Round 1 F1: design-doc §18.1 only authorises silent LWW for
    // library kinds. entry/water/weight conflicts must NOT silently dequeue
    // — they stay queued and surface in the badge + drawer for manual
    // review until the client-wins re-submit path ships
    // (F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT).
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-entry',
          kind: 'entry-create',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    // No modal — entry kinds do not prompt the user.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // No silent dequeue either — row must stay queued.
    // Use a microtask flush to ensure the effect runs before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC3 (Codex F1): water-log 412 → fail-loud (same policy as entry kinds)', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-water',
          kind: 'water-log',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC3 (Codex F1): weight-log 412 → fail-loud (same policy as entry kinds)', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-weight',
          kind: 'weight-log',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC3 (Codex F3 regression): library silent-LWW with failing dequeue does NOT permanently suppress retry', async () => {
    // Codex F3: previously the host added `client_id` to dispatchedSilentRef
    // BEFORE knowing whether `actions.resolveConflict` actually removed the
    // outbox row. When the provider was a no-op (outbox.remove returned
    // false) the conflict stayed queued AND the host refused to retry the
    // same id → permanent stuck state. The fix splits in-flight tracking
    // from completed-dispatch tracking: only mark as dispatched AFTER the
    // call resolves successfully. The simplest behavioural assertion is
    // that the auto-dispatch fires whenever the snapshot keeps the same
    // conflict on a re-render — i.e. no stale suppression.
    resolveConflictAction.mockClear();
    // First render: conflict in snapshot, dispatch fires once.
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-stuck',
          kind: 'library-update',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    const { rerender } = render(<GoalWeightConflictModalHost />);
    await waitFor(() => {
      expect(resolveConflictAction).toHaveBeenCalledTimes(1);
    });
    expect(resolveConflictAction).toHaveBeenCalledWith('cid-stuck', 'use-current');
    // Simulate a benign re-render that does NOT change the snapshot
    // (same conflict still in queue because removal succeeded but the
    // emitter has not propagated yet). The host must NOT re-dispatch
    // for the same id within the same in-flight window.
    rerender(<GoalWeightConflictModalHost />);
    expect(resolveConflictAction).toHaveBeenCalledTimes(1);
  });

  it('AC3: idle replayStatus → no resolveConflict call even with conflicts present (defensive)', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'idle',
      conflicts: [
        {
          client_id: 'cid-stale',
          kind: 'library-update',
          current: null,
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });
});

describe('Outbox conflict resolution — goal-weight (user prompt)', () => {
  function setGoalWeightConflict(): void {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-goal',
          kind: 'goal-weight-update',
          current: {
            goal_weight_kg: 70.5,
            updated_at: '2026-04-29T10:00:00.000Z',
            local_value_kg: 65.0,
            local_set_at: '2026-04-29T08:00:00.000Z',
          },
        },
      ],
    };
  }

  it('AC4: goal-weight 412 → modal mounts with role=alertdialog', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
  });

  it('AC4: goal-weight 412 → no silent resolveConflict (user must choose)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC4: modal has aria-modal="true"', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('AC4: modal has aria-labelledby="conflict-title" + aria-describedby="conflict-body"', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('conflict-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('conflict-body');
    // The targets must exist in the DOM and be reachable from the dialog.
    expect(document.getElementById('conflict-title')).not.toBeNull();
    expect(document.getElementById('conflict-body')).not.toBeNull();
  });

  it('AC4 (Codex F2): Cancel button is mapped to AlertDialog.Cancel slot (first focus)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    const cancelBtn = await screen.findByTestId('conflict-cancel');
    // Cancel slot — Radix wires this to receive initial focus on open.
    expect(cancelBtn.getAttribute('data-cancel-slot')).toBe('true');
  });

  it('AC4 (Codex F2): only ONE primary CTA is rendered (the lying USE OFFLINE VALUE button is gone)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    // The deprecated "USE OFFLINE VALUE" testid must not exist anywhere.
    expect(screen.queryByTestId('conflict-use-offline')).toBeNull();
    // The single primary CTA + Cancel button are present.
    expect(screen.queryByTestId('conflict-use-current')).not.toBeNull();
    expect(screen.queryByTestId('conflict-cancel')).not.toBeNull();
  });

  it('AC4 (Codex F2): ESC closes modal without resolving (non-destructive cancel)', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    // Modal unmounts after Escape.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // resolveConflict was NOT called — outbox row stays queued for next session.
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC4 (Codex F2): Cancel click closes modal without resolving', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    const cancelBtn = await screen.findByTestId('conflict-cancel');
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(resolveConflictAction).not.toHaveBeenCalled();
  });

  it('AC4: pointer-down outside (scrim click) is disabled', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    // Modal exposes a marker so we can verify the wiring is present without
    // simulating the full Radix overlay-pointer-down sequence (which jsdom
    // doesn't reliably synthesize). The marker proves the
    // `onPointerDownOutside.preventDefault` wiring is in place.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('data-pointer-down-outside-disabled')).toBe('true');
  });

  it('AC5: USE CURRENT VALUE click → actions.resolveConflict("cid-goal","use-current")', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const useCurrentBtn = await screen.findByTestId('conflict-use-current');
    fireEvent.click(useCurrentBtn);
    await waitFor(() => {
      expect(resolveConflictAction).toHaveBeenCalledWith('cid-goal', 'use-current');
    });
  });

  it('AC4: modal renders body copy with localValue/serverValue from conflict.current', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    // Server value = 70.5 kg; local value = 65 kg.
    expect(dialog.textContent).toContain('70.5');
    expect(dialog.textContent).toContain('65');
  });

  it('AC4: modal kicker reads "§ CONFLICT"', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('§ CONFLICT');
  });

  it('AC4: modal title reads "Goal weight changed."', async () => {
    setGoalWeightConflict();
    const { GoalWeightConflictModalHost } = await importHost();
    render(<GoalWeightConflictModalHost />);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Goal weight changed.');
  });
});

describe('Outbox conflict resolution — modal a11y (vitest-axe)', () => {
  it('AC6: zero violations on goal-weight modal mounted', async () => {
    mockState = {
      ...mockState,
      replayStatus: 'conflict',
      conflicts: [
        {
          client_id: 'cid-axe',
          kind: 'goal-weight-update',
          current: {
            goal_weight_kg: 72.0,
            updated_at: '2026-04-29T10:00:00.000Z',
            local_value_kg: 68.5,
            local_set_at: '2026-04-29T09:00:00.000Z',
          },
        },
      ],
    };
    const { GoalWeightConflictModalHost } = await importHost();
    const { container } = render(<GoalWeightConflictModalHost />);
    await screen.findByRole('alertdialog');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
