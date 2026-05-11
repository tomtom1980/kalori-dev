/**
 * Task 4.7.4 (TDD-RED → GREEN) — LibraryTab hydration via store.
 *
 * Asserts that <LibraryTab /> renders items from `useLogFlowStore.libraryItems`
 * (the new store-managed hydrated list) when the store has them, and falls
 * back to the empty state otherwise. Before Task 4.7.4 this fails because
 * LibraryTab only reads items from a `props.items` default of [].
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryTab } from '@/app/(app)/log/_components/LibraryTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<LibraryTab /> — store-driven hydration (Task 4.7.4)', () => {
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('renders items hydrated into the store via setLibraryItems', () => {
    useLogFlowStore.getState().setLibraryItems([
      {
        id: 'pho-id',
        name: 'Pho Bo',
        kcal: 520,
        lastUsedIso: '2026-04-20T12:00:00Z',
        logCount: 12,
        proteinG: 32,
        carbsG: 48,
        fatG: 14,
        fiberG: 3,
        unit: 'g',
      },
    ]);
    render(<LibraryTab />);
    expect(screen.getByText('Pho Bo')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-pho-id')).toBeInTheDocument();
  });

  it('renders empty state when store has no items', () => {
    render(<LibraryTab />);
    expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
  });

  it('store hydration takes precedence over default empty list', () => {
    useLogFlowStore.getState().setLibraryItems([
      {
        id: 'a',
        name: 'Banh Mi',
        kcal: 480,
        lastUsedIso: null,
        logCount: 5,
        proteinG: 18,
        carbsG: 60,
        fatG: 12,
        fiberG: 2,
        unit: 'g',
      },
      {
        id: 'b',
        name: 'Bun Cha',
        kcal: 540,
        lastUsedIso: '2026-04-22T12:00:00Z',
        logCount: 3,
        proteinG: 28,
        carbsG: 50,
        fatG: 18,
        fiberG: 4,
        unit: 'g',
      },
    ]);
    render(<LibraryTab />);
    expect(screen.getByText('Banh Mi')).toBeInTheDocument();
    expect(screen.getByText('Bun Cha')).toBeInTheDocument();
    expect(screen.queryByTestId('library-empty-state')).not.toBeInTheDocument();
  });

  it('IMPROVEMENT R1: setLibraryItems prunes stale selection (deleted ids dropped)', () => {
    // Seed selection with two ids; replace items so that one of them no
    // longer exists. Pruned selection must drop the orphan.
    const store = useLogFlowStore.getState();
    store.setLibraryItems([
      {
        id: 'pho-id',
        name: 'Pho Bo',
        kcal: 520,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 30,
        carbsG: 40,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
      },
      {
        id: 'deleted-id',
        name: 'Deleted',
        kcal: 100,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 5,
        carbsG: 10,
        fatG: 2,
        fiberG: 0,
        unit: 'g',
      },
    ]);
    store.setLibrarySelection([
      { itemId: 'pho-id', quantity: 1 },
      { itemId: 'deleted-id', quantity: 2 },
    ]);
    // Re-hydrate the store with a list missing 'deleted-id'.
    store.setLibraryItems([
      {
        id: 'pho-id',
        name: 'Pho Bo',
        kcal: 520,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 30,
        carbsG: 40,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
      },
    ]);
    const sel = useLogFlowStore.getState().librarySelection;
    expect(sel).toHaveLength(1);
    expect(sel[0]?.itemId).toBe('pho-id');
  });

  it('IMPROVEMENT R1: setLibraryItems with no overlapping ids clears selection', () => {
    const store = useLogFlowStore.getState();
    store.setLibrarySelection([{ itemId: 'orphan', quantity: 1 }]);
    store.setLibraryItems([
      {
        id: 'fresh',
        name: 'Fresh',
        kcal: 100,
        lastUsedIso: null,
        logCount: 1,
        proteinG: 5,
        carbsG: 10,
        fatG: 2,
        fiberG: 0,
        unit: 'g',
      },
    ]);
    expect(useLogFlowStore.getState().librarySelection).toEqual([]);
  });
});
