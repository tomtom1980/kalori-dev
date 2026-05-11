/**
 * WCAG 2.x contrast-ratio helpers.
 *
 * Task 5.1.6 — Codex Round 2 (C2-3 / C2-4): per-state contrast tests for
 * `<ReplayStatusBadge />` and `<OfflineBar />` were asserting on token
 * NAMES (`var(--color-ivory)`), not on the COMPUTED foreground/background
 * RGB pair. That meant a state could ship with text rendered on a
 * different parent background, fail the AAA threshold, and still pass
 * the assertion. This helper resolves that gap.
 *
 * NOT shipped to the runtime bundle: imported by tests only.
 *
 * The functions implement WCAG 2.1 §1.4.6 (Contrast Enhanced) — the AAA
 * threshold is 7.0:1 for body text, 4.5:1 for large text. Helpers below
 * compute the unweighted ratio; callers compare against the appropriate
 * threshold.
 */

/**
 * Per-channel relative luminance helper (WCAG 2.x §1.4.3).
 *
 * The input channel is a normalized 8-bit value (0..255). The function
 * applies the sRGB → linear-light transform and returns a value in
 * `[0, 1]`.
 */
function channelLuminance(value8: number): number {
  // Clamp + normalize.
  const v = Math.max(0, Math.min(255, value8)) / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an sRGB tuple per WCAG 2.x §1.4.3.
 *
 * Inputs are 0..255 channel values. Output is in `[0, 1]`.
 */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * WCAG 2.x contrast ratio between two sRGB tuples. Returns a value in
 * `[1, 21]`.
 */
export function contrastRatio(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
): number {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a CSS color string into an sRGB tuple. Accepts:
 *   - `rgb(R, G, B)` / `rgb(R G B)` / `rgba(R, G, B, A)`
 *   - `#RRGGBB` / `#RGB`
 *   - whitespace-flexible
 *
 * Throws on inputs the helper cannot interpret. The contract is that
 * tests should pass a fully-resolved value (no `var(...)` wrappers); the
 * caller is responsible for resolution before invoking this function.
 */
export function parseRgbString(css: string): [number, number, number] {
  const trimmed = css.trim().toLowerCase();

  // rgb(...) / rgba(...).
  const fnMatch = trimmed.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,\/ ]\s*[0-9.]+%?)?\s*\)$/,
  );
  if (fnMatch) {
    const r = Number(fnMatch[1]);
    const g = Number(fnMatch[2]);
    const b = Number(fnMatch[3]);
    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  // #RRGGBB / #RGB.
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b];
    }
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      return [r, g, b];
    }
  }

  throw new Error(`parseRgbString: cannot parse "${css}"`);
}

/**
 * WCAG 2.x AAA threshold for body text. Tests assert on this constant
 * to make the contract explicit at the call site.
 */
export const WCAG_AAA_BODY_TEXT_RATIO = 7.0;

/**
 * Convenience: compute the ratio between two CSS color strings (after
 * the caller has resolved any `var(--token)` references to a concrete
 * `rgb(...)` / `#hex` value).
 */
export function ratioBetween(fgCss: string, bgCss: string): number {
  return contrastRatio(parseRgbString(fgCss), parseRgbString(bgCss));
}
