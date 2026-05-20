import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddNewItemCTA } from '@/app/(app)/log/_components/AddFoodTab/AddNewItemCTA';

describe('<AddNewItemCTA />', () => {
  it('renders the CTA text with the search term in quotes', () => {
    render(<AddNewItemCTA searchTerm="banh xeo" onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent(
      'Add "banh xeo" as new item',
    );
  });

  it('renders generic copy when searchTerm is empty', () => {
    render(<AddNewItemCTA searchTerm="" onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent('Add new item');
  });

  it('invokes onAddNew with the search term', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemCTA searchTerm="pho" onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('pho');
  });

  it('invokes onAddNew with empty string when no search term', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemCTA searchTerm="" onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('');
  });
});
