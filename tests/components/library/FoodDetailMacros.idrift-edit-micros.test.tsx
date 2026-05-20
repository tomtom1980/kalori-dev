/**
 * `<FoodDetailMacros editing={true} />` — POST-2026-05-17-library-micros-parse
 * characterization tests for the edit-mode micros collapsible.
 *
 * INTENT REVISION (2026-05-17 — bugfix batch `library-micros-parse`):
 *
 * The prior "POST-MVP-CODEX-R2-IDRIFT" rule asserted: "saved > 0 → only
 * sugar + sodium are editable; everything else is invisible." That rule
 * shipped a UX dead-end for AI-parsed library items, which routinely carry
 * 5-20 non-zero canonical micros that the user could not see or edit in the
 * detail surface.
 *
 * The new rule (this batch):
 *
 *   1. The trigger is the only thing visible until the user expands it
 *      (default-closed Radix Collapsible — visual contract preserved).
 *   2. On expand, EVERY persisted non-zero micro renders an input,
 *      regardless of whether it's sugar / sodium / iron / vitamin_c /
 *      any of the other 25 canonical codes.
 *   3. Sugar + Sodium ALWAYS render an input (their dedicated UX role as
 *      "known-domain micros" is preserved — users may want to add them
 *      post-hoc on items the AI didn't tag).
 *   4. If NOTHING is in the persisted micros bag AND sugar/sodium are both
 *      zero, the expanded panel renders the explanatory empty hint (kept
 *      from the old design as a graceful fallback — should rarely fire for
 *      AI-parsed items).
 *
 * This characterizes the new contract so a future refactor that
 * accidentally re-introduces the "saved > 0 sugar+sodium only" gate fails
 * here loudly. The trigger + collapsed-default assertions stay verbatim
 * (visual contract preserved).
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
    micros: { sodium: 800 },
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
  sodium_mg: '800',
  micros: { sodium: '800' },
};

function renderEditing(
  overrides: Partial<LibraryItem> = {},
  draftOverrides: Partial<DraftState> = {},
) {
  const item = { ...baseItem, ...overrides };
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

describe('<FoodDetailMacros editing /> — library edit-mode renders all persisted micros (post-2026-05-17-library-micros-parse)', () => {
  it('renders the expand trigger in edit mode (instead of inputs inlined directly)', () => {
    renderEditing();
    expect(screen.getByTestId('food-detail-edit-micros-trigger')).toBeInTheDocument();
  });

  it('default-collapsed: inputs are NOT visible to the user before expand', () => {
    renderEditing();
    const trigger = screen.getByTestId('food-detail-edit-micros-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('expanding reveals sugar + sodium inputs (always-editable known-domain micros)', async () => {
    const user = userEvent.setup();
    renderEditing({
      nutrition: {
        kcal: 500,
        macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14, sugar_g: 5 } as {
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g?: number;
          cholesterol_mg?: number;
        },
        micros: { sodium: 800 },
      },
    });
    const trigger = screen.getByTestId('food-detail-edit-micros-trigger');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('food-detail-edit-micro-sugar-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
  });

  it('expanding reveals an input for every persisted non-zero canonical micro', async () => {
    const user = userEvent.setup();
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: { sodium: 1900, iron: 4.2, vitamin_c: 12, calcium: 200 },
        },
      },
      {
        sodium_mg: '1900',
        micros: { sodium: '1900', iron: '4.2', vitamin_c: '12', calcium: '200' },
      },
    );
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-iron-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-vitamin_c-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-calcium-input')).toBeInTheDocument();
  });

  it('always renders sugar + sodium inputs even when both are zero (post-hoc add affordance)', async () => {
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
    expect(screen.getByTestId('food-detail-edit-micro-sugar-input')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
  });

  it('trigger stays mounted even when nothing-to-show — user always has feedback they CAN expand', () => {
    renderEditing(
      {
        nutrition: {
          kcal: 500,
          macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
          micros: {},
        },
      },
      { sodium_mg: '', micros: {} },
    );
    expect(screen.getByTestId('food-detail-edit-micros-trigger')).toBeInTheDocument();
  });

  it('micros block container is rendered with the expected test id (regression guard)', () => {
    renderEditing();
    const microsBlock = screen.getByTestId('food-detail-micros');
    expect(within(microsBlock).getByTestId('food-detail-edit-micros-trigger')).toBeInTheDocument();
  });
});
