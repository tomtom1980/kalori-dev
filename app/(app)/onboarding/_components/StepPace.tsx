'use client';

/**
 * Step 6 — Pace radiogroup (Relaxed / Steady / Aggressive) with
 * calculated target date per option.
 *
 * react-perf §7: module-scope `Intl.DateTimeFormat` avoids re-creating
 * the formatter on every render. Target date = today + paceWeeks×7.
 */
import { useMemo } from 'react';

import { t } from '@/lib/i18n/en';
import { PACE_WEEKS, type GoalPace } from '@/lib/validation/onboarding';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const PACE_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  // ux-specialist §5 spec literal: "March 15, 2026" — long month name.
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function formatTargetDate(paceWeeks: number, now: Date): string {
  const target = new Date(now.getTime());
  target.setDate(target.getDate() + paceWeeks * 7);
  return PACE_DATE_FMT.format(target);
}

const OPTIONS: ReadonlyArray<{
  value: GoalPace;
  labelKey: keyof typeof t.onboarding;
  subtitleKey: keyof typeof t.onboarding;
}> = [
  { value: 'slow', labelKey: 'paceRelaxed', subtitleKey: 'paceRelaxedSub' },
  { value: 'moderate', labelKey: 'paceSteady', subtitleKey: 'paceSteadySub' },
  { value: 'fast', labelKey: 'paceAggressive', subtitleKey: 'paceAggressiveSub' },
];

export function StepPace(): React.ReactElement {
  const selected = useOnboardingStore((s) => s.draftProfile.goal_pace);
  const setField = useOnboardingStore((s) => s.setDraftField);

  // Memo'd so the per-chip dates don't re-format on unrelated re-renders.
  const dates = useMemo(() => {
    const now = new Date();
    return {
      slow: formatTargetDate(PACE_WEEKS.slow, now),
      moderate: formatTargetDate(PACE_WEEKS.moderate, now),
      fast: formatTargetDate(PACE_WEEKS.fast, now),
    } satisfies Record<GoalPace, string>;
  }, []);

  return (
    <fieldset
      role="radiogroup"
      aria-label={t.onboarding.paceGroupLabel}
      style={{ border: 0, padding: 0, margin: 0 }}
    >
      <legend className="sr-only">{t.onboarding.paceGroupLabel}</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-1)',
                minHeight: '72px',
                paddingBlock: 'var(--spacing-3)',
                paddingInline: 'var(--spacing-4)',
                background: isSelected ? 'var(--color-bg-2)' : 'var(--color-bg-1)',
                borderTop: isSelected ? '1px solid var(--color-oxblood)' : '1px solid transparent',
                borderBottom: '1px solid var(--color-rule)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="goal_pace"
                value={opt.value}
                checked={isSelected}
                onChange={() => setField('goal_pace', opt.value)}
                aria-label={t.onboarding[opt.labelKey]}
                className="sr-only"
              />
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 300,
                  fontSize: '20px',
                  color: 'var(--color-ivory)',
                }}
              >
                {t.onboarding[opt.labelKey]}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  fontSize: '13px',
                  color: 'var(--color-sand)',
                }}
              >
                {t.onboarding[opt.subtitleKey]}
              </span>
              <span
                className="num"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--color-dust)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {t.onboarding.paceTargetPrefix}: {dates[opt.value]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
