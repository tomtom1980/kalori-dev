'use client';

/**
 * <AddNewItemCTA /> — prominent button rendered inside the library
 * empty-state when a search returns no matches. Click seeds the AI parse
 * textarea with the current search term and swaps the AddFoodTab subview.
 */
import { Plus } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface AddNewItemCTAProps {
  searchTerm: string;
  onAddNew: (seed: string) => void;
}

export function AddNewItemCTA({ searchTerm, onAddNew }: AddNewItemCTAProps) {
  const trimmed = searchTerm.trim();
  const label = trimmed
    ? `${t.log.addNewItemCtaPrefix} "${trimmed}" ${t.log.addNewItemCtaSuffix}`
    : `${t.log.addNewItemCtaPrefix} new item`;

  return (
    <button
      type="button"
      data-testid="library-add-new-cta"
      onClick={() => onAddNew(searchTerm)}
      className="kalori-add-food-add-new-cta"
    >
      <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default AddNewItemCTA;
