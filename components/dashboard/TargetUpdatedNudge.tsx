'use client';

/**
 * `<TargetUpdatedNudge />` — Task 4.3b Dashboard nudge card.
 *
 * F9 mitigation: renders when `lastTargetRecalcAt > lastDashboardVisitAt`.
 * Editorial-archival voice per design-lead §3.1 — the card reads as a
 * typeset erratum slip, not a SaaS notification. Oxblood appears only as:
 *   - the 4px revision spine on the left edge
 *   - the "see why" inline link inflection
 * The headline is ivory on bg-2, numeric target in tabular mono.
 *
 * a11y per ux-specialist §8.5:
 *   - Region semantics with `role="region"` + `aria-labelledby`
 *   - Dedicated sr-only polite live region for single-announcement copy
 *   - `See why` carries `aria-expanded` + `aria-controls` (Task 2.2 modal)
 *   - Dismiss focus returns to a sensible predecessor
 *   - Idempotent replay: we gate the announcement via a sessionStorage
 *     keyed on `lastTargetRecalcAt` so re-mounts don't double-announce.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { announcePolite } from '@/lib/a11y/announce';
import { t } from '@/lib/i18n/en';

const SR_ONLY_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
};

export interface TargetUpdatedNudgeProps {
  calorieTarget: number;
  previousCalorieTarget: number | null;
  lastTargetRecalcAt: string | null;
  lastDashboardVisitAt: string | null;
  onRecalculate: () => Promise<void>;
  onDismiss: () => Promise<void>;
  /** Optional slot for the reused <HowWeCalculated /> component. */
  howWeCalculatedNode?: React.ReactNode;
  /** Controls whether the nudge should be rendered. Parent gates this at
   * the RSC boundary; the client island only announces + manages local
   * interaction state once mounted. */
  shouldRender: boolean;
}

const ANNOUNCED_STORAGE_KEY_PREFIX = 'kalori:target-nudge:announced:';

export function TargetUpdatedNudge({
  calorieTarget,
  previousCalorieTarget,
  lastTargetRecalcAt,
  onRecalculate,
  onDismiss,
  howWeCalculatedNode,
  shouldRender,
}: TargetUpdatedNudgeProps) {
  const titleId = useId();
  const panelId = useId();
  const liveId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [dismissBusy, setDismissBusy] = useState(false);
  // Codex R2-C1: recalc confirmation is no longer announced as a separate
  // sentence (option c — the mount-time `liveTargetUpdatedFormat` already
  // says the target was updated). We still expose the slot below as a
  // constant so the in-card live region keeps the single authoritative
  // announcement and doesn't flicker on re-render.
  const recalcLiveText = '';
  // Codex R2-C1: visible error surface for dismiss/recalc server failures.
  // `null` = no error. Each action's handler sets this on rejection so the
  // card can render the retry affordance instead of silently pretending to
  // have succeeded.
  const [errorState, setErrorState] = useState<'dismiss' | 'recalc' | null>(null);
  const seeWhyRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Capture the previously-focused element once on mount so Dismiss can
  // restore focus to a sensible predecessor (per design-lead §3.5).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      previousFocusRef.current = active;
    }
  }, []);

  // One-shot announce — guarded by sessionStorage keyed on the recalc
  // timestamp. Idempotent replay + route re-mount must NOT re-announce.
  useEffect(() => {
    if (!shouldRender || dismissed || !lastTargetRecalcAt) return;
    if (typeof window === 'undefined') return;
    const key = ANNOUNCED_STORAGE_KEY_PREFIX + lastTargetRecalcAt;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage unavailable (private mode) — announce anyway.
    }
    const copy = t.weight.liveTargetUpdatedFormat.replace('{newTarget}', String(calorieTarget));
    announcePolite(copy);
  }, [shouldRender, dismissed, lastTargetRecalcAt, calorieTarget]);

  // Derived live-region text (M6). Always contains the mount announcement
  // copy so axe + SR users traversing into the card find the announcement
  // inline. Recalculate Now overwrites with the recalculate-confirmation
  // copy via setRecalcLiveText. No setState-in-effect because we derive
  // from props.
  const announceCopy = t.weight.liveTargetUpdatedFormat.replace(
    '{newTarget}',
    String(calorieTarget),
  );
  const liveText = recalcLiveText || announceCopy;

  const formattedTarget = useMemo(() => formatThousands(calorieTarget), [calorieTarget]);

  const bodyCopy = useMemo(() => {
    if (previousCalorieTarget == null || previousCalorieTarget === calorieTarget) {
      return t.targetNudge.bodyDefault;
    }
    const delta = calorieTarget - previousCalorieTarget;
    if (delta < 0) {
      return t.targetNudge.bodyDecreasedFormat.replace('{delta}', String(Math.abs(delta)));
    }
    return t.targetNudge.bodyIncreasedFormat.replace('{delta}', String(delta));
  }, [previousCalorieTarget, calorieTarget]);

  if (!shouldRender || dismissed) return null;

  const handleDismiss = async () => {
    // Codex R2-C1: gate success on server confirmation. On rejection, keep
    // the card visible and surface the retry affordance. The happy path
    // (server OK) hides the card and restores focus. Any pre-existing
    // error state clears on a fresh attempt so the retry CTA disappears
    // the moment the retry is in flight.
    setDismissBusy(true);
    setErrorState(null);
    try {
      await onDismiss();
      // Happy path only — server confirmed the dismiss.
      setDismissed(true);
      if (typeof window !== 'undefined' && previousFocusRef.current) {
        const target = previousFocusRef.current;
        window.setTimeout(() => target.focus?.(), 0);
      }
    } catch {
      // Error path — card stays visible, error surface renders, no focus
      // restoration (user is still on the card and sees the retry CTA).
      setErrorState('dismiss');
    } finally {
      setDismissBusy(false);
    }
  };

  const handleRecalc = async () => {
    // Codex R2-C1: gate success on server confirmation. On rejection, keep
    // the card visible, render the error surface, and DO NOT announce
    // success. On OK, skip the "Target recalculated" live-region overwrite
    // (option c in the review prompt) — the mount-time
    // `liveTargetUpdatedFormat` announcement already says the target was
    // updated; a second announcement with identical numbers is noise.
    setRecalcBusy(true);
    setErrorState(null);
    try {
      await onRecalculate();
      // Successful save == confirmation. No additional announcement.
    } catch {
      setErrorState('recalc');
    } finally {
      setRecalcBusy(false);
    }
  };

  const handleRetry = () => {
    if (errorState === 'dismiss') {
      void handleDismiss();
    } else if (errorState === 'recalc') {
      void handleRecalc();
    }
  };

  return (
    <section
      data-testid="target-updated-nudge"
      role="region"
      aria-labelledby={titleId}
      aria-label={t.targetNudge.regionA11y}
      className="kalori-softFadeIn"
      style={{
        position: 'relative',
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: 'var(--spacing-4)',
        paddingLeft: 'calc(var(--spacing-4) + 4px)',
      }}
    >
      {/* In-card sr-only polite live region (M6). Announces state changes
         without duplicating the chrome-level #kalori-live-polite. */}
      <span
        id={liveId}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="target-updated-nudge-sr-live"
        style={SR_ONLY_STYLE}
      >
        {liveText}
      </span>
      {/* Revision spine — 4px oxblood, flush-left. Singular oxblood surface. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: 4,
          background: 'var(--color-oxblood)',
        }}
      />
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--spacing-3)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
          }}
        >
          {t.targetNudge.eyebrow}
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissBusy}
          aria-label={t.targetNudge.dismissA11y}
          data-testid="target-updated-nudge-dismiss-x"
          className="kalori-nudge-dismiss-x"
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-dust)',
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <h2
        id={titleId}
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 28,
          lineHeight: 1.2,
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.targetNudge.headlineFormat.split('{kcal}').map((chunk, i, arr) => (
          <span key={i}>
            {chunk}
            {i < arr.length - 1 ? (
              <span
                className="num"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-ivory)',
                }}
                data-testid="target-updated-nudge-kcal"
              >
                {formattedTarget}
              </span>
            ) : null}
          </span>
        ))}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-4)',
        }}
      >
        {bodyCopy}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-4)',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={handleRecalc}
          disabled={recalcBusy}
          aria-busy={recalcBusy}
          data-testid="target-updated-nudge-recalc"
          className="kalori-nudge-recalc"
          style={{
            border: '1.5px solid var(--color-rule-strong)',
            background: 'transparent',
            color: 'var(--color-sand)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: 'var(--spacing-3) var(--spacing-4)',
            minHeight: 44,
          }}
        >
          {recalcBusy ? t.targetNudge.recalculateCtaLoading : t.targetNudge.recalculateCta}
        </button>
        <button
          type="button"
          ref={seeWhyRef}
          aria-expanded={disclosureOpen}
          aria-controls={panelId}
          onClick={() => setDisclosureOpen((v) => !v)}
          data-testid="target-updated-nudge-see-why"
          className="kalori-nudge-seewhy"
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-oxblood-soft)',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            minHeight: 44,
            padding: 'var(--spacing-2) 0',
            textDecoration: disclosureOpen ? 'underline' : 'none',
            textDecorationColor: 'var(--color-oxblood-soft)',
            textUnderlineOffset: 2,
          }}
        >
          {t.targetNudge.seeWhyCta}
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissBusy}
            data-testid="target-updated-nudge-dismiss"
            aria-describedby={titleId}
            className="kalori-nudge-dismiss"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-dust)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: 'var(--spacing-3) var(--spacing-4)',
              minHeight: 44,
            }}
          >
            {t.targetNudge.dismissCta}
          </button>
        </div>
      </div>
      {howWeCalculatedNode ? (
        <div id={panelId} hidden={!disclosureOpen} style={{ marginTop: 'var(--spacing-4)' }}>
          {howWeCalculatedNode}
        </div>
      ) : null}
      {errorState !== null ? (
        <div
          role="alert"
          data-testid="target-updated-nudge-error"
          style={{
            marginTop: 'var(--spacing-4)',
            padding: 'var(--spacing-3)',
            border: '1px solid var(--color-oxblood)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--spacing-3)',
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--color-ivory)',
            }}
          >
            {errorState === 'dismiss'
              ? t.targetNudge.errorDismissCopy
              : t.targetNudge.errorRecalcCopy}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={dismissBusy || recalcBusy}
            data-testid="target-updated-nudge-retry"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-oxblood)',
              color: 'var(--color-oxblood-soft)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: 'var(--spacing-2) var(--spacing-3)',
              minHeight: 44,
            }}
          >
            {t.targetNudge.errorRetryCta}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}

export default TargetUpdatedNudge;
