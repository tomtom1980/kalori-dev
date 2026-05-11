/**
 * Unit tests — Task 4.2 edit-mode validation.
 *
 * Exercises the pure validateDraft + buildFieldsPatch helpers so we can
 * reason about form state without mounting React.
 */
import { describe, expect, it } from 'vitest';

import { __internals } from '@/app/(app)/library/_components/FoodDetail/useFoodDetailEdit';
import type { LibraryItem } from '@/lib/library/fetch';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

describe('validateDraft', () => {
  it('rejects empty name', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.display_name = '';
    const errs = __internals.validateDraft(draft);
    expect(errs.display_name).toBeTruthy();
  });

  it('rejects name > 120 chars', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.display_name = 'x'.repeat(121);
    const errs = __internals.validateDraft(draft);
    expect(errs.display_name).toBeTruthy();
  });

  it('rejects negative portion', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.default_portion = '-1';
    const errs = __internals.validateDraft(draft);
    expect(errs.default_portion).toBeTruthy();
  });

  it('rejects non-integer kcal', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.kcal = '212.5';
    const errs = __internals.validateDraft(draft);
    expect(errs.kcal).toBeTruthy();
  });

  it('rejects negative macro', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.protein_g = '-0.5';
    const errs = __internals.validateDraft(draft);
    expect(errs.protein_g).toBeTruthy();
  });

  it('passes for unchanged draft', () => {
    const draft = __internals.itemToDraft(baseItem);
    const errs = __internals.validateDraft(draft);
    expect(Object.keys(errs)).toHaveLength(0);
  });
});

describe('buildFieldsPatch', () => {
  it('returns null when nothing changed', () => {
    const draft = __internals.itemToDraft(baseItem);
    expect(__internals.buildFieldsPatch(baseItem, draft)).toBeNull();
  });

  it('captures a display_name diff', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.display_name = 'Pho Ga';
    const patch = __internals.buildFieldsPatch(baseItem, draft);
    expect(patch?.display_name).toBe('Pho Ga');
  });

  it('captures a kcal diff inside nutrition', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.kcal = '520';
    const patch = __internals.buildFieldsPatch(baseItem, draft);
    expect(patch?.nutrition?.kcal).toBe(520);
  });

  it('captures a macro diff', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.protein_g = '30';
    const patch = __internals.buildFieldsPatch(baseItem, draft);
    expect(patch?.nutrition?.macros?.protein_g).toBe(30);
  });

  it('nulls portion when cleared', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.default_portion = '';
    const patch = __internals.buildFieldsPatch(baseItem, draft);
    expect(patch?.default_portion).toBeNull();
  });

  // Round 2 hardening — C2 micros survival. Supabase `.update({ nutrition })`
  // is a SHALLOW JSONB replacement: siblings not present in the patch get
  // silently nulled. The client MUST rebuild the full nutrition object
  // (kcal + all 5 macros + all existing micros) whenever any nutrition
  // field moves. This test proves that when a SINGLE macro changes, every
  // untouched macro AND every existing micro survives into the patch. If
  // `buildFieldsPatch` ever regresses to only emit the edited keys, this
  // test fails.
  it('preserves untouched macros and micros when a single macro changes', () => {
    // Note: the `LibraryItem.nutrition.macros` TS type lists
    // `protein_g, carbs_g, fat_g, fiber_g?` only, but the runtime shape
    // persisted by the update route + consumed by `useFoodDetailEdit`
    // also carries `sugar_g` (see the `sugar_g` handling in
    // `useFoodDetailEdit.ts:70 + 124`). The cast reflects the actual
    // runtime shape without a type-interface churn unrelated to this fix.
    const itemWithMicros = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: {
          protein_g: 28,
          carbs_g: 50,
          fat_g: 18,
          fiber_g: 4,
          sugar_g: 7,
        },
        micros: {
          sodium_mg: 420,
          iron_mg: 2.3,
          vitamin_c_mg: 80,
        },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemWithMicros);
    draft.protein_g = '42'; // single macro edit
    const patch = __internals.buildFieldsPatch(itemWithMicros, draft);

    // Patch MUST rewrite the FULL nutrition object so shallow JSONB
    // replacement doesn't null siblings.
    expect(patch?.nutrition).toBeDefined();

    // The edited value surfaces.
    expect(patch?.nutrition?.macros?.protein_g).toBe(42);

    // Every untouched macro survives with its original value.
    expect(patch?.nutrition?.macros?.carbs_g).toBe(50);
    expect(patch?.nutrition?.macros?.fat_g).toBe(18);
    expect(patch?.nutrition?.macros?.fiber_g).toBe(4);
    expect(patch?.nutrition?.macros?.sugar_g).toBe(7);

    // kcal carries through even though the user only edited protein.
    expect(patch?.nutrition?.kcal).toBe(500);

    // Every micro survives — including the ones the hook's draft state
    // has no dedicated field for (iron_mg, vitamin_c_mg). If the merge
    // strips micros the hook doesn't render, those rows vanish on save.
    expect(patch?.nutrition?.micros).toMatchObject({
      sodium_mg: 420,
      iron_mg: 2.3,
      vitamin_c_mg: 80,
    });
  });
});
