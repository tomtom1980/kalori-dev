/**
 * `useFoodDetailEdit` micro-edit round-trip tests — bugfix batch
 * library-micros-parse (2026-05-17).
 *
 * RED-first contract for the new generic per-micro draft state:
 *   - `DraftState.micros: Record<string, string>` carries arbitrary
 *     canonical micros.
 *   - `itemToDraft` seeds `draft.micros` from the saved `nutrition.micros`,
 *     canonicalizing legacy keys.
 *   - `buildFieldsPatch` diffs canonicalized drafted vs initial and emits
 *     a `nutrition.micros` partial containing the union plus the user's
 *     edits, preserving the shallow-JSONB-replace contract.
 *   - The dedicated `sodium` round-trip (LM-I2 carry-over) still
 *     canonicalizes both shapes.
 */
import { describe, expect, it } from 'vitest';

import { __internals } from '@/app/(app)/library/_components/FoodDetail/useFoodDetailEdit';
import type { LibraryItem } from '@/lib/library/fetch';

const { itemToDraft, buildFieldsPatch } = __internals;

function makeItem(microsOverrides: Record<string, number> = {}): LibraryItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    client_id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Pho Bo',
    normalized_name: 'pho bo',
    default_portion: 400,
    default_unit: 'g',
    nutrition: {
      kcal: 500,
      macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
      micros: {
        sodium: 1900,
        iron: 4.2,
        vitamin_c: 12,
        ...microsOverrides,
      },
    },
    thumbnail_url: null,
    log_count: 3,
    last_used_at: '2026-04-20T12:00:00Z',
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-04-14T22:03:00Z',
  };
}

describe('useFoodDetailEdit::DraftState.micros — bugfix library-micros-parse', () => {
  it('itemToDraft seeds DraftState.micros with stringified canonical values', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    expect(draft.micros).toBeDefined();
    expect(draft.micros!.iron).toBe('4.2');
    expect(draft.micros!.vitamin_c).toBe('12');
    expect(draft.micros!.sodium).toBe('1900');
  });

  it('itemToDraft canonicalizes legacy unit-suffixed keys', () => {
    const item = makeItem();
    // Override with a legacy-only row.
    item.nutrition.micros = {
      sodium_mg: 1200,
      iron_mg: 3,
    } as Record<string, number>;
    const draft = itemToDraft(item);
    expect(draft.micros!.sodium).toBe('1200');
    expect(draft.micros!.iron).toBe('3');
  });
});

describe('useFoodDetailEdit::buildFieldsPatch — bugfix library-micros-parse', () => {
  it('emits a nutrition.micros partial when a non-sodium micro is edited', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // User edits iron from 4.2 → 6.0.
    draft.micros = { ...draft.micros, iron: '6.0' };
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    expect(patch!.nutrition).toBeDefined();
    expect(patch!.nutrition!.micros).toBeDefined();
    // iron updated.
    expect(patch!.nutrition!.micros!.iron).toBe(6);
    // siblings preserved.
    expect(patch!.nutrition!.micros!.vitamin_c).toBe(12);
    expect(patch!.nutrition!.micros!.sodium).toBe(1900);
  });

  it('does not emit a nutrition patch when no micro is changed', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // No edits.
    const patch = buildFieldsPatch(item, draft);
    expect(patch).toBeNull();
  });

  it('preserves the LM-I2 sodium canonical/legacy dedup when sodium changes via the new micros path', () => {
    // Legacy-only row.
    const item = makeItem();
    item.nutrition.micros = {
      sodium_mg: 1200,
      iron: 3,
    } as Record<string, number>;
    const draft = itemToDraft(item);
    // User edits sodium from 1200 → 1500 via the new generic micros input.
    draft.micros = { ...draft.micros, sodium: '1500' };
    // Keep the dedicated sodium_mg DraftState string in sync (the UI
    // continues to write both for back-compat with sodium-specific paths
    // like the read-only meter). Implementation must dedup canonical wins.
    draft.sodium_mg = '1500';
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    const microsPatch = patch!.nutrition!.micros!;
    // Canonical key written with the user value. Implementation chooses
    // canonical wins for legacy-only OR drift rows (see comment in
    // buildFieldsPatch); preserves the existing legacy-only special case
    // OR converges on canonical — either is acceptable as long as exactly
    // one sodium key carries the user value.
    const sodiumValue =
      typeof microsPatch.sodium === 'number'
        ? microsPatch.sodium
        : typeof microsPatch.sodium_mg === 'number'
          ? microsPatch.sodium_mg
          : null;
    expect(sodiumValue).toBe(1500);
    // iron preserved (unchanged sibling).
    expect(microsPatch.iron).toBe(3);
    // No duplicate sodium key — at most one of {sodium, sodium_mg} can be
    // set on the patch's micros object.
    const sodiumKeyCount = ['sodium', 'sodium_mg'].filter(
      (k) => typeof microsPatch[k] === 'number',
    ).length;
    expect(sodiumKeyCount).toBeLessThanOrEqual(1);
  });

  it('emits multiple micro edits in a single patch', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '6.0', vitamin_c: '20' };
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    expect(patch!.nutrition!.micros!.iron).toBe(6);
    expect(patch!.nutrition!.micros!.vitamin_c).toBe(20);
    expect(patch!.nutrition!.micros!.sodium).toBe(1900);
  });

  it('skips invalid (non-finite / negative) micro edits', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // Invalid: negative number.
    draft.micros = { ...draft.micros, iron: '-5' };
    const patch = buildFieldsPatch(item, draft);
    // Either the patch is null (no valid edits) or iron is preserved at
    // its previous value.
    if (patch !== null) {
      expect(patch.nutrition?.micros?.iron).toBe(4.2);
    }
  });
});

// ---------------------------------------------------------------------------
// Codex R1 fixes — C1 / C2 / I1
// ---------------------------------------------------------------------------

describe('Codex R1 C1 — sugar dual-write removed', () => {
  it('editing sugar (draft.sugar_g) does NOT persist stray micros.sugar in the patch', () => {
    // Seed an item that explicitly has NO sugar key (canonical or legacy).
    const item = makeItem();
    item.nutrition.macros = {
      protein_g: 25,
      carbs_g: 50,
      fat_g: 18,
      fiber_g: 14,
    };
    item.nutrition.micros = { sodium: 1900, iron: 4.2 } as Record<string, number>;
    const draft = itemToDraft(item);
    // User edits sugar via the typed sugar_g draft field.
    draft.sugar_g = '5';
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    // The canonical macros.sugar_g must carry the user value.
    expect(patch!.nutrition!.macros.sugar_g).toBe(5);
    // The micros bag must NOT have a stray non-canonical `sugar` key.
    const microsPatch = patch!.nutrition!.micros ?? {};
    expect(microsPatch).not.toHaveProperty('sugar');
  });

  it('editing sodium (draft.sodium_mg) does NOT persist stray non-canonical micros.sodium_mg duplicate on canonical-only rows', () => {
    // Canonical-only sodium row.
    const item = makeItem();
    item.nutrition.micros = { sodium: 1900, iron: 4.2 } as Record<string, number>;
    const draft = itemToDraft(item);
    // User edits sodium via the typed sodium_mg draft field.
    draft.sodium_mg = '2000';
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    const microsPatch = patch!.nutrition!.micros ?? {};
    // Exactly ONE sodium key — canonical wins on canonical-only / drift rows.
    const sodiumKeyCount = ['sodium', 'sodium_mg'].filter(
      (k) => typeof (microsPatch as Record<string, unknown>)[k] === 'number',
    ).length;
    expect(sodiumKeyCount).toBe(1);
    expect(microsPatch.sodium).toBe(2000);
  });
});

describe('Codex R1 C2 — both-present canonical-precedence', () => {
  it('legacy-first JSONB order { iron_mg: 3, iron: 4 } → unrelated edit keeps canonical 4 (not stale legacy 3)', () => {
    const item = makeItem();
    // Critical: legacy-FIRST insertion order with both keys present.
    item.nutrition.micros = {
      iron_mg: 3,
      iron: 4,
      sodium: 1900,
    } as Record<string, number>;
    const draft = itemToDraft(item);
    // Edit an UNRELATED field (fiber) to force a nutrition patch.
    draft.fiber_g = '20';
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    const microsPatch = patch!.nutrition!.micros!;
    // Canonical `iron` must equal 4 (canonical-precedence), NOT 3 (stale legacy alias).
    expect(microsPatch.iron).toBe(4);
    // Legacy duplicate dropped — converge on canonical.
    expect(microsPatch).not.toHaveProperty('iron_mg');
  });

  it('itemToDraft seeds draft.micros.iron with canonical value 4 when both iron_mg:3 and iron:4 exist', () => {
    const item = makeItem();
    item.nutrition.micros = {
      iron_mg: 3,
      iron: 4,
    } as Record<string, number>;
    const draft = itemToDraft(item);
    // The canonical value must win in the draft seed too — the render loop
    // reads from draft.micros, so a stale legacy seed would propagate.
    expect(draft.micros!.iron).toBe('4');
  });

  it('canonical-first JSONB order { iron: 4, iron_mg: 3 } also resolves to canonical 4 (order-independent)', () => {
    const item = makeItem();
    item.nutrition.micros = {
      iron: 4,
      iron_mg: 3,
      sodium: 1900,
    } as Record<string, number>;
    const draft = itemToDraft(item);
    draft.fiber_g = '20';
    const patch = buildFieldsPatch(item, draft);
    const microsPatch = patch!.nutrition!.micros!;
    expect(microsPatch.iron).toBe(4);
    expect(microsPatch).not.toHaveProperty('iron_mg');
  });
});

describe('Codex R1 I1 — validate + clamp draft micros', () => {
  it('clamps very-large micro value to MAX_MICRO_VALUE (1e6)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '1e9' };
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    // Clamped to 1_000_000 (LM-SEC-1 mirror).
    expect(patch!.nutrition!.micros!.iron).toBe(1_000_000);
  });

  it('rejects NaN micro value (preserves prior or omits)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: 'abc' };
    const patch = buildFieldsPatch(item, draft);
    // Either null (no valid edits) or iron preserved at 4.2 — NEVER NaN.
    if (patch !== null && patch.nutrition?.micros?.iron !== undefined) {
      expect(Number.isFinite(patch.nutrition.micros.iron)).toBe(true);
      expect(patch.nutrition.micros.iron).toBe(4.2);
    }
  });

  it('rejects negative micro value', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '-5' };
    const patch = buildFieldsPatch(item, draft);
    if (patch !== null && patch.nutrition?.micros?.iron !== undefined) {
      expect(patch.nutrition.micros.iron).toBeGreaterThanOrEqual(0);
      // Should be the prior value 4.2, not a negative.
      expect(patch.nutrition.micros.iron).toBe(4.2);
    }
  });

  it('empty string clears the micro — key omitted from patch.micros', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // User clears iron.
    draft.micros = { ...draft.micros, iron: '' };
    const patch = buildFieldsPatch(item, draft);
    expect(patch).not.toBeNull();
    const microsPatch = patch!.nutrition!.micros ?? {};
    // Iron is OMITTED from the patch (was 4.2, now cleared).
    expect(microsPatch).not.toHaveProperty('iron');
    // Other micros preserved.
    expect(microsPatch.sodium).toBe(1900);
    expect(microsPatch.vitamin_c).toBe(12);
  });
});

describe('Codex R1 validateDraft — micros validation', () => {
  const { validateDraft } = __internals;

  it('surfaces a micros error for NaN input', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: 'abc' };
    const errs = validateDraft(draft);
    // The validator must flag SOMETHING about micros — either an aggregate
    // `micros` key or a per-micro `iron` key.
    const hasError =
      errs.micros !== undefined || (errs as Record<string, unknown>).iron !== undefined;
    expect(hasError).toBe(true);
  });

  it('surfaces a micros error for negative input', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '-5' };
    const errs = validateDraft(draft);
    const hasError =
      errs.micros !== undefined || (errs as Record<string, unknown>).iron !== undefined;
    expect(hasError).toBe(true);
  });

  it('does NOT flag valid micros (empty, positive, clampable)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { iron: '', vitamin_c: '15', sodium: '1900' };
    const errs = validateDraft(draft);
    expect(errs.micros).toBeUndefined();
    expect((errs as Record<string, unknown>).iron).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Codex R3 — I2-R2-1 (setMicro negative-clamp removed) + I2-R2-2 (per-key
// micros error map). Round 3 fix for the Codex R2 findings that the negative
// clamp silently bypassed validateMicroValue and that errs.micros had no
// per-field error target for a11y.
// ---------------------------------------------------------------------------

describe('Codex R3 I2-R2-1 — setMicro does NOT silently coerce negatives', () => {
  const { validateDraft } = __internals;

  it('typing a negative value preserves the raw string (does NOT clamp to 0)', () => {
    // Negative numbers reflect user typo / intent; the setter MUST keep the
    // raw string so validateDraft can surface the error and the user can
    // re-edit. Silent coercion to '0' regresses I1.
    const item = makeItem();
    const draft = itemToDraft(item);
    // Simulate the setter behaviour: the hook contract says raw negative
    // strings flow through. Assert the validator sees the raw value.
    draft.micros = { ...draft.micros, iron: '-5' };
    const errs = validateDraft(draft);
    // Surface a per-key error keyed on canonical 'iron'.
    expect(errs.micros).toBeDefined();
    expect((errs.micros as Record<string, string>).iron).toBeDefined();
    expect((errs.micros as Record<string, string>).iron).toMatch(/0 or greater|non-negative/i);
  });

  it('typing NaN ("abc") preserves the raw string and surfaces a NaN error', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: 'abc' };
    const errs = validateDraft(draft);
    expect(errs.micros).toBeDefined();
    expect((errs.micros as Record<string, string>).iron).toBeDefined();
    // NaN is distinct from negative — use the dedicated number error key.
    expect((errs.micros as Record<string, string>).iron).toMatch(/number|invalid/i);
  });

  it('typing a value above MAX_MICRO_VALUE clamps silently (no error — data-integrity bound, not user error)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // 1e9 is above MAX_MICRO_VALUE (1e6). Clamp silently — this is the
    // data-integrity defensive bound, not a user-typo class. Patch builder
    // already clamps to MAX in buildFieldsPatch via validateMicroValue's
    // `valid` branch.
    draft.micros = { ...draft.micros, iron: '1e9' };
    const errs = validateDraft(draft);
    // No micros error — the value is "valid" (clampable).
    if (errs.micros !== undefined) {
      expect((errs.micros as Record<string, string>).iron).toBeUndefined();
    }
  });

  it('typing 0 is accepted (no error)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '0' };
    const errs = validateDraft(draft);
    if (errs.micros !== undefined) {
      expect((errs.micros as Record<string, string>).iron).toBeUndefined();
    }
  });

  it('multiple invalid micros each get their own per-key error', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = {
      ...draft.micros,
      iron: '-5', // negative
      vitamin_c: 'abc', // NaN
      calcium: '15', // valid
    };
    const errs = validateDraft(draft);
    expect(errs.micros).toBeDefined();
    const microsErr = errs.micros as Record<string, string>;
    expect(microsErr.iron).toBeDefined();
    expect(microsErr.vitamin_c).toBeDefined();
    // Valid entry MUST NOT have an error key.
    expect(microsErr.calcium).toBeUndefined();
  });
});

describe('Codex R3 I2-R2-2 — errs.micros is a per-key error map', () => {
  const { validateDraft } = __internals;

  it('errs.micros is a Record<string,string> keyed by canonical micro code (not a single aggregate string)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    draft.micros = { ...draft.micros, iron: '-1' };
    const errs = validateDraft(draft);
    expect(errs.micros).toBeDefined();
    // Must be a plain object, not a string. This is the structural change
    // that lets the component pick up per-input error rendering.
    expect(typeof errs.micros).toBe('object');
    expect(errs.micros).not.toBeNull();
    const microsErr = errs.micros as Record<string, string>;
    expect(microsErr.iron).toBeTypeOf('string');
  });

  it('valid drafts return undefined for errs.micros (no empty object spam)', () => {
    const item = makeItem();
    const draft = itemToDraft(item);
    // All valid edits.
    draft.micros = { iron: '5', vitamin_c: '15' };
    const errs = validateDraft(draft);
    // Either the key is absent OR it's defined but empty — but the cleaner
    // contract is "undefined when nothing is wrong" so commit's
    // `Object.keys(validation).length > 0` keeps semantics.
    expect(errs.micros).toBeUndefined();
  });
});
