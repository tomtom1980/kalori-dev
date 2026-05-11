'use client';

/**
 * `<LibraryCard />` — Task 4.1 sub-step 3 §7.10.
 *
 * Card button for `/library`. Reads selection state from
 * `useLibrarySelectionStore` via a PRIMITIVE-BOOLEAN selector
 * (`selectHasId(id)`) per react-perf §11.3 non-negotiable — the card only
 * re-renders when its own membership flips, not on every other card's
 * toggle.
 *
 * Browse mode: `role="button"`, Enter/Space activates (stub hook for a
 * future FoodDetail overlay). Select mode: `role="checkbox" aria-checked`,
 * Enter/Space toggles. Roving tabindex driven by parent grid's `activeId`.
 *
 * Thumbnail: `next/image` with `sizes` per viewport + quality 72 + AVIF
 * when available (via `next.config.ts`). Missing thumbnail →
 * `<ThumbnailLetterMark>` fallback.
 */
import Image from 'next/image';
import { memo, useCallback } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { selectHasId, useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

import { ThumbnailLetterMark } from './ThumbnailLetterMark';

export interface LibraryCardProps {
  item: LibraryItem;
  index: number;
  selectMode: boolean;
  isActive: boolean;
  onActivate: (item: LibraryItem) => void;
  onToggleSelect: (id: string) => void;
  onFocus: (id: string) => void;
}

function formatPortion(item: LibraryItem): string {
  if (!item.default_portion && !item.default_unit) return '';
  const portion = item.default_portion ?? 1;
  const unit = item.default_unit ?? '';
  return `${portion} ${unit}`.trim();
}

function formatAriaLabel(item: LibraryItem): string {
  return t.library.cardAriaLabel
    .replace('{name}', item.display_name)
    .replace('{portion}', String(item.default_portion ?? 1))
    .replace('{unit}', item.default_unit ?? 'piece')
    .replace('{kcal}', String(item.nutrition?.kcal ?? 0))
    .replace('{count}', String(item.log_count));
}

function LibraryCardInner({
  item,
  index,
  selectMode,
  isActive,
  onActivate,
  onToggleSelect,
  onFocus,
}: LibraryCardProps) {
  const isSelected = useLibrarySelectionStore(selectHasId(item.id));

  const handleClick = useCallback(() => {
    if (selectMode) onToggleSelect(item.id);
    else onActivate(item);
  }, [selectMode, onActivate, onToggleSelect, item]);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLButtonElement>) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const ariaLabel = formatAriaLabel(item);
  const portion = formatPortion(item);
  const macros = item.nutrition?.macros;

  return (
    <button
      type="button"
      data-testid={`library-card-${item.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      role={selectMode ? 'checkbox' : 'button'}
      aria-checked={selectMode ? isSelected : undefined}
      aria-label={ariaLabel}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocus(item.id)}
      className="kalori-library-card"
    >
      <div className="kalori-library-card-thumb">
        {item.thumbnail_url ? (
          <Image
            src={item.thumbnail_url}
            alt=""
            width={240}
            height={180}
            quality={72}
            sizes="(min-width: 1280px) 240px, (min-width: 768px) 220px, 160px"
            priority={index < 8}
            data-testid={`library-card-thumb-${item.id}`}
          />
        ) : (
          <ThumbnailLetterMark
            displayName={item.display_name}
            testId={`library-card-lettermark-${item.id}`}
          />
        )}
        <span className="kalori-library-card-count-badge" aria-hidden="true">
          {item.log_count}×
        </span>
        {selectMode ? (
          <span className="kalori-library-card-selection-chip" aria-hidden="true" />
        ) : null}
      </div>
      <div className="kalori-library-card-body">
        <p className="kalori-library-card-name">{item.display_name}</p>
        {portion ? <p className="kalori-library-card-portion">{portion}</p> : null}
        <div className="kalori-library-card-divider" aria-hidden="true" />
        <div className="kalori-library-card-footer">
          <span className="kalori-library-card-kcal num">
            {`${item.nutrition?.kcal ?? 0} ${t.library.cardKcalSuffix}`}
          </span>
          {macros ? (
            <span className="kalori-library-card-macros num">
              {t.library.cardMacrosFormat
                .replace('{p}', String(Math.round(macros.protein_g)))
                .replace('{c}', String(Math.round(macros.carbs_g)))
                .replace('{f}', String(Math.round(macros.fat_g)))}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// React Compiler handles memoization; explicit `memo` here only narrows the
// props surface — the primitive-boolean Zustand selector inside is the real
// per-card re-render guard.
export const LibraryCard = memo(LibraryCardInner);
export default LibraryCard;
