/**
 * Merge default-selection heuristic — Task 4.1 sub-step 3 §15.1.
 */
import { describe, expect, it } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';
import { pickDefaults } from '@/lib/library/merge-default';

function item(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: 'id',
    client_id: 'c',
    display_name: 'Item',
    normalized_name: 'item',
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 10, fat_g: 5 } },
    thumbnail_url: null,
    log_count: 0,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('pickDefaults', () => {
  it('picks A when A has higher log_count', () => {
    const out = pickDefaults(item({ log_count: 10 }), item({ log_count: 2 }));
    expect(out.display_name).toBe('a');
    expect(out.kcal).toBe('a');
    expect(out.default_portion).toBe('a');
  });

  it('picks B when B has higher log_count', () => {
    const out = pickDefaults(item({ log_count: 1 }), item({ log_count: 9 }));
    expect(out.display_name).toBe('b');
    expect(out.kcal).toBe('b');
  });

  it('tie-breaks on older created_at when log_counts equal', () => {
    const older = item({ log_count: 5, created_at: '2026-01-01T00:00:00Z' });
    const newer = item({ log_count: 5, created_at: '2026-03-15T00:00:00Z' });
    expect(pickDefaults(older, newer).display_name).toBe('a');
    expect(pickDefaults(newer, older).display_name).toBe('b');
  });

  it('thumbnail exception: photo-present side wins for thumbnail_url only', () => {
    const a = item({ log_count: 1, thumbnail_url: null });
    const b = item({ log_count: 10, thumbnail_url: 'key/b.webp' });
    const out = pickDefaults(a, b);
    expect(out.display_name).toBe('b'); // heuristic winner
    expect(out.thumbnail_url).toBe('b');
  });

  it('thumbnail exception fires when the photo is on the log-count loser', () => {
    const a = item({ log_count: 10, thumbnail_url: null });
    const b = item({ log_count: 1, thumbnail_url: 'key/b.webp' });
    const out = pickDefaults(a, b);
    expect(out.display_name).toBe('a'); // heuristic winner
    expect(out.thumbnail_url).toBe('b'); // photo override
  });

  it('custom numeric fields start null', () => {
    const out = pickDefaults(item({ log_count: 5 }), item({ log_count: 1 }));
    expect(out.kcal_custom).toBeNull();
    expect(out.protein_custom).toBeNull();
    expect(out.portion_custom).toBeNull();
  });
});
