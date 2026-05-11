/**
 * <ProfileMenu /> — Account menu trigger (32×32 oxblood square monogram) +
 * dropdown with Settings / Export / Sign out. Task 1.2 ships the shell;
 * actions wire up in Task 2.1.
 *
 * Tests (briefing + Codex Round 1 F4):
 *   - Renders closed by default (the dropdown is not in the DOM until opened).
 *   - Click the trigger → the menu opens (role="menu" appears).
 *   - With the menu open, pressing Escape closes it (F4: component advertises
 *     Escape handling but previously only toggled on click — missing the
 *     keyboard handler).
 *   - With the menu open, clicking outside closes it. Keeps parity with the
 *     standard dropdown contract so ShortcutsOverlay and ProfileMenu behave
 *     alike.
 *   - Snapshot proves structural stability. The aria role is `menu`
 *     (unchanged from the current impl; an upgrade to `dialog` with focus
 *     trap lands with Task 2.1's auth wiring).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProfileMenu } from '@/components/nav/profile-menu';

afterEach(() => cleanup());

describe('<ProfileMenu />', () => {
  it('renders the trigger closed by default', () => {
    render(<ProfileMenu userInitials="TS" />);
    const trigger = screen.getByTestId('profile-menu-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Menu list is NOT rendered until toggled.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click and announces via aria-expanded', () => {
    render(<ProfileMenu userInitials="TS" />);
    const trigger = screen.getByTestId('profile-menu-trigger');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: /account actions/i })).toBeInTheDocument();
    // The three stub items should be present (Settings / Export / Sign out).
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
  });

  it('closes on Escape keydown (F4)', () => {
    render(<ProfileMenu userInitials="TS" />);
    const trigger = screen.getByTestId('profile-menu-trigger');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Escape anywhere on the window closes the menu. Dispatch on the trigger
    // — the keydown bubbles up to window, matching real browser behaviour.
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on outside click', () => {
    render(
      <div>
        <ProfileMenu userInitials="TS" />
        <button type="button" data-testid="outside-target">
          Elsewhere
        </button>
      </div>,
    );
    const trigger = screen.getByTestId('profile-menu-trigger');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Click a button outside the menu.
    fireEvent.mouseDown(screen.getByTestId('outside-target'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('re-opens after close (state round-trip)', () => {
    render(<ProfileMenu userInitials="TS" />);
    const trigger = screen.getByTestId('profile-menu-trigger');

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('structural snapshot', () => {
    const { container } = render(<ProfileMenu userInitials="TS" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
