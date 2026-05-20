# Bug #3 Proposal — Library detail: show micros vs. daily value

## Bug description
"When I open the detail of a library item, it should show how many milligrams (or whatever unit) the nutrient has, **versus the daily value**. So I see the amount AND the daily-value comparison together (e.g. '150 mg / 500 mg DV' or '30% of DV')."

## Classification
**`known_fix`** — daily-value (RDA) data already exists for all 30 canonical micronutrients in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST`. This is a display-layer extension, not a feature. No schema migration, no new seed data, no scoping decisions required.

## Daily-value data source
- **Primary table:** `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` — 30-entry readonly array with `{ code, name, rda, unit }` for every canonical micronutrient (FDA DV / WHO RNI baselines, citations inline). Examples: `sodium` rda=2300 mg, `vitamin_c` rda=90 mg, `iron` rda=18 mg.
- **Helper:** `lib/nutrition/display-micros.ts::formatMicroPercent(value, rda)` — already produces the integer % RDA used elsewhere; we can reuse verbatim.
- **Canonicalisation:** `lib/dashboard/micros-rda-resolver.ts::canonicalizeMicroKey(rawKey)` — exported, pure, resolves library's unit-suffixed keys (`sodium_mg`, `vitamin_c_mg`, `vitamin_a_mcg`, ...) to their canonical code so we can look up the RDA. This is critical: the library UI persists micros under `${code}_${unit}` suffix shape, while `DEFAULT_MICROS_LIST` keys on bare canonical codes — `canonicalizeMicroKey` is the bridge.
- **Macros precedent:** `lib/nutrition/macro-dv.ts` + `macroDvPct()` already drive a `· {n}% DV` suffix on the four macro rows of the SAME file (`FoodDetailMacros.tsx`, see lines 282-348). The micros bug just mirrors this pattern for the micros block.

The data is fully available — no infrastructure missing.

## Display style
**Recommendation: `· {n}% DV` mono suffix on each micro row, matching the existing macros pattern in the same component.**

Citing the canonical pattern already shipped in `FoodDetailMacros.tsx`:
- Macro rows render `· {n}% DV` in JetBrains Mono via i18n key `t.library.detail.macroDvSuffix = '% DV'` (lib/i18n/en.ts:795).
- Aria label format: `${name} ${value}${unit}, ${pct}% daily value` (FoodDetailMacros.tsx:316-318).
- Suffix is omitted when `macroDvPct()` returns `null` (zero / non-finite / absent).

This is the right style for the library detail because:
1. **Consistency** — macros in the same panel already show DV. Micros must match or it reads as a half-finished panel.
2. **Density** — the micros block is a 2-column grid (`kalori-fd-micros`). A second value line ("150 mg / 2300 mg DV") doubles vertical space per row; the inline `· {pct}% DV` mono suffix keeps each row at one line.
3. **Aesthetic precedent** — `MicrosRdaPanel.tsx` on the dashboard renders pure `{pct}%` for the same canonical codes (lines 145-156). Library detail will read as the cousin panel.
4. **Accessibility** — aria-label can carry the full "150 mg of 2300 mg daily value, 7 percent" sentence for screen readers without bloating the visible row.

**ui-design.md citation:** §7.1.6 Micronutrient Panel line 989 — `<div role="meter" aria-valuenow={dvPct} aria-valuemax={100}>` is the canonical a11y wrapper for nutrient rows. We will adopt `role="meter"` on each library detail micro row (not currently used; rows are currently a plain 2-col grid).

**Web-ui-guide.md citation:** §1 Quick-Pick Decision Table does NOT cover DV-comparison display patterns explicitly — this is a typographic decoration, not an animation. The decision defers to project ui-design.md conventions, which is what we follow.

**Alternatives considered + rejected:**
- "150 mg / 2300 mg DV" two-quantity form: too wide for the 2-col grid; would force a layout reflow.
- Inline progress bar per micro row: matches dashboard `<MicronutrientPanel />` but adds significant visual weight inside a sheet already crowded with the macros block above. Defer to a later feature if user requests.
- `30% DV` badge: ui-design.md does not have a badge primitive; macros precedent in this file is suffix, not badge.

## Coordination with bug 2
Bug 2 is adding the per-row UNIT display (already partially present via `unitFromMicroKey()` + the `formatted` field built by `buildMicroRow()` at lines 467-483). After bug 2 lands, each micro row's `formatted` field will be `"{value} {unit}"` (e.g. `"150 mg"`).

**My bug-3 work layers on AFTER bug 2** by:
1. Extending `MicroRow` interface (FoodDetailMacros.tsx:461-465) with two new optional fields: `dvPct: number | null` and `rda: number | null` (informational; kept for aria-label).
2. Modifying `buildMicroRow()` (FoodDetailMacros.tsx:467-483) to: (a) call `canonicalizeMicroKey(key)` to resolve the canonical code, (b) look up the RDA from `DEFAULT_MICROS_LIST` (cheap O(1) via a one-time module-local `Map<code, MicroRdaEntry>`), (c) compute `dvPct` via `formatMicroPercent(value, rda)`. If canonical lookup returns `undefined` or `pct` would be 0, leave `dvPct = null` (omit the suffix on render).
3. Adding the suffix span in BOTH render sites:
   - `MicrosReadOnly` defaultRows render (lines 542-547) — sodium has rda=2300, so this row always gets `· {pct}% DV`. Sugar has no canonical RDA; suffix omitted by the `null` guard.
   - `MicrosReadOnly` extraRows render inside the collapsible (lines 574-578).
4. Add a new i18n key `t.library.detail.microDvSuffix = '% DV'` for parity with `macroDvSuffix`, OR reuse `macroDvSuffix` if user is fine with one shared key (recommend reuse — they render identically).
5. Upgrade each row's wrapper from `<div style={{ display: 'contents' }}>` to `<div role="meter" aria-valuenow={dvPct} aria-valuemax={100} aria-label="...">` for a11y compliance with ui-design.md §7.1.6.

**Zero overlap with bug 2's edits** — bug 2 owns the `formatted` field's unit display; bug 3 owns the appended DV suffix as a SEPARATE adjacent `<span>` (just like the macro rows render value + DV as two separate spans, FoodDetailMacros.tsx:331-340). The two changes can be reviewed as independent diffs.

**Sequencing:** implement AFTER bug 2 to avoid merge friction on `buildMicroRow()`. If bugs are implemented in parallel, bug 3 takes bug 2's `formatted` field as input and appends the new fields — no shared lines need to be edited twice.

## Proposed change diff outline
**Files to touch (3):**
1. `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — primary site. ~30-40 lines added/changed across `MicroRow` interface, `buildMicroRow()`, and the two render sites in `MicrosReadOnly`.
2. `lib/i18n/en.ts` — optionally add `microDvSuffix` (or reuse `macroDvSuffix`). Recommend reuse: 0 changes here.
3. `tests/unit/components/FoodDetail/FoodDetailMacros.test.tsx` — likely already exists for bug 8 + bug 9 work; **needs to be located first**. If not present, create at `tests/unit/library/FoodDetailMacros.test.tsx` per project convention. Add 3 unit tests:
   - "sodium row renders `· {pct}% DV` suffix when value is a positive number"
   - "rows for unknown canonical codes (e.g. legacy `unmapped_xx`) render without DV suffix"
   - "rows for codes with zero value render without DV suffix"

## Files
- Primary: `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`
- i18n: `lib/i18n/en.ts` (only if new key added; recommend reuse)
- Test: `tests/unit/library/FoodDetailMacros.test.tsx` (locate or create)

## Approach
1. **TDD-first:** Locate or create the unit test file, write three failing assertions (RDA suffix present for sodium, absent for unknown codes, absent for zero values), confirm they fail for the correct reason.
2. Import `canonicalizeMicroKey` and `DEFAULT_MICROS_LIST` into `FoodDetailMacros.tsx`. Build a module-local `Map<string, MicroRdaEntry>` keyed by canonical code (computed once at module load).
3. Extend `MicroRow` interface with `dvPct: number | null` and `rda: number | null`.
4. Update `buildMicroRow()` to resolve the canonical code via `canonicalizeMicroKey(key)`, look up the entry in the local map, compute pct via `formatMicroPercent(value, entry.rda)`. Set `dvPct = null` when the lookup fails or pct is 0.
5. Update the two render sites in `MicrosReadOnly` (defaultRows + extraRows) to append a `<span data-testid={`food-detail-micro-dv-${r.key}`} className="kalori-fd-macro-dv num">· {r.dvPct}{t.library.detail.macroDvSuffix}</span>` when `r.dvPct !== null`.
6. Convert the row wrappers from `display: contents` to `<div role="meter" aria-valuenow={dvPct ?? 0} aria-valuemax={100} aria-label={`${name} ${value} ${unit}${dvPct !== null ? `, ${dvPct}% daily value` : ''}`}>` — matches the macro row pattern in the same file (line 320-329) and ui-design.md §7.1.6 a11y spec.
7. Run unit tests → expect green.
8. Run Playwright visual regression on `tests/screenshots/user-stories/US-STAB-C*` and `golden-path/04-settings.png` to confirm no unrelated drift.

## TDD required
**Yes.** Three new pure-function unit tests on `buildMicroRow()` + at least one component test that asserts the rendered `data-testid="food-detail-micro-dv-{key}"` element exists for sodium and not for an unknown key.

## Risk
**Low.**
- All data sources are already exported and battle-tested by the dashboard (`MicrosRdaPanel`, `MicrosRdaPanel.test.tsx` shipped in C.1).
- Display-only change; no DB writes, no API surface change, no schema change.
- `canonicalizeMicroKey()` is pure, well-tested (closed allowlist + display-name fallback), and explicitly designed to handle the library's unit-suffixed keys.
- Aria-label change is a strict improvement (rows are currently bare div pairs with no semantic role).
- Sugar row carries no canonical RDA — the `null` guard handles this; suffix simply not rendered (matches current macros precedent where missing DV → omitted line).
- Bug-2 coordination is clean (separate spans, separate fields, no merge conflicts expected if sequenced bug-2 → bug-3).

## Regression risk vectors
- **Snapshot/visual tests:** ANY change to the library detail micros block markup will fail existing snapshot tests. Update baselines per project convention (`pnpm test -u` for vitest snapshots; Playwright screenshot baselines must be regenerated against the new DV-suffix layout). Expect `tests/screenshots/user-stories/US-STAB-A1/`, `US-STAB-A2/`, and any `food-detail-*` Playwright baselines to need refresh.
- **Locale strings:** If `macroDvSuffix` is reused, no new key needed. If a separate `microDvSuffix` is added, ensure both keys are exported from i18n.

## Stop-the-world flags
None. This is a contained display-layer change with full data infrastructure already in place.
