/**
 * <MergeField /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MergeField } from '@/app/(app)/library/_components/MergeField';

describe('<MergeField />', () => {
  it('renders A/B radio options with a legend', () => {
    render(
      <MergeField
        legend="Name"
        name="display_name"
        valueA="Banh Mi"
        valueB="Banh Mì"
        choice="a"
        onChoice={() => {}}
      />,
    );
    expect(screen.getByText(/§ Name/)).toBeInTheDocument();
    expect(screen.getByTestId('library-merge-display_name-a')).toBeInTheDocument();
    expect(screen.getByTestId('library-merge-display_name-b')).toBeInTheDocument();
  });

  it('clicking Option B fires onChoice(b)', async () => {
    const onChoice = vi.fn();
    const user = userEvent.setup();
    render(
      <MergeField
        legend="Kcal"
        name="kcal"
        valueA="500"
        valueB="520"
        choice="a"
        onChoice={onChoice}
      />,
    );
    await user.click(screen.getByTestId('library-merge-kcal-b'));
    expect(onChoice).toHaveBeenCalledWith('b');
  });

  it('allowCustom=true renders the custom numeric input', () => {
    render(
      <MergeField
        legend="Kcal"
        name="kcal"
        valueA="500"
        valueB="520"
        choice="a"
        onChoice={() => {}}
        allowCustom
        customValue={null}
        onCustomChange={() => {}}
      />,
    );
    expect(screen.getByTestId('library-merge-kcal-custom-input')).toBeInTheDocument();
  });

  it('typing in custom input fires onCustomChange with a number', async () => {
    const onCustomChange = vi.fn();
    const user = userEvent.setup();
    // Since the input is controlled on `customValue` + we don't rerender,
    // each keystroke dispatches onChange against the current (null→raw=key)
    // value. Assert the LAST call parses as a finite number (single char '5').
    render(
      <MergeField
        legend="Kcal"
        name="kcal"
        valueA="500"
        valueB="520"
        choice="custom"
        onChoice={() => {}}
        allowCustom
        customValue={null}
        onCustomChange={onCustomChange}
      />,
    );
    await user.type(screen.getByTestId('library-merge-kcal-custom-input'), '5');
    expect(onCustomChange).toHaveBeenLastCalledWith(5);
  });
});
