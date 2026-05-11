'use client';

/**
 * `<FoodDetail />` — Task 4.2.
 *
 * Client island for `/library/[id]`. Owns:
 *   - Mode switchboard: view / edit / delete-confirming.
 *   - `useOptimistic` for the single-item tombstone.
 *   - `authPost` wiring for update + delete + bulk-undo (R1 contract).
 *   - `useUndoQueueStore.pushToast` for the 5s undo affordance.
 *
 * The server page owns the initial fetch (tombstone-filtered). This client
 * renders the fully-hydrated item; no client waterfall.
 *
 * Delete semantics (briefing-locked):
 *   - Tombstone via `POST /api/library/[id]/delete`.
 *   - Undo via `POST /api/library/bulk-delete/undo` with length-1 array
 *     `[item.client_id]`. NO new `/api/library/[id]/undo` route.
 *
 * All mutations route through `authPost` from
 * `lib/auth/refresh-interceptor.ts` — no raw `fetch`, no local shims.
 */
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

import { foodDetailOptimisticReducer, INITIAL_FD_OPTIMISTIC } from './foodDetail.reducer';
import { FoodDetailActions } from './FoodDetailActions';
import { FoodDetailHistory, type HistoryData } from './FoodDetailHistory';
import { FoodDetailMacros } from './FoodDetailMacros';
import { FoodDetailName } from './FoodDetailName';
import { FoodDetailThumbnail } from './FoodDetailThumbnail';
import { useFoodDetailEdit } from './useFoodDetailEdit';

// Dynamic import — the delete confirm dialog only ships into the bundle
// when the user opens it. Same pattern Task 4.1 shipped for
// `<BulkDeleteConfirmDialog>`.
const BulkDeleteConfirmDialog = dynamic(
  () => import('../BulkDeleteConfirmDialog').then((m) => m.BulkDeleteConfirmDialog),
  { ssr: false, loading: () => null },
);

export interface FoodDetailProps {
  item: LibraryItem;
  history: HistoryData;
}

export function FoodDetail({ item, history }: FoodDetailProps) {
  const router = useRouter();
  const pushToast = useUndoQueueStore((s) => s.pushToast);

  const [committedItem, setCommittedItem] = useState<LibraryItem>(item);
  const [optimisticState, applyOptimistic] = useOptimistic(
    INITIAL_FD_OPTIMISTIC,
    foodDetailOptimisticReducer,
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const edit = useFoodDetailEdit(committedItem);

  const onBack = useCallback(() => {
    router.push('/library');
  }, [router]);

  const onClose = useCallback(() => {
    router.push('/library');
  }, [router]);

  const onLogNow = useCallback(() => {
    // Task 4.2 round 1 I2 — carry the item's default_portion as the
    // quantity hint so the LogFlow LibraryTab lands on a pre-populated
    // selection. Fall back to the library tab default (1) when the item
    // has no default_portion.
    const qty =
      typeof committedItem.default_portion === 'number' && committedItem.default_portion > 0
        ? committedItem.default_portion
        : 1;
    router.push(`/log?tab=library&item=${committedItem.id}&quantity=${qty}`);
  }, [router, committedItem.id, committedItem.default_portion]);

  const onEditCommit = useCallback((next: LibraryItem) => {
    setCommittedItem(next);
    setErrorBanner(null);
  }, []);

  const onEditError = useCallback((message: string) => {
    setErrorBanner(message);
  }, []);

  const onDeleteStart = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const onDeleteConfirm = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    const deleteClientId = crypto.randomUUID();
    const itemClientId = committedItem.client_id;
    const itemId = committedItem.id;

    // Optimistic tombstone — must be inside a transition (React 19).
    startTransition(() => {
      applyOptimistic({ type: 'remove', id: itemId });
    });

    try {
      await authPost<{ item: { id: string; deleted_at: string } | null; replayed?: boolean }>(
        `/api/library/${itemId}/delete`,
        { delete_client_id: deleteClientId },
      );

      // Success: navigate back to /library + push undo toast.
      router.push('/library');
      router.refresh();

      const toastClientId =
        typeof crypto !== 'undefined' ? crypto.randomUUID() : `toast-${Date.now()}`;
      pushToast({
        clientId: toastClientId,
        kind: 'deleted',
        description: t.library.detail.deletedToast,
        serverRowId: null,
        commit: async () => {
          // Commit = no-op. The server already tombstoned; the lazy sweep
          // in `lib/library/fetch.ts` hard-deletes past the 5s window.
        },
        revert: async () => {
          try {
            await authPost('/api/library/bulk-delete/undo', {
              client_ids: [itemClientId],
            });
            router.refresh();
          } catch {
            // Best-effort; sweep window is narrow.
          }
        },
      });
      return { ok: true };
    } catch (err) {
      // Revert optimistic unless the interceptor already redirected to login.
      if (err instanceof SessionExpiredError) {
        return { ok: true };
      }
      startTransition(() => {
        applyOptimistic({ type: 'restore', id: itemId });
      });
      return { ok: false, error: t.library.detail.deleteFailedToast };
    }
  }, [applyOptimistic, committedItem.client_id, committedItem.id, pushToast, router]);

  const tombstoned = optimisticState.removedIds.has(committedItem.id);

  // V1 + V2 (Task 4.2 round 1 a11y fixes):
  //  - Focus trap: keep Tab/Shift+Tab focus inside the sheet (WCAG 2.4.3).
  //  - ESC handler: close the sheet on Escape (standard dialog a11y).
  //  - Mount focus: move focus to the first focusable inside the sheet
  //    when it first renders, so keyboard users land inside the dialog.
  const sheetRef = useRef<HTMLElement | null>(null);

  const getFocusables = useCallback((): HTMLElement[] => {
    const root = sheetRef.current;
    if (!root) return [];
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
    );
  }, []);

  // Mount-focus — move the user into the sheet once on first render.
  useEffect(() => {
    const focusables = getFocusables();
    if (focusables.length > 0) {
      focusables[0]!.focus();
    } else if (sheetRef.current) {
      // Defensive fallback: if nothing focusable found (happy-dom render
      // quirks), focus the sheet root itself so keyboard events still land.
      sheetRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // V2 — ESC closes the sheet.
  //
  // F-TASK-4.2-ESC-SCOPE (aggregate Codex follow-up A3): scope the listener
  // so a nested open dialog (the delete-confirm) handles its own Escape
  // without also closing the parent sheet.
  //
  // Earlier revisions of this guard searched `sheetRef.current`'s DOM
  // descendants for an open Radix dialog. That heuristic missed the real
  // case: <BulkDeleteConfirmDialog> uses `Dialog.Portal`, so its
  // `Dialog.Content` lives OUTSIDE the sheet's subtree. The descendant
  // search returned null, the parent listener fired, and Escape collapsed
  // the entire sheet alongside the dialog.
  //
  // Fix: read `deleteDialogOpen` state directly. The state is the source of
  // truth for whether the dialog is mounted (we conditionally render the
  // dialog on `{deleteDialogOpen ? … : null}` below), so the guard works
  // regardless of where the dialog renders in the DOM tree.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      // A descendant dialog handles its own Escape — do NOT propagate to
      // the parent sheet's close handler.
      if (deleteDialogOpen) return;
      ev.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, deleteDialogOpen]);

  // V1 — focus-trap keydown handler. Bound on the sheet root so Tab from
  // any focused element inside bubbles up and gets the wrap treatment.
  const onSheetKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLElement>) => {
      if (ev.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (ev.shiftKey) {
        if (active === first || !sheetRef.current?.contains(active)) {
          ev.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !sheetRef.current?.contains(active)) {
          ev.preventDefault();
          first.focus();
        }
      }
    },
    [getFocusables],
  );

  return (
    <div
      className="kalori-fd-sheet-wrap"
      data-testid="food-detail-sheet-wrap"
      aria-hidden={tombstoned ? 'true' : undefined}
    >
      <div className="kalori-fd-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-detail-name"
        aria-describedby="food-detail-macros-summary"
        data-testid="food-detail-sheet"
        className="kalori-fd-sheet"
        tabIndex={-1}
        onKeyDown={onSheetKeyDown}
      >
        <header className="kalori-fd-topbar">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.library.detail.backLabel}
            data-testid="food-detail-back"
            className="kalori-fd-back"
          >
            {t.library.detail.backToIndex}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.library.detail.closeLabel}
            data-testid="food-detail-close"
            className="kalori-fd-close"
          >
            {t.library.detail.closeGlyph}
          </button>
        </header>

        <div className="kalori-fd-body">
          <FoodDetailThumbnail item={committedItem} />

          <FoodDetailName
            item={committedItem}
            editing={edit.editing}
            draft={edit.draft}
            errors={edit.errors}
            onDraftChange={edit.setField}
          />

          <section aria-labelledby="fd-nutrition-heading">
            <h2 id="fd-nutrition-heading" className="kalori-fd-kicker">
              {t.library.detail.kickerNutrition}
            </h2>
            <FoodDetailMacros
              item={committedItem}
              editing={edit.editing}
              draft={edit.draft}
              errors={edit.errors}
              onDraftChange={edit.setField}
            />
          </section>

          <section aria-labelledby="fd-history-heading">
            <h2 id="fd-history-heading" className="kalori-fd-kicker">
              {t.library.detail.kickerHistory}
            </h2>
            <FoodDetailHistory history={history} />
          </section>

          {errorBanner ? (
            <p role="alert" className="kalori-fd-save-banner" data-testid="food-detail-error">
              {errorBanner}
            </p>
          ) : null}
        </div>

        <FoodDetailActions
          editing={edit.editing}
          saving={edit.saving}
          dirty={edit.dirty}
          onLogNow={onLogNow}
          onEditStart={edit.enter}
          onDeleteStart={onDeleteStart}
          onSave={() =>
            void edit.commit({
              itemId: committedItem.id,
              onCommitted: onEditCommit,
              onFailed: onEditError,
            })
          }
          onCancel={edit.cancel}
        />
      </aside>

      {deleteDialogOpen ? (
        <BulkDeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          previewNames={[committedItem.display_name]}
          totalCount={1}
          onConfirm={onDeleteConfirm}
        />
      ) : null}
    </div>
  );
}

export default FoodDetail;
