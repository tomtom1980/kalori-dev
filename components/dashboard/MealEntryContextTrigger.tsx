'use client';

/**
 * <MealEntryContextTrigger /> — Task 3.5 client leaf for meal-entry actions.
 *
 * Provides:
 *   - `+ Add` button per column → opens Log modal with pre-filled
 *     `meal_category` via useLogFlowStore.openModal('type', { mealCategory }).
 *   - `⋯` context-menu trigger → opens a minimal popover with Delete / Edit
 *     / Copy-to-today menu items.
 *   - Delete wiring — F-UI-3.6-C-1 delay-on-TTL: optimistic hide +
 *     `useUndoQueueStore.pushToast({ kind: 'deleted' })` whose `commit`
 *     callback fires the server DELETE only after the 5s TTL elapses. If
 *     the user clicks UNDO before then, `revert` restores the row and the
 *     DELETE is cancelled. The store is mounted at the chrome layout level
 *     (`<UndoToastMount />`), so the timer survives route changes — I4
 *     contract (authoritative 5s TTL; F6 nav-after-delete recovery).
 *
 * No Radix dependency — hand-rolled <menu> for minimal bundle cost. The
 * menu is toggled via `open` state; closes on click-outside, Escape, or
 * item click.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { announcePolite } from '@/lib/a11y/announce';
import { authFetch, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { FoodEntry, MealCategory } from '@/lib/dashboard/types';
import { useLogFlowStore, type MealCategoryHint } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

export interface MealAddButtonProps {
  category: MealCategory;
  timezone?: string | undefined;
  viewedDay?: string | undefined;
}

/**
 * `+ ADD` button per meal column. Opens the log modal with mealCategory
 * hint set. Min 44×44 tap target.
 */
export function MealAddButton({ category, timezone, viewedDay }: MealAddButtonProps) {
  const openModal = useLogFlowStore((s) => s.openModal);
  const a11y = t.dashboard.meals.addActionA11y.replace(
    '{mealCategory}',
    t.dashboard.meals.categoryLabel[category],
  );

  return (
    <button
      type="button"
      data-testid={`meal-add-${category}`}
      aria-label={a11y}
      onClick={() =>
        openModal('type', {
          mealCategory: category as MealCategoryHint,
          ...(viewedDay ? { logDate: viewedDay } : {}),
          ...(timezone ? { timezone } : {}),
        })
      }
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--type-label)',
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--color-oxblood-soft)',
        background: 'transparent',
        border: 'none',
        padding: 'var(--spacing-3)',
        minHeight: 44,
        minWidth: 44,
        cursor: 'pointer',
      }}
    >
      {t.dashboard.meals.addAction}
    </button>
  );
}

export interface EntryRowActionsProps {
  entry: FoodEntry;
  timezone?: string | undefined;
  viewedDay?: string | undefined;
}

/**
 * `⋯` context menu + optimistic delete handler.
 * For 3.5, Edit / Copy actions are stubs (Task 4.1 territory). Delete is
 * fully wired using the delay-on-TTL pattern (F-UI-3.6-C-1):
 *   - click Delete → optimistic hide + push undo toast
 *   - UNDO within 5s → `revert()` restores the row; DELETE never issued
 *   - no undo within 5s → `commit()` fires the authenticated DELETE
 *   - nav mid-window → toast + timer survive at the chrome layer; UNDO
 *     still works from the destination route (F6)
 */
export function EntryRowActions({ entry, timezone, viewedDay }: EntryRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openModal = useLogFlowStore((s) => s.openModal);
  const enterConfirmation = useLogFlowStore((s) => s.enterConfirmation);

  if (hidden) {
    // Optimistic hide — row collapsed via parent display.
    // We keep the node mounted so the menu DOM can still render if the
    // user re-opens; but the row itself is hidden via CSS display upstream.
  }

  function handleDelete() {
    setOpen(false);
    setHidden(true);
    const entryName = entry.items[0]?.name ?? 'entry';
    announcePolite(t.dashboard.live.entryRemoved.replace('{name}', entryName));

    // I4 delay-on-TTL — push the toast FIRST, perform the server DELETE only
    // if the 5s timer runs to completion (`commit` branch). The toast
    // infrastructure is chrome-level (`<UndoToastMount />` at (app) layout),
    // so the timer + LIFO stack survive route changes. If the user clicks
    // UNDO before 5s elapses, `revert` runs and the DELETE never fires.
    useUndoQueueStore.getState().pushToast({
      clientId: entry.client_id,
      kind: 'deleted',
      description: t.log.undoToastDeleted.replace('{label}', entryName),
      serverRowId: entry.id,
      commit: async () => {
        // TTL elapsed — now issue the authenticated server DELETE.
        try {
          const res = await authFetch(`/api/entries/${entry.id}?client_id=${entry.client_id}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            // Server rejected the delete. Push a `delete-failed` toast —
            // UNDO is hidden for that kind. The row will re-appear on the
            // next RSC revalidation; we intentionally do NOT flip `hidden`
            // back to false here because (a) the component may already be
            // unmounted (nav) and (b) the optimistic hide is cosmetic —
            // next read will show ground truth.
            useUndoQueueStore.getState().pushToast({
              clientId: entry.client_id,
              kind: 'delete-failed',
              description: t.dashboard.undo.deleteFailedToast,
              serverRowId: entry.id,
              commit: async () => {},
              revert: async () => {},
            });
          } else {
            // Success — invalidate the router cache so the dashboard RSC
            // re-runs and the deleted row stops appearing. Writers emit
            // `revalidateTag(...)` server-side but the dashboard readers
            // currently use React `cache()` only (no cross-request tag
            // binding — deferred to F-UI-3.5-10). `router.refresh()` is
            // the minimal client-side fix.
            router.refresh();
          }
        } catch (err) {
          if (err instanceof SessionExpiredError) throw err;
          useUndoQueueStore.getState().pushToast({
            clientId: entry.client_id,
            kind: 'delete-failed',
            description: t.dashboard.undo.deleteFailedToast,
            serverRowId: entry.id,
            commit: async () => {},
            revert: async () => {},
          });
        }
      },
      revert: async () => {
        // UNDO clicked within 5s — restore the optimistic hide. If this
        // component is unmounted (nav away), `setHidden` is a no-op on a
        // stale closure; the remounted parent route re-renders the row
        // from ground truth anyway, which still shows the entry because
        // the server DELETE was never issued.
        setHidden(false);
        announcePolite(t.dashboard.live.entryRestored.replace('{name}', entryName));
      },
    });
  }

  function handleEdit() {
    setOpen(false);
    openModal('type', {
      mealCategory: entry.meal_category as MealCategoryHint,
      ...(viewedDay ? { logDate: viewedDay } : {}),
      ...(timezone ? { timezone } : {}),
    });
    enterConfirmation({
      source: entry.source,
      tab: 'type',
      items: entry.items,
      reasoning: entry.ai_reasoning,
      dedupMatch: null,
      libraryItemIds: entry.library_item_id ? [entry.library_item_id] : undefined,
      editEntryId: entry.id,
      originalLoggedAt: entry.logged_at,
    });
  }

  if (hidden) {
    // Keep an empty spot so focus doesn't jump; parent column's layout
    // absorbs the gap.
    return <span data-testid={`entry-hidden-${entry.id}`} aria-hidden="true" />;
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        data-testid={`entry-menu-${entry.id}`}
        aria-label={t.dashboard.meals.entryMenuA11y}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-dust)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          padding: 'var(--spacing-2)',
          minHeight: 44,
          minWidth: 44,
        }}
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          data-testid={`entry-menu-popover-${entry.id}`}
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 10,
            background: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            minWidth: 180,
          }}
        >
          <MenuItem label={t.dashboard.meals.menuDelete} onClick={handleDelete} />
          <MenuItem label={t.dashboard.meals.menuEdit} onClick={handleEdit} />
        </div>
      ) : null}
    </span>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: 'var(--spacing-3) var(--spacing-4)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: 'var(--color-ivory)',
        cursor: 'pointer',
        minHeight: 44,
      }}
    >
      {label}
    </button>
  );
}
