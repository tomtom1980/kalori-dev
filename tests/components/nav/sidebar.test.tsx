/**
 * <Sidebar /> — Desktop (1280+) persistent primary nav (240px wide).
 *
 * Contract (briefing + ui-design.md §6.2):
 *   - Four primary destinations: DASHBOARD / LIBRARY / PROGRESS / SETTINGS
 *     (Log is modal-launched from FAB, not a sidebar row — ui-design.md §6.1)
 *   - `<nav>` landmark with aria-label
 *   - Each item has data-testid="nav-{destination}" and the 4-tab labels
 *   - Active item on `/dashboard` gets aria-current="page"
 *   - SIGN OUT link is persistently visible (not hover-gated — §6.2 auditor fix)
 *   - Every nav row is at least 44×44 tap target
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sidebar } from '@/components/nav/sidebar';

describe('<Sidebar />', () => {
  it('renders a <nav> landmark with primary destinations', () => {
    render(<Sidebar pathname="/dashboard" />);
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();

    // Four primary destinations per ui-design.md §6.1.
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-library')).toBeInTheDocument();
    expect(screen.getByTestId('nav-progress')).toBeInTheDocument();
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument();
  });

  it('marks the active route with aria-current="page"', () => {
    render(<Sidebar pathname="/dashboard" />);
    const dashboardLink = screen.getByTestId('nav-dashboard');
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-library')).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent route for sub-paths', () => {
    render(<Sidebar pathname="/library/pho-bo" />);
    expect(screen.getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');
  });

  it('renders a persistently-visible Sign Out action', () => {
    render(<Sidebar pathname="/dashboard" />);
    const signOut = screen.getByRole('button', { name: /sign out/i });
    expect(signOut).toBeInTheDocument();
    expect(signOut).toBeVisible();
  });

  it('every nav item is at least 44px tall (AA tap-target)', () => {
    render(<Sidebar pathname="/dashboard" />);
    const items = ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings'];
    for (const id of items) {
      const link = screen.getByTestId(id);
      // Each row uses `min-height: 44px` via inline style for predictable
      // assertion in happy-dom (where getComputedStyle is unreliable for Tailwind).
      expect(link.style.minHeight).toBe('56px');
    }
  });
});
