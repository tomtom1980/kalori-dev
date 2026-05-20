# Bug 1 (LM-I1): FoodDetailMacros resolveSodiumMg read/exclude asymmetry

## Classification
known_fix

## Root Cause
`resolveSodiumMg` (FoodDetailMacros.tsx:101-116) reads only the two raw keys `micros.sodium` and `micros.sodium_mg` via direct bracket access. The extras-exclusion filter (lines 613-629), in contrast, canonicalizes every key through `canonicalizeMicroKey` and drops anything whose canonical form is `sodium` — which includes display-name `"Sodium"` (mapped via `DISPLAY_NAME_TO_CANONICAL_CODE`). The two paths therefore disagree on what counts as "sodium": the read path is shape-strict (canonical snake_case OR legacy unit-suffix only), while the exclude path is canonical-aware. A `micros: { "Sodium": 500 }` row is hidden from BOTH the always-visible sodium meter AND the collapsible extras — the user sees no sodium at all. This violates the 2026-05-14 encoding-boundary symmetry rule (producer and consumer must pipe through the same canonicalization function).

## Symmetry audit
- **Producer/exclude path (consumer A, extras loop, line 629):** Pipes raw key through `canonicalizeMicroKey(key) === 'sodium'`. Accepts: canonical `sodium`, legacy alias `sodium_mg`, display-name `"Sodium"`. Status: canonical-aware. CORRECT.
- **Consumer B (read path, resolveSodiumMg, lines 101-116):** Direct bracket access on `micros.sodium` then `micros.sodium_mg`. Accepts: canonical `sodium`, legacy alias `sodium_mg`. Does NOT accept display-name `"Sodium"`. Status: shape-strict. ASYMMETRIC — must be lifted to canonical-aware.
- **Defensive consumer (always-visible exclusion `ALREADY_VISIBLE` Set, lines 613-622):** Literal-key set `{'sodium','sodium_mg','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sugar'}`. The set-membership check at line 625 fires first; the canonical check at line 629 backstops anything the set misses. After fix, display-name `"Sodium"` is read by the meter AND dropped by line 629 — no double-render risk; the set entries remain for the macro keys that are not canonical micros.
- **canonicalizeMicroKey behavior on `"Sodium"`:** Confirmed correct. Falls through legacy-alias map (no entry), falls through canonical-code set (`"Sodium"` is not canonical snake_case — case-sensitive by design), hits `DISPLAY_NAME_TO_CANONICAL_CODE["Sodium"] === "sodium"`. Returns `"sodium"`. No helper change needed.
- **Symmetry after fix:** Both paths route through `canonicalizeMicroKey`; both accept canonical / legacy-alias / display-name; canonical wins on drift (preserved by ordered iteration in the new read path).

## Proposed Change (Diff Outline)
- **File:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (lines 101-116)
  - Rewrite `resolveSodiumMg` to iterate `Object.entries(micros)`, canonicalize each key via `canonicalizeMicroKey`, and collect any entry whose canonical form is `'sodium'`. Maintain canonical-wins precedence: if multiple raw keys map to `sodium`, prefer the entry whose raw key is the canonical code `'sodium'`, else prefer the entry whose raw key is the legacy alias `'sodium_mg'`, else accept the display-name (or any future alias) value. Guard with `typeof === 'number' && Number.isFinite`. Return the first valid finite number under the priority order, else `null`.
  - Update the JSDoc to reflect the canonical-aware contract (matches the exclude-path comment at line 626-628).
  - The `ALREADY_VISIBLE` Set remains — it is a fast-path lookup for the most common shapes; the `canonicalizeMicroKey` check at line 629 already handles `"Sodium"` and any future aliases.
- **File:** `tests/components/library/FoodDetailMacros.test.tsx`
  - Extend the existing `describe('<FoodDetailMacros /> — Codex R1 C1 sodium canonical/legacy alignment')` block (or add a sibling `describe` titled "LM-I1 display-name parity") with the 4 new tests below. Mirror the assertion pattern already used at lines 697-774 (meter exists, `aria-valuenow`, `food-detail-micros` getByText, extras absence).

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx`

## TDD Required
yes

## Test Approach
Mirror the existing Codex R1 C1 sodium describe block (lines 697-804). All four tests render `<FoodDetailMacros />` with the `baseItem` / `baseDraft` scaffolding already in the file and assert on `food-detail-micro-row-sodium`, `food-detail-micros`, and `food-detail-micros-expand-content` testids that exist today.

- **Test 1 — display-name read:** `micros: { "Sodium": 500 }` (note: capital S, no underscore suffix) renders the always-visible sodium meter at `500 mg` with `aria-valuenow="22"` (500/2300 ≈ 21.7%). Failing pre-fix because `resolveSodiumMg` returns `null` for this shape.
- **Test 2 — canonical regression:** `micros: { sodium: 500 }` still renders the meter at `500 mg` `aria-valuenow="22"` (existing test 698-722 already covers this; the regression cite confirms the rewrite did not break it — keep both as separate "it" blocks to make a future regression localizable).
- **Test 3 — legacy regression:** `micros: { sodium_mg: 500 }` still renders the meter at `500 mg` `aria-valuenow="22"` (existing test 724-745 already covers this; keep as the regression cite).
- **Test 4 — display-name drift, canonical wins:** `micros: { "Sodium": 500, sodium: 100 }` renders the meter showing the canonical value (`100 mg`, `aria-valuenow=4`) — NOT the display-name value. This pins canonical-wins for the new path. Extras loop renders neither `100 mg` nor `500 mg` as a sodium row inside the collapsible (no double-render).
- **Test 5 (additional symmetry cite):** `micros: { "Sodium": 500, vitamin_c_mg: 30 }` — expand the collapsible and assert it contains the vitamin C row but NOT a second sodium row. Mirrors line 776-804.

## Risk Assessment
low

The fix narrows behavior for a single function whose surface (`number | null`) is unchanged. The producer-side canonical filter (line 629) already drops display-name "Sodium" from extras, so no display-name sodium currently appears anywhere in production — the fix RESTORES coverage rather than changing existing rendering. `canonicalizeMicroKey` is a pure, frozen-map lookup with no side effects. The 5 existing sodium tests in the file pin canonical and legacy behavior; the rewrite must keep both green.

One subtlety worth noting in the fix prompt: `canonicalizeMicroKey` is **case-sensitive by design** (per the JSDoc at resolver.ts:158-160 — its consumers treat case-mismatch as a drop signal). The display-name map `DISPLAY_NAME_TO_CANONICAL_CODE` is keyed with title-case names (`"Sodium"`, `"Vitamin C"`). Uppercase `"SODIUM"` or all-lower `"sodium"` (which IS canonical anyway) are the only edge shapes — `"SODIUM"` would not resolve via the display-name path. This matches existing behavior elsewhere (dashboard resolver) so does not warrant a helper change for this bug.

## Regression Sweep Needed
- `tests/components/library/FoodDetailMacros.test.tsx` (full file, ~16+ tests)
- `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` (any sodium-edit path)
- `tests/components/library/FoodDetail-LogNow.test.tsx` (uses FoodDetail compound; sodium meter visible on detail panel)
- `tests/lib/dashboard/micros-rda-resolver.test.ts` or `canonical-micro-unit.test.ts` if it exists — `canonicalizeMicroKey` is not modified, but the new caller pattern should not break shared expectations
- `tests/lib/dashboard/aggregate.test.ts` (uses `aggregateMicros` which shares `canonicalizeMicroKey`; not modified, regression only)

## UI Touching
true — affects the always-visible sodium meter row inside `<FoodDetail.Macros>`.

## ui-design prescription cited
- **Planning/ui-design.md §7.3.6 (FoodDetail compound, line 1603) → "Macros child" (line 1637-1641):** "Micro table: 2-col. Left `micronutrient name` Newsreader 400 italic 14 `sand`. Right value + unit JetBrains Mono 400 11 `ivory`. Rows: dotted 1px `rule`." The bug visually means a sodium row that SHOULD exist is missing. After fix the row is rendered using the existing `MicroRowDisplay` component — no styling change required.
- **Planning/ui-design.md §2.4 (Typography table T... line 105-122) → "Tabular numerics utility":** `font-variant-numeric: lining-nums tabular-nums` already applied via `kalori-fd-micro-...` classes; the new code path uses the same `MicroRowDisplay` → no number-formatting deviation.
- **`web-ui-guide.md` Quick-Pick Decision Table:** No "Meter pattern" or "Number formatting" row was located in the guide (Grep returned zero matches for those terms). The existing sodium meter already uses `role="meter"` + `aria-valuenow` clamped 0..100 (asserted at test lines 500-545); the fix preserves this contract — the meter is rendered by the SAME `MicroRowDisplay` code path the existing canonical / legacy cases use, so no new meter-pattern decision is introduced. If a Quick-Pick decision IS expected, this bug does not change which decision applies — it restores access to it for one more input shape.

## Open Questions
- None blocking. Optional polish: should the JSDoc on `resolveSodiumMg` explicitly call out display-name `"Sodium"` in the resolution order (alongside canonical and legacy) so a future reader understands the canonicalization route? Recommended yes; trivial doc-only addition.
- The existing `ALREADY_VISIBLE` set at line 613-622 contains literal `'sodium'` and `'sodium_mg'`. After the fix, display-name `"Sodium"` is NOT in that set but IS caught by the canonical filter on line 629. This is consistent with the existing exclude-path design (literal fast-path + canonical backstop). No change needed; flagging for review only.
