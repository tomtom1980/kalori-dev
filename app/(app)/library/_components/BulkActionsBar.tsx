'use client';

/**
 * `<BulkActionsBar />` — Task 4.1 sub-step 3 §7.12.
 *
 * Sticky region that appears when ≥2 items are selected. `aria-pressed`-free
 * pill CTAs (inverse-pill per §18.2). The MERGE button's disabled semantic
 * uses `aria-disabled="true"` (NOT native `disabled`) so SR readers still
 * discover it — ux-auditor §2.8 directive.
 *
 * `+K HIDDEN` chip renders when the selection contains IDs outside the
 * currently-visible filter+search result set.
 */
import { useEffect } from 'react';

import { t } from '@/lib/i18n/en';

export interface BulkActionsBarProps {
  selectedCount: number;
  hiddenCount: number;
  onMerge: () => void;
  onBulkDelete: () => void;
  onCancel: () => void;
  onMergeHoverPreload?: () => void;
  onBulkDeleteHoverPreload?: () => void;
}

export function BulkActionsBar({
  selectedCount,
  hiddenCount,
  onMerge,
  onBulkDelete,
  onCancel,
  onMergeHoverPreload,
  onBulkDeleteHoverPreload,
}: BulkActionsBarProps) {
  const canMerge = selectedCount === 2;
  const mergeTooltipId = 'library-merge-tooltip';

  // Keyboard shortcuts — Delete/Backspace opens bulk delete; `m` opens merge
  // (only when exactly 2 selected); Escape cancels select mode.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedCount > 0) {
          ev.preventDefault();
          onBulkDelete();
        }
      } else if (ev.key === 'm' || ev.key === 'M') {
        if (canMerge) {
          ev.preventDefault();
          onMerge();
        }
      } else if (ev.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCount, canMerge, onBulkDelete, onMerge, onCancel]);

  return (
    <div
      role="region"
      aria-label={t.library.bulkSelectedCount.replace('{N}', String(selectedCount))}
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
        onClick={canMerge ? onMerge : undefined}
        onPointerEnter={onMergeHoverPreload}
        aria-disabled={!canMerge}
        aria-describedby={!canMerge ? mergeTooltipId : undefined}
        data-testid="library-merge-button"
        className="kalori-library-pill"
      >
        {t.library.mergeButton}
      </button>
      {!canMerge ? (
        <span id={mergeTooltipId} className="sr-only">
          {t.library.mergeDisabledTooltip}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onBulkDelete}
        onPointerEnter={onBulkDeleteHoverPreload}
        data-testid="library-bulk-delete-button"
        className="kalori-library-pill"
      >
        {t.library.bulkDeleteButton}
      </button>
      <button
        type="button"
        onClick={onCancel}
        data-testid="library-bulk-cancel-button"
        className="kalori-library-btn-ghost"
      >
        {t.library.cancelButton}
      </button>
    </div>
  );
}

export default BulkActionsBar;
