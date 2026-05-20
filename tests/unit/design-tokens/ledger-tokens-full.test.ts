/**
 * Task 1.2 — full Ledger token coverage in `app/globals.css`.
 *
 * Task 1.1 seeded a partial palette for the landing masthead. Task 1.2 must
 * ship the complete set from design-doc.md §8 + ui-design.md §2 (palette
 * expansions, macro data colors, heatmap ramp c0–c9, typography sizes,
 * spacing scale, motion tokens) so downstream design work can rely on every
 * named variable.
 *
 * This test is string-assertion style — it reads `app/globals.css` once and
 * asserts every required variable name appears as a `--name: <value>;`
 * declaration inside the `@theme` block.
 *
 * NOTE: Tailwind v4 `@theme { --color-*: ... }` tokens are what Task 1.1
 * seeded. For non-color tokens (spacing, motion, typography sizes) we use
 * plain CSS variables in a secondary block so they don't collide with
 * Tailwind's generated utility classes. Both live inside `app/globals.css`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

// Every required palette token with its canonical hex (design-doc.md §8).
const PALETTE_TOKENS: Record<string, string> = {
  'color-bg-0': '#0e0a08',
  'color-bg-1': '#15100d',
  'color-bg-2': '#1e1815',
  'color-bg-quote': '#1a1310',
  // Task 4.1 Phase 3 fix (C3): rule tokens raised to satisfy WCAG SC
  // 1.4.11 3:1 non-text contrast on bg-0 (#0e0a08). Previous values
  // (#2a2320 → 1.28:1, #3a3029 → 1.53:1) failed; new values compute
  // ≈3.05:1 and ≈4.00:1.
  'color-rule': '#3f3731',
  'color-rule-strong': '#504742',
  'color-ivory': '#f4ebdc',
  'color-sand': '#c9bda8',
  'color-dust': '#8a8173',
  'color-dust-2': '#6b6156',
  'color-oxblood': '#8a2a1f',
  'color-oxblood-soft': '#a13a2c',
  'color-ember': '#c8693b',
  'color-ochre': '#b8894a',
  'color-moss': '#5c6b3d',
  'color-slate': '#4a5764',
  'color-plum': '#5d3a44',
};

// Task 4.3a R1 (2026-04-24): ramp retuned for uniform ≥1.29:1 adjacent
// WCAG contrast. The briefing's 1.8:1-chained target is infeasible on
// sRGB (1.8^9 = 198:1 luminance ratio exceeds gamut). See the detailed
// explanation in app/globals.css heatmap ramp block.
const HEATMAP_TOKENS: Record<string, string> = {
  'color-heat-c0': '#4e1512',
  'color-heat-c1': '#64281f',
  'color-heat-c2': '#743d26',
  'color-heat-c3': '#7f5331',
  'color-heat-c4': '#87693c',
  'color-heat-c5': '#8a8247',
  'color-heat-c6': '#8b9c51',
  'color-heat-c7': '#86b861',
  'color-heat-c8': '#83d574',
  'color-heat-c9': '#83f489',
};

// Spacing scale (design-doc.md §8 + ui-design.md §2.9).
const SPACING_TOKENS = [
  '--spacing-0',
  '--spacing-1',
  '--spacing-2',
  '--spacing-3',
  '--spacing-4',
  '--spacing-6',
  '--spacing-8',
  '--spacing-12',
  '--spacing-16',
  '--spacing-24',
  '--spacing-gutter-editorial',
  '--page-padding-mobile',
  '--page-padding-tablet',
  '--page-padding-desktop',
];

// Motion tokens.
const MOTION_TOKENS = [
  '--motion-micro',
  '--motion-standard',
  '--motion-expressive',
  '--motion-chrono',
  '--motion-page-turn',
  '--motion-shimmer',
  '--ease-editorial',
];

// Typography role families (Newsreader / Inter / JetBrains Mono).
const TYPE_FAMILY_TOKENS = ['--font-serif', '--font-sans', '--font-mono'];

function hasDeclaration(variable: string, value?: string): boolean {
  // Tailwind v4 accepts `--var: value;`. We match on the exact variable name
  // followed by `:` and, if value provided, the value.
  const pattern = new RegExp(`--${variable}\\s*:\\s*${value ? value + '\\s*;' : ''}`, 'i');
  return pattern.test(css);
}

function hasVariable(name: string): boolean {
  const pattern = new RegExp(`${name}\\s*:`);
  return pattern.test(css);
}

describe('app/globals.css — Ledger tokens (full)', () => {
  it('defines all 17 palette colors with correct hex values', () => {
    for (const [name, value] of Object.entries(PALETTE_TOKENS)) {
      expect(hasDeclaration(name, value), `missing --${name}: ${value}`).toBe(true);
    }
  });

  it('defines all 10 heatmap ramp colors (c0–c9)', () => {
    for (const [name, value] of Object.entries(HEATMAP_TOKENS)) {
      expect(hasDeclaration(name, value), `missing --${name}: ${value}`).toBe(true);
    }
  });

  it('defines the spacing scale and page-padding variables', () => {
    for (const name of SPACING_TOKENS) {
      expect(hasVariable(name), `missing ${name}`).toBe(true);
    }
  });

  it('defines the motion tokens and editorial easing', () => {
    for (const name of MOTION_TOKENS) {
      expect(hasVariable(name), `missing ${name}`).toBe(true);
    }
  });

  it('wires Newsreader / Inter / JetBrains Mono font families', () => {
    for (const name of TYPE_FAMILY_TOKENS) {
      expect(hasVariable(name), `missing ${name}`).toBe(true);
    }
  });

  it('declares the modern radius scale and a float shadow', () => {
    expect(css).toMatch(/--radius-card\s*:\s*16px\s*;/);
    expect(css).toMatch(/--radius-input\s*:\s*12px\s*;/);
    expect(css).toMatch(/--radius-pill\s*:\s*999px\s*;/);
    expect(css).toMatch(/--radius-modal\s*:\s*24px\s*;/);
    expect(css).toMatch(/--shadow-float\s*:\s*[^;]+;/);
  });

  it('sets the ivory keyboard focus ring (WCAG 1.4.11 tiebreaker)', () => {
    // Must use --color-ivory (NOT oxblood) on :focus-visible.
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline\s*:\s*2px\s+solid\s+var\(--color-ivory\)/i);
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline-offset\s*:\s*2px/i);
  });

  it('every palette value parses as a valid 6-digit hex', () => {
    for (const value of Object.values(PALETTE_TOKENS)) {
      expect(value, value).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const value of Object.values(HEATMAP_TOKENS)) {
      expect(value, value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
