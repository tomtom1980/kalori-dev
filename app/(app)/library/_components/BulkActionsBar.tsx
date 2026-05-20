'use client';

/**
 * `<BulkActionsBar />` — Task 4.1 sub-step 3 §7.12.
 *
 * Sticky region that appears when ≥2 items are selected. Inverse-pill
 * CTAs (§18.2). Bulk LOG replaces the prior bulk MERGE — selecting N
 * items + clicking LOG opens a meal-slot picker (owned by the parent),
 * then logs each item as a separate food_entries row via parallel calls
 * to /api/library/[id]/log-now. Keyboard shortcut migrated from `m`
 * (merge) to `l` (log).
 *
 * `+K HIDDEN` chip renders when the selection contains IDs outside the
 * currently-visible filter+search result set.
 */
import { useEffect } from 'react';

import { t } from '@/lib/i18n/en';

export interface BulkActionsBarProps {
  selectedCount: number;
  hiddenCount: number;
  onBulkLog: () => void;
  onBulkDelete: () => void;
  onCancel: () => void;
  onBulkDeleteHoverPreload?: () => void;
  busy?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  hiddenCount,
  onBulkLog,
  onBulkDelete,
  onCancel,
  onBulkDeleteHoverPreload,
  busy = false,
}: BulkActionsBarProps) {
  // Keyboard shortcuts — Delete/Backspace opens bulk delete; `l` opens
  // the bulk log picker; Escape cancels select mode. The bar only
  // mounts at N>=2 (parent gate), so all shortcuts implicitly require
  // that threshold.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (busy) return;
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedCount > 0) {
          ev.preventDefault();
          onBulkDelete();
        }
      } else if (ev.key === 'l' || ev.key === 'L') {
        if (selectedCount > 0) {
          ev.preventDefault();
          onBulkLog();
        }
      } else if (ev.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, selectedCount, onBulkDelete, onBulkLog, onCancel]);

  return (
    <div
      role="region"
      aria-label={t.library.bulkSelectedCount.replace('{N}', String(selectedCount))}
      aria-busy={busy ? 'true' : undefined}
      tabIndex={-1}
      data-testid="library-bulk-actions-bar"
      className="kalori-library-bar"
    >
      <span className="kalori-library-bar-count" data-testid="library-bulk-count">
        {t.library.bulkSelectedCount.replace('{N}', String(selectedCount))}
      </span>
      {hiddenCount > 0 ? (
        <span className="kalori-library-bar-hidden" data-testid="library-bulk-hidden">
          {t.library.bulkHiddenBadge.replace('{K}', String(hiddenCount))}
        </span>
      ) : null}
      <div className="kalori-library-bar-spacer" />
      <button
        type="button"
        onClick={onBulkLog}
        aria-label={t.library.bulkLogAriaLabel}
        aria-disabled={busy ? 'true' : undefined}
        aria-busy={busy ? 'true' : undefined}
        disabled={busy}
        data-testid="library-bulk-log-button"
        className="kalori-library-pill"
      >
        {busy ? (
          <>
            <span aria-hidden="true" className="kalori-log-cta-spinner" />
            {t.library.bulkLogButtonLoading}
          </>
        ) : (
          t.library.bulkLogButton
        )}
      </button>
      <button
        type="button"
        onClick={onBulkDelete}
        onPointerEnter={onBulkDeleteHoverPreload}
        aria-disabled={busy ? 'true' : undefined}
        disabled={busy}
        data-testid="library-bulk-delete-button"
        className="kalori-library-pill"
      >
        {t.library.bulkDeleteButton}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-disabled={busy ? 'true' : undefined}
        disabled={busy}
        data-testid="library-bulk-cancel-button"
        className="kalori-library-btn-ghost"
      >
        {t.library.cancelButton}
      </button>
    </div>
  );
}

export default BulkActionsBar;
