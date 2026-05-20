/**
 * Pure client-side filter + sort helpers — Task 4.1 sub-step 3.
 *
 * Called inside LibraryClient's `useMemo(() => applySort(applyFilter(items,
 * filter, searchQuery, now), sort), [items, filter, sort, searchQuery, now])`.
 * Keeping these pure + module-exported allows `tests/unit/library-filter-sort`
 * to run a table-driven permutation matrix without rendering the grid.
 *
 * Search matches `display_name` + `normalized_name` with case-insensitive
 * substring. Empty query returns all items. Trimmed + lowercased on the
 * caller side — these helpers receive the already-normalized query.
 */
import type { LibraryItem } from './fetch';
import type { LibraryFilter, LibrarySort } from './types';
import { normalizeName } from '@/lib/text/normalize';

/**
 * Filter a library item list by `filter` + search substring.
 * `nowMs` is passed in so tests can freeze the clock; `this-week` counts any
 * item whose `last_used_at` falls within the last 7 days ending at `nowMs`.
 */
export function applyFilter(
  items: readonly LibraryItem[],
  filter: LibraryFilter,
  normalizedQuery: string,
  nowMs: number,
): LibraryItem[] {
  const weekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    if (normalizedQuery) {
      const hay = `${normalizeName(item.display_name)} ${item.normalized_name.toLowerCase()}`;
      if (!hay.includes(normalizedQuery)) return false;
    }

    switch (filter) {
      case 'all':
        return true;
      case 'with-photos':
        return Boolean(item.thumbnail_url);
      case 'no-photos':
        return !item.thumbnail_url;
      case 'this-week': {
        if (!item.last_used_at) return false;
        const t = Date.parse(item.last_used_at);
        if (Number.isNaN(t)) return false;
        return t >= weekAgoMs && t <= nowMs;
      }
      default:
        return true;
    }
  });
}

/**
 * Sort a library item list. Returns a NEW array (non-mutating). Tie-breakers
 * fall back to `display_name` ascending so the output is deterministic across
 * runs.
 */
export function applySort(items: readonly LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const out = items.slice();
  switch (sort) {
    case 'most-logged':
      out.sort((a, b) => b.log_count - a.log_count || a.display_name.localeCompare(b.display_name));
      break;
    case 'last-used':
      out.sort((a, b) => {
        const at = a.last_used_at ? Date.parse(a.last_used_at) : 0;
        const bt = b.last_used_at ? Date.parse(b.last_used_at) : 0;
        return bt - at || a.display_name.localeCompare(b.display_name);
      });
      break;
    case 'name-asc':
      out.sort((a, b) => a.display_name.localeCompare(b.display_name));
      break;
    case 'name-desc':
      out.sort((a, b) => b.display_name.localeCompare(a.display_name));
      break;
    case 'kcal-asc':
      out.sort(
        (a, b) =>
          (a.nutrition?.kcal ?? 0) - (b.nutrition?.kcal ?? 0) ||
          a.display_name.localeCompare(b.display_name),
      );
      break;
    case 'kcal-desc':
      out.sort(
        (a, b) =>
          (b.nutrition?.kcal ?? 0) - (a.nutrition?.kcal ?? 0) ||
          a.display_name.localeCompare(b.display_name),
      );
      break;
  }
  return out;
}
