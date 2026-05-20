/**
 * `<FoodDetailSkeleton />` — Bug 2 (library overhaul 2026-05-16).
 *
 * RED-first contract test for the route-level loading skeleton consumed by
 * `app/(app)/library/[id]/loading.tsx`. Mirrors the existing
 * `ChartSkeleton` contract: `role="status"`, `aria-busy="true"`, multiple
 * `.skeleton-pulse` placeholders, and (per Open Question 1 in the bug-2
 * proposal) NO `aria-hidden` — so AT users hear "Loading food detail".
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FoodDetailSkeleton } from '@/app/(app)/library/_components/FoodDetailSkeleton';

describe('<FoodDetailSkeleton />', () => {
  it('renders role="status" with aria-busy="true"', () => {
    render(<FoodDetailSkeleton />);
    const skel = screen.getByTestId('food-detail-skeleton');
    expect(skel).toHaveAttribute('role', 'status');
    expect(skel).toHaveAttribute('aria-busy', 'true');
  });

  it('exposes a visible aria-label so assistive tech announces "Loading"', () => {
    render(<FoodDetailSkeleton />);
    const skel = screen.getByTestId('food-detail-skeleton');
    expect(skel.getAttribute('aria-label')?.toLowerCase()).toMatch(/loading/);
  });

  it('does NOT set aria-hidden (would suppress AT announcement)', () => {
    render(<FoodDetailSkeleton />);
    const skel = screen.getByTestId('food-detail-skeleton');
    expect(skel).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('renders multiple `.skeleton-pulse` placeholders for the FoodDetail compound (top-bar, hero, name, macros, history, actions)', () => {
    render(<FoodDetailSkeleton />);
    const skel = screen.getByTestId('food-detail-skeleton');
    const pulses = skel.querySelectorAll('.skeleton-pulse');
    // Top-bar + hero + name + portion + macros (≥4) + history + actions
    // → at least 7 placeholders. Be tolerant to layout tweaks.
    expect(pulses.length).toBeGreaterThanOrEqual(6);
  });
});
