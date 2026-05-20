import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const PARSED_RESULT = {
  items: [
    {
      name: 'Banh xeo',
      portion: 1,
      unit: 'plate',
      kcal: 480,
      macros: { protein_g: 15, carbs_g: 50, fat_g: 22, fiber_g: 4 },
      micros: {},
      confidence: 0.85,
    },
  ],
  reasoning: null,
};

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })),
  authPost: vi.fn(() => Promise.resolve({ result: PARSED_RESULT })),
  SessionExpiredError: class extends Error {},
}));

// ConfirmationScreen calls useRouter().refresh() after save lifecycle.
// In happy-dom there is no app-router context, so stub it the same way
// `log-flow-clears-draft-after-save.test.tsx` does.
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
        logCount: 1,
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
    confirmationPayload: null,
  });
});

describe('Add Food tab — full flow', () => {
  it('happy path: search-miss → CTA → parse pre-filled → ConfirmationScreen', async () => {
    render(<LogFlowTabs />);

    // 1. Library renders with one item.
    expect(screen.getByTestId('library-list')).toBeTruthy();
    expect(screen.getByText('Pho bo')).toBeTruthy();

    // 2. User types 'banh xeo' — no match.
    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'banh xeo' },
    });
    expect(screen.getByTestId('library-empty-state')).toHaveTextContent(
      'Nothing matches that search yet.',
    );

    // 3. User clicks the CTA — seeds typeDraft + swaps subview.
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(useLogFlowStore.getState().typeDraft).toBe('banh xeo');
    expect(useLogFlowStore.getState().activeTab).toBe('type');

    // 4. AiParseForm renders with pre-filled textarea.
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('banh xeo');

    // 5. User submits PARSE.
    await act(async () => {
      fireEvent.submit(screen.getByTestId('type-tab-form'));
    });

    // 6. ConfirmationScreen takes over.
    await waitFor(() => {
      expect(useLogFlowStore.getState().phase).toBe('confirmation');
    });
    expect(useLogFlowStore.getState().confirmationPayload?.tab).toBe('type');
    expect(useLogFlowStore.getState().confirmationPayload?.items[0]?.name).toBe('Banh xeo');
  });
});
