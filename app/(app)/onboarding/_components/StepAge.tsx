'use client';

/**
 * Step 2 — Age numeric input (integer 13–120).
 *
 * Native `<input type="number" inputmode="numeric">` + visible
 * UPPERCASE `<label>`. Validation error surfaces below via
 * `aria-describedby` with a reserved 1.25rem min-height slot to
 * prevent CLS (react-perf §13).
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

function parseAge(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

export function StepAge(): React.ReactElement {
  const age = useOnboardingStore((s) => s.draftProfile.age);
  const setField = useOnboardingStore((s) => s.setDraftField);
  const [touched, setTouched] = useState(false);

  const displayValue = typeof age === 'number' ? String(age) : '';
  const invalid = touched && (age === undefined || age < 13 || age > 120);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
      <label
        htmlFor="age-input"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.onboarding.ageLabel}
      </label>
      <input
        id="age-input"
        type="number"
        inputMode="numeric"
        step="1"
        min={13}
        max={120}
        autoComplete="off"
        placeholder={t.onboarding.agePlaceholder}
        value={displayValue}
        aria-invalid={invalid ? 'true' : 'false'}
        aria-describedby={invalid ? 'age-error' : undefined}
        onChange={(e) => {
          const parsed = parseAge(e.target.value);
          setField('age', parsed);
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
      <span
        id="age-error"
        style={{
          minHeight: '1.25rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--color-ember)',
          visibility: invalid ? 'visible' : 'hidden',
        }}
      >
        {t.onboarding.errorAgeRange}
      </span>
    </div>
  );
}
