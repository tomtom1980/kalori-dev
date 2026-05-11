'use client';

/**
 * <DiscardDraftAlertDialog /> — Task 3.4 Radix AlertDialog replacement for
 * the 3.3 `window.confirm` discard path (synthesis §2.9, M5 deferred).
 *
 * APG destructive-emphasis pattern:
 *   - Cancel = autofocus on open ("KEEP DRAFT", oxblood primary fill).
 *   - Discard = destructive outline ("DISCARD", ember secondary).
 *
 * Nested inside the parent `LogFlowModal` Radix Dialog — Radix handles the
 * focus-trap handoff cleanly.
 */
import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { t } from '@/lib/i18n/en';

export interface DiscardDraftAlertDialogProps {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}

export function DiscardDraftAlertDialog({
  open,
  onCancel,
  onDiscard,
}: DiscardDraftAlertDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-testid="discard-overlay" className="kalori-discard-overlay" />
        <AlertDialog.Content data-testid="discard-dialog" className="kalori-discard-content">
          <AlertDialog.Title className="kalori-discard-title">
            {t.log.discardPromptTitle}
          </AlertDialog.Title>
          <AlertDialog.Description className="kalori-discard-description">
            {t.log.discardPromptDescription}
          </AlertDialog.Description>
          <div className="kalori-discard-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" data-testid="discard-cancel" className="kalori-discard-cancel">
                {t.log.discardPromptKeep}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                data-testid="discard-confirm"
                onClick={onDiscard}
                className="kalori-discard-confirm"
              >
                {t.log.discardPromptDiscard}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default DiscardDraftAlertDialog;
