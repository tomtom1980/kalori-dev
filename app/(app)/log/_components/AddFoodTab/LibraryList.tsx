'use client';

/**
 * <LibraryList /> — "Log from library" panel inside the merged Add Food tab.
 *
 * Extracted from `../LibraryTab.tsx` (Task 5 of the Add Food tab merge).
 * Same rendering as LibraryTab plus three additions wired via the
 * `onAddNew` prop:
 *   - `<AddNewItemIconButton />` beside the search input — calls
 *     `onAddNew('')` to swap the AddFoodTab subview to AI parse with no
 *     seed text.
 *   - `<LibraryLoadingSkeleton />` during initial hydration (replaces the
 *     bare empty-state during the `/api/library/list` fetch).
 *   - `<AddNewItemCTA />` under the no-match empty state — calls
 *     `onAddNew(search)` to seed the AI parse textarea with the current
 *     search term.
 *
 * Phase-3 fixes preserved from LibraryTab.tsx:
 *   - Sort pills: roving tabindex + ArrowLeft/Right/Home/End handlers
 *     per WAI-ARIA radiogroup pattern (compliance §C3).
 *   - Hairline-only sort pills at 32h via `.kalori-log-sort-pill`.
 *   - Search input: left Search icon + right `/` hotkey chip + bottom
 *     oxblood focus collapse via `.kalori-log-search`.
 *   - Card structure: 56×56 thumbnail slot + name (2-line clamp)
 *     + kcal caption; letter-mark fallback when no thumbnail.
 *   - Selected card: oxblood LEFT-rule only; bg-2 surface.
 *   - Empty state wrapped in hairlines top + bottom via `.kalori-log-empty`.
 *   - Sort toggle wrapped in `startTransition` (perf §7.1 item 3).
 */
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search } from 'lucide-react';

import { MobileWheelPicker } from '@/components/primitives/MobileWheelPicker';
import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';
import { authFetch, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { t } from '@/lib/i18n/en';
import type { ParsedItemT } from '@/lib/ai/schemas';
import { isWholeStyleQuantity, isWholeStyleUnit } from '@/lib/log/portion-unit';
import {
  selectFailureMode,
  selectLibraryItems,
  selectLibrarySearch,
  selectLibrarySort,
  useLogFlowStore,
  type LibrarySelectionItem,
  type LogLibraryItem,
} from '@/lib/stores/useLogFlowStore';
import { normalizeName } from '@/lib/text/normalize';

import { ManualEntryFallback } from '../ManualEntryFallback';
import { AddNewItemIconButton } from './AddNewItemIconButton';
import { AddNewItemCTA } from './AddNewItemCTA';
import { LibraryLoadingSkeleton } from './LibraryLoadingSkeleton';

/**
 * Bug 4 — quantity wheel options for the library quantity input on
 * mobile. We default to step 0.25 over 0.25–10; consumers whose default
 * unit is grams could later raise the cap if 50-row §10.6.1 limit
 * permits, but per current spec PORTION-style step works for all
 * library items.
 */
const LIBRARY_QUANTITY_WHEEL_OPTIONS = (() => {
  const opts: { value: number; label: string }[] = [];
  for (let v = 0.25; v <= 10.0001; v += 0.25) {
    const rounded = Math.round(v * 100) / 100;
    opts.push({ value: rounded, label: rounded.toString() });
  }
  return opts;
})();

function buildLibraryQuantityWheelOptions(item: Pick<LibraryItem, 'defaultPortion' | 'unit'>) {
  if (isWholeStyleUnit(item.unit ?? 'g')) {
    const max = Math.max(10, Math.ceil((item.defaultPortion ?? 1) * 4));
    return Array.from({ length: max }, (_, i) => {
      const value = i + 1;
      return { value, label: String(value) };
    });
  }
  const defaultPortion = item.defaultPortion;
  if (defaultPortion === undefined || !Number.isFinite(defaultPortion) || defaultPortion <= 0) {
    return LIBRARY_QUANTITY_WHEEL_OPTIONS;
  }
  const step =
    defaultPortion >= 250 ? 50 : defaultPortion >= 50 ? 10 : defaultPortion >= 10 ? 5 : 0.25;
  const max = Math.max(defaultPortion * 4, step * 10);
  const opts: { value: number; label: string }[] = [];
  for (let v = step; v <= max + step * 0.001; v += step) {
    const rounded = Math.round(v * 100) / 100;
    opts.push({ value: rounded, label: rounded.toString() });
  }
  return opts;
}

function snapQuantityToWheel(q: number, options = LIBRARY_QUANTITY_WHEEL_OPTIONS): number {
  if (!options.length) return Number.isFinite(q) && q > 0 ? q : 1;
  if (!Number.isFinite(q) || q <= 0) return options[0]!.value;
  let best = options[0]!.value;
  let bestDiff = Math.abs(q - best);
  for (const option of options) {
    const diff = Math.abs(q - option.value);
    if (diff < bestDiff) {
      best = option.value;
      bestDiff = diff;
    }
  }
  return best;
}

function scaleLibraryNutrition(value: number | undefined, quantity: number): number {
  const base = value ?? 0;
  if (!Number.isFinite(base) || !Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round(base * quantity * 10) / 10;
}

function scaleLibraryKcal(value: number, quantity: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round(value * quantity);
}

function scaleLibraryMicros(
  micros: Record<string, number> | undefined,
  ratio: number,
): Record<string, number> {
  if (!micros) return {};
  return Object.fromEntries(
    Object.entries(micros).map(([key, value]) => [key, scaleLibraryNutrition(value, ratio)]),
  );
}

function libraryQuantityRatio(item: Pick<LibraryItem, 'defaultPortion'>, quantity: number): number {
  const defaultPortion = item.defaultPortion;
  if (defaultPortion !== undefined && Number.isFinite(defaultPortion) && defaultPortion > 0) {
    return quantity / defaultPortion;
  }
  return quantity;
}

/**
 * Backwards-compatible UI shape for tests that still pass `items` directly.
 * Newer callers should hydrate via `useLogFlowStore.setLibraryItems(...)` and
 * leave the prop empty. The CTA-driven Task 4.7.4 flow reads from the store.
 */
export interface LibraryItem {
  id: string;
  name: string;
  kcal: number;
  lastUsedIso: string | null;
  logCount: number;
  defaultPortion?: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  // Phase 2C — cholesterol_mg, optional for legacy tab-injected items.
  cholesterolMg?: number;
  micros?: Record<string, number>;
  approxGrams?: number;
  unit?: string;
  thumbnailUrl?: string | null;
}

export interface LibraryListProps {
  /**
   * Legacy injected items (Task 3.3). When omitted, items are read from
   * `useLogFlowStore.libraryItems` (Task 4.7.4 hydration path).
   */
  items?: LibraryItem[];
  /**
   * Add Food tab merge — called when user clicks the '+' icon (with empty
   * seed) or the empty-state CTA (with the current search term as seed).
   * Parent (AddFoodTab) typically responds by `setTypeDraft(seed)` +
   * `setActiveTab('type')`.
   */
  onAddNew: (seed: string) => void;
}

/**
 * Map a `LibrarySelectionItem` (id + quantity in the store) onto a
 * `ParsedItemT` for `enterConfirmation`. Library items are user-curated
 * so confidence = 1. Macros default to 0 if a hydrated item lacks them
 * (legacy items injected via prop).
 *
 * Multi-item caveat: the `library_item_id` round-trip currently lives
 * inside the dedupMatch + reuseExisting branch of ConfirmationScreen
 * (single-item only). For multi-row library submits, every item ships
 * as a custom entry — full library re-log macro accuracy defers to the
 * user-edit path. Captured in followups (Phase 5 dedup expansion).
 */
function buildParsedItemsFromSelection(
  items: LibraryItem[],
  selection: LibrarySelectionItem[],
): ParsedItemT[] {
  return selection.flatMap((sel) => {
    const it = items.find((i) => i.id === sel.itemId);
    if (!it) return [];
    const quantity = sel.quantity;
    const ratio = libraryQuantityRatio(it, quantity);
    return [
      {
        name: it.name,
        portion: quantity,
        unit: it.unit ?? 'g',
        kcal: scaleLibraryKcal(it.kcal, ratio),
        macros: {
          protein_g: scaleLibraryNutrition(it.proteinG, ratio),
          carbs_g: scaleLibraryNutrition(it.carbsG, ratio),
          fat_g: scaleLibraryNutrition(it.fatG, ratio),
          fiber_g: scaleLibraryNutrition(it.fiberG, ratio),
          // Phase 2C — scale cholesterol_mg with the same helper so
          // re-log at non-default quantity preserves the per-unit ratio.
          cholesterol_mg: scaleLibraryNutrition(it.cholesterolMg, ratio),
        },
        micros: scaleLibraryMicros(it.micros, ratio),
        ...(typeof it.approxGrams === 'number' &&
        Number.isFinite(it.approxGrams) &&
        it.approxGrams > 0
          ? { approxGrams: scaleLibraryNutrition(it.approxGrams, ratio) }
          : {}),
        confidence: 1,
      },
    ];
  });
}

const LIBRARY_PAGE_SIZE = 6;

function visiblePageNumbers(currentPage: number, pageCount: number): number[] {
  const maxButtons = 5;
  if (pageCount <= maxButtons) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const start = Math.min(Math.max(1, currentPage - 2), pageCount - maxButtons + 1);
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

const SORT_OPTIONS = [
  // Bug 7b — new default at position 0, mirrors `/library` page's
  // post-Bug-7 default. Pill order also determines roving-tabindex
  // ArrowLeft/Right traversal.
  { key: 'name-asc' as const, label: t.log.librarySortNameAsc },
  { key: 'frequent' as const, label: t.log.librarySortFrequent },
  { key: 'recent' as const, label: t.log.librarySortRecent },
  { key: 'highest-protein' as const, label: t.log.librarySortHighProtein },
];

function formatLastUsed(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Short editorial date — e.g., "18 Apr".
  const monthAbbr = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${d.getDate()} ${monthAbbr}`;
}

export function LibraryList({ items: propItems, onAddNew }: LibraryListProps) {
  const search = useLogFlowStore(selectLibrarySearch);
  const setSearch = useLogFlowStore((s) => s.setLibrarySearch);
  const sort = useLogFlowStore(selectLibrarySort);
  const setSort = useLogFlowStore((s) => s.setLibrarySort);
  const selection = useLogFlowStore((s) => s.librarySelection);
  const setSelection = useLogFlowStore((s) => s.setLibrarySelection);
  const setFailureMode = useLogFlowStore((s) => s.setFailureMode);
  const failureMode = useLogFlowStore(selectFailureMode);
  // Task 4.7.4 — pull hydrated items from the store unless the caller
  // passed an explicit `items` prop (legacy test path). The store-driven
  // path is the production source.
  const storeItems = useLogFlowStore(selectLibraryItems);
  const enterConfirmation = useLogFlowStore((s) => s.enterConfirmation);
  const items: LibraryItem[] =
    propItems !== undefined ? propItems : (storeItems as LogLibraryItem[]);

  const deferredSearch = useDeferredValue(search);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortGroupRef = useRef<HTMLDivElement>(null);
  const [activeDescendantId, setActiveDescendantId] = useState<string | null>(null);
  // Lazy init: hydrating starts true iff we'll actually fetch (no propItems and
  // store is empty at mount). Computed once at render — avoids the
  // react-hooks/set-state-in-effect anti-pattern of synchronously calling
  // setHydrating(true) inside the effect body.
  const [hydrating, setHydrating] = useState(
    () => propItems === undefined && useLogFlowStore.getState().libraryItems.length === 0,
  );
  const resultCountId = useId();

  // Self-hydrate from `/api/library/list` every time the modal mounts.
  // Stale-while-revalidate: if the store has items from a previous open,
  // the current render uses them immediately (no skeleton flash because
  // `hydrating` was initialized false); the in-flight fetch then replaces
  // them so additions made on `/library` since the last open show up
  // without a full page reload. 401 is handled by `authFetch`
  // (refresh-retry → forced sign-out via SessionExpiredError); other
  // non-ok responses leave the store contents intact.
  useEffect(() => {
    if (propItems !== undefined) return;
    let cancelled = false;
    authFetch('/api/library/list')
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { items: LogLibraryItem[] };
        if (cancelled) return;
        useLogFlowStore.getState().setLibraryItems(json.items);
      })
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) return;
        // Other errors: leave store empty so the UI shows the empty state.
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propItems]);

  // `/` focuses search — guarded by the 5-rule IME check.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== '/') return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const normalized = normalizeName(deferredSearch);
  const filtered = normalized
    ? items.filter((it) => normalizeName(it.name).includes(normalized))
    : items;

  const sorted = [...filtered].sort((a, b) => {
    // Bug 7b — alphabetical (A→Z) sort. Mirrors `/library`'s
    // `applySort('name-asc')` semantics inline; not refactored to share
    // because the log-modal's `LibraryItem.name` field maps to
    // `LibraryItem.display_name` on the `/library` shape.
    if (sort === 'name-asc') return a.name.localeCompare(b.name);
    if (sort === 'frequent') return b.logCount - a.logCount;
    if (sort === 'recent') {
      const aT = a.lastUsedIso ? Date.parse(a.lastUsedIso) : 0;
      const bT = b.lastUsedIso ? Date.parse(b.lastUsedIso) : 0;
      return bT - aT;
    }
    return b.proteinG - a.proteinG;
  });

  // Pagination — same reset-key pattern as `/library`'s LibraryClient.
  // Encoding search+sort in the key auto-resets to page 1 when either
  // changes, without an extra effect. `Math.min(pageState.page, pageCount)`
  // clamps so the user doesn't end up on an empty page after the result
  // set shrinks (e.g., narrowed filter or background refetch deleted rows).
  const pageResetKey = `${normalized}\u0000${sort}`;
  const [pageState, setPageState] = useState(() => ({ key: pageResetKey, page: 1 }));
  const pageCount = Math.max(1, Math.ceil(sorted.length / LIBRARY_PAGE_SIZE));
  const currentPage = pageState.key === pageResetKey ? Math.min(pageState.page, pageCount) : 1;
  const visibleSorted = useMemo(() => {
    const start = (currentPage - 1) * LIBRARY_PAGE_SIZE;
    return sorted.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [sorted, currentPage]);
  const paginationPages = useMemo(
    () => visiblePageNumbers(currentPage, pageCount),
    [currentPage, pageCount],
  );

  const toggleItem = (id: string) => {
    const existing = selection.find((s) => s.itemId === id);
    if (existing) {
      setSelection(selection.filter((s) => s.itemId !== id));
    } else {
      const item = items.find((i) => i.id === id);
      const defaultQuantity =
        item?.defaultPortion !== undefined &&
        Number.isFinite(item.defaultPortion) &&
        item.defaultPortion > 0
          ? item.defaultPortion
          : 1;
      setSelection([...selection, { itemId: id, quantity: defaultQuantity }]);
    }
  };

  // F-TASK-4.2-I2-UI-ROUNDTRIP — update the quantity for a selected row
  // without toggling its selected state. Non-positive / non-numeric values
  // are coerced to 1 (mirrors LogPageClient's URL parser fallback).
  const setQuantity = (id: string, raw: string) => {
    const item = items.find((i) => i.id === id);
    const parsed = Number(raw);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : raw.trim() === '' ? 1 : 1;
    if (item?.unit && !isWholeStyleQuantity(item.unit, next)) return;
    setSelection(selection.map((s) => (s.itemId === id ? { itemId: id, quantity: next } : s)));
  };

  // Bug 4 — mobile wheel-picker bottom-sheet for the per-card quantity
  // input (`Planning/ui-design.md` §7.2.5 + tiebreaker #23). Desktop
  // keeps the inline `<input type="number">`. Mobile shows a tap-to-open
  // trigger backed by `MobileWheelSheet`.
  const isMobile = useIsMobile();
  const [wheelOpenForId, setWheelOpenForId] = useState<string | null>(null);
  const [wheelDraft, setWheelDraft] = useState<number>(1);
  const setQuantityNumber = (id: string, n: number) => {
    const item = items.find((i) => i.id === id);
    if (item?.unit && !isWholeStyleQuantity(item.unit, n)) return;
    setSelection(selection.map((s) => (s.itemId === id ? { itemId: id, quantity: n } : s)));
  };

  const scrollToLibraryTop = () => {
    const frame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0);
    frame(() => {
      const node = containerRef.current;
      if (!node) return;
      let parent = node.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (
          /(auto|scroll|overlay)/.test(style.overflowY) &&
          parent.scrollHeight > parent.clientHeight
        ) {
          parent.scrollTo({ top: 0, behavior: 'auto' });
          return;
        }
        parent = parent.parentElement;
      }
      node.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  };

  const setPage = (page: number) => {
    const nextPage = Math.min(pageCount, Math.max(1, page));
    if (nextPage === currentPage) return;
    setPageState({ key: pageResetKey, page: nextPage });
    scrollToLibraryTop();
  };

  // Roving tabindex + ArrowKey nav for sort pills (compliance §C3).
  const handleSortKey = (ev: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = SORT_OPTIONS.findIndex((o) => o.key === sort);
    if (currentIndex < 0) return;
    let next = currentIndex;
    switch (ev.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (currentIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        next = (currentIndex + 1) % SORT_OPTIONS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = SORT_OPTIONS.length - 1;
        break;
      default:
        return;
    }
    ev.preventDefault();
    const option = SORT_OPTIONS[next];
    if (!option) return;
    const key = option.key;
    startTransition(() => setSort(key));
    // Move focus to the newly-active pill.
    const btns = sortGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    btns?.[next]?.focus();
  };

  const renderPagination = (position: 'top' | 'bottom') => {
    if (pageCount <= 1) return null;
    const suffix = position === 'bottom' ? '' : `-${position}`;
    return (
      <nav
        className="kalori-library-pagination"
        aria-label={t.library.paginationLabel}
        data-testid={`library-list-pagination${suffix}`}
      >
        <button
          type="button"
          className="kalori-library-pagination-btn"
          onClick={() => setPage(currentPage - 1)}
          aria-disabled={currentPage === 1 ? 'true' : 'false'}
          data-testid={`library-list-pagination${suffix}-prev`}
        >
          {t.library.paginationPrevious}
        </button>
        <div className="kalori-library-pagination-pages">
          {paginationPages.map((pageNumber) => {
            const isCurrent = pageNumber === currentPage;
            return (
              <button
                key={pageNumber}
                type="button"
                className="kalori-library-pagination-page"
                onClick={() => setPage(pageNumber)}
                aria-current={isCurrent ? 'page' : undefined}
                data-testid={`library-list-pagination${suffix}-page-${pageNumber}`}
              >
                {pageNumber}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="kalori-library-pagination-btn"
          onClick={() => setPage(currentPage + 1)}
          aria-disabled={currentPage === pageCount ? 'true' : 'false'}
          data-testid={`library-list-pagination${suffix}-next`}
        >
          {t.library.paginationNext}
        </button>
      </nav>
    );
  };

  return (
    // Outer wrapper has no `data-testid` — `library-list` is reserved for
    // the inner <ul> (Task 5 tests assert `queryByTestId('library-list')`
    // is null while the loading skeleton is rendered). The plan's rename
    // instruction (`library-tab` → `library-list`) would collide with the
    // inner <ul> testid; dropping the wrapper testid resolves the conflict
    // without changing any test contract.
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}
    >
      <label htmlFor="library-search" className="sr-only">
        {t.log.librarySearchLabel}
      </label>
      {/* Search row: input + Add new icon button */}
      <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 'var(--spacing-3)',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-dust)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={searchInputRef}
            id="library-search"
            type="search"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={t.log.librarySearchPlaceholder}
            autoComplete="off"
            data-testid="library-search-input"
            aria-describedby={resultCountId}
            className="kalori-log-search"
          />
          <kbd
            aria-hidden="true"
            className="kalori-log-kbd"
            style={{
              position: 'absolute',
              right: 'var(--spacing-3)',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {t.log.librarySearchKbdHint}
          </kbd>
        </div>
        <AddNewItemIconButton onAddNew={() => onAddNew('')} />
      </div>

      {/* sr-only result count — polite live region per compliance §13. */}
      <span id={resultCountId} role="status" aria-live="polite" className="sr-only">
        {t.log.libraryResultCount
          .replace('{shown}', String(sorted.length))
          .replace('{total}', String(items.length))}
      </span>

      <div
        ref={sortGroupRef}
        role="radiogroup"
        aria-label={t.log.librarySortLabel}
        data-testid="library-sort"
        onKeyDown={handleSortKey}
      >
        {SORT_OPTIONS.map(({ key, label }) => {
          const active = sort === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              // Roving tabindex: exactly one pill is in tab order.
              tabIndex={active ? 0 : -1}
              data-testid={`library-sort-${key}`}
              onClick={() => startTransition(() => setSort(key))}
              className="kalori-log-sort-pill"
            >
              {label}
            </button>
          );
        })}
      </div>

      {hydrating && items.length === 0 ? (
        <LibraryLoadingSkeleton />
      ) : sorted.length === 0 ? (
        <div
          className="kalori-log-empty"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-3)',
            alignItems: 'center',
          }}
        >
          <p
            data-testid="library-empty-state"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: '18px',
              fontWeight: 300,
              color: 'var(--color-sand)',
              margin: 0,
            }}
          >
            {normalized ? t.log.libraryNoMatchWithCta : t.log.libraryEmpty}
          </p>
          {normalized ? <AddNewItemCTA searchTerm={search} onAddNew={onAddNew} /> : null}
        </div>
      ) : (
        <>
          {renderPagination('top')}
          <ul
            role="listbox"
            aria-label={t.log.libraryListA11y}
            aria-multiselectable="true"
            aria-activedescendant={activeDescendantId ?? undefined}
            data-testid="library-list"
            className="kalori-log-grid"
          >
            {visibleSorted.map((it) => {
              const selectedEntry = selection.find((s) => s.itemId === it.id);
              const selected = selectedEntry !== undefined;
              const id = `lib-item-${it.id}`;
              const initial = it.name.trim().charAt(0).toUpperCase() || '?';
              const lastUsed = formatLastUsed(it.lastUsedIso);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    id={id}
                    role="option"
                    aria-selected={selected}
                    data-testid={`library-card-${it.id}`}
                    onFocus={() => setActiveDescendantId(id)}
                    onClick={() => toggleItem(it.id)}
                    className="kalori-log-card"
                  >
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- thumbnails may be data: URLs (Task 3.4)
                      <img
                        src={it.thumbnailUrl}
                        alt=""
                        role="presentation"
                        className="kalori-log-card-thumb"
                      />
                    ) : (
                      <span
                        className="kalori-log-letter-mark"
                        aria-hidden="true"
                        data-testid={`library-card-lettermark-${it.id}`}
                      >
                        {initial}
                      </span>
                    )}
                    <span className="kalori-log-card-text">
                      <span
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: '17px',
                          lineHeight: 1.25,
                          color: 'var(--color-ivory)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {it.name}
                      </span>
                      <span
                        className="num kalori-log-card-kcal"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-ivory)',
                        }}
                      >
                        <span style={{ fontSize: '18px', fontWeight: 500 }}>{it.kcal}</span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                            color: 'var(--color-dust)',
                            marginInlineStart: '6px',
                          }}
                        >
                          {t.log.libraryCardUnit}
                        </span>
                      </span>
                      <span
                        className="num kalori-log-card-macros"
                        data-testid={`library-card-macros-${it.id}`}
                      >
                        {[
                          t.log.libraryCardMacroProtein.replace(
                            '{value}',
                            String(Math.round(it.proteinG)),
                          ),
                          it.carbsG !== undefined
                            ? t.log.libraryCardMacroCarbs.replace(
                                '{value}',
                                String(Math.round(it.carbsG)),
                              )
                            : null,
                          it.fatG !== undefined
                            ? t.log.libraryCardMacroFat.replace(
                                '{value}',
                                String(Math.round(it.fatG)),
                              )
                            : null,
                          it.fiberG !== undefined
                            ? t.log.libraryCardMacroFiber.replace(
                                '{value}',
                                String(Math.round(it.fiberG)),
                              )
                            : null,
                          it.cholesterolMg !== undefined
                            ? t.log.libraryCardMacroCholesterol.replace(
                                '{value}',
                                String(Math.round(it.cholesterolMg)),
                              )
                            : null,
                        ]
                          .filter((s): s is string => s !== null)
                          .join(' · ')}
                      </span>
                      {lastUsed ? (
                        <span
                          className="num"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10.5px',
                            fontStyle: 'italic',
                            color: 'var(--color-dust-2)',
                            marginBlockStart: 'auto',
                          }}
                          data-testid={`library-card-lastused-${it.id}`}
                        >
                          {lastUsed}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {selected ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-2)',
                        paddingInline: 'var(--spacing-3)',
                        paddingBlock: 'var(--spacing-2)',
                        borderTop: '1px solid var(--color-rule)',
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <label
                        htmlFor={`library-quantity-${it.id}`}
                        className="num"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10.5px',
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: 'var(--color-dust)',
                        }}
                      >
                        {(it.unit ?? 'g').toUpperCase()}
                      </label>
                      {isMobile ? (
                        <button
                          type="button"
                          data-testid={`library-quantity-wheel-trigger-${it.id}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setWheelDraft(
                              snapQuantityToWheel(
                                selectedEntry?.quantity ?? it.defaultPortion ?? 1,
                                buildLibraryQuantityWheelOptions(it),
                              ),
                            );
                            setWheelOpenForId(it.id);
                          }}
                          aria-haspopup="listbox"
                          aria-label={`${(it.unit ?? 'g').toUpperCase()} quantity`}
                          style={{
                            minHeight: 44,
                            minWidth: 88,
                            background: 'var(--color-bg-1)',
                            border: '1px solid var(--color-rule-strong)',
                            color: 'var(--color-ivory)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          {selectedEntry?.quantity ?? 1} <span aria-hidden="true">▾</span>
                        </button>
                      ) : (
                        <input
                          id={`library-quantity-${it.id}`}
                          data-testid={`library-quantity-${it.id}`}
                          type="number"
                          inputMode={isWholeStyleUnit(it.unit ?? 'g') ? 'numeric' : 'decimal'}
                          min={0}
                          step={isWholeStyleUnit(it.unit ?? 'g') ? 1 : 'any'}
                          value={selectedEntry?.quantity ?? 1}
                          onChange={(ev) => setQuantity(it.id, ev.target.value)}
                          onClick={(ev) => ev.stopPropagation()}
                          style={{
                            width: 80,
                            background: 'var(--color-bg-1)',
                            border: '1px solid var(--color-rule)',
                            color: 'var(--color-ivory)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            padding: 'var(--spacing-1) var(--spacing-2)',
                          }}
                        />
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {renderPagination('bottom')}

      {/*
        Bug 4 / Codex R1 C2 — render the wheel sheet at the component root
        (one Sheet, gated by `wheelOpenForId`) instead of per-row. Only one
        wheel is open at a time; the row id selects the active selection
        entry. Without this consumer the mobile branch above sets state
        but nothing visible happens, leaving mobile users with no way to
        edit Library quantities (desktop input is hidden on mobile).
      */}
      {(() => {
        if (!isMobile || wheelOpenForId === null) return null;
        const activeItem = items.find((it) => it.id === wheelOpenForId);
        if (!activeItem) return null;
        const wheelOptions = buildLibraryQuantityWheelOptions(activeItem);
        const closeWheel = () => setWheelOpenForId(null);
        const commitWheel = (value: number) => {
          setQuantityNumber(activeItem.id, value);
          setWheelOpenForId(null);
        };
        return (
          <MobileWheelSheet
            open
            onCancel={closeWheel}
            onDone={() => commitWheel(wheelDraft)}
            title={t.log.libraryQuantityWheelLabel}
            description={`${activeItem.name} · ${(activeItem.unit ?? 'g').toUpperCase()}`}
            data-testid={`library-quantity-wheel-sheet-${activeItem.id}`}
          >
            <MobileWheelPicker
              value={wheelDraft}
              onChange={setWheelDraft}
              onCommit={commitWheel}
              onCancel={closeWheel}
              options={wheelOptions}
              ariaLabel={t.log.libraryQuantityWheelLabel}
              data-testid={`library-quantity-wheel-${activeItem.id}`}
            />
          </MobileWheelSheet>
        );
      })()}

      {selection.length > 0 ? (
        <div
          className="kalori-fd-actions"
          style={{
            position: 'sticky',
            bottom: 0,
            insetInline: 0,
          }}
        >
          <button
            type="button"
            data-testid="library-log-selected"
            className="kalori-fd-btn-primary"
            onClick={() => {
              const parsedItems = buildParsedItemsFromSelection(items, selection);
              if (parsedItems.length === 0) return;
              // Codex Round 1 CRITICAL — preserve per-item library_item_id
              // mapping so the save endpoint links the food_entries row to
              // the source library row. Build the ids array in the SAME
              // order parsedItems were built so ConfirmationScreen can
              // align positionally. `buildParsedItemsFromSelection` skips
              // selections whose ids aren't in `items` (e.g., a stale
              // selection just pruned away); mirror that filter here.
              const presentIds = new Set(items.map((i) => i.id));
              const orderedSelectionIds = selection
                .filter((sel) => presentIds.has(sel.itemId))
                .map((sel) => sel.itemId);
              // Single library_item_id per food_entries row contract: only
              // the first selected item carries the id; subsequent items
              // become custom entries (null). See task-4.7.4-output.md
              // decision §2.
              const libraryItemIds: (string | null)[] = orderedSelectionIds.map((id, idx) =>
                idx === 0 ? id : null,
              );
              enterConfirmation({
                source: 'library',
                tab: 'library',
                items: parsedItems,
                reasoning: null,
                dedupMatch: null,
                libraryItemIds,
              });
            }}
          >
            {t.log.libraryLogSelected.replace('{count}', String(selection.length))}
          </button>
        </div>
      ) : null}

      {failureMode ? (
        <ManualEntryFallback
          forceMode="library"
          onRetry={() => {
            setFailureMode(null, null);
          }}
        />
      ) : null}
    </div>
  );
}

export default LibraryList;
