'use client';

/**
 * <FoodDetailActions /> — Task 4.2.
 *
 * Anchored bottom strip. View mode shows LOG THIS NOW + EDIT + DELETE.
 * Edit mode replaces EDIT with SAVE (+ CANCEL).
 *
 * The STRIKE destructive CTA (inverse-pill) lives inside the
 * BulkDeleteConfirmDialog, not here — this strip's DELETE button is the
 * icon-only Phosphor Trash.
 */
import { Trash } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface FoodDetailActionsProps {
  editing: boolean;
  saving: boolean;
  dirty: boolean;
  onLogNow: () => void;
  onEditStart: () => void;
  onDeleteStart: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function FoodDetailActions({
  editing,
  saving,
  dirty,
  onLogNow,
  onEditStart,
  onDeleteStart,
  onSave,
  onCancel,
}: FoodDetailActionsProps) {
  if (editing) {
    return (
      <footer className="kalori-fd-actions" data-testid="food-detail-actions-edit">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          aria-disabled={saving || !dirty}
          data-testid="food-detail-save-button"
          className="kalori-fd-btn-primary"
        >
          {saving ? t.library.detail.saving : t.library.detail.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          data-testid="food-detail-cancel-button"
          className="kalori-fd-btn-secondary"
        >
          {t.library.detail.cancel}
        </button>
      </footer>
    );
  }

  return (
    <footer className="kalori-fd-actions" data-testid="food-detail-actions-view">
      <button
        type="button"
        onClick={onLogNow}
        data-testid="food-detail-log-now"
        className="kalori-fd-btn-primary"
      >
        {t.library.detail.logThisNow}
      </button>
      <button
        type="button"
        onClick={onEditStart}
        data-testid="food-detail-edit-button"
        className="kalori-fd-btn-secondary"
      >
        {t.library.detail.edit}
      </button>
      <button
        type="button"
        onClick={onDeleteStart}
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
