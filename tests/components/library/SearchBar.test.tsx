/**
 * <SearchBar /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchBar } from '@/app/(app)/library/_components/SearchBar';

describe('<SearchBar />', () => {
  it('renders an input with type=search + role=search landmark', () => {
    render(<SearchBar value="" onChange={() => {}} resultsCount={0} />);
    const input = screen.getByTestId('library-search-input') as HTMLInputElement;
    expect(input.type).toBe('search');
    expect(screen.getByRole('search', { name: /library search/i })).toBeInTheDocument();
  });

  it('calls onChange on keystrokes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar value="" onChange={onChange} resultsCount={0} />);
    await user.type(screen.getByTestId('library-search-input'), 'p');
    expect(onChange).toHaveBeenCalledWith('p');
  });

  it('`/` shortcut focuses the input when not in another input', async () => {
    const user = userEvent.setup();
    render(<SearchBar value="" onChange={() => {}} resultsCount={0} />);
    // Ensure document.body has focus initially
    document.body.focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(screen.getByTestId('library-search-input'));
  });

  it('Escape clears the value when not empty, else blurs', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar value="banh" onChange={onChange} resultsCount={0} />);
    const input = screen.getByTestId('library-search-input') as HTMLInputElement;
    input.focus();
    await user.keyboard('{Escape}');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clear button shows only when value is non-empty', () => {
    const { rerender } = render(<SearchBar value="" onChange={() => {}} resultsCount={0} />);
    expect(screen.getByTestId('library-search-clear').getAttribute('data-visible')).toBe('false');
    rerender(<SearchBar value="x" onChange={() => {}} resultsCount={1} />);
    expect(screen.getByTestId('library-search-clear').getAttribute('data-visible')).toBe('true');
  });
});
