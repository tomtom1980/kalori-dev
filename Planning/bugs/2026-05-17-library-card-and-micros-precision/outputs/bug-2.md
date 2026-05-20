# Bug 2 — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\foodDetail.format.ts`
  — extended `formatMilligrams` from a single `Math.round` branch into a 4-tier precision rule:
    - `value === 0`         → `"0"`
    - `0 < value < 0.05`    → `value.toFixed(2)`  (e.g. `0.04` → `"0.04"`)
    - `0.05 <= value < 1`   → `value.toFixed(1)`  (e.g. `0.3` → `"0.3"`, `0.95` → `"0.9"`)
    - `value >= 1`          → `String(Math.round(value))`  (preserves existing `140.7` → `"141"`)
    - null / undefined / non-finite (NaN, ±Infinity) → `"—"`  (preserved + extended)
  — added inline comment block citing the bugfix batch ID + behavioural rationale.

## Tests Added

In `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\library\food-detail-format.test.ts`:

1. `formatMilligrams > rounds to integer for values >= 1` — renamed for clarity, asserts `140.7 → "141"` (preserves existing assertion).
2. `formatMilligrams > em-dash for null` (preserved verbatim).
3. `formatMilligrams > em-dash for undefined and non-finite` — NEW; covers `undefined`, `NaN`, `Number.POSITIVE_INFINITY`.
4. `formatMilligrams precision tiers (Bug 2 fix) > returns "0" for exactly zero` — NEW.
5. `formatMilligrams precision tiers (Bug 2 fix) > returns 2 decimals for values 0 < v < 0.05` — NEW; asserts `0.01 → "0.01"`, `0.04 → "0.04"`.
6. `formatMilligrams precision tiers (Bug 2 fix) > returns 1 decimal for values 0.05 <= v < 1` — NEW; asserts `0.05 → "0.1"` (toFixed rounding), `0.3 → "0.3"`, `0.5 → "0.5"`, `0.95 → "0.9"` (banker's rounding on IEEE-754 representation).
7. `formatMilligrams precision tiers (Bug 2 fix) > returns integer (no decimals) for values >= 1` — NEW; asserts `1 → "1"`, `1.5 → "2"`, `18 → "18"`, `120 → "120"`.

In `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx`:

8. `<FoodDetailMacros /> — Bug 2 micros precision display > iron_mg = 0.3 renders "0.3 mg" with "· 2% DV" suffix (not the pre-fix "0 mg")` — NEW component-level test. Fixture: `{ sodium_mg: 800, iron_mg: 0.3 }`. Asserts the iron meter row shows exactly `"0.3 mg"` and the `food-detail-micro-dv-iron_mg` testid contains `"2% DV"`. Also asserts the pre-fix `"0 mg"` does NOT appear on that row (regression guard).
9. `<FoodDetailMacros /> — Bug 2 micros precision display > bare canonical mcg micro (vitamin_d = 0.2) renders "0.2 mcg" (sub-1 mcg, 1-decimal tier)` — NEW. Proves the precision tier applies UNIFORMLY across mg AND mcg (same `formatMilligrams` formatter handles both per `FoodDetailMacros.tsx:561+563`).

Test fixtures chosen so each row CLEARS the `<1% RDA` filter (`sortAndFilterMicrosByRdaPct`):

- iron: 0.3 / 18 mg = 1.67% → "2%" (clears 1% threshold)
- vitamin_d: 0.2 / 20 mcg = 1% (clears 1% threshold)

Using sodium (RDA 2300 mg) at 0.3 mg would have dropped the row out via the filter, masking the bug.

## Tests Modified

- `tests/unit/library/food-detail-format.test.ts > formatMilligrams > rounds to integer` — renamed describe-block item to "rounds to integer for values >= 1" to disambiguate from the new sub-1 tiers. Assertion unchanged (`140.7 → "141"`).

No existing test characterized the pre-fix `0.3 → "0"` behaviour, so no behaviour-rewrite was needed. The proposal's stop-the-world condition ("existing tests assert '0' output for sub-1 values") was NOT triggered.

## Test Run Result

| Scope | Files | Tests | Status |
|---|---|---|---|
| `tests/unit/library/food-detail-format.test.ts` | 1 | 19 passed | GREEN |
| `tests/components/library/FoodDetailMacros.test.tsx` | 1 | 46 passed | GREEN |
| `tests/components/library/` (full library suite) | 29 | 219 passed | GREEN |
| `tests/unit/components/MicroBreakdownDialog.test.tsx` + 2 sibling `MicrosOverflowToggle` files | 3 | 17 passed | GREEN |
| `tests/unit/components/dashboard/MicronutrientPanel.rda-unknown.test.tsx` | 1 | 7 passed | GREEN |

Pre-fix RED run (initial vitest run with broad path match) caught the new precision-tier tests failing as expected:

```
FAIL  > formatMilligrams precision tiers (Bug 2 fix) > returns 2 decimals for values 0 < v < 0.05
AssertionError: expected '0' to be '0.01'
```

Post-fix re-run: all green in 725 ms (unit) + 1.94 s (component).

## Typecheck / Lint

- `pnpm typecheck` (`tsc --noEmit`): clean, no errors.
- `pnpm lint` on touched paths: 0 errors / 0 warnings on `foodDetail.format.ts`, `food-detail-format.test.ts`, `FoodDetailMacros.test.tsx`. (36 unrelated pre-existing `_unused-var` warnings in other test files — not touched by this batch.)

## Deviations from Proposal

None. The 4-tier precision rule from the proposal was implemented verbatim. The `0.95` edge-case test verified the documented behaviour: `(0.95).toFixed(1) === "0.9"` (banker's rounding on IEEE-754 representation), NOT `"1.0"`. The proposal anticipated both outcomes; the test pins the actual JS behaviour.

## Status

implemented

## Notes for Codex Review

- **`0.95` rounding edge.** `(0.95).toFixed(1)` yields `"0.9"` (not `"1.0"`) because the IEEE-754 representation of 0.95 is slightly below 0.95, and `toFixed` performs banker's rounding on the binary value. Test pins this behaviour. Same applies to `0.05 → "0.1"` (rounds up) vs `0.15 → "0.1"` (rounds down, NOT shown in tests but worth noting). User-visible impact: monotonic — never produces "0.0" for nonzero values, never inflates trace amounts. Acceptable.
- **`MicroBreakdownDialog.formatAmount` was NOT unified** with `formatMilligrams`. Reasons: (1) different surfaces (dashboard breakdown dialog vs library detail), (2) `formatAmount` operates on values that are already aggregated per-meal in mg OR mcg without unit normalisation — keeping it separate preserves the `Number.isInteger ? String : toFixed(1)` rule it ships today; (3) my `formatMilligrams` adds a sub-0.05 tier `formatAmount` lacks (would yield `"0.0"` for `0.04` under the old rule). The two formatters now BOTH handle sub-1 values, but my rule is strictly more precision-preserving. If Codex flags this as inconsistency, the unified rule should be the 4-tier one (extract into `lib/nutrition/formatters.ts` and have both call sites consume it). Left separate this round to keep the surgical-changes principle.
- **Cholesterol macro row (`FoodDetailMacros.tsx:482-483`)** — proposal explicitly DEFERRED this. The cholesterol display uses `String(Math.round(value))` directly inline (not via `formatMilligrams`), so my fix does NOT touch it. Sibling instance flagged for follow-up per proposal; cholesterol's real-world values are 0-300 mg where sub-1 mg is degenerate, so user-visible impact is minimal. STILL FLAGGED — Codex may want to extend the precision rule there if defensive consistency is preferred over "leave un-broken display alone".
- **mcg unit branch reuses the same formatter** (`FoodDetailMacros.tsx:563`). The proposal's risk note is correct: a `0.3 mcg` vitamin row now renders `"0.3 mcg"` instead of `"0 mcg"`. Test case 9 covers this. No additional surface needs the change.
- **Visual baseline drift expected** if any Playwright spec captures FoodDetail with sub-1 mg/mcg fixtures. Quick grep of test fixtures showed only `FoodDetailMacros.test.tsx` uses such values (the file I just edited); none of `tests/e2e/library/*.spec.ts` has explicit sub-1 fixtures. Phase 7 visual regression should still be re-baselined out of caution per proposal §UI Touching.
- **Sibling cholesterol bug status: STILL FLAGGED as follow-up.** Did not auto-fix per proposal directive.
- **Render-path bypass.** No code path in `FoodDetailMacros.tsx` inlines `String(Math.round(value))` for micros — all routes go through `formatMilligrams` per the proposal's component-level test rationale ("Codex's find-the-other-N pattern"). The component-level test guards against future regression.
