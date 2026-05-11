/**
 * Task 4.7.4 (TDD-RED → GREEN) — LibraryTab "LOG SELECTED" CTA.
 *
 * Asserts that the Continue CTA appears only when items are selected, and
 * that clicking it dispatches `enterConfirmation` with a library
 * `ParsedItemT[]` payload. The Codex Round 1 CRITICAL fix added a
 * `libraryItemIds` array to the payload so the save endpoint receives a
 * `library_item_id` for the first selected item (per I12 contract). Multi-
 * item selections pass `[firstId, null, null, ...]` because the save
 * endpoint only persists a single `library_item_id` per food_entries row.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryTab } from '@/app/(app)/log/_components/LibraryTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const SAMPLE_ITEM = {
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
};

describe('<LibraryTab /> — Continue / LOG SELECTED CTA (Task 4.7.4)', () => {
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('CTA hidden / disabled when no items selected', () => {
    useLogFlowStore.getState().setLibraryItems([SAMPLE_ITEM]);
    render(<LibraryTab />);
    expect(screen.queryByTestId('library-log-selected')).not.toBeInTheDocument();
  });

  it('CTA visible after selecting one item, dispatches enterConfirmation on click', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([SAMPLE_ITEM]);
    render(<LibraryTab />);

    // Select the card (toggles librarySelection).
    await user.click(screen.getByTestId('library-card-pho-id'));

    const cta = screen.getByTestId('library-log-selected');
    expect(cta).toBeInTheDocument();

    await user.click(cta);

    const state = useLogFlowStore.getState();
    expect(state.phase).toBe('confirmation');
    expect(state.confirmationPayload?.source).toBe('library');
    expect(state.confirmationPayload?.tab).toBe('library');
    expect(state.confirmationPayload?.items).toHaveLength(1);
    const item = state.confirmationPayload!.items[0]!;
    expect(item.name).toBe('Pho Bo');
    expect(item.kcal).toBe(520);
    expect(item.macros.protein_g).toBe(32);
    expect(item.macros.carbs_g).toBe(48);
    expect(item.macros.fat_g).toBe(14);
    expect(item.macros.fiber_g).toBe(3);
    expect(item.unit).toBe('g');
    expect(item.confidence).toBe(1);
  });

  it('scales kcal and macros by selected library quantity', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([SAMPLE_ITEM]);
    render(<LibraryTab />);

    await user.click(screen.getByTestId('library-card-pho-id'));
    const quantity = screen.getByTestId('library-quantity-pho-id');
    fireEvent.change(quantity, { target: { value: '4' } });

    await user.click(screen.getByTestId('library-log-selected'));

    const item = useLogFlowStore.getState().confirmationPayload!.items[0]!;
    expect(item).toMatchObject({
      portion: 4,
      kcal: 2080,
      macros: {
        protein_g: 128,
        carbs_g: 192,
        fat_g: 56,
        fiber_g: 12,
      },
    });
  });

  it('CRITICAL R1: single-item Continue CTA forwards library_item_id via libraryItemIds[0]', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([SAMPLE_ITEM]);
    render(<LibraryTab />);

    await user.click(screen.getByTestId('library-card-pho-id'));
    await user.click(screen.getByTestId('library-log-selected'));

    const state = useLogFlowStore.getState();
    // Codex R1 CRITICAL — payload must carry libraryItemIds so the save
    // endpoint receives library_item_id (links the food_entries row to
    // the library re-log row per I12 contract).
    expect(state.confirmationPayload?.libraryItemIds).toEqual(['pho-id']);
  });

  it('CRITICAL R1: multi-item Continue CTA passes [firstId, null, null, ...]', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([
      SAMPLE_ITEM,
      {
        id: 'banh-mi-id',
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
    ]);
    render(<LibraryTab />);

    await user.click(screen.getByTestId('library-card-pho-id'));
    await user.click(screen.getByTestId('library-card-banh-mi-id'));
    await user.click(screen.getByTestId('library-log-selected'));

    const state = useLogFlowStore.getState();
    // Single library_item_id per food_entries row — only the first selected
    // item carries the library_item_id; subsequent items are null. Matches
    // task-4.7.4-output.md's "single-item-only library_item_id semantics"
    // decision (multi-item dedup expansion deferred to Phase 5).
    expect(state.confirmationPayload?.libraryItemIds).toEqual(['pho-id', null]);
  });

  it('multi-item selection passes ALL items in the payload', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([
      SAMPLE_ITEM,
      {
        id: 'banh-mi-id',
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
    ]);
    render(<LibraryTab />);

    await user.click(screen.getByTestId('library-card-pho-id'));
    await user.click(screen.getByTestId('library-card-banh-mi-id'));

    await user.click(screen.getByTestId('library-log-selected'));

    const state = useLogFlowStore.getState();
    expect(state.phase).toBe('confirmation');
    expect(state.confirmationPayload?.items).toHaveLength(2);
    const names = state.confirmationPayload!.items.map((it) => it.name);
    expect(names).toContain('Pho Bo');
    expect(names).toContain('Banh Mi');
  });
});
