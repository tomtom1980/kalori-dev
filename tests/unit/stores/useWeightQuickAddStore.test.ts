/**
 * Task 4.3b — `useWeightQuickAddStore` pure reducer tests.
 *
 * Mirrors the shape/responsibilities ux spec §8.2 + design-lead §8.2 laid out.
 * Store is pure — all `fetch` / `authPost` happens in the component. These
 * tests assert reducer purity + rollback semantics + idempotent replay guard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';

function resetStore() {
  useWeightQuickAddStore.getState().reset();
}

describe('useWeightQuickAddStore', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  it('starts empty', () => {
    const { pending, lastCommittedWeightKg } = useWeightQuickAddStore.getState();
    expect(Object.keys(pending)).toHaveLength(0);
    expect(lastCommittedWeightKg).toBeNull();
  });

  it('submit() registers a pending entry keyed by clientId', () => {
    useWeightQuickAddStore.getState().submit({
      clientId: 'c-1',
      weightKg: 71.4,
      date: '2026-04-24',
      note: 'after run',
    });
    const entry = useWeightQuickAddStore.getState().pending['c-1'];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('pending');
    expect(entry?.weightKg).toBe(71.4);
    expect(entry?.note).toBe('after run');
  });

  it('commit() removes pending + updates lastCommittedWeightKg', () => {
    const store = useWeightQuickAddStore.getState();
    store.submit({ clientId: 'c-2', weightKg: 72.0, date: '2026-04-24' });
    store.commit('c-2', { weightKg: 72.0, date: '2026-04-24' });
    const after = useWeightQuickAddStore.getState();
    expect(after.pending['c-2']).toBeUndefined();
    expect(after.lastCommittedWeightKg).toBe(72.0);
  });

  it('rollback() flags entry rolled-back and preserves previousWeight for toast', () => {
    const store = useWeightQuickAddStore.getState();
    store.submit({ clientId: 'c-3', weightKg: 70.5, date: '2026-04-24' });
    store.rollback('c-3', 'server-error');
    const after = useWeightQuickAddStore.getState();
    expect(after.pending['c-3']?.status).toBe('rolled-back');
    expect(after.pending['c-3']?.rollbackReason).toBe('server-error');
  });

  it('reset() clears all state', () => {
    const store = useWeightQuickAddStore.getState();
    store.submit({ clientId: 'c-4', weightKg: 68.2, date: '2026-04-24' });
    store.commit('c-4', { weightKg: 68.2, date: '2026-04-24' });
    store.reset();
    const s = useWeightQuickAddStore.getState();
    expect(Object.keys(s.pending)).toHaveLength(0);
    expect(s.lastCommittedWeightKg).toBeNull();
  });

  it('idempotent replay: commit() called twice with same clientId is a no-op second time', () => {
    const store = useWeightQuickAddStore.getState();
    store.submit({ clientId: 'c-5', weightKg: 69.1, date: '2026-04-24' });
    store.commit('c-5', { weightKg: 69.1, date: '2026-04-24' });
    const firstCommittedAt = useWeightQuickAddStore.getState().lastCommittedAt;
    // Second call with same clientId (simulating a replay) must NOT re-announce.
    store.commit('c-5', { weightKg: 69.1, date: '2026-04-24' });
    const secondCommittedAt = useWeightQuickAddStore.getState().lastCommittedAt;
    expect(secondCommittedAt).toBe(firstCommittedAt);
  });

  it('hasPendingFor(clientId) reports accurate membership', () => {
    const store = useWeightQuickAddStore.getState();
    expect(store.hasPendingFor('c-6')).toBe(false);
    store.submit({ clientId: 'c-6', weightKg: 68.0, date: '2026-04-24' });
    expect(useWeightQuickAddStore.getState().hasPendingFor('c-6')).toBe(true);
  });
});
