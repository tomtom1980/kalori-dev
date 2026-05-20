# Codex R1 Auto-fix — Confirmation freeze sort order (I1)

## Finding addressed

**I1 (Improvement):** `app/(app)/log/_components/ConfirmationScreen.tsx:1674-1729`
`ConfirmationItemMicros` rebuilt rows from current `micros`, computed pct, sorted them, then rendered inputs on every render. Clearing or lowering a high-percent nutrient (e.g., iron from 100% to 0%) would immediately move that input elsewhere in the list while the user was typing — yanking focus and rearranging the column under the cursor.

## False-positive check

None — valid finding. Re-sorting an editable list mid-edit is a well-known UX anti-pattern. The implementation contract for Surface B in the batch briefing explicitly required "frozen-at-mount" behavior, and the helper-only edit landed in the previous phase used runtime-sort. Round 1 caught the regression before any user saw it.

## Files modified

- `app/(app)/log/_components/ConfirmationScreen.tsx` — `ConfirmationItemMicros` now derives its sorted micro list once at mount via `useState`'s lazy initializer; iteration order is locked while live `micros` continue to drive input value display.
- `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` — added 2 regression tests covering the frozen-order contract.

## Changes summary

Replaced the inline IIFE that re-built rows + re-sorted on every render with a `useState(() => sortAndFilterMicrosByRdaPct(...))` lazy initializer. The lazy initializer runs exactly once at mount, captures the seed `micros` shape, computes the row metadata (pct against RDA, displayName), and runs the canonical helper with `{ minPct: 0, includeUnknownRda: true }` (editable-surface options). The returned sorted array is held in component state and never recomputes.

The render loop iterates `sortedMicros` (frozen order) but reads each input's `value` from the LIVE `micros` map via `(micros as Record<string, number | undefined>)[micro.code]`. So amounts stay reactive to user keystrokes while the column order stays pinned.

**Why `useState` instead of `useMemo` + `useRef`:** React 19's `react-hooks/refs` lint rule flags `.current` reads during render (specifically when refs are passed into helper functions during a render pass). `useState`'s lazy initializer is the canonical "compute exactly once at mount" pattern that satisfies the rule of hooks AND is recommended in React 19 docs for derived snapshot state. The early returns (`if (meta.mode !== 'library-only') return null; if (!row) return null;`) were moved BELOW the hook calls to comply with rules-of-hooks order; the standard-mode branch wastes a small amount of work computing a sorted-empty array, which is negligible.

**Edge case:** A new micro key added to `micros` AFTER mount (not in the initial snapshot) will NOT appear in `sortedMicros`. This is a non-issue for the confirmation surface — `ConfirmationItemMicros` always mounts with the AI-parsed result already populated in `row.item.micros`, and `editMicro` writes to existing keys (never creates new ones outside the canonical 30). Both contractually and in practice, the frozen set is the complete set.

## Test results

- **New regression tests (this round):** 2/2 GREEN
  - `freezes the input order at mount — clearing the top-ranked iron input does NOT push it below sodium / vitamin_c`
  - `keeps the input order stable across multiple keystrokes on the same field`
- **Pre-existing ConfirmationItemMicros sort tests:** 3/3 GREEN (initial sort order, all-30-inputs-rendered, edit dispatch round-trip)
- **`tests/unit/components/log-flow/` suite (excluding pre-existing concurrent-session orphan `LibraryList.test.tsx` import-error):** 94/94 GREEN (12 files)
- **`tests/unit/components/ConfirmationScreen` (in `tests/unit/components/`):** 5/5 GREEN (1 file)
- **`tests/components/log-flow/`:** 84/84 GREEN (12 files)

**Out-of-scope failure:** `tests/unit/components/log-flow/LibraryList.test.tsx` fails to resolve `@/app/(app)/log/_components/AddFoodTab/LibraryList` (file moved/renamed). Verified pre-existing by stashing my changes and re-running — fails identically without my edits. File is listed as a concurrent-session orphan in `state.md::concurrent_session_observations`.

## Typecheck / lint

- **`npx tsc --noEmit`:** only the pre-existing `LibraryList.test.tsx` TS2307 import error (unrelated, same concurrent-session orphan). No new errors introduced by my edits.
- **`npx eslint` on touched files (`ConfirmationScreen.tsx` + `ConfirmationItemMicros.sort.test.tsx`):** clean. No warnings, no errors.

## I1 closed

The freeze-at-mount contract is now enforced by:
1. The implementation (`useState` lazy initializer).
2. Two new regression tests that would fail if anyone reverts to runtime-sort.
