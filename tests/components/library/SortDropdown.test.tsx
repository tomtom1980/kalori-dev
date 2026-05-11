/**
 * <SortDropdown /> component test — Task 4.1 sub-step 3 §15.2.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortDropdown } from '@/app/(app)/library/_components/SortDropdown';

describe('<SortDropdown />', () => {
  it('renders the trigger with Sort label + MOST LOGGED default', () => {
    render(<SortDropdown value="most-logged" onChange={() => {}} />);
    const trigger = screen.getByTestId('library-sort-trigger');
    expect(trigger.textContent?.toLowerCase()).toContain('sort');
    expect(trigger.textContent?.toLowerCase()).toContain('most logged');
  });

  it('opens a menu with all 6 options', async () => {
    const user = userEvent.setup();
    render(<SortDropdown value="most-logged" onChange={() => {}} />);
    await user.click(screen.getByTestId('library-sort-trigger'));
    for (const v of [
      'most-logged',
      'last-used',
      'name-asc',
      'name-desc',
      'kcal-asc',
      'kcal-desc',
    ]) {
      expect(screen.getByTestId(`library-sort-option-${v}`)).toBeInTheDocument();
    }
  });

  it('clicking an option invokes onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SortDropdown value="most-logged" onChange={onChange} />);
    await user.click(screen.getByTestId('library-sort-trigger'));
    await user.click(screen.getByTestId('library-sort-option-name-asc'));
    expect(onChange).toHaveBeenCalledWith('name-asc');
  });
});
