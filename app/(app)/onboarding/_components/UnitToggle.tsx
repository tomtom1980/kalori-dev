'use client';

/**
 * `<UnitToggle />` — two-chip segmented radio (ux-auditor §17 mandate:
 * role="radiogroup", not role="switch").
 *
 * Used on Height / Weight / Goal Weight steps. Switches between two
 * display units while the store always holds metric canonical.
 */
import { t } from '@/lib/i18n/en';
import type { UnitSystem } from '@/lib/validation/onboarding';

type Unit = 'cm' | 'in' | 'kg' | 'lb';

export type UnitToggleProps = {
  /** Currently-selected display unit (derived from store `unitSystem`). */
  unitSystem: UnitSystem;
  /** The metric + imperial unit pair to toggle between. */
  pair: 'length' | 'mass';
  onChange: (next: UnitSystem) => void;
  /** Unique `name` attribute (prevents collision when multiple toggles exist). */
  groupName: string;
};

const PAIR_LABELS: Record<'length' | 'mass', Record<UnitSystem, Unit>> = {
  length: { metric: 'cm', imperial: 'in' },
  mass: { metric: 'kg', imperial: 'lb' },
};

const UNIT_TEXT: Record<Unit, string> = {
  cm: t.onboarding.unitCm,
  in: t.onboarding.unitIn,
  kg: t.onboarding.unitKg,
  lb: t.onboarding.unitLb,
};

export function UnitToggle({
  unitSystem,
  pair,
  onChange,
  groupName,
}: UnitToggleProps): React.ReactElement {
  const metricUnit = PAIR_LABELS[pair].metric;
  const imperialUnit = PAIR_LABELS[pair].imperial;

  return (
    <fieldset
      role="radiogroup"
      aria-label={t.onboarding.unitToggleLabel}
      style={{
        // `dust` (4.90:1 vs bg-0) clears WCAG 1.4.11 non-text contrast;
        // `rule-strong` (1.96:1) was sub-threshold. Fix per ux-auditor V6.
        border: '1px solid var(--color-dust)',
        padding: 0,
        margin: 0,
        display: 'inline-flex',
      }}
    >
      <legend className="sr-only">{t.onboarding.unitToggleLabel}</legend>
      {[
        { unitSys: 'metric' as const, unit: metricUnit },
        { unitSys: 'imperial' as const, unit: imperialUnit },
      ].map(({ unitSys, unit }) => {
        const isSelected = unitSystem === unitSys;
        return (
          <label
            key={unitSys}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingInline: 'var(--spacing-3)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-button)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: isSelected ? 'var(--color-ivory)' : 'var(--color-dust)',
              background: isSelected ? 'var(--color-oxblood)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={groupName}
              value={unitSys}
              checked={isSelected}
              onChange={() => onChange(unitSys)}
              className="sr-only"
            />
            <span>{UNIT_TEXT[unit]}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
