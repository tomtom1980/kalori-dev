'use client';

/**
 * Task 5.1.5 — `<ReplayStatusBadge />` clickable chip composed INTO the
 * existing `<OfflineBar />` flex layout when `queueDepth > 0`.
 *
 * Surface contract (per `task-5.1.5-briefing.md` §5a):
 *   - JetBrains Mono 10.5px, dust/ember/oxblood per replay state.
 *   - Visible chip text: `[ Q · {N} ]` / `[ Q · {N} → ]` / `[ Q · {N} ⚠ ]`
 *     / `[ Q · {N} ! ]`.
 *   - Wrapped in 44×44 transparent click target (`tap-44` semantics inline).
 *   - `aria-haspopup="dialog"` + `aria-controls="replay-drawer"` +
 *     `aria-expanded` reflecting drawer state.
 *   - `aria-label` per state (briefing §5a).
 *
 * R1 / I11 / R3:
 *   - No raw `fetch()` — actions delegate to `useOutbox().actions.retry`.
 *   - `client_id` flows opaquely through the drawer; never mutated here.
 *   - `'use client'` — mounted under `<OfflineQueueProvider>`.
 *
 * Composition policy (briefing §5a + §8 step 6):
 *   - The badge is rendered FROM `OfflineBar` (surgical edit) when
 *     `queueDepth > 0`. The badge itself returns `null` when `queueDepth === 0`
 *     so the `OfflineBar` slot is always safe to wire up unconditionally.
 *   - The badge owns its own drawer-open state via local `useState` and
 *     mounts the drawer inline. Co-rendering keeps the badge/drawer pair
 *     scoped to the bar lifecycle.
 */

import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import { useOutbox } from '@/lib/offline/use-outbox';
import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

import { ReplayDrawer } from './ReplayDrawer';

const DRAWER_ID = 'replay-drawer';

interface ChipCopy {
  visible: string;
  ariaLabel: string;
  /**
   * Visible TEXT color. Codex Round 1 (C-2): always uses ivory
   * (`#F4EBDC`, ~15.98:1 vs near-black bg-2/bg-1, AAA pass) so the
   * announcement copy itself meets WCAG 1.4.6 (≥7:1) on every state.
   * The state semantic was previously encoded only via low-contrast
   * text color (dust 4.6:1 / ember ~3.5:1 / oxblood ~2.3:1) — none
   * of which clear AAA. State signal now travels via the per-state
   * `glyph` (color-not-sole-signifier per WCAG 1.4.1) PLUS the chip's
   * `borderColor` left/right rules.
   */
  textColor: string;
  /** State-toned border / underline. Visual signal, not the AT signal. */
  borderColor: string;
  /**
   * Per-state glyph rendered adjacent to the text, color-tinted with
   * `glyphColor`. Sighted users get the redundant signal; AT readers
   * see only the curated `aria-label`.
   */
  glyph: string;
  glyphColor: string;
}

function deriveChipCopy(opts: { queueDepth: number; replayStatus: ReplayStatus }): ChipCopy {
  const { queueDepth, replayStatus } = opts;
  const depthStr = String(queueDepth);
  const isSingular = queueDepth === 1;

  switch (replayStatus) {
    case 'replaying':
      return {
        visible: isSingular
          ? t.pwa.badge.replayingSingular
          : t.pwa.badge.replayingPluralFormat.replace('{N}', depthStr),
        ariaLabel: t.pwa.badge.ariaReplayingFormat.replace('{N}', depthStr),
        textColor: 'var(--color-ivory)',
        borderColor: 'var(--color-ember)',
        glyph: '⌛',
        glyphColor: 'var(--color-ember)',
      };
    case 'conflict':
      return {
        visible: isSingular
          ? t.pwa.badge.conflictSingular
          : t.pwa.badge.conflictPluralFormat.replace('{N}', depthStr),
        ariaLabel: t.pwa.badge.ariaConflictFormat.replace('{N}', depthStr),
        textColor: 'var(--color-ivory)',
        borderColor: 'var(--color-ember)',
        glyph: '⚠',
        glyphColor: 'var(--color-ember)',
      };
    case 'error':
      return {
        visible: isSingular
          ? t.pwa.badge.errorSingular
          : t.pwa.badge.errorPluralFormat.replace('{N}', depthStr),
        ariaLabel: t.pwa.badge.ariaErrorFormat.replace('{N}', depthStr),
        textColor: 'var(--color-ivory)',
        borderColor: 'var(--color-oxblood)',
        glyph: '!',
        glyphColor: 'var(--color-oxblood-soft)',
      };
    case 'success':
    case 'idle':
    default:
      return {
        visible: isSingular
          ? t.pwa.badge.idleSingular
          : t.pwa.badge.idlePluralFormat.replace('{N}', depthStr),
        ariaLabel: t.pwa.badge.ariaIdleFormat.replace('{N}', depthStr),
        textColor: 'var(--color-ivory)',
        borderColor: 'var(--color-rule-strong)',
        // Codex Round 2 (C2-1): every visible state must render a
        // non-empty glyph so colour is not the sole signifier.
        // `·` (middle-dot) reads "inert / no-action-pending" — pairs
        // semantically with the `Q · {N}` visible copy.
        glyph: '·',
        glyphColor: 'var(--color-dust)',
      };
  }
}

export function ReplayStatusBadge(): React.ReactElement | null {
  const { queueDepth, replayStatus } = useOutbox();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Briefing §5a: badge hides when nothing is queued. The success state
  // also collapses to OfflineBar's "Synced" handling (queueDepth=0 by then).
  if (queueDepth === 0) {
    return null;
  }

  const copy = deriveChipCopy({ queueDepth, replayStatus });

  return (
    <>
      <button
        type="button"
        data-testid="replay-status-badge"
        data-replay-status={replayStatus}
        aria-haspopup="dialog"
        aria-controls={DRAWER_ID}
        aria-expanded={drawerOpen}
        aria-label={copy.ariaLabel}
        onClick={() => setDrawerOpen(true)}
        style={{
          minWidth: '44px',
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '0 8px',
          background: 'transparent',
          border: 0,
          // Codex Round 1 (C-2): the state signal moves OFF the text color
          // (every state's text is now ivory ~15.98:1 AAA on bg-2/bg-1)
          // and ONTO the left/right border tone + adjacent glyph. Color is
          // therefore not the sole signifier (WCAG 1.4.1) AND every state
          // clears WCAG 1.4.6 enhanced contrast.
          borderLeft: `1px solid ${copy.borderColor}`,
          borderRight: `1px solid ${copy.borderColor}`,
          borderRadius: 0,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: '10.5px',
          letterSpacing: '0.04em',
          color: copy.textColor,
          cursor: 'pointer',
        }}
      >
        {copy.glyph ? (
          <span
            data-testid="replay-status-badge-glyph"
            aria-hidden="true"
            style={{
              color: copy.glyphColor,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: '10.5px',
            }}
          >
            {copy.glyph}
          </span>
        ) : null}
        <span>{copy.visible}</span>
      </button>
      <ReplayDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}

export default ReplayStatusBadge;
