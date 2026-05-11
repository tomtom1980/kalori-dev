/**
 * `useLibrarySelectionStore` unit tests — Task 4.1 sub-step 3.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

describe('useLibrarySelectionStore', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
  });

  it('starts empty', () => {
    expect(useLibrarySelectionStore.getState().ids.size).toBe(0);
  });

  it('toggle adds then removes an id', () => {
    const { toggle } = useLibrarySelectionStore.getState();
    toggle('a');
    expect(useLibrarySelectionStore.getState().has('a')).toBe(true);
    toggle('a');
    expect(useLibrarySelectionStore.getState().has('a')).toBe(false);
  });

  it('selectAll replaces the set', () => {
    useLibrarySelectionStore.getState().add('x');
    useLibrarySelectionStore.getState().selectAll(['a', 'b', 'c']);
    const { ids } = useLibrarySelectionStore.getState();
    expect(ids.size).toBe(3);
    expect(ids.has('x')).toBe(false);
    expect(ids.has('a')).toBe(true);
  });

  it('clear empties the set', () => {
    useLibrarySelectionStore.getState().add('a');
    useLibrarySelectionStore.getState().add('b');
    useLibrarySelectionStore.getState().clear();
    expect(useLibrarySelectionStore.getState().ids.size).toBe(0);
  });

  it('add is idempotent — no new Set if already present', () => {
    const { add, ids: firstIds } = useLibrarySelectionStore.getState();
    add('a');
    const secondIds = useLibrarySelectionStore.getState().ids;
    add('a');
    const thirdIds = useLibrarySelectionStore.getState().ids;
    expect(secondIds).not.toBe(firstIds);
    expect(thirdIds).toBe(secondIds);
  });

  it('size selector reports count', () => {
    useLibrarySelectionStore.getState().selectAll(['1', '2', '3']);
    expect(useLibrarySelectionStore.getState().size()).toBe(3);
  });
});
