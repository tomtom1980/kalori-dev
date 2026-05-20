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

  it('rejects decimal portions for whole-style edit units', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.default_unit = 'cup';
    draft.default_portion = '1.5';
    const errs = __internals.validateDraft(draft);
    expect(errs.default_portion).toBeTruthy();
  });

  it('allows decimal portions for grams and milliliters in edit mode', () => {
    const draft = __internals.itemToDraft(baseItem);
    draft.default_unit = 'g';
    draft.default_portion = '87.5';
    expect(__internals.validateDraft(draft).default_portion).toBeUndefined();

    draft.default_unit = 'ml';
    draft.default_portion = '240.5';
    expect(__internals.validateDraft(draft).default_portion).toBeUndefined();
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
    // has no dedicated field for. If the merge strips micros the hook
    // doesn't render, those rows vanish on save.
    //
    // Bugfix batch followups Codex R1-C1 (2026-05-17) — legacy preservation
    // is UNIVERSAL across all canonical/legacy micro pairs, not just
    // sodium. The earlier "legacy_mg → canonical migration on unrelated
    // edits" behavior silently mutated the row's committed shape for
    // EVERY micro (iron_mg, vitamin_c_mg, …). Now, legacy-only rows keep
    // their legacy shape whenever the user didn't explicitly edit that
    // micro. Drift (both keys present) still resolves to canonical — see
    // the dedicated dedup describe block below.
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toMatchObject({
      sodium_mg: 420,
      iron_mg: 2.3,
      vitamin_c_mg: 80,
    });
    // All legacy-only shapes preserved; no canonical migration on
    // unrelated edits.
    expect(microsPatch).not.toHaveProperty('sodium');
    expect(microsPatch).not.toHaveProperty('iron');
    expect(microsPatch).not.toHaveProperty('vitamin_c');
  });
});

/**
 * Bugfix batch followups LM-I2 — canonical/legacy sodium dedup as a merge
 * INVARIANT, not a sodiumChanged-gated branch.
 *
 * Root cause: prior code dedup'd `sodium` vs `sodium_mg` only inside the
 * `if (sodiumChanged && ...)` branch. A drifted row carrying BOTH keys
 * with no sodium edit (just protein/kcal/etc.) spread both into the
 * patch, double-counting in `aggregateMicros` since both keys
 * canonicalize to the same display key.
 *
 * Fix: dedup runs unconditionally after the merge spread. R1-C1 shape
 * policy is preserved — legacy-only rows stay legacy (no aggressive
 * migration). Only the DRIFT case (both keys present) resolves to
 * canonical.
 */
describe('buildFieldsPatch — canonical/legacy sodium dedup', () => {
  it('drift + unrelated edit emits only canonical sodium (regression)', () => {
    const itemWithDrift = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: {
          sodium: 500,
          sodium_mg: 999,
          iron_mg: 2.3,
        },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemWithDrift);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemWithDrift, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('sodium', 500);
    expect(microsPatch).not.toHaveProperty('sodium_mg');
    // Unrelated micro survives. Codex R1-C1 universal preservation — iron
    // came in as legacy-only (`iron_mg`) and the user didn't touch it,
    // so it keeps the legacy shape. (Sodium is the drift case so it
    // converges on canonical regardless.)
    expect(microsPatch).toHaveProperty('iron_mg', 2.3);
    expect(microsPatch).not.toHaveProperty('iron');
  });

  it('drift + sodium edit: canonical wins, legacy deleted (R1-C1 happy path)', () => {
    const itemWithDrift = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: {
          sodium: 500,
          sodium_mg: 999,
        },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemWithDrift);
    draft.sodium_mg = '750'; // user edits sodium
    const patch = __internals.buildFieldsPatch(itemWithDrift, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('sodium', 750);
    expect(microsPatch).not.toHaveProperty('sodium_mg');
  });

  it('clean canonical input + unrelated edit: unchanged', () => {
    const itemCanonicalOnly = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { sodium: 500 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemCanonicalOnly);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemCanonicalOnly, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('sodium', 500);
    expect(microsPatch).not.toHaveProperty('sodium_mg');
  });

  it('clean legacy input + unrelated edit: legacy preserved (R1-C1 shape policy)', () => {
    const itemLegacyOnly = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { sodium_mg: 500 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemLegacyOnly);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemLegacyOnly, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('sodium_mg', 500);
    expect(microsPatch).not.toHaveProperty('sodium');
  });
});

/**
 * Bugfix batch followups Codex R1-C1 (2026-05-17) — extend the legacy-
 * shape preservation policy from sodium-only to ALL canonical/legacy
 * micro pairs.
 *
 * Pre-batch (07273a3) behavior: legacy keys (`iron_mg`, `vitamin_c_mg`,
 * …) all round-tripped verbatim. Bug 2's commit `e8af134` introduced
 * aggressive canonical migration for unrelated edits. LM-I2 (`42126c0`)
 * carved out sodium as an exception but left the other 29 canonical/
 * legacy pairs silently mutating the row's committed shape on every
 * unrelated nutrition edit. R1-C1 restores symmetry.
 *
 * Drift case (both keys present, no user edit) still resolves to
 * canonical for every micro — this only protects rows that committed
 * with the legacy shape and don't have a sibling canonical value.
 */
describe('buildFieldsPatch — universal legacy-shape preservation (Codex R1-C1)', () => {
  it('legacy-only iron_mg + unrelated macro edit: legacy shape preserved', () => {
    const itemLegacyIron = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { iron_mg: 3 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemLegacyIron);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemLegacyIron, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('iron_mg', 3);
    expect(microsPatch).not.toHaveProperty('iron');
  });

  it('legacy-only vitamin_c_mg + unrelated edit: legacy shape preserved', () => {
    const itemLegacyVitC = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { vitamin_c_mg: 50 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemLegacyVitC);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemLegacyVitC, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('vitamin_c_mg', 50);
    expect(microsPatch).not.toHaveProperty('vitamin_c');
  });

  it('drift iron_mg + iron + unrelated edit: canonical wins, legacy deleted', () => {
    const itemDriftIron = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { iron_mg: 3, iron: 5 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemDriftIron);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemDriftIron, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('iron', 5);
    expect(microsPatch).not.toHaveProperty('iron_mg');
  });

  it('mixed legacy-only micros (iron_mg, vitamin_c_mg, vitamin_a_mcg) + unrelated edit: all preserved', () => {
    const itemMixed = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: {
          iron_mg: 3,
          vitamin_c_mg: 50,
          vitamin_a_mcg: 700,
        },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemMixed);
    draft.protein_g = '42'; // unrelated edit
    const patch = __internals.buildFieldsPatch(itemMixed, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('iron_mg', 3);
    expect(microsPatch).toHaveProperty('vitamin_c_mg', 50);
    expect(microsPatch).toHaveProperty('vitamin_a_mcg', 700);
    expect(microsPatch).not.toHaveProperty('iron');
    expect(microsPatch).not.toHaveProperty('vitamin_c');
    expect(microsPatch).not.toHaveProperty('vitamin_a');
  });

  it('legacy iron_mg + user edits iron via generic micros bag: canonical wins, legacy deleted', () => {
    // `itemToDraft` -> `buildMicrosDraftBag` collapses `iron_mg` onto
    // canonical `iron`, so when the user types into the generic micros
    // input the draft carries the edit at `draft.micros.iron`. That
    // explicit edit must override the legacy-shape preservation rule.
    const itemLegacyIron = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { iron_mg: 3 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemLegacyIron);
    // Simulate the generic micros input edit.
    draft.micros = { ...(draft.micros ?? {}), iron: '7' };
    const patch = __internals.buildFieldsPatch(itemLegacyIron, draft);

    expect(patch?.nutrition?.micros).toBeDefined();
    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('iron', 7);
    expect(microsPatch).not.toHaveProperty('iron_mg');
  });

  it('regression: sodium_mg legacy preservation still works (LM-I2)', () => {
    // Re-asserts the LM-I2 sodium policy from the dedicated sodium
    // describe block, executed through the universal preservation
    // pathway so a future refactor that drops sodium handling regresses
    // here too.
    const itemLegacySodium = {
      ...baseItem,
      nutrition: {
        kcal: 500,
        macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
        micros: { sodium_mg: 420 },
      },
    } as unknown as LibraryItem;

    const draft = __internals.itemToDraft(itemLegacySodium);
    draft.protein_g = '42';
    const patch = __internals.buildFieldsPatch(itemLegacySodium, draft);

    const microsPatch = patch?.nutrition?.micros ?? {};
    expect(microsPatch).toHaveProperty('sodium_mg', 420);
    expect(microsPatch).not.toHaveProperty('sodium');
  });
});
