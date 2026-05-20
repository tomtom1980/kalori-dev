# Bug 1 — Implementation Output

## Files Touched (absolute paths)

**Production code:**
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\nutrition\display-micros.ts` — added `DisplayMicroRow`, `SortAndFilterMicrosOptions`, `sortAndFilterMicrosByRdaPct<T>()` exports.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\aggregate.ts` — Surface A refactor; `aggregateMicros` now delegates sort + filter to the shared helper with `{ minPct: 1, includeUnknownRda: false }` (orphan RDA-unknown rows still drop — preserves identical behaviour to the pre-batch dashboard).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx` — Surface B; `ConfirmationItemMicros` now sorts the 30 canonical inputs by current %RDA desc via the shared helper with `{ minPct: 0, includeUnknownRda: true }` (no filter — editable inputs at 0% remain reachable).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx` — Surface C universal rule; removed the `defaultRows` always-visible carve-out (sugar + sodium) AND the `ALREADY_VISIBLE` hardcoded set; unified all rows into a single sorted list via the shared helper with default options. The Collapsible UX is preserved: top row visible by default, tail under the toggle. Removed the now-unused `sortMicrosByPriority` import.

**Tests added (NEW files):**
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\nutrition\display-micros.sort-filter.test.ts` — 13 helper unit tests (empty input, RDA-having filter / sort, RDA-unknown end placement + alpha tie-break, minPct=0 disables filter, minPct=5 boundary, mixed-input ordering, caller-field preservation, includeUnknownRda=false drop, stable-sort ties).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationItemMicros.sort.test.tsx` — 3 Surface B tests (sort desc by pct order, all 30 inputs still rendered after no-filter rule, edit-dispatch round-trip after re-sort).

**Tests modified / rewritten:**
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx` —
  - REWROTE `zero-value canonical micro (vitamin_c = 0) ... silently dropped` to assert universal `<1%` filter drops the row (no longer relies on a `click` of a removed trigger).
  - REWROTE Codex R1 C1 `extras loop excludes canonical sodium` → now `canonical sodium appears exactly ONCE (head or collapsible) — never double-rendered` since sodium is no longer pinned to head; canonical-dedup contract is the binding assertion.
  - REWROTE LM-I1 `extras loop: display-name Sodium does NOT appear inside the collapsible extras` → mirror of the Codex R1 C1 rewrite for the display-name shape.
  - ADDED new `describe('<FoodDetailMacros /> — Bug 1 universal cross-surface display rule')` block with 5 tests:
    - RDA-having rows render in DESC pct order across head + collapsible.
    - sodium <1% (10 mg → 0% rounded) is HIDDEN — empty-state branch fires.
    - sugar (RDA-unknown) is STILL shown even at low values — surfaces in the collapsible (RDA-unknown sorts to end of list); no DV suffix.
    - sodium >=1% (800 mg → 35%) is sorted into its pct-position (head when top).
    - empty micros + no sugar → `food-detail-no-micros` empty-state.

## Test Run Result

Per-area sweep — all GREEN:
- `tests/unit/lib/nutrition/display-micros.sort-filter.test.ts` — 13/13 pass.
- `tests/unit/lib/dashboard/` (5 files) — 113/113 pass (existing canonical / aliases / contributions / TZ / cholesterol regression tests). No behavioural drift on Surface A.
- `tests/components/dashboard/`, `tests/unit/components/dashboard/`, `tests/unit/components/MicrosOverflowToggle*` — 127/127 pass. Dashboard panel + overflow toggle behaviour unchanged.
- `tests/components/library/FoodDetailMacros.test.tsx` — 44/44 pass (was 39 → now 44 with the 5 new universal-rule tests).
- `tests/components/library/` (all 27 files) — full pass.
- `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` — 3/3 pass.
- `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx` — 8/8 pass (existing micros expand + LM-SEC-1 input cap tests still GREEN).
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` — full pass.
- `tests/unit/foodDetail/` — full pass.

Aggregate batched run on every touched area: **369 / 369 tests pass.**

Full repo sweep observation: 6 pre-existing failures in OTHER files unrelated to this batch (concurrent-session WIP in `tests/unit/library/food-detail-edit-validation.test.ts` + a `:focus-visible` integration test against `app/globals.css`). These were NOT introduced by Bug 1 — see Predecessor Batch Overlap section.

## Typecheck / Lint

- `pnpm typecheck` — CLEAN (no errors anywhere in the project).
- `pnpm eslint <touched files>` — CLEAN on all Bug 1 files except a pre-existing `'micros7d' is assigned a value but never used` warning in `aggregate.ts::aggregateDay` (parameter destructure left over from the dashboard's 7-day-window history; not introduced by my batch and out of scope).

## Behavioral Changes (per surface)

- **Surface A (Dashboard `<MicronutrientPanel />`):** BEHAVIOUR UNCHANGED. The shared helper produces a byte-identical row set to the inline sort+filter it replaced. Sub-1% RDA rows still drop; RDA-unknown orphan rows still drop (helper called with `{ minPct: 1, includeUnknownRda: false }` — the historical dashboard policy). 113 dashboard tests pass unmodified.

- **Surface B (Confirmation `<ConfirmationItemMicros />` library-only):** NEW SORT BEHAVIOUR. Inputs are now sorted by current %RDA descending (the user explicitly clarified the rule applies to add/edit surfaces too). No filter — every canonical micro still renders so the user can edit any of the 30. Tie-break: input order from `DEFAULT_MICROS_LIST` (stable sort across pct=0 zero-value inputs).

- **Surface C (Library `<MicrosReadOnly />` view-mode):** UNIVERSAL RULE APPLIED. The previously hardcoded always-visible block (sugar + sodium) is gone — every row flows through the cross-surface rule. Notable changes:
  - Sodium with `<1%` of RDA is HIDDEN (e.g. 10 mg / 2300 = 0% rounded). Pre-Bug-1 always-visible carve-out removed per user clarification.
  - Sodium with `>=1%` of RDA sorts into its pct-position — typically still head (35% at typical 800 mg) but can drop into the collapsible if another micro tops it.
  - Sugar (no canonical RDA → `pct=null` → RDA-unknown branch) is STILL VISIBLE at the END of the sorted list per the user's clarification "RDA-unknown nutrients (e.g. sugar) ALWAYS SHOW, sorted to the END". Renders without a DV suffix or meter role (unchanged from today's sugar row).
  - Top row "default visible" + tail under Collapsible UX is preserved.
  - Canonical-dedup contract preserved (sodium present in `sodium` + `sodium_mg` + `Sodium` shapes still renders exactly once).

## Deviations from Proposal

- Proposal said "sugar gets DROPPED from view-mode" (literal interpretation, STOP-THE-WORLD #1). **User clarified at Phase 2 approval gate that RDA-unknown rows (sugar) ALWAYS SHOW** — the helper's `includeUnknownRda: true` branch keeps them visible at the end of the list. Implementation matches the clarified rule, not the proposal's literal-but-user-corrected interpretation.
- Proposal recommended "tear down or restructure the Collapsible" (STOP-THE-WORLD #2). **Implementation keeps the Collapsible verbatim** with "top 1 row default-visible + tail under toggle" — the lightest-touch change that satisfies the rule and preserves the visual contract familiar to the user.
- Per the Phase 2 clarification, Surface A's helper call uses `includeUnknownRda: false` to keep its historical "RDA-unknown orphan rows drop" behaviour. Surface C's call uses `includeUnknownRda: true` (default) so sugar surfaces. Surface B's call uses `{ minPct: 0, includeUnknownRda: true }` so every input remains reachable for editing.

## Predecessor Batch Overlap

- Builds on LM-I1 (`e496627` — `resolveSodiumMg` via `canonicalizeMicroKey`): preserved verbatim. Sodium read-path canonical-wins precedence intact.
- Builds on LM-I2 (`42126c0` — `useFoodDetailEdit` canonical dedup): not touched by my batch (display-only).
- Builds on LM-SEC-1 (`d579fbe` — micros input upper bound): preserved verbatim. The `max="999999"` attribute + onChange clamp are untouched in Surface B.
- Pre-existing test failures observed during full-repo sweep:
  - `tests/unit/library/food-detail-edit-validation.test.ts` — 4 failures from CONCURRENT SESSION work on `useFoodDetailEdit.ts::buildFieldsPatch` (universal legacy-shape preservation). The test file is in the working tree as uncommitted changes from a sibling session; the impl widening is NOT yet committed. NOT my batch. Files modified by the concurrent session: `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`, `tests/unit/library/food-detail-edit-validation.test.ts`. NEW untracked file from the concurrent session: `tests/unit/library/food-detail-edit-validation-banner.test.tsx`.
  - `tests/integration/focus-ring-token.test.ts` — `app/globals.css` `:focus-visible` override using `var(--color-oxblood)`. Pre-existing per `git log` (`globals.css` last touched by `dda828e bottom-tab-bar`, not by my batch).
- Per lesson L17 (commit-fast-on-concurrent-sessions): Bug 1's tests + impl across 4 source files + 3 test files are tightly scoped to display-rule surfaces only. They do NOT overlap with the concurrent session's `useFoodDetailEdit` legacy-preservation work — different files, different concerns. Commit-and-push immediately at Phase 8 to lock the work into `origin/main` before any further stash cycles.

## Status

**implemented** — Phase 3 complete. All TDD red→green cycles closed. All affected-area tests GREEN. Typecheck clean. Lint clean on touched files (the `micros7d` warning is pre-existing).

## Notes for Codex Review

1. **Dual-write concerns:** The helper now governs THREE surfaces (dashboard / confirmation / library). Sync drift between them — if a caller misconfigures `minPct` or `includeUnknownRda` and the three surfaces stop agreeing on the universal rule — is a category of finding to flag. Each call site is now annotated with a comment explaining its option choices; Codex should verify those comments match the actual call options.
2. **RDA-unknown stable sort:** the helper uses `displayName.localeCompare(displayName)`. Verify this is the right sort key (NOT raw key, NOT canonical code) — the proposal said "alpha by display name" for predictability.
3. **Filter threshold strictness:** `pct >= minPct` (inclusive on the boundary). At `minPct: 1`, pct=1 survives, pct=0 drops. The unit test "1% boundary inclusive" (the test "RDA-having row with pct >= minPct (default 1) is included") pins this. Codex should verify this matches user intent (any "rounds-to-1%" behaviour acceptable — at sodium 10 mg / 2300 = 0.43% rounds to 0; at sodium 20 mg / 2300 = 0.87% rounds to 1 and SURVIVES because formatMicroPercent rounds half-up). This is per-formatMicroPercent existing semantics — not new behaviour introduced by Bug 1.
4. **Surface A's `includeUnknownRda: false`:** The dashboard historically drops RDA-unknown rows (orphan rows with `rda === null`). I encoded that by passing `__helperPct: r === null ? null : pct` into the helper and `includeUnknownRda: false` to drop them. Codex should verify this preserves the existing aggregate-micros-canonical "made_up_key" test (line 162 of that test file): it does — the test passes GREEN unmodified.
5. **Surface C empty-state branch:** when the universal rule drops every row (e.g. sodium=10 mg only), the `food-detail-no-micros` testid renders. Verify this matches the design — pre-Bug-1, sodium was always-visible so the empty state only fired for truly empty micros maps; post-Bug-1, the empty state can fire even when micros is non-empty (every row filtered).
6. **Concurrent-session pollution risk:** the working tree currently has uncommitted concurrent-session changes in `useFoodDetailEdit.ts` + `tests/unit/library/food-detail-edit-validation.test.ts`. Codex review should be scoped to Bug 1 files only — if Codex flags issues in the concurrent-session files, those are PRE-EXISTING and out of scope for this batch (track separately).
