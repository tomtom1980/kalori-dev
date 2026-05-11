'use client';

/**
 * `<LibraryClient />` — Task 4.1 sub-step 3 §7.3.
 *
 * Root client island for `/library`. Owns search / filter / sort /
 * selection / optimistic remove-set / dialog open flags. Renders ToolsRail
 * → BulkActionsBar (conditional) → Grid → dialogs (dynamic imports).
 *
 * React 19 APIs used:
 *   - `useDeferredValue(searchQuery)` — raw input remains urgent, derived
 *     filter/sort runs in deferred transition (§18.3).
 *   - `useOptimistic(items, removedReducer)` — optimistic grid state for
 *     delete + merge. Commit resolves via the `useUndoQueueStore` entry's
 *     `commit()` callback (5s window) or immediately for merge.
 *
 * Mutations route through `authPost` (§17 R1 contract) — no local shims.
 */
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useSyncExternalStore,
} from 'react';
import { startTransition, useDeferredValue } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { applyFilter, applySort } from '@/lib/library/filter-sort';
import {
  LIBRARY_FILTERS,
  LIBRARY_SORTS,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/library/types';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

import { BulkActionsBar } from './BulkActionsBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibraryGrid } from './LibraryGrid';
import { LibraryToolsRail } from './LibraryToolsRail';

// Dynamic imports keep both dialogs OUT of the initial /library client
// bundle. Hover on the respective action button primes the chunk; open
// swaps in the module. `loading: () => null` because the Radix Dialog
// overlay + focus transition happens after the chunk settles — no
// skeleton required.
const BulkDeleteConfirmDialog = dynamic(
  () => import('./BulkDeleteConfirmDialog').then((m) => m.BulkDeleteConfirmDialog),
  { ssr: false, loading: () => null },
);
const MergeDuplicatesDialog = dynamic(
  () => import('./MergeDuplicatesDialog').then((m) => m.MergeDuplicatesDialog),
  { ssr: false, loading: () => null },
);

const FILTER_STORAGE_KEY = 'library:filter';
const SORT_STORAGE_KEY = 'library:sort';
const LIBRARY_PAGE_SIZE = 10;

function readPersisted<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

// Task 4.1 Phase 3 fix (P3-bug-3): `useSyncExternalStore` with
// `getServerSnapshot = () => fallback` is React 19's idiom for "read a
// client-only value while safe across SSR" — the snapshot function runs
// only on the client, the server sees the fallback, and the store
// subscription hook cleanly separates "render" from "sessionStorage".
// This avoids the `react-hooks/set-state-in-effect` lint that a
// post-mount `useEffect(() => setState(...))` triggers and prevents
// hydration-mismatch warnings in dev.
function subscribeSession(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

function usePersistedSelection<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribeSession,
    () => readPersisted<T>(key, allowed, fallback),
    () => fallback,
  );
  const setValue = useCallback(
    (next: T) => {
      if (typeof window === 'undefined') return;
      try {
        window.sessionStorage.setItem(key, next);
        // Notify other subscribers in the same tab (storage events don't
        // fire within the originating tab, so dispatch a synthetic one).
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: next }));
      } catch {
        /* ignore quota */
      }
    },
    [key],
  );
  return [value, setValue];
}

export interface LibraryClientProps {
  initial: LibraryItem[];
  uid: string;
}

interface OptimisticState {
  removedIds: ReadonlySet<string>;
  mergeOverrides: ReadonlyMap<string, LibraryItem>;
}

const INITIAL_OPTIMISTIC: OptimisticState = {
  removedIds: new Set<string>(),
  mergeOverrides: new Map<string, LibraryItem>(),
};

type OptimisticAction =
  | { type: 'remove'; ids: string[] }
  | { type: 'restore'; ids: string[] }
  | { type: 'merge'; loserId: string; winner: LibraryItem };

function visiblePageNumbers(currentPage: number, pageCount: number): number[] {
  const maxButtons = 5;
  if (pageCount <= maxButtons) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const start = Math.min(Math.max(1, currentPage - 2), pageCount - maxButtons + 1);
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

function optimisticReducer(state: OptimisticState, action: OptimisticAction): OptimisticState {
  switch (action.type) {
    case 'remove': {
      const next = new Set(state.removedIds);
      for (const id of action.ids) next.add(id);
      return { ...state, removedIds: next };
    }
    case 'restore': {
      const next = new Set(state.removedIds);
      for (const id of action.ids) next.delete(id);
      return { ...state, removedIds: next };
    }
    case 'merge': {
      const nextIds = new Set(state.removedIds);
      nextIds.add(action.loserId);
      const nextOverrides = new Map(state.mergeOverrides);
      nextOverrides.set(action.winner.id, action.winner);
      return { removedIds: nextIds, mergeOverrides: nextOverrides };
    }
  }
}

export function LibraryClient({ initial }: LibraryClientProps) {
  const router = useRouter();

  // --- Search state (urgent input + deferred derivation) ---
  const [rawQuery, setRawQuery] = useState('');
  const deferredQuery = useDeferredValue(rawQuery);

  // --- Filter + Sort — sessionStorage-persisted per Q5 ---
  // Task 4.1 Phase 3 fix (P3-bug-3): `useSyncExternalStore` avoids the
  // SSR-mismatch warning previously caused by a `useState(() =>
  // readPersisted(...))` lazy initializer. Server renders the fallback;
  // client post-hydration reads the actual sessionStorage value. Writes
  // dispatch a synthetic 'storage' event so other subscribers in the
  // same tab stay in sync.
  const [filter, setFilter] = usePersistedSelection<LibraryFilter>(
    FILTER_STORAGE_KEY,
    LIBRARY_FILTERS,
    'all',
  );
  const [sort, setSort] = usePersistedSelection<LibrarySort>(
    SORT_STORAGE_KEY,
    LIBRARY_SORTS,
    'most-logged',
  );
  const pageResetKey = `${deferredQuery}\u0000${filter}\u0000${sort}`;
  const [pageState, setPageState] = useState(() => ({ key: pageResetKey, page: 1 }));

  // --- Selection + mode ---
  const [selectMode, setSelectMode] = useState(false);
  const selectedIds = useLibrarySelectionStore((s) => s.ids);
  const toggleSelected = useLibrarySelectionStore((s) => s.toggle);
  const clearSelected = useLibrarySelectionStore((s) => s.clear);

  // --- Dialog open flags ---
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  // --- Optimistic state (removed ids + merge overrides) ---
  const [optimisticState, applyOptimistic] = useOptimistic(INITIAL_OPTIMISTIC, optimisticReducer);

  // Derived items after merge overrides + optimistic removed mask.
  const baseItems = useMemo(() => {
    if (optimisticState.mergeOverrides.size === 0) return initial;
    return initial.map((it) => optimisticState.mergeOverrides.get(it.id) ?? it);
  }, [initial, optimisticState.mergeOverrides]);

  // Freeze `nowMs` at mount for the `this-week` filter threshold via
  // `useState` lazy initializer — passes the `react-hooks/purity` check
  // (initializer runs exactly once) and doesn't re-compute on re-render.
  // Any full-hour refresh would require reloading the route anyway.
  const [nowMs] = useState(() => Date.now());
  const filteredItems = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    const filtered = applyFilter(baseItems, filter, normalized, nowMs);
    return applySort(filtered, sort);
  }, [baseItems, filter, sort, deferredQuery, nowMs]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / LIBRARY_PAGE_SIZE));
  const currentPage = pageState.key === pageResetKey ? Math.min(pageState.page, pageCount) : 1;
  const visibleItems = useMemo(() => {
    const start = (currentPage - 1) * LIBRARY_PAGE_SIZE;
    return filteredItems.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [filteredItems, currentPage]);
  const paginationPages = useMemo(
    () => visiblePageNumbers(currentPage, pageCount),
    [currentPage, pageCount],
  );

  // `+K hidden` — selection entries outside the visible result set.
  const hiddenSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const visibleIds = new Set(visibleItems.map((i) => i.id));
    let hidden = 0;
    for (const id of selectedIds) if (!visibleIds.has(id)) hidden += 1;
    return hidden;
  }, [selectedIds, visibleItems]);

  // --- Callbacks ---
  const onActivate = useCallback(() => {
    // FoodDetail overlay arrives in a later task (4.1 Phase 3+) — no-op for now.
  }, []);

  // Task 4.1 Phase 3 fix (P3-bug-4): previously called `clearSelected()`
  // inside the `setSelectMode((prev) => …)` functional updater, which
  // runs during React's render phase. Zustand `set()` inside render
  // notifies every subscriber synchronously, triggering a "Cannot update
  // a component while rendering" warning. Reading `selectMode` from deps
  // and calling `clear()` outside the updater runs cleanly in event
  // handler scope.
  const onToggleSelectMode = useCallback(() => {
    if (selectMode) clearSelected();
    setSelectMode((prev) => !prev);
  }, [selectMode, clearSelected]);

  const onToggleSelect = useCallback(
    (id: string) => {
      toggleSelected(id);
    },
    [toggleSelected],
  );

  const cancelBulk = useCallback(() => {
    clearSelected();
    setSelectMode(false);
  }, [clearSelected]);

  const preloadMerge = useCallback(() => {
    void import('./MergeDuplicatesDialog');
  }, []);
  const preloadBulkDelete = useCallback(() => {
    void import('./BulkDeleteConfirmDialog');
  }, []);

  // --- Bulk delete (optimistic + undo toast reuse) ---
  const pushToast = useUndoQueueStore((s) => s.pushToast);
  // IF-2 (Codex adversarial round 1): `bulkConfirm` now returns a
  // discriminated union `{ ok: true } | { ok: false; error }`. The
  // BulkDeleteConfirmDialog uses this to decide whether to close
  // itself (ok=true) or stay open + render an inline role=alert banner
  // with the error message (ok=false). Prior behavior swallowed
  // failures, returned void, and left the dialog to close with no
  // indication that the mutation failed — a silent failure path.
  const bulkConfirm = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return { ok: true };
    const deleteClientIds = ids.map(() => crypto.randomUUID());
    const itemsSnapshot = baseItems.filter((i) => ids.includes(i.id));
    const clientIdsForUndo = itemsSnapshot.map((i) => i.client_id);

    // Optimistic removal — must be inside startTransition per React 19 rules.
    startTransition(() => {
      applyOptimistic({ type: 'remove', ids });
    });

    try {
      await authPost<{ deleted_count: number; replayed?: boolean }>('/api/library/bulk-delete', {
        ids,
        delete_client_ids: deleteClientIds,
      });
      clearSelected();
      setSelectMode(false);
      // Task 4.1 Phase 3 fix (P3-bug-1): optimistic `removedIds` decays
      // once authPost resolves (useOptimistic contract). Call
      // `router.refresh()` so the RSC tree refetches `fetchLibraryPage`
      // and the `initial` prop drops the tombstoned rows — otherwise the
      // grid visually un-deletes while the toast is still live.
      router.refresh();
      // Push undo toast — reuse existing `useUndoQueueStore` primitive.
      const toastClientId =
        typeof crypto !== 'undefined' ? crypto.randomUUID() : `toast-${Date.now()}`;
      pushToast({
        clientId: toastClientId,
        kind: 'deleted',
        description: t.library.bulkDeleteToast.replace('{N}', String(ids.length)),
        serverRowId: null,
        commit: async () => {
          // Commit = do nothing; the server already tombstoned + sweep will
          // hard-delete past the 5s window.
        },
        revert: async () => {
          // Revert — call undo endpoint with the ORIGINAL row client_ids.
          try {
            await authPost('/api/library/bulk-delete/undo', {
              client_ids: clientIdsForUndo,
            });
            startTransition(() => {
              applyOptimistic({ type: 'restore', ids });
            });
            // Refresh so the server-side active list re-hydrates the
            // restored rows.
            router.refresh();
          } catch {
            // Best-effort — the tombstone sweep window is narrow.
          }
        },
      });
      return { ok: true };
    } catch (err) {
      // Revert optimistic on error (unless the interceptor already redirected).
      if (err instanceof SessionExpiredError) {
        // Interceptor redirected — dialog will unmount with the route.
        // Return ok=true so we don't flash an error banner during the
        // unmount.
        return { ok: true };
      }
      startTransition(() => {
        applyOptimistic({ type: 'restore', ids });
      });
      return { ok: false, error: t.library.bulkDeleteErrorBanner };
    }
  }, [applyOptimistic, baseItems, clearSelected, pushToast, router, selectedIds]);

  // --- Merge handler ---
  const mergePair = useMemo<readonly [LibraryItem, LibraryItem] | null>(() => {
    if (selectedIds.size !== 2) return null;
    const ids = Array.from(selectedIds);
    const a = baseItems.find((i) => i.id === ids[0]);
    const b = baseItems.find((i) => i.id === ids[1]);
    if (!a || !b) return null;
    return [a, b] as const;
  }, [selectedIds, baseItems]);

  const onMergeSuccess = useCallback(
    // IF-1 (Codex adversarial round 1): `mergedWinner` is the RPC's
    // returned winner row (summed log_count, max last_used_at, merged
    // fields). Prior behavior passed the pre-merge local `winner` which
    // caused the optimistic grid to show stale data until
    // `router.refresh()` resolved. Forwarding the RPC response keeps the
    // grid consistent from the moment the dialog closes.
    (mergedWinner: LibraryItem, loser: LibraryItem) => {
      startTransition(() => {
        applyOptimistic({ type: 'merge', loserId: loser.id, winner: mergedWinner });
      });
      clearSelected();
      setSelectMode(false);
      // Task 4.1 Phase 3 fix (P3-bug-1): `useOptimistic` merge overrides
      // decay once the action completes. Refresh the RSC tree so the
      // server-side `initial` prop reflects the merged winner + dropped
      // loser.
      router.refresh();
    },
    [applyOptimistic, clearSelected, router],
  );

  // --- Clear filters helper (for filtered-zero empty state) ---
  const clearFilters = useCallback(() => {
    setRawQuery('');
    setFilter('all');
  }, [setFilter]);

  // --- Route unmount: clear selection state ---
  useEffect(() => {
    return () => {
      clearSelected();
    };
  }, [clearSelected]);

  // Task 4.1 Phase 3 fix (P3-bug-6a): keyboard shortcuts that must work
  // at the page scope (not just when the BulkActionsBar is mounted):
  //   - Cmd/Ctrl + A in select mode → select every visible (filtered)
  //     card. Reads `visibleItems` snapshot so the filter/sort state
  //     decides the selection universe.
  //   - Standalone Delete / Backspace in select mode with ≥1 selected
  //     opens the bulk-delete confirm dialog. (This also covers the
  //     ≥2-threshold F2 path where the bar's own handler isn't mounted
  //     at N=1.)
  // IME-safe + input-safe guards mirror SearchBar / BulkActionsBar.
  const selectAllVisible = useLibrarySelectionStore((s) => s.selectAll);
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!selectMode) return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (ev.isComposing || ev.keyCode === 229) return;

      const isSelectAll =
        (ev.ctrlKey || ev.metaKey) &&
        !ev.altKey &&
        !ev.shiftKey &&
        (ev.key === 'a' || ev.key === 'A');
      if (isSelectAll) {
        ev.preventDefault();
        selectAllVisible(visibleItems.map((i) => i.id));
        return;
      }

      // Standalone Delete/Backspace when bar is NOT mounted (N < 2).
      if (
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        !ev.altKey &&
        !ev.shiftKey
      ) {
        if (selectedIds.size >= 1 && selectedIds.size < 2) {
          ev.preventDefault();
          setBulkDeleteOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectMode, visibleItems, selectAllVisible, selectedIds]);

  // Task 4.1 Phase 3 fix (C2): sr-only live region announcing select
  // mode + selection count changes (SC 4.1.3 Status Messages). The bar's
  // `role="region"` alone does NOT announce; an aria-live polite status
  // region does. Empty string when inactive so the region is not spoken
  // on mount.
  const selectionAnnouncement = selectMode
    ? selectedIds.size === 0
      ? t.library.selectionModeEntered
      : t.library.selectionCountAnnouncement.replace('{N}', String(selectedIds.size))
    : '';

  return (
    <main id="library-main" className="kalori-library-main">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="library-selection-announcement"
      >
        {selectionAnnouncement}
      </div>
      <LibraryToolsRail
        search={rawQuery}
        onSearchChange={setRawQuery}
        resultsCount={filteredItems.length}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        selectMode={selectMode}
        onToggleSelectMode={onToggleSelectMode}
      />

      {/* Task 4.1 Phase 3 fix (F2): Phase 1 design-lead §6 + reconciled
          §7.12 both state the bar materializes at N≥2. Previous N≥1 check
          surfaced a confusing "MERGE disabled / BULK DELETE enabled"
          state for single-item selection. Single-item delete will route
          through the context menu (deferred pre-FoodDetail). */}
      {selectMode && selectedIds.size >= 2 ? (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          hiddenCount={hiddenSelectedCount}
          onMerge={() => setMergeOpen(true)}
          onBulkDelete={() => setBulkDeleteOpen(true)}
          onCancel={cancelBulk}
          onMergeHoverPreload={preloadMerge}
          onBulkDeleteHoverPreload={preloadBulkDelete}
        />
      ) : null}

      <LibraryGrid
        items={visibleItems}
        removedIds={optimisticState.removedIds}
        selectMode={selectMode}
        onActivate={onActivate}
        onToggleSelect={onToggleSelect}
        renderEmpty={() =>
          rawQuery || filter !== 'all' ? (
            <LibraryEmptyState kind="filtered-zero" onReset={clearFilters} />
          ) : (
            <LibraryEmptyState kind="first-time" />
          )
        }
      />

      {pageCount > 1 ? (
        <nav
          className="kalori-library-pagination"
          aria-label={t.library.paginationLabel}
          data-testid="library-pagination"
        >
          <button
            type="button"
            className="kalori-library-pagination-btn"
            onClick={() => {
              if (currentPage === 1) return;
              setPageState({ key: pageResetKey, page: Math.max(1, currentPage - 1) });
            }}
            aria-disabled={currentPage === 1 ? 'true' : 'false'}
            data-testid="library-pagination-prev"
          >
            {t.library.paginationPrevious}
          </button>
          <div className="kalori-library-pagination-pages">
            {paginationPages.map((pageNumber) => {
              const isCurrent = pageNumber === currentPage;
              return (
                <button
                  key={pageNumber}
                  type="button"
                  className="kalori-library-pagination-page"
                  onClick={() => setPageState({ key: pageResetKey, page: pageNumber })}
                  aria-current={isCurrent ? 'page' : undefined}
                  data-testid={`library-pagination-page-${pageNumber}`}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="kalori-library-pagination-btn"
            onClick={() => {
              if (currentPage === pageCount) return;
              setPageState({ key: pageResetKey, page: Math.min(pageCount, currentPage + 1) });
            }}
            aria-disabled={currentPage === pageCount ? 'true' : 'false'}
            data-testid="library-pagination-next"
          >
            {t.library.paginationNext}
          </button>
        </nav>
      ) : null}

      {bulkDeleteOpen ? (
        <BulkDeleteConfirmDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          previewNames={Array.from(selectedIds)
            .map((id) => baseItems.find((i) => i.id === id)?.display_name ?? '')
            .filter(Boolean)}
          totalCount={selectedIds.size}
          onConfirm={bulkConfirm}
        />
      ) : null}

      {mergeOpen && mergePair ? (
        <MergeDuplicatesDialog
          open={mergeOpen}
          a={mergePair[0]}
          b={mergePair[1]}
          onOpenChange={setMergeOpen}
          onSuccess={onMergeSuccess}
        />
      ) : null}
    </main>
  );
}

export default LibraryClient;
