'use client';

/**
 * <FoodDetailActions /> — Task 4.2 + Task C.2 + library overhaul 2026-05-16 Bug 4.
 *
 * Anchored bottom strip. View mode shows LOG THIS NOW + EDIT + DELETE.
 * Edit mode replaces EDIT with SAVE (+ CANCEL).
 *
 * Bug 4 (2026-05-16): cross-mutation interaction-block. While any of
 *   `saving` / `logNowPending` / `deleteInFlight` is true, every OTHER
 *   button on the strip is disabled + aria-disabled. The originating
 *   mutation's button keeps showing its label/aria-busy cue.
 */
import { Trash } from 'lucide-react';
import type { RefObject } from 'react';

import { t } from '@/lib/i18n/en';

export interface FoodDetailActionsProps {
  editing: boolean;
  saving: boolean;
  dirty: boolean;
  /** Log Now POST is in-flight. */
  logNowPending: boolean;
  /** Bug 4 — Delete POST is in-flight (lifted from BulkDeleteConfirmDialog). */
  deleteInFlight?: boolean;
  onLogNow: () => void;
  onEditStart: () => void;
  onDeleteStart: () => void;
  onSave: () => void;
  onCancel: () => void;
  /**
   * Optional anchor ref forwarded onto the LOG THIS NOW button so a
   * parent-owned `<PopoverInline />` (meal-slot picker) can position
   * itself relative to the button. The component itself does not own
   * the popover — it just exposes the anchor surface.
   */
  logNowAnchorRef?: RefObject<HTMLButtonElement | null>;
}

export function FoodDetailActions({
  editing,
  saving,
  dirty,
  logNowPending,
  deleteInFlight = false,
  onLogNow,
  onEditStart,
  onDeleteStart,
  onSave,
  onCancel,
  logNowAnchorRef,
}: FoodDetailActionsProps) {
  if (editing) {
    // Bug 4 — while Save is in flight, Cancel is disabled. Save itself
    // keeps its existing dirty+saving disabled contract.
    const cancelDisabled = saving || deleteInFlight || logNowPending;
    return (
      <footer className="kalori-fd-actions" data-testid="food-detail-actions-edit">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty || deleteInFlight || logNowPending}
          aria-disabled={saving || !dirty || deleteInFlight || logNowPending}
          aria-busy={saving || undefined}
          data-testid="food-detail-save-button"
          className="kalori-fd-btn-primary"
        >
          {saving ? t.library.detail.saving : t.library.detail.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelDisabled}
          aria-disabled={cancelDisabled || undefined}
          data-testid="food-detail-cancel-button"
          className="kalori-fd-btn-secondary"
        >
          {t.library.detail.cancel}
        </button>
      </footer>
    );
  }

  // Bug 4 — view-mode cross-mutation gating.
  const blockOthers = logNowPending || deleteInFlight;

  return (
    <footer className="kalori-fd-actions" data-testid="food-detail-actions-view">
      <button
        type="button"
        ref={logNowAnchorRef}
        onClick={onLogNow}
        disabled={blockOthers}
        aria-disabled={blockOthers}
        aria-busy={logNowPending}
        aria-haspopup="dialog"
        data-testid="food-detail-log-now"
        className="kalori-fd-btn-primary"
      >
        {logNowPending ? t.library.detail.logging : t.library.detail.logThisNow}
      </button>
      <span className="sr-only" aria-live="polite" data-testid="food-detail-log-now-status">
        {logNowPending ? t.library.detail.logging : ''}
      </span>
      <button
        type="button"
        onClick={onEditStart}
        // Bug 4 — Edit is disabled mid-mutation so the user can't enter
        // edit mode on top of a Save / Log Now / Delete in flight.
        disabled={blockOthers}
        aria-disabled={blockOthers || undefined}
        data-testid="food-detail-edit-button"
        className="kalori-fd-btn-secondary"
      >
        {t.library.detail.edit}
      </button>
      <button
        type="button"
        onClick={onDeleteStart}
        // Bug 4 — Delete button is disabled while a different mutation
        // is in flight AND while a delete is in flight (the dialog is
        // mounted; double-fire is suppressed by the dialog's own pending
        // flag, but the chrome should stay coherent).
        disabled={blockOthers}
        aria-disabled={blockOthers || undefined}
        aria-busy={deleteInFlight || undefined}
        aria-label={t.library.detail.deleteAriaLabel}
        data-testid="food-detail-delete-button"
        className="kalori-fd-btn-delete"
      >
        <Trash size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </footer>
  );
}

export default FoodDetailActions;
