'use client';

/**
 * `<BulkDeleteConfirmDialog />` — Task 4.1 sub-step 3 §7.13.
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
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

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
        // IF-2: keep the dialog open + surface the error inline so the
        // user can retry. Prior behavior swallowed failures, closed the
        // dialog, and left the user with no signal that the mutation
        // failed.
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  };

  const title =
    totalCount === 1
      ? t.library.bulkDeleteTitleSingular
      : t.library.bulkDeleteTitlePlural.replace('{N}', String(totalCount));
  const strikeLabel = t.library.bulkDeleteStrike.replace('{N}', String(totalCount));
  const shownPreview = previewNames.slice(0, 3);
  const moreCount = Math.max(0, totalCount - shownPreview.length);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kalori-library-dialog-overlay" />
        <Dialog.Content
          className="kalori-library-dialog-content"
          aria-describedby="library-bulk-delete-body"
          data-testid="library-bulk-delete-dialog"
        >
          <p className="kalori-library-dialog-kicker">{t.library.bulkDeleteKicker}</p>
          <Dialog.Title className="kalori-library-dialog-title">{title}</Dialog.Title>
          <Dialog.Description id="library-bulk-delete-body" className="kalori-library-dialog-body">
            {t.library.bulkDeleteWarning}
          </Dialog.Description>
          {shownPreview.length > 0 ? (
            <ul className="kalori-library-dialog-list">
              {shownPreview.map((name) => (
                <li key={name}>{name}</li>
              ))}
              {moreCount > 0 ? (
                <li>{t.library.bulkDeleteMore.replace('{N}', String(moreCount))}</li>
              ) : null}
            </ul>
          ) : null}
          {/* IF-2 (Codex adversarial round 1): inline role=alert banner
              on mutation failure. Reuses the oxblood-on-ivory token used
              by MergeDuplicatesDialog so the visual language is
              consistent. */}
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
            <Dialog.Close asChild>
              <button
                type="button"
                autoFocus
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
              data-testid="library-bulk-delete-confirm"
              className="kalori-library-pill"
            >
              {pending ? '…' : strikeLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BulkDeleteConfirmDialog;
