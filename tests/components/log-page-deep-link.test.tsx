/**
 * Task 4.7.4 (TDD-RED → GREEN) — Deep-link `?tab=library&item=<id>` skips
 * straight to ConfirmationScreen with the targeted library item pre-loaded.
 *
 * Today: LogPageClient seeds librarySelection but never enters confirmation,
 * so the user sees the empty Library tab and has to click again.
 *
 * After Task 4.7.4: when the page provides a `deepLinkItem` prop (resolved
 * server-side via `getLibraryItemById`), LogPageClient calls
 * `enterConfirmation` directly so phase === 'confirmation' on mount.
 */
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LogPageClient } from '@/app/(app)/log/_components/LogPageClient';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

const MOCK_DEEP_LINK_ITEM: LibraryItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 350,
  default_unit: 'g',
  nutrition: {
    kcal: 520,
    macros: { protein_g: 32, carbs_g: 48, fat_g: 14, fiber_g: 3 },
    micros: {},
  },
  thumbnail_url: null,
  log_count: 12,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-01-01T00:00:00Z',
};

describe('<LogPageClient /> — deep-link confirmation (Task 4.7.4)', () => {
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('deepLinkItem triggers immediate confirmation entry with library payload', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={350}
        libraryItems={[]}
        deepLinkItem={MOCK_DEEP_LINK_ITEM}
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.phase).toBe('confirmation');
    expect(state.confirmationPayload?.source).toBe('library');
    expect(state.confirmationPayload?.items).toHaveLength(1);
    const item = state.confirmationPayload!.items[0]!;
    expect(item.name).toBe('Pho Bo');
    expect(item.portion).toBe(350);
    expect(item.unit).toBe('g');
    expect(item.kcal).toBe(520);
    expect(item.macros.protein_g).toBe(32);
    expect(item.macros.fiber_g).toBe(3);
    expect(state.isOpen).toBe(true);
  });

  it('CRITICAL R1: deep-link path forwards libraryItemIds=[deepLinkItem.id]', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={350}
        libraryItems={[]}
        deepLinkItem={MOCK_DEEP_LINK_ITEM}
      />,
    );
    const state = useLogFlowStore.getState();
    // Codex R1 CRITICAL — deep-link path must include libraryItemIds so the
    // save endpoint receives library_item_id and links the food_entries row
    // to the source library row (I12 contract).
    expect(state.confirmationPayload?.libraryItemIds).toEqual([MOCK_DEEP_LINK_ITEM.id]);
  });

  it('deep-link custom quantity scales nutrition from the saved default serving', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={1400}
        libraryItems={[]}
        deepLinkItem={MOCK_DEEP_LINK_ITEM}
      />,
    );

    const state = useLogFlowStore.getState();
    const item = state.confirmationPayload!.items[0]!;
    expect(item.portion).toBe(1400);
    expect(item.kcal).toBe(2080);
    expect(item.macros).toMatchObject({
      protein_g: 128,
      carbs_g: 192,
      fat_g: 56,
      fiber_g: 12,
    });
    expect(state.confirmationPayload?.libraryItemIds).toEqual([MOCK_DEEP_LINK_ITEM.id]);
  });

  it('null deepLinkItem (tombstoned/RLS miss) falls through to library tab WITHOUT crash', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={350}
        libraryItems={[]}
        deepLinkItem={null}
        deepLinkError="not_found"
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.phase).toBe('entry');
    expect(state.activeTab).toBe('library');
    expect(state.isOpen).toBe(true);
  });

  it('IMPROVEMENT R1: deepLinkError surfaces a user-visible toast', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={350}
        libraryItems={[]}
        deepLinkItem={null}
        deepLinkError="not_found"
      />,
    );
    // Codex R1 IMPROVEMENT — silent fall-through hides why the deep-link
    // didn't take. The `deepLinkError` branch must push a no-undo toast
    // explaining the failure to the user.
    const stack = useUndoQueueStore.getState().stack;
    expect(stack.length).toBeGreaterThan(0);
    const toast = stack[stack.length - 1]!;
    expect(toast.kind).toBe('delete-failed');
    expect(toast.description).toMatch(/library item|not found|deleted/i);
  });

  it('IMPROVEMENT R1: success path does NOT push a deep-link error toast', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={350}
        libraryItems={[]}
        deepLinkItem={MOCK_DEEP_LINK_ITEM}
      />,
    );
    expect(useUndoQueueStore.getState().stack).toHaveLength(0);
  });

  it('without any deepLink props, falls back to legacy hydration (selection seeding)', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={MOCK_DEEP_LINK_ITEM.id}
        initialQuantity={150}
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.phase).toBe('entry');
    expect(state.librarySelection).toEqual([{ itemId: MOCK_DEEP_LINK_ITEM.id, quantity: 150 }]);
  });

  it('libraryItems prop hydrates the store via setLibraryItems', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId={null}
        initialQuantity={null}
        libraryItems={[
          {
            id: 'item-1',
            name: 'Sample',
            kcal: 100,
            lastUsedIso: null,
            logCount: 1,
            proteinG: 5,
            carbsG: 10,
            fatG: 2,
            fiberG: 0,
            unit: 'g',
          },
        ]}
        deepLinkItem={null}
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.libraryItems).toHaveLength(1);
    expect(state.libraryItems[0]?.name).toBe('Sample');
  });
});
