'use client';

/**
 * Step 2 — Birthday date input.
 *
 * Native `<input type="date">` gives the user a calendar picker while
 * the store keeps both `birthday` and the derived `age` for the existing
 * nutrition calculation path.
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import { addYearsToIsoDay, calculateAgeOnDate, isAgeInSupportedRange } from '@/lib/profile/age';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function StepAge(): React.ReactElement {
  const birthday = useOnboardingStore((s) => s.draftProfile.birthday);
  const age = useOnboardingStore((s) => s.draftProfile.age);
  const setField = useOnboardingStore((s) => s.setDraftField);
  const [touched, setTouched] = useState(false);

  const today = todayLocalIso();
  const minBirthday = addYearsToIsoDay(today, -120) ?? '';
  const maxBirthday = addYearsToIsoDay(today, -13) ?? today;
  const invalid = touched && !isAgeInSupportedRange(age ?? null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
      <label
        htmlFor="birthday-input"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.onboarding.birthdayLabel}
      </label>
      <input
        id="birthday-input"
        type="date"
        min={minBirthday}
        max={maxBirthday}
        autoComplete="off"
        value={birthday ?? ''}
        aria-invalid={invalid ? 'true' : 'false'}
        aria-describedby={invalid ? 'birthday-error' : undefined}
        onChange={(e) => {
          const nextBirthday = e.target.value || undefined;
          const nextAge = nextBirthday ? calculateAgeOnDate(nextBirthday, today) : null;
          setField('birthday', nextBirthday);
          setField('age', nextAge ?? undefined);
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
        id="birthday-error"
        style={{
          minHeight: '1.25rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--color-ember)',
          visibility: invalid ? 'visible' : 'hidden',
        }}
      >
        {t.onboarding.errorBirthdayRange}
      </span>
      {typeof age === 'number' ? (
        <span
          className="num"
          data-testid="birthday-derived-age"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--color-dust)',
          }}
        >
          {t.onboarding.birthdayAgePreview.replace('{age}', String(age))}
        </span>
      ) : null}
    </div>
  );
}
