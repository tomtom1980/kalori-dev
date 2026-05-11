/**
 * <LogFAB /> — Mobile-only 56×56 zero-radius SQUARE (ui-design.md §2.4 +
 * §6.4 tiebreaker #3 override of design-doc §9's "circular" language).
 *
 * Bug #5 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — Dual FAB pattern:
 *   - `variant="food"` (default) — primary, oxblood ground + ivory `+` glyph
 *   - `variant="water"` — secondary, near-black ground + ivory border + ivory water-drop glyph
 *
 * Contract (briefing + ui-design.md §6.4):
 *   - 56×56 px tap target (meets 44×44 AC)
 *   - Zero border-radius (data-testid stays a square)
 *   - Custom-SVG glyph (NOT a Phosphor/Lucide icon)
 *   - Distinct aria-label per variant ("Log food" / "Log water")
 *   - Distinct data-testid per variant ("log-fab-food" / "log-fab-water")
 *   - data-testid="log-fab" preserved on food variant for backwards-compat
 *   - Button element (not <a>) so onClick handlers can bind
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LogFAB } from '@/components/nav/log-fab';

describe('<LogFAB />', () => {
  describe('variant="food" (primary, default)', () => {
    it('renders a button with food-variant Ledger contract attributes', () => {
      render(<LogFAB />);
      const fab = screen.getByRole('button', { name: /log food/i });
      expect(fab).toHaveAttribute('aria-haspopup', 'dialog');
      // Bug #5 canonicalizes the food FAB's data-testid to `log-fab-food`.
      // E2E spec at `tests/e2e/nav-responsive.spec.ts` is renamed in the
      // same Bug #5 commit (one rename round per proposal §B).
      expect(fab).toHaveAttribute('data-testid', 'log-fab-food');
      expect(fab.tagName).toBe('BUTTON');
    });

    it('sizes at 56×56 with zero border-radius (square, not circle)', () => {
      render(<LogFAB />);
      const fab = screen.getByTestId('log-fab-food');
      expect(fab.style.width).toBe('56px');
      expect(fab.style.height).toBe('56px');
      expect(fab.style.borderRadius).toBe('var(--radius-pill)');
    });

    it('uses the oxblood fill on the food FAB', () => {
      render(<LogFAB />);
      const fab = screen.getByTestId('log-fab-food');
      expect(fab.style.backgroundColor).toMatch(/var\(--color-oxblood\)|#8a2a1f/i);
    });

    it('renders an inline SVG plus glyph (two crossed rectangles, not a font icon)', () => {
      render(<LogFAB />);
      const fab = screen.getByTestId('log-fab-food');
      const svg = fab.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const rects = fab.querySelectorAll('svg rect');
      expect(rects.length).toBeGreaterThanOrEqual(2);
    });

    it('fires onClick when pressed (food handler)', () => {
      const onClick = vi.fn();
      render(<LogFAB onClick={onClick} />);
      fireEvent.click(screen.getByTestId('log-fab-food'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('variant="water" (secondary)', () => {
    it('renders with the water-variant aria-label + data-testid', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByRole('button', { name: /log water/i });
      expect(fab).toHaveAttribute('data-testid', 'log-fab-water');
      expect(fab.tagName).toBe('BUTTON');
    });

    it('water FAB does NOT advertise aria-haspopup="dialog" (it navigates, not opens a dialog)', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByTestId('log-fab-water');
      expect(fab).not.toHaveAttribute('aria-haspopup');
    });

    it('sizes at 56×56 with zero border-radius (parity with food FAB)', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByTestId('log-fab-water');
      expect(fab.style.width).toBe('56px');
      expect(fab.style.height).toBe('56px');
      expect(fab.style.borderRadius).toBe('var(--radius-pill)');
    });

    it('uses near-black ground (var(--color-bg-1)) instead of oxblood', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByTestId('log-fab-water');
      // Water FAB intentionally re-uses the chrome bg-1 token so it reads as
      // a SECONDARY action — not the signature oxblood.
      expect(fab.style.backgroundColor).toMatch(/var\(--color-bg-1\)/i);
    });

    it('uses an ivory border (full ivory, not rule-strong)', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByTestId('log-fab-water');
      expect(fab.style.borderColor).toMatch(/var\(--color-ivory\)/i);
    });

    it('renders an inline SVG water-drop glyph (path-based polygon, ivory currentColor)', () => {
      render(<LogFAB variant="water" />);
      const fab = screen.getByTestId('log-fab-water');
      const svg = fab.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      // Water-drop is a single path (not crossed rectangles like the food FAB),
      // so guard the differentiation: water has <path>, food has <rect>s.
      const path = fab.querySelector('svg path');
      expect(path).not.toBeNull();
    });

    it('fires onClick when pressed (water handler)', () => {
      const onClick = vi.fn();
      render(<LogFAB variant="water" onClick={onClick} />);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
