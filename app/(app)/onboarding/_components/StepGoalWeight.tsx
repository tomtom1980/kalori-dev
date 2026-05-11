'use client';

/**
 * Step 5 — Goal weight numeric input + kg/lb toggle + real-time delta chip.
 *
 * ux-specialist §4: visual delta fires on every keystroke (no debounce);
 * pure calc against current_weight_kg. Separate on-blur SR announcement
 * lane prevents screen-reader spam (ux-auditor §5).
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import { useShallow } from 'zustand/react/shallow';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';
import { kgToLb, lbToKg, roundToOneDecimal } from '@/lib/units/conversion';

import { UnitToggle } from './UnitToggle';

type DeltaKind = 'lose' | 'gain' | 'maintain' | null;

function deltaKind(goalKg: number | undefined, currentKg: number | undefined): DeltaKind {
  if (goalKg === undefined || currentKg === undefined) return null;
  if (goalKg === currentKg) return 'maintain';
  return goalKg < currentKg ? 'lose' : 'gain';
}

export function StepGoalWeight(): React.ReactElement {
  const { goal_weight_kg, current_weight_kg, unitSystem } = useOnboardingStore(
    useShallow((s) => ({
      goal_weight_kg: s.draftProfile.goal_weight_kg,
      current_weight_kg: s.draftProfile.current_weight_kg,
      unitSystem: s.unitSystem,
    })),
  );
  const setField = useOnboardingStore((s) => s.setDraftField);
  const setUnitSystem = useOnboardingStore((s) => s.setUnitSystem);
  const [touched, setTouched] = useState(false);
  const [srAnnounce, setSrAnnounce] = useState('');

  const displayValue =
    goal_weight_kg === undefined
      ? ''
      : unitSystem === 'metric'
        ? String(roundToOneDecimal(goal_weight_kg))
        : String(roundToOneDecimal(kgToLb(goal_weight_kg)));

  const invalid =
    touched && (goal_weight_kg === undefined || goal_weight_kg < 30 || goal_weight_kg > 350);

  const kind = deltaKind(goal_weight_kg, current_weight_kg);
  let deltaLabel: string | null = null;
  let deltaColor = 'var(--color-dust)';
  if (kind === 'lose' || kind === 'gain') {
    const abs = Math.abs((goal_weight_kg as number) - (current_weight_kg as number));
    const displayAbs =
      unitSystem === 'metric' ? roundToOneDecimal(abs) : roundToOneDecimal(kgToLb(abs));
    const unitText = unitSystem === 'metric' ? t.onboarding.unitKg : t.onboarding.unitLb;
    const template =
      kind === 'lose' ? t.onboarding.goalWeightDeltaLose : t.onboarding.goalWeightDeltaGain;
    deltaLabel = template.replace('{amount}', String(displayAbs)).replace('{unit}', unitText);
    deltaColor = kind === 'lose' ? 'var(--color-oxblood)' : 'var(--color-ember)';
  } else if (kind === 'maintain') {
    deltaLabel = t.onboarding.goalWeightDeltaMaintain;
    deltaColor = 'var(--color-dust)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
      <label
        htmlFor="goal-weight-input"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.onboarding.goalWeightLabel}
      </label>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 'var(--spacing-3)' }}>
        <input
          id="goal-weight-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoComplete="off"
          value={displayValue}
          aria-invalid={invalid ? 'true' : 'false'}
          aria-describedby={invalid ? 'goal-weight-error' : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === '') {
              setField('goal_weight_kg', undefined);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            const metric = unitSystem === 'metric' ? n : lbToKg(n);
            setField('goal_weight_kg', metric);
          }}
          onBlur={() => {
            setTouched(true);
            if (deltaLabel) setSrAnnounce(deltaLabel);
          }}
          style={{
            width: '180px',
            height: '56px',
            background: 'var(--color-bg-1)',
            color: 'var(--color-ivory)',
            fontFamily: 'var(--font-serif)',
            fontWeight: 300,
            fontSize: '20px',
            border: '1px solid var(--color-dust)',
            paddingInline: 'var(--spacing-3)',
          }}
        />
        <UnitToggle
          unitSystem={unitSystem}
          pair="mass"
          onChange={setUnitSystem}
          groupName="goal-weight-unit"
        />
      </div>
      <span
        id="goal-weight-error"
        style={{
          minHeight: '1.25rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--color-ember)',
          visibility: invalid ? 'visible' : 'hidden',
        }}
      >
        {t.onboarding.errorGoalWeightRange}
      </span>
      {deltaLabel ? (
        <div
          aria-hidden="true"
          style={{
            marginTop: 'var(--spacing-3)',
            padding: 'var(--spacing-3) var(--spacing-4)',
            background: 'var(--color-bg-2)',
            borderLeft: `2px solid ${deltaColor}`,
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-ivory)',
          }}
        >
          {deltaLabel}
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {srAnnounce}
      </span>
    </div>
  );
}
