'use client';

/**
 * `<BulkDeleteConfirmDialog />` — Task 4.1 sub-step 3 §7.13 + Task C.2
 * (US-STAB-C2 AC3) a11y upgrades for the N=1 variant + library overhaul
 * 2026-05-16 Bug 4 mutation feedback.
 *
 * Radix Dialog with CANCEL default focus + Enter-activates-CANCEL
 * destructive convention (ux-auditor §1.6). Hard requirement: this module
 * is imported via `next/dynamic({ ssr: false })` from the parent so it only
 * ships into the client bundle when a user opens it. Hover preload on the
 * BULK DELETE button primes the chunk.
 *
 * Props include the `onConfirm` callback (server-action POST + optimistic
 * remove) and the array of previewed display names.
 *
 * IF-2 (Codex adversarial round 1): `onConfirm` returns a
 * `BulkConfirmResult` discriminated union. On `{ ok: false }` the dialog
 * stays open and renders an inline role=alert banner so the user sees
 * the failure + can retry without re-selecting.
 *
 * Bug 4 (2026-05-16):
 *   - CONFIRM label swaps to a real word ("DELETING…") while pending —
 *     replaces the bare "…" ellipsis that failed the ux-design
 *     loading-buttons Quick-Pick spec.
 *   - CANCEL is disabled while pending so the user cannot close the
 *     dialog mid-flight.
 *   - `onOpenChange` is gated so Radix's built-in ESC + scrim-click
 *     close paths no-op while pending. ESC + scrim are the single
 *     Radix chokepoint for non-button close events.
 *   - `aria-busy={pending}` on Content + CONFIRM.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useState } from 'react';

import { t } from '@/lib/i18n/en';

export type BulkConfirmResult = { ok: true } | { ok: false; error: string };

export interface BulkDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  previewNames: readonly string[];
  totalCount: number;
  onConfirm: () => Promise<BulkConfirmResult>;
}

export function BulkDeleteConfirmDialog({
  open,
  onOpenChange,
  previewNames,
  totalCount,
  onConfirm,
}: BulkDeleteConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  };

  // Bug 4 — gate Radix's open-state changes so ESC + scrim-click cannot
  // close the dialog mid-POST. The Confirm + Cancel buttons have their
  // own `disabled` gates above; this handler is the safety net for the
  // single Radix chokepoint.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (pending) return;
      onOpenChange(next);
    },
    [onOpenChange, pending],
  );

  const title =
    totalCount === 1
      ? t.library.bulkDeleteTitleSingular
      : t.library.bulkDeleteTitlePlural.replace('{N}', String(totalCount));
  const strikeLabel = t.library.bulkDeleteStrike.replace('{N}', String(totalCount));
  const shownPreview = previewNames.slice(0, 3);
  const moreCount = Math.max(0, totalCount - shownPreview.length);

  const isSingle = totalCount === 1;
  const singleName = isSingle ? (previewNames[0] ?? '') : '';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kalori-library-dialog-overlay" />
        <Dialog.Content
          role="alertdialog"
          className="kalori-library-dialog-content"
          aria-describedby="library-bulk-delete-body"
          aria-busy={pending || undefined}
          data-testid="library-bulk-delete-dialog"
        >
          <p className="kalori-library-dialog-kicker">{t.library.bulkDeleteKicker}</p>
          <Dialog.Title className="kalori-library-dialog-title">{title}</Dialog.Title>
          {isSingle ? (
            <p
              data-testid="library-bulk-delete-name"
              className="kalori-library-dialog-name kalori-library-dialog-name--italic"
            >
              {singleName}
            </p>
          ) : null}
          <Dialog.Description id="library-bulk-delete-body" className="kalori-library-dialog-body">
            {t.library.bulkDeleteWarning}
          </Dialog.Description>
          {!isSingle && shownPreview.length > 0 ? (
            <ul className="kalori-library-dialog-list">
              {shownPreview.map((name) => (
                <li key={name}>{name}</li>
              ))}
              {moreCount > 0 ? (
                <li>{t.library.bulkDeleteMore.replace('{N}', String(moreCount))}</li>
              ) : null}
            </ul>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="kalori-library-merge-error"
              data-testid="library-bulk-delete-error"
            >
              {error}
            </div>
          ) : null}
          <div className="kalori-library-dialog-actions">
            {/* Bug 4 — CANCEL is disabled while pending so the user cannot
                close the dialog mid-flight. `Dialog.Close asChild` still
                wires the `onOpenChange(false)` path on click; the gate is
                also enforced by `handleOpenChange` above for ESC/scrim. */}
            <Dialog.Close asChild>
              <button
                type="button"
                autoFocus
                disabled={pending}
                aria-disabled={pending || undefined}
                data-testid="library-bulk-delete-cancel"
                className="kalori-library-btn-ghost"
              >
                {t.library.cancelButton}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              aria-disabled={pending}
              aria-busy={pending || undefined}
              data-testid="library-bulk-delete-confirm"
              className="kalori-library-pill"
            >
              {/* Bug 4 — real loading label per ux-design loading-buttons
                  spec; replaces the prior bare "…" ellipsis. */}
              {pending ? t.library.detail.deleting : strikeLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BulkDeleteConfirmDialog;
