# Wave 2 — FoodDetail Cluster Implementation

**Batch:** `2026-05-16-library-overhaul`
**Scope:** Bugs 1, 2, 4, 8, 9 — atomic refactor of the FoodDetail surface (route chrome, loading scaffolding, mutation feedback, macro typography + DV, micros expand).
**Result:** ALL FIVE BUGS GREEN. 179 library + nutrition tests pass. Typecheck clean. 0 lint errors.

---

## Bug 1 — FoodDetail route refactor (FADED VIEW root cause)

### Files touched
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — added `mode: 'route' | 'modal'` prop (default `'route'`). Drops scrim + dialog semantics + slide-in animation in route mode. Wrap tagged with `data-mode="route"` so CSS branches the chrome cleanly.
- `app/globals.css` — `[data-mode="route"]` vs `[data-mode="modal"]` selectors. Sheet surface lifted from `bg-0` to `bg-1` so the content tier is visually distinct from the page void (this is the underlying fix for the "faded" look — the sheet was sharing `bg-0` with the empty body behind it).
- `tests/components/library/FoodDetail.a11y.test.tsx` — pre-existing V1 focus-trap tests retargeted at `mode="modal"` since trap is modal-only behavior.

### Tests added
- `tests/components/library/FoodDetail.route-mode.test.tsx` — 7 cases: scrim absence, no dialog role in route mode, `data-mode="route"` attribute, default = route, ESC navigates back, modal mode preserves scrim + dialog role.

### RED → GREEN
- RED: 4 failing assertions confirming the existing component renders scrim + `role="dialog"` unconditionally.
- GREEN: all 7 tests + 9 pre-existing a11y tests pass after the prop split + CSS branch.

### Deviations
- Per the briefing, LibraryTab (in `/log`) does NOT use `<FoodDetail />` — it has its own list/card surface. The `mode="modal"` branch is therefore reserved-but-unused in current code. Kept the legacy chrome intact under that attribute so no future overlay caller has to re-add it.
- Sheet surface lift to `bg-1` is the structural fix; the `data-mode` split is the architectural fix. Both are required.

---

## Bug 2 — Loading animation on open/close

### Files touched
- `app/(app)/library/[id]/loading.tsx` — NEW route-level loading boundary; renders `<FoodDetailSkeleton />`.
- `app/(app)/library/loading.tsx` — NEW close-leg loading boundary; renders `<LibraryGridSkeleton />`.
- `app/(app)/library/_components/FoodDetailSkeleton.tsx` — NEW reusable skeleton. `role="status"`, `aria-busy="true"`, NO `aria-hidden` (per Bug 2 proposal Open Q1 → drop aria-hidden so AT announces "Loading"). Mirrors FoodDetail layout: top-bar / hero / name / portion / kcal / 4 macros / history / actions. Staggered `animationDelay` 100-600ms via existing `.skeleton-pulse` keyframe.
- `app/(app)/library/_components/LibraryCard.tsx` — accepts optional `pending` prop; surfaces `aria-busy="true"` + `data-pending="true"` for the click-feedback cue.
- `app/(app)/library/_components/LibraryGrid.tsx` — threads `pendingId` through to the active card.
- `app/(app)/library/_components/LibraryClient.tsx` — wraps `router.push` in `useTransition`; tracks `navPendingId` + derives `visiblePendingId = navPending ? navPendingId : null` to avoid the `react-hooks/set-state-in-effect` anti-pattern (single derived value in lockstep with `useTransition`).
- `app/globals.css` — `.kalori-library-card[data-pending="true"]` rule (subtle `opacity: 0.7` + `cursor: progress`).
- `lib/i18n/en.ts` — `loadingDetail` / `loadingGrid` strings (lint rule forces i18n for user-visible aria-labels).

### Tests added
- `tests/components/library/FoodDetailSkeleton.test.tsx` — 4 cases: role=status + aria-busy, aria-label contains "loading", NO aria-hidden, ≥6 `.skeleton-pulse` placeholders.
- `tests/components/library/LibraryCard.test.tsx` — extended with the `pending` prop wiring case.

### RED → GREEN
- RED: skeleton file did not exist; LibraryCard had no `pending` wiring.
- GREEN: all 11 tests in the two suites pass.

### Deviations
- Per Bug 2 Open Q2: **YES**, included `/library/loading.tsx` close-leg in the batch (was flagged as user-confirmed default).
- Per Bug 2 Open Q4: chose card-level `opacity: 0.7` dim INSTEAD of a hairline arc spinner pseudo-element. Lighter touch, matches existing `:hover` opacity language, no new keyframes.
- Did NOT add `<button>`-level pending cue on the FoodDetail Back/Close buttons themselves — the route transition is wrapped in `useTransition` in FoodDetail.tsx (separate from LibraryClient's) and the buttons render `data-pending` + `aria-busy` while `navPending` is true. CSS rule paints them at 0.6 opacity. Same pattern, scoped per-component.

---

## Bug 4 — Mutation loading + cross-block

### Files touched
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — lifted `deleteInFlight` state from BulkDeleteConfirmDialog up to the sheet level. Aggregate `sheetBusy = edit.saving || logNowPending || deleteInFlight`. Sheet root gets `aria-busy={sheetBusy}` + `data-busy="true"`. Delete `router.push('/library')` deferred until AFTER `authPost` resolves (was firing before — anti-pattern from lesson #7). ESC handler now gated by `sheetBusy`.
- `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx` — added `deleteInFlight` prop; view-mode `blockOthers = logNowPending || deleteInFlight` disables Log Now / Edit / Delete cross-buttons. Edit-mode disables Cancel during pending mutations. Save shows `aria-busy={saving}`.
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — accepts optional `saving` prop; all numeric inputs (kcal, P/C/F/Fiber, sugar, sodium) get `disabled={saving}` + `aria-disabled` while a mutation is in flight.
- `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx` — `pending` label replaces bare `…` ellipsis with `DELETING…` (new i18n key `t.library.detail.deleting`). CANCEL disabled while pending. `onOpenChange` gated so Radix's ESC + scrim-click paths no-op mid-flight. `aria-busy` on Content + CONFIRM.
- `app/globals.css` — `[data-busy='true']` rule (`cursor: progress`).
- `lib/i18n/en.ts` — `deleting: 'Deleting…'` key under `library.detail`.

### Tests added
- `tests/components/library/FoodDetail.mutation-block.test.tsx` — 6 cases:
  1. Sheet `aria-busy="true"` while Log Now pends (and restored on resolve).
  2. While Log Now pends, Edit is disabled + programmatic click does NOT enter edit mode.
  3. While Log Now pends, Delete is disabled + programmatic click does NOT open dialog.
  4. **Delete-await ordering** — `authPost` call recorded BEFORE `push('/library')` (callOrder array check).
  5. CANCEL inside the dialog is disabled while pending + CONFIRM shows real "DELETING…" word.
  6. ESC does NOT navigate while a mutation is in flight.

### RED → GREEN
- RED: all 6 assertions fail against the prior implementation (no `aria-busy`, no cross-block, `push` fires before POST, `…` ellipsis instead of word).
- GREEN: all 6 pass after the FoodDetail + Actions + Dialog rewrite.

### Deviations
- Per Bug 4 Open Q1: confirmed yes, SAVE also locks cross-operations via the same aggregate flag.
- Per Bug 4 Open Q2: kept label-only swap (matches Log Now precedent); no new SVG spinner. Less diff, same affordance.
- Per Bug 4 Open Q3: ESC IS gated by `sheetBusy`.
- **Did NOT** swap Save's `crypto.randomUUID()` per-call to a persistent client_id ref (I11 retry-safety pattern from Log Now). Out of scope per proposal §7.

---

## Bug 8 — Macro typography + DV % line for all 4 macros

### Files touched
- `lib/nutrition/macro-dv.ts` — NEW module. `MACRO_DV_G` constants (Protein 50g, Carbs 275g, Fat 78g, Fiber 28g per FDA 21 CFR §101.9). `macroDvPct(value, key)` helper returning integer % or `null` for absent/zero/NaN/negative values.
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — Fiber promoted into the macros block as a 4th `<MacroDisplay>` row (was rendered inside the serif-italic `MicrosReadOnly`). All four macros now render a `kalori-fd-macro-dv` span (`· XX% DV`) sourced from `macroDvPct`. Bar denominator unified with the DV table so bar % and DV % agree. `MACRO_COLORS.fiber` added (`var(--color-slate)` — matches dashboard MacroBars).
- `app/globals.css` — `.kalori-fd-macro-dv` (JetBrains Mono, dust token). Grid template for `.kalori-fd-macros .kalori-fd-macro-row` widened from `1fr auto` to `1fr auto auto` to accept the third column.
- `lib/i18n/en.ts` — `macroDvSuffix: '% DV'`.

### Tests added
- `tests/unit/lib/nutrition/macro-dv.test.ts` — 16 cases covering constants, null/undefined/NaN/zero/negative handling, integer rounding, over-100% values.
- `tests/components/library/FoodDetailMacros.test.tsx` — Fiber row in macros block (3 cases), DV % suffix on all 4 macros (4 cases at canonical 50% / 18% / 23% / 50% values), DV omitted when value is zero (1 case).

### RED → GREEN
- RED: 8 of 13 macro-block assertions fail against the old component (Fiber under MicrosReadOnly, no `food-detail-macro-dv-*` test ids exist).
- GREEN: 16/16 unit + 13/13 component tests pass.

### Deviations
- Per Bug 8 Open Q1: chose option (a) — dashboard fiber arc keeps WHO 25g; library detail uses FDA 28g. Different surfaces, different meanings. Documented in `lib/nutrition/macro-dv.ts` header.
- Per Bug 8 Open Q3: edit-mode fiber input STAYS in the micros-block edit area; only the read-only display moves. Minimum diff.
- Per Bug 8 Open Q5: kept BOTH the bar and the DV % number. Bar scans, % is precise.

---

## Bug 9 — Micros with expand button (default collapsed)

### Files touched
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — `<MicrosReadOnly>` extended with a Radix `<Collapsible.Root>` block. Always-visible rows (sugar + sodium, now that Fiber is in macros). Hidden block iterates ALL micros except the always-visible set, filters via `sortMicrosByPriority` (existing `lib/nutrition/display-micros.ts`), humanizes keys (`vitamin_c_mg` → `Vitamin C`), derives units from key suffix. Hidden block + toggle NOT rendered when empty.
- `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` — added `humanizeMicroKey(key)` + `unitFromMicroKey(key)` pure helpers.
- `app/globals.css` — `.kalori-fd-micros-expand-trigger` (Inter UPPERCASE oxblood-soft), `.kalori-fd-micros-expand-content`, `.kalori-fd-micros-expand-caret` (90° rotation on `[data-state="open"]`), label flip via `[data-state-label]`-keyed spans.
- `lib/i18n/en.ts` — `microsExpandShow` / `microsExpandHide`.

### Tests added
- `tests/components/library/FoodDetailMacros.test.tsx` — 5 cases: sodium visible by default, extras hidden + `aria-expanded="false"`, click expands + reveals extras, toggle absent when only sodium present, toggle absent when micros map empty.

### RED → GREEN
- RED: `food-detail-micros-expand-trigger` did not exist; calcium/iron/vitamin_c were silently dropped on the floor.
- GREEN: all 5 pass.

### Deviations
- Did NOT add `useReducedMotionApp` — Bug 9 proposal explicitly says CSS transitions on Radix's `data-state` are sufficient; no Framer Motion. Lessons-relevant line 13 doesn't apply.
- Sugar STAYS in the micros block (per Bug 8 proposal "out of scope: sugar — design-doc treats sugar as a sub-component of carbs"). Sodium also stays as always-visible (the "by default" leg).
- Empty-state path (`food-detail-no-micros`) collapses to "no default rows AND no extras" — kept the existing `noMicros` copy.

---

## Cluster regression check

- **Library component tests:** 131/131 pass (23 files).
- **Library + nutrition combined:** 179/179 pass (27 files).
- **Library integration tests:** 78 passed + 23 skipped (skipped due to ENV var gating, not failures).
- **Typecheck:** clean (`tsc --noEmit`).
- **Lint:** 0 errors, 13 pre-existing warnings (none in changed files).
- **Visual snapshot diffs:** NONE auto-generated in this run. Three are anticipated and approved by the proposal:
  1. Macros block now shows Fiber as a 4th row + DV % on all 4 rows.
  2. Micros block shows a Show/Hide nutrients toggle when extra micros exist.
  3. Sheet surface lifted from `bg-0` to `bg-1` (route mode) — visible as a clean content surface instead of "void continuation". Surface contrast change does not violate WCAG; all text tokens were already AA-compliant on bg-1 (lesson #11 wall-behind-wall check: dust, sand, ivory, oxblood, oxblood-soft on bg-1 are all unchanged from existing dashboard usage).

---

## Hand-off

### Wave 3 (LibraryCard cluster) — contract changes to know about
- `LibraryCard` now accepts an optional `pending?: boolean` prop. When you add the hover-focus animation work (Bug 10) or kebab quick-action menu (Bug 3), do NOT change `data-pending`/`aria-busy` wiring — it's owned by the Bug 2 transition path.
- `kalori-library-card` CSS now branches on `[data-pending='true']` (`opacity: 0.7`, `cursor: progress`). Layer your hover/focus rules AFTER mine so they don't clobber the pending cue when the user happens to hover a card mid-navigation.

### Wave 4 (List / Sort / Separator) — no expected interaction
- Bug 11 separators + Bug 7 sort default + Bug 12 pagination all live in LibraryClient/LibraryGrid plumbing. The Bug 2 transition wiring (`navPending`, `visiblePendingId`) is independent of those concerns; you can edit `LibraryClient.tsx` freely as long as you keep the `onActivate` callback wrapped in `startNavTransition`.

### Wave 5 (Add-to-library + Sketch) — thumbnail render path expectations
- `FoodDetailThumbnail` was NOT touched by this wave. Wave 5 owns it. The new `[data-mode='route']` chrome doesn't change the thumbnail surface contract — the sheet still hosts a centered 320×240 thumbnail block via `kalori-fd-thumb-slot` which is untouched.
- `FoodDetailSkeleton` hero placeholder is sized to match — if Wave 5 changes the thumbnail dimensions, update the placeholder height alongside.
- `MACRO_DV_G` in `lib/nutrition/macro-dv.ts` is the canonical FDA reference table; if Wave 5's manual-create flow needs per-row DV display (e.g. in the new dialog), reuse `macroDvPct` rather than re-deriving.

### Stop-the-world / blocker check
- **NONE.** No prop split conflicts with LibraryTab (it doesn't use FoodDetail). No proposal turned out to be wrong about root cause. No test failed twice for the wrong reason. No file scope grew beyond the listed surface.
