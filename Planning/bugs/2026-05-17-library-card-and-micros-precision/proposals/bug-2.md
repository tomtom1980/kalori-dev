# Bug 2: Micronutrient amount shows "0 mg" alongside non-zero %RDA — display precision mismatch

## Classification
known_fix

## Root Cause
`formatMilligrams` (`app/(app)/library/_components/FoodDetail/foodDetail.format.ts:29-33`) returns `String(Math.round(value))`, collapsing any sub-1 value to `"0"`. The sibling `%DV` helper `formatMicroPercent` (`lib/nutrition/display-micros.ts:35-39`) computes `Math.round((value / rda) * 100)` from the **unrounded** source, so a row with 0.3 mg @ 18 mg RDA renders as `"0 mg · 2% DV"` — a self-inconsistent pair where the percent claims contribution but the amount denies it. The asymmetry is preexisting (Task 4.2, 2026-04-24); the prior batch's `<1% RDA` filter (commit `61b9216`) made it user-visible by surfacing low-but-nonzero rows that previously hid under the implicit `consumed === 0` gate. The dashboard breakdown dialog's own `formatAmount` (`components/dashboard/MicroBreakdownDialog.tsx:46-48`) already handles this correctly with `Number.isInteger(value) ? String(value) : value.toFixed(1)` — that's the canonical pattern to mirror.

## Proposed Change (Diff Outline)
1. **`app/(app)/library/_components/FoodDetail/foodDetail.format.ts::formatMilligrams`** — extend the integer-rounding branch with a sub-1 precision tier:
   - `value === 0` → `"0"` (preserve)
   - `value >= 1` → `String(Math.round(value))` (preserve — existing integer rule)
   - `0.05 <= value < 1` → `value.toFixed(1)` (NEW — surfaces `"0.3"`, `"0.5"`, etc.)
   - `0 < value < 0.05` → `value.toFixed(2)` (NEW — keeps trace amounts honest without showing `"0.0"`)
   - null / undefined / non-finite → `"—"` (preserve)
2. **`tests/unit/library/food-detail-format.test.ts`** — add RED-first tests for the 4 new threshold cases (see Test Approach).
3. **`tests/unit/library/food-detail-macros.test.tsx`** (or whichever spec covers `MicrosReadOnly`) — add 1 component-level RED test asserting that a 0.3 mg sodium row renders `"0.3 mg"` AND the `2%` DV badge, NOT `"0 mg"`. If no such spec exists, append the assertion to the closest existing MicrosReadOnly test file rather than introducing a new file.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\foodDetail.format.ts` (modify `formatMilligrams`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\library\food-detail-format.test.ts` (extend — keep existing `140.7 → "141"` + null cases; add 4 new RED cases)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\library\food-detail-macros.test.tsx` (extend if it exists; otherwise the closest sibling spec — implementation sub-agent picks)

## TDD Required
**Yes** — display logic. RED-first per `~/.claude/rules/testing.md`.

## Test Approach
Unit-level RED tests on `formatMilligrams`:
1. `formatMilligrams(0)` → `"0"` (preserves zero exact)
2. `formatMilligrams(0.3)` → `"0.3"` (NEW — primary bug case)
3. `formatMilligrams(0.5)` → `"0.5"` (NEW — boundary)
4. `formatMilligrams(0.04)` → `"0.04"` (NEW — sub-0.05 falls into 2-decimal tier)
5. `formatMilligrams(0.05)` → `"0.1"` (NEW — rounding boundary, 1-decimal tier)
6. `formatMilligrams(0.95)` → `"1.0"` or `"0.9"` — verify the existing toFixed(1) behavior; implementation sub-agent decides whether 0.95 rounds into the integer branch via `Math.round` (would give 1) or stays in the 1-decimal branch (would give "1.0"). Either is defensible; I lean toward staying in the 1-decimal branch (`< 1` check, not `<= 1` — so 0.95 → "0.9" or "1.0" depending on Number#toFixed semantics). Verify both behaviors in the test, pick one, document.
7. `formatMilligrams(1)` → `"1"` (preserve)
8. `formatMilligrams(140.7)` → `"141"` (preserve — existing test)
9. `formatMilligrams(null)` → `"—"` (preserve)
10. `formatMilligrams(Number.NaN)` → `"—"` (preserve — extend existing null guard test)

Component-level RED test on the `MicrosReadOnly` render path:
- Render a `FoodDetail` (or directly `MicrosReadOnly`) with `sodiumMg = 0.3` and a stub `sodiumRda = 18`.
- Assert DOM matches `/0\.3 mg/` (not `/0 mg/`).
- Assert the `2%` DV badge still renders alongside.

The component test guards against a future regression where `formatMilligrams` is bypassed in the render path (e.g., someone inlines `String(Math.round(value))` again — Codex's "find-the-other-N" pattern per the 2026-05-17 ladder-audit lesson).

## Risk Assessment
**Low.** Pure display-formatter change with these properties:
- No data-shape change, no DB schema touch, no API contract change
- No bound-clamp / safety guard issue (this is widening precision, not narrowing it)
- Idempotent — same inputs that previously rendered `"0"`, `"1"`, `"141"` continue to render exactly those (value ≥ 1 unchanged; value === 0 unchanged)
- Only behavior change is on the previously-collapsed range `0 < value < 1` — those rows are net NEW (user-visible only since the prior batch's <1% filter exposed them)

The formatter is shared with `mcg` rendering in `MicrosReadOnly` (line 562-563 of `FoodDetailMacros.tsx` reuses `formatMilligrams` for `mcg` rows) and the standalone sodium block (line 640 of same file). The threshold proposal works UNIFORMLY for both units because the formatter operates on the numeric value already-converted to the display unit — a `0.3 mcg` vitamin row would render `"0.3 mcg"` exactly as desired. Cross-unit conversion (`mcg → mg`) is NOT this formatter's responsibility; it receives the pre-converted display number.

## Regression Sweep Needed
- **Existing `formatMilligrams` unit tests** — extend, don't replace (the two existing cases: `140.7 → "141"` + `null → "—"` survive the new logic)
- **`MicrosReadOnly` component tests** — re-run; visual snapshot may drift IF the test fixtures contain any sub-1 mg value (sub-agent should grep test fixtures for `< 1` mg micro values before declaring sweep clean)
- **Cholesterol macro row** (`FoodDetailMacros.tsx:482-483`) is a SIBLING instance of the same pattern (`String(Math.round(value))` + `Math.round(value / DV * 100)`) — flag but DO NOT auto-fix this round. Reason: real-world cholesterol values are 0–300 mg, sub-1 mg is degenerate; the user's report explicitly named "micronutrients", not macros. Note for follow-up in `Planning/followups.md` if any sub-agent wants to revisit. The `Math.round(value)` for cholesterol DV percent shows `0%` for values <0.5 mg DV (1 mg DV ≈ 0.33% of 300 mg target), which is acceptable display behavior for a macro.
- **No other `formatMilligrams` callers exist** outside `FoodDetailMacros.tsx` (3 call sites: line 561, 563, 640 — all in the library detail surface). Grep confirmed.
- **Visual regression** — Phase 7 SHOULD re-capture the FoodDetail view-mode baseline if any Playwright spec captures it with populated low-mg micros. Sub-agent to check `tests/e2e/visual-baselines/` and `tests/e2e/library/*.spec.ts` for fixtures containing sodium < 1 mg or any micro < 1 mg.

## UI Touching
**True** — visual baseline drifts on any FoodDetail snapshot that includes a sub-1 mg micro row. Phase 7 (visual regression) MUST run if the batch decision is "UI-touching". Confidence the visual change is desirable: high — the entire point of the fix is to make the numeric column match the percent column. Baseline update is the goal.

## Predecessor batch overlap
None directly. My prior batch (commit `61b9216`, batch `bugfix-tomi-2026-05-17-library-micros`) introduced the `pct >= 1%` filter via `sortAndFilterMicrosByRdaPct`, which made this bug user-visible by surfacing the previously-hidden `consumed > 0 && pct < 1` rows. The bug itself dates to Task 4.2 (2026-04-24, commit history before this batch). Fix is scoped to a single formatter; existing `display-micros.ts` tests should not break because they test the percent helper, not the amount formatter.

## Open Questions
**None** per standing approval. The 4-tier threshold (0 / >=0.05 / >=1) is the conservative default that mirrors `MicroBreakdownDialog.formatAmount` (1-decimal for non-integer) while adding a sub-0.05 safety tier to avoid the `"0.0 mg @ 2% DV"` regression where 1-decimal rounding ALSO collapses to zero for very small values. If the user prefers a 2-tier rule (`< 1` → `toFixed(1)` only, accepting `"0.0 mg"` for trace amounts under 0.05), the implementation sub-agent can simplify — but the 4-tier default is what I propose.
