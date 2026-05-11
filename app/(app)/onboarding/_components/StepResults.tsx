'use client';

/**
 * Step 8 — Results screen.
 *
 * Renders BMR + TDEE + target hero via pure client-side Mifflin
 * computation (briefing §11.4). The SERVER re-computes authoritatively
 * from the persisted profile on finalize — we do not send the client-
 * computed target to the DB.
 *
 * Sub-1200 warning (ux-specialist §7): `role="note"` +
 * `aria-live="polite"`, ember left rule, decided copy in
 * `t.onboarding.sub1200Warning`. Non-blocking; CTA remains enabled.
 *
 * Responsive hero sizes per design-lead §8:
 *   1280 → 82px, 768 → 64px, 375 → 48px (CSS clamp).
 */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';
import type { ActivityLevel, BioSex, GoalPace } from '@/lib/validation/onboarding';

import { deriveFromInputs, HowWeCalculated } from './HowWeCalculated';

type CompleteDraft = {
  bio_sex: BioSex;
  age: number;
  height_cm: number;
  current_weight_kg: number;
  goal_weight_kg: number;
  goal_pace: GoalPace;
  activity_level: ActivityLevel;
};

function toCompleteDraft(
  draft: ReturnType<typeof useOnboardingStore.getState>['draftProfile'],
): CompleteDraft | null {
  if (
    draft.bio_sex === undefined ||
    draft.age === undefined ||
    draft.height_cm === undefined ||
    draft.current_weight_kg === undefined ||
    draft.goal_weight_kg === undefined ||
    draft.goal_pace === undefined ||
    draft.activity_level === undefined
  ) {
    return null;
  }
  return {
    bio_sex: draft.bio_sex,
    age: draft.age,
    height_cm: draft.height_cm,
    current_weight_kg: draft.current_weight_kg,
    goal_weight_kg: draft.goal_weight_kg,
    goal_pace: draft.goal_pace,
    activity_level: draft.activity_level,
  };
}

function formatSignedInt(n: number): string {
  const rounded = Math.round(n);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `\u2212${Math.abs(rounded)}`;
  return '0';
}

export function StepResults(): React.ReactElement {
  const draft = useOnboardingStore(useShallow((s) => s.draftProfile));
  const complete = toCompleteDraft(draft);
  const derived = useMemo(() => (complete ? deriveFromInputs(complete) : null), [complete]);

  if (!complete || !derived) {
    return <p style={{ color: 'var(--color-dust)' }}>{t.onboarding.saveErrorGeneric}</p>;
  }

  const { bmr, tdee, dailyDelta, target } = derived;
  const sub1200 = target < 1200;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 'var(--type-body-lg)',
          color: 'var(--color-sand)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        {t.onboarding.resultsAttribution}
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
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
          {t.onboarding.targetValueLabel}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
          <span
            className="num"
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              color: 'var(--color-ivory)',
              fontSize: 'clamp(48px, 8vw, 82px)',
              lineHeight: 1,
            }}
          >
            {target.toLocaleString('en-US')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '18px',
              color: 'var(--color-dust)',
            }}
          >
            {t.onboarding.kcalUnit}
          </span>
        </div>
      </div>
      {sub1200 ? (
        <div
          role="note"
          aria-live="polite"
          style={{
            background: 'var(--color-bg-1)',
            borderLeft: '2px solid var(--color-ember)',
            padding: 'var(--spacing-4)',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 'var(--type-body)',
            color: 'var(--color-ivory)',
          }}
        >
          {t.onboarding.sub1200Warning}
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
          gap: 'var(--spacing-4)',
          paddingBlock: 'var(--spacing-4)',
          borderTop: '1px solid var(--color-rule)',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        <StatCell label={t.onboarding.bmrLabel} value={`${bmr}`} />
        <span style={{ background: 'var(--color-rule)' }} aria-hidden="true" />
        <StatCell label={t.onboarding.tdeeLabel} value={`${tdee}`} />
        <span style={{ background: 'var(--color-rule)' }} aria-hidden="true" />
        <StatCell label={t.onboarding.dailyDeltaLabel} value={formatSignedInt(dailyDelta)} />
      </div>
      <HowWeCalculated inputs={complete} derived={derived} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--spacing-1)',
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
        {label}
      </span>
      <span
        className="num"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '22px',
          color: 'var(--color-ivory)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
