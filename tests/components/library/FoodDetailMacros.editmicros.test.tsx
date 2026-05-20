/**
 * `<FoodDetailMacros editing /> — bugfix batch library-micros-parse (2026-05-17).
 *
 * RED-first contract tests for the NEW edit-mode micros render rule:
 * every persisted non-zero micro renders an input, plus sugar + sodium
 * always render (preserves the prior "known-domain micro" affordance).
 *
 * Replaces the "saved > 0 → sugar+sodium only" rule characterized in
 * `FoodDetailMacros.idrift-edit-micros.test.tsx`. The IDRIFT test is
 * rewritten in the same batch to characterize the new design.
 *
 * Predecessor batch overlap:
 *   - LM-I1: canonicalizeMicroKey routing handles display-name keys
 *     (`"Sodium"`) and legacy unit-suffixed keys (`sodium_mg`) so a
 *     library row with mixed-shape micros renders correctly.
 *   - LM-I2: incidentally closed by routing every micro setter through
 *     the same canonical-key dedup path.
 *   - LM-SEC-1: defensive numeric upper bound (MAX_MICRO = 1e6) enforced
 *     by `setMicro` mirrors the EDIT_ITEM_MICRO clamp pattern. Without
 *     a bound, a user could paste 1e20 and overflow the Number → JSON
 *     round-trip.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodDetailMacros } from '@/app/(app)/library/_components/FoodDetail/FoodDetailMacros';
import type { LibraryItem } from '@/lib/library/fetch';
import type { DraftState } from '@/app/(app)/library/_components/FoodDetail/useFoodDetailEdit';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
    // Five non-zero canonical micros covering mg + mcg + canonical-vs-legacy
    // shapes the AI parse path actually emits after the Phase 2 fix.
    micros: {
      sodium: 1900,
      iron: 4.2,
      vitamin_c: 15,
      vitamin_b12: 1.8,
      calcium: 200,
    },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

const baseDraft: DraftState = {
  display_name: 'Pho Bo',
  default_portion: '400',
  default_unit: 'g',
  kcal: '500',
  protein_g: '25',
  carbs_g: '50',
  fat_g: '18',
  fiber_g: '14',
  cholesterol_mg: '',
  sugar_g: '',
  sodium_mg: '1900',
  // NEW per-micro draft bag. Seeded with the persisted non-zero entries
  // plus always-editable sugar + sodium keys.
  micros: {
    sodium: '1900',
    iron: '4.2',
    vitamin_c: '15',
    vitamin_b12: '1.8',
    calcium: '200',
  },
};

function renderEditing(
  itemOverrides: Partial<LibraryItem> = {},
  draftOverrides: Partial<DraftState> = {},
) {
  const item = { ...baseItem, ...itemOverrides };
  const draft = { ...baseDraft, ...draftOverrides };
  return render(
    <FoodDetailMacros
      item={item}
      editing={true}
      draft={draft}
      errors={{}}
      onDraftChange={vi.fn()}
    />,
  );
}

describe('<FoodDetailMacros editing /> — bugfix library-micros-parse (2026-05-17)', () => {
  it('renders an input for every persisted non-zero micro plus sugar + sodium', async () => {
    const user = userEvent.setup();
    renderEditing();
    const trigger = screen.getByTestId('food-detail-edit-micros-trigger');
    await user.click(trigger);

    // Sodium + sugar (always editable).
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-sugar-input')).toBeInTheDocument();

    // Every non-zero canonical micro from the persisted bag.
    expect(screen.getByTestId('food-detail-edit-micro-iron-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-vitamin_c-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-vitamin_b12-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-calcium-input')).toBeInTheDocument();
  });

  it('every rendered micro input has a label associated via htmlFor', async () => {
    const user = userEvent.setup();
    renderEditing();
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));

    // Iron, vitamin_c — both should have a label[htmlFor=<input.id>].
    const ironInput = screen.getByTestId('food-detail-edit-micro-iron-input');
    expect(ironInput.id).toBeTruthy();
    const ironLabel = document.querySelector(`label[for="${ironInput.id}"]`);
    expect(ironLabel).not.toBeNull();
    expect(ironLabel?.textContent).toMatch(/iron/i);

    const vitCInput = screen.getByTestId('food-detail-edit-micro-vitamin_c-input');
    const vitCLabel = document.querySelector(`label[for="${vitCInput.id}"]`);
    expect(vitCLabel).not.toBeNull();
    expect(vitCLabel?.textContent).toMatch(/vitamin c/i);
  });

  it('canonicalizes legacy unit-suffixed keys (sodium_mg) when rendering', async () => {
    const user = userEvent.setup();
    // Legacy-only row: only sodium_mg key, no canonical sodium key.
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: { sodium_mg: 1200, iron_mg: 3 },
        },
      },
      {
        micros: {
          sodium: '1200',
          iron: '3',
        },
      },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    // Should still render sodium + iron inputs (canonical testids), even
    // though source keys were legacy-suffixed. This closes LM-I1
    // incidentally — the canonicalization happens in the render loop.
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-iron-input')).toBeInTheDocument();
  });

  it('default-collapsed: micro inputs are not interactive before expand', () => {
    renderEditing();
    const trigger = screen.getByTestId('food-detail-edit-micros-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('editing a non-sodium micro calls onMicroChange with the canonical key', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onMicroChange = vi.fn();
    const item = { ...baseItem };
    render(
      <FoodDetailMacros
        item={item}
        editing={true}
        draft={baseDraft}
        errors={{}}
        onDraftChange={onDraftChange}
        onMicroChange={onMicroChange}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const ironInput = screen.getByTestId('food-detail-edit-micro-iron-input');
    await user.clear(ironInput);
    await user.type(ironInput, '6');
    // Iron edits go through the generic onMicroChange path keyed by the
    // canonical micro code, NOT onDraftChange (which is reserved for the
    // typed top-level DraftState fields).
    expect(onMicroChange).toHaveBeenCalled();
    const calls = onMicroChange.mock.calls;
    expect(calls.some((c) => c[0] === 'iron')).toBe(true);
  });

  it('sugar input renders even when persisted sugar is zero (always-editable)', async () => {
    const user = userEvent.setup();
    renderEditing({
      nutrition: {
        kcal: 500,
        // sugar absent → treated as 0; but always-editable per design.
        macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
        micros: { sodium: 1900 },
      },
    });
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    expect(screen.getByTestId('food-detail-edit-micro-sugar-input')).toBeInTheDocument();
  });

  it('sodium input renders even when persisted sodium is zero (always-editable)', async () => {
    const user = userEvent.setup();
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: {},
        },
      },
      {
        sodium_mg: '',
        micros: {},
      },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
  });

  it('micros block container still rendered with food-detail-micros testid (regression guard)', () => {
    renderEditing();
    const microsBlock = screen.getByTestId('food-detail-micros');
    expect(within(microsBlock).getByTestId('food-detail-edit-micros-trigger')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Codex R1 C1 + I2 — UI render-rule fixes
// ---------------------------------------------------------------------------

describe('<FoodDetailMacros editing /> — Codex R1 C1 sugar dual-write removal', () => {
  it('sugar input is bound to draft.sugar_g, NOT draft.micros.sugar', async () => {
    const user = userEvent.setup();
    // Sugar value comes ONLY from draft.sugar_g; micros bag has NO sugar key.
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14, sugar_g: 7 } as {
            protein_g: number;
            carbs_g: number;
            fat_g: number;
            fiber_g?: number;
            cholesterol_mg?: number;
          },
          micros: { sodium: 1900 },
        },
      },
      { sugar_g: '7', micros: { sodium: '1900' } },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const sugarInput = screen.getByTestId('food-detail-edit-micro-sugar-input') as HTMLInputElement;
    expect(sugarInput.value).toBe('7');
  });

  it('typing sugar does NOT call onMicroChange (no stray micros.sugar write)', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onMicroChange = vi.fn();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        errors={{}}
        onDraftChange={onDraftChange}
        onMicroChange={onMicroChange}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const sugarInput = screen.getByTestId('food-detail-edit-micro-sugar-input');
    await user.clear(sugarInput);
    await user.type(sugarInput, '5');
    // Sugar edit must flow through onDraftChange('sugar_g', ...) ONLY.
    const sugarDraftChangeCalls = onDraftChange.mock.calls.filter((c) => c[0] === 'sugar_g');
    expect(sugarDraftChangeCalls.length).toBeGreaterThan(0);
    // NO call to onMicroChange with key 'sugar' (stray non-canonical key).
    const sugarMicroChangeCalls = onMicroChange.mock.calls.filter((c) => c[0] === 'sugar');
    expect(sugarMicroChangeCalls.length).toBe(0);
  });

  it('typing sodium does NOT call onMicroChange — single-write through onDraftChange(sodium_mg, ...)', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onMicroChange = vi.fn();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        errors={{}}
        onDraftChange={onDraftChange}
        onMicroChange={onMicroChange}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const sodiumInput = screen.getByTestId('food-detail-edit-micro-sodium-input');
    await user.clear(sodiumInput);
    await user.type(sodiumInput, '2');
    // Sodium edit MUST flow ONLY through onDraftChange('sodium_mg', ...).
    const sodiumDraftChangeCalls = onDraftChange.mock.calls.filter((c) => c[0] === 'sodium_mg');
    expect(sodiumDraftChangeCalls.length).toBeGreaterThan(0);
    // NO duplicate onMicroChange('sodium', ...) call.
    const sodiumMicroChangeCalls = onMicroChange.mock.calls.filter((c) => c[0] === 'sodium');
    expect(sodiumMicroChangeCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Codex R3 I2-R2-2 — micro inputs render aria-invalid + inline error message
// keyed off the per-key errs.micros map. Mirrors the existing
// FoodDetailName error-pattern (id'd <p role="alert"> + aria-describedby).
// ---------------------------------------------------------------------------

describe('<FoodDetailMacros editing /> — Codex R3 I2-R2-2 a11y for micros validation errors', () => {
  it('renders aria-invalid="true" on the micro input when errs.micros has that key', async () => {
    const user = userEvent.setup();
    const onMicroChange = vi.fn();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        errors={{ micros: { iron: 'Must be 0 or greater.' } }}
        onDraftChange={vi.fn()}
        onMicroChange={onMicroChange}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const ironInput = screen.getByTestId('food-detail-edit-micro-iron-input');
    expect(ironInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders a <p role="alert"> error message below the errored micro input', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        errors={{ micros: { iron: 'Must be 0 or greater.' } }}
        onDraftChange={vi.fn()}
        onMicroChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const errMsg = screen.getByTestId('food-detail-edit-micro-iron-error');
    expect(errMsg).toBeInTheDocument();
    expect(errMsg.textContent).toMatch(/0 or greater/i);
    expect(errMsg.getAttribute('role')).toBe('alert');
  });

  it('errored micro input is linked to the error message via aria-describedby', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        errors={{ micros: { iron: 'Must be 0 or greater.' } }}
        onDraftChange={vi.fn()}
        onMicroChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const ironInput = screen.getByTestId('food-detail-edit-micro-iron-input');
    const describedBy = ironInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errMsg = screen.getByTestId('food-detail-edit-micro-iron-error');
    expect(errMsg.id).toBe(describedBy);
  });

  it('non-errored micro input does NOT render aria-invalid="true" or an error', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={true}
        draft={baseDraft}
        // Only `iron` has an error — vitamin_c should render clean.
        errors={{ micros: { iron: 'Must be 0 or greater.' } }}
        onDraftChange={vi.fn()}
        onMicroChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    const vitCInput = screen.getByTestId('food-detail-edit-micro-vitamin_c-input');
    // aria-invalid must not be 'true'. Accepts absent (undefined) OR 'false'.
    const ariaInvalid = vitCInput.getAttribute('aria-invalid');
    expect(ariaInvalid === null || ariaInvalid === 'false').toBe(true);
    // No error message rendered for vitamin_c.
    expect(screen.queryByTestId('food-detail-edit-micro-vitamin_c-error')).toBeNull();
  });

  it('clean draft (no errs.micros) renders all micro inputs without error decorations', async () => {
    const user = userEvent.setup();
    renderEditing();
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    // No error messages.
    expect(screen.queryByTestId('food-detail-edit-micro-iron-error')).toBeNull();
    expect(screen.queryByTestId('food-detail-edit-micro-vitamin_c-error')).toBeNull();
    // No aria-invalid='true' on the inputs.
    expect(
      screen.getByTestId('food-detail-edit-micro-iron-input').getAttribute('aria-invalid'),
    ).not.toBe('true');
  });
});

describe('<FoodDetailMacros editing /> — Codex R1 I2 zero-row filter', () => {
  it('zero-filled persisted micros do NOT render input rows (saved 0 stays hidden)', async () => {
    const user = userEvent.setup();
    // Saved bag has explicit zeros for iron + vitamin_c, only sodium is non-zero.
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: { iron: 0, vitamin_c: 0, sodium: 120 } as Record<string, number>,
        },
      },
      {
        sodium_mg: '120',
        micros: { iron: '0', vitamin_c: '0', sodium: '120' },
      },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    // Sugar + sodium ALWAYS render.
    expect(screen.getByTestId('food-detail-edit-micro-sugar-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
    // Zero-value canonical micros MUST NOT render an input.
    expect(screen.queryByTestId('food-detail-edit-micro-iron-input')).toBeNull();
    expect(screen.queryByTestId('food-detail-edit-micro-vitamin_c-input')).toBeNull();
  });

  it('non-zero persisted micro renders (regression guard for the I2 filter)', async () => {
    const user = userEvent.setup();
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: { iron: 4.2, vitamin_c: 0, sodium: 120 } as Record<string, number>,
        },
      },
      {
        sodium_mg: '120',
        micros: { iron: '4.2', sodium: '120' },
      },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    // Iron is non-zero → renders.
    expect(screen.getByTestId('food-detail-edit-micro-iron-input')).toBeInTheDocument();
    // Vitamin_c is zero → does NOT render.
    expect(screen.queryByTestId('food-detail-edit-micro-vitamin_c-input')).toBeNull();
  });
});
