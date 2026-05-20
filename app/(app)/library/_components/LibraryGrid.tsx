'use client';

/**
 * `<LibraryGrid />` — Task 4.1 sub-step 3 §7.9.
 *
 * `<ul role="list">` wrapper with 4/3/2 responsive columns + shared
 * hairlines + `content-visibility: auto` per-cell (react-perf §12 rule
 * `rendering-content-visibility`). Only real library items are rendered;
 * partial final rows are intentionally left unpadded.
 *
 * Roving tabindex: first card tabbable, rest -1 — arrow keys navigate per
 * current breakpoint column count. Parent owns the `activeId` state.
 *
 * **Deviation (§18.1 non-negotiable):** `role="list"` (not `role="grid"`)
 * because `grid` is the wrong WAI-ARIA pattern for non-tabular browsable
 * content. Explicit role needed because Safari VoiceOver drops list
 * semantics when `list-style: none`.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

import { LibraryCard } from './LibraryCard';

export interface LibraryGridProps {
  items: readonly LibraryItem[];
  removedIds: ReadonlySet<string>;
  selectMode: boolean;
  onActivate: (item: LibraryItem) => void;
  onToggleSelect: (id: string) => void;
  /** Optional: a fallback to render when items.length === 0 (filtered-to-zero). */
  renderEmpty?: () => React.ReactNode;
  /**
   * Bug 2 (library overhaul 2026-05-16) — id of the card whose
   * `router.push(/library/[id])` transition is currently pending. Used to
   * paint a click-feedback cue on the originating card while the
   * route-level `loading.tsx` skeleton boots.
   */
  pendingId?: string | null;
  /**
   * Bug 3 (library overhaul 2026-05-16) — per-card kebab menu Edit
   * handler. When provided, each card mounts a quick-action menu
   * trigger in its thumbnail's top-right (browse mode only).
   */
  onCardEdit?: (id: string) => void;
  /**
   * Bug 3 (library overhaul 2026-05-16) — per-card kebab menu Delete
   * handler. Paired with `onCardEdit`.
   */
  onCardDelete?: (id: string) => void;
  /** Kebab menu Quick log handler — opens a meal picker, then logs the
   * item via /api/library/[id]/log-now. Same gating as `onCardEdit`. */
  onCardQuickLog?: (id: string) => void;
  /** Kebab menu Create recipe handler, shown only for eligible items. */
  onCardCreateRecipe?: (id: string) => void;
}

function getColumnCount(): number {
  if (typeof window === 'undefined') return 4;
  const w = window.innerWidth;
  if (w >= 1280) return 4;
  return 2;
}

export function LibraryGrid({
  items,
  removedIds,
  selectMode,
  onActivate,
  onToggleSelect,
  renderEmpty,
  pendingId = null,
  onCardEdit,
  onCardDelete,
  onCardQuickLog,
  onCardCreateRecipe,
}: LibraryGridProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  const handleFocus = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const focusCard = useCallback((id: string) => {
    setActiveId(id);
    // Defer focus to the next tick so the roving tabindex attribute update
    // is committed before we try to focus the node.
    // Bug 3 — card root is now `<div role="button">` (not native button)
    // to host the nested kebab menu trigger. `HTMLElement.focus()`
    // still works on a div with `tabIndex>=0`.
    queueMicrotask(() => {
      const node = listRef.current?.querySelector<HTMLElement>(
        `[data-testid="library-card-${id}"]`,
      );
      node?.focus();
    });
  }, []);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLUListElement>) => {
      if (!items.length) return;
      const idx = items.findIndex((i) => i.id === (activeId ?? items[0]?.id));
      if (idx < 0) return;
      const cols = getColumnCount();
      let next = idx;
      switch (ev.key) {
        case 'ArrowRight':
          next = Math.min(idx + 1, items.length - 1);
          break;
        case 'ArrowLeft':
          next = Math.max(idx - 1, 0);
          break;
        case 'ArrowDown':
          next = Math.min(idx + cols, items.length - 1);
          break;
        case 'ArrowUp':
          next = Math.max(idx - cols, 0);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = items.length - 1;
          break;
        default:
          return;
      }
      ev.preventDefault();
      const target = items[next];
      if (target) focusCard(target.id);
    },
    [items, activeId, focusCard],
  );

  const effectiveActive = useMemo(() => {
    if (activeId && items.some((i) => i.id === activeId)) return activeId;
    return items[0]?.id ?? null;
  }, [activeId, items]);

  if (items.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>;
  }

  return (
    <ul
      ref={listRef}
      role="list"
      aria-label={t.library.gridLabel}
      data-testid="library-grid"
      onKeyDown={handleKeyDown}
      className="kalori-library-grid"
    >
      {items.map((item, index) => {
        const removed = removedIds.has(item.id);
        return (
          <li
            key={item.id}
            className="kalori-library-cell"
            data-removed={removed ? 'true' : 'false'}
            aria-hidden={removed ? 'true' : undefined}
          >
            <LibraryCard
              item={item}
              index={index}
              selectMode={selectMode}
              isActive={item.id === effectiveActive}
              onActivate={onActivate}
              onToggleSelect={onToggleSelect}
              onFocus={handleFocus}
              pending={pendingId === item.id}
              onCardEdit={onCardEdit}
              onCardDelete={onCardDelete}
              onCardQuickLog={onCardQuickLog}
              onCardCreateRecipe={onCardCreateRecipe}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default LibraryGrid;
