'use client';

/**
 * `<FoodDetail />` — Task 4.2 + Task C.2 (US-STAB-C2 AC4 Log Now rewire) +
 * library overhaul batch 2026-05-16 (Bugs 1 / 2 / 4 / 8 / 9).
 *
 * Client island for `/library/[id]`. Owns:
 *   - Mode switchboard: view / edit / delete-confirming.
 *   - `useOptimistic` for the single-item tombstone.
 *   - `authPost` wiring for update + delete + bulk-undo + Log-Now (R1 contract).
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
 * Log Now semantics (Task C.2 AC4):
 *   - Atomic snapshot read at click-time via `POST /api/library/[id]/log-now`
 *     (P-1 race mitigation lives server-side — the route SELECTs the item
 *     fresh, builds the food_entries row, inserts within a single request).
 *   - Replaces the legacy `router.push('/log?tab=library&item=…')` deep-link.
 *   - Double-submit latch: `useRef<boolean>` checked AND set BEFORE entering
 *     `startTransition` (lesson #1 — React 19 startTransition double-submit).
 *   - On success: pushes a success toast + `router.refresh()` so the page's
 *     Recent Entries section re-renders with the new row visible.
 *   - On error: `Sentry.captureException(err)` BEFORE setting the inline
 *     banner (lesson #9 — never swallow).
 *   - On `SessionExpiredError`: silent no-op (interceptor owns the redirect).
 *
 * Library overhaul 2026-05-16:
 *
 *   Bug 1 — Route mode chrome. `mode="route"` (default) renders the sheet
 *     as a navigated page (no scrim, no slide-in, no dialog semantics).
 *     `mode="modal"` preserves the legacy overlay chrome for hypothetical
 *     future overlay contexts (LibraryTab in /log does NOT use FoodDetail).
 *
 *   Bug 2 — `useTransition` on back/close `router.push` calls so the
 *     originating button can show a pending cue while the destination
 *     route's `loading.tsx` skeleton boots.
 *
 *   Bug 4 — Mutation feedback + cross-block:
 *     - `sheetBusy = saving || logNowPending || deleteInFlight` is mirrored
 *       to `aria-busy` on the sheet root + `data-busy="true"`.
 *     - Cross-operation guards: while any mutation is in flight, every
 *       OTHER mutation's handler early-returns.
 *     - Delete-await: `router.push` deferred until AFTER `authPost`
 *       resolves so the user sees the pending state instead of a snap
 *       navigation.
 *     - ESC handler gated by `sheetBusy` (cannot close mid-flight).
 *
 * All mutations route through `authPost` from
 * `lib/auth/refresh-interceptor.ts` — no raw `fetch`, no local shims.
 */
import * as Sentry from '@sentry/nextjs';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';

import { useDuplicateLogConfirm } from '@/components/primitives/DuplicateLogConfirmDialog';
import { PopoverInline } from '@/components/primitives/PopoverInline';
import { authPost, AuthApiError, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
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

const BulkDeleteConfirmDialog = dynamic(
  () => import('../BulkDeleteConfirmDialog').then((m) => m.BulkDeleteConfirmDialog),
  { ssr: false, loading: () => null },
);

function isDuplicateLogError(err: unknown): boolean {
  return (
    err instanceof AuthApiError &&
    err.status === 409 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { error?: unknown }).error === 'duplicate_food_entry'
  );
}

export type FoodDetailMode = 'route' | 'modal';

/**
 * Initial mode requested via the `?mode=edit` query param (Bug 3 quick
 * action). `view` (default) renders the read-only surface; `edit`
 * auto-enters edit mode on first render AND strips the `?mode=edit`
 * query param via `router.replace` so reload / back-navigation does
 * not re-trigger.
 */
export type FoodDetailInitialMode = 'view' | 'edit';

export interface FoodDetailProps {
  item: LibraryItem;
  history: HistoryData;
  /**
   * Chrome variant. `route` (default) renders as a navigated page
   * (`/library/[id]`) — no scrim, no slide-in, no dialog semantics.
   * `modal` preserves the legacy overlay chrome for any callers that
   * mount FoodDetail on top of another surface.
   */
  mode?: FoodDetailMode;
  /**
   * Bug 3 (library overhaul 2026-05-16) — when the destination page is
   * loaded via the kebab menu's Edit action, the server passes
   * `initialMode="edit"`. FoodDetail auto-enters edit mode on first
   * render and strips the query param so the back / refresh path does
   * not re-trigger.
   */
  initialMode?: FoodDetailInitialMode;
}

export function FoodDetail({
  item,
  history,
  mode = 'route',
  initialMode = 'view',
}: FoodDetailProps) {
  const router = useRouter();
  const pushToast = useUndoQueueStore((s) => s.pushToast);

  const [committedItem, setCommittedItem] = useState<LibraryItem>(item);
  const [optimisticState, applyOptimistic] = useOptimistic(
    INITIAL_FD_OPTIMISTIC,
    foodDetailOptimisticReducer,
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [logNowPending, setLogNowPending] = useState(false);
  // Bug 4 — lifted from BulkDeleteConfirmDialog so the sheet can render
  // a single aggregate busy state across Save / Delete / Log Now.
  const [deleteInFlight, setDeleteInFlight] = useState(false);

  // Bug 2 — `useTransition` so the back / close click feedback can mirror
  // the underlying router transition. When the destination route's
  // `loading.tsx` skeleton mounts, the local pending state can collapse;
  // until then the originating button stays in its pending cue.
  const [navPending, startNavTransition] = useTransition();

  const edit = useFoodDetailEdit(committedItem);

  // Bug 3 (library overhaul 2026-05-16) — auto-enter edit mode + strip
  // the `?mode=edit` query param when the page loads via the LibraryCard
  // kebab menu's Edit action. Single-shot via a mount-scoped ref so
  // `edit.enter` does not re-fire mid-session if the hook identity flips
  // (`exhaustive-deps` lint cleared without a suppress directive).
  const autoEditConsumedRef = useRef(false);
  useEffect(() => {
    if (initialMode !== 'edit') return;
    if (autoEditConsumedRef.current) return;
    autoEditConsumedRef.current = true;
    edit.enter();
    router.replace(`/library/${item.id}`);
  }, [initialMode, edit, item.id, router]);

  // Bug 4 — aggregated busy flag across mutations + navigation transitions.
  // Save / Delete / Log Now / nav-pending all set this. While true the
  // sheet flags `aria-busy="true"` and every cross-mutation handler
  // short-circuits via an early-return.
  const sheetBusy = edit.saving || logNowPending || deleteInFlight;

  const onBack = useCallback(() => {
    if (sheetBusy) return;
    startNavTransition(() => {
      router.push('/library');
    });
  }, [router, sheetBusy]);

  const onClose = useCallback(() => {
    if (sheetBusy) return;
    startNavTransition(() => {
      router.push('/library');
    });
  }, [router, sheetBusy]);

  const logNowInFlightRef = useRef(false);
  const pendingClientIdRef = useRef<string | null>(null);

  // Meal-slot picker — Log This Now click opens a small Radix Popover
  // anchored on the button. The user picks breakfast/lunch/dinner/snack/
  // drink; the picker's onSelect fires `performLogNow(category)`. Without
  // this, the route silently fell back to the server's time-of-day
  // heuristic, which guessed wrong when (e.g.) someone re-logs last
  // night's dinner from a morning planning session.
  const logNowAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [mealPickerOpen, setMealPickerOpen] = useState(false);
  const { confirm: confirmDuplicateLog, dialog: duplicateLogConfirmDialog } =
    useDuplicateLogConfirm(t.library.detail.duplicateLogConfirmMessage);

  const performLogNow = useCallback(
    async (mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink') => {
      // Close the picker immediately — the request is fire-and-forget
      // from the user's POV; the toast confirms the outcome.
      setMealPickerOpen(false);
      // Bug 4 — cross-mutation guard. While Save / Delete is in flight, Log
      // Now does nothing. The button itself is already disabled via
      // `disabled={logNowPending}`, but a programmatic / SR-driven click
      // path still hits the handler.
      if (edit.saving || deleteInFlight) return;
      if (logNowInFlightRef.current) return;
      logNowInFlightRef.current = true;
      setLogNowPending(true);

      const clientId = pendingClientIdRef.current ?? crypto.randomUUID();
      pendingClientIdRef.current = clientId;
      const loggedAtIso = new Date().toISOString();

      try {
        const payload = {
          client_id: clientId,
          logged_at: loggedAtIso,
          meal_category: mealCategory,
        };
        try {
          await authPost<{ entry: { id: string; logged_at: string }; replayed?: boolean }>(
            `/api/library/${committedItem.id}/log-now`,
            payload,
          );
        } catch (err) {
          if (!isDuplicateLogError(err)) throw err;
          const confirmed = await confirmDuplicateLog();
          if (!confirmed) {
            pendingClientIdRef.current = null;
            return;
          }
          await authPost<{ entry: { id: string; logged_at: string }; replayed?: boolean }>(
            `/api/library/${committedItem.id}/log-now`,
            { ...payload, allow_duplicate: true },
          );
        }

        pendingClientIdRef.current = null;

        const toastClientId =
          typeof crypto !== 'undefined' ? crypto.randomUUID() : `toast-${Date.now()}`;
        pushToast({
          clientId: toastClientId,
          kind: 'saved',
          description: t.library.detail.logNowSuccessToast,
          serverRowId: null,
          commit: async () => {
            /* no-op — the entry is already persisted server-side. */
          },
          revert: async () => {
            /* no undo affordance in MVP (briefing Open Q #3 deferred). */
          },
        });

        startTransition(() => {
          router.refresh();
        });
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          pendingClientIdRef.current = null;
          return;
        }
        let retryable = false;
        if (err instanceof TypeError) {
          retryable = true;
        } else if (err instanceof Error) {
          const statusMatch = err.message.match(/failed:\s*(\d+)/);
          const status = statusMatch ? Number(statusMatch[1]) : null;
          retryable = status !== null && status >= 500 && status < 600;
        }
        if (!retryable) {
          pendingClientIdRef.current = null;
        }
        Sentry.captureException(err, {
          tags: {
            route: '/api/library/[id]/log-now',
            acceptanceCriterion: 'AC4',
            component: 'FoodDetail',
          },
        });
        setErrorBanner(t.library.detail.logNowErrorBanner);
      } finally {
        logNowInFlightRef.current = false;
        setLogNowPending(false);
      }
    },
    [committedItem.id, confirmDuplicateLog, deleteInFlight, edit.saving, pushToast, router],
  );

  const onEditCommit = useCallback((next: LibraryItem) => {
    setCommittedItem(next);
    setErrorBanner(null);
  }, []);

  const onEditError = useCallback((message: string) => {
    setErrorBanner(message);
  }, []);

  const onDeleteStart = useCallback(() => {
    // Bug 4 — block opening the delete dialog while another mutation is
    // mid-flight.
    if (edit.saving || logNowPending || deleteInFlight) return;
    setDeleteDialogOpen(true);
  }, [deleteInFlight, edit.saving, logNowPending]);

  const onDeleteConfirm = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    const deleteClientId = crypto.randomUUID();
    const itemClientId = committedItem.client_id;
    const itemId = committedItem.id;

    setDeleteInFlight(true);

    // Optimistic tombstone — must be inside a transition (React 19).
    startTransition(() => {
      applyOptimistic({ type: 'remove', id: itemId });
    });

    try {
      await authPost<{ item: { id: string; deleted_at: string } | null; replayed?: boolean }>(
        `/api/library/${itemId}/delete`,
        { delete_client_id: deleteClientId },
      );

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
          } catch (undoErr) {
            // Task E.1.1 — F-CODEX-D-R2-03 — surface the structured
            // 409 restore_name_conflict body (introduced by R2-02) so
            // the user can see WHY the undo failed instead of the row
            // silently staying deleted. Other failures stay best-effort
            // (sweep window is narrow).
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

      // Bug 4 — release the busy flag BEFORE navigation so the
      // destination page does not inherit a stale `aria-busy="true"`.
      setDeleteInFlight(false);
      // Bug 4 — navigation deferred until AFTER the POST resolves so the
      // user sees the in-flight cue. Previous behaviour pushed before the
      // network round-trip, masking pending state behind a route swap.
      router.push('/library');
      router.refresh();
      return { ok: true };
    } catch (err) {
      setDeleteInFlight(false);
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

  // Focus management — kept for keyboard a11y in both modes.
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
      sheetRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // ESC closes the sheet — gated by `sheetBusy` (Bug 4) and the nested
  // delete dialog's open flag (existing behaviour).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (deleteDialogOpen) return;
      // Bug 4 — do not allow ESC to close the sheet mid-mutation.
      if (sheetBusy) return;
      ev.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, deleteDialogOpen, sheetBusy]);

  // Focus-trap (modal mode only — route mode is just a normal page).
  const onSheetKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLElement>) => {
      if (mode !== 'modal') return;
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
    [getFocusables, mode],
  );

  const isModal = mode === 'modal';

  return (
    <div
      className="kalori-fd-sheet-wrap"
      data-testid="food-detail-sheet-wrap"
      data-mode={mode}
      aria-hidden={tombstoned ? 'true' : undefined}
    >
      {isModal ? <div className="kalori-fd-scrim" aria-hidden="true" onClick={onClose} /> : null}
      <aside
        ref={sheetRef}
        // Bug 1 — drop dialog semantics in route mode (this is a page, not
        // a modal). Modal mode keeps the legacy `role="dialog"` contract.
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal ? 'true' : undefined}
        aria-labelledby="food-detail-name"
        aria-describedby="food-detail-macros-summary"
        // Bug 4 — sheet-wide busy region so AT users hear the mutation
        // beat regardless of which button label changed.
        aria-busy={sheetBusy || undefined}
        data-busy={sheetBusy ? 'true' : undefined}
        data-testid="food-detail-sheet"
        className="kalori-fd-sheet"
        tabIndex={-1}
        onKeyDown={onSheetKeyDown}
      >
        <header className="kalori-fd-topbar">
          <button
            type="button"
            onClick={onBack}
            disabled={sheetBusy}
            aria-disabled={sheetBusy || undefined}
            aria-busy={navPending || undefined}
            data-pending={navPending ? 'true' : undefined}
            aria-label={t.library.detail.backLabel}
            data-testid="food-detail-back"
            className="kalori-fd-back"
          >
            {t.library.detail.backToIndex}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={sheetBusy}
            aria-disabled={sheetBusy || undefined}
            aria-busy={navPending || undefined}
            data-pending={navPending ? 'true' : undefined}
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
              onMicroChange={edit.setMicro}
              saving={edit.saving}
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
          logNowPending={logNowPending}
          deleteInFlight={deleteInFlight}
          logNowAnchorRef={logNowAnchorRef}
          onLogNow={() => {
            // Open the meal-slot picker instead of firing the POST
            // immediately. The picker's onSelect calls `performLogNow`
            // with the chosen category.
            if (edit.saving || deleteInFlight || logNowPending) return;
            setMealPickerOpen(true);
          }}
          onEditStart={edit.enter}
          onDeleteStart={onDeleteStart}
          onSave={() =>
            void edit.commit({
              itemId: committedItem.id,
              onCommitted: onEditCommit,
              onFailed: onEditError,
            })
          }
          onCancel={() => {
            // Reset draft + exit edit mode, then bounce back to the
            // library list. The user explicitly chose to discard their
            // edits, so dropping them on the detail page (view mode)
            // would leave them looking at unchanged data — bouncing to
            // /library matches the dashboard's "Cancel takes me out"
            // mental model.
            edit.cancel();
            startNavTransition(() => {
              router.push('/library');
            });
          }}
        />

        <PopoverInline
          open={mealPickerOpen}
          onOpenChange={setMealPickerOpen}
          anchorRef={logNowAnchorRef}
          ariaLabel={t.library.detail.logNowMealPickerAriaLabel}
          data-testid="food-detail-log-now-meal-picker"
        >
          <div
            role="group"
            aria-label={t.library.detail.logNowMealPickerAriaLabel}
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
                data-testid={`food-detail-log-now-meal-${key}`}
                onClick={() => {
                  void performLogNow(key);
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
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </PopoverInline>
        {duplicateLogConfirmDialog}
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
