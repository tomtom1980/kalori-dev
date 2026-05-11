/**
 * Unit tests — Task 4.2 optimistic reducer.
 *
 * Covers the single-item tombstone reducer's idempotency + restore
 * semantics. The reducer is invoked from inside a `useOptimistic`
 * transition; under F12 retry the interceptor replays identical bytes
 * but the reducer must also tolerate double-dispatch without drift.
 */
import { describe, expect, it } from 'vitest';

import {
  foodDetailOptimisticReducer,
  INITIAL_FD_OPTIMISTIC,
} from '@/app/(app)/library/_components/FoodDetail/foodDetail.reducer';

describe('foodDetailOptimisticReducer', () => {
  it('remove adds id to removedIds', () => {
    const next = foodDetailOptimisticReducer(INITIAL_FD_OPTIMISTIC, {
      type: 'remove',
      id: 'row-1',
    });
    expect(next.removedIds.has('row-1')).toBe(true);
  });

  it('remove is idempotent — double remove yields stable state', () => {
    const once = foodDetailOptimisticReducer(INITIAL_FD_OPTIMISTIC, {
      type: 'remove',
      id: 'row-1',
    });
    const twice = foodDetailOptimisticReducer(once, { type: 'remove', id: 'row-1' });
    expect(twice).toBe(once);
    expect(twice.removedIds.size).toBe(1);
  });

  it('restore clears the id', () => {
    const after = foodDetailOptimisticReducer(INITIAL_FD_OPTIMISTIC, {
      type: 'remove',
      id: 'row-1',
    });
    const restored = foodDetailOptimisticReducer(after, { type: 'restore', id: 'row-1' });
    expect(restored.removedIds.has('row-1')).toBe(false);
  });

  it('restore on unknown id is a no-op', () => {
    const next = foodDetailOptimisticReducer(INITIAL_FD_OPTIMISTIC, {
      type: 'restore',
      id: 'row-1',
    });
    expect(next).toBe(INITIAL_FD_OPTIMISTIC);
  });
});
