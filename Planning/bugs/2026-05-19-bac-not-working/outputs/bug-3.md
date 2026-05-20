# Bug 3 — Implementation Output

## Files Touched

- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\alcohol\bac.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\alcohol\bac.test.ts`

## Tests Added/Modified

Added 3 new tests to `tests/unit/lib/alcohol/bac.test.ts`:

1. `yesterday plus recent drink: old drink fully metabolized, new drink contributes positively (Bug 3 regression)` — proves the production bug: drink at T-14h + drink at T-1h, old code returned 0, new code returns 0.0144. The regression assertion is `bac > 0`; precise assertion is `toBeCloseTo(0.0144, 4)`.
2. `old drink fully metabolized hours ago: recent drink still partially absorbs (Bug 3 regression)` — drink at T-8h (25g) + drink at T-10min (14g, asOf mid-absorption). Old code returned 0, new code returns 0.0073. Asserts `bac > 0` and `toBeCloseTo(0.0073, 4)`.
3. `three drinks across an evening: peak then decay tracked per segment (Bug 3 regression)` — drinks at 19:00/20:00/21:00, asOf 22:00. New code returns 0.0432 (correct per piecewise integration); old code coincidentally returns ~0.0507 (over-reports). Asserts `bac > 0` and `toBeCloseTo(0.0432, 4)`.

Each test includes a per-segment math derivation in code comments.

**Externally modified during implementation:** The existing test on line 68 of `bac.test.ts` (`applies elimination once to the total BAC for multiple simultaneous drinks`) was updated by the user/linter mid-run, changing the constant `- 0.015` to `- 0.0075` to match the new piecewise-integration semantics. Per system reminder this edit was intentional and is preserved. The constant `0.0075 = 0.5h × 0.015` accounts for the shared elimination during the 0.5h post-absorption window that two-independent-drinks would each suffer separately but the combined integration only applies once.

## Test Run Result

| Command | Result |
|---|---|
| `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/alcohol/bac.test.ts` (post-fix) | 9 passed, 0 failed, 0 skipped |
| `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/alcohol/` | 9 passed, 0 failed (1 file) |
| `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/dashboard/aggregate-day-tz.test.ts` | 11 passed, 0 failed (1 file) |
| `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/dashboard/` | 120 passed, 0 failed (14 files) |
| `pnpm typecheck` | clean (no errors) |

## Step 1 RED verification

Before the fix, the 3 new tests failed exactly as expected (proving the production bug):

```
 FAIL  tests/unit/lib/alcohol/bac.test.ts > calculateBac > yesterday plus recent drink: old drink fully metabolized, new drink contributes positively (Bug 3 regression)
AssertionError: expected 0 to be greater than 0
  expect(bac).toBeGreaterThan(0);
              ^

 FAIL  tests/unit/lib/alcohol/bac.test.ts > calculateBac > old drink fully metabolized hours ago: recent drink still partially absorbs (Bug 3 regression)
AssertionError: expected 0 to be greater than 0
  expect(bac).toBeGreaterThan(0);
              ^

 FAIL  tests/unit/lib/alcohol/bac.test.ts > calculateBac > three drinks across an evening: peak then decay tracked per segment (Bug 3 regression)
AssertionError: expected 0.0507 to be close to 0.0432, received difference is 0.0075
  expect(bac).toBeCloseTo(0.0432, 4);
              ^

Test Files  1 failed (1)
Tests       3 failed | 6 passed (9)
```

- Tests A and B: `0 > 0` is false → **proves the staggered-drinks bug** (pooled elimination wipes the recent drink entirely when an old drink exists in the 72h window).
- Test C: current code returns 0.0507 instead of 0.0432 → proves the old code OVER-reports BAC for 3 staggered drinks (3 drinks each fully absorbed = 0.088 absorbed; only 2.5h × 0.015 = 0.0375 elimination clock from earliest+30min, yielding 0.0507, instead of the correct per-segment 0.0432).

## Step 2 GREEN verification

After implementing the piecewise integration in `lib/alcohol/bac.ts` per the proposal's diff outline, all 9 tests pass:

```
 RUN  v4.1.4 C:/Users/tamas/Documents/AI projects/Calorie tracker webapp

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  12:25:30
   Duration  698ms
```

Worked verification (Test A): D1 absorbs to 0.021912 then 12.5h elimination clamps to 0; D2 absorbs to 0.021912 then 0.5h × -0.015 = 0.014412. ✓

Worked verification (simultaneous-drinks existing test): two drinks at 10:30, asOf 12:00 → 0.5h × 0.102647 = 0.051324 absorbed-with-elim; then 1h × -0.015 = 0.036324 remaining. `fullyAbsorbedOneDrink` (drink at 11:30) = 0.021912; `fullyAbsorbedOneDrink * 2 = 0.043824`; diff = 0.0075. ✓ matches the updated test constant.

## Step 3 Regression sweep result

```
tests/unit/lib/alcohol/             1 file  / 9 tests passed
tests/unit/lib/dashboard/           14 files / 120 tests passed
tests/unit/lib/dashboard/aggregate-day-tz.test.ts (specifically, snap.bac.value > 0)  passed
```

Dashboard `snap.bac.value > 0` assertion intact: single 14.005g drink at 23:45 + asOf 00:15 (30 min later) integrates to 0.5h × 0.043824 = 0.021912 > 0. ✓

## Step 4 Typecheck result

```
> kalori@0.1.0 typecheck C:\Users\tamas\Documents\AI projects\Calorie tracker webapp
> tsc --noEmit

(clean — no errors, no warnings)
```

## Deviations from Proposal

**None.** Implementation is verbatim per the proposal's Diff Outline. The only nuance: during initial GREEN, the existing simultaneous-drinks test (line 68) initially failed under the new semantics (expected `fullyAbsorbedOneDrink * 2 - 0.015`, actual was `- 0.0075`). The user/linter updated the constant from `0.015` to `0.0075` to match the correct new semantics (the integration applies shared elimination over both drinks during the post-absorption phase, reducing the combined-vs-independent gap to 0.0075). This was an intentional external edit (per system reminder) and reflects the medically correct interpretation: the body has ONE elimination rate, applied during AND after absorption — the old test was encoding the buggy "no elimination during absorption" semantics.

The proposal's worked example in §"Why this preserves existing tests" was slightly inconsistent with its own diff math (it suggested elimination would not apply during absorption, but the diff code clearly applies `-ELIMINATION_BAC_PER_HOUR` throughout). The diff math (and the user's test-constant correction) are both internally consistent and medically defensible.

## Status

implemented
