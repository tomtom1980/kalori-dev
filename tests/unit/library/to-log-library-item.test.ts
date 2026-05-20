/**
 * `toLogLibraryItem` — pure mapper from DB-shape `LibraryItem` (lib/library/fetch.ts)
 * onto UI-shape `LogLibraryItem` (lib/stores/useLogFlowStore.ts).
 *
 * Used by the new `GET /api/library/list` route + LibraryTab self-hydration
 * path so chrome-trigger entry points (FAB / `n` keybinding / meal-column +ADD)
 * can populate the modal without going through the `/log` page.
 */
import { describe, expect, it } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';
import { toLogLibraryItem } from '@/lib/library/to-log-library-item';

const FULL_ITEM: LibraryItem = {
  id: 'lib-1',
  client_id: 'client-1',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 350,
  default_unit: 'g',
  nutrition: {
    kcal: 520,
    macros: { protein_g: 32, carbs_g: 48, fat_g: 14, fiber_g: 3 },
    micros: { sodium_mg: 1200 },
  },
  thumbnail_url: 'https://cdn.example/pho.jpg',
  log_count: 12,
  last_used_at: '2026-04-20T12:00:00.000Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-03-01T00:00:00.000Z',
};

describe('toLogLibraryItem', () => {
  it('maps full library item to log library item shape', () => {
    const out = toLogLibraryItem(FULL_ITEM);
    expect(out).toEqual({
      id: 'lib-1',
      name: 'Pho Bo',
      kcal: 520,
      lastUsedIso: '2026-04-20T12:00:00.000Z',
      logCount: 12,
      proteinG: 32,
      carbsG: 48,
      fatG: 14,
      fiberG: 3,
      // Phase 2C — fixture lacks cholesterol_mg → mapper defaults to 0.
      cholesterolMg: 0,
      micros: { sodium_mg: 1200 },
      defaultPortion: 350,
      unit: 'g',
      thumbnailUrl: 'https://cdn.example/pho.jpg',
    });
  });

  it('preserves the saved default serving portion for log-flow hydration', () => {
    const out = toLogLibraryItem({
      ...FULL_ITEM,
      display_name: 'Fried egg',
      default_portion: 50,
      default_unit: 'g',
    });
    expect(out.defaultPortion).toBe(50);
    expect(out.unit).toBe('g');
  });

  it('omits invalid defaultPortion values so legacy rows keep quantity=1 behavior', () => {
    expect(
      toLogLibraryItem({ ...FULL_ITEM, default_portion: null }).defaultPortion,
    ).toBeUndefined();
    expect(toLogLibraryItem({ ...FULL_ITEM, default_portion: 0 }).defaultPortion).toBeUndefined();
  });

  it('flattens nutrition.macros into top-level fields', () => {
    const out = toLogLibraryItem(FULL_ITEM);
    expect(out.proteinG).toBe(32);
    expect(out.carbsG).toBe(48);
    expect(out.fatG).toBe(14);
    expect(out.fiberG).toBe(3);
  });

  it('handles null thumbnail_url and null last_used_at', () => {
    const out = toLogLibraryItem({
      ...FULL_ITEM,
      thumbnail_url: null,
      last_used_at: null,
    });
    expect(out.thumbnailUrl).toBeNull();
    expect(out.lastUsedIso).toBeNull();
  });

  it('defaults unit to "g" when default_unit is null', () => {
    const out = toLogLibraryItem({ ...FULL_ITEM, default_unit: null });
    expect(out.unit).toBe('g');
  });

  it('defaults macros to 0 when nutrition.macros is missing', () => {
    const out = toLogLibraryItem({
      ...FULL_ITEM,
      nutrition: { kcal: 100 },
    });
    expect(out.proteinG).toBe(0);
    expect(out.carbsG).toBe(0);
    expect(out.fatG).toBe(0);
    expect(out.fiberG).toBe(0);
  });

  it('defaults fiber_g to 0 when present macros lacks fiber_g', () => {
    const out = toLogLibraryItem({
      ...FULL_ITEM,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 5, carbs_g: 10, fat_g: 2 },
      },
    });
    expect(out.fiberG).toBe(0);
  });
  it('preserves AI-provided approximate grams metadata for log-flow hydration', () => {
    const out = toLogLibraryItem({
      ...FULL_ITEM,
      default_portion: 1,
      default_unit: 'bowl',
      nutrition: {
        ...FULL_ITEM.nutrition,
        approxGrams: 420,
      },
    });
    expect(out.approxGrams).toBe(420);
  });
});
