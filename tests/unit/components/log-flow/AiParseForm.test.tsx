import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AiParseForm } from '@/app/(app)/log/_components/AddFoodTab/AiParseForm';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

beforeEach(() => {
  useLogFlowStore.setState({
    typeDraft: '',
    typeParsed: null,
    failureMode: null,
    originalInput: null,
  });
});

describe('<AiParseForm />', () => {
  it('renders the back arrow when onBack is provided', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(screen.getByTestId('ai-parse-form-back')).toBeTruthy();
  });

  it('does NOT render the back arrow when onBack is omitted (library-only mode)', () => {
    render(<AiParseForm />);
    expect(screen.queryByTestId('ai-parse-form-back')).toBeNull();
  });

  it('back arrow has aria-label "Back to library"', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(screen.getByTestId('ai-parse-form-back').getAttribute('aria-label')).toBe(
      'Back to library',
    );
  });

  it('back arrow click invokes onBack', () => {
    const onBack = vi.fn();
    render(<AiParseForm onBack={onBack} />);
    fireEvent.click(screen.getByTestId('ai-parse-form-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('preserves the existing textarea + PARSE button (sanity)', () => {
    render(<AiParseForm onBack={() => {}} />);
    expect(screen.getByTestId('type-tab-textarea')).toBeTruthy();
    expect(screen.getByTestId('type-tab-parse-button')).toBeTruthy();
  });

  it('seeds textarea from typeDraft store value', () => {
    useLogFlowStore.setState({ typeDraft: 'banh xeo' });
    render(<AiParseForm onBack={() => {}} />);
    const textarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('banh xeo');
  });
});
