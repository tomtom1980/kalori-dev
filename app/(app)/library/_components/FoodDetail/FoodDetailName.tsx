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

import type { DraftState, EditErrors, DraftKey } from './useFoodDetailEdit';
import { formatPortion } from './foodDetail.format';

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
      </div>
    );
  }

  const nameErr = errors.display_name;
  const portionErr = errors.default_portion;
  const unitErr = errors.default_unit;

  return (
    <div className="kalori-fd-name-block">
      <label className="sr-only" htmlFor="fd-edit-name">
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
          <label className="sr-only" htmlFor="fd-edit-portion">
            {t.library.detail.portionLabel}
          </label>
          <input
            id="fd-edit-portion"
            type="text"
            inputMode="decimal"
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
          <label className="sr-only" htmlFor="fd-edit-unit">
            {t.library.detail.unitLabel}
          </label>
          <input
            id="fd-edit-unit"
            type="text"
            value={draft.default_unit}
            onChange={(e) => onDraftChange('default_unit', e.target.value)}
            aria-label={t.library.detail.unitLabel}
            aria-invalid={Boolean(unitErr)}
            aria-describedby={unitErr ? 'fd-edit-unit-error' : undefined}
            data-testid="food-detail-edit-unit-input"
            className="kalori-fd-input"
          />
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
    </div>
  );
}

export default FoodDetailName;
