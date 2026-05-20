/**
 * Codex R1 F2 regression test — Phase 2C cholesterol absence handling.
 *
 * Bug: `buildFieldsPatch` on a legacy library row (no `cholesterol_mg`
 * key in DB) would, after any unrelated nutrition edit, materialise a
 * literal `cholesterol_mg: 0` in the JSONB replacement. That converts
 * "unknown cholesterol" into "verified 0 mg" silently.
 *
 * Fix: thread an `absent` discriminant through `resolveMacro` and omit
 * the key from `fields.nutrition.macros` when the original row did not
 * carry it AND the user did not type a value.
 */
import { describe, expect, it } from 'vitest';

import { __internals } from '@/app/(app)/library/_components/FoodDetail/useFoodDetailEdit';
import type { LibraryItem } from '@/lib/library/fetch';

const legacyItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    // Pre-cholesterol row — no cholesterol_mg key.
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

describe('buildFieldsPatch — Codex R1 F2: cholesterol absence vs zero', () => {
  it('preserves cholesterol absence when user edits an unrelated field', () => {
    const draft = __internals.itemToDraft(legacyItem);
    // User bumps protein only. Cholesterol input stays empty (legacy seed = '').
    draft.protein_g = '32';
    const patch = __internals.buildFieldsPatch(legacyItem, draft);
    expect(patch).not.toBeNull();
    expect(patch?.nutrition).toBeDefined();
    const macros = patch?.nutrition?.macros as Record<string, number | undefined>;
    expect(macros.protein_g).toBe(32);
    // Critical assertion — the absent key must stay absent.
    expect('cholesterol_mg' in macros).toBe(false);
  });

  it('persists cholesterol_mg when the user explicitly types a value on a legacy row', () => {
    const draft = __internals.itemToDraft(legacyItem);
    draft.cholesterol_mg = '120';
    const patch = __internals.buildFieldsPatch(legacyItem, draft);
    expect(patch).not.toBeNull();
    const macros = patch?.nutrition?.macros as Record<string, number | undefined>;
    expect(macros.cholesterol_mg).toBe(120);
  });

  it('preserves cholesterol_mg=0 when the row already had cholesterol_mg=0', () => {
    const aware: LibraryItem = {
      ...legacyItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18, cholesterol_mg: 0 },
      },
    };
    const draft = __internals.itemToDraft(aware);
    draft.protein_g = '30';
    const patch = __internals.buildFieldsPatch(aware, draft);
    expect(patch).not.toBeNull();
    const macros = patch?.nutrition?.macros as Record<string, number | undefined>;
    expect(macros.cholesterol_mg).toBe(0);
  });

  it('passes through a cholesterol value unchanged when present in the row', () => {
    const aware: LibraryItem = {
      ...legacyItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18, cholesterol_mg: 75 },
      },
    };
    const draft = __internals.itemToDraft(aware);
    draft.protein_g = '30';
    const patch = __internals.buildFieldsPatch(aware, draft);
    const macros = patch?.nutrition?.macros as Record<string, number | undefined>;
    expect(macros.cholesterol_mg).toBe(75);
  });
});
