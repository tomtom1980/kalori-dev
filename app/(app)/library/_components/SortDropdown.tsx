'use client';

/**
 * `<SortDropdown />` — Task 4.1 sub-step 3 §7.7.
 *
 * Same Radix `DropdownMenu.RadioGroup` pattern as FilterDropdown. Sort
 * options: MOST LOGGED / LAST USED / NAME A-Z / NAME Z-A / KCAL LOW-HIGH /
 * KCAL HIGH-LOW.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { startTransition } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibrarySort } from '@/lib/library/types';

export interface SortDropdownProps {
  value: LibrarySort;
  onChange: (next: LibrarySort) => void;
}

const OPTIONS: ReadonlyArray<{ value: LibrarySort; labelKey: keyof typeof t.library }> = [
  { value: 'most-logged', labelKey: 'sortMostLogged' },
  { value: 'last-used', labelKey: 'sortLastUsed' },
  { value: 'name-asc', labelKey: 'sortNameAsc' },
  { value: 'name-desc', labelKey: 'sortNameDesc' },
  { value: 'kcal-asc', labelKey: 'sortKcalAsc' },
  { value: 'kcal-desc', labelKey: 'sortKcalDesc' },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const activeLabel =
    (t.library[OPTIONS.find((o) => o.value === value)?.labelKey ?? 'sortMostLogged'] as string) ??
    String(t.library.sortMostLogged);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="kalori-library-dropdown-trigger"
          data-testid="library-sort-trigger"
        >
          <span className="kalori-library-dropdown-trigger-label">{t.library.sortLabel}</span>
          <span className="kalori-library-dropdown-trigger-value">{activeLabel}</span>
          <ChevronDown className="kalori-library-dropdown-chevron" size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="kalori-library-dropdown-content"
          sideOffset={6}
          data-testid="library-sort-menu"
          aria-label={t.library.sortLabel}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => {
              startTransition(() => onChange(next as LibrarySort));
            }}
          >
            {OPTIONS.map((opt) => (
              <DropdownMenu.RadioItem
                key={opt.value}
                value={opt.value}
                className="kalori-library-dropdown-item"
                data-testid={`library-sort-option-${opt.value}`}
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

export default SortDropdown;
