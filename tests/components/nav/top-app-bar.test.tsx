/**
 * <TopAppBar /> - 44px mobile/tablet masthead strip.
 *
 * Coverage:
 *   - Renders a <header> landmark with `data-testid="top-app-bar"`.
 *   - Shows the Kalori brand mark on the left.
 *   - Keeps the ProfileMenu trigger on the right.
 *   - Preserves the 44px app-bar height.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TopAppBar } from '@/components/nav/top-app-bar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('<TopAppBar />', () => {
  it('renders the header with Kalori brand and profile trigger', () => {
    render(<TopAppBar sectionKicker="Section" editionLine="Edition" userInitials="TS" />);

    const header = screen.getByTestId('top-app-bar');
    expect(header).toBeInTheDocument();
    expect(header.tagName).toBe('HEADER');
    expect(header.style.height).toBe('44px');

    expect(screen.getByTestId('top-app-bar-brand')).toHaveAccessibleName('Kalori');
    expect(screen.getByText('Kalori')).toBeInTheDocument();

    const trigger = screen.getByTestId('profile-menu-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('TS');
  });

  it('keeps the mobile app name stable across page-specific labels', () => {
    render(<TopAppBar sectionKicker="Library" editionLine="edition" userInitials="AB" />);

    expect(screen.getByText('Kalori')).toBeInTheDocument();
    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});
