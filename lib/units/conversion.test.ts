/**
 * Unit tests for `lib/units/conversion.ts` — pure math primitives.
 *
 * Coverage: round-trip identity, boundary values (100 cm / 250 cm for
 * height, 30 kg / 350 kg for weight), exact-constant verification,
 * display rounding helper.
 */
import { describe, expect, it } from 'vitest';

import {
  CM_PER_IN,
  KG_PER_LB,
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
  roundToOneDecimal,
} from './conversion';

describe('units · exact constants', () => {
  it('1 in = 2.54 cm exactly', () => {
    expect(CM_PER_IN).toBe(2.54);
  });

  it('1 lb = 0.45359237 kg exactly (NIST)', () => {
    expect(KG_PER_LB).toBe(0.45359237);
  });
});

describe('units · cm ↔ in', () => {
  it('round-trips at 170 cm within ≤1e-10', () => {
    expect(inToCm(cmToIn(170))).toBeCloseTo(170, 10);
  });

  it('round-trips at 100 cm (lower DDL bound)', () => {
    expect(inToCm(cmToIn(100))).toBeCloseTo(100, 10);
  });

  it('round-trips at 250 cm (upper DDL bound)', () => {
    expect(inToCm(cmToIn(250))).toBeCloseTo(250, 10);
  });

  it('converts 170 cm to 66.929… in (ux-specialist §3)', () => {
    expect(cmToIn(170)).toBeCloseTo(66.929, 3);
  });

  it('converts 66.93 in to ≈170 cm', () => {
    expect(inToCm(66.929)).toBeCloseTo(170, 1);
  });
});

describe('units · kg ↔ lb', () => {
  it('round-trips at 75 kg within ≤1e-10', () => {
    expect(lbToKg(kgToLb(75))).toBeCloseTo(75, 10);
  });

  it('round-trips at 30 kg (lower DDL bound)', () => {
    expect(lbToKg(kgToLb(30))).toBeCloseTo(30, 10);
  });

  it('round-trips at 350 kg (upper DDL bound)', () => {
    expect(lbToKg(kgToLb(350))).toBeCloseTo(350, 10);
  });

  it('converts 75.5 kg to 166.4 lb (display rounded)', () => {
    expect(roundToOneDecimal(kgToLb(75.5))).toBe(166.4);
  });

  it('converts 150 lb to 68.0389 kg (approx)', () => {
    expect(lbToKg(150)).toBeCloseTo(68.0389, 3);
  });
});

describe('units · roundToOneDecimal', () => {
  it('rounds 66.929 to 66.9', () => {
    expect(roundToOneDecimal(66.929)).toBe(66.9);
  });

  it('rounds 166.449 to 166.4 (banker-agnostic half-up)', () => {
    expect(roundToOneDecimal(166.449)).toBe(166.4);
  });

  it('rounds 166.451 to 166.5', () => {
    expect(roundToOneDecimal(166.451)).toBe(166.5);
  });

  it('preserves whole numbers', () => {
    expect(roundToOneDecimal(170)).toBe(170);
  });
});
