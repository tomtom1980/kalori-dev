'use client';

/**
 * `<SearchBar />` — Task 4.1 sub-step 3 §7.5.
 *
 * Controlled search input with IME-safe `/` shortcut focus (mirrors
 * `LibraryTab.tsx` L84–95) and Escape-clears behavior. Deferred value
 * derivation happens in the PARENT (`<LibraryClient>`) via
 * `useDeferredValue(rawQuery)` per §18.3 deviation — we don't debounce
 * locally. Reconciled spec §14.1 #2 landmark: the `<form>` wrapper carries
 * `role="search"` + `aria-label`.
 */
import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { t } from '@/lib/i18n/en';

export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  /** Results-count number for the off-screen aria-live status. */
  resultsCount: number;
}

export function SearchBar({ value, onChange, resultsCount }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  // `/` shortcut focus — IME-safe per log-flow LibraryTab pattern.
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== '/') return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      ev.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Escape') {
      if (value) {
        onChange('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <form
      role="search"
      aria-label={t.library.searchLabel}
      className="kalori-library-search"
      data-testid="library-search-form"
      onSubmit={(ev) => ev.preventDefault()}
    >
      <label htmlFor="library-search-input" className="sr-only">
        {t.library.searchLabel}
      </label>
      <Search className="kalori-library-search-icon" size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        id="library-search-input"
        type="search"
        value={value}
        placeholder={t.library.searchPlaceholder}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby={statusId}
        data-testid="library-search-input"
        className="kalori-library-search-input"
      />
      <button
        type="button"
        onClick={() => {
          onChange('');
          inputRef.current?.focus();
        }}
        data-visible={value ? 'true' : 'false'}
        aria-label={t.library.searchClearLabel}
        data-testid="library-search-clear"
        className="kalori-library-search-clear"
      >
        <X size={14} aria-hidden="true" />
      </button>
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {value
          ? t.library.searchResults.replace('{N}', String(resultsCount)).replace('{query}', value)
          : ''}
      </div>
    </form>
  );
}

export default SearchBar;
