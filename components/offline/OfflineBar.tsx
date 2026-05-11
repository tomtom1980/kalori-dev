'use client';

/**
 * Task 5.1.4 — `<OfflineBar />` persistent top-of-viewport offline indicator.
 *
 * Surface contract (Ledger aesthetic — `task-5.1-ui-design-lead.md` §B):
 * - Fixed-position 32px-tall strip at `inset-block-start: 0`, `bg-2` fill,
 *   1px `rule-strong` bottom border, no top border, zero radius.
 * - Mounts only when offline OR queueDepth > 0 OR sync state is in motion.
 *
 * CLS = 0 contract
 * ────────────────
 * - The bar is `position: fixed` — never inserts into normal flow.
 * - Layout reservation lives via `html[data-offline="true"]` set imperatively
 *   by this component on visibility change. CSS rule (in app/globals.css)
 *   adds `padding-block-start: 32px` to body when the attribute is present.
 *   Both transitions happen in the same render cycle, so CLS is exactly 0.
 *
 * Accessibility (`task-5.1-ui-ux-auditor.md` §C/§D + Codex Round 1 F5)
 * ────────────────────────────────────────────────────────────────────
 * - The OUTER container is a positional wrapper only — no `role`,
 *   `aria-live`, or `aria-atomic`. Codex F5: previously the outer
 *   container carried `role="status" aria-live="polite" aria-atomic="true"`
 *   AND contained the `<ReplayStatusBadge>` button whose text reflects
 *   queue depth. That meant queue-depth ticks landed inside an atomic
 *   live region, contradicting the "status-only / no count tick"
 *   announcement policy and putting a focusable control inside a live
 *   status container.
 * - The live region is now a dedicated inner `<span>` (the sr-only
 *   announcement span). It carries `role="status" aria-live="polite"
 *   aria-atomic="false"` (or `role="alert" aria-live="assertive"` on
 *   error escalation). `aria-atomic="false"` ensures count updates do
 *   not re-announce the entire region.
 * - The `<ReplayStatusBadge>` button is rendered OUTSIDE the live region
 *   tree as a sibling of the announcement span — its queue-depth
 *   updates do not echo to assistive tech.
 * - The visible text + badge are `aria-hidden="true"` so the AT layer
 *   only ever reads the curated transition-only announcement string.
 *
 * R1 / I11 / R3
 * ─────────────
 * - Zero raw `fetch()` — retry routes through `actions.retry()` which is the
 *   provider's `requestFlush` alias (delegates to `outbox.flush()` → authFetch).
 * - No `client_id` mutation — the bar reads counts and status only.
 * - `'use client'`; mounted under `<OfflineQueueProvider>` in the (app) shell.
 */

import { useEffect, useLayoutEffect } from 'react';

import { t } from '@/lib/i18n/en';
import { useOutbox } from '@/lib/offline/use-outbox';

import { ReplayStatusBadge } from '@/components/pwa/ReplayStatusBadge';

// Codex F1 fix: data-offline attribute toggle MUST run in the layout phase
// (synchronous with commit, before paint) so the body padding reservation
// lands in the same frame as the bar mount. useLayoutEffect warns on the
// server — fall back to useEffect on SSR (no document available there
// anyway, so the toggle is a no-op).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const BAR_HEIGHT_PX = 32;

function formatHHmm(ts: number | null): string {
  if (ts === null) return '—';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDepth(n: number): string {
  return n >= 100 ? '99+' : String(n);
}

interface BarCopy {
  visible: string;
  announce: string;
  /** Whether the surface should escalate from polite/status → assertive/alert. */
  isError: boolean;
  /** Whether the bar is interactive (tap to retry on error). */
  isInteractive: boolean;
}

function deriveCopy(opts: {
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: string;
}): BarCopy {
  const { queueDepth, lastFlushAt, replayStatus } = opts;
  const hhmm = formatHHmm(lastFlushAt);
  const depthStr = formatDepth(queueDepth);
  const isPlural = queueDepth >= 2 || queueDepth === 0;

  if (replayStatus === 'error') {
    return {
      visible:
        queueDepth === 1
          ? t.pwa.bar.errorSingular
          : t.pwa.bar.errorPluralFormat.replace('{N}', depthStr),
      announce: t.pwa.bar.announcementError,
      isError: true,
      isInteractive: true,
    };
  }

  if (replayStatus === 'replaying') {
    return {
      visible:
        queueDepth === 1
          ? t.pwa.bar.syncingSingular
          : t.pwa.bar.syncingPluralFormat.replace('{N}', depthStr),
      announce: t.pwa.bar.announcementSyncing,
      isError: false,
      isInteractive: false,
    };
  }

  if (replayStatus === 'success') {
    return {
      visible:
        queueDepth === 1
          ? t.pwa.bar.syncedSingularFormat.replace('{HH:mm}', hhmm)
          : t.pwa.bar.syncedPluralFormat.replace('{N}', depthStr).replace('{HH:mm}', hhmm),
      announce: t.pwa.bar.announcementSynced,
      isError: false,
      isInteractive: false,
    };
  }

  // Default offline copy variants.
  if (queueDepth === 0) {
    return {
      visible: t.pwa.bar.offlineCachedAtFormat.replace('{HH:mm}', hhmm),
      announce: t.pwa.bar.announcementOffline,
      isError: false,
      isInteractive: false,
    };
  }
  if (queueDepth === 1) {
    return {
      visible: t.pwa.bar.offlineSingularFormat.replace('{HH:mm}', hhmm),
      announce: t.pwa.bar.announcementOffline,
      isError: false,
      isInteractive: false,
    };
  }
  if (queueDepth >= 100) {
    return {
      visible: t.pwa.bar.offlineCappedFormat.replace('{HH:mm}', hhmm),
      announce: t.pwa.bar.announcementOffline,
      isError: false,
      isInteractive: false,
    };
  }
  return {
    visible: t.pwa.bar.offlinePluralFormat.replace('{N}', depthStr).replace('{HH:mm}', hhmm),
    announce: t.pwa.bar.announcementOffline,
    isError: false,
    isInteractive: isPlural,
  };
}

export function OfflineBar(): React.ReactElement | null {
  const { online, queueDepth, lastFlushAt, replayStatus, actions, meta } = useOutbox();

  const visible =
    !online ||
    queueDepth > 0 ||
    replayStatus === 'replaying' ||
    replayStatus === 'success' ||
    replayStatus === 'error';

  // Reserved-space contract: set `data-offline="true"` on <html> while the
  // bar is mounted so the global CSS rule applies the 32px padding. Cleared
  // on unmount AND when the bar transitions back to invisible.
  //
  // Codex F1: layout-phase effect — runs synchronously with commit so the
  // body padding reservation lands in the SAME frame as the fixed bar
  // mount. With a passive useEffect there would be a 1-frame race where
  // the bar paints over un-padded content (CLS > 0); useLayoutEffect
  // closes that race.
  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (visible) {
      document.documentElement.setAttribute('data-offline', 'true');
      return () => {
        document.documentElement.removeAttribute('data-offline');
      };
    }
    document.documentElement.removeAttribute('data-offline');
    return undefined;
  }, [visible]);

  if (!visible) return null;

  const copy = deriveCopy({ queueDepth, lastFlushAt, replayStatus });

  const role = copy.isError ? 'alert' : 'status';
  const ariaLive = copy.isError ? 'assertive' : 'polite';

  // Color treatment per `task-5.1-ui-design-lead.md` §B states table.
  //
  // Task 5.1.6 AC4 — replay-success contrast fix (ux-auditor §E):
  // success state uses ivory text + adjacent moss glyph.
  //
  // Task 5.1.6 Codex Round 1 (C-3): every NON-success state previously
  // rendered text in oxblood / ember / sand — none of which clear AAA
  // (≥7:1) on bg-2 (`#15100D`). The fix mirrors C-2 (ReplayStatusBadge):
  //   - Visible text always uses ivory (~15.98:1, AAA pass).
  //   - State signal travels via the bar's bottom border tone +
  //     adjacent state glyph (✓ moss / ⌛ ember / ! oxblood) so color
  //     is not the sole signifier (WCAG 1.4.1).
  // The curated `aria-live` announcement (`offline-bar-live` span)
  // remains the AT signal.
  const textColor = 'var(--color-ivory)';
  const borderColor = copy.isError
    ? 'var(--color-oxblood)'
    : replayStatus === 'success'
      ? 'var(--color-moss)'
      : replayStatus === 'replaying'
        ? 'var(--color-ember)'
        : 'var(--color-rule-strong)';
  // Codex Round 2 (C2-2): every state — including idle/offline — must
  // render a non-empty glyph so colour is not the sole signifier
  // (WCAG 1.4.1). The legacy `stateGlyph: null` branch failed that
  // contract; the new idle-offline glyph is `⚡` (offline-bolt) which
  // pairs visually with the offline copy and renders in dust so it
  // does not compete with the active-state glyphs (ember / oxblood / moss).
  const stateGlyph: { glyph: string; glyphColor: string } = copy.isError
    ? { glyph: '!', glyphColor: 'var(--color-oxblood-soft)' }
    : replayStatus === 'success'
      ? { glyph: '✓', glyphColor: 'var(--color-moss)' }
      : replayStatus === 'replaying'
        ? { glyph: '⌛', glyphColor: 'var(--color-ember)' }
        : { glyph: '⚡', glyphColor: 'var(--color-dust)' };

  const handleClick = (): void => {
    if (!copy.isInteractive) return;
    void actions.retry();
  };

  return (
    <div
      data-testid="offline-bar"
      data-reduced-motion={meta.isReducedMotion ? 'true' : 'false'}
      data-replay-status={replayStatus}
      // Codex F5 — the outer container is a positional wrapper only. No
      // role, aria-live, or aria-atomic here — those live on the inner
      // `<span data-testid="offline-bar-live">` so queue-depth ticks (badge
      // text) and the focusable badge button do NOT sit inside an atomic
      // live region. tabIndex stays here (so the click handler is
      // keyboard-reachable when interactive), but the outer container is
      // not announced.
      tabIndex={-1}
      onClick={copy.isInteractive ? handleClick : undefined}
      style={{
        position: 'fixed',
        top: 0,
        insetBlockStart: 0,
        left: 0,
        right: 0,
        height: `${BAR_HEIGHT_PX}px`,
        zIndex: 25,
        backgroundColor: 'var(--color-bg-2)',
        // Codex Round 1 (C-3): bottom border tone is the visual state
        // signal; the text itself stays ivory for AAA contrast.
        borderBottom: `1px solid ${borderColor}`,
        color: textColor,
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: '12px',
        letterSpacing: '0.04em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: copy.isInteractive ? 'pointer' : 'default',
        opacity: 1,
        transition: meta.isReducedMotion ? 'none' : 'opacity 120ms linear',
      }}
    >
      {/* Visible label carries live values; aria-hidden so AT only reads the
          inner sr-only announcement span. */}
      <span aria-hidden="true">{copy.visible}</span>
      {/* Task 5.1.6 Codex Round 1 (C-3) — per-state glyph adjacent to the
          ivory copy. Non-success states (error / replaying) used to rely
          on a low-contrast text color (oxblood ~2.3:1, ember ~3.5:1) for
          the state signal; that signal now lives on the GLYPH (color-not-
          sole-signifier per WCAG 1.4.1) plus the border tone. The
          glyph is `aria-hidden` so the curated `offline-bar-live` span
          stays the single source of truth for assistive tech. The
          legacy `offline-bar-success-glyph` test-id is retained for the
          success state so existing tests pass without a churn. */}
      <span
        data-testid={
          replayStatus === 'success' ? 'offline-bar-success-glyph' : 'offline-bar-state-glyph'
        }
        data-state={replayStatus}
        aria-hidden="true"
        style={{
          color: stateGlyph.glyphColor,
          marginInlineStart: '6px',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: '12px',
        }}
      >
        {stateGlyph.glyph}
      </span>
      {/* Task 5.1.5 — Replay status badge composes into the bar's flex row
          when queueDepth > 0. Codex F5: badge sits OUTSIDE the live-region
          tree (the `<span data-testid="offline-bar-live">` below) so its
          count-changing aria-label does not echo through the live region.
          The badge owns its own `aria-label` for AT context. */}
      <ReplayStatusBadge />
      <span
        // Codex F5 — DEDICATED live-region span. The outer container is
        // no longer a live region; this span owns role/aria-live/aria-atomic.
        // `aria-atomic="false"` ensures count updates do not re-announce
        // the entire region (status-only policy per ux-specialist §B.4 +
        // ux-auditor §D). The badge button is a sibling of the OUTER
        // container's child set but NOT of this span — it sits in the
        // visible text branch above and never inside the live region.
        data-testid="offline-bar-live"
        role={role}
        aria-live={ariaLive}
        aria-atomic="false"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {copy.announce}
      </span>
    </div>
  );
}

export default OfflineBar;
