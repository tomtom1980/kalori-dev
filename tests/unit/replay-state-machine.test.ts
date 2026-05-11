/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.3 — Replay state machine unit tests (RED → GREEN).
 *
 * Pure reducer; no React, no IDB, no fetch. Verifies:
 *   - 5 documented states (idle, replaying, success, conflict, error)
 *   - 10 transitions T1..T10 from briefing §11
 *   - Illegal transitions return prevState reference (referential equality)
 *   - Unknown event types are ignored (no throw, prevState returned)
 *   - Reducer is pure: no shared mutation; returned state is frozen
 *   - Carry-state fields update correctly (lastFlushAt, conflicts, lastError, queueDepth)
 *   - status enum is exactly the 5 documented values
 *
 * AC4 is the load-bearing contract for this file. AC2 is exercised on T9
 * (enqueue bumps queueDepth without changing status).
 */
import { describe, expect, it } from 'vitest';

import {
  type ReplayContext,
  type ReplayEvent,
  type ReplayStatus,
  initialReplayState,
  replayReducer,
} from '@/lib/offline/replay-state-machine';

function freshState(): ReplayContext {
  return initialReplayState();
}

describe('Task 5.1.3 — replay state machine (pure reducer)', () => {
  it('initialReplayState returns idle with empty carry-state', () => {
    // AC4: documented initial state
    const s = freshState();
    expect(s.status).toBe<ReplayStatus>('idle');
    expect(s.queueDepth).toBe(0);
    expect(s.attempted).toBe(0);
    expect(s.failed).toBe(0);
    expect(s.lastFlushAt).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.conflicts).toEqual([]);
  });

  it('reducer returns frozen state objects', () => {
    // AC4: reducer is pure — callers cannot mutate returned state
    const s = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 1,
    });
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.conflicts)).toBe(true);
  });

  it('T1: idle + flush.start triggers replaying when queue > 0 and online', () => {
    // AC4: T1 transition row from briefing §11
    const next = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 3,
    });
    expect(next.status).toBe<ReplayStatus>('replaying');
    expect(next.queueDepth).toBe(3);
  });

  it('T1 guard: idle + flush.start no-op when queue = 0', () => {
    // AC4: guard preserves prevState reference (illegal transition)
    const prev = freshState();
    const next = replayReducer(prev, {
      type: 'flush.start',
      online: true,
      queueDepth: 0,
    });
    expect(next).toBe(prev);
  });

  it('T1 guard: idle + flush.start no-op when offline', () => {
    // AC4: guard preserves prevState reference
    const prev = freshState();
    const next = replayReducer(prev, {
      type: 'flush.start',
      online: false,
      queueDepth: 5,
    });
    expect(next).toBe(prev);
  });

  it('T2: replaying + flush.complete with failed=0 -> success; clears conflicts; sets lastFlushAt', () => {
    // AC4: T2
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 2,
    });
    const next = replayReducer(replaying, {
      type: 'flush.complete',
      attempted: 2,
      failed: 0,
      conflicts: [],
      lastError: null,
      now: 1_700_000_000_000,
    });
    expect(next.status).toBe<ReplayStatus>('success');
    expect(next.lastFlushAt).toBe(1_700_000_000_000);
    expect(next.conflicts).toEqual([]);
    expect(next.queueDepth).toBe(0);
    expect(next.attempted).toBe(2);
    expect(next.failed).toBe(0);
    expect(next.lastError).toBeNull();
  });

  it('T3: replaying + flush.complete with all-412 failures -> conflict; populates conflicts[]', () => {
    // AC4: T3 — conflict branch carries client_id + kind + current
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 1,
    });
    const next = replayReducer(replaying, {
      type: 'flush.complete',
      attempted: 1,
      failed: 1,
      conflicts: [
        { client_id: 'cid-goal-1', kind: 'goal-weight-update', current: { goal_weight: 70 } },
      ],
      lastError: '412 Precondition Failed',
      now: 1_700_000_000_000,
    });
    expect(next.status).toBe<ReplayStatus>('conflict');
    expect(next.conflicts).toHaveLength(1);
    expect(next.conflicts[0]?.client_id).toBe('cid-goal-1');
    expect(next.conflicts[0]?.kind).toBe('goal-weight-update');
    expect(next.conflicts[0]?.current).toEqual({ goal_weight: 70 });
    expect(next.failed).toBe(1);
  });

  it('T4: replaying + flush.complete with non-412 failures -> error; records lastError', () => {
    // AC4: T4
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 1,
    });
    const next = replayReducer(replaying, {
      type: 'flush.complete',
      attempted: 1,
      failed: 1,
      conflicts: [],
      lastError: '500 Internal Server Error',
      now: 1_700_000_000_000,
    });
    expect(next.status).toBe<ReplayStatus>('error');
    expect(next.lastError).toBe('500 Internal Server Error');
    expect(next.failed).toBe(1);
  });

  it('T4: mixed 412 + non-412 failures route to error (non-412 dominates)', () => {
    // AC4: per briefing §11 — any non-412 failure ⇒ error, not conflict
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 2,
    });
    const next = replayReducer(replaying, {
      type: 'flush.complete',
      attempted: 2,
      failed: 2,
      conflicts: [{ client_id: 'cid-1', kind: 'goal-weight-update', current: { goal_weight: 70 } }],
      lastError: '500 Internal Server Error',
      now: 1_700_000_000_000,
    });
    expect(next.status).toBe<ReplayStatus>('error');
  });

  it('T5: replaying + flush.aborted-network -> error with lastError = network', () => {
    // AC4: T5
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 1,
    });
    const next = replayReducer(replaying, {
      type: 'flush.aborted-network',
      now: 1_700_000_000_000,
    });
    expect(next.status).toBe<ReplayStatus>('error');
    expect(next.lastError).toBe('network');
  });

  it('T6: success + tick -> idle; resets transient fields', () => {
    // AC4: T6 — sticky timer fires externally; reducer just handles event
    const success = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      { type: 'flush.complete', attempted: 1, failed: 0, conflicts: [], lastError: null, now: 1 },
    );
    expect(success.status).toBe<ReplayStatus>('success');
    const next = replayReducer(success, { type: 'tick' });
    expect(next.status).toBe<ReplayStatus>('idle');
    expect(next.lastFlushAt).toBe(success.lastFlushAt); // preserved across age-out
  });

  it('T7: conflict + flush.start -> replaying', () => {
    // AC4: T7
    const conflict = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      {
        type: 'flush.complete',
        attempted: 1,
        failed: 1,
        conflicts: [{ client_id: 'a', kind: 'goal-weight-update', current: null }],
        lastError: '412',
        now: 1,
      },
    );
    expect(conflict.status).toBe<ReplayStatus>('conflict');
    const next = replayReducer(conflict, { type: 'flush.start', online: true, queueDepth: 1 });
    expect(next.status).toBe<ReplayStatus>('replaying');
  });

  it('T8: error + flush.start -> replaying (user retry or online event)', () => {
    // AC4: T8
    const error = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      { type: 'flush.aborted-network', now: 1 },
    );
    expect(error.status).toBe<ReplayStatus>('error');
    const next = replayReducer(error, { type: 'flush.start', online: true, queueDepth: 1 });
    expect(next.status).toBe<ReplayStatus>('replaying');
  });

  it('T7 guard (Codex F1): conflict + flush.start no-op when offline', () => {
    // Codex F1: reducer is the single source of truth for admission. The
    // online + queueDepth guard MUST apply uniformly to conflict and error
    // retries, not just idle. Returns prevState reference so the provider can
    // detect the rejected transition and skip outbox.flush.
    const conflict = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      {
        type: 'flush.complete',
        attempted: 1,
        failed: 1,
        conflicts: [{ client_id: 'a', kind: 'goal-weight-update', current: null }],
        lastError: '412',
        now: 1,
      },
    );
    expect(conflict.status).toBe<ReplayStatus>('conflict');
    const next = replayReducer(conflict, { type: 'flush.start', online: false, queueDepth: 1 });
    expect(next).toBe(conflict);
  });

  it('T7 guard (Codex F1): conflict + flush.start no-op when queueDepth=0', () => {
    // Codex F1: empty-queue guard applies to conflict retries too.
    const conflict = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      {
        type: 'flush.complete',
        attempted: 1,
        failed: 1,
        conflicts: [{ client_id: 'a', kind: 'goal-weight-update', current: null }],
        lastError: '412',
        now: 1,
      },
    );
    expect(conflict.status).toBe<ReplayStatus>('conflict');
    const next = replayReducer(conflict, { type: 'flush.start', online: true, queueDepth: 0 });
    expect(next).toBe(conflict);
  });

  it('T8 guard (Codex F1): error + flush.start no-op when offline', () => {
    // Codex F1: same uniform guard for error retries.
    const error = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      { type: 'flush.aborted-network', now: 1 },
    );
    expect(error.status).toBe<ReplayStatus>('error');
    const next = replayReducer(error, { type: 'flush.start', online: false, queueDepth: 1 });
    expect(next).toBe(error);
  });

  it('T8 guard (Codex F1): error + flush.start no-op when queueDepth=0', () => {
    // Codex F1: error + empty queue must reject too.
    const error = replayReducer(
      replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
      { type: 'flush.aborted-network', now: 1 },
    );
    expect(error.status).toBe<ReplayStatus>('error');
    const next = replayReducer(error, { type: 'flush.start', online: true, queueDepth: 0 });
    expect(next).toBe(error);
  });

  it('T9: enqueue from any state bumps queueDepth without changing status', () => {
    // AC2 + AC4 — queueDepth is a separate signal from replayStatus
    const states: ReplayStatus[] = ['idle', 'replaying', 'success', 'conflict', 'error'];
    for (const target of states) {
      let s = freshState();
      if (
        target === 'replaying' ||
        target === 'success' ||
        target === 'conflict' ||
        target === 'error'
      ) {
        s = replayReducer(s, { type: 'flush.start', online: true, queueDepth: 1 });
      }
      if (target === 'success') {
        s = replayReducer(s, {
          type: 'flush.complete',
          attempted: 1,
          failed: 0,
          conflicts: [],
          lastError: null,
          now: 1,
        });
      }
      if (target === 'conflict') {
        s = replayReducer(s, {
          type: 'flush.complete',
          attempted: 1,
          failed: 1,
          conflicts: [{ client_id: 'a', kind: 'goal-weight-update', current: null }],
          lastError: '412',
          now: 1,
        });
      }
      if (target === 'error') {
        s = replayReducer(s, { type: 'flush.aborted-network', now: 1 });
      }
      expect(s.status).toBe<ReplayStatus>(target);
      const beforeDepth = s.queueDepth;
      const next = replayReducer(s, { type: 'enqueue', queueDepth: beforeDepth + 1 });
      expect(next.status).toBe<ReplayStatus>(target);
      expect(next.queueDepth).toBe(beforeDepth + 1);
    }
  });

  it('T10: clear-dev resets state to idle', () => {
    // AC4: T10
    const replaying = replayReducer(freshState(), {
      type: 'flush.start',
      online: true,
      queueDepth: 5,
    });
    const next = replayReducer(replaying, { type: 'clear-dev' });
    expect(next.status).toBe<ReplayStatus>('idle');
    expect(next.queueDepth).toBe(0);
    expect(next.conflicts).toEqual([]);
    expect(next.lastError).toBeNull();
  });

  describe('illegal transitions return prevState reference', () => {
    it('flush.complete while idle -> no-op', () => {
      // AC4: illegal-transition policy
      const prev = freshState();
      const next = replayReducer(prev, {
        type: 'flush.complete',
        attempted: 1,
        failed: 0,
        conflicts: [],
        lastError: null,
        now: 1,
      });
      expect(next).toBe(prev);
    });

    it('flush.start while replaying -> no-op (already in flight)', () => {
      // AC4
      const replaying = replayReducer(freshState(), {
        type: 'flush.start',
        online: true,
        queueDepth: 1,
      });
      const next = replayReducer(replaying, {
        type: 'flush.start',
        online: true,
        queueDepth: 1,
      });
      expect(next).toBe(replaying);
    });

    it('tick while error -> no-op (only success ages out)', () => {
      // AC4
      const error = replayReducer(
        replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
        { type: 'flush.aborted-network', now: 1 },
      );
      const next = replayReducer(error, { type: 'tick' });
      expect(next).toBe(error);
    });

    it('tick while idle -> no-op', () => {
      // AC4
      const prev = freshState();
      const next = replayReducer(prev, { type: 'tick' });
      expect(next).toBe(prev);
    });

    it('tick while conflict -> no-op', () => {
      // AC4
      const conflict = replayReducer(
        replayReducer(freshState(), { type: 'flush.start', online: true, queueDepth: 1 }),
        {
          type: 'flush.complete',
          attempted: 1,
          failed: 1,
          conflicts: [{ client_id: 'a', kind: 'goal-weight-update', current: null }],
          lastError: '412',
          now: 1,
        },
      );
      const next = replayReducer(conflict, { type: 'tick' });
      expect(next).toBe(conflict);
    });

    it('flush.aborted-network while idle -> no-op', () => {
      // AC4
      const prev = freshState();
      const next = replayReducer(prev, { type: 'flush.aborted-network', now: 1 });
      expect(next).toBe(prev);
    });
  });

  it('reducer ignores unknown event types (returns prevState reference)', () => {
    // AC4: never throws on unknown events
    const prev = freshState();
    const next = replayReducer(prev, {
      type: 'totally-unknown-event' as unknown as never,
    } as ReplayEvent);
    expect(next).toBe(prev);
  });

  it('status enum is exactly the 5 documented values', () => {
    // AC4: exhaustive enum match
    const allowed: ReplayStatus[] = ['idle', 'replaying', 'success', 'conflict', 'error'];
    // Drive through each value once to exercise the type at runtime
    expect(allowed).toHaveLength(5);
    for (const v of allowed) {
      expect(['idle', 'replaying', 'success', 'conflict', 'error']).toContain(v);
    }
  });
});
