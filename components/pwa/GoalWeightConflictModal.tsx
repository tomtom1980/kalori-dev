'use client';

/**
 * Task 5.1.5 — F10 goal-weight conflict modal + silent-LWW side-effect host.
 *
 * Three policy paths (post-Codex Round 1 F1 reconciliation):
 *
 * 1. **Library silent-LWW side-effect** (`library-update` /
 *    `library-bulk-delete`). When `useOutbox().replayStatus === 'conflict'`
 *    AND the resolver returns `'lww-silent'`, the host calls
 *    `actions.resolveConflict(client_id, 'use-current')` so the row dequeues
 *    silently. The host tracks the `client_id` in `dispatchedSilentRef`
 *    ONLY AFTER `actions.resolveConflict` resolves successfully so a
 *    failed dequeue does not permanently suppress retry (Codex F3).
 *
 * 2. **Fail-loud, no-op host** (`entry-create` / `entry-delete` /
 *    `water-log` / `weight-log`). When the resolver returns `'fail-loud'`,
 *    the host does nothing: the row stays queued in `conflict` state and
 *    surfaces in the OfflineBar replay-status badge + ReplayDrawer for the
 *    user to review/Discard manually. Followup
 *    `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` tracks the proper client-wins
 *    re-submit path.
 *
 * 3. **Goal-weight modal** (`goal-weight-update`). When the resolver
 *    returns `'prompt-user'`, mount the Radix `AlertDialog`. The modal
 *    presents a single primary CTA ("USE CURRENT VALUE", per Codex F2 —
 *    `'keep-offline'` was removed because both buttons resolved to the
 *    same call, lying to the user) plus a non-destructive Cancel button
 *    that closes the modal and leaves the row in conflict for the next
 *    session. ESC = Cancel = non-destructive close (Codex F2).
 *
 * Why a single host
 * ─────────────────
 * The three paths share the same gate (replayStatus + first conflict's
 * kind). Centralising them avoids two parallel components racing the same
 * conflict queue and mis-dispatching `actions.resolveConflict` twice.
 *
 * R1 / I11:
 *   - Zero raw `fetch()`. All mutations go through `actions.resolveConflict`.
 *   - `client_id` flows opaquely from the conflict record into
 *     `actions.resolveConflict`; never mutated.
 *
 * Accessibility (briefing §5c + ux-auditor + Codex F2):
 *   - `role="alertdialog"` (Radix AlertDialog).
 *   - `aria-modal="true"` (Radix).
 *   - `aria-labelledby="conflict-title"` + `aria-describedby="conflict-body"`
 *     wired explicitly via Radix props.
 *   - **First focus on Cancel** via the `<AlertDialog.Cancel>` slot — the
 *     non-destructive default (closes modal, leaves row queued).
 *   - **ESC = Cancel** (Codex F2). ESC closes the modal without resolving;
 *     the conflicted row stays in the queue for the next session.
 *   - **Scrim click disabled** by Radix AlertDialog primitive (alertdialog
 *     semantics require explicit user action). Marker attribute documents
 *     the contract for tests and reviewers.
 */

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { resolveConflict } from '@/lib/offline/conflict-resolver';
import { useOutbox } from '@/lib/offline/use-outbox';

interface GoalWeightConflictPayload {
  goal_weight_kg?: number;
  updated_at?: string;
  local_value_kg?: number;
  local_set_at?: string;
}

function formatTimestamp(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: '—', time: '—:—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—:—' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function asPayload(current: unknown): GoalWeightConflictPayload {
  if (current && typeof current === 'object') {
    return current as GoalWeightConflictPayload;
  }
  return {};
}

export function GoalWeightConflictModalHost(): React.ReactElement | null {
  const { replayStatus, conflicts, actions } = useOutbox();
  const firstConflict = conflicts[0] ?? null;
  // Codex F3 — track in-flight dispatches separately from the suppression
  // set. Adding to `dispatchedSilentRef` BEFORE `actions.resolveConflict`
  // resolves caused permanent suppression when `outbox.remove` returned
  // false (provider returns without state change, conflict stays in
  // snapshot, but this component refused to retry the same id). The
  // in-flight set guards against re-entry inside the same render cycle;
  // we only add to the suppression set AFTER the call resolves.
  const inFlightRef = useRef<Set<string>>(new Set());
  const dispatchedSilentRef = useRef<Set<string>>(new Set());
  // Codex F2 — track which goal-weight conflicts the user explicitly
  // cancelled (ESC or Cancel button). These ids are skipped for the rest
  // of this session so the modal does not re-mount as long as the
  // conflict stays in the snapshot. The outbox row is left untouched —
  // a subsequent session (or explicit Drawer interaction) can resolve it.
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (replayStatus !== 'conflict') return;
    if (!firstConflict) return;
    const decision = resolveConflict({
      kind: firstConflict.kind,
      serverCurrent: firstConflict.current,
      // The pure resolver only inspects `kind`; we pass an opaque
      // placeholder body so the type is satisfied without leaking outbox
      // internals into the UI layer.
      localBody: { client_id: firstConflict.client_id },
    });
    // Codex F1 — only `'lww-silent'` triggers an auto-dispatch. `'fail-loud'`
    // intentionally falls through (no-op host); the row stays queued and
    // surfaces in the badge + drawer for manual review. `'prompt-user'`
    // mounts the modal below.
    if (decision.policy !== 'lww-silent') return;
    // Codex F3 — re-entry guard + post-success suppression. Skip if a
    // dispatch is already in flight or has already succeeded for this id.
    const cid = firstConflict.client_id;
    if (inFlightRef.current.has(cid)) return;
    if (dispatchedSilentRef.current.has(cid)) return;
    inFlightRef.current.add(cid);
    void actions
      .resolveConflict(cid, 'use-current')
      .then(() => {
        // Only suppress retries AFTER the provider transitions out of
        // `conflict`. The provider's `resolveConflict` is a no-op when
        // `outbox.remove` returns false, so success here means the
        // snapshot will drop this id on the next tick — safe to mark
        // dispatched.
        dispatchedSilentRef.current.add(cid);
      })
      .finally(() => {
        // Always clear the in-flight flag so a follow-up render can retry
        // if the provider stayed in `conflict` (fail path) or has already
        // transitioned away (success path — the suppression set covers it).
        inFlightRef.current.delete(cid);
      });
  }, [replayStatus, firstConflict, actions]);

  // Only mount the AlertDialog when we're in conflict state AND the first
  // conflict is the goal-weight kind that needs the user prompt AND the
  // user has not already cancelled this specific conflict in this session
  // (Codex F2 — Cancel = non-destructive close).
  const showModal =
    replayStatus === 'conflict' &&
    firstConflict !== null &&
    firstConflict.kind === 'goal-weight-update' &&
    !dismissedIds.has(firstConflict.client_id);

  if (!showModal || !firstConflict) {
    return null;
  }

  const payload = asPayload(firstConflict.current);
  const localValue = payload.local_value_kg ?? null;
  const serverValue = payload.goal_weight_kg ?? null;
  const localTs = formatTimestamp(payload.local_set_at);
  const serverTs = formatTimestamp(payload.updated_at);

  const localValueStr = localValue !== null ? String(localValue) : '—';
  const serverValueStr = serverValue !== null ? String(serverValue) : '—';

  const bodyText = t.pwa.conflict.bodyFormat
    .replace('{localValue}', localValueStr)
    .replace('{serverValue}', serverValueStr);

  const offlineRow = t.pwa.conflict.tableOfflineFormat
    .replace('{localValue}', localValueStr)
    .replace('{YYYY-MM-DD}', localTs.date)
    .replace('{HH:mm}', localTs.time);
  const currentRow = t.pwa.conflict.tableCurrentFormat
    .replace('{serverValue}', serverValueStr)
    .replace('{YYYY-MM-DD}', serverTs.date)
    .replace('{HH:mm}', serverTs.time);

  // Codex F2 — `handleUseOffline` was removed because it called the same
  // `'use-current'` action as `handleUseCurrent`, lying to the user. The
  // `'keep-offline'` branch is tracked under
  // `F-OFFLINE-5.1.5-KEEP-OFFLINE-DEFERRED` and will land alongside the
  // precondition-refresh metadata API.
  const handleUseCurrent = (): void => {
    void actions.resolveConflict(firstConflict.client_id, 'use-current');
  };

  // Codex F2 — Cancel = non-destructive close. Adds this conflict's
  // client_id to `dismissedIds` so the modal stops mounting for it in
  // this session. The outbox row stays queued; a fresh session (or an
  // explicit Drawer Discard) can resolve it later. Wired to both
  // AlertDialog.Cancel and `onEscapeKeyDown` (ESC) so all three close
  // affordances share the same non-destructive semantics.
  const cidForCancel = firstConflict.client_id;
  const handleCancel = (): void => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(cidForCancel);
      return next;
    });
  };

  return (
    <AlertDialog.Root open={true}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="radix-overlay"
          data-testid="conflict-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 60,
          }}
        />
        <AlertDialog.Content
          className="radix-content"
          data-testid="goal-weight-conflict-modal"
          // Radix AlertDialog (unlike Dialog) intentionally omits the
          // `onPointerDownOutside` / `onInteractOutside` callbacks because
          // alertdialog semantics REQUIRE explicit user action — outside
          // clicks are dropped by the primitive itself. This data-attribute
          // marker documents the contract for tests and reviewers.
          data-pointer-down-outside-disabled="true"
          aria-labelledby={t.pwa.conflict.titleId}
          aria-describedby={t.pwa.conflict.bodyId}
          // Radix AlertDialog implies modal semantics via the alertdialog
          // role, but emits no `aria-modal` attribute by default in this
          // version. Set it explicitly so the assertion matches WAI-ARIA
          // 1.2 expectations (briefing §5c `aria-modal="true"`).
          aria-modal="true"
          // Codex F2 — ESC = Cancel = non-destructive close. The user can
          // dismiss the modal via Escape without resolving; the conflicted
          // row stays queued. WCAG 2.1.2 No Keyboard Trap is satisfied.
          onEscapeKeyDown={() => {
            handleCancel();
          }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(440px, 92vw)',
            background: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            borderRadius: 0,
            padding: '24px',
            zIndex: 61,
            color: 'var(--color-ivory)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 500,
              fontSize: '10.5px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-oxblood-soft)',
              margin: 0,
              marginBottom: '12px',
            }}
          >
            {t.pwa.conflict.kicker}
          </p>
          <AlertDialog.Title
            id={t.pwa.conflict.titleId}
            style={{
              fontFamily: 'var(--font-newsreader)',
              fontWeight: 300,
              fontSize: '28px',
              color: 'var(--color-ivory)',
              margin: 0,
              marginBottom: '12px',
            }}
          >
            {t.pwa.conflict.title}
          </AlertDialog.Title>
          <AlertDialog.Description
            id={t.pwa.conflict.bodyId}
            style={{
              fontFamily: 'var(--font-newsreader)',
              fontSize: '15px',
              color: 'var(--color-ivory)',
              margin: 0,
              marginBottom: '16px',
              lineHeight: 1.5,
            }}
          >
            {bodyText}
          </AlertDialog.Description>
          <div
            data-testid="conflict-data-table"
            style={{
              borderTop: '1px solid var(--color-rule)',
              borderBottom: '1px solid var(--color-rule)',
              padding: '12px 0',
              marginBottom: '20px',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: '13px',
            }}
          >
            <div
              data-testid="conflict-row-offline"
              style={{
                color: 'var(--color-ivory)',
                fontVariantNumeric: 'tabular-nums',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--color-rule)',
                marginBottom: '8px',
              }}
            >
              {offlineRow}
            </div>
            <div
              data-testid="conflict-row-current"
              style={{
                color: 'var(--color-ivory)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {currentRow}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '24px',
            }}
          >
            {/* Codex F2 — Cancel button replaces the lying "USE OFFLINE
                VALUE" CTA. Non-destructive: closes the modal, leaves the
                outbox row queued. Wired to AlertDialog.Cancel slot so it
                receives initial focus and is keyboard-reachable. */}
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                data-testid="conflict-cancel"
                data-cancel-slot="true"
                onClick={handleCancel}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  background: 'transparent',
                  border: '1px solid var(--color-sand)',
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '12px',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                {t.pwa.conflict.cancelButton}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="btn-3d"
                type="button"
                data-testid="conflict-use-current"
                onClick={handleUseCurrent}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  background: 'transparent',
                  border: '1px solid var(--color-sand)',
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '12px',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                {t.pwa.conflict.useCurrentButton}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default GoalWeightConflictModalHost;
