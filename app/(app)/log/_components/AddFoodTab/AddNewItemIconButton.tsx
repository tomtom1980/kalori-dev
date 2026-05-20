'use client';

/**
 * <AddNewItemIconButton /> — subtle 32×32 ghost icon button rendered to
 * the right of the library search input. Click swaps the AddFoodTab
 * subview to AI parse (calls `onAddNew` with no seed text).
 */
import { Plus } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface AddNewItemIconButtonProps {
  onAddNew: () => void;
}

export function AddNewItemIconButton({ onAddNew }: AddNewItemIconButtonProps) {
  return (
    <button
      type="button"
      data-testid="library-add-new-icon-button"
      aria-label={t.log.addNewItemAriaLabel}
      onClick={onAddNew}
      className="kalori-add-food-add-new-icon"
    >
      <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

export default AddNewItemIconButton;
