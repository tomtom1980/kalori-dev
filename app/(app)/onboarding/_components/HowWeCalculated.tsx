'use client';

/**
 * `<HowWeCalculated />` — collapsible transparency panel on Step 8.
 *
 * Shows the Mifflin-St Jeor formula + your actual BMR / TDEE / goal
 * delta / pace / target numbers. Collapsed by default (local useState
 * — ephemeral per briefing §13.4). Panel UNMOUNTS on collapse
 * (react-perf §12) for lower DOM weight when unused.
 *
 * a11y: `aria-expanded` + `aria-controls` on toggle; `role="region"` +
 * `aria-labelledby` on panel; `hidden` attribute syncs tab-order.
 */
import { useId, useMemo, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { calcBMR } from '@/lib/nutrition/mifflin-st-jeor';
import { calcTDEE } from '@/lib/nutrition/tdee';
import { calcCalorieTarget, KCAL_PER_KG } from '@/lib/nutrition/target';
import { PACE_WEEKS } from '@/lib/validation/onboarding';
import type { ActivityLevel, BioSex, GoalPace } from '@/lib/validation/onboarding';

export type HowWeCalculatedInputs = {
  bio_sex: BioSex;
  age: number;
  height_cm: number;
  current_weight_kg: number;
  goal_weight_kg: number;
  goal_pace: GoalPace;
  activity_level: ActivityLevel;
};

export type Derived = {
  bmr: number;
  tdee: number;
  goalDeltaKg: number;
  paceWeeks: number;
  dailyDelta: number;
  target: number;
};

export function deriveFromInputs(inputs: HowWeCalculatedInputs): Derived {
  const bmr = calcBMR(inputs.bio_sex, inputs.current_weight_kg, inputs.height_cm, inputs.age);
  const tdee = calcTDEE(bmr, inputs.activity_level);
  const goalDeltaKg = inputs.goal_weight_kg - inputs.current_weight_kg;
  const paceWeeks = PACE_WEEKS[inputs.goal_pace];
  const dailyDelta = goalDeltaKg === 0 ? 0 : (goalDeltaKg * KCAL_PER_KG) / (paceWeeks * 7);
  const target = calcCalorieTarget(tdee, goalDeltaKg, paceWeeks);
  return { bmr, tdee, goalDeltaKg, paceWeeks, dailyDelta, target };
}

function formatSignedInt(n: number): string {
  const rounded = Math.round(n);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `\u2212${Math.abs(rounded)}`;
  return '0';
}

function formatSignedOne(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r > 0) return `+${r}`;
  if (r < 0) return `\u2212${Math.abs(r)}`;
  return '0';
}

export type HowWeCalculatedProps = {
  inputs: HowWeCalculatedInputs;
  /** Pre-computed numbers (parent may pass to avoid redoing math). */
  derived?: Derived;
};

export function HowWeCalculated({ inputs, derived }: HowWeCalculatedProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const panelId = useId();

  const values = useMemo(() => derived ?? deriveFromInputs(inputs), [derived, inputs]);

  return (
    <div style={{ marginBlockStart: 'var(--spacing-12)' }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="kalori-wizard-toggle"
        style={{
          background: 'transparent',
          border: 0,
          padding: 'var(--spacing-3) 0',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-ivory)',
          textDecoration: 'underline',
          textDecorationColor: 'var(--color-oxblood-soft)',
          cursor: 'pointer',
          minHeight: '44px',
          transition: 'color var(--motion-standard) var(--ease-editorial)',
        }}
      >
        {t.onboarding.howWeCalculatedToggle}
      </button>
      {expanded ? (
        <section
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          style={{
            background: 'var(--color-bg-quote)',
            borderTop: '1px solid var(--color-rule)',
            borderBottom: '1px solid var(--color-rule)',
            paddingBlock: 'var(--spacing-8)',
            paddingInline: 'var(--spacing-6)',
            marginBlockStart: 'var(--spacing-4)',
          }}
        >
          <h2
            id={headingId}
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '22px',
              color: 'var(--color-sand)',
              margin: 0,
              marginBlockEnd: 'var(--spacing-2)',
            }}
          >
            {t.onboarding.howWeCalculatedHeading}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '13px',
              color: 'var(--color-dust)',
              margin: 0,
              marginBlockEnd: 'var(--spacing-4)',
            }}
          >
            {t.onboarding.howWeCalculatedAttribution}
          </p>
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--color-sand)',
              margin: 0,
              marginBlockEnd: 'var(--spacing-6)',
              whiteSpace: 'pre-wrap',
            }}
          >
            <span>{t.onboarding.formulaBmr}</span>
            {'\n  '}
            <span>{t.onboarding.formulaBmrConstants}</span>
            {'\n\n'}
            <span>{t.onboarding.formulaTdee}</span>
            {'\n  '}
            <span>{t.onboarding.formulaTdeeMultipliers}</span>
            {'\n\n'}
            <span>{t.onboarding.formulaTarget}</span>
            {'\n  '}
            <span>{t.onboarding.formulaTargetNote}</span>
          </pre>
          <h4
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
              margin: 0,
              marginBlockEnd: 'var(--spacing-2)',
            }}
          >
            {t.onboarding.yourValuesHeading}
          </h4>
          <ul
            className="num"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--color-ivory)',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-1)',
            }}
          >
            <li>{t.onboarding.yourValuesLineBmr.replace('{value}', String(values.bmr))}</li>
            <li>{t.onboarding.yourValuesLineTdee.replace('{value}', String(values.tdee))}</li>
            <li>
              {t.onboarding.yourValuesLineGoalDelta.replace(
                '{value}',
                formatSignedOne(values.goalDeltaKg),
              )}
            </li>
            <li>
              {t.onboarding.yourValuesLinePaceWeeks.replace('{value}', String(values.paceWeeks))}
            </li>
            <li>
              {t.onboarding.yourValuesLineDailyDelta.replace(
                '{value}',
                formatSignedInt(values.dailyDelta),
              )}
            </li>
            <li>{t.onboarding.yourValuesLineTarget.replace('{value}', String(values.target))}</li>
          </ul>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '18px',
              color: 'var(--color-sand)',
              margin: 0,
              marginBlockStart: 'var(--spacing-6)',
            }}
          >
            {t.onboarding.howWeCalculatedPlain}
          </p>
        </section>
      ) : null}
    </div>
  );
}
