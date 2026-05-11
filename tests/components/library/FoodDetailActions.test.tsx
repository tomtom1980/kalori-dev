/**
 * <FoodDetailActions /> component test — Task 4.2.
 *
 * Covers the view ↔ edit mode CTA swap, disabled states, and the
 * delete-icon aria-label.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodDetailActions } from '@/app/(app)/library/_components/FoodDetail/FoodDetailActions';

function setup(overrides: Partial<Parameters<typeof FoodDetailActions>[0]> = {}) {
  const handlers = {
    onLogNow: vi.fn(),
    onEditStart: vi.fn(),
    onDeleteStart: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  const props = {
    editing: false,
    saving: false,
    dirty: false,
    ...handlers,
    ...overrides,
  };
  render(<FoodDetailActions {...props} />);
  return handlers;
}

describe('<FoodDetailActions />', () => {
  it('view mode renders Log / Edit / Delete', () => {
    setup();
    expect(screen.getByTestId('food-detail-log-now')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-edit-button')).toBeInTheDocument();
    const del = screen.getByTestId('food-detail-delete-button');
    expect(del).toHaveAttribute('aria-label', 'Delete this item');
  });

  it('view mode LOG THIS NOW click fires onLogNow', async () => {
    const user = userEvent.setup();
    const { onLogNow } = setup();
    await user.click(screen.getByTestId('food-detail-log-now'));
    expect(onLogNow).toHaveBeenCalledTimes(1);
  });

  it('view mode EDIT click fires onEditStart', async () => {
    const user = userEvent.setup();
    const { onEditStart } = setup();
    await user.click(screen.getByTestId('food-detail-edit-button'));
    expect(onEditStart).toHaveBeenCalledTimes(1);
  });

  it('view mode Delete click fires onDeleteStart', async () => {
    const user = userEvent.setup();
    const { onDeleteStart } = setup();
    await user.click(screen.getByTestId('food-detail-delete-button'));
    expect(onDeleteStart).toHaveBeenCalledTimes(1);
  });

  it('edit mode renders SAVE + CANCEL (no LOG / EDIT / DELETE)', () => {
    setup({ editing: true, dirty: true });
    expect(screen.getByTestId('food-detail-save-button')).toBeInTheDocument();
    expect(screen.getByTestId('food-detail-cancel-button')).toBeInTheDocument();
    expect(screen.queryByTestId('food-detail-log-now')).not.toBeInTheDocument();
    expect(screen.queryByTestId('food-detail-delete-button')).not.toBeInTheDocument();
  });

  it('edit mode SAVE is disabled when not dirty', () => {
    setup({ editing: true, dirty: false });
    expect(screen.getByTestId('food-detail-save-button')).toBeDisabled();
  });

  it('edit mode SAVE is disabled and shows SAVING… while saving', () => {
    setup({ editing: true, dirty: true, saving: true });
    const save = screen.getByTestId('food-detail-save-button');
    expect(save).toBeDisabled();
    expect(save.textContent).toMatch(/saving/i);
  });
});
