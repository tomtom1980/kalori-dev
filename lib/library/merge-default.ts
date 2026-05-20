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
function cholesterolSide(a: LibraryItem, b: LibraryItem, fallback: 'a' | 'b'): 'a' | 'b' {
  // Codex R2 fix — one-sided cholesterol data-preservation default.
  // When exactly one side carries `cholesterol_mg`, pre-select that
  // side regardless of the generic winner heuristic. Otherwise the
  // generic winner could overwrite the only recorded value with 0
  // (because the absent side reads as 0 in `aCholesterol`/`bCholesterol`)
  // — silent data loss on accept-defaults flow.
  const aMacros = a.nutrition?.macros as { cholesterol_mg?: number } | undefined;
  const bMacros = b.nutrition?.macros as { cholesterol_mg?: number } | undefined;
  const aHas =
    aMacros !== undefined && Object.prototype.hasOwnProperty.call(aMacros, 'cholesterol_mg');
  const bHas =
    bMacros !== undefined && Object.prototype.hasOwnProperty.call(bMacros, 'cholesterol_mg');
  if (aHas && !bHas) return 'a';
  if (bHas && !aHas) return 'b';
  // Both have it (or neither does) → defer to the generic winner.
  return fallback;
}

export function pickDefaults(a: LibraryItem, b: LibraryItem): MergeFieldChoices {
  const winner = winnerSide(a, b);
  return {
    display_name: winner,
    thumbnail_url: thumbnailSide(a, b, winner),
    kcal: winner,
    protein_g: winner,
    carbs_g: winner,
    fat_g: winner,
    // Codex R1 F1 + R2 fix — cholesterol_mg defaults to whichever side
    // actually has the value when exactly one side carries it (parallel
    // to `thumbnail_url`); otherwise defers to the generic winner.
    // Without R2's adjustment, a one-sided pair where the generic
    // winner lacks cholesterol but the loser has it would silently
    // erase the only recorded value on accept-defaults.
    cholesterol_mg: cholesterolSide(a, b, winner),
    default_portion: winner,
    default_unit: winner,
    kcal_custom: null,
    protein_custom: null,
    carbs_custom: null,
    fat_custom: null,
    cholesterol_custom: null,
    portion_custom: null,
  };
}

export { winnerSide, thumbnailSide, cholesterolSide };
