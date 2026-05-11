'use client';

/**
 * `<WizardActionRow />` — Back / Next (or Start tracking) button pair.
 *
 * Design-lead §6:
 *   - Back: ghost text button, hidden on Step 1.
 *   - Next: oxblood primary, swaps to "START TRACKING" on Step 8.
 *   - Disabled affordance = 40% opacity (not greyed bg).
 *   - `isSaving` = label swap + `aria-busy`.
 */
import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

export type WizardActionRowProps = {
  canAdvance: boolean;
  isSaving: boolean;
  onBack: () => void;
};

export function WizardActionRow({
  canAdvance,
  isSaving,
  onBack,
}: WizardActionRowProps): React.ReactElement {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const isStep1 = currentStep === 1;
  const isStep8 = currentStep === 8;

  const nextLabel = isSaving
    ? isStep8
      ? t.onboarding.buttonStartTrackingLoading
      : t.onboarding.buttonNextLoading
    : isStep8
      ? t.onboarding.buttonStartTracking
      : t.onboarding.buttonNext;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBlockStart: 'var(--spacing-6)',
      }}
    >
      {isStep1 ? (
        <span aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onBack}
          disabled={isSaving}
          className="kalori-wizard-back"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-button)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            background: 'transparent',
            border: 'none',
            padding: 'var(--spacing-3) 0',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            minHeight: '44px',
            transition: 'color var(--motion-standard) var(--ease-editorial)',
          }}
        >
          {t.onboarding.buttonBack}
        </button>
      )}
      <button
        type="submit"
        disabled={!canAdvance || isSaving}
        aria-busy={isSaving ? true : undefined}
        className="kalori-wizard-cta"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-button)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-ivory)',
          background: 'var(--color-oxblood)',
          border: 'none',
          paddingInline: 'var(--spacing-6)',
          minWidth: isStep8 ? '200px' : '144px',
          height: isStep8 ? '56px' : '48px',
          cursor: !canAdvance || isSaving ? 'not-allowed' : 'pointer',
          opacity: !canAdvance ? 0.4 : 1,
          transition: 'background-color var(--motion-standard) var(--ease-editorial)',
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
