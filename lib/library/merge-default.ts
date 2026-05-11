/**
 * Merge default-selection heuristic — Task 4.1 sub-step 3 (reconciled §18 /
 * briefing §15.1).
 *
 * `pickDefaults(a, b)` returns the per-field pre-selected side for the Merge
 * dialog when it first opens:
 *   - Winner heuristic: higher `log_count` wins. Tie break on older
 *     `created_at` (stable lineage wins).
 *   - Thumbnail exception: if exactly one of A/B has a photo, that side is
 *     pre-selected regardless of the winner heuristic.
 *   - Numerics + portion default to the winner side; the user can still pick
 *     CUSTOM in the dialog.
 *
 * Pure function — no React, no DOM. Consumed by both the component (initial
 * `useReducer` state) and the unit tests.
 */
import type { LibraryItem } from './fetch';
import type { MergeFieldChoices } from './types';

function winnerSide(a: LibraryItem, b: LibraryItem): 'a' | 'b' {
  if (b.log_count > a.log_count) return 'b';
  if (a.log_count > b.log_count) return 'a';
  // Tie-break on older created_at — stable lineage is the default winner.
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  if (Number.isNaN(at) || Number.isNaN(bt)) return 'a';
  return at <= bt ? 'a' : 'b';
}

function thumbnailSide(a: LibraryItem, b: LibraryItem, fallback: 'a' | 'b'): 'a' | 'b' {
  const aHas = Boolean(a.thumbnail_url);
  const bHas = Boolean(b.thumbnail_url);
  if (aHas && !bHas) return 'a';
  if (bHas && !aHas) return 'b';
  return fallback;
}

/**
 * Produce the initial `MergeFieldChoices` for the Merge dialog. Numeric
 * custom slots are initialised to `null` — the UI shows the winner value in
 * the numeric input field but treats it as a display default until the user
 * types a CUSTOM value.
 */
export function pickDefaults(a: LibraryItem, b: LibraryItem): MergeFieldChoices {
  const winner = winnerSide(a, b);
  return {
    display_name: winner,
    thumbnail_url: thumbnailSide(a, b, winner),
    kcal: winner,
    protein_g: winner,
    carbs_g: winner,
    fat_g: winner,
    default_portion: winner,
    default_unit: winner,
    kcal_custom: null,
    protein_custom: null,
    carbs_custom: null,
    fat_custom: null,
    portion_custom: null,
  };
}

export { winnerSide, thumbnailSide };
