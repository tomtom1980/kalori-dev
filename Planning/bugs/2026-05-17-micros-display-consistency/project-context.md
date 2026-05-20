# Bugfix batch — micros-display-consistency project context

**Slug:** `2026-05-17-micros-display-consistency`
**Project:** Kalori (AI-first nutrition tracker)
**Tech stack:** Next.js 16 (App Router, RSC), React 19, TypeScript strict, Tailwind v4, shadcn/ui, Supabase, Gemini, Sentry, Vercel.

## User rules (both, applied to every display surface)

1. **Sort:** descending by % of RDA consumed.
2. **Filter:** hide rows below 1% RDA.

## Concurrent-session commits since `e8af134`

Three commits landed — these are NOT external; they are this bugfix-tomi batch's own followups (LM-I1 / LM-I2 / LM-SEC-1):

- `42126c0` — `useFoodDetailEdit` canonical-dedup as merge invariant (LM-I2). Touches `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` + tests. Not on the display path — no conflict.
- `d579fbe` — micros input upper bound defense-in-depth (LM-SEC-1). Touches `app/(app)/log/_components/ConfirmationScreen.tsx` (`ConfirmationItemMicros` onChange + max attr) + new test file. Confirmation-edit path only — no conflict with sort/filter rule.
- `e496627` — sodium read symmetry via `canonicalizeMicroKey` (LM-I1). Touches `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (resolveSodiumMg) + new test file. `MicrosReadOnly` is the surface we'll touch; LM-I1 modified the `resolveSodiumMg` helper higher in the same file but NOT the sort/filter logic we'll change. Clean overlap.

**Conflict assessment:** CLEAR. None of the three followup commits modified the sort/filter logic at the rendering layer. The working tree is clean (`nothing to commit`).

## Display surfaces

### Surface A — Dashboard `<MicronutrientPanel />`  ✅ already conformant

- **Component:** `components/dashboard/MicronutrientPanel.tsx` (RSC shell) + `components/dashboard/MicrosOverflowToggle.tsx` (client leaf).
- **Data source:** `aggregateMicros()` in `lib/dashboard/aggregate.ts` (lines 402–516).
- **Sort:** descending by `pct` (line 511–514). Tie-break by `consumed` desc.
- **Filter:** `if (pct < 1) continue;` (line 481). Zero-consumption guard at line 474. Both rules already enforced.
- **No change needed.** Reference implementation.

### Surface B — Confirmation `<ConfirmationItemMicros />` (library-only add flow)

- **Component:** `ConfirmationItemMicros` in `app/(app)/log/_components/ConfirmationScreen.tsx` (lines 1615–1694).
- **Self-gates** on `meta.mode === 'library-only'` (line 1619). Standard log flow renders nothing.
- **Currently:** iterates `DEFAULT_MICROS_LIST` in its declared order (line 1640). Renders editable `<input>` for each of the 30 canonical micros. No sort. No filter.
- **Caveat for analysis sub-agent:** This surface is editable inputs, NOT a read-only view. Filtering `<1%` rows would hide inputs the user might want to type INTO (a row starting at 0% can become non-zero). Sort can apply, filter likely cannot. Needs analysis-sub-agent decision on user intent.

### Surface C — Library `<MicrosReadOnly />` (view mode)

- **Component:** `MicrosReadOnly` in `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (lines 582–730).
- **Currently:**
  - Default rows: sugar + sodium always visible.
  - Extras: filtered by `ALREADY_VISIBLE` set, then `sortMicrosByPriority(extraRowsRaw)` at line 664 (intrinsic priority — protein → iron → vit D → vit C → calcium → fiber → alphabetical).
  - Each row gets `dvPct` via `canonicalMicroRda` + `formatMicroPercent`.
  - **No `<1%` filter.** **No %RDA-descending sort** (uses intrinsic priority sort instead).

### Surface D — Library `<EditMicrosCollapsible />`  OUT OF SCOPE

- Same file, lines 856+. Edit-mode inputs for library detail. Out of scope per main agent.

### Surface E — Other micros surfaces

Audited via `Object.entries(.*micros)` + `sortMicrosByPriority` + `micros.map(` greps. No additional render surfaces found:
- `lib/aggregations/progress.ts` — data aggregation for progress page; not a render component.
- `useFoodDetailEdit.ts` — edit-state machine; not a render component.
- `MicroBreakdownDialog.tsx` — shows contributors for a single row (drill-down), not a panel of multiple micros. Out of the user's listed surfaces.

**Total surfaces in scope: 3** (A reference / B + C need changes / D out-of-scope).

## RDA resolution

- **Function:** `canonicalMicroRda(rawKey: string): number | undefined`
- **Location:** `lib/dashboard/micros-rda-resolver.ts` lines 216–228.
- **Sibling:** `canonicalMicroUnit(rawKey)` at line 170 — same resolution chain.
- **% formula:** `formatMicroPercent(value: number, rda: number | null): number` in `lib/nutrition/display-micros.ts` line 35.

**Profile context:** NOT needed. RDA values are constants in `DEFAULT_MICROS_LIST`. The `F-MICROS-RDA-OVERRIDE-COLUMN` followup (post-MVP per file header) would add per-profile overrides, but until then no profile plumbing is required at any surface. Library detail components already work without user-profile context.

## Recommended Phase 1 analysis sub-agent approach

1. **Surface A** — confirm no regression risk; mention as reference for the unified helper.
2. **Surface C (MicrosReadOnly)** — primary work. Need to:
   - Decide: should `sortMicrosByPriority` be REPLACED with %RDA-desc sort, or both layered?
   - Decide: do sugar + sodium (always-visible defaults) participate in the sort or stay anchored as separate rows? User said "anywhere we display micros, sort + filter" — default rows may need to merge into the sorted list.
   - Add `<1%` filter on the extras (and default rows if merged).
3. **Surface B (ConfirmationItemMicros)** — needs explicit decision: sort the editable inputs by current %RDA? Filter <1%? If the user intends "display" strictly (read-only summary), maybe add a separate sorted read-only summary above the collapsible. Recommend asking user to confirm intent on Surface B at the approval gate.
4. **Helper extraction** — recommend a single shared sort-and-filter helper (e.g., `sortAndFilterMicrosByRdaPct(rows, { minPct: 1 })`) in `lib/nutrition/display-micros.ts` so all surfaces converge on one definition. Helper should accept rows with a known `pct` already computed (or accept a callback to compute it) so it's surface-agnostic.
