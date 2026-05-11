'use client';

/**
 * `<LibraryToolsRail />` — Task 4.1 sub-step 3 §7.4.
 *
 * Toolbar wrapper composing SearchBar + FilterDropdown + SortDropdown +
 * SelectModeToggle. `role="toolbar"` per ARIA pattern enumeration #4.
 */
import { t } from '@/lib/i18n/en';
import type { LibraryFilter, LibrarySort } from '@/lib/library/types';

import { FilterDropdown } from './FilterDropdown';
import { SearchBar } from './SearchBar';
import { SelectModeToggle } from './SelectModeToggle';
import { SortDropdown } from './SortDropdown';

export interface LibraryToolsRailProps {
  search: string;
  onSearchChange: (next: string) => void;
  resultsCount: number;
  filter: LibraryFilter;
  onFilterChange: (next: LibraryFilter) => void;
  sort: LibrarySort;
  onSortChange: (next: LibrarySort) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
}

export function LibraryToolsRail({
  search,
  onSearchChange,
  resultsCount,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectMode,
  onToggleSelectMode,
}: LibraryToolsRailProps) {
  return (
    <div
      role="toolbar"
      aria-label={t.library.filterLabel + ' / ' + t.library.sortLabel}
      data-select-mode={selectMode ? 'true' : 'false'}
      data-testid="library-tools-rail"
      className="kalori-library-tools-rail"
    >
      <div className="kalori-library-tools-left">
        <SearchBar value={search} onChange={onSearchChange} resultsCount={resultsCount} />
        <FilterDropdown value={filter} onChange={onFilterChange} />
        <SortDropdown value={sort} onChange={onSortChange} />
      </div>
      <div className="kalori-library-tools-right">
        <SelectModeToggle active={selectMode} onToggle={onToggleSelectMode} />
      </div>
    </div>
  );
}

export default LibraryToolsRail;
