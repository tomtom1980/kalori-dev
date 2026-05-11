'use client';

/**
 * `<OnboardingProgressBar />` — 8-dash Ledger progress indicator.
 *
 * Design-lead §3: 1px dashes, `flex: 1`, gap 8px; pending =
 * `rule-strong`, completed/current = `oxblood`. An "STEP N of 8"
 * eyebrow caption sits above the dashes (ux-specialist §7.4).
 *
 * A11y (ux-auditor §7): wrapper carries `role="progressbar"` +
 * aria-valuenow/min/max + aria-label (i18n template substitution).
 * Dashes are decorative (`aria-hidden`).
 */
import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const TOTAL_STEPS = 8;

export function OnboardingProgressBar(): React.ReactElement {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const ariaLabel = t.onboarding.progressA11y.replace('{N}', String(currentStep));
  // Reuse the i18n template for the sighted caption — same copy as the SR
  // announcement, keeps one source of truth and avoids F-LINT-1 hardcoded
  // interpolated strings inside JSX.
  const caption = ariaLabel;

  return (
    <div
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-2)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {caption}
      </span>
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 'var(--spacing-2)',
        }}
      >
        {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
          const filled = idx < currentStep;
          return (
            <span
              key={idx}
              style={{
                flex: 1,
                height: '1px',
                // `ember` (5.77:1 vs bg-0) clears WCAG 1.4.11 non-text
                // contrast; `oxblood` (2.58:1) fell short as a structural
                // UI signal. Fix per ux-auditor V7 — "The Ledger" oxblood
                // direction yields to WCAG AA for the filled-dash state.
                backgroundColor: filled ? 'var(--color-ember)' : 'var(--color-rule-strong)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
