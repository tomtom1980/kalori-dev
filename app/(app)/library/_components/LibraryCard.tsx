'use client';

/**
 * `<LibraryCard />` — Task 4.1 sub-step 3 §7.10.
 *
 * Card for `/library`. Reads selection state from
 * `useLibrarySelectionStore` via a PRIMITIVE-BOOLEAN selector
 * (`selectHasId(id)`) per react-perf §11.3 non-negotiable — the card only
 * re-renders when its own membership flips, not on every other card's
 * toggle.
 *
 * Browse mode: `role="button"` unless the quick-action menu is mounted; in
 * that case the card uses `role="group"` so the nested menu button is not
 * inside another interactive control. Select mode: `role="checkbox"
 * aria-checked`, Enter/Space toggles. Roving tabindex driven by parent grid's
 * `activeId`.
 *
 * **Bug 3 (library overhaul 2026-05-16):** root refactored from native
 * `<button>` to a focusable `<div>` so the kebab quick-action menu can sit
 * inside the same visual card without invalid HTML. When the menu is mounted
 * the root uses `role="group"`; otherwise browse cards keep `role="button"`.
 * Keyboard semantics are preserved via `tabIndex` (driven by parent's
 * roving-tabindex `isActive`) + Enter/Space keydown handler. The menu trigger
 * is hidden in selectMode (not rendered at all so it leaves the tab order).
 *
 * Thumbnail: `next/image` with `sizes` per viewport + quality 72 + AVIF
 * when available (via `next.config.ts`). Missing thumbnail →
 * `<ThumbnailLetterMark>` fallback.
 */
import Image from 'next/image';
import { memo, useCallback } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { isItemPendingSketch } from '@/lib/library/sketch-pending';
import { selectHasId, useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

import { LibraryCardActionMenu } from './LibraryCardActionMenu';
import { ThumbnailLetterMark } from './ThumbnailLetterMark';
import { ThumbnailSketchPending } from './ThumbnailSketchPending';

export interface LibraryCardProps {
  item: LibraryItem;
  index: number;
  selectMode: boolean;
  isActive: boolean;
  onActivate: (item: LibraryItem) => void;
  onToggleSelect: (id: string) => void;
  onFocus: (id: string) => void;
  /**
   * Bug 2 (library overhaul 2026-05-16) — true while the parent's
   * `router.push(/library/[id])` transition is in flight. The card
   * surfaces `aria-busy="true"` + `data-pending="true"` for an
   * instant-feedback cue while the route-level `loading.tsx` skeleton
   * boots.
   */
  pending?: boolean;
  /**
   * Bug 3 (library overhaul 2026-05-16) — kebab menu Edit action. When
   * provided AND `selectMode` is false, a quick-action trigger is
   * mounted in the top-right corner of the thumbnail. Receives the
   * card's `item.id`.
   */
  onCardEdit?: ((id: string) => void) | undefined;
  /**
   * Bug 3 (library overhaul 2026-05-16) — kebab menu Delete action.
   * Same gating as `onCardEdit`.
   */
  onCardDelete?: ((id: string) => void) | undefined;
  /**
   * Kebab menu Quick log action — opens a meal picker, then logs the
   * item via the same /api/library/[id]/log-now route the bulk-log flow
   * uses. Same gating as `onCardEdit`.
   */
  onCardQuickLog?: ((id: string) => void) | undefined;
  /** Kebab menu Create recipe action, shown only for recipe-eligible items. */
  onCardCreateRecipe?: ((id: string) => void) | undefined;
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

function formatApproxGrams(item: LibraryItem): string | null {
  const grams = item.nutrition?.approxGrams;
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) return null;
  return t.library.cardApproxGrams.replace('{grams}', String(Math.round(grams)));
}

function LibraryCardInner({
  item,
  index,
  selectMode,
  isActive,
  onActivate,
  onToggleSelect,
  onFocus,
  pending = false,
  onCardEdit,
  onCardDelete,
  onCardQuickLog,
  onCardCreateRecipe,
}: LibraryCardProps) {
  const isSelected = useLibrarySelectionStore(selectHasId(item.id));

  const handleClick = useCallback(() => {
    if (selectMode) onToggleSelect(item.id);
    else onActivate(item);
  }, [selectMode, onActivate, onToggleSelect, item]);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const ariaLabel = formatAriaLabel(item);
  const portion = formatPortion(item);
  const approxGrams = formatApproxGrams(item);
  const macros = item.nutrition?.macros;
  // Bug 3 — menu only mounts in browse mode, and only when handlers are
  // wired. Not rendered (rather than hidden via CSS) so it leaves the
  // tab order entirely in selectMode.
  const showMenu =
    !selectMode &&
    (onCardEdit !== undefined ||
      onCardDelete !== undefined ||
      onCardQuickLog !== undefined ||
      onCardCreateRecipe !== undefined);
  const showCreateRecipe =
    item.recipe_eligibility === 'eligible' && onCardCreateRecipe !== undefined;

  return (
    <div
      // Bug 3 - menu cards use `group` to avoid a nested-interactive tree.
      // Keyboard semantics stay on this focusable root.
      role={selectMode ? 'checkbox' : showMenu ? 'group' : 'button'}
      data-testid={`library-card-${item.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      data-pending={pending ? 'true' : undefined}
      aria-busy={pending || undefined}
      aria-checked={selectMode ? isSelected : undefined}
      aria-label={ariaLabel}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocus(item.id)}
      // Opt out of the sitewide 3D hover-lift. The card already has its own
      // hover treatment (thumb-image opacity + letter-mark brightness — see
      // globals.css around `.kalori-library-card:hover`). The universal
      // `filter: saturate(...) brightness(...)` re-rasterizes the nested
      // <Image>, which flickers when focus moves to the Radix kebab portal.
      data-no-hover-lift="true"
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
            sizes="(min-width: 1280px) 240px, 160px"
            priority={index < 8}
            data-testid={`library-card-thumb-${item.id}`}
            // Bug 5 (library overhaul 2026-05-16) — discriminator so
            // CSS / tests can target sketches vs photos without an
            // extra class. `undefined` (not the string "false") keeps
            // the attribute absent for photo / unknown kinds.
            data-sketch={item.thumbnail_kind === 'sketch' ? 'true' : undefined}
          />
        ) : isItemPendingSketch(item) ? (
          // Sketch is still being generated server-side. Spinner replaces
          // the letter-mark fallback during the 60 s pending window;
          // LibraryClient polls the RSC tree so the real thumbnail
          // lands here as soon as the pipeline finishes.
          <ThumbnailSketchPending
            displayName={item.display_name}
            testId={`library-card-pending-${item.id}`}
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
        {showMenu ? (
          <LibraryCardActionMenu
            itemId={item.id}
            displayName={item.display_name}
            onEdit={() => onCardEdit?.(item.id)}
            onDelete={() => onCardDelete?.(item.id)}
            onQuickLog={() => onCardQuickLog?.(item.id)}
            onCreateRecipe={showCreateRecipe ? () => onCardCreateRecipe?.(item.id) : undefined}
          />
        ) : null}
      </div>
      <div className="kalori-library-card-body">
        <p className="kalori-library-card-name">{item.display_name}</p>
        {portion ? <p className="kalori-library-card-portion">{portion}</p> : null}
        {approxGrams ? (
          <p className="kalori-library-card-portion" data-testid={`library-card-approx-${item.id}`}>
            {approxGrams}
          </p>
        ) : null}
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
    </div>
  );
}

// React Compiler handles memoization; explicit `memo` here only narrows the
// props surface — the primitive-boolean Zustand selector inside is the real
// per-card re-render guard.
export const LibraryCard = memo(LibraryCardInner);
export default LibraryCard;
