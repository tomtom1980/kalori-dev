'use client';

/**
 * Step 4 — Current weight numeric input + kg/lb unit toggle.
 *
 * Metric canonical storage (design-doc §18.2 I6). Shares the
 * `unitSystem` preference with Steps 3 + 5 via the Zustand store.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';
import { kgToLb, lbToKg, roundToOneDecimal } from '@/lib/units/conversion';

import { UnitToggle } from './UnitToggle';

export function StepWeight(): React.ReactElement {
  // Single `useShallow` read of both primitives (react-perf V2 parity
  // with StepHeight). One listener per relevant write.
  const { weightKg, unitSystem } = useOnboardingStore(
    useShallow((s) => ({
      weightKg: s.draftProfile.current_weight_kg,
      unitSystem: s.unitSystem,
    })),
  );
  const setField = useOnboardingStore((s) => s.setDraftField);
  const setUnitSystem = useOnboardingStore((s) => s.setUnitSystem);
  const [touched, setTouched] = useState(false);

  const displayValue =
    weightKg === undefined
      ? ''
      : unitSystem === 'metric'
        ? String(roundToOneDecimal(weightKg))
        : String(roundToOneDecimal(kgToLb(weightKg)));

  const invalid = touched && (weightKg === undefined || weightKg < 30 || weightKg > 350);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
      <label
        htmlFor="weight-input"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.onboarding.weightLabel}
      </label>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 'var(--spacing-3)' }}>
        <input
          id="weight-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoComplete="off"
          value={displayValue}
          aria-invalid={invalid ? 'true' : 'false'}
          aria-describedby={invalid ? 'weight-error' : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === '') {
              setField('current_weight_kg', undefined);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            const metric = unitSystem === 'metric' ? n : lbToKg(n);
            setField('current_weight_kg', metric);
          }}
          onBlur={() => setTouched(true)}
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
          groupName="weight-unit"
        />
      </div>
      <span
        id="weight-error"
        style={{
          minHeight: '1.25rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--color-ember)',
          visibility: invalid ? 'visible' : 'hidden',
        }}
      >
        {t.onboarding.errorWeightRange}
      </span>
    </div>
  );
}
