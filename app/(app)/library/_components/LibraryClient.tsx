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
import * as Dialog from '@radix-ui/react-dialog';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { startTransition, useDeferredValue } from 'react';

import { useDuplicateLogConfirm } from '@/components/primitives/DuplicateLogConfirmDialog';
import { PopoverInline } from '@/components/primitives/PopoverInline';
import {
  authFetch,
  authPost,
  AuthApiError,
  SessionExpiredError,
} from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { isItemPendingSketch } from '@/lib/library/sketch-pending';
import { applyFilter, applySort } from '@/lib/library/filter-sort';
import {
  LIBRARY_FILTERS,
  LIBRARY_SORTS,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/library/types';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { normalizeName } from '@/lib/text/normalize';

import { BulkActionsBar } from './BulkActionsBar';
import { LibraryCreateRecipeDialog } from './LibraryCreateRecipeDialog';
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

// Scroll back to the top of the page on pagination change so the new
// page lands in the viewport without manual scrolling. Honors the user's
// reduced-motion preference via the browser default.
function scrollToLibraryTop(): void {
  if (typeof window === 'undefined') return;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}

function visiblePageNumbers(currentPage: number, pageCount: number): number[] {
  const maxButtons = 5;
  if (pageCount <= maxButtons) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const start = Math.min(Math.max(1, currentPage - 2), pageCount - maxButtons + 1);
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

function isDuplicateLogError(err: unknown): boolean {
  return (
    err instanceof AuthApiError &&
    err.status === 409 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { error?: unknown }).error === 'duplicate_food_entry'
  );
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

// Polling cadence for live sketch updates. While any item in `initial`
// is within the PENDING_SKETCH_WINDOW_MS window (60s from created_at)
// AND has no thumbnail yet, we re-fetch the RSC tree every 2s so the
// sketch lands in the grid without the user reloading. The window
// expires automatically on the data side (isItemPendingSketch returns
// false past 60s), so polling stops on its own — no max-attempt count
// needed.
const SKETCH_POLL_INTERVAL_MS = 2_000;

export function LibraryClient({ initial }: LibraryClientProps) {
  const router = useRouter();

  // Live sketch update: poll the RSC tree while any item is still in
  // the "sketch is being generated" window. Covers both entry paths —
  // LibraryAddDialog manual add AND dashboard parse + save-to-library —
  // and works identically on desktop and mobile. The effect re-runs
  // whenever `initial` changes (router.refresh delivers a new payload),
  // so polling self-terminates the moment all pending sketches resolve.
  useEffect(() => {
    const now = Date.now();
    if (!initial.some((i) => isItemPendingSketch(i, now))) return;
    const id = window.setInterval(() => router.refresh(), SKETCH_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [initial, router]);

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
    // Bug 7 — Default sort is alphabetical (Name A-Z) on first visit /
    // cleared session / SSR. Persisted sessionStorage value still wins
    // for returning users.
    'name-asc',
  );
  const pageResetKey = `${deferredQuery}\u0000${filter}\u0000${sort}`;
  const [pageState, setPageState] = useState(() => ({ key: pageResetKey, page: 1 }));
  const [addQuotaChecking, setAddQuotaChecking] = useState(false);

  // --- Selection + mode ---
  const [selectMode, setSelectMode] = useState(false);
  const selectedIds = useLibrarySelectionStore((s) => s.ids);
  const toggleSelected = useLibrarySelectionStore((s) => s.toggle);
  const clearSelected = useLibrarySelectionStore((s) => s.clear);

  // --- Dialog open flags ---
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  // Bug 2 (library bulk overhaul 2026-05-17) — bulk log meal-slot picker.
  // The bar is gated at N>=2 by the parent render check, so this anchor
  // ref only matters once the user has actually selected items. Mirrors
  // the single-item FoodDetail Log Now picker pattern (PopoverInline +
  // 5 meal buttons). Click on a meal kicks off N parallel POSTs to
  // /api/library/[id]/log-now.
  const bulkLogAnchorRef = useRef<HTMLDivElement | null>(null);
  const [bulkLogPickerOpen, setBulkLogPickerOpen] = useState(false);
  const [bulkLogInFlight, setBulkLogInFlight] = useState(false);
  // Quick log per-card — kebab menu "Quick log" sets this target id, which
  // mounts a meal-slot picker dialog. On meal pick we POST to the same
  // /api/library/[id]/log-now route the bulk-log flow uses.
  const [quickLogTargetId, setQuickLogTargetId] = useState<string | null>(null);
  const [createRecipeTargetId, setCreateRecipeTargetId] = useState<string | null>(null);
  const [quickLogInFlight, setQuickLogInFlight] = useState(false);
  const [quickLogPendingMeal, setQuickLogPendingMeal] = useState<
    'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | null
  >(null);
  const { confirm: confirmDuplicateLog, dialog: duplicateLogConfirmDialog } =
    useDuplicateLogConfirm(t.library.detail.duplicateLogConfirmMessage);
  // Add Item now routes through the chrome-level LogFlowModal (AI-parsed
  // text/photo → editable confirmation → save to library), mirroring the
  // dashboard's per-meal-column add affordance. The modal lives in
  // NavShell so we just trigger it via the store — no local state needed.
  const openLogModal = useLogFlowStore((s) => s.openModal);
  const onAddLibraryItem = useCallback(async () => {
    if (addQuotaChecking) return;
    setAddQuotaChecking(true);
    try {
      const res = await authFetch('/api/library/quota', { method: 'GET' });
      if (res.ok) {
        const payload = (await res.json()) as { quota?: { exceeded?: boolean } };
        if (payload.quota?.exceeded) {
          useUndoQueueStore.getState().pushToast({
            clientId:
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `library-quota-${Date.now()}`,
            kind: 'delete-failed',
            description: t.library.addItemLimitReached,
            serverRowId: null,
            commit: async () => {},
            revert: async () => {},
          });
          return;
        }
      }
      openLogModal('type', { mode: 'library-only' });
    } finally {
      setAddQuotaChecking(false);
    }
  }, [addQuotaChecking, openLogModal]);

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
    const normalized = normalizeName(deferredQuery);
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
  const goToPage = useCallback(
    (page: number) => {
      setPageState({ key: pageResetKey, page: Math.min(pageCount, Math.max(1, page)) });
      scrollToLibraryTop();
    },
    [pageCount, pageResetKey],
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
  // Bug 2 (library overhaul 2026-05-16) — wrap the route push in
  // `useTransition` so the originating card can render an instant
  // `aria-busy` / `data-pending` cue while the destination's
  // `loading.tsx` skeleton mounts. `navPendingId` is the id of the card
  // currently being navigated TO; only that card paints the cue.
  //
  // Lifecycle: `navPendingId` is set on click, cleared when `navPending`
  // settles back to false (destination loading.tsx has mounted by then).
  // The clear runs inside the same render that `useTransition` flips so
  // we DON'T need a separate effect (`react-hooks/set-state-in-effect`
  // anti-pattern). Storing the id alongside the active transition keeps
  // them in lockstep via a single derived value.
  const [navPending, startNavTransition] = useTransition();
  const [navPendingId, setNavPendingId] = useState<string | null>(null);
  const onActivate = useCallback(
    (item: LibraryItem) => {
      setNavPendingId(item.id);
      startNavTransition(() => {
        router.push(`/library/${item.id}`);
      });
    },
    [router],
  );
  // Derived: surface the id ONLY while the transition is pending. Once
  // React flushes `navPending=false` the renderer treats this as null
  // without a follow-up state write.
  const visiblePendingId = navPending ? navPendingId : null;

  // Bug 3 (library overhaul 2026-05-16) — quick-action menu wiring.
  // Edit navigates with `?mode=edit` query param; the destination
  // `FoodDetail` reads the param, auto-enters edit mode, then strips it
  // via `router.replace`. Delete reuses the existing
  // `BulkDeleteConfirmDialog` substrate by adding the single id to the
  // selection store and opening the dialog (length-1 client_ids pattern
  // per lessons #8).
  const onCardEdit = useCallback(
    (id: string) => {
      setNavPendingId(id);
      startNavTransition(() => {
        router.push(`/library/${id}?mode=edit`);
      });
    },
    [router],
  );
  const onCardDelete = useCallback(
    (id: string) => {
      // Replace whatever was in the selection with just this one id —
      // the dialog reads `selectedIds.size` for `totalCount`. The
      // existing `bulkConfirm` then iterates the set and POSTs a
      // length-1 array.
      clearSelected();
      toggleSelected(id);
      setBulkDeleteOpen(true);
    },
    [clearSelected, toggleSelected],
  );

  // Quick log per-card — opens the meal picker dialog scoped to a single
  // item id. The actual log POST happens inside `performQuickLog` (below
  // pushToast declaration) once the user picks a meal.
  const onCardQuickLog = useCallback((id: string) => {
    setQuickLogTargetId(id);
  }, []);

  const onCardCreateRecipe = useCallback((id: string) => {
    setCreateRecipeTargetId(id);
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
          } catch (undoErr) {
            // Task E.1.1 — F-CODEX-D-R2-03 — surface the structured
            // 409 restore_name_conflict body (introduced by R2-02) so
            // the user can see WHY the undo failed instead of seeing
            // the row silently stay deleted. Other failures stay
            // best-effort (the tombstone sweep window is narrow).
            if (
              undoErr instanceof AuthApiError &&
              undoErr.status === 409 &&
              typeof undoErr.body === 'object' &&
              undoErr.body !== null &&
              (undoErr.body as { error?: string }).error === 'restore_name_conflict'
            ) {
              const conflictToastId =
                typeof crypto !== 'undefined' ? crypto.randomUUID() : `conflict-${Date.now()}`;
              pushToast({
                clientId: conflictToastId,
                kind: 'delete-failed',
                description: t.library.bulkUndoConflictToast,
                serverRowId: null,
                commit: async () => {
                  /* non-undoable. */
                },
                revert: async () => {
                  /* non-undoable. */
                },
              });
            }
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

  // --- Quick log per-card handler ---
  // Single-item sibling of `performBulkLog`. POSTs to the same
  // /api/library/[id]/log-now route the bulk-log flow uses; on success
  // pushes a toast, dismisses the picker dialog, and refreshes RSC so
  // the dashboard + library list pick up the new entry.
  const performQuickLog = useCallback(
    async (itemId: string, mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink') => {
      if (quickLogInFlight) return;
      setQuickLogInFlight(true);
      setQuickLogPendingMeal(mealCategory);
      const itemName = baseItems.find((i) => i.id === itemId)?.display_name ?? '';
      try {
        const payload = {
          client_id: crypto.randomUUID(),
          logged_at: new Date().toISOString(),
          meal_category: mealCategory,
        };
        try {
          await authPost<{ entry: { id: string }; replayed?: boolean }>(
            `/api/library/${itemId}/log-now`,
            payload,
          );
        } catch (err) {
          if (!isDuplicateLogError(err)) throw err;
          const confirmed = await confirmDuplicateLog();
          if (!confirmed) {
            setQuickLogTargetId(null);
            return;
          }
          await authPost<{ entry: { id: string }; replayed?: boolean }>(
            `/api/library/${itemId}/log-now`,
            { ...payload, allow_duplicate: true },
          );
        }
        pushToast({
          clientId: typeof crypto !== 'undefined' ? crypto.randomUUID() : `quick-log-${Date.now()}`,
          kind: 'saved',
          description: t.library.quickLogToastSuccess.replace('{name}', itemName),
          serverRowId: null,
          commit: async () => {
            /* no-op — entry already persisted server-side. */
          },
          revert: async () => {
            /* MVP: no quick-log undo affordance. */
          },
        });
        setQuickLogTargetId(null);
        router.refresh();
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          // Interceptor already redirected; bail silently.
          return;
        }
        pushToast({
          clientId:
            typeof crypto !== 'undefined' ? crypto.randomUUID() : `quick-log-err-${Date.now()}`,
          kind: 'delete-failed',
          description: t.library.quickLogToastError.replace('{name}', itemName),
          serverRowId: null,
          commit: async () => {
            /* non-undoable error surface. */
          },
          revert: async () => {
            /* non-undoable error surface. */
          },
        });
      } finally {
        setQuickLogInFlight(false);
        setQuickLogPendingMeal(null);
      }
    },
    [baseItems, confirmDuplicateLog, pushToast, quickLogInFlight, router],
  );

  // --- Bulk log handler (Bug 2 — 2026-05-17 library bulk overhaul) ---
  // Replaces the prior bulk-merge handler. For each selected library
  // item, fires a separate POST to /api/library/[id]/log-now (the same
  // route the single-item Log Now button hits). Each call carries its
  // own client_id so the server's per-item idempotency layer dedupes
  // any accidental replays. We use `Promise.allSettled` so a single
  // failure doesn't strand the other writes; the toast surfaces the
  // mixed-result count.
  const performBulkLog = useCallback(
    async (mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink') => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (bulkLogInFlight) return;
      setBulkLogInFlight(true);
      setBulkLogPickerOpen(false);

      const loggedAtIso = new Date().toISOString();
      const requests = ids.map((id) => ({
        id,
        payload: {
          client_id: crypto.randomUUID(),
          logged_at: loggedAtIso,
          meal_category: mealCategory,
        },
      }));
      let results = await Promise.allSettled(
        requests.map(({ id, payload }) =>
          authPost<{ entry: { id: string }; replayed?: boolean }>(
            `/api/library/${id}/log-now`,
            payload,
          ),
        ),
      );

      // Bail early on session expiry — the interceptor already redirected,
      // toasts would unmount mid-render.
      if (results.some((r) => r.status === 'rejected' && r.reason instanceof SessionExpiredError)) {
        setBulkLogInFlight(false);
        return;
      }

      const duplicateIndexes = results
        .map((result, index) =>
          result.status === 'rejected' && isDuplicateLogError(result.reason) ? index : -1,
        )
        .filter((index) => index >= 0);

      if (duplicateIndexes.length > 0 && (await confirmDuplicateLog())) {
        const duplicateRetries = await Promise.allSettled(
          duplicateIndexes.map((index) => {
            const request = requests[index]!;
            return authPost<{ entry: { id: string }; replayed?: boolean }>(
              `/api/library/${request.id}/log-now`,
              { ...request.payload, allow_duplicate: true },
            );
          }),
        );

        if (
          duplicateRetries.some(
            (r) => r.status === 'rejected' && r.reason instanceof SessionExpiredError,
          )
        ) {
          setBulkLogInFlight(false);
          return;
        }

        results = results.map((result, index) => {
          const retryIndex = duplicateIndexes.indexOf(index);
          return retryIndex === -1 ? result : duplicateRetries[retryIndex]!;
        });
      }

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      const toastClientId =
        typeof crypto !== 'undefined' ? crypto.randomUUID() : `bulk-log-${Date.now()}`;
      if (failed === 0) {
        pushToast({
          clientId: toastClientId,
          kind: 'saved',
          description: t.library.bulkLogToastSuccess.replace('{N}', String(succeeded)),
          serverRowId: null,
          commit: async () => {
            /* no-op — entries are already persisted server-side. */
          },
          revert: async () => {
            /* MVP: no bulk-log undo affordance. */
          },
        });
      } else {
        pushToast({
          clientId: toastClientId,
          kind: 'delete-failed',
          description: t.library.bulkLogToastError.replace('{N}', String(failed)),
          serverRowId: null,
          commit: async () => {
            /* non-undoable error surface. */
          },
          revert: async () => {
            /* non-undoable error surface. */
          },
        });
      }

      clearSelected();
      setSelectMode(false);
      router.refresh();
      setBulkLogInFlight(false);
    },
    [bulkLogInFlight, clearSelected, confirmDuplicateLog, pushToast, router, selectedIds],
  );

  // --- Merge handler (orphan, retained for older code paths) ---
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
      {/* Add Item action bar. Sits above the tools rail so it's the
          topmost interactive surface on the page. Hidden in selectMode
          so it doesn't compete with the bulk-actions bar for top-bar
          attention. Clicking opens the chrome-level LogFlowModal in
          `library-only` mode: just the Type input (no tabs), then a
          stripped Confirmation surface (no meal slot / time / save-to-
          ledger toggle), then POST /api/library/create — pure library
          insert, no food_entries side effect. */}
      {!selectMode ? (
        <div className="kalori-library-add-actions" data-testid="library-add-actions">
          <button
            type="button"
            className="kalori-library-pill"
            onClick={() => {
              void onAddLibraryItem();
            }}
            disabled={addQuotaChecking}
            aria-busy={addQuotaChecking ? 'true' : undefined}
            aria-label={t.library.addItemAriaLabel}
            data-testid="library-add-button"
          >
            {addQuotaChecking ? (
              <>
                <span aria-hidden="true" className="kalori-log-cta-spinner" />
                {t.library.addItemChecking}
              </>
            ) : (
              t.library.addItemButton
            )}
          </button>
        </div>
      ) : null}

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
        <div ref={bulkLogAnchorRef}>
          <BulkActionsBar
            selectedCount={selectedIds.size}
            hiddenCount={hiddenSelectedCount}
            onBulkLog={() => {
              if (bulkLogInFlight) return;
              setBulkLogPickerOpen(true);
            }}
            onBulkDelete={() => {
              if (bulkLogInFlight) return;
              setBulkDeleteOpen(true);
            }}
            onCancel={cancelBulk}
            onBulkDeleteHoverPreload={preloadBulkDelete}
            busy={bulkLogInFlight}
          />
          <PopoverInline
            open={bulkLogPickerOpen}
            onOpenChange={setBulkLogPickerOpen}
            anchorRef={bulkLogAnchorRef}
            ariaLabel={t.library.bulkLogMealPickerTitle}
            data-testid="library-bulk-log-meal-picker"
          >
            <div
              role="group"
              aria-label={t.library.bulkLogMealPickerTitle}
              aria-busy={bulkLogInFlight ? 'true' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-2)',
                minWidth: 180,
              }}
            >
              {(
                [
                  ['breakfast', t.log.confirmationMealBreakfast],
                  ['lunch', t.log.confirmationMealLunch],
                  ['dinner', t.log.confirmationMealDinner],
                  ['snack', t.log.confirmationMealSnack],
                  ['drink', t.log.confirmationMealDrink],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`library-bulk-log-meal-${key}`}
                  onClick={() => {
                    if (bulkLogInFlight) return;
                    void performBulkLog(key);
                  }}
                  disabled={bulkLogInFlight}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--type-label)',
                    fontWeight: 500,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--color-ivory)',
                    background: 'transparent',
                    border: '1px solid var(--color-rule)',
                    padding: 'var(--spacing-3) var(--spacing-4)',
                    minHeight: 44,
                    cursor: bulkLogInFlight ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: bulkLogInFlight ? 0.6 : 1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </PopoverInline>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <nav
          className="kalori-library-pagination"
          aria-label={t.library.paginationLabel}
          data-testid="library-pagination-top"
        >
          <button
            type="button"
            className="kalori-library-pagination-btn"
            onClick={() => {
              if (currentPage === 1) return;
              goToPage(currentPage - 1);
            }}
            aria-disabled={currentPage === 1 ? 'true' : 'false'}
            data-testid="library-pagination-top-prev"
          >
            {t.library.paginationPrevious}
          </button>
          <div className="kalori-library-pagination-pages">
            {paginationPages.map((pageNumber) => {
              const isCurrent = pageNumber === currentPage;
              return (
                <button
                  key={`top-${pageNumber}`}
                  type="button"
                  className="kalori-library-pagination-page"
                  onClick={() => goToPage(pageNumber)}
                  aria-current={isCurrent ? 'page' : undefined}
                  data-testid={`library-pagination-top-page-${pageNumber}`}
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
              goToPage(currentPage + 1);
            }}
            aria-disabled={currentPage === pageCount ? 'true' : 'false'}
            data-testid="library-pagination-top-next"
          >
            {t.library.paginationNext}
          </button>
        </nav>
      ) : null}

      <LibraryGrid
        items={visibleItems}
        removedIds={optimisticState.removedIds}
        selectMode={selectMode}
        onActivate={onActivate}
        onToggleSelect={onToggleSelect}
        pendingId={visiblePendingId}
        onCardEdit={onCardEdit}
        onCardDelete={onCardDelete}
        onCardQuickLog={onCardQuickLog}
        onCardCreateRecipe={onCardCreateRecipe}
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
              scrollToLibraryTop();
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
                  onClick={() => {
                    setPageState({ key: pageResetKey, page: pageNumber });
                    scrollToLibraryTop();
                  }}
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
              scrollToLibraryTop();
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

      {/* MergeDuplicatesDialog is no longer reachable from the UI (bulk
          MERGE was replaced with bulk LOG on 2026-05-17). Mount removed;
          dialog component + /api/library/merge route remain orphan to
          avoid a 14-file deletion cascade. State + memo for `mergeOpen`
          / `mergePair` / `onMergeSuccess` retained so existing call
          sites / dev tooling that reference them still type-check. */}

      {/* Quick log per-card meal picker — a Radix Dialog that opens when
          a card's kebab "Quick log" item is selected. On meal pick we
          POST to /api/library/[id]/log-now via `performQuickLog`. */}
      {quickLogTargetId !== null ? (
        <QuickLogMealDialog
          open={quickLogTargetId !== null}
          itemName={baseItems.find((i) => i.id === quickLogTargetId)?.display_name ?? ''}
          onOpenChange={(open) => {
            if (!open) setQuickLogTargetId(null);
          }}
          onPick={(meal) => {
            void performQuickLog(quickLogTargetId, meal);
          }}
          disabled={quickLogInFlight}
          pendingMeal={quickLogPendingMeal}
        />
      ) : null}
      {createRecipeTargetId !== null ? (
        <LibraryCreateRecipeDialog
          open={createRecipeTargetId !== null}
          item={baseItems.find((i) => i.id === createRecipeTargetId) ?? null}
          onOpenChange={(open) => {
            if (!open) setCreateRecipeTargetId(null);
          }}
        />
      ) : null}
      {duplicateLogConfirmDialog}
    </main>
  );
}

/**
 * Inline meal picker for the per-card "Quick log" action. Renders a
 * Radix Dialog with 5 meal-slot buttons. Mirrors the bulk-log meal
 * picker UX but anchored as a centered dialog (cards don't have a
 * stable anchor outside the kebab trigger, which closes on selection).
 */
function QuickLogMealDialog({
  open,
  itemName,
  onOpenChange,
  onPick,
  disabled,
  pendingMeal,
}: {
  open: boolean;
  itemName: string;
  onOpenChange: (open: boolean) => void;
  onPick: (meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink') => void;
  disabled: boolean;
  pendingMeal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | null;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kalori-library-dialog-overlay" />
        <Dialog.Content
          className="kalori-library-dialog-content"
          data-testid="library-card-quicklog-dialog"
          aria-describedby={undefined}
          aria-busy={disabled ? 'true' : undefined}
        >
          <Dialog.Title className="kalori-library-dialog-title">
            {t.library.quickLogMealPickerTitle}
          </Dialog.Title>
          {itemName ? (
            <p className="kalori-library-dialog-body" data-testid="library-card-quicklog-name">
              {itemName}
            </p>
          ) : null}
          <div
            role="group"
            aria-label={t.library.quickLogMealPickerTitle}
            aria-busy={disabled ? 'true' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-2)',
              marginBlockStart: 'var(--spacing-3)',
            }}
          >
            {(
              [
                ['breakfast', t.log.confirmationMealBreakfast],
                ['lunch', t.log.confirmationMealLunch],
                ['dinner', t.log.confirmationMealDinner],
                ['snack', t.log.confirmationMealSnack],
                ['drink', t.log.confirmationMealDrink],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-testid={`library-card-quicklog-meal-${key}`}
                disabled={disabled}
                aria-busy={disabled && pendingMeal === key ? 'true' : undefined}
                onClick={() => {
                  if (disabled) return;
                  onPick(key);
                }}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--type-label)',
                  fontWeight: 500,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-ivory)',
                  background: 'transparent',
                  border: '1px solid var(--color-rule)',
                  padding: 'var(--spacing-3) var(--spacing-4)',
                  minHeight: 44,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {disabled && pendingMeal === key ? t.library.quickLogMealPickerLoading : label}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default LibraryClient;
