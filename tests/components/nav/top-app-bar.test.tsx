/**
 * <TopAppBar /> — 44px mobile/tablet masthead strip.
 *
 * Task 1.2 CI-fix coverage:
 *   - Renders a <header> landmark with `data-testid="top-app-bar"`.
 *   - Section kicker on the left (e.g. "§ 01 · Dashboard").
 *   - Edition line in the middle (stub — aria-hidden, decorative).
 *   - ProfileMenu trigger on the right (profile avatar).
 *   - 44px height (inline style — meets tap-target floor for the profile
 *     button which lives inside).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TopAppBar } from '@/components/nav/top-app-bar';

describe('<TopAppBar />', () => {
  it('renders the header with kicker, edition, and profile trigger', () => {
    render(
      <TopAppBar sectionKicker="§ 01 · Dashboard" editionLine="No. 142 · Thu" userInitials="TS" />,
    );

    const header = screen.getByTestId('top-app-bar');
    expect(header).toBeInTheDocument();
    expect(header.tagName).toBe('HEADER');
    expect(header.style.height).toBe('44px');

    expect(screen.getByText('§ 01 · Dashboard')).toBeInTheDocument();
    expect(screen.getByText('No. 142 · Thu')).toBeInTheDocument();

    const trigger = screen.getByTestId('profile-menu-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('TS');
  });

  it('accepts a different section kicker label', () => {
    render(<TopAppBar sectionKicker="§ 02 · Library" editionLine="edition" userInitials="AB" />);
    expect(screen.getByText('§ 02 · Library')).toBeInTheDocument();
    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});
