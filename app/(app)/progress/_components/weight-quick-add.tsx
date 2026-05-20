'use client';

/**
 * Progress-page inline weight quick-add wrapper — Task 4.3b.
 *
 * Thin client wrapper around the shared `<WeightQuickAdd mode="inline" />`
 * component. Exists as its own file so the Progress RSC can import cleanly
 * without pulling the full-form /weight page chunk.
 */
import { useId, useState } from 'react';

import {
  WeightTrajectoryLine,
  type WeightEntry,
  type WeightRange,
} from '@/components/charts/WeightTrajectoryLine';
import { WeightQuickAdd, type WeightQuickAddProps } from '@/components/dashboard/WeightQuickAdd';
import { t } from '@/lib/i18n/en';

export function ProgressWeightQuickAdd(props: Omit<WeightQuickAddProps, 'mode'>) {
  return <WeightQuickAdd {...props} mode="inline" allowUnitChoice showDateInput />;
}

export interface ProgressWeightTrajectoryPanelProps extends Omit<
  WeightQuickAddProps,
  'mode' | 'allowUnitChoice' | 'showDateInput'
> {
  entries: WeightEntry[];
  goalWeightKg: number | null;
  chartRange?: WeightRange;
}

export function ProgressWeightTrajectoryPanel({
  entries,
  goalWeightKg,
  chartRange = '30d',
  unitPref,
  ...quickAddProps
}: ProgressWeightTrajectoryPanelProps) {
  const [selectedUnit, setSelectedUnit] = useState<'metric' | 'imperial'>(unitPref);
  const fieldsetId = useId();

  return (
    <div data-testid="progress-weight-trajectory-panel">
      <fieldset
        aria-labelledby={fieldsetId}
        style={{
          border: 0,
          padding: 0,
          margin: '0 0 var(--spacing-4)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <legend
          id={fieldsetId}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
            borderWidth: 0,
          }}
        >
          {t.weight.unitChoiceLabel}
        </legend>
        <div style={{ display: 'inline-flex', gap: 'var(--spacing-2)' }}>
          {(['metric', 'imperial'] as const).map((unit) => {
            const active = selectedUnit === unit;
            return (
              <label
                key={unit}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0 var(--spacing-3)',
                  border: `1px solid ${
                    active ? 'var(--color-oxblood)' : 'var(--color-rule-strong)'
                  }`,
                  color: active ? 'var(--color-ivory)' : 'var(--color-dust)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--type-label)',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="progress-weight-unit-choice"
                  value={unit}
                  checked={active}
                  onChange={() => setSelectedUnit(unit)}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                />
                {unit === 'metric' ? t.weight.unitKg : t.weight.unitLb}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div style={{ marginBottom: 'var(--spacing-6)' }}>
        <WeightQuickAdd
          key={selectedUnit}
          {...quickAddProps}
          mode="inline"
          unitPref={selectedUnit}
          allowUnitChoice={false}
          showDateInput
        />
      </div>
      <WeightTrajectoryLine
        entries={entries}
        goalWeightKg={goalWeightKg}
        range={chartRange}
        unitPref={selectedUnit}
      />
    </div>
  );
}

export default ProgressWeightQuickAdd;
