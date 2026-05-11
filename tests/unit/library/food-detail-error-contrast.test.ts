/**
 * Unit test — Task 4.2 round 1 V4 fix.
 *
 * Asserts the `.kalori-fd-error` color token meets WCAG AA 4.5:1 contrast
 * against `--color-bg-0` at its declared 11px font-size + weight 500.
 *
 * Reads app/globals.css directly and computes the contrast ratio from the
 * resolved hex values — no happy-dom needed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = resolve(process.cwd(), 'app/globals.css');
const CSS = readFileSync(cssPath, 'utf8');

function findHexForVar(name: string): string | null {
  const rx = new RegExp(`${name}\\s*:\\s*(#[0-9A-Fa-f]{3,8})\\b`, 'g');
  let match: RegExpExecArray | null = null;
  let last: string | null = null;
  while ((match = rx.exec(CSS)) !== null) last = match[1]!;
  return last;
}

function expandHex(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  h = h.slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(expandHex(fg));
  const lBg = relativeLuminance(expandHex(bg));
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('V4 — .kalori-fd-error contrast against --color-bg-0', () => {
  it('uses a --color-* var that resolves to WCAG AA ≥ 4.5:1 contrast on bg-0', () => {
    const ruleMatch = CSS.match(/\.kalori-fd-error\s*\{[^}]*\}/);
    expect(ruleMatch, 'kalori-fd-error rule not found in globals.css').toBeTruthy();
    const rule = ruleMatch![0];
    const tokenMatch = rule.match(/color:\s*var\((--[a-z0-9-]+)\)/i);
    expect(tokenMatch, 'kalori-fd-error must use a var(--color-*) token').toBeTruthy();
    const tokenName = tokenMatch![1]!;

    const fg = findHexForVar(tokenName);
    expect(fg, `token ${tokenName} must resolve to a hex value in globals.css`).toBeTruthy();
    const bg = findHexForVar('--color-bg-0');
    expect(bg, '--color-bg-0 must be defined in globals.css').toBeTruthy();

    const ratio = contrastRatio(fg!, bg!);
    expect(
      ratio,
      `kalori-fd-error (${tokenName} = ${fg}) on bg-0 (${bg}) has contrast ${ratio.toFixed(2)}:1 — needs >= 4.5:1 for WCAG AA normal text (11px weight 500)`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
