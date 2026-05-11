/**
 * <ShortcutsOverlay /> — `?` opens a 560px modal listing keyboard shortcuts;
 * Escape closes; clicking the backdrop closes; clicking inside the dialog
 * does not close (event.stopPropagation).
 *
 * Task 1.2 CI-fix coverage:
 *   - Closed by default (no dialog node in the DOM).
 *   - Pressing `?` on the window opens it, adding `role="dialog"
 *     aria-modal="true"` + labelled heading.
 *   - Escape closes it.
 *   - Clicking the backdrop closes it; clicking inside the dialog does NOT.
 *   - Pressing `?` while the focus is inside an <input>/<textarea>/<select>
 *     does NOT open the overlay (so typing a `?` in a search box stays typing).
 *   - Modifier-pressed `?` (Cmd/Ctrl/Alt + `?`) does not open (avoid stealing
 *     browser/OS shortcuts).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShortcutsOverlay } from '@/components/nav/shortcuts-overlay';

describe('<ShortcutsOverlay />', () => {
  it('is closed by default (no dialog in the DOM)', () => {
    render(<ShortcutsOverlay />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens when `?` is pressed outside a form control', () => {
    render(<ShortcutsOverlay />);
    act(() => {
      fireEvent.keyDown(window, { key: '?' });
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/keyboard shortcuts/i)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<ShortcutsOverlay />);
    act(() => {
      fireEvent.keyDown(window, { key: '?' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the backdrop is clicked but NOT when the dialog body is clicked', () => {
    render(<ShortcutsOverlay />);
    act(() => {
      fireEvent.keyDown(window, { key: '?' });
    });
    const dialog = screen.getByRole('dialog');
    // Clicking the dialog body (the inner surface) must NOT close the overlay.
    const heading = screen.getByText(/keyboard shortcuts/i);
    fireEvent.click(heading);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Clicking the backdrop itself (the dialog root) closes it.
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does NOT open when `?` is pressed inside a text input', () => {
    render(
      <div>
        <ShortcutsOverlay />
        <input data-testid="search-input" />
      </div>,
    );
    const input = screen.getByTestId('search-input');
    // Simulate the key event originating from the input element so the
    // overlay's guard (`/input|textarea|select/i.test(target.tagName)`) kicks
    // in — this preserves natural typing in search boxes.
    act(() => {
      fireEvent.keyDown(input, { key: '?' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does NOT open when a modifier key is held with `?`', () => {
    render(<ShortcutsOverlay />);
    act(() => {
      fireEvent.keyDown(window, { key: '?', ctrlKey: true });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: '?', metaKey: true });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: '?', altKey: true });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
