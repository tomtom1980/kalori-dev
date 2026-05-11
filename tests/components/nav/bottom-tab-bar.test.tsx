/**
 * <BottomTabBar /> — Mobile-only (below 768px) 56px 4-tab strip.
 *
 * Contract (briefing + ui-design.md §6.1):
 *   - Four primary destinations: DASHBOARD / LIBRARY / PROGRESS / SETTINGS
 *     (Log is the FAB, not a tab)
 *   - Each tab has data-testid="nav-{destination}"
 *   - Active tab on `/dashboard` gets aria-current="page"
 *   - Every tab is ≥ 44×44 tap target (briefing AC)
 *   - `<nav>` landmark with aria-label="Primary"
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BottomTabBar } from '@/components/nav/bottom-tab-bar';

describe('<BottomTabBar />', () => {
  it('renders four tabs (no Log tab; FAB handles logging)', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-library')).toBeInTheDocument();
    expect(screen.getByTestId('nav-progress')).toBeInTheDocument();
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-log')).toBeNull();
  });

  it('marks the active tab with aria-current="page"', () => {
    render(<BottomTabBar pathname="/library" />);
    expect(screen.getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current');
  });

  it('every tab meets the 44×44 tap-target minimum', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(Number.parseInt(tab.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(tab.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('exposes a Primary navigation landmark', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();
  });

  it('renders full-word labels (Dashboard / Library / Progress / Settings) per ui-design.md §6.4', () => {
    // Bug fix 2026-05-08-mobile-ui-overhaul #2: labels were abbreviated as
    // DASH / LIB / PROG / SET, which the user reported as "first letter or
    // half of the word". Spec calls for full words; CSS textTransform
    // 'uppercase' (line 72) handles the visual styling, so the underlying
    // DOM text content must be the full word.
    render(<BottomTabBar pathname="/dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    // Old abbreviated forms must NOT appear anywhere.
    expect(screen.queryByText('DASH')).toBeNull();
    expect(screen.queryByText('LIB')).toBeNull();
    expect(screen.queryByText('PROG')).toBeNull();
    expect(screen.queryByText('SET')).toBeNull();
  });

  it('keeps textTransform: uppercase on each tab so users see UPPERCASE rendering', () => {
    // Guards against a regression where someone removes the inline style
    // and the labels render as mixed-case "Dashboard" instead of "DASHBOARD".
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(tab.style.textTransform).toBe('uppercase');
    }
  });
});
