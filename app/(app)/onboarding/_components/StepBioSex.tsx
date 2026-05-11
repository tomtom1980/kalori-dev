'use client';

/**
 * Step 1 — Biological sex radiogroup (3 chips: male / female / other).
 *
 * ux-auditor §17: native `<input type="radio">` with `.sr-only` +
 * styled `<label>`. Selected affordance = oxblood 1px top-rule on the
 * selected label + `bg-2` shift (design-lead §5).
 */
import { t } from '@/lib/i18n/en';
import type { BioSex } from '@/lib/validation/onboarding';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const OPTIONS: ReadonlyArray<{ value: BioSex; labelKey: keyof typeof t.onboarding }> = [
  { value: 'male', labelKey: 'bioSexMale' },
  { value: 'female', labelKey: 'bioSexFemale' },
  { value: 'other', labelKey: 'bioSexOther' },
];

export function StepBioSex(): React.ReactElement {
  const selected = useOnboardingStore((s) => s.draftProfile.bio_sex);
  const setField = useOnboardingStore((s) => s.setDraftField);

  return (
    <fieldset
      role="radiogroup"
      aria-label={t.onboarding.bioSexGroupLabel}
      style={{ border: 0, padding: 0, margin: 0 }}
    >
      <legend className="sr-only">{t.onboarding.bioSexGroupLabel}</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '72px',
                paddingInline: 'var(--spacing-4)',
                background: isSelected ? 'var(--color-bg-2)' : 'var(--color-bg-1)',
                borderTop: isSelected ? '1px solid var(--color-oxblood)' : '1px solid transparent',
                borderBottom: '1px solid var(--color-rule)',
                fontFamily: 'var(--font-serif)',
                fontSize: '20px',
                fontWeight: 300,
                color: 'var(--color-ivory)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="bio_sex"
                value={opt.value}
                checked={isSelected}
                onChange={() => setField('bio_sex', opt.value)}
                aria-label={t.onboarding[opt.labelKey]}
                className="sr-only"
              />
              <span aria-hidden="true">{t.onboarding[opt.labelKey]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
