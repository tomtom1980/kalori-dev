'use client';

/**
 * <FoodDetailName /> — Task 4.2.
 *
 * Renders the food name as an <h1> in read mode OR a 32px Newsreader
 * <input> in edit mode. Portion line sits below in either mode. Native
 * `useState` via the parent's useFoodDetailEdit hook — NOT
 * react-hook-form (briefing deviation, ~9 KB saved).
 */
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { isWholeStyleUnit } from '@/lib/log/portion-unit';

import type { DraftState, EditErrors, DraftKey } from './useFoodDetailEdit';
import { formatPortion } from './foodDetail.format';

const UNIT_OPTIONS = [
  'g',
  'ml',
  'oz',
  'cup',
  'tbsp',
  'tsp',
  'serving',
  'piece',
  'slice',
  'bowl',
  'plate',
  'glass',
  'can',
  'bottle',
  'scoop',
  'packet',
  'bar',
  'medium',
  'large',
] as const;

const REMOVED_EGG_UNITS = new Set(['egg', 'small egg', 'medium egg', 'large egg']);

function formatApproxGrams(item: LibraryItem): string | null {
  const grams = item.nutrition.approxGrams;
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) return null;
  return t.library.cardApproxGrams.replace('{grams}', String(Math.round(grams)));
}

export interface FoodDetailNameProps {
  item: LibraryItem;
  editing: boolean;
  draft: DraftState;
  errors: EditErrors;
  onDraftChange: (key: DraftKey, value: string) => void;
}

export function FoodDetailName({
  item,
  editing,
  draft,
  errors,
  onDraftChange,
}: FoodDetailNameProps) {
  if (!editing) {
    const approxGrams = formatApproxGrams(item);
    return (
      <div className="kalori-fd-name-block">
        <h1 id="food-detail-name" className="kalori-fd-name-h1" data-testid="food-detail-name">
          {item.display_name}
        </h1>
        <p className="kalori-fd-portion" data-testid="food-detail-portion">
          {t.library.detail.portionFormat
            .replace('{portion}', formatPortion(item.default_portion, item.default_unit))
            .replace('{unit}', '')
            .trim()}
        </p>
        {approxGrams ? (
          <p className="kalori-fd-portion" data-testid="food-detail-approx-grams">
            {approxGrams}
          </p>
        ) : null}
      </div>
    );
  }

  const nameErr = errors.display_name;
  const portionErr = errors.default_portion;
  const unitErr = errors.default_unit;
  const selectedUnit = draft.default_unit.trim();
  const selectedIsLegacyRemoved = REMOVED_EGG_UNITS.has(selectedUnit);
  const unitOptions =
    selectedUnit && !selectedIsLegacyRemoved
      ? [selectedUnit, ...UNIT_OPTIONS.filter((unit) => unit !== selectedUnit)]
      : UNIT_OPTIONS;
  const approxGrams = formatApproxGrams(item);

  return (
    <div className="kalori-fd-name-block">
      <label className="kalori-fd-field-label" htmlFor="fd-edit-name">
        {t.library.detail.nameLabel}
      </label>
      <input
        id="fd-edit-name"
        type="text"
        value={draft.display_name}
        onChange={(e) => onDraftChange('display_name', e.target.value)}
        autoFocus
        aria-label={t.library.detail.nameLabel}
        aria-invalid={Boolean(nameErr)}
        aria-describedby={nameErr ? 'fd-edit-name-error' : undefined}
        data-testid="food-detail-edit-name-input"
        className="kalori-fd-input kalori-fd-input-name"
      />
      {nameErr ? (
        <p
          id="fd-edit-name-error"
          role="alert"
          className="kalori-fd-error"
          data-testid="food-detail-edit-name-error"
        >
          {nameErr}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
        <div style={{ flex: 1 }}>
          <label className="kalori-fd-field-label" htmlFor="fd-edit-portion">
            {t.library.detail.portionLabel}
          </label>
          <input
            id="fd-edit-portion"
            type="text"
            inputMode={isWholeStyleUnit(draft.default_unit) ? 'numeric' : 'decimal'}
            value={draft.default_portion}
            onChange={(e) => onDraftChange('default_portion', e.target.value)}
            aria-label={t.library.detail.portionLabel}
            aria-invalid={Boolean(portionErr)}
            aria-describedby={portionErr ? 'fd-edit-portion-error' : undefined}
            data-testid="food-detail-edit-portion-input"
            className="kalori-fd-input kalori-fd-input-num"
          />
          {portionErr ? (
            <p
              id="fd-edit-portion-error"
              role="alert"
              className="kalori-fd-error"
              data-testid="food-detail-edit-portion-error"
            >
              {portionErr}
            </p>
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          <label className="kalori-fd-field-label" htmlFor="fd-edit-unit">
            {t.library.detail.unitLabel}
          </label>
          <select
            id="fd-edit-unit"
            value={draft.default_unit}
            onChange={(e) => onDraftChange('default_unit', e.target.value)}
            aria-label={t.library.detail.unitLabel}
            aria-invalid={Boolean(unitErr)}
            aria-describedby={unitErr ? 'fd-edit-unit-error' : undefined}
            data-testid="food-detail-edit-unit-input"
            className="kalori-fd-input"
          >
            <option value="">{t.library.detail.unitSelectPlaceholder}</option>
            {selectedIsLegacyRemoved ? (
              <option value={selectedUnit} disabled>
                {selectedUnit}
              </option>
            ) : null}
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          {unitErr ? (
            <p
              id="fd-edit-unit-error"
              role="alert"
              className="kalori-fd-error"
              data-testid="food-detail-edit-unit-error"
            >
              {unitErr}
            </p>
          ) : null}
        </div>
      </div>
      {approxGrams ? (
        <p className="kalori-fd-portion" data-testid="food-detail-approx-grams">
          {approxGrams}
        </p>
      ) : null}
    </div>
  );
}

export default FoodDetailName;
