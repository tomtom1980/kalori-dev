/**
 * Phase 2C — cholesterol_mg surfaces through `toLogLibraryItem`.
 *
 * The mapper feeds the log-flow store (`LogLibraryItem`) so a re-log of
 * a library item with cholesterol carries the value into the
 * ConfirmationScreen pre-fill. Missing values (legacy rows) default to 0.
 */
import { describe, expect, it } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';
import { toLogLibraryItem } from '@/lib/library/to-log-library-item';

const BASE: LibraryItem = {
  id: 'lib-1',
  client_id: 'client-1',
  display_name: 'Egg',
  normalized_name: 'egg',
  default_portion: 1,
  default_unit: 'piece',
  nutrition: {
    kcal: 78,
    macros: { protein_g: 6, carbs_g: 0.6, fat_g: 5, fiber_g: 0, cholesterol_mg: 186 },
    micros: {},
  },
  thumbnail_url: null,
  log_count: 0,
  last_used_at: null,
  user_edited_flag: false,
  created_from: 'manual',
  created_at: '2026-05-16T00:00:00.000Z',
};

describe('toLogLibraryItem — Phase 2C cholesterol_mg', () => {
  it('forwards cholesterol_mg from nutrition.macros into cholesterolMg', () => {
    const out = toLogLibraryItem(BASE);
    expect(out.cholesterolMg).toBe(186);
  });

  it('defaults cholesterolMg to 0 when macros omits cholesterol_mg (legacy row)', () => {
    const legacy: LibraryItem = {
      ...BASE,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 1 },
      },
    };
    const out = toLogLibraryItem(legacy);
    expect(out.cholesterolMg).toBe(0);
  });

  it('defaults cholesterolMg to 0 when nutrition.macros is missing entirely', () => {
    const sparse: LibraryItem = {
      ...BASE,
      nutrition: { kcal: 100 },
    };
    const out = toLogLibraryItem(sparse);
    expect(out.cholesterolMg).toBe(0);
  });
});
