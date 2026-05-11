'use client';

/**
 * `<MergeField />` — Task 4.1 sub-step 3 §7.15.
 *
 * Single per-field row inside the Merge dialog. `<fieldset>` + `<legend>`
 * hosts a native radio group (A/B and optional CUSTOM numeric input).
 * Live preview crossfade is handled by the parent's `key={fieldSignature}`
 * remount on `<LibraryPreviewCard>`.
 */
import type { MergeChoiceTag } from '@/lib/library/types';

export interface MergeFieldProps {
  legend: string;
  name: string;
  valueA: string;
  valueB: string;
  choice: MergeChoiceTag;
  onChoice: (next: MergeChoiceTag) => void;
  allowCustom?: boolean;
  customValue?: number | null;
  onCustomChange?: (next: number | null) => void;
  customLabel?: string;
}

export function MergeField({
  legend,
  name,
  valueA,
  valueB,
  choice,
  onChoice,
  allowCustom = false,
  customValue = null,
  onCustomChange,
  customLabel = 'Custom',
}: MergeFieldProps) {
  const idA = `${name}-a`;
  const idB = `${name}-b`;
  const idC = `${name}-c`;

  return (
    <fieldset
      className="kalori-library-merge-field"
      data-testid={`library-merge-field-${name}`}
      aria-label={legend}
    >
      <legend className="kalori-library-merge-field-legend">{`§ ${legend}`}</legend>
      <div className="kalori-library-merge-options" role="radiogroup" aria-label={legend}>
        <label htmlFor={idA} className="kalori-library-merge-option">
          <input
            type="radio"
            id={idA}
            name={name}
            value="a"
            checked={choice === 'a'}
            onChange={() => onChoice('a')}
            data-testid={`library-merge-${name}-a`}
          />
          <span>{valueA}</span>
        </label>
        <label htmlFor={idB} className="kalori-library-merge-option">
          <input
            type="radio"
            id={idB}
            name={name}
            value="b"
            checked={choice === 'b'}
            onChange={() => onChoice('b')}
            data-testid={`library-merge-${name}-b`}
          />
          <span>{valueB}</span>
        </label>
        {allowCustom ? (
          <label htmlFor={idC} className="kalori-library-merge-option">
            <input
              type="radio"
              id={`${idC}-r`}
              name={name}
              value="custom"
              checked={choice === 'custom'}
              onChange={() => onChoice('custom')}
              data-testid={`library-merge-${name}-custom`}
            />
            <span>{customLabel}</span>
            <input
              type="number"
              id={idC}
              value={customValue ?? ''}
              onChange={(ev) => {
                const raw = ev.target.value;
                if (raw === '') {
                  onCustomChange?.(null);
                } else {
                  const n = Number(raw);
                  onCustomChange?.(Number.isFinite(n) ? n : null);
                }
              }}
              onFocus={() => onChoice('custom')}
              className="kalori-library-merge-custom-input"
              min={0}
              step={0.1}
              data-testid={`library-merge-${name}-custom-input`}
            />
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

export default MergeField;
