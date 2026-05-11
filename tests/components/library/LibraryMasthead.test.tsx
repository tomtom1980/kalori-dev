/**
 * <LibraryMasthead /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LibraryMasthead } from '@/app/(app)/library/_components/LibraryMasthead';

describe('<LibraryMasthead />', () => {
  it('renders the kicker and serif title', () => {
    render(<LibraryMasthead />);
    expect(screen.getByTestId('library-masthead')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /library/i })).toBeInTheDocument();
  });
});
