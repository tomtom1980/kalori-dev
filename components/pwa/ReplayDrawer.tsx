'use client';

/**
 * Task 5.1.5 — `<ReplayDrawer />` per-row pending-changes review surface.
 *
 * Primitive: `@radix-ui/react-dialog` styled as a right-side sheet (project
 * pattern; mirrors `LogFlowModal`). The drawer lists outbox rows in FIFO
 * order with kind labels + per-row Discard. Aggregate Retry-all in the
 * footer when ≥1 row is failed.
 *
 * Codex Round 1 (F4) — per-row Retry button removed
 * ─────────────────────────────────────────────────
 * The original drawer rendered a per-row Retry button beside each failed
 * row, but the button called the bulk `actions.retry()` because the
 * `useOutbox` surface has no per-row retry primitive. Clicking Retry on
 * row N effectively retried the whole queue, which weakened the AC2
 * per-row review contract by lying about scope. Until
 * `F-OFFLINE-5.1.5-PER-ROW-RETRY-PROPER` lands, we surface only the
 * footer "Retry all" so the UI honestly communicates that retry is
 * queue-wide. Discard remains per-row (it is genuinely per-row in the
 * outbox API: `outbox.remove(client_id)`).
 *
 * Wiring (per briefing §5b):
 *   - Reads rows synchronously via `outbox.peek()` after open.
 *   - Subscribes to `outbox.subscribe()` for live updates while open.
 *   - Footer Retry-all → `useOutbox().actions.retry()` when ≥1 row is
 *     failed. (Threshold lowered from 2 → 1 because per-row Retry is gone;
 *     a single failed row still needs an actionable surface.)
 *   - Per-row Discard → `outbox.remove(client_id)` directly. I11 contract:
 *     `client_id` is opaque, never regenerated.
 *
 * R1 / I11 / R3:
 *   - No raw `fetch()` — every mutation routes through `useOutbox`/outbox.
 *   - `'use client'`, mounted inside `<OfflineQueueProvider>`.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { t } from '@/lib/i18n/en';
import {
  peek as outboxPeek,
  remove as outboxRemove,
  subscribe as outboxSubscribe,
} from '@/lib/offline/outbox';
import type { OutboxKind, OutboxRow } from '@/lib/offline/types';
import { useOutbox } from '@/lib/offline/use-outbox';

const KIND_LABELS: Record<OutboxKind, string> = {
  'entry-create': t.pwa.drawer.kindEntryCreate,
  'entry-delete': t.pwa.drawer.kindEntryDelete,
  'water-log': t.pwa.drawer.kindWaterLog,
  'weight-log': t.pwa.drawer.kindWeightLog,
  'library-update': t.pwa.drawer.kindLibraryUpdate,
  'library-bulk-delete': t.pwa.drawer.kindLibraryBulkDelete,
  'goal-weight-update': t.pwa.drawer.kindGoalWeightUpdate,
};

function formatHHmm(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatCreatedAt(createdAt: number): string {
  const now = Date.now();
  const diffMs = now - createdAt;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (diffMs < oneDayMs && new Date(now).getDate() === new Date(createdAt).getDate()) {
    return `today ${formatHHmm(createdAt)}`;
  }
  if (diffMs < 2 * oneDayMs) {
    return `yesterday ${formatHHmm(createdAt)}`;
  }
  const d = new Date(createdAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${formatHHmm(createdAt)}`;
}

function deriveStatus(row: OutboxRow): string {
  if (row.lastError !== null) {
    return t.pwa.drawer.statusFailedFormat.replace('{reason}', row.lastError);
  }
  return t.pwa.drawer.statusQueued;
}

export interface ReplayDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function ReplayDrawer({ open, onOpenChange }: ReplayDrawerProps): React.ReactElement {
  const { actions } = useOutbox();
  const [rows, setRows] = useState<OutboxRow[]>([]);

  const refreshRows = useCallback(async (): Promise<void> => {
    try {
      const next = await outboxPeek();
      setRows(next);
    } catch {
      // Outbox internals capture exceptions; the drawer stays non-fatal.
    }
  }, []);

  // Subscribe to the outbox while open. The subscription pushes refreshes
  // through the listener path — including the initial read, which is
  // triggered by a one-shot synthetic notify() inside this effect. Doing the
  // initial fetch inside the listener keeps the React lint rule happy
  // (no setState directly in the effect body) while still landing the live
  // depth on first render after open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const onChange = (): void => {
      if (cancelled) return;
      void refreshRows();
    };
    const unsub = outboxSubscribe(onChange);
    // Kick the listener once to seed the initial render with current rows.
    onChange();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open, refreshRows]);

  const failedRows = useMemo(() => rows.filter((r) => r.lastError !== null), [rows]);
  // Codex F4 — show footer Retry-all whenever there is ANY failed row.
  // (Was `>= 2` when the per-row Retry button still existed; now that
  // per-row Retry is gone, the footer is the only retry surface.)
  const showRetryAll = failedRows.length >= 1;
  const subtitle =
    rows.length === 1
      ? t.pwa.drawer.subtitleSingular
      : t.pwa.drawer.subtitlePluralFormat.replace('{N}', String(rows.length));

  const handleRetry = useCallback((): void => {
    void actions.retry();
  }, [actions]);

  const handleDiscard = useCallback(
    async (client_id: string): Promise<void> => {
      await outboxRemove(client_id);
      // Refresh list — the outbox emitter will also notify, but call directly
      // to keep the optimistic UI snappy when the emitter is throttled.
      await refreshRows();
    },
    [refreshRows],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="replay-drawer-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 50,
          }}
        />
        <Dialog.Content
          id="replay-drawer"
          data-testid="replay-drawer"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100vh',
            width: 'min(440px, 90vw)',
            background: 'var(--color-bg-1)',
            borderLeft: '1px solid var(--color-rule-strong)',
            borderRadius: 'var(--radius-modal)',
            zIndex: 51,
            display: 'flex',
            flexDirection: 'column',
            color: 'var(--color-ivory)',
          }}
        >
          <header
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-rule)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <Dialog.Title
                style={{
                  fontFamily: 'var(--font-newsreader)',
                  fontWeight: 300,
                  fontSize: '24px',
                  color: 'var(--color-ivory)',
                  margin: 0,
                }}
              >
                {t.pwa.drawer.title}
              </Dialog.Title>
              <Dialog.Description
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '11px',
                  color: 'var(--color-dust)',
                  marginTop: '4px',
                }}
              >
                {rows.length === 0 ? '' : subtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                data-testid="replay-drawer-close"
                aria-label={t.pwa.drawer.closeAria}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  background: 'transparent',
                  border: 0,
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </Dialog.Close>
          </header>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '12px 0',
            }}
          >
            {rows.length === 0 ? (
              <p
                data-testid="replay-drawer-empty"
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-newsreader)',
                  fontSize: '14px',
                }}
              >
                {t.pwa.drawer.empty}
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                }}
              >
                {rows.map((row) => {
                  const kindLabel = KIND_LABELS[row.kind];
                  const status = deriveStatus(row);
                  return (
                    <li
                      key={row.client_id}
                      data-testid={`replay-drawer-row-${row.client_id}`}
                      style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--color-rule)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono)',
                            fontSize: '12px',
                            color: 'var(--color-ivory)',
                          }}
                        >
                          {kindLabel}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono)',
                            fontSize: '10.5px',
                            color: 'var(--color-dust)',
                            marginTop: '2px',
                          }}
                        >
                          {formatCreatedAt(row.createdAt)} · <span>{status}</span>
                        </div>
                      </div>
                      {/* Codex F4 — per-row Retry button removed because
                          it called bulk `actions.retry()` (no per-row retry
                          primitive in `useOutbox` yet). Footer Retry-all
                          remains the honest retry surface. Per-row retry
                          tracked under `F-OFFLINE-5.1.5-PER-ROW-RETRY-PROPER`. */}
                      <button
                        type="button"
                        data-testid={`replay-drawer-discard-${row.client_id}`}
                        aria-label={t.pwa.drawer.discardAriaFormat.replace(
                          '{kindLabel}',
                          kindLabel,
                        )}
                        onClick={() => {
                          void handleDiscard(row.client_id);
                        }}
                        style={{
                          minWidth: '44px',
                          minHeight: '44px',
                          background: 'transparent',
                          border: '1px solid var(--color-rule)',
                          color: 'var(--color-dust)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: '11px',
                          padding: '0 12px',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-modal)',
                        }}
                      >
                        {t.pwa.drawer.discardButton}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {showRetryAll ? (
            <footer
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--color-rule)',
              }}
            >
              <button
                type="button"
                data-testid="replay-drawer-retry-all"
                aria-label={t.pwa.drawer.retryAllAriaFormat.replace(
                  '{N}',
                  String(failedRows.length),
                )}
                onClick={handleRetry}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  background: 'transparent',
                  border: '1px solid var(--color-rule-strong)',
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '12px',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-modal)',
                }}
              >
                {t.pwa.drawer.retryAllButton}
              </button>
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ReplayDrawer;
