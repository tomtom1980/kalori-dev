'use client';

/**
 * <LogFAB /> — Mobile-only FAB pair (food + water).
 *
 * Shape / style: 56×56 zero-radius SQUARE (ui-design.md §2.4 + §6.4 +
 * tiebreaker #3). The design-doc.md §9 "circular FAB" wording is
 * overridden by the two-pass ui-design synthesis per tiebreaker #3 +
 * Ledger canonical source.
 *
 * Bug #5 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — the FAB grew a
 * `variant` prop so the bottom nav can host TWO action FABs side-by-side
 * (food primary + water secondary) per tiebreaker #24 amendment to #3.
 *
 *   - `variant="food"` (default) — oxblood ground, ivory crosshair `+`,
 *     opens the log-flow modal. data-testid `log-fab-food` (with
 *     backwards-compat `log-fab` alias for one rename round).
 *
 *   - `variant="water"` — bg-1 (chrome) ground + 1px ivory border + ivory
 *     water-drop polygon glyph. Surfaces the existing dashboard
 *     <WaterTracker /> chip via `router.push('/dashboard')` (Path A
 *     decision). data-testid `log-fab-water`.
 *
 * Both variants render a real `<button>` (not <a>) so onClick handlers
 * can bind. Both meet the 56×56 tap-target floor (44×44 minimum per
 * WCAG 2.5.5). Side-by-side at 8px gutter clears the AAA adjacent-target
 * collision.
 *
 * Glyphs are inline SVG (deterministic snapshots, no font dependency,
 * no Phosphor/Lucide rounded vocabulary). The crosshair `+` is two 2px
 * crossed rectangles; the water-drop is a single path polygon (M+L+arc
 * teardrop — zero-radius vocabulary parity).
 */
import type { MouseEvent } from 'react';

import { t } from '@/lib/i18n/en';

export type LogFABVariant = 'food' | 'water';

export interface LogFABProps {
  /**
   * Which entry-point this FAB represents.
   *   - 'food' (default) — primary, oxblood, opens the log-flow modal.
   *   - 'water' — secondary, near-black + ivory border, navigates to
   *     /dashboard so the user lands on the existing WaterTracker chip.
   */
  variant?: LogFABVariant;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function LogFAB({ variant = 'food', disabled = false, onClick }: LogFABProps) {
  if (variant === 'water') {
    return (
      <button
        type="button"
        aria-label={t.fab.logWaterA11y}
        data-testid="log-fab-water"
        className="kalori-fab kalori-fab-water"
        disabled={disabled}
        onClick={onClick}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-pill)',
          boxShadow: 'var(--shadow-float)',
          backgroundColor: 'var(--color-bg-1)',
          borderWidth: '1px',
          borderStyle: 'solid',
          // Full ivory border so the secondary FAB reads as "outlined,
          // ivory-themed" against the bg-1 chrome — distinct from the
          // food FAB's signature oxblood ground (tiebreaker #24).
          borderColor: 'var(--color-ivory)',
          color: 'var(--color-ivory)',
          opacity: disabled ? 0.45 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
          {/*
            Water-drop polygon: vertical apex at (10, 2), shoulders flare
            down to (4, 12) and (16, 12), then close via a half-arc to
            form the rounded bottom. Stroke 2px ivory, no fill — keeps
            the Ledger zero-fill / hairline vocabulary intact.
          */}
          <path
            d="M10 2 L4 12 a6 6 0 0 0 12 0 z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="miter"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={t.fab.logFoodA11y}
      aria-haspopup="dialog"
      data-testid="log-fab-food"
      className="kalori-fab kalori-fab-food"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '56px',
        height: '56px',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-float)',
        backgroundColor: 'var(--color-oxblood)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-rule-strong)',
        color: 'var(--color-ivory)',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
        {/* horizontal bar */}
        <rect x="0" y="9" width="20" height="2" fill="currentColor" />
        {/* vertical bar */}
        <rect x="9" y="0" width="2" height="20" fill="currentColor" />
      </svg>
    </button>
  );
}

export default LogFAB;
