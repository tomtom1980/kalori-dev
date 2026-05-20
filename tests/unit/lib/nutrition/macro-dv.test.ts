/**
 * `lib/nutrition/macro-dv.ts` — Bug 8 (library overhaul batch 2026-05-16).
 *
 * RED-first contract test for the FDA reference Daily Value table used by
 * the library FoodDetail surface (`/library/[id]`). NOT the user-derived
 * Mifflin-St Jeor target that powers the dashboard — those live in
 * `lib/nutrition/target.ts`.
 *
 * Constants are pinned to FDA 21 CFR §101.9 (2,000 kcal diet, 2016
 * revision): Protein 50g, Carbs 275g, Fat 78g, Fiber 28g.
 */
import { describe, expect, it } from 'vitest';

import { MACRO_DV_G, macroDvPct } from '@/lib/nutrition/macro-dv';

describe('MACRO_DV_G — FDA reference table', () => {
  it('pins Protein to 50g per FDA 21 CFR §101.9', () => {
    expect(MACRO_DV_G.protein).toBe(50);
  });

  it('pins Carbs to 275g per FDA 2016 revision', () => {
    expect(MACRO_DV_G.carbs).toBe(275);
  });

  it('pins Fat to 78g per FDA 21 CFR §101.9', () => {
    expect(MACRO_DV_G.fat).toBe(78);
  });

  it('pins Fiber to 28g per FDA 21 CFR §101.9 (note: dashboard uses 25g WHO RNI on a different surface)', () => {
    expect(MACRO_DV_G.fiber).toBe(28);
  });
});

describe('macroDvPct(value, key)', () => {
  it('returns null when value is null', () => {
    expect(macroDvPct(null, 'protein')).toBeNull();
  });

  it('returns null when value is undefined', () => {
    expect(macroDvPct(undefined, 'protein')).toBeNull();
  });

  it('returns null when value is zero (no DV line to render)', () => {
    expect(macroDvPct(0, 'protein')).toBeNull();
  });

  it('returns null when value is NaN', () => {
    expect(macroDvPct(Number.NaN, 'protein')).toBeNull();
  });

  it('returns null when value is negative (defensive — negative grams are nonsensical)', () => {
    expect(macroDvPct(-5, 'protein')).toBeNull();
  });

  it('computes integer DV percent for protein at the canonical 25g sample', () => {
    // 25 / 50 * 100 = 50
    expect(macroDvPct(25, 'protein')).toBe(50);
  });

  it('computes integer DV percent for carbs at the canonical sample', () => {
    // 137.5 / 275 * 100 = 50
    expect(macroDvPct(137.5, 'carbs')).toBe(50);
  });

  it('computes integer DV percent for fat at the canonical sample', () => {
    // 39 / 78 * 100 = 50
    expect(macroDvPct(39, 'fat')).toBe(50);
  });

  it('computes integer DV percent for fiber at the canonical sample', () => {
    // 14 / 28 * 100 = 50
    expect(macroDvPct(14, 'fiber')).toBe(50);
  });

  it('rounds (banker-free) to the nearest integer — 32% case', () => {
    // 16 / 50 * 100 = 32
    expect(macroDvPct(16, 'protein')).toBe(32);
  });

  it('rounds to nearest integer — 33% case (33.333…)', () => {
    // 16.667 / 50 * 100 = 33.333... → 33
    expect(macroDvPct(16.667, 'protein')).toBe(33);
  });

  it('clamps above 100% without ceiling — over-consumption is meaningful', () => {
    // 100 / 50 * 100 = 200
    expect(macroDvPct(100, 'protein')).toBe(200);
  });
});
