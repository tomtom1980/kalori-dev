'use client';

/**
 * Step 7 — Activity level radiogroup (5 chips, stacked vertical).
 *
 * Each chip shows label + italic Newsreader subtitle per ui-design §7.5.
 */
import { t } from '@/lib/i18n/en';
import type { ActivityLevel } from '@/lib/validation/onboarding';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const OPTIONS: ReadonlyArray<{
  value: ActivityLevel;
  labelKey: keyof typeof t.onboarding;
  subtitleKey: keyof typeof t.onboarding;
}> = [
  { value: 'sedentary', labelKey: 'activitySedentary', subtitleKey: 'activitySedentarySub' },
  { value: 'light', labelKey: 'activityLight', subtitleKey: 'activityLightSub' },
  { value: 'moderate', labelKey: 'activityModerate', subtitleKey: 'activityModerateSub' },
  { value: 'active', labelKey: 'activityActive', subtitleKey: 'activityActiveSub' },
  {
    value: 'very_active',
    labelKey: 'activityVeryActive',
    subtitleKey: 'activityVeryActiveSub',
  },
];

export function StepActivity(): React.ReactElement {
  const selected = useOnboardingStore((s) => s.draftProfile.activity_level);
  const setField = useOnboardingStore((s) => s.setDraftField);

  return (
    <fieldset
      role="radiogroup"
      aria-label={t.onboarding.activityGroupLabel}
      style={{ border: 0, padding: 0, margin: 0 }}
    >
      <legend className="sr-only">{t.onboarding.activityGroupLabel}</legend>
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
                name="activity_level"
                value={opt.value}
                checked={isSelected}
                onChange={() => setField('activity_level', opt.value)}
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
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
