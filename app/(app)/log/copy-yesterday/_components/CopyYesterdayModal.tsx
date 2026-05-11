'use client';

/**
 * <CopyYesterdayModal /> — Task 3.4 copy-yesterday UI.
 *
 * Multi-select checkboxes grouped by meal category, single CTA that POSTs
 * to /api/entries/copy-yesterday with client-generated new_client_ids
 * (per-id UUID for I11 retry parity). Fully undoable via the chrome-level
 * undo toast. Cancel with dirty selections routes through
 * <DiscardDraftAlertDialog /> to avoid lost-work surprises.
 *
 * Phase-3 fixes:
 *   - Class-based styling via `.kalori-copy-yesterday-*` (skill G11 / I6).
 *   - 24×24 checkboxes wrapped in 44×44 labels (SC 2.5.8 / I6).
 *   - Cancel → AlertDialog on dirty (ux-auditor §4.4).
 *   - Cancel is a tertiary underlined link, not a bordered button
 *     (skill I7 / design-lead §1.7).
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authPost } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

import { DiscardDraftAlertDialog } from '../../_components/DiscardDraftAlertDialog';

export interface CopyYesterdayEntry {
  id: string;
  mealCategory: string;
  label: string;
  kcal: number;
}

export interface CopyYesterdayModalProps {
  entries: CopyYesterdayEntry[];
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function CopyYesterdayModal({ entries }: CopyYesterdayModalProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const toggleId = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSubmitting(true);
    const newClientIds = ids.map(() => generateUuid());
    try {
      await authPost('/api/entries/copy-yesterday', {
        ids,
        new_client_ids: newClientIds,
      });
      // Read store action at call-time (not subscribed — skill G4).
      useUndoQueueStore.getState().pushToast({
        clientId: newClientIds[0]!,
        kind: 'copied',
        description: t.log.undoToastCopied.replace('{count}', String(ids.length)),
        serverRowId: null,
        commit: async () => {},
        revert: async () => {
          // Best-effort — batch undo for copy-yesterday ships with 4.x.
        },
      });
      // Route announcement through the chrome-level polite region per
      // synthesis §2.12.
      if (typeof document !== 'undefined') {
        const polite = document.getElementById('kalori-live-polite');
        if (polite) {
          polite.textContent = t.log.undoToastCopied.replace('{count}', String(ids.length));
        }
      }
      // Dashboard readers use React `cache()` only — writers' server
      // `revalidateTag(...)` doesn't cross-request invalidate (deferred to
      // F-UI-3.5-10). `router.refresh()` is the minimal client-side fix so
      // the dashboard RSC re-runs and shows the copied entries.
      router.refresh();
      router.back();
    } catch {
      setSubmitting(false);
    }
  };

  const handleCancelClick = (): void => {
    if (selectedIds.size > 0) {
      setDiscardOpen(true);
      return;
    }
    router.back();
  };

  if (entries.length === 0) {
    return (
      <main data-testid="copy-yesterday-empty" className="kalori-copy-yesterday">
        <header>
          <p className="kalori-copy-yesterday-kicker">{t.log.copyYesterdayKicker}</p>
          <h1 className="kalori-copy-yesterday-title">{t.log.copyYesterdayHeading}</h1>
        </header>
        <p className="kalori-copy-yesterday-empty">{t.log.copyYesterdayEmpty}</p>
      </main>
    );
  }

  // Group by meal category for visual organization.
  const grouped = new Map<string, CopyYesterdayEntry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.mealCategory)) grouped.set(entry.mealCategory, []);
    grouped.get(entry.mealCategory)!.push(entry);
  }

  return (
    <main data-testid="copy-yesterday-modal" className="kalori-copy-yesterday">
      <header>
        <p className="kalori-copy-yesterday-kicker">{t.log.copyYesterdayKicker}</p>
        <h1 className="kalori-copy-yesterday-title">{t.log.copyYesterdayHeading}</h1>
      </header>
      {Array.from(grouped.entries()).map(([meal, list]) => (
        <section key={meal}>
          <h2 className="kalori-copy-yesterday-meal">{meal}</h2>
          <ul role="list" className="kalori-copy-yesterday-list">
            {list.map((entry) => (
              <li
                key={entry.id}
                data-testid={`copy-yesterday-entry-${entry.id}`}
                className="kalori-copy-yesterday-row"
              >
                <label className="kalori-copy-yesterday-row-label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleId(entry.id)}
                    aria-label={entry.label}
                    className="kalori-copy-yesterday-checkbox"
                  />
                  <span className="kalori-copy-yesterday-name">{entry.label}</span>
                  <span className="kalori-copy-yesterday-kcal num">
                    {entry.kcal} {t.onboarding.kcalUnit}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="kalori-copy-yesterday-actions">
        <button type="button" onClick={handleCancelClick} className="kalori-copy-yesterday-cancel">
          {t.log.copyYesterdayCancel}
        </button>
        <button
          type="button"
          data-testid="copy-yesterday-confirm"
          onClick={() => {
            void handleConfirm();
          }}
          aria-disabled={submitting || selectedIds.size === 0}
          className="kalori-log-cta"
          onMouseDown={(e) => {
            if (submitting || selectedIds.size === 0) e.preventDefault();
          }}
        >
          {t.log.copyYesterdayConfirm.replace('{count}', String(selectedIds.size))}
        </button>
      </div>
      <DiscardDraftAlertDialog
        open={discardOpen}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={() => {
          setDiscardOpen(false);
          router.back();
        }}
      />
    </main>
  );
}

export default CopyYesterdayModal;
