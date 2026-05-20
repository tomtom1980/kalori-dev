# Bug #2 — LM-I2: useFoodDetailEdit canonical/legacy dedup only on sodiumChanged=true

## Classification
`known_fix`

## ui_touching
`false` — pure logic change in `buildFieldsPatch`. No render output, no a11y, no styling. Phase 7 may still pass through if it wants integration coverage but no Playwright/visual asserts are needed.

## Root cause
`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:222-250`. The function does:

```ts
const mergedMicros: Record<string, number> = { ...(initMicros as Record<string, number>) };
if (sodiumChanged && sodium !== undefined && sodium !== null) {
  // canonical-wins / legacy-delete dedup here, ONLY inside this branch
}
```

The dedup block is **conditional on `sodiumChanged === true`**. For a drifted row whose micros already contain BOTH `sodium: 500` AND `sodium_mg: 999`, an unrelated edit (e.g., user retypes protein from 28 to 42) flips `anyNutritionChanged = true` via `protein.changed`, the merge runs, but `sodiumChanged` stays false, the dedup never fires, and both keys are spread verbatim into `mergedMicros`. The patch then carries `micros: { sodium: 500, sodium_mg: 999, ... }`.

Downstream consumer `lib/dashboard/aggregate.ts:430-440`:

```ts
const canonical = canonicalizeMicroKey(rawKey);
const displayKey = canonical !== undefined
  ? canonicalCodeToDisplayName(canonical)
  : canonicalCodeToDisplayName(rawKey);
totals.set(displayKey, (totals.get(displayKey) ?? 0) + value);
```

Both `sodium` and `sodium_mg` canonicalize to the same displayKey `"Sodium"`. The `+ value` loop sums BOTH, so a single drifted row reports 1499mg instead of 500mg in dashboard totals — and the contributions array gets two duplicate rows for the same item, double-counting in `pctOfTotal` too. Symmetry rule violation: the R1-C1 fix made the merge step CONVERGE to canonical on save, but only under one condition. The fix made the invariant conditional, which is exactly what the lessons-learned context calls out.

## Convergence guarantee
The fix makes canonical-wins / legacy-delete an **INVARIANT** of the micros merge — not a conditional. Every time `buildFieldsPatch` produces a `mergedMicros` object, the dedup runs unconditionally before sodium is overlaid. Result: any patch the hook emits cannot contain both `sodium` AND `sodium_mg` for the same row, regardless of which field the user edited. Drifted rows self-heal on the first save of any nutrition field. Clean rows pass through unchanged (single-key inputs hit a no-op fast path).

## Proposed Change (Diff Outline)

### File 1: `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`

Extract the dedup logic into a small inline helper that runs unconditionally on `mergedMicros`. Replace lines 222-250 with:

```ts
if (anyNutritionChanged) {
  const initMicrosRecord = initMicros as Record<string, unknown>;
  const mergedMicros: Record<string, number> = { ...(initMicros as Record<string, number>) };

  // INVARIANT (Codex Round 2 LM-I2 fix): canonical/legacy dedup runs on
  // EVERY save, not just sodium edits. Drifted rows containing both
  // `sodium` and `sodium_mg` would otherwise double-count in
  // aggregateMicros when an unrelated field (protein, kcal, etc.) is
  // edited. The merge step is the encoding boundary — converge here.
  const hasCanonical =
    typeof initMicrosRecord.sodium === 'number' && Number.isFinite(initMicrosRecord.sodium);
  const hasLegacy =
    typeof initMicrosRecord.sodium_mg === 'number' &&
    Number.isFinite(initMicrosRecord.sodium_mg);

  if (sodiumChanged && sodium !== undefined && sodium !== null) {
    // User-edited sodium: write to whichever key the row used; delete the
    // legacy duplicate if both existed.
    if (hasLegacy && !hasCanonical) {
      mergedMicros.sodium_mg = sodium;
    } else {
      mergedMicros.sodium = sodium;
      if (hasLegacy) delete mergedMicros.sodium_mg;
    }
  } else if (hasCanonical && hasLegacy) {
    // Sodium NOT edited but drift exists: canonical wins, drop the legacy
    // duplicate so the patch the row converges to canonical on save.
    delete mergedMicros.sodium_mg;
  }
  // (No-op fast path: canonical-only OR legacy-only OR neither → spread
  //  preserved verbatim, no dedup needed.)

  fields.nutrition = { ... };  // (unchanged below)
}
```

Key properties:
- Behavior when `sodiumChanged=true`: **identical to current code** — same canonical-wins / legacy-delete logic.
- Behavior when `sodiumChanged=false`:
  - drift (both keys present) → drop `sodium_mg`, keep `sodium` (the value from the spread)
  - canonical-only → no-op (already canonical)
  - legacy-only → no-op (single key, no double-count risk; honor R1-C1 "preserve legacy shape" for legacy-only rows)
  - neither → no-op
- TS types: no new types needed. The narrowing already exists.

### File 2: `tests/unit/library/food-detail-edit-validation.test.ts`

Add a new `describe('buildFieldsPatch — canonical/legacy sodium dedup', ...)` block with the four tests below. Place after the existing 'preserves untouched macros and micros' test (line 170).

## TDD Required
**yes** — pure logic change with a clear observable contract (patch shape). Red-Green-Refactor.

## Test Approach

Four tests, all calling `__internals.buildFieldsPatch(item, draft)` and asserting on `patch.nutrition.micros`:

1. **Drift + unrelated edit emits only canonical sodium** (the regression test that proves the fix)
   - Setup: `item.nutrition.micros = { sodium: 500, sodium_mg: 999, iron_mg: 2.3 }`
   - Draft: same as item, except `protein_g: '42'` (was 28)
   - Assert: `patch.nutrition.micros.sodium === 500`
   - Assert: `'sodium_mg' in patch.nutrition.micros === false`
   - Assert: `patch.nutrition.micros.iron_mg === 2.3` (unrelated micro survives)

2. **Drift + sodium edit: canonical wins, legacy deleted** (the existing R1-C1 happy path — make sure we didn't regress it)
   - Setup: `micros = { sodium: 500, sodium_mg: 999 }`
   - Draft: `sodium_mg: '750'` (user-typed new sodium)
   - Assert: `patch.nutrition.micros.sodium === 750`
   - Assert: `'sodium_mg' in patch.nutrition.micros === false`

3. **Clean canonical input + unrelated edit: unchanged** (no-op path)
   - Setup: `micros = { sodium: 500 }`
   - Draft: `protein_g: '42'`
   - Assert: `patch.nutrition.micros.sodium === 500`
   - Assert: `'sodium_mg' in patch.nutrition.micros === false`

4. **Clean legacy input + unrelated edit: legacy preserved** (honors R1-C1's "legacy-only rows keep legacy shape" decision)
   - Setup: `micros = { sodium_mg: 500 }`
   - Draft: `protein_g: '42'`
   - Assert: `patch.nutrition.micros.sodium_mg === 500`
   - Assert: `'sodium' in patch.nutrition.micros === false`

**Rationale for test 4's preserve-legacy decision:** R1-C1 (committed) explicitly chose legacy-only → keep legacy. Forcing migration when sodium is *unchanged* and the user is editing an unrelated field would be a behavior expansion beyond LM-I2's scope (which is only about removing the double-count). Migration on sodium edit still works (test 2). Migration on no-op edit is out of scope. This matches existing intent and avoids a silent schema rewrite the user didn't trigger.

## Regression sweep
- `tests/unit/library/food-detail-edit-validation.test.ts` — full `buildFieldsPatch` describe (especially "preserves untouched macros and micros" at line 116, which already proves canonical-only + protein-edit doesn't strip canonical sodium; the fix must not regress this).
- `tests/unit/library/food-detail-edit-cholesterol-absence.test.ts` — sibling resolver tests; no overlap expected but run for safety.
- `tests/unit/lib/dashboard/aggregate-micros-aliases.test.ts` — confirms `sodium` + `sodium_mg` both canonicalize to the same displayKey. This is the consumer side of the bug — current tests verify the SUM behavior (which is what causes the double-count). No assertion changes needed, but the test confirms the fix is necessary at the producer (merge) layer, not the aggregator.
- `tests/unit/lib/dashboard/aggregate-micros-contributions.test.ts` — sodium contribution rows. Confirms downstream contract; no change.
- `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` — integration coverage for sodium drift in the UI; should pass unchanged.

## Open question for the user

**Migration policy for legacy-only rows when sodium is unchanged.** Test 4 proposes preserving the legacy `sodium_mg` shape because R1-C1 already committed to that choice. The alternative would be: every save migrates legacy-only rows to canonical, accelerating codebase convergence. I recommend keeping the current preserve-legacy behavior because (a) it matches the committed R1-C1 intent, (b) it keeps the LM-I2 fix surgical (only removes double-count, doesn't change shape decisions), and (c) every sodium-edit save already migrates per test 2. If you want aggressive migration, that's a separate one-line change (`else if (hasLegacy && !hasCanonical) { mergedMicros.sodium = mergedMicros.sodium_mg; delete mergedMicros.sodium_mg; }`) — flag and I'll add it.

## Stop-the-world flags
**None triggered.**
- Merge logic structure is exactly as the description suggests — a single guarded block at lines 233-249 with a clean spread above it. Extracting the canonical-wins check outside the `sodiumChanged` guard is a low-risk refactor.
- No existing test asserts the current `sodiumChanged`-conditional behavior as intentional. The closest test (line 116, "preserves untouched macros and micros") uses legacy-only sodium input and verifies the legacy key survives a single-macro edit — that case is preserved by the no-op fast path in the fix. No test exercises the drifted-both-keys input shape, so there's no contract to break, only a missing one to add.
