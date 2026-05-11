/**
 * FoodDetail optimistic reducer — Task 4.2.
 *
 * Drives the `useOptimistic` state for the single-item delete + undo flow.
 * A standalone reducer keeps the behavior unit-testable without mounting
 * React.
 *
 * State shape mirrors Task 4.1 LibraryClient's removedIds pattern scaled
 * down to a single id: a tombstone set. The undo action clears the set.
 * The reducer is idempotent under repeated `remove` / `restore` actions —
 * the forced-401 retry in the interceptor replays identical bytes which
 * translates to identical reducer invocations here.
 */
export interface FoodDetailOptimisticState {
  /** Ids that have been optimistically tombstoned — UI hides them. */
  removedIds: ReadonlySet<string>;
}

export const INITIAL_FD_OPTIMISTIC: FoodDetailOptimisticState = {
  removedIds: new Set<string>(),
};

export type FoodDetailOptimisticAction =
  | { type: 'remove'; id: string }
  | { type: 'restore'; id: string };

export function foodDetailOptimisticReducer(
  state: FoodDetailOptimisticState,
  action: FoodDetailOptimisticAction,
): FoodDetailOptimisticState {
  switch (action.type) {
    case 'remove': {
      if (state.removedIds.has(action.id)) return state;
      const next = new Set(state.removedIds);
      next.add(action.id);
      return { removedIds: next };
    }
    case 'restore': {
      if (!state.removedIds.has(action.id)) return state;
      const next = new Set(state.removedIds);
      next.delete(action.id);
      return { removedIds: next };
    }
  }
}
