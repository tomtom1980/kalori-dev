# Codex R1 fixes — `useFoodDetailEdit.ts`

Auto-fix sub-agent output for Codex Round 1 findings on
`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`.

Batch: `2026-05-17-followups`
Pre-batch SHA: `07273a3`
Commit SHA (local + origin): `fd1e3fc`

---

## C1 — Critical (FIXED)

**Finding:** `buildFieldsPatch` preserved legacy-only sodium rows (per
LM-I2) but still aggressively migrated `iron_mg` / `vitamin_c_mg` /
`vitamin_a_mcg` / etc. via `canonicalizeMicrosBag`, silently mutating
the row's committed shape on every unrelated nutrition edit. The
sodium-only carve-out contradicted the user-facing claim that "R1-C1
shape policy is preserved" and produced silent legacy → canonical
migrations the user never asked for.

**A/B determination:** REAL regression introduced inside this batch. The
pre-batch test at `07273a3` (`tests/unit/library/food-detail-edit-validation.test.ts`)
asserted `{sodium_mg: 420, iron_mg: 2.3, vitamin_c_mg: 80}` — full legacy
preservation. Bug 2's commit `e8af134` switched ALL legacy keys to
canonical. LM-I2 (`42126c0`) only restored sodium. C1 caught the gap.

**Fix:** Universal preservation pass in `buildFieldsPatch`. Walks
`initMicrosRecord` once to build a per-canonical-key shape map
(`legacyKey`, `hasLegacy`, `hasCanonical`). After `canonicalizeMicrosBag`
collapses everything onto canonical, restores legacy shape for any
canonical key that:
1. Came from a legacy-only row in init, AND
2. Was NOT edited via the generic micros bag (`microEdits` /
   `microClears`), AND
3. Is not sodium-with-sodium-edit (the dedicated typed-field branch
   above already wrote the correct shape).

Drift case (both keys present, no edit) still resolves to canonical for
every micro — exactly as `canonicalizeMicrosBag` does by default.

**Tests added (RED-first):**
- `legacy-only iron_mg + unrelated macro edit: legacy shape preserved`
- `legacy-only vitamin_c_mg + unrelated edit: legacy shape preserved`
- `drift iron_mg + iron + unrelated edit: canonical wins, legacy deleted`
- `mixed legacy-only micros (iron_mg, vitamin_c_mg, vitamin_a_mcg) + unrelated edit: all preserved`
- `legacy iron_mg + user edits iron via generic micros bag: canonical wins, legacy deleted`
- `regression: sodium_mg legacy preservation still works (LM-I2)`

**Tests updated to match corrected policy:**
- `preserves untouched macros and micros when a single macro changes` —
  now asserts `iron_mg`/`vitamin_c_mg` survive verbatim (was: `iron`/`vitamin_c`)
- `drift + unrelated edit emits only canonical sodium (regression)` —
  now asserts `iron_mg` (legacy-only init) preserved (was: `iron`)

---

## I1 — Improvement (FIXED inline)

**Finding:** Validation failure focused the errored micro input, which
could live inside a closed Radix Collapsible (no-op focus), and skipped
the parent save banner entirely. User saw Save silently blocked.

**A/B determination:** REAL — introduced by Bug 2's commit `e8af134`.
`git blame` on lines 781-796 shows the entire focus-block originated in
that commit. Inline comment at line 792 explicitly acknowledged the
limitation: *"for micros, the input lives inside a Radix Collapsible
that may be CLOSED. We can't reliably expand it from imperative code …
the focus call is a no-op. Worst case the user sees the SAVE banner"* —
but no banner was actually surfaced, contradicting the comment.

**Fix:** In `commit()`'s validation-failure branch:
1. Sets `errors._form = saveFailedBanner` so the form-level error state
   carries the same signal as the network-failure branch.
2. Calls `onFailed(saveFailedBanner)` so the parent `FoodDetail`
   component's existing `<p role="alert">` banner renders regardless of
   which input owns the error or whether its Collapsible is open.

This mirrors the existing network-failure path (line 836) exactly, so
the parent's already-wired error handling needs no parent-side change.

**Tests added (RED-first):**
- `invokes onFailed with saveFailedBanner when a micro validation error occurs`
- `invokes onFailed for a top-level (name) validation error too`

Both run via `renderHook` from `@testing-library/react` (matching the
repo's existing hook-test pattern in `tests/unit/lib/hooks/`).

---

## Commit SHA

- Local: `fd1e3fc`
- Origin: `fd1e3fc` (pushed to `origin/main`)

## Files touched

3 files:
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
- `tests/unit/library/food-detail-edit-validation.test.ts`
- `tests/unit/library/food-detail-edit-validation-banner.test.tsx` (NEW)

## Test results

- Library unit tests: 104 / 104 pass
- Library + integration + dashboard sweep: 325 / 325 pass (8 unrelated skips)
- TypeScript: clean

## False positives

None. Both findings were real, both fixed in-batch.
