/**
 * Table-driven filter + sort unit tests — Task 4.1 sub-step 3 §15.1.
 * Covers the full matrix of filter × sort × seed-data shape.
 */
import { describe, expect, it } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';
import { applyFilter, applySort } from '@/lib/library/filter-sort';

const NOW_MS = Date.parse('2026-04-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function makeItem(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: overrides.id ?? 'x',
    client_id: overrides.client_id ?? 'client-x',
    display_name: overrides.display_name ?? 'Item',
    normalized_name: overrides.normalized_name ?? 'item',
    default_portion: overrides.default_portion ?? 1,
    default_unit: overrides.default_unit ?? 'piece',
    nutrition: overrides.nutrition ?? {
      kcal: 100,
      macros: { protein_g: 10, carbs_g: 10, fat_g: 5 },
    },
    thumbnail_url: overrides.thumbnail_url ?? null,
    log_count: overrides.log_count ?? 1,
    last_used_at: overrides.last_used_at ?? null,
    user_edited_flag: overrides.user_edited_flag ?? false,
    created_from: overrides.created_from ?? 'text',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  };
}

const ITEMS: LibraryItem[] = [
  makeItem({
    id: 'a',
    display_name: 'Apple',
    normalized_name: 'apple',
    log_count: 1,
    thumbnail_url: 'x',
    last_used_at: new Date(NOW_MS - 1 * DAY).toISOString(),
    nutrition: { kcal: 95, macros: { protein_g: 1, carbs_g: 25, fat_g: 0 } },
  }),
  makeItem({
    id: 'b',
    display_name: 'Banh Mi',
    normalized_name: 'banh mi',
    log_count: 5,
    thumbnail_url: null,
    last_used_at: new Date(NOW_MS - 10 * DAY).toISOString(),
    nutrition: { kcal: 450, macros: { protein_g: 18, carbs_g: 60, fat_g: 12 } },
  }),
  makeItem({
    id: 'c',
    display_name: 'Cucumber',
    normalized_name: 'cucumber',
    log_count: 3,
    thumbnail_url: 'y',
    last_used_at: new Date(NOW_MS - 2 * DAY).toISOString(),
    nutrition: { kcal: 15, macros: { protein_g: 1, carbs_g: 4, fat_g: 0 } },
  }),
];

describe('applyFilter', () => {
  it('filter=all + no query returns every item', () => {
    expect(applyFilter(ITEMS, 'all', '', NOW_MS)).toHaveLength(3);
  });

  it('filter=with-photos returns only items with thumbnail_url', () => {
    const out = applyFilter(ITEMS, 'with-photos', '', NOW_MS);
    expect(out.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('filter=no-photos returns only items with null thumbnail_url', () => {
    const out = applyFilter(ITEMS, 'no-photos', '', NOW_MS);
    expect(out.map((i) => i.id)).toEqual(['b']);
  });

  it('filter=this-week returns items used within the last 7 days', () => {
    const out = applyFilter(ITEMS, 'this-week', '', NOW_MS);
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('search substring filters display + normalized names (case-insensitive)', () => {
    expect(applyFilter(ITEMS, 'all', 'banh', NOW_MS).map((i) => i.id)).toEqual(['b']);
    expect(applyFilter(ITEMS, 'all', 'cu', NOW_MS).map((i) => i.id)).toEqual(['c']);
  });

  it('search combines with filter', () => {
    const out = applyFilter(ITEMS, 'with-photos', 'apple', NOW_MS);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });
});

describe('applySort', () => {
  it('most-logged orders by log_count desc', () => {
    const out = applySort(ITEMS, 'most-logged');
    expect(out.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('last-used orders by last_used_at desc', () => {
    const out = applySort(ITEMS, 'last-used');
    expect(out.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('name-asc orders alphabetically', () => {
    const out = applySort(ITEMS, 'name-asc');
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('name-desc reverses alphabetic order', () => {
    const out = applySort(ITEMS, 'name-desc');
    expect(out.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('kcal-asc orders by nutrition.kcal ascending', () => {
    const out = applySort(ITEMS, 'kcal-asc');
    expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('kcal-desc orders by nutrition.kcal descending', () => {
    const out = applySort(ITEMS, 'kcal-desc');
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('is non-mutating', () => {
    const before = ITEMS.map((i) => i.id).join(',');
    applySort(ITEMS, 'name-desc');
    const after = ITEMS.map((i) => i.id).join(',');
    expect(after).toBe(before);
  });
});
