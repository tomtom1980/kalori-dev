import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })),
  authPost: vi.fn(),
  SessionExpiredError: class extends Error {},
}));

// ConfirmationScreen path is not exercised here, but LogFlowTabs imports it
// eagerly. Stub useRouter so any incidental mount won't blow up (sibling
// pattern from log-flow-clears-draft-after-save.test.tsx).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  useLogFlowStore.setState({
    isOpen: true,
    activeTab: 'library',
    phase: 'entry',
    mode: 'standard',
    libraryItems: [
      {
        id: 'a',
        name: 'Pho bo',
        kcal: 450,
        lastUsedIso: null,
        logCount: 5,
        proteinG: 20,
        carbsG: 60,
        fatG: 10,
        fiberG: 2,
        unit: 'g',
        thumbnailUrl: null,
      },
    ],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
  });
});

describe('Add Food tab — back navigation', () => {
  it('back-arrow returns to library with search term preserved', () => {
    render(<LogFlowTabs />);

    // 1. User searches 'pho'.
    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'pho' },
    });
    expect(screen.getByText('Pho bo')).toBeTruthy();

    // 2. User clicks + icon → parse subview.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().activeTab).toBe('type');
    // typeDraft was NOT seeded (the + button preserves existing draft / leaves empty).
    expect(useLogFlowStore.getState().typeDraft).toBe('');

    // 3. User clicks back arrow.
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');

    // 4. Library renders with search term still 'pho' and Pho bo visible.
    expect(useLogFlowStore.getState().librarySearch).toBe('pho');
    const searchInput = screen.getByTestId('library-search-input') as HTMLInputElement;
    expect(searchInput.value).toBe('pho');
    expect(screen.getByText('Pho bo')).toBeTruthy();
  });

  it('typeDraft survives the library → parse → back → parse round trip', () => {
    useLogFlowStore.setState({ typeDraft: 'half typed' });
    render(<LogFlowTabs />);

    // Click + → parse view, draft preserved.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('half typed');

    // Back to library.
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
    expect(useLogFlowStore.getState().typeDraft).toBe('half typed');

    // Click + again → parse view, draft still preserved.
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    const textarea2 = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea2.value).toBe('half typed');
  });
});
