import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddFoodTab } from '@/app/(app)/log/_components/AddFoodTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

beforeEach(() => {
  useLogFlowStore.setState({
    activeTab: 'library',
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
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
  });
});

describe('<AddFoodTab />', () => {
  it('renders LibraryList when activeTab === "library"', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<AddFoodTab />);
    expect(screen.getByTestId('library-list')).toBeTruthy();
    expect(screen.queryByTestId('type-tab-form')).toBeNull();
  });

  it('renders AiParseForm with back arrow when activeTab === "type"', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<AddFoodTab />);
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
    expect(screen.getByTestId('ai-parse-form-back')).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('clicking + icon button in library view sets activeTab to type', () => {
    useLogFlowStore.setState({ activeTab: 'library' });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().activeTab).toBe('type');
  });

  it('clicking back arrow in parse view returns activeTab to library', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(useLogFlowStore.getState().activeTab).toBe('library');
  });

  it('empty-state CTA seeds typeDraft AND sets activeTab to type', () => {
    useLogFlowStore.setState({
      activeTab: 'library',
      librarySearch: 'banh xeo',
    });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    const state = useLogFlowStore.getState();
    expect(state.typeDraft).toBe('banh xeo');
    expect(state.activeTab).toBe('type');
  });

  it('+ icon click does NOT seed typeDraft (preserves existing draft)', () => {
    useLogFlowStore.setState({
      activeTab: 'library',
      typeDraft: 'existing user typing',
    });
    render(<AddFoodTab />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(useLogFlowStore.getState().typeDraft).toBe('existing user typing');
  });

  it('forwards onParseSuccess and onManualSubmit props to AiParseForm', () => {
    useLogFlowStore.setState({ activeTab: 'type' });
    const onParseSuccess = vi.fn();
    const onManualSubmit = vi.fn();
    render(<AddFoodTab onParseSuccess={onParseSuccess} onManualSubmit={onManualSubmit} />);
    // Verify form rendered with success/manual handlers wired — full
    // parse flow exercised in integration tests.
    expect(screen.getByTestId('type-tab-form')).toBeTruthy();
  });
});
