import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AddNewItemIconButton } from '@/app/(app)/log/_components/AddFoodTab/AddNewItemIconButton';

describe('<AddNewItemIconButton />', () => {
  it('renders with aria-label', () => {
    render(<AddNewItemIconButton onAddNew={() => {}} />);
    const btn = screen.getByTestId('library-add-new-icon-button');
    expect(btn.getAttribute('aria-label')).toBe('Add new food item');
  });

  it('invokes onAddNew when clicked', () => {
    const onAddNew = vi.fn();
    render(<AddNewItemIconButton onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(onAddNew).toHaveBeenCalledOnce();
  });

  it('renders the Lucide Plus icon via svg child', () => {
    render(<AddNewItemIconButton onAddNew={() => {}} />);
    const btn = screen.getByTestId('library-add-new-icon-button');
    expect(btn.querySelector('svg')).toBeTruthy();
  });
});
