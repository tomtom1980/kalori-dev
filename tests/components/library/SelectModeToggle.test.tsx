/**
 * <SelectModeToggle /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectModeToggle } from '@/app/(app)/library/_components/SelectModeToggle';

describe('<SelectModeToggle />', () => {
  it('renders SELECT label when inactive with aria-pressed=false', () => {
    render(<SelectModeToggle active={false} onToggle={() => {}} />);
    const btn = screen.getByTestId('library-select-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.textContent).toMatch(/select/i);
  });

  it('renders CANCEL label when active with aria-pressed=true', () => {
    render(<SelectModeToggle active onToggle={() => {}} />);
    const btn = screen.getByTestId('library-select-toggle');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.textContent).toMatch(/cancel/i);
  });

  it('fires onToggle on click', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<SelectModeToggle active={false} onToggle={onToggle} />);
    await user.click(screen.getByTestId('library-select-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
