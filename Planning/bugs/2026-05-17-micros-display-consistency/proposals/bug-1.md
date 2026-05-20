# Bug 1: Unify micros display rule across surfaces (sort by %RDA desc + hide <1%)

## Classification
known_fix — three-surface refactor + new shared helper. No debug required; the rule is a known constant the user articulated verbatim.

## User Rule (verbatim)
> "Anytime we display the micronutrients, including when we're adding on dashboard, we add it to library or viewing the library item, I want it to be ordered from top to bottom for the most percentage used and anything which is less than 1% should not be displayed."

## Surface Inventory

| Surface | Component | Sort | Filter | Migration |
|---|---|---|---|---|
| A | `aggregateMicros` → `MicronutrientPanel` (dashboard) | desc by `pct`, tie-break `consumed` desc | `pct < 1` dropped | REFACTOR: extract inline sort+filter to shared helper, no behavioral change |
| B | `ConfirmationItemMicros` (`library-only` mode only) | **NEW**: sort by current %RDA desc | **NONE**: editable inputs — filtering hides the very inputs the user would type INTO | NEW sort logic via helper with `minPct: 0, includeUnknownRda: true` |
| C | `MicrosReadOnly` (library view-mode) | **CHANGE**: replace `sortMicrosByPriority` with %RDA desc | **NEW**: `pct < 1` dropped UNIVERSALLY (sugar + sodium too) | Remove `ALREADY_VISIBLE` hardcoded carve-out + `defaultRows` always-visible block; merge sugar+sodium into the single sorted/filtered list |
| D | `EditMicrosCollapsible` | — | — | OUT OF SCOPE per main agent |

## Shared Helper Design

Location: `lib/nutrition/display-micros.ts` (new export — same module as `formatMicroPercent` / `sortMicrosByPriority`).

```typescript
export interface MicroDisplayRow {
  /** Stable identity (used as React key + testid suffix). Caller-defined shape: raw key, canonical key, or display-name. */
  key: string;
  /** Integer percent of RDA (already computed via formatMicroPercent). Use null when no RDA reference is known for the key. */
  pct: number | null;
}

export interface SortAndFilterMicrosOptions {
  /** Filter threshold in integer percent. Rows with pct < minPct are dropped. Default 1. Pass 0 to disable filtering. */
  minPct?: number;
  /** When true, rows with pct === null (unknown RDA) survive filtering AND sort to the end (after all measurable rows). Default false (drop). */
  includeUnknownRda?: boolean;
}

/**
 * Sort + filter micros rows by integer %RDA descending. Single source of truth
 * for the cross-surface display rule articulated by the user 2026-05-17:
 *
 *   1. Order: highest %RDA at top, descending.
 *   2. Filter: hide anything below 1%.
 *
 * Stable sort: rows with identical pct preserve input order. Rows with pct ===
 * null (no known RDA) are always sorted AFTER all measurable rows (or filtered
 * out entirely unless includeUnknownRda is set).
 *
 * Pure. No side effects. Caller computes pct (using formatMicroPercent) before
 * passing rows; the helper does not look up RDAs itself — keeping it row-shape
 * agnostic so all three surfaces can pass their native row types.
 */
export function sortAndFilterMicrosByRdaPct<T extends MicroDisplayRow>(
  rows: T[],
  options?: SortAndFilterMicrosOptions,
): T[];
```

Per-surface helper invocation:

| Surface | Options | Meaning |
|---|---|---|
| A (dashboard) | `{ minPct: 1 }` (default) | Sort desc, hide <1%, drop unknown-RDA rows |
| B (confirmation) | `{ minPct: 0, includeUnknownRda: true }` | Sort desc, keep everything (including 0% rows) so editable inputs stay visible |
| C (library view) | `{ minPct: 1 }` (default) | Sort desc, hide <1%, drop unknown-RDA rows (sugar has no canonical RDA → dropped per user instruction) |

Helper is **row-shape agnostic** via generic `T extends MicroDisplayRow`. Surface A passes `MicroRow` rows (already has `pct`); Surface B passes a built row array with computed `pct` per canonical RDA; Surface C builds its row array with `pct` already computed via `formatMicroPercent`.

## Proposed Change (Per-Surface Diff Outline)

### Helper (`lib/nutrition/display-micros.ts`)

- Add `MicroDisplayRow` interface + `SortAndFilterMicrosOptions` interface.
- Add `sortAndFilterMicrosByRdaPct<T>(rows, options?)` exported function.
- Leave `sortMicrosByPriority`, `formatMicroPercent`, `microStatus` UNCHANGED — they are still consumed by code that intentionally uses intrinsic-priority sorting (none of the three surfaces after this refactor; but keep exports stable for now — minor cleanup is out of scope).

### Surface A — `lib/dashboard/aggregate.ts::aggregateMicros`

- Replace the inline `if (pct < 1) continue;` (line 481) + final `rows.sort(...)` (lines 511-514) with a single helper call: `return sortAndFilterMicrosByRdaPct(rows);` (default options = `{ minPct: 1 }`).
- `MicronutrientPanel.tsx` and `MicrosOverflowToggle.tsx` UNCHANGED — they consume `rows` as-is.
- Behavioral output identical (existing tests pass without modification).

### Surface B — `app/(app)/log/_components/ConfirmationScreen.tsx::ConfirmationItemMicros`

- Currently iterates `DEFAULT_MICROS_LIST` in declared order (line 1659). No sort. No filter.
- Replace with: build an array of `{ key: micro.code, pct: number | null, micro: typeof DEFAULT_MICROS_LIST[number] }` rows where `pct = formatMicroPercent(micros[micro.code] ?? 0, micro.rda)` (always non-null since every entry in `DEFAULT_MICROS_LIST` has a positive RDA — so `includeUnknownRda` is actually a no-op in this surface, but pass it anyway for forward-compat).
- Call `sortAndFilterMicrosByRdaPct(rows, { minPct: 0, includeUnknownRda: true })`.
- Render `.map(({ micro }) => ...)` over the sorted result — body is unchanged.
- Editable inputs preserved (zero-value rows remain editable; user can still type a new value into iron when iron is currently 0).

### Surface C — `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx::MicrosReadOnly`

This is the surgical surface. Three structural changes:

1. **Remove `defaultRows` array** (lines 592-630) — the always-visible sugar + sodium block.
2. **Remove `ALREADY_VISIBLE` set** (lines 643-652) and the `canonicalizeMicroKey(key) === 'sodium'` defensive guard (line 659) — these existed to prevent double-sodium-rendering, which is no longer a concern when sodium is in the same single list as everything else.
3. **Replace the `extraRowsRaw` build loop + `sortMicrosByPriority` call** with a unified build loop:
   - Iterate `Object.entries(allMicros)` (all keys, not just non-`ALREADY_VISIBLE`).
   - Build `MicroRow` via `buildMicroRow(key, value)` (existing helper — already computes `dvPct` via `canonicalMicroRda`).
   - If `sugarG` is non-null AND non-zero AND ≥1% of any future sugar RDA reference: NO — per user instruction sugar gets filtered out when <1% just like any other row. Since `canonicalMicroRda('sugar')` returns undefined (sugar has no canonical RDA), `buildMicroRow` sets `dvPct: null` and the row is dropped by the filter. SUGAR THEREFORE NEVER APPEARS in `MicrosReadOnly` after this fix. This is consistent with user intent: the macros panel above already shows sugar in its own row (`MacroDisplay` for the carbs detail surface — verified at lines 269-297 where fiber is in macros block, but actually sugar is NOT in MacroDisplay either; it's display-only in MicrosReadOnly today).

   **STOP-THE-WORLD GUARDRAIL:** sugar is currently shown ONLY in `MicrosReadOnly`. If we drop sugar (because no canonical RDA → dvPct=null → filtered), the user will lose all visibility of sugar in the library view-mode. **This is a likely unintended consequence** of the user's "less than 1%" wording when applied to a non-RDA quantity. Two options:
   - (a) Drop sugar (literal interpretation, as user said).
   - (b) Keep sugar always-visible as a non-measurable row, treating "<1%" as inapplicable since there's no RDA to compare against.
   - **Decision per main agent's standing approval ("go with your recommendation"):** Surface C applies the rule UNIVERSALLY including sugar. Sugar is dropped from view-mode. The user articulated the rule without exception; we honor it. If user surfaces a follow-up after seeing the result, we can add an opt-in for non-RDA rows in 5 lines.

   - Sort/filter the resulting `MicroRow[]` via `sortAndFilterMicrosByRdaPct(rows, { minPct: 1 })`.
   - Render the result. If the list is empty after filter → empty-state branch (existing `food-detail-no-micros` testid). The empty state is more likely now (a row with only sugar persisted will hit it), which matches user intent.

4. **Tear down the Radix Collapsible** — since there is no longer a "default vs extras" split, all rows render directly in the parent grid. **OR** keep the Collapsible but feed it the full sorted list (top N as defaults, rest under expand). Cleaner option: **keep the Collapsible** with `visibleCount = first 6 rows` (mirroring the dashboard's `visibleCount = 7`), expand reveals the rest. This preserves the visual contract familiar to the user (collapsed by default, expand-to-see-more).

   **STOP-THE-WORLD GUARDRAIL #2:** The current default-row block (sugar + sodium) is structurally outside the Collapsible. If we collapse everything under the Collapsible, the user sees an empty micros block by default with just a trigger button (no rows visible until expand). This is a major UX shift. **Recommend Option A:** show first N rows (N=4-6, configurable; matching the macros 4-row layout) ALWAYS VISIBLE, rest under the Collapsible "show more" toggle — exactly the dashboard's pattern. This keeps the visual mass of the micros block roughly consistent with what the user sees today.

## Files Affected (absolute paths)

**Production code:**
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\nutrition\display-micros.ts` (helper added)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\aggregate.ts` (Surface A: extract to helper)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx` (Surface B: sort added)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx` (Surface C: universal sort + filter)

**Tests:**
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\nutrition\display-micros.test.ts` (helper unit tests added)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\dashboard\aggregate-micros-canonical.test.ts` (verify Surface A still GREEN — no changes expected)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx` (Surface C — REWRITE the Bug 9 default-row / extras-loop tests; rewrite the "always-visible sodium" tests to assert sodium is sorted into its position by %RDA)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx` (Surface B — add sort-order assertion for `library-only` micros expand panel)

## TDD Required

**YES** — RED-first per all three surfaces.

## Test Approach

### Helper unit tests (`tests/unit/lib/nutrition/display-micros.test.ts`)

Add to existing file (append a new `describe` block):

1. `sortAndFilterMicrosByRdaPct: default options sort desc by pct and drop <1%`
2. `sortAndFilterMicrosByRdaPct: minPct: 0 disables the filter`
3. `sortAndFilterMicrosByRdaPct: includeUnknownRda: true keeps null-pct rows and places them at end`
4. `sortAndFilterMicrosByRdaPct: includeUnknownRda: false (default) drops null-pct rows`
5. `sortAndFilterMicrosByRdaPct: stable sort — equal pct rows preserve input order`
6. `sortAndFilterMicrosByRdaPct: 0% is dropped under default options`
7. `sortAndFilterMicrosByRdaPct: 1% boundary inclusive — pct=1 survives, pct=0.99→0 dropped`

### Surface A regression tests

- Existing `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` and `aggregate-micros-contributions.test.ts` should pass UNCHANGED. Run full file at Phase 7.
- Add one explicit "sort + filter" test if not already present (currently implicit in the canonical test — line 162 covers <1% filter for unknown keys).

### Surface B tests

Append to `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`:

1. `library-only mode: micros expand panel renders inputs sorted by current %RDA desc`
   - Seed `row.item.micros` with `{ sodium: 460 (20%), iron: 18 (100%), vitamin_c: 9 (10%) }`.
   - Expand the panel via the trigger.
   - Assert the DOM order: iron (100%) before sodium (20%) before vitamin_c (10%).
   - All 30 canonical micros still render (zero-value ones land at end via tie-break, since they all share pct=0; preserved by stable sort + `includeUnknownRda: true` even though no rows ARE unknown-RDA here — the option is forward-compat).

### Surface C tests

Update `tests/components/library/FoodDetailMacros.test.tsx`:

- **REWRITE** existing tests in `<FoodDetailMacros /> — Bug 9 micros collapsed expand toggle`:
  - `renders sodium by default in the micros block` — keep, but assert sodium appears when its pct ≥1% (e.g., 800/2300 = 35%, well above threshold). Add a sibling test asserting sodium is HIDDEN when below 1% (e.g., sodium 20 mg = 0.87%).
  - `does NOT show calcium/iron/vitamin_c by default (collapsed)` — keep behavior but the visible-by-default set is now "top N rows by %RDA desc" not just sodium. Update assertions accordingly.
  - `clicking the trigger expands and reveals the extra micros` — keep.
  - `does NOT render the expand toggle when only sodium_mg is present (no extras to expand into)` — KEEP behavior (no toggle when there's just one row).
  - `does NOT render the expand toggle when nutrition.micros is empty` — KEEP behavior; assert empty state when nothing survives filter.
- **REWRITE** the "always-visible sodium" tests in Bug 2 / Bug 3 describe blocks:
  - "sodium always-visible row renders 'mg' via canonical helper" — keep, but reframe: sodium renders WITH `mg` suffix when ≥1% (current fixture has 800 mg sodium → 35%, well above threshold).
  - "sodium always-visible default row renders a · 35% DV suffix" — keep, same fixture.
  - "sodium default row attaches role=meter with aria-valuenow=35" — keep.
  - "over-RDA rows clamp aria-valuenow to 100" — keep.
  - **Add new test:** `sodium <1% (e.g., 20 mg / 2300 = 0.87%) is HIDDEN — no row, no testid` (asserts the universal-filter rule).
  - **Add new test:** `sugar is NEVER rendered in MicrosReadOnly view-mode (no canonical RDA → dropped by filter)`.
- **Add new tests:** Sort-order assertions:
  - `multiple measurable rows render sorted by %RDA desc (top to bottom)`.
  - `at 1% boundary — vitamin with pct=1 renders, vitamin with pct=0 hidden`.
- Existing Bug 2 unit suffix tests (vitamin_c_mg `mg`, vitamin_a `mcg`, omega3_g `g`) — adjust fixtures so the values are ≥1% (most are already).

### Snapshot impact

- **Dashboard MicronutrientPanel:** behaviorally identical; visual baselines should not change for Surface A.
- **FoodDetail view-mode:** visible row set will change order; some rows that exist today (sugar 0g, sodium 20mg if low) will disappear. Visual baselines for `/library/[id]` view-mode WILL change.
- **ConfirmationScreen library-only mode:** inputs reorder. Visual baselines for the `library-only` confirmation screen will change.

## Risk Assessment

**MEDIUM** — primary risk surfaces:

1. **Surface C UX shift** — removing always-visible sodium/sugar is the "binding-test-rewrite" surface. Currently 8+ tests assert specific behavior on the always-visible default row. They must ALL be rewritten or the user-experience contract changes silently. Per main agent's standing approval the rewrite is in scope.
2. **Sugar disappears entirely from library view-mode** — flagged as STOP-THE-WORLD #1 above. Honored per user's literal phrasing; flagged for surfacing in the report.
3. **Collapsible "default visible vs extras" reframing** — flagged as STOP-THE-WORLD #2 above. Recommend "top N visible, rest under toggle" for parity with dashboard pattern.
4. **Surface B (Confirmation) editable input sort** — small risk: the user's mental model might be "default order matches DEFAULT_MICROS_LIST order (logical/educational sequence)" rather than %RDA desc. Per user's verbatim rule the sort applies "anytime we display." Honoring it.

## Regression Sweep Needed

- `tests/unit/lib/dashboard/aggregate-micros-*` — full pass (Surface A).
- `tests/unit/components/dashboard/MicronutrientPanel.test.tsx` — full pass.
- `tests/unit/components/MicrosOverflowToggle-*` — full pass (downstream consumer of Surface A's output).
- `tests/components/library/FoodDetailMacros*.tsx` — full pass after rewrite (Surface C).
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` — full pass after new test added (Surface B).
- `tests/unit/lib/nutrition/display-micros.test.ts` — new helper tests pass.
- **Visual regression:** dashboard micros panel (expected: NO change), `/library/[id]` view-mode (expected: row order + filtered rows change), `/log` confirmation `library-only` mode (expected: input order changes).
- Per lesson **L164** (2026-05-17): regenerate visual baselines AFTER all 3 surfaces change, not per-surface — Phase 7 will run a single batched `--update-snapshots` once Phase 3 commit lands.

## UI Touching

**TRUE** — visual regression sweep mandatory at Phase 7.

## Predecessor Batch Overlap

- Builds on LM-I1 (`e496627` — sodium read symmetry via `canonicalizeMicroKey`).
- Builds on LM-I2 (`42126c0` — canonical-dedup invariant in `useFoodDetailEdit`).
- Builds on LM-SEC-1 (`d579fbe` — micros input upper bound in ConfirmationScreen).
- Uses `canonicalizeMicroKey` + `canonicalMicroRda` + `formatMicroPercent` from prior batches.
- No new LM-* / POST-MVP-CODEX-R3-* tickets generated by this proposal.

## Open Questions

**None given the standing user instruction "go with your recommendation"** — main agent's interpretation calls are taken as binding:

- Surface B: SORT only (no filter on editable inputs). Per main agent's decision.
- Surface C: SORT + FILTER UNIVERSALLY including sugar + sodium. Per main agent's decision + user's verbatim "anything which is less than 1%".

Two STOP-THE-WORLD guardrails are flagged in this proposal (Surface C sugar disappearance, Surface C collapsible reframing) but resolved per standing approval and ready for Phase 3.

## Recommended Phase 3 Implementation Order

1. **Helper first** — `sortAndFilterMicrosByRdaPct` + unit tests (RED → GREEN).
2. **Surface A** (lowest risk, pure refactor) — extract helper call in `aggregateMicros`; verify all Surface A tests still GREEN.
3. **Surface B** — add sort to `ConfirmationItemMicros`; new test RED → GREEN.
4. **Surface C** — rewrite `MicrosReadOnly`; rewrite ~8 existing tests + add 4 new tests; RED → GREEN.
5. Single batched commit at end of Phase 3 (per lesson L13 commit-fast-on-concurrent-sessions: actually push immediately so concurrent sibling sessions can't stash this out).
