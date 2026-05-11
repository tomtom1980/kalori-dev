# Bug 5: Single-FAB pattern doesn't accommodate water-logging entry point

## Classification
known_fix (with design-doc edit — user has explicitly opted in to a design change)

## Root Cause
`Planning/ui-design.md` §6.4 prescribes a single 56×56 zero-radius oxblood FAB centered between Library and Progress (slot `[Dashboard][Library][72px gap for FAB][Progress][Settings]`). The slot is sized for ONE FAB only (72px gap, FAB is 56px wide → 8px gutter each side). User wants two distinct entry points (food + water) in the bottom nav. Spec must be revised to a multi-FAB pattern, FAB component must gain a `variant`, and `nav-shell.tsx` must render two FABs side-by-side. The current FAB is rendered absolute-fixed in `components/nav/nav-shell.tsx` (lines 141–153) at `left: calc(50% - 28px)` over the bottom tab bar — onClick → `useLogFlowStore.getState().openModal('type')` (no analytics events).

## Pattern Choice (Recommendation)

**Primary: Pattern #5 — Two side-by-side FABs with primary/secondary distinction (food = full oxblood 56×56; water = ivory-on-near-black 56×56 outlined variant), both same size for touch-target parity, colour-differentiated.**

Both 56×56 zero-radius squares, sitting side-by-side in a single slot. Total width = 56 + 8px gutter + 56 = **120px**. The current 72px center gap MUST grow to 120px (widen the gap, do not shrink FABs). The bottom-tab-bar slot template becomes `[Dashboard][Library][120px gap for FABs][Progress][Settings]` — at 375px viewport with 4 destinations × ~64px tabs = 256px + 120px gap = 376px (1px overflow tolerated; at 360px viewport tabs compress to ~60px each). Both FABs anchor to the layout absolute-fixed wrapper, no longer `left: calc(50% - 28px)` but `left: calc(50% - 60px)`.

**Rationale:**
- **Aesthetic harmony:** Both share the zero-radius square + custom-SVG `+`/water-drop glyph language. The Ledger brief allows oxblood AND ivory as canonical signature colors (per §3.2 — "5 signature moments retained" includes FAB; ivory is the canonical secondary). Water = ivory ground = semantic match (water is light/clear, fits archival ivory paper aesthetic).
- **Touch targets:** Both FABs hit the 44×44 minimum (56×56 actually). Side-by-side at 8px gutter respects the 44px independent-target rule from WCAG 2.5.5 (Target Size AAA = 44×44 minimum, 8px gap clears adjacent-target collision).
- **A11y:** Two real `<button>`s, each with own `aria-label` ("Log food" / "Log water"), Tab-reaches independently, keyboard-distinct. No long-press, no expansion, no extra tap.
- **Native-feel:** Two FABs is a documented Material 3 + iOS pattern when 2 actions are equally primary. Speed-dial (rejected) is for 3+ secondary actions.
- **Implementation cost:** Minimal — one `variant` prop on existing `LogFAB.tsx`, layout wrapper widens.

**Alternatives considered:**
1. Two side-by-side FABs **same color, same size** — rejected: visually monotonous, no primary-action affordance, food (more frequent) loses emphasis.
2. Vertical stack (food bottom, water above) — rejected: visual height conflict; water FAB would float at `bottom: ~120px + safe-area`, breaking the editorial bottom-anchored composition.
3. Speed-dial / expanding FAB — rejected: extra tap (slower for the "water = quick add" use case which is supposed to be optimistic-first per PRD §3.7), and the spec previously said "no expansion." User opted in to multi-FAB, not to expansion specifically.
4. Long-press for water — rejected: discoverability disaster, fails keyboard a11y (no keyboard-equivalent for long-press exists in HTML). WCAG 2.1.1 violation.
5. Asymmetric sizing (food 56, water 44) — rejected: creates visual hierarchy that says "water is less important" — but PRD §3.7 makes water a first-class metric; 44px also looks awkwardly squashed next to 56px in zero-radius square language.

## Color / Token Plan
- **Food FAB (primary):** `bg = var(--color-oxblood)` `#8A2A1F` (existing), border `1px var(--color-rule-strong)`, glyph `var(--color-ivory)` `#F4EBDC` custom-SVG `+` (existing crosshair shape, unchanged).
- **Water FAB (secondary):** `bg = var(--color-bg-1)` (warm near-black, the same chrome bg as the bottom tab bar), border `1px var(--color-ivory)` `#F4EBDC` (full ivory border to match the ivory water-drop glyph), glyph `var(--color-ivory)` water-drop SVG (custom 20px viewBox, two-rectangle-equivalent simplicity to match Ledger zero-radius vocabulary — a teardrop polygon: `<path d="M10 2 L4 12 a6 6 0 0 0 12 0 z" />` rendered with 2px stroke, ivory). NO new tailwind tokens needed — uses existing `bg-1`, `ivory`, `rule-strong`. **Flag for impl:** confirm `var(--color-bg-1)` resolves correctly inside the FAB stack since the FAB sits OVER the tab bar which is also `bg-1`; if visual collision, fall back to `var(--color-bg-2)`.
- Both 56×56 zero-radius. Side-by-side, 8px gutter.

## Proposed Change (Diff Outline)

### Step A — Update `Planning/ui-design.md`
- §6.4 "Mobile bottom tab + center FAB":
  - Slot layout line: replace `[72px gap for FAB]` → `[120px gap for FABs]`.
  - "Center FAB" subsection title → "Center FAB pair (food + water)".
  - Add per-FAB spec rows (food = oxblood, water = bg-1 + ivory border + water-drop glyph).
  - Position rule: `left: calc(50% - 60px); gap: 8px`. (Replaces the single `left: calc(50% - 28px)`.)
  - Tiebreaker #3 footnote: add Bug-5 amendment line — "Updated 2026-05-08: pattern is now a TWO-FAB PAIR (food primary oxblood, water secondary ivory-on-bg-1). Spec line 'no multi-FAB / expansion' rescinded for the food/water pair specifically; expansion (speed-dial) still forbidden."
  - aria-label of food FAB updated from generic "New log entry" to specific "Log food" so screen readers can distinguish; water FAB gets "Log water".
- §6.6 Responsive table mobile row "Log launcher" cell: `Center FAB (56×56 square)` → `Two FABs (food + water, each 56×56)`.
- §2.4 / `data-testid` registry (line ~3050): add `data-testid="log-fab-food"` and `data-testid="log-fab-water"`; existing `log-fab` aliases to `log-fab-food` for backwards compat with one round of test rename.

### Step B — Implement
- Modify: `components/nav/log-fab.tsx` — add `variant: 'food' | 'water'` prop (default `'food'`); switch background, border, glyph, aria-label, data-testid by variant. Keep file ≤90 lines.
- Modify: `components/nav/nav-shell.tsx` lines 141–153 — wrapper div changes:
  - `left: calc(50% - 28px)` → `left: calc(50% - 60px)`
  - inner becomes `<div style={{display:'flex', gap:'8px'}}>` containing TWO `<LogFAB>` instances:
    - `<LogFAB variant="food" onClick={() => useLogFlowStore.getState().openModal('type')} />`
    - `<LogFAB variant="water" onClick={() => router.push('/log/water')} />` — stub route owned by Bug #6.
  - Wrapper width becomes `120px` (or `auto` from flex children).
- Modify: `components/nav/bottom-tab-bar.tsx` — confirm 4 tabs still distribute correctly when middle gap widens from 72px → 120px; if grid uses fixed slot widths, widen middle slot. (Bug #2 may already touch this file — coordinate.)
- New (water-drop SVG): inline in `log-fab.tsx` under variant branch; no separate icon file.
- Update: `tests/components/nav/log-fab.test.tsx` — add variant tests (renders food vs water glyph, correct aria-label, correct data-testid, distinct onClick).
- Update: `tests/components/nav/nav-shell.test.tsx` — add "renders both FABs" assertion.

## Files Affected
- `Planning/ui-design.md` (sections §6.4, §6.6, §2.4, tiebreaker #3 footnote)
- `components/nav/log-fab.tsx` (variant prop, water glyph branch)
- `components/nav/nav-shell.tsx` (lines 141–153 wrapper rewrite)
- `components/nav/bottom-tab-bar.tsx` (gap-width adjustment if grid is fixed-slot)
- `tests/components/nav/log-fab.test.tsx` (variant tests added)
- `tests/components/nav/nav-shell.test.tsx` (multi-FAB assertion added)

## TDD Required
**yes** — both FABs must render at mobile viewport, each with correct onClick, each keyboard-reachable separately, each with distinct aria-label. Logic-touching (variant switch, route navigation) → mandatory failing tests first.

## Test Approach
- **Unit (log-fab.test.tsx):** renders `variant="food"` → asserts oxblood bg + crosshair `+` glyph + `aria-label="Log food"` + `data-testid="log-fab-food"`. Renders `variant="water"` → asserts bg-1 bg + ivory border + water-drop glyph + `aria-label="Log water"` + `data-testid="log-fab-water"`. onClick fires distinctly per variant.
- **Unit (nav-shell.test.tsx):** mobile viewport renders both FABs; both visible; tab order is `…Library, food-FAB, water-FAB, Progress…` (or reverse — confirm with design).
- **A11y test:** `axe-core` against the bottom-nav region; both FABs report distinct accessible names; both reachable via Tab key sequentially; no `aria-label` collision.
- **Visual regression at 375 viewport** for the bottom-nav region — golden image in `tests/screenshots/`. Also at 360px (smallest target) to confirm overflow stays under 1px.
- **E2E (Playwright):** `mobile.spec.ts` — click `data-testid="log-fab-food"` opens log modal; click `data-testid="log-fab-water"` navigates to `/log/water` (will 404 until Bug #6 ships — STUB OK; mark E2E as `.fixme()` until Bug #6 lands).

## Risk Assessment
**medium** — design-doc edit (canonical source of truth being amended), new component variant, layout change in critical-path navigation, and a hard cross-bug dependency on Bug #6. Visual regression is the primary safety net.

## Regression Sweep Needed
- Existing `log-fab.test.tsx` and `nav-shell.test.tsx` must continue passing (backwards-compat aliases).
- Visual baselines for `nav-shell-mobile` at 375px, 360px, 414px viewports.
- E2E: existing `n` keyboard shortcut (opens log modal — desktop/tablet only) unaffected because keyboard-shortcut path is desktop/tablet-only per §6.5; document that mobile has no keyboard-equiv for "log water" yet (acceptable — mobile users tap, not type).
- Tiebreaker #3 in tiebreaker registry must reference the amendment so future readers don't reintroduce the "no multi-FAB" rule.

## UI Touching
**true**

## Quick-Pick Citation
`~/.claude/skills/ui-design/mobile-ui-guide.md` — "Quick Reference Native Equivalents" table line: **"FAB (Floating Action Button) | React Native Paper `<FAB>` | Material Design pattern."** The table treats FAB as a single-button Material Design pattern; multi-FAB is implicitly out-of-scope of the quick-pick guidance, which is consistent with the existing ui-design.md §6.4 "no multi-FAB / expansion" rule. **The user's explicit override to allow exactly TWO action FABs (food + water) does not promote this to speed-dial / Material 3 expanding-FAB territory** — it stays a documented two-action-bar pattern (Material 3 "extended FAB pair" precedent). Quick-pick advice: keep both FABs ≥44×44 (we use 56×56), preserve Material's 8dp gutter (we use 8px), use color/border to convey primary vs secondary (we do).

## Design-Doc Edits Required
**YES** — Implementation sub-agent edits `Planning/ui-design.md` §6.4, §6.6, §2.4 + tiebreaker #3 footnote FIRST, then code. The design doc is the source of truth; implementing before the spec edit creates a doc-drift bug.

## Cross-bug Dependency
- **Bug #6 (water logging) owns `/log/water`** — this bug provides the FAB entry-point UI; the route must exist by the time both bugs ship. **Suggested ordering: Bug #6 implements `/log/water` first**, then Bug #5 wires the water FAB onClick to the now-real route. **Fallback if Bug #5 ships first**: water-FAB onClick is a `router.push('/log/water')` stub; Next.js will 404 until Bug #6 ships, but the FAB itself + tests are green. Document in PR: "FAB navigates to /log/water — pending Bug #6 page implementation."
- **Bug #2 (bottom-nav labels)** — both bugs touch `bottom-tab-bar.tsx`. Coordinate: Bug #2 owns label/icon spec; Bug #5 owns the gap widening (72→120). Merge order: whichever ships first updates the file; the second rebases on the first.

## Open Questions
1. **Should both FABs appear on desktop (≥1280px)?** Currently FAB is mobile-and-tablet only per §6.6 (desktop uses sidebar "LOG"). For desktop water-log entry: add a sidebar "WATER" item too, OR rely on dashboard's water bullet quick-add (per PRD §3.7). **Recommendation: keep FABs mobile-only; desktop adds nothing for now (water bullet on dashboard is the desktop entry point).**
2. **Labeled FAB or icon-only?** Spec is icon-only (custom SVG glyphs). Labels would force extended-FAB shape (rectangular with text), breaking the zero-radius square language. **Recommendation: icon-only with `aria-label` only.**
3. **Should the water FAB use a desaturated cyan accent** (e.g., `#5C8A99`) instead of the proposed ivory-on-bg-1? **Recommendation: NO** — adds a new palette token (anti-Ledger), and the ivory-on-bg-1 + ivory water-drop reads cleanly as "secondary, water-themed via shape." Cyan would visually fight the oxblood and dilute the 5-signature-moments rule.
4. **Tiebreaker #3 lineage** — does updating it require a `tiebreakers.md`-style audit entry? **Action: implementation sub-agent runs `git log Planning/ui-design.md` to confirm tiebreaker convention, then matches it.**

## Stop-the-World Triggers (none hit at proposal stage)
- 56-72px slot insufficient → mitigated by widening gap to 120px (still fits at 360px viewport with ~1px overflow).
- A11y not solvable → mitigated by choosing two real buttons (no long-press, no expansion).
- New color tokens needed → NOT triggered (reuses existing tokens).
