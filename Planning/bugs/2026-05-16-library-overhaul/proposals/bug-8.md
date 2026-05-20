# Bug 8 — Library FoodDetail: fiber typography mismatch + missing DV line on macros

## Summary
- **Bug ID:** 8
- **Description (verbatim):** "When we open the library item, all the major ingredients we chose should be the same font type. So right now we have protein, carbs, fat, but fiber is different. One, so fiber should show the same as the first three because it's a macro item and it should also show the logging line how much it is for the daily value."
- **User intent:** In `/library/[id]`, render Fiber as a first-class macro alongside Protein/Carbs/Fat — same typography (`kalori-fd-macro-label` + `kalori-fd-macro-value` + bar) — AND add a daily-value line ("23g / 25g · 92% DV" or similar) to fiber. The wording "**also** show the logging line how much it is for the daily value" implies the DV line is a new addition; investigation confirms NO macro currently shows a numeric DV %. Treat as: promote fiber + add DV line to **all four macros** for visual consistency.
- **Classification:** `known_fix` — component restructuring + new DV target constants + per-row DV sub-line. No debug needed; code paths and data are both present.
- **UI Touching:** YES — changes macro row layout (adds DV sub-line) and moves fiber from the "micros" italic-serif group to the "macros" Inter-uppercase + Mono group. Cited surfaces:
  - `Planning/ui-design.md:889–890` (dashboard MacroBars row spec — `m-name` Inter 500 10.5 UPPERCASE dust, `m-pct` JetBrains Mono 10.5, `m-val` Newsreader 300 28px with italic `/ {target}g` in sand). The library FoodDetail macro row currently uses a parallel-but-smaller variant (`kalori-fd-macro-label` Inter 10.5 UPPERCASE dust + `kalori-fd-macro-value` Mono 11px ivory); this proposal extends THAT pattern (not the dashboard 28px hero variant) to fiber and adds the trailing DV piece.
  - `Planning/ui-design.md:103` (T2/T6 typography table — Newsreader is body/serif role; Inter is labels-only) — moving fiber out of the italic-serif micros block restores role discipline.
  - `components/dashboard/MacroBars.tsx:25–51` — confirms fiber is treated as a first-class macro app-wide (with `var(--color-slate)` accent, distinct from P/C/F but in the SAME structural role).
- **TDD required:** YES (logic + visible structure change — new DV computation + new DOM rows).
- **Risk:** Low-medium. Touches one component file plus its CSS classes; existing macro tests (`tests/components/library/FoodDetail*`) and visual snapshots will need refresh. No API/schema change. No persistence change. Optional: visual-regression baselines (`tests/visual/library*.spec.ts`) may need re-record.
- **Stop-the-world flags:** None. Phase D firewall warning from project-context applies (out-of-band library bugfix-tomi should not touch Phase D scope) — this is isolated to `FoodDetailMacros.tsx` + globals.css + tests, which are NOT Phase D files (D.* targets reduced-motion + dashboard a11y, see CHANGELOG). Safe.

## Root cause

Two distinct defects in **one component**, `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`:

### Defect A — Fiber rendered as a micro, not a macro

Lines 123–160 render Protein/Carbs/Fat through `<MacroDisplay>`, which emits:
- `<span class="kalori-fd-macro-label">` — **Inter 500 10.5px UPPERCASE dust** (`globals.css:3619`)
- `<span class="kalori-fd-macro-value num">` — **JetBrains Mono 11px ivory** (`globals.css:3627`)
- A `.kalori-fd-macro-bar` track + fill (visual scale indicator)

Fiber falls through to `<MicrosReadOnly>` at lines 209–213 → 297–304, rendered as:
- `<span class="kalori-fd-micro-name">` — **Newsreader serif italic 14px sand** (`globals.css:3649`)
- `<span class="kalori-fd-micro-value num">` — JetBrains Mono 11px ivory (`globals.css:3655`)

So fiber's **label** uses serif-italic-sand (a "micro" voice) while P/C/F use sans-uppercase-dust (a "macro" voice). The unit suffix is also rendered differently (`formatGrams(v) g` concatenated inside the value string for fiber, vs `{formatGrams(v)}{unit}` in `MacroDisplay`).

Cause is structural: fiber lives in the `macros.fiber_g` field on `LibraryItem` (`lib/library/fetch.ts:39`) but `FoodDetailMacros.tsx` only iterates the protein/carbs/fat triplet through `<MacroDisplay>` and dumps fiber+sugar+sodium into the catch-all micros block. Likely an artifact of Task 4.2's "three macro bars" design — fiber was added later and inherited the wrong container.

### Defect B — No daily-value % line on any macro

`<MacroDisplay>` computes a visual `fill` (line 38–41 — bar width 0–100%) using local hard-coded targets (`PROTEIN_TARGET = 50`, `CARBS_TARGET = 300`, `FAT_TARGET = 70` at lines 62–64) but emits only the bar's `aria-valuenow` for the DV percent; there is **no rendered numeric DV line** (e.g. "32% DV" or "23g / 50g") for any macro. User wants the DV explicitly visible — especially for fiber, where the bar alone doesn't tell them "this hit my daily target."

The project's canonical DV is partially established already:
- `lib/dashboard/aggregate.ts:58` declares `FIBER_TARGET_G = 25` (dashboard chronometer fiber arc uses this).
- `lib/dashboard/aggregate.ts:302` returns `fiber: { consumed, target: 25 }`.
- Protein/Carbs/Fat dashboard targets are **user-derived** from Mifflin-St Jeor + macro split (Task 2.1 `lib/nutrition/target.ts`), NOT static DVs. For a library detail view the user-derived target is not available (no user-context in the row), so for THIS surface we fall back to the FDA reference DVs (Protein 50g, Carbs 275g, Fat 78g, Fiber 28g — note FDA `28g` not 25g; **see open question Q1**).

The current hard-coded `50/300/70` constants in `FoodDetailMacros.tsx` were called out as "rough" in the inline comment (line 58–61) and were never canonical. This proposal centralizes them and exposes a numeric DV % to the user.

## Proposed change

### File 1 — `lib/nutrition/macro-dv.ts` (NEW, ~30 lines)

Create a tiny single-purpose module exposing the FDA macro reference DVs used by the library detail view:

```ts
/**
 * Macro Daily Values — FDA 21 CFR §101.9 reference table, 2,000 kcal diet.
 * Used by `<FoodDetailMacros />` for at-a-glance DV-% on library cards.
 * NOT to be confused with USER targets (Mifflin-St Jeor) used by the
 * dashboard — those depend on profile and are computed in lib/nutrition/target.ts.
 */
export const MACRO_DV_G = {
  protein: 50,   // FDA DV 50g
  carbs: 275,    // FDA DV 275g (updated 2016)
  fat: 78,       // FDA DV 78g
  fiber: 28,     // FDA DV 28g (note: dashboard uses 25g per WHO RNI — see ADR/open question)
} as const;

export type MacroKey = keyof typeof MACRO_DV_G;

export function macroDvPct(value: number | null | undefined, key: MacroKey): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / MACRO_DV_G[key]) * 100);
}
```

Single source of truth for the four reference DVs. Pairs with existing `lib/nutrition/micros-rda.ts` (already used as canonical micro reference). `Math.round` keeps the displayed number an integer; `null` for empty/zero so the caller can omit the line entirely instead of rendering "0% DV."

### File 2 — `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`

Three structural edits:

1. **Promote fiber into the macros block.** Add a 4th `<MacroDisplay>` row beneath Fat, keyed `fiber`, value `macros.fiber_g ?? null`, unit `'g'`, color `var(--color-slate)` (matches dashboard MacroBars `MACRO_COLORS.fiber`). Same `errorKey: 'fiber_g'` + `inputValue: draft.fiber_g` wiring used in the existing micros editing branch.

2. **Remove fiber from `<MicrosReadOnly>`.** Drop the fiber `rows.push(...)` block at lines 298–304 (and the `fiberG` prop + corresponding prop type). Read-only micros block now renders sugar + sodium only. Editing branch (lines 163–207) keeps fiber alongside sugar/sodium — they're all editable numerics regardless of display category; the visual grouping change is read-only-display-only.

3. **Add DV % sub-line to every `<MacroDisplay>` row.** Extend the read-only branch (lines 263–285) to render a third inline element after the value: a small JetBrains Mono span showing `· {pct}% DV`. Source: `macroDvPct(value, key)` from File 1. If `null` (no value or 0), omit the line entirely. Replace the local `PROTEIN_TARGET`/`CARBS_TARGET`/`FAT_TARGET` constants (lines 62–64) with `MACRO_DV_G` from File 1; the bar's `fill` denominator now flows from the canonical table too (so bar % and rendered DV % AGREE — currently they would diverge: bar uses local 50/300/70, sub-line would use FDA 50/275/78). Fiber uses `MACRO_DV_G.fiber = 28`.

DOM sketch for each macro row (read-only):
```html
<div class="kalori-fd-macro-row" role="progressbar" aria-valuenow={pct}>
  <span class="kalori-fd-macro-label">PROTEIN</span>
  <span class="kalori-fd-macro-value num">23g</span>
  <span class="kalori-fd-macro-dv num">· 46% DV</span>  <!-- NEW -->
  <div class="kalori-fd-macro-bar">...</div>
</div>
```

aria-label becomes `${name} ${formatGrams(value)}${unit}, ${pct}% daily value` to keep screen-reader parity with the new visible text.

### File 3 — `app/globals.css`

Add one new class `kalori-fd-macro-dv` mirroring `kalori-fd-macro-value` typography but in `dust` (subdued — DV % is reference data, not the headline number):

```css
.kalori-fd-macro-dv {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-dust);
  letter-spacing: 0;
}
```

Grid template for `.kalori-fd-macros` row may need a column added (currently 2-col `1fr auto`; will need `1fr auto auto` plus the bar spanning all three on the next track). Confirm with the existing CSS at `globals.css:3610–3640` during implementation; if the bar is on a separate grid row already, only column count for the value-side header changes.

### File 4 — `lib/i18n/en.ts`

Add one i18n string under `library.detail`:
```ts
macroDvSuffix: '% DV',
```
Library detail view picks this up via `t.library.detail.macroDvSuffix`. Keeps the formatted string out of the component, matching the rest of `t.library.detail.*` usage.

### File 5 — `tests/components/library/FoodDetailMacros.test.tsx` (RED → GREEN)

Existing test (suspected — verify path during implementation) likely asserts protein/carbs/fat appear in the macros block and fiber appears in the micros block. Rewrite:

1. RED: assert fiber renders inside `[data-testid="food-detail-macros"]` (NOT `food-detail-micros`) — fails today because fiber is in `MicrosReadOnly`.
2. RED: assert each visible macro row has a `% DV` substring matching `/\d+% DV/` (or an `aria-valuenow` integer between 0 and 999) — fails today because no DV line exists.
3. RED: assert font-family of fiber's label element resolves to `var(--font-sans)` (Inter via the `kalori-fd-macro-label` class lookup) — fails today because it resolves to `var(--font-serif)` (Newsreader).
4. GREEN: apply File 1–4 changes. Tests pass.

The Font-family assertion goes via `getComputedStyle(element).fontFamily` OR by checking the rendered class name contains `kalori-fd-macro-label` — pick the cheaper/more-stable variant in the test runner (vitest+jsdom resolves CSS variables poorly; class-name check is the durable assertion).

### File 6 — visual baselines (defensive sweep)

If `tests/visual/library*.spec.ts` or `tests/e2e/library/library-visual.spec.ts` snapshot the food detail view, baselines will diff (new fiber row in macros block + new DV column). Re-record after implementation:
```
npx playwright test tests/visual/library --update-snapshots
```
List this as a Phase 4 verification step, not a Phase 1 RED.

## TDD sequence

1. **RED 1** — `FoodDetailMacros.test.tsx`: assert fiber is inside macros block, has the `kalori-fd-macro-label` label class. Run; expect fail.
2. **RED 2** — same file: assert each macro row exposes `/\d+% DV/` text. Run; expect fail.
3. **GREEN 1** — create `lib/nutrition/macro-dv.ts` + add corresponding unit test (`tests/unit/lib/nutrition/macro-dv.test.ts`) covering `macroDvPct(0)` → `null`, `macroDvPct(null)` → `null`, `macroDvPct(25, 'protein')` → 50, `macroDvPct(NaN)` → null.
4. **GREEN 2** — refactor `FoodDetailMacros.tsx` per File 2; add CSS class per File 3; add i18n string per File 4. Run RED tests; expect pass.
5. **Regression sweep:**
   - Full `tests/components/library/*` run.
   - `tests/integration/library-page.test.tsx`.
   - `tests/e2e/library/library-detail.spec.ts` (or equivalent).
   - Visual baselines re-record if RED.

## Regression risk surface

- **No API/DB change.** No mutation surface touched. Library refresh-interceptor tests unaffected.
- **No accessibility regression** — new DV span is purely additive; aria-label extends rather than replaces; bar role + valuenow already present and still consistent.
- **CSS bleed:** new `.kalori-fd-macro-dv` class is FoodDetail-scoped (prefix `kalori-fd-`); collision-free.
- **Visual snapshots will diff** — re-record after implementation.
- **i18n surface:** adds one new key (`macroDvSuffix`); follows existing convention; no breakage.
- **Type drift:** `macros.fiber_g?: number` is already optional in `LibraryItem`; the new `<MacroDisplay>` row reads `macros.fiber_g ?? null` exactly like protein/carbs/fat. No type guard needed.
- **Editing branch parity:** fiber's edit-mode input stays where it is (in the micros editing block). Read-only display is the only thing that moves. Consider in implementation whether to ALSO move the edit-mode input to the macros block for full symmetry — flagged as Q3 below.

## Out of scope (do NOT touch)

- Dashboard `<MacroBars />` (`components/dashboard/MacroBars.tsx`) — already styles fiber correctly as a macro.
- `<MicrosRdaPanel />` and the 30-micro panel — separate feature, separate canonical table.
- Sugar — user explicitly named "fiber"; sugar stays in micros block (per current behavior). Note: design-doc treats sugar as a sub-component of carbs rather than a top-tier macro; leave alone unless user expands scope.
- Sodium — stays in micros block; design intent is correct there.
- Vietnamese DV alternatives — codebase has no Vietnamese DV table; FDA DVs are the de facto reference. Flag as Q2 to user.

## Open questions

1. **Q1 — Fiber DV value: 25g or 28g?** Codebase has TWO active figures: `lib/dashboard/aggregate.ts:58` uses `FIBER_TARGET_G = 25` (WHO RNI baseline); FDA DV is 28g; this proposal uses 28g for library FoodDetail (FDA reference, consistent with the other macros). The two will visibly diverge: dashboard fiber arc reads "X / 25g," library detail will read "X / 28g · % DV." Options: (a) accept divergence — dashboard = user target, library = reference DV (different surfaces, different meanings); (b) unify to 28g (modify `FIBER_TARGET_G`); (c) unify to 25g (use 25 in `MACRO_DV_G.fiber`). Default proposal: option (a) — different surfaces have different meanings, and the library detail's DV is FDA reference for at-a-glance scanning, not a user-tuned target. CONFIRM with user.
2. **Q2 — Does the user need Vietnamese DV references?** PRD says Vietnamese nutrition primary, Western secondary. No Vietnamese DV table exists in codebase. FDA DVs match what most Vietnamese consumer food labels actually print (Vietnam adopted FDA-style %DV labeling under Circular 29/2015/TT-BYT). Default: ship FDA DVs and flag a follow-up task to research Vietnamese DV table if user objects.
3. **Q3 — Should fiber's edit-mode input also move to the macros block?** Currently fiber + sugar + sodium edit inputs all live together. Read-only display moves fiber to macros; edit stays parallel. Symmetry says move it; minimal-diff says leave. Default: leave edit-mode inputs unchanged (keeps the edit panel layout stable, matches the "minimum code" principle). User can override.
4. **Q4 — Does the DV line need to surface in any other library context?** LibraryCard summary line currently shows "Pg Cg Fg" macros (no DV); user's bug is scoped to detail view ("when we open the library item"). Default: detail view only.
5. **Q5 — Should we deprecate/remove the bar visual once we have a numeric %?** The bar is a visual scale + the new "%DV" line is a numeric scale; some users will find both redundant. Default: keep both — bars are scannable, DV % is precise. User can prune later if cluttered.

## Acceptance criteria

- In `/library/[id]` (read-only mode), all four macros — Protein, Carbs, Fat, Fiber — render under the `food-detail-macros` testid with identical label/value typography (Inter UPPERCASE dust label, JetBrains Mono ivory value).
- Each macro row shows a "X% DV" suffix in JetBrains Mono dust, computed from `macroDvPct(value, key)` against the FDA reference table in `lib/nutrition/macro-dv.ts`.
- Fiber is no longer rendered in `<MicrosReadOnly>`; the read-only micros block contains only sugar + sodium (or shows the "no micros" empty state if both are null).
- Edit-mode inputs unchanged.
- `aria-valuenow` on each macro `progressbar` reads the integer DV % (0–999 clamped).
- All existing FoodDetail component + integration tests green after refactor. Visual baselines re-recorded if affected.
- No new lint errors. No type errors.

## Estimated effort

- Investigation: complete.
- Implementation: ~40 min (one component + one new module + CSS + i18n).
- Test rewrite + new unit test: ~25 min.
- Visual baseline re-record + verification: ~15 min.
- Total: ~80 min wall-clock for one engineer.
