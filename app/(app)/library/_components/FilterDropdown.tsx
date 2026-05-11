'use client';

/**
 * `<FilterDropdown />` — Task 4.1 sub-step 3 §7.6.
 *
 * Renamed from `FilterPills.tsx` per Q5 (see §18.5 deviation). Radix
 * `DropdownMenu.RadioGroup` hosting ALL / WITH PHOTOS / NO PHOTOS /
 * LOGGED THIS WEEK options. `aria-checked` semantics through RadioItem.
 * The value change is wrapped in `startTransition` so the dropdown-close
 * animation stays snappy while the grid re-derives at lower priority
 * (reconciled §8 rationale for filter/sort transitions).
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { startTransition } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibraryFilter } from '@/lib/library/types';

export interface FilterDropdownProps {
  value: LibraryFilter;
  onChange: (next: LibraryFilter) => void;
}

const OPTIONS: ReadonlyArray<{ value: LibraryFilter; labelKey: keyof typeof t.library }> = [
  { value: 'all', labelKey: 'filterAll' },
  { value: 'with-photos', labelKey: 'filterWithPhotos' },
  { value: 'no-photos', labelKey: 'filterNoPhotos' },
  { value: 'this-week', labelKey: 'filterThisWeek' },
];

export function FilterDropdown({ value, onChange }: FilterDropdownProps) {
  const activeLabel =
    (t.library[OPTIONS.find((o) => o.value === value)?.labelKey ?? 'filterAll'] as string) ??
    String(t.library.filterAll);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="kalori-library-dropdown-trigger"
          data-testid="library-filter-trigger"
        >
          <span className="kalori-library-dropdown-trigger-label">{t.library.filterLabel}</span>
          <span className="kalori-library-dropdown-trigger-value">{activeLabel}</span>
          <ChevronDown className="kalori-library-dropdown-chevron" size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="kalori-library-dropdown-content"
          sideOffset={6}
          data-testid="library-filter-menu"
          aria-label={t.library.filterLabel}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => {
              // Urgent dropdown close + deferred grid re-derive.
              startTransition(() => onChange(next as LibraryFilter));
            }}
          >
            {OPTIONS.map((opt) => (
              <DropdownMenu.RadioItem
                key={opt.value}
                value={opt.value}
                className="kalori-library-dropdown-item"
                data-testid={`library-filter-option-${opt.value}`}
              >
                {t.library[opt.labelKey] as string}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default FilterDropdown;
