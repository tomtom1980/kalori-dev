'use client';

/**
 * <AddFoodTab /> — unified entry surface for adding food, replacing the
 * previous separate Type + Library tabs. Hosts two subviews via the
 * existing `activeTab` field in `useLogFlowStore`:
 *
 *   - activeTab === 'library' → <LibraryList /> (default on modal open)
 *   - activeTab === 'type'    → <AiParseForm onBack={...} />
 *
 * The two subviews share `typeDraft` and `librarySearch` from the store,
 * so navigating back-and-forth preserves both. Scroll position is NOT
 * preserved (acceptable trade-off per design spec §11 #3).
 *
 * Entry points to the parse subview:
 *   1. '+' icon button beside library search → setActiveTab('type'),
 *      typeDraft preserved.
 *   2. Empty-state CTA when search returns no matches → setActiveTab('type')
 *      AND setTypeDraft(searchTerm).
 *
 * Library-only mode (library page's Add Item button) does NOT render
 * AddFoodTab — LogFlowTabs short-circuits to <AiParseForm> directly
 * (without onBack) when mode === 'library-only'.
 */
import type { ParseResultT } from '@/lib/ai/schemas';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

import { AiParseForm } from './AiParseForm';
import { LibraryList } from './LibraryList';
import type { ManualSubmitPayload } from '../ManualEntryFallback';

export interface AddFoodTabProps {
  onParseSuccess?: (result: ParseResultT) => void;
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
}

export function AddFoodTab({ onParseSuccess, onManualSubmit }: AddFoodTabProps = {}) {
  const activeTab = useLogFlowStore((s) => s.activeTab);
  const setActiveTab = useLogFlowStore((s) => s.setActiveTab);
  const setTypeDraft = useLogFlowStore((s) => s.setTypeDraft);

  const goToParseView = (seed: string): void => {
    if (seed) setTypeDraft(seed);
    setActiveTab('type');
  };

  const goBackToLibrary = (): void => {
    setActiveTab('library');
  };

  if (activeTab === 'type') {
    return (
      <AiParseForm
        {...(onParseSuccess ? { onParseSuccess } : {})}
        {...(onManualSubmit ? { onManualSubmit } : {})}
        onBack={goBackToLibrary}
      />
    );
  }

  return <LibraryList onAddNew={goToParseView} />;
}

export default AddFoodTab;
