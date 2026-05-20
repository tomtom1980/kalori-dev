# Bug 2 (LM-I2) — Implementation Output

## Status
✅ Complete — committed + pushed to `origin/main`.

## Commit
- **SHA (local + origin):** `42126c051996573524a406c29e8d77b94dec5601`
- **Branch:** `main`
- **Push:** verified — `origin/main` == local HEAD == `42126c0`

## Files touched
1. `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` (lines 443-491 in current file, ≈30 LOC changed)
2. `tests/unit/library/food-detail-edit-validation.test.ts` (added 4 tests + updated 1 prior-regime assertion)

## Tests added
**New `describe('buildFieldsPatch — canonical/legacy sodium dedup', ...)` block** — 4 tests:
1. `drift + unrelated edit emits only canonical sodium (regression)` — proves the LM-I2 fix
2. `drift + sodium edit: canonical wins, legacy deleted (R1-C1 happy path)` — guards against R1-C1 regression
3. `clean canonical input + unrelated edit: unchanged` — no-op path
4. `clean legacy input + unrelated edit: legacy preserved (R1-C1 shape policy)` — R1-C1 preservation invariant

**Updated test:** `preserves untouched macros and micros when a single macro changes` (line 116, prior commit `e8af134`) — was asserting aggressive `sodium_mg → sodium` migration. That assertion was authored DURING the introduction of this regression (commit `e8af134` made `canonicalizeMicrosBag` migrate ALL legacy keys to canonical). Re-aligned to R1-C1 preservation contract: `sodium_mg` stays, while `iron_mg → iron` and `vitamin_c_mg → vitamin_c` continue to migrate per library-micros-parse R1-C2.

## Test results
- Target file `tests/unit/library/food-detail-edit-validation.test.ts`: **16/16 pass**
- Regression sweep: `tests/components/library/FoodDetailMacros.test.tsx` — **39/39 pass**
- Broader sweep: `tests/components/library/` + dashboard `aggregate-micros-aliases` + `aggregate-micros-contributions` — **228/228 pass**
- Full library unit dir: `tests/unit/library/` — **96/96 pass**

## TDD evidence
- 4 new tests written BEFORE any production change. Initial run: **1 failure (test 4)** — the others passed because the existing `canonicalizeMicrosBag` already handled drift correctly via two-pass canonical-precedence. The single failure exposed the actual residual bug: **legacy-only rows getting aggressively migrated**, violating R1-C1.
- After fix: **16/16 green**.

## Implementation summary

**Root cause refined during TDD:** The proposal hypothesized that drift (`{sodium: 500, sodium_mg: 999}`) was double-counted because dedup only ran in the `sodiumChanged` branch. In reality, commit `e8af134` (the library-micros-parse R1-C2 fix) had already introduced `canonicalizeMicrosBag` at the merge spread (line 424), which two-pass-collapses drift to canonical correctly. **The drift double-count was already fixed.**

**The residual bug TDD exposed:** `canonicalizeMicrosBag` migrates legacy-only rows (`{sodium_mg: 500}`) aggressively to `{sodium: 500}`, which contradicts R1-C1's committed "preserve legacy shape" policy. An unrelated nutrition edit (protein, kcal, etc.) would silently mutate the row's committed key shape.

**Fix shape:**

```ts
// AFTER canonicalizeMicrosBag has built mergedMicros (drift already resolved):
const hasLegacy = typeof initMicrosRecord.sodium_mg === 'number' && ...;
const hasCanonical = typeof initMicrosRecord.sodium === 'number' && ...;

if (sodiumChanged && sodium !== undefined && sodium !== null) {
  // (R1-C1 user-edit logic, unchanged)
} else if (hasLegacy && !hasCanonical) {
  // R1-C1 preservation: legacy-only, sodium NOT edited — undo migration.
  if (typeof mergedMicros.sodium === 'number') {
    mergedMicros.sodium_mg = mergedMicros.sodium;
    delete mergedMicros.sodium;
  }
}
// Drift + no edit: already resolved by canonicalize.
// Canonical-only / neither: unchanged.
```

The dedup is now an unconditional merge invariant: drift always converges, legacy-only is always preserved, canonical-only is always unchanged.

## R1-C1 shape policy alignment
- ✅ Drift case → canonical wins, legacy deleted (test 1 + test 2)
- ✅ Legacy-only → preserved (test 4)
- ✅ Canonical-only → unchanged (test 3)
- ✅ User sodium edit on legacy-only → writes to `sodium_mg` (existing R1-C1 logic, preserved)
- ✅ User sodium edit on canonical/drift → writes to `sodium`, drops `sodium_mg` (existing R1-C1 logic, preserved)

## Anything surprising
1. **The proposal's stated symptom was already partially fixed** by an earlier commit (`e8af134`'s `canonicalizeMicrosBag`). The TDD process exposed the *actual* residual: aggressive legacy-only migration, which is the inverse of the originally-described "drift double-count" symptom. The fix still hardens the merge invariant (now uniform across all cases), and Test 1 still protects against the originally-described drift regression.
2. **The pre-existing 'preserves untouched macros and micros' test (line 116) had to be updated.** Its assertion `sodium: 420` was authored under the aggressive-migration regime introduced by `e8af134` and contradicts R1-C1's committed shape policy. The pre-resolved decision in the directive ("Preserve R1-C1 shape policy") justified the assertion update. Other legacy aliases (`iron_mg`, `vitamin_c_mg`) continue to migrate per library-micros-parse R1-C2 (different policy lineage; not covered by R1-C1).
3. **Pre-commit hook ran cleanly** — prettier + eslint applied minor formatting; no rule violations.

## Sequence of operations actually performed
1. Read proposal + relevant code sections
2. Wrote 4 failing tests (TDD red-first)
3. Ran tests → 3/4 pass (drift already fixed), 1/4 fail (legacy-only regression exposed)
4. Refined diagnosis: drift fix already in place via `canonicalizeMicrosBag`; real residual is aggressive migration of legacy-only rows
5. Implemented fix: pulled dedup OUTSIDE `sodiumChanged` branch, added R1-C1 preservation step for legacy-only no-edit case
6. Ran tests → 1 pre-existing test now failed (`preserves untouched macros and micros`) — its `sodium: 420` assertion was authored under the buggy regime
7. Updated the pre-existing test to reflect R1-C1 shape policy (sodium_mg preserved; iron/vitamin_c continue to migrate per R1-C2)
8. Ran tests → 16/16 green
9. Regression sweep: 228/228 pass
10. Staged + committed (pre-commit hook ran prettier+eslint, all clean)
11. Pushed to `origin/main`
12. Verified `origin/main` == local HEAD == `42126c0`
