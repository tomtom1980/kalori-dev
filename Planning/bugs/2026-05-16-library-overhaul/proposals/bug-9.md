# Bug 9 — Library Detail: Micros collapsed-by-default with Expand toggle

## Verbatim bug description
"As for the minor items, it should be shown there as well. We should actually show micro items and there should be an expand button to see all of them, but not by default."

## User intent (parsed)
On the library item detail view, micronutrient rows (vitamins, minerals — beyond fiber/sugar/sodium) should be REACHABLE but COLLAPSED by default. A Disclosure button reveals the full set on demand. The 3 already-rendered macro-adjacents (fiber, sugar, sodium) stay visible at all times; vitamins/minerals (calcium, iron, vit-D/C/A/E/K/B*, magnesium, potassium, zinc, etc.) live in the collapsed panel.

## Classification — `known_fix`
- Render path EXISTS (`<div className="kalori-fd-micros">` in `FoodDetailMacros.tsx:162-215`), but currently only renders fiber/sugar/sodium — every other micro key in `nutrition.micros` (a `Record<string, number>` per `lib/library/fetch.ts:40`) is dropped on the floor.
- Pattern to use is already in repo: `WhyTheseNumbers.tsx` uses Radix `@radix-ui/react-collapsible@1.1.12` (already in package.json:34) with full a11y wiring (`aria-controls`, auto `aria-expanded`, caret rotation, prefers-reduced-motion).
- The dashboard's `components/dashboard/MicrosOverflowToggle.tsx` is a sibling reference for "show more micros" behaviour and the priority-ordering helper `lib/nutrition/display-micros.ts` (sortMicrosByPriority) is already shipped.
- No schema change. `food_library_items.nutrition` is JSONB with `micros: Record<string, number>` per `architecture.md §2.4` (line 234) — vitamin/mineral keys are arbitrary strings; we render every key present.

## Current state (FoodDetailMacros.tsx)
Read-only branch (`MicrosReadOnly` helper, lines 288-340):
- Renders ONLY `fiber_g` (from `macros.fiber_g`), `sugar_g` (from `macros.sugar_g`), `sodium_mg` (from `micros.sodium_mg`)
- Iterates `rows[]` array, hardcoded to 3 known keys
- `"food-detail-no-micros"` empty state fires only if all 3 are null
- ALL OTHER micros in `nutrition.micros` (e.g., `calcium_mg`, `iron_mg`, `vitamin_c_mg`) are silently dropped

Edit branch (lines 163-207): fiber, sugar, sodium inputs only. EDIT BEHAVIOUR IS OUT OF SCOPE for this bug — only the read-only view is changed. (Editing additional micros would require schema additions to `useFoodDetailEdit` reducer + zod schema + a separate UX decision; user intent is "show by default, expandable" not "expose for edit".)

## Proposed fix
1. **Always-visible block** stays as today: fiber/sugar/sodium rows when present. These three are the "minor items shown by default" — they're already visible (this is the "shown there as well" part of the request, confirming current behaviour is correct).
2. **Add collapsed expansion block** below the 3 always-visible rows: a single `<Collapsible.Root>` from `@radix-ui/react-collapsible` (default `open={false}`) with:
   - Trigger button: `"Show all nutrients"` / `"Hide nutrients"` toggle, mono-caps kicker style, hairline-top + hairline-bottom (reuse `.kalori-why-trigger` CSS pattern from `app/globals.css` — confirmed adjacent to WhyTheseNumbers usage).
   - Trigger encloses ▸ caret with `aria-hidden="true"`, rotates 0→90° via `[data-state="open"]` selector.
   - Content panel: iterates `Object.entries(item.nutrition.micros ?? {})` MINUS the keys already shown above (`sodium_mg`), sorted via `sortMicrosByPriority` (already exists in `lib/nutrition/display-micros.ts`). Each row: micro name (humanized from snake_case → "Vitamin C"), value with unit derived from key suffix (`_mg` → mg, `_mcg` / `_ug` → µg, `_g` → g, fallthrough → unitless).
   - If the panel is empty (only `sodium_mg` present, or `nutrition.micros` is `{}`/missing), DO NOT render the toggle (no expandable affordance to expand into nothing). `food-detail-no-micros` empty state is unchanged for the macro-adjacent triplet path.
3. **A11y contract (mandatory):**
   - Radix `Collapsible.Trigger` auto-wires `aria-expanded` (`true|false`) and `aria-controls={contentId}`. Cite [Radix Collapsible docs](https://www.radix-ui.com/primitives/docs/components/collapsible) — `aria-expanded` flips automatically; we do NOT manually manage it.
   - Content has explicit `id={useId()}` for the aria-controls relationship.
   - Trigger label text must change on toggle ("Show all nutrients" → "Hide nutrients") so screen readers announce the state change beyond just the boolean. Per WCAG 4.1.2 (Name, Role, Value), aria-expanded alone is sufficient for AT but label-flip is a redundant-cue practice the codebase already uses (`MicrosOverflowToggle` and `WhyTheseNumbers` precedent).
   - Reduced-motion: caret rotation collapses to 1ms via existing `@media (prefers-reduced-motion: reduce)` rule on `.kalori-why-caret`-style class (reuse or sibling-name `.kalori-fd-micro-expand-caret`).
4. **Animation:** content height transition handled by Radix `data-state` + CSS `data-[state="open"]:animate-…` if Tailwind animate-on-state is wired; otherwise simple `transition: height` via CSS variable `--radix-collapsible-content-height` (Radix-provided). **No Framer Motion required** — Radix Collapsible ships its own CSS variable. Lessons-relevant line 13 (`useReducedMotionApp` wrapper) does NOT apply here because there's no JS-driven height animation; CSS transition handles it.
5. **Animation library decision:** Use Radix Collapsible's CSS-variable approach. Adding Framer Motion `<m.div>` here is unjustified weight per Coding Principle 2 (Simplicity First) — pattern already established in `WhyTheseNumbers.tsx`. Cite ui-design.md §9.4 (LazyMotion mandate applies WHEN Framer is used; not used here, no violation).

## Open questions for user (RESOLVED, no stop-the-world)
- **Unit derivation:** key suffix → unit (`_mg`/`_mcg`/`_ug`/`_g`). Default decision: derive from suffix; unknown suffix → render raw number. (No user check needed — same convention as `formatMilligrams` already uses.)
- **Edit-mode behaviour:** out of scope. Existing edit branch (fiber/sugar/sodium only) is unchanged. If user later wants to edit other micros, that's a separate task.
- **Micros priority:** reuse `sortMicrosByPriority` (protein > iron > vitamin D > vitamin C > calcium > fiber, then alphabetical) verbatim. No reordering decision required.

## TDD plan (required — logic-touching read render branch)
- **RED step 1:** `tests/components/library/FoodDetail.micros-expandable.test.tsx` — mount FoodDetail with `nutrition.micros = { sodium_mg: 800, calcium_mg: 200, iron_mg: 2.5, vitamin_c_mg: 30 }`. Assert (a) sodium row visible by default, (b) calcium/iron/vitamin-c rows NOT visible by default (`queryByText` returns null), (c) `food-detail-micros-expand-trigger` testid present with `aria-expanded="false"`, (d) after `click()`, trigger has `aria-expanded="true"` AND calcium/iron/vitamin-c rows ARE visible. → fails because trigger doesn't exist.
- **RED step 2:** Same fixture with `nutrition.micros = { sodium_mg: 800 }` only — assert toggle NOT rendered (no expand affordance with empty content). → fails or passes vacuously; either way pinned post-impl.
- **GREEN:** add Collapsible.Root + Trigger + Content with the filtered + sorted micros render.
- **A11y test addendum:** extend `tests/components/library/FoodDetail.a11y.test.tsx` fixture `micros: { sodium_mg: 800 }` → upgrade to include `calcium_mg`, `iron_mg`, `vitamin_c_mg` and assert axe-clean both collapsed and expanded states. Cite lessons line 15 (RED-first axe on real composed markup, not isolated audits).

## Files touched (estimate: 2-4)
1. `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — add Collapsible block in `MicrosReadOnly` (filter out keys already rendered, sort via priority helper, humanize keys, derive unit). ~40 LOC added.
2. `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` — add `humanizeMicroKey(key: string): string` and `unitFromKey(key: string): 'g'|'mg'|'mcg'|''` helpers. ~20 LOC.
3. `app/globals.css` — add `.kalori-fd-micros-expand-trigger` + `.kalori-fd-micros-expand-content` selectors (reuse `.kalori-why-trigger` cascade if visual is identical; else sibling class). ~15 LOC.
4. **TEST:** `tests/components/library/FoodDetail.micros-expandable.test.tsx` (NEW, ~80 LOC) + edit to `FoodDetail.a11y.test.tsx` (fixture upgrade ~3 LOC).
5. **i18n** — `lib/i18n/en.ts` — add `library.detail.microsExpand` / `microsCollapse` / `microsAllNutrients` keys. ~5 LOC.

## Regression risk: LOW
- No data path / API / RLS touch.
- No edit-flow touch.
- Existing fiber/sugar/sodium triplet rendering unchanged (additive expansion block only).
- Existing `food-detail-no-micros` empty state path unchanged.
- LibraryItem type contract unchanged (already accepts `Record<string, number>` for `micros`).
- Reduced-motion already honored by Radix data-state CSS pattern.
- **One subtle risk:** `MicrosReadOnly` uses `style={{ display: 'contents' }}` per-row to flatten into parent grid. Adding a Collapsible block inside the same grid container may break the row pairing (`kalori-fd-micros` grid template). Mitigation: render Collapsible AFTER the existing 3-row grid (as a sibling `<div>` not a grid child) — small visual layout decision flagged for the implementation sub-agent.

## Stop-the-world flags: NONE
- No schema migration.
- No RLS change.
- No animation library addition (Radix Collapsible already in deps).
- No new component primitives.
- Edit-mode out of scope, explicitly carved out.

## One-liner for main agent
Library FoodDetail micros block currently renders only fiber/sugar/sodium and silently drops every other key in `nutrition.micros` — wrap a Radix Collapsible (`@radix-ui/react-collapsible@1.1.12` already in repo) around an additional iterator over the rest of the micros keys (sorted by `sortMicrosByPriority`, units derived from key suffix), default closed, `aria-expanded` auto-wired by Radix.

---

**Return summary (≤200 words):**
- Bug ID: 9
- Classification: `known_fix`
- File count: 3-5 (component, format helper, CSS, 1-2 tests, i18n)
- TDD required: YES (read-render branch logic change)
- UI touching: YES (cite Radix Collapsible pattern + reduced-motion CSS + WCAG 4.1.2 aria-expanded)
- Risk: LOW
- One-liner: Wrap micros panel beyond fiber/sugar/sodium in a Radix Collapsible default-closed; sort via `sortMicrosByPriority`; derive units from key suffix.
- Stop-the-world flags: NONE
- Open questions: NONE (all resolved against existing patterns)
