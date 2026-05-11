'use client';

/**
 * Step 3 — Height numeric input + cm/in unit toggle.
 *
 * Metric canonical storage (design-doc §18.2 I6). User's chosen display
 * unit lives in `unitSystem` and persists across Height/Weight/Goal
 * Weight steps (ux-specialist §2).
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';
import { cmToIn, inToCm, roundToOneDecimal } from '@/lib/units/conversion';

import { UnitToggle } from './UnitToggle';

export function StepHeight(): React.ReactElement {
  // Single `useShallow` read of both primitives so a unit-toggle click or
  // height edit triggers one listener, not two. Fixes react-perf V2.
  const { heightCm, unitSystem } = useOnboardingStore(
    useShallow((s) => ({
      heightCm: s.draftProfile.height_cm,
      unitSystem: s.unitSystem,
    })),
  );
  const setField = useOnboardingStore((s) => s.setDraftField);
  const setUnitSystem = useOnboardingStore((s) => s.setUnitSystem);
  const [touched, setTouched] = useState(false);

  const displayValue =
    heightCm === undefined
      ? ''
      : unitSystem === 'metric'
        ? String(roundToOneDecimal(heightCm))
        : String(roundToOneDecimal(cmToIn(heightCm)));

  const invalid = touched && (heightCm === undefined || heightCm < 100 || heightCm > 250);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
      <label
        htmlFor="height-input"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.onboarding.heightLabel}
      </label>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 'var(--spacing-3)' }}>
        <input
          id="height-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoComplete="off"
          value={displayValue}
          aria-invalid={invalid ? 'true' : 'false'}
          aria-describedby={invalid ? 'height-error' : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.trim() === '') {
              setField('height_cm', undefined);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            const metric = unitSystem === 'metric' ? n : inToCm(n);
            setField('height_cm', metric);
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
          pair="length"
          onChange={setUnitSystem}
          groupName="height-unit"
        />
      </div>
      <span
        id="height-error"
        style={{
          minHeight: '1.25rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--color-ember)',
          visibility: invalid ? 'visible' : 'hidden',
        }}
      >
        {t.onboarding.errorHeightRange}
      </span>
    </div>
  );
}
