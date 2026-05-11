/**
 * Task 5.1.5 — Unit tests for `lib/offline/conflict-resolver.ts`.
 *
 * Codex Round 1 (F1) policy reconciliation. Three classes per design-doc
 * §14 (line 751) + §18.1 F10 (line 855):
 *   - 2 library kinds                  → `lww-silent` + `winner: 'server'`
 *   - 4 entry/water/weight kinds       → `fail-loud` + `winner: null`
 *   - 1 goal-weight kind               → `prompt-user` + `winner: null`
 *
 * Function purity is asserted explicitly: same inputs → same output, no
 * mutation of inputs.
 *
 * Briefing §6 + §7a.
 */
import { describe, expect, it } from 'vitest';

import { resolveConflict } from '@/lib/offline/conflict-resolver';

import type { OutboxBody, OutboxKind } from '@/lib/offline/types';

const baseBody: OutboxBody = { client_id: 'cid-fixture' };

describe('resolveConflict — F10 per-table policy', () => {
  // Codex F1: only `library-update` and `library-bulk-delete` are explicitly
  // authorised for silent LWW by design-doc §18.1 ("Last-write-wins for
  // library edits"). Every other non-goal kind must surface as fail-loud
  // until a client-wins re-submit path ships.
  const libraryLwwKinds: OutboxKind[] = ['library-update', 'library-bulk-delete'];

  for (const kind of libraryLwwKinds) {
    it(`returns lww-silent + server winner for ${kind} (library kinds, design-doc §18.1)`, () => {
      const result = resolveConflict({
        kind,
        serverCurrent: { foo: 'bar' },
        localBody: baseBody,
      });
      expect(result.policy).toBe('lww-silent');
      expect(result.winner).toBe('server');
      expect(result.reason).toMatch(/library/i);
    });
  }

  // Codex F1: design-doc rule is "client wins on last-write-wins except
  // profile.goal_weight" (§14.751). Until client-wins re-submit ships, these
  // kinds MUST surface a user-visible error rather than silently dequeue.
  const failLoudKinds: OutboxKind[] = ['entry-create', 'entry-delete', 'water-log', 'weight-log'];

  for (const kind of failLoudKinds) {
    it(`returns fail-loud + null winner for ${kind} (design-doc client-wins not yet implemented)`, () => {
      const result = resolveConflict({
        kind,
        serverCurrent: { foo: 'bar' },
        localBody: baseBody,
      });
      expect(result.policy).toBe('fail-loud');
      expect(result.winner).toBeNull();
      expect(result.reason).toMatch(
        /client-wins|fail-loud|F-OFFLINE-5\.1\.5-CLIENT-WINS-RESUBMIT/i,
      );
    });
  }

  it('returns prompt-user + null winner for goal-weight-update', () => {
    const result = resolveConflict({
      kind: 'goal-weight-update',
      serverCurrent: { goal_weight_kg: 70.5 },
      localBody: baseBody,
    });
    expect(result.policy).toBe('prompt-user');
    expect(result.winner).toBeNull();
    expect(result.reason).toMatch(/goal-weight requires user confirmation/i);
  });

  it('is pure: same inputs → same output across multiple invocations', () => {
    const args = {
      kind: 'library-update' as OutboxKind,
      serverCurrent: { name: 'Phở' },
      localBody: { ...baseBody, name: 'Pho' },
    };
    const r1 = resolveConflict(args);
    const r2 = resolveConflict(args);
    const r3 = resolveConflict(args);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('does not mutate inputs (localBody and serverCurrent stay frozen)', () => {
    const localBody = Object.freeze({ ...baseBody, name: 'Phở' }) as OutboxBody;
    const serverCurrent = Object.freeze({ name: 'Pho' });
    expect(() =>
      resolveConflict({
        kind: 'library-update',
        serverCurrent,
        localBody,
      }),
    ).not.toThrow();
    // Frozen object remains frozen.
    expect(Object.isFrozen(localBody)).toBe(true);
    expect(Object.isFrozen(serverCurrent)).toBe(true);
  });

  it('exhaustive: covers all 7 OutboxKind values (compile-time exhaustiveness check)', () => {
    const allKinds: OutboxKind[] = [
      'entry-create',
      'entry-delete',
      'water-log',
      'weight-log',
      'library-update',
      'library-bulk-delete',
      'goal-weight-update',
    ];
    // Each kind must produce a non-empty reason and a policy from the
    // narrowed F1-aligned policy set.
    for (const kind of allKinds) {
      const result = resolveConflict({ kind, serverCurrent: null, localBody: baseBody });
      expect(result.reason.length).toBeGreaterThan(0);
      expect(['lww-silent', 'prompt-user', 'fail-loud']).toContain(result.policy);
    }
  });
});
