/**
 * Phase 2C — <FoodDetailMacros /> cholesterol_mg row.
 *
 * Read-mode: a 5th macro row shows `<n> mg` for cholesterol when the
 * library item carries `nutrition.macros.cholesterol_mg`. Hidden when
 * the value is absent (legacy rows).
 *
 * Edit-mode: a `text` input with `inputMode="decimal"` accepts numeric
 * input; the consumer's `onDraftChange` fires with the typed value.
 *
 * Unit is `mg` (NOT `g`).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodDetailMacros } from '@/app/(app)/library/_components/FoodDetail/FoodDetailMacros';
import type { LibraryItem } from '@/lib/library/fetch';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Beef Liver',
  normalized_name: 'beef liver',
  default_portion: 100,
  default_unit: 'g',
  nutrition: {
    kcal: 135,
    macros: {
      protein_g: 20.4,
      carbs_g: 3.9,
      fat_g: 3.6,
      fiber_g: 0,
      cholesterol_mg: 396,
    },
    micros: { sodium_mg: 70 },
  },
  thumbnail_url: null,
  log_count: 0,
  last_used_at: null,
  user_edited_flag: false,
  created_from: 'manual',
  created_at: '2026-05-16T00:00:00.000Z',
};

const baseDraft = {
  display_name: 'Beef Liver',
  default_portion: '100',
  default_unit: 'g',
  kcal: '135',
  protein_g: '20.4',
  carbs_g: '3.9',
  fat_g: '3.6',
  fiber_g: '0',
  cholesterol_mg: '396',
  sugar_g: '',
  sodium_mg: '70',
};

describe('<FoodDetailMacros /> — Phase 2C cholesterol_mg', () => {
  it('renders a cholesterol row inside the macros block with mg unit suffix', () => {
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const macros = screen.getByTestId('food-detail-macros');
    const cholesterolRow = within(macros).getByTestId('food-detail-macro-cholesterol_mg');
    expect(cholesterolRow).toBeInTheDocument();
    expect(cholesterolRow.textContent ?? '').toMatch(/396/);
    expect(cholesterolRow.textContent ?? '').toMatch(/mg/);
  });

  it('omits the cholesterol row when value is missing from macros (legacy row)', () => {
    const legacy = {
      ...baseItem,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 1 },
      },
    } as LibraryItem;
    render(
      <FoodDetailMacros
        item={legacy}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const macros = screen.getByTestId('food-detail-macros');
    expect(within(macros).queryByTestId('food-detail-macro-cholesterol_mg')).toBeNull();
  });

  it('edit mode: renders a cholesterol input that accepts numeric value', async () => {
    const onDraftChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={baseItem}
        editing
        draft={{ ...baseDraft, cholesterol_mg: '' }}
        errors={{}}
        onDraftChange={onDraftChange}
      />,
    );
    const input = screen.getByTestId('food-detail-edit-cholesterol_mg-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    await user.type(input, '186');
    expect(onDraftChange).toHaveBeenCalledWith('cholesterol_mg', '1');
    expect(onDraftChange).toHaveBeenCalledWith('cholesterol_mg', '8');
    expect(onDraftChange).toHaveBeenCalledWith('cholesterol_mg', '6');
  });

  it('edit mode: surfaces field error from props', () => {
    render(
      <FoodDetailMacros
        item={baseItem}
        editing
        draft={{ ...baseDraft, cholesterol_mg: '-1' }}
        errors={{ cholesterol_mg: 'Must be 0 or greater.' }}
        onDraftChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId('food-detail-edit-cholesterol_mg-input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
