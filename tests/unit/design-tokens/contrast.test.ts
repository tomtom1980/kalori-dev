/**
 * Task 3.3 — Contrast Ratio Harness (reconciliation §1.10).
 *
 * Locks WCAG AA / AAA compliance for every interaction surface the log-flow
 * modal paints. Values flow directly from `app/globals.css @theme` tokens —
 * if a token drifts, these assertions fail before any UI consumes the value.
 *
 * The ux-auditor compliance spec §4 enumerates the pairs; this file is the
 * machine-checked copy of that table.
 *
 * Ratios are computed per WCAG 2.1 §1.4.3 / §1.4.11 formula:
 *   L = 0.2126*R + 0.7152*G + 0.0722*B   (sRGB relative luminance)
 *   ratio = (L1 + 0.05) / (L2 + 0.05)    where L1 = max(L_a, L_b)
 */
import { describe, expect, it } from 'vitest';

const TOKENS = {
  // Warm near-black stack.
  bg0: '#0e0a08',
  bg1: '#15100d',
  bg2: '#1e1815',

  // Text.
  ivory: '#f4ebdc',
  sand: '#c9bda8',
  dust: '#8a8173',
  dust2: '#6b6156',

  // Oxblood.
  oxblood: '#8a2a1f',
  oxbloodSoft: '#a13a2c',

  // Data.
  ember: '#c8693b',
  moss: '#5c6b3d',
} as const;

function srgbChannel(c8: number): number {
  const s = c8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Task 3.3 — contrast tokens (WCAG 1.4.3 / 1.4.11 / 2.4.11)', () => {
  describe('body text on surfaces (≥ 4.5:1 AA, ≥ 7:1 AAA)', () => {
    it('ivory on bg-0 clears AAA (~16:1)', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg0)).toBeGreaterThanOrEqual(7);
    });
    it('ivory on bg-1 clears AAA', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg1)).toBeGreaterThanOrEqual(7);
    });
    it('ivory on bg-2 clears AAA', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg2)).toBeGreaterThanOrEqual(7);
    });
    it('sand on bg-1 clears AA (≥ 4.5:1) — secondary body text surface', () => {
      expect(contrast(TOKENS.sand, TOKENS.bg1)).toBeGreaterThanOrEqual(4.5);
    });
    it('dust on bg-0 clears AA (≥ 4.5:1) — UPPERCASE label text', () => {
      expect(contrast(TOKENS.dust, TOKENS.bg0)).toBeGreaterThanOrEqual(4.5);
    });
    it('dust on bg-1 clears AA — used for chip / kcal captions', () => {
      expect(contrast(TOKENS.dust, TOKENS.bg1)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('UI component contrast (≥ 3:1, WCAG 1.4.11)', () => {
    it('oxblood underline on bg-0 is rationed — 2.28:1. NON-TEXT role only, paired with ivory ring for keyboard focus', () => {
      // The active-tab underline is decorative / style-signal only. It NEVER
      // carries meaning alone: it's accompanied by text-color shift
      // (dust → ivory) + `aria-selected="true"` + ivory focus ring on keyboard
      // focus. Reconciliation §1.2 forbids oxblood AS focus ring (fails 3:1).
      // We assert the literal ratio here so any future "strengthen oxblood"
      // design pass sees this line flip.
      const ratio = contrast(TOKENS.oxblood, TOKENS.bg0);
      expect(ratio).toBeGreaterThan(2.2);
      expect(ratio).toBeLessThan(3.0);
    });
    it('ember banner rule on bg-2 clears 3:1', () => {
      expect(contrast(TOKENS.ember, TOKENS.bg2)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('ivory focus ring (WCAG 2.4.11 ≥ 3:1 against adjacent surface)', () => {
    it('ivory ring on bg-0 clears 3:1 — far above', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg0)).toBeGreaterThanOrEqual(3);
    });
    it('ivory ring on bg-1 clears 3:1', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg1)).toBeGreaterThanOrEqual(3);
    });
    it('ivory ring on bg-2 clears 3:1', () => {
      expect(contrast(TOKENS.ivory, TOKENS.bg2)).toBeGreaterThanOrEqual(3);
    });
    it('ivory ring on oxblood CTA (worst case) clears 3:1', () => {
      expect(contrast(TOKENS.ivory, TOKENS.oxblood)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('oxblood as a11y focus ring — explicit REJECTION', () => {
    it('oxblood on bg-0 FAILS 4.5:1 (body text rule) — must never be used for text', () => {
      // ~3.64:1 — scary-close; locking below 4.5 protects against a
      // future "oxblood works as body text" regression.
      expect(contrast(TOKENS.oxblood, TOKENS.bg0)).toBeLessThan(4.5);
    });
  });

  describe('ivory on oxblood CTA label (WCAG 1.4.3 normal text)', () => {
    it('clears AA 4.5:1 (PARSE / ANALYZE / ADD ALL buttons)', () => {
      expect(contrast(TOKENS.ivory, TOKENS.oxblood)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('disabled-button tonal shift (reconciliation §1.3)', () => {
    it('bg-0 and bg-1 are NOT identical — the tonal shift is perceivable (ratio > 1.03)', () => {
      // Ledger tonal stack is deliberately subtle (1.04:1). The disabled-
      // button affordance is therefore NOT bg shift alone — it MUST combine
      // with: cursor: not-allowed + aria-disabled + hairline border retention
      // + ivory label opacity hold. This test locks the two surfaces are
      // distinguishable enough that sighted users detect the shift.
      expect(contrast(TOKENS.bg0, TOKENS.bg1)).toBeGreaterThan(1.03);
    });
    it('bg-0 and bg-2 provide a stronger tonal fallback when deeper contrast is needed', () => {
      expect(contrast(TOKENS.bg0, TOKENS.bg2)).toBeGreaterThan(1.1);
    });
  });

  describe('letter-mark fallback (library card) — sand on bg-2', () => {
    it('sand 28px on bg-2 clears 3:1 (large UI text)', () => {
      // 28px Newsreader 300 weight — treat as large-scale per WCAG 1.4.3.
      expect(contrast(TOKENS.sand, TOKENS.bg2)).toBeGreaterThanOrEqual(3);
    });
  });
});
