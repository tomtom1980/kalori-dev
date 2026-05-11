'use client';

/**
 * <LogPageClient /> — the client island that opens the log-flow modal
 * on `/log` direct-nav.
 *
 * Task 4.2 backfill: seeds the LogFlow store's `activeTab` + initial
 * `librarySelection` from `?tab=library&item={id}` search params.
 *
 * Task 4.7.4 wiring:
 *   - Accepts a server-hydrated `libraryItems` array and pushes it into
 *     the store via `setLibraryItems`, so `<LibraryTab />` renders rows
 *     without prop drilling through `<LogFlowTabs />`.
 *   - Accepts an optional `deepLinkItem` (server-resolved via
 *     `getLibraryItemById`). When present, calls `enterConfirmation`
 *     directly instead of seeding selection — the user lands on the
 *     pre-populated ConfirmationScreen, not the empty library tab.
 *   - When `deepLinkItem === null` AND `deepLinkError !== null`, opens
 *     the modal on the library tab with the existing items list (graceful
 *     degrade for tombstoned / RLS-missed deep links).
 *
 * C1 fix (Codex round 1): this component NO LONGER renders its own
 * `<LogFlowModal />`. The chrome-level `<LogFlowModalMount />` mounted
 * by `<NavShell />` owns all modal rendering — and it subscribes to the
 * same `useLogFlowStore.isOpen` that we flip here.
 */
import { useEffect } from 'react';

import { t } from '@/lib/i18n/en';
import type { ParsedItemT } from '@/lib/ai/schemas';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLogFlowStore, type LogLibraryItem, type LogTab } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

export interface LogPageClientProps {
  initialTab?: LogTab | null;
  initialItemId?: string | null;
  /**
   * Task 4.2 round 1 I2 fix — the FoodDetail "Log this now" deep link
   * can carry an explicit quantity (`&quantity=150`). Respect it when
   * seeding the library selection; fall back to 1 when absent or
   * non-positive.
   */
  initialQuantity?: number | null;
  /**
   * Task 4.7.4 — server-hydrated library list. When provided, pushed
   * into the store so `<LibraryTab />` can render the grid directly.
   */
  libraryItems?: LogLibraryItem[];
  /**
   * Task 4.7.4 — server-resolved deep-link item (`?item=<id>`). When
   * non-null, the page enters ConfirmationScreen directly with the item
   * pre-loaded. When null + `deepLinkError` set, the modal opens on the
   * Library tab gracefully (tombstoned / RLS miss path).
   */
  deepLinkItem?: LibraryItem | null;
  /**
   * Task 4.7.4 — surface a deep-link resolution error (e.g. 'not_found').
   * Currently only used to differentiate the "no deep-link asked" case
   * from the "asked but missing" case. Inline UI surfacing is deferred
   * to a follow-up — for now the user lands on the Library tab and sees
   * their other items.
   */
  deepLinkError?: string | null;
}

/**
 * Convert a server-resolved `LibraryItem` into a single-item ParsedItemT
 * payload for `enterConfirmation`. Quantity falls back through:
 * URL-provided → item.default_portion → 1.
 */
function libraryItemToParsedItem(item: LibraryItem, initialQuantity: number | null): ParsedItemT {
  const portion =
    typeof initialQuantity === 'number' && Number.isFinite(initialQuantity) && initialQuantity > 0
      ? initialQuantity
      : typeof item.default_portion === 'number' && item.default_portion > 0
        ? item.default_portion
        : 1;
  const macros = item.nutrition.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0 };
  return {
    name: item.display_name,
    portion,
    unit: item.default_unit ?? 'g',
    kcal: item.nutrition.kcal,
    macros: {
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      fiber_g: macros.fiber_g ?? 0,
    },
    micros: item.nutrition.micros ?? {},
    confidence: 1,
  };
}

export function LogPageClient({
  initialTab = null,
  initialItemId = null,
  initialQuantity = null,
  libraryItems,
  deepLinkItem,
  deepLinkError = null,
}: LogPageClientProps) {
  useEffect(() => {
    const state = useLogFlowStore.getState();

    // Task 4.7.4 — hydrate library list into the store first so the
    // Library tab renders with content even if the user never deep-linked.
    if (libraryItems !== undefined) {
      state.setLibraryItems(libraryItems);
    }

    // Apply tab hint first so the modal opens on the correct panel.
    if (initialTab && state.activeTab !== initialTab) {
      state.setActiveTab(initialTab);
    }

    // Task 4.7.4 — deep-link confirmation entry. When the server resolved
    // the targeted library item, skip the tab UI entirely.
    if (deepLinkItem && initialItemId && deepLinkItem.id === initialItemId) {
      const parsed = libraryItemToParsedItem(deepLinkItem, initialQuantity);
      state.enterConfirmation({
        source: 'library',
        tab: 'library',
        items: [parsed],
        reasoning: null,
        dedupMatch: null,
        // Codex Round 1 CRITICAL — forward the library row id so the save
        // endpoint persists `library_item_id` and links the food_entries
        // row to the source library row (I12 contract).
        libraryItemIds: [deepLinkItem.id],
      });
      if (!state.isOpen) state.openModal();
      return;
    }

    // Deep-link asked but server returned null (tombstoned / RLS miss /
    // unauthenticated). Land on the library tab gracefully — do NOT seed
    // selection (the user can pick from their other items).
    const deepLinkAttempted = initialItemId !== null && deepLinkError !== null;

    // Codex Round 1 IMPROVEMENT — the previous behaviour silently fell
    // through to the empty library tab; users who deep-linked a deleted
    // item had no idea why their item didn't open. Push a no-undo toast
    // (`kind: 'delete-failed'` already hides the UNDO button) so the
    // failure is user-visible.
    if (deepLinkAttempted) {
      const toastClientId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `toast-${Date.now()}`;
      useUndoQueueStore.getState().pushToast({
        clientId: toastClientId,
        kind: 'delete-failed',
        description: t.log.libraryDeepLinkNotFound,
        serverRowId: null,
        commit: async () => {},
        revert: async () => {},
      });
    }

    // Legacy fallback (Task 4.2): seed library selection if the caller
    // did not opt into the deep-link contract.
    if (
      !deepLinkAttempted &&
      deepLinkItem === undefined &&
      initialItemId &&
      (initialTab === 'library' || state.activeTab === 'library')
    ) {
      const existing = state.librarySelection.some((s) => s.itemId === initialItemId);
      if (!existing) {
        const quantity =
          typeof initialQuantity === 'number' &&
          Number.isFinite(initialQuantity) &&
          initialQuantity > 0
            ? initialQuantity
            : 1;
        state.setLibrarySelection([...state.librarySelection, { itemId: initialItemId, quantity }]);
      }
    }

    if (!state.isOpen) state.openModal();
  }, [initialTab, initialItemId, initialQuantity, libraryItems, deepLinkItem, deepLinkError]);

  // No modal rendering here — NavShell's <LogFlowModalMount /> owns that.
  return null;
}

export default LogPageClient;
