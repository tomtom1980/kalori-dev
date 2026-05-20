'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { t } from '@/lib/i18n/en';

export interface DuplicateLogConfirmDialogProps {
  open: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DuplicateLogConfirmDialog({
  open,
  message,
  onCancel,
  onConfirm,
}: DuplicateLogConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="kalori-library-dialog-overlay" />
        <AlertDialog.Content
          className="kalori-library-dialog-content"
          data-testid="duplicate-log-dialog"
        >
          <p className="kalori-library-dialog-kicker">{t.log.duplicateFoodConfirmKicker}</p>
          <AlertDialog.Title className="kalori-library-dialog-title">
            {t.log.duplicateFoodConfirmTitle}
          </AlertDialog.Title>
          <AlertDialog.Description className="kalori-library-dialog-body">
            {message}
          </AlertDialog.Description>
          <div className="kalori-library-dialog-actions">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                data-testid="duplicate-log-cancel"
                className="kalori-library-btn-ghost"
              >
                {t.log.duplicateFoodConfirmCancel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                data-testid="duplicate-log-confirm"
                className="kalori-log-cta"
                onClick={onConfirm}
              >
                {t.log.duplicateFoodConfirmProceed}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function useDuplicateLogConfirm(message: string): {
  confirm: () => Promise<boolean>;
  dialog: ReactNode;
} {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback(() => {
    return new Promise<boolean>((resolver) => {
      resolverRef.current = resolver;
      setOpen(true);
    });
  }, []);

  return {
    confirm,
    dialog: (
      <DuplicateLogConfirmDialog
        open={open}
        message={message}
        onCancel={() => resolve(false)}
        onConfirm={() => resolve(true)}
      />
    ),
  };
}

export default DuplicateLogConfirmDialog;
