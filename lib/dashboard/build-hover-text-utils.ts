/**
 * `lib/dashboard/build-hover-text-utils.ts` — shared tooltip-text helpers
 * for the dashboard's macro + micro rows.
 *
 * Background: Phase 2A moved the MicronutrientPanel + WaterTracker into a
 * side-by-side row at `min-width: 768px`. The MacroBars row was already
 * side-by-side with the ChronometerRing at the same breakpoint. Both
 * surfaces host Radix Tooltips with `maxWidth: 280` showing the "Top
 * contributors: …" preview text. At 768–900px the column is roughly
 * half-width and a single long contributor name (e.g.
 * "Chicken stew with mushrooms, carrots, and a side of …") can blow past
 * the cap, especially when 3 contributors are present.
 *
 * This module owns:
 *   - `truncateItemName(name, max=20)` — grapheme-aware truncation
 *   - `buildMacroHoverText(row)` — was a private helper inside MacroBars.tsx,
 *     promoted here so the truncation policy is identical to micros and
 *     covered by unit tests
 *
 * `buildMicroHoverText` continues to live in `build-micro-hover-text.ts`
 * (Phase 2B file) and imports `truncateItemName` from here.
 */
import { t } from '@/lib/i18n/en';
import type { MacroContribution, MacroRow } from '@/lib/dashboard/types';

const DEFAULT_MAX_GRAPHEMES = 20;
const ELLIPSIS = '…';

// Module-scoped singleton — constructing an `Intl.Segmenter` per call is
// non-trivial and we hit this helper for every contribution rendered in a
// tooltip. Node 18+ ships `Intl.Segmenter`; jsdom inherits it.
const GRAPHEME_SEGMENTER: Intl.Segmenter | null =
  typeof Intl !== 'undefined' &&
  typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

/**
 * Truncate `name` to at most `max` visible graphemes. When the source
 * exceeds the cap, the last visible character is replaced with `…` so the
 * total visual width remains `max` (e.g. max=20 → 19 source graphemes +
 * ellipsis).
 *
 * Uses `Intl.Segmenter` when available so combining diacritics
 * (e.g. Vietnamese "Bún chả Hà Nội") are not split mid-grapheme. Falls back
 * to `Array.from(str)` which iterates by Unicode code point — still safer
 * than `String.prototype.slice` (UTF-16 code units), though it cannot
 * group base+combining pairs.
 */
export function truncateItemName(name: string, max: number = DEFAULT_MAX_GRAPHEMES): string {
  if (name.length === 0) return '';

  if (GRAPHEME_SEGMENTER) {
    const segments = Array.from(GRAPHEME_SEGMENTER.segment(name), (s) => s.segment);
    if (segments.length <= max) return name;
    return segments.slice(0, max - 1).join('') + ELLIPSIS;
  }

  // Fallback: code-point iteration. `Array.from(str)` returns one element
  // per code point (correctly handling surrogate pairs) but does NOT join
  // base+combining pairs into a single grapheme. Best-effort on environments
  // missing `Intl.Segmenter`.
  const codePoints = Array.from(name);
  if (codePoints.length <= max) return name;
  return codePoints.slice(0, max - 1).join('') + ELLIPSIS;
}

/**
 * Returns the macro row's display unit (`'g'` or `'mg'`). Defaults to `'g'`
 * for legacy fixtures where `unit` is omitted — aggregator-produced rows
 * always populate it.
 */
function rowUnit(row: Pick<MacroRow, 'unit'>): 'g' | 'mg' {
  return row.unit ?? 'g';
}

/**
 * Returns the per-contribution numeric value (g or mg, same scale as
 * `row.unit`). Prefer `amount` (unit-aware sibling added 2026-05-16);
 * fall back to legacy `grams` for older fixtures.
 */
function contributionAmount(item: Pick<MacroContribution, 'amount' | 'grams'>): number {
  return item.amount ?? item.grams;
}

/** Format a numeric amount the same way macros do: integers stay integer,
 * decimals get 1 fractional digit. */
function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Display-name lookup mirroring `MacroBars.tsx` so the empty-state copy
// reads naturally ("No Protein entries yet" instead of "No protein entries
// yet"). i18n keys live on `t.dashboard.macros`.
const MACRO_LABEL_TITLE: Record<MacroRow['key'], string> = {
  protein: t.dashboard.macros.proteinTitle,
  carbs: t.dashboard.macros.carbsTitle,
  fat: t.dashboard.macros.fatTitle,
  fiber: t.dashboard.macros.fiberTitle,
  cholesterol: t.dashboard.macros.cholesterolTitle,
};

/**
 * Build the tooltip/`title` text shown on macro-row hover. Mirrors
 * `buildMicroHoverText` but pulls the unit from the row (g vs mg) and
 * truncates long contributor names to keep the tooltip bounded inside the
 * side-by-side hero row at narrow tablet widths.
 *
 * - 0 contributors → "No <Macro> entries yet."
 * - 1..3 contributors → "Top contributors: <name> <amount><unit>, ..."
 * - 4+ contributors → only the top 3 are listed.
 */
export function buildMacroHoverText(row: MacroRow): string {
  if (row.contributions.length === 0) {
    return t.dashboard.macros.breakdownHoverEmpty.replace('{macro}', MACRO_LABEL_TITLE[row.key]);
  }
  const unit = rowUnit(row);
  const items = row.contributions
    .slice(0, 3)
    .map(
      (item) =>
        `${truncateItemName(item.itemName)} ${formatAmount(contributionAmount(item))}${unit}`,
    )
    .join(', ');
  return t.dashboard.macros.breakdownHoverTop.replace('{items}', items);
}
