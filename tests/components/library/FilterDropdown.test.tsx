/**
 * <FilterDropdown /> component test — Task 4.1 sub-step 3 §15.2.
 * Radix DropdownMenu renders into a portal — happy-dom needs us to open
 * the dropdown via interaction to see the menu items.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterDropdown } from '@/app/(app)/library/_components/FilterDropdown';

describe('<FilterDropdown />', () => {
  it('renders the trigger with Filter label + ALL default value', () => {
    render(<FilterDropdown value="all" onChange={() => {}} />);
    const trigger = screen.getByTestId('library-filter-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent?.toLowerCase()).toContain('filter');
    expect(trigger.textContent?.toLowerCase()).toContain('all');
  });

  it('opens a menu with 4 radio options on click', async () => {
    const user = userEvent.setup();
    render(<FilterDropdown value="all" onChange={() => {}} />);
    await user.click(screen.getByTestId('library-filter-trigger'));
    // Radix portals to document.body — queries still find the content.
    expect(screen.getByTestId('library-filter-option-all')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-option-with-photos')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-option-no-photos')).toBeInTheDocument();
    expect(screen.getByTestId('library-filter-option-this-week')).toBeInTheDocument();
  });

  it('clicking an option invokes onChange with the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterDropdown value="all" onChange={onChange} />);
    await user.click(screen.getByTestId('library-filter-trigger'));
    await user.click(screen.getByTestId('library-filter-option-with-photos'));
    expect(onChange).toHaveBeenCalledWith('with-photos');
  });

  it('active value is reflected in the trigger label', () => {
    render(<FilterDropdown value="with-photos" onChange={() => {}} />);
    expect(screen.getByTestId('library-filter-trigger').textContent?.toLowerCase()).toContain(
      'with photos',
    );
  });
});
