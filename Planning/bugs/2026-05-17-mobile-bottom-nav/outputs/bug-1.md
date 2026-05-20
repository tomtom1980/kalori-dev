# Bug 1 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\primary-destinations.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\bottom-tab-bar.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\bottom-tab-bar.test.tsx`

## Tests Added
- `tests/components/nav/bottom-tab-bar.test.tsx`:
  - `renders a decorative <svg> icon inside each tab slot` — asserts each of the 4 tabs contains an `<svg>` child node.
  - `decorates each tab icon with aria-hidden="true" (label carries the semantic)` — asserts every icon has `aria-hidden="true"` (decorative — label + aria-current carry semantic).
  - `renders the icon ABOVE the short label inside each tab (DOM order)` — asserts `childNodes` order: SVG element precedes the text node containing the label, so `flex-direction: column` places it above visually.
  - `inherits tab color into the icon via currentColor (active = ivory, default = dust)` — asserts the parent Link's `color` token still flips dust↔ivory + SVG `stroke` is `currentColor` / null / inherited (no hard-coded override).
  - `keeps the 56px slot floor + 44×44 tap-target floor after adding the icon` — regression guard: slot height = 56px, every tab `minWidth/minHeight >= 44px`.
  - `preserves the 2px oxblood top bar on the active tab post-icon-insertion` — regression guard: active tab still gets 2px oxblood top border, inactive tabs transparent.

## Tests Modified
- `tests/components/nav/bottom-tab-bar.test.tsx` — header comment updated to mention §6.4 icon-column contract; `within` import removed (was added then dropped after DOM-order assertion was simplified).

## Test Run Result
- **`tests/components/nav/bottom-tab-bar.test.tsx`** — 12/12 PASS (6 existing + 6 new).
- **Regression sweep (single batched run)**:
  - `tests/components/nav/bottom-tab-bar.test.tsx` — 12/12 PASS
  - `tests/components/nav/sidebar.test.tsx` — all PASS (no DOM-shape changes since Sidebar destructures only `href / label / testId`, ignores `icon`)
  - `tests/components/nav/nav-shell.test.tsx` — all PASS
  - `tests/integration/focus-ring-token.test.ts` — all PASS (no CSS / outline-token edits)
  - `tests/integration/nav-audit.test.ts` — all PASS (added `icon` field does not affect static href extraction; the audit walks `<Link>` href values only)
  - **Combined: 5 test files, 71/71 tests PASS, 0 fail, 0 skipped.**

## Typecheck / Lint
- `npx tsc --noEmit`: 4 pre-existing errors in unrelated test files (`tests/components/library/FoodDetailMacros*.test.tsx` for sugar_g type drift, `tests/unit/lib/dashboard/canonical-micro-unit.test.ts` for canonicalMicroRda missing export). **Zero new errors introduced by this fix** — verified by grep for `components/nav|primary-destinations|bottom-tab-bar` in tsc output (empty).
- `npx eslint components/nav/bottom-tab-bar.tsx components/nav/primary-destinations.ts tests/components/nav/bottom-tab-bar.test.tsx`: **clean** (no warnings, no errors).

## Deviations from Proposal
- **Icon size 22px** (proposal explicit). Used HTML `width={22}` / `height={22}` attributes on the lucide `<Icon />` rather than `className="size-5"` (Tailwind not always picked up reliably in jsdom). Visual outcome identical. **Aligns with proposal §"Proposed Change > components/nav/bottom-tab-bar.tsx > Icon size: 22px"**.
- **Stroke width 1.75** — matches proposal recommendation.
- **`pointer-events: none` on icon** — added via inline `style={{ pointerEvents: 'none' }}` on the lucide `<Icon />`. Proposal hinted "decorative icon overlay" pattern from DashboardDateControl precedent; I made it explicit so the Link wrapper unambiguously handles taps. Defensive against any future click-bubbling edge case on iOS Safari.
- **`focusable="false"`** added alongside `aria-hidden="true"` — defensive for older WebKit per `aria-hidden + focusable=false` pair the lessons file referenced in DashboardDateControl precedent. Belt-and-suspenders, no functional risk.
- No `data-testid` on the SVG icon itself — the proposal mentioned `data-testid={\`tab-icon-${key}\`}` but my tests use `tab.querySelector('svg')` from inside the existing `data-testid="nav-{key}"` slot, which is equally precise and avoids API surface bloat. **All 4 tabs are covered by a single `querySelector('svg')` per tab; no new testid surface added.**

## Status
**implemented**

## Notes for Codex Review
1. **lucide-react v1.8.0 export aliasing for `LineChart`.** Lucide v1+ renamed `LineChart → ChartLine` but kept `LineChart` as an export alias (`ChartLine as LineChart` in `node_modules/lucide-react/dist/lucide-react.d.ts`). I confirmed this in `node_modules` before importing. If the project pins to a lucide major upgrade in the future, this alias may be removed — switching to `ChartLine` is a one-line edit. Worth checking whether the codebase has a lucide-version-pinning policy.
2. **Sidebar + nav-shell unchanged** — Sidebar destructures only `{ href, label, testId }` and ignores the new `icon` field. TypeScript's structural typing means the added required field on `PrimaryDestination` does NOT break sidebar callers; consumed-property access still works. **Per user's Phase 2 decision, Sidebar and Tablet Rail intentionally do NOT render icons in this batch.** I added a doc-comment in `primary-destinations.ts` clarifying this intent so future contributors don't "improve" sidebar by silently wiring icons.
3. **`pointer-events: none` + `aria-hidden="true"` + `focusable="false"`** on the icon is the canonical "decorative overlay" pattern from the lessons file (DashboardDateControl precedent, line 7 of lessons-relevant.md). The Link wrapper is the operable tap target; the icon cannot steal focus or taps.
4. **Color inheritance via `currentColor`** — Lucide-react v1.8.0 defaults its SVG `stroke` attribute to `currentColor`. The Link's `color` token (`var(--color-ivory)` active, `var(--color-dust)` default) cascades into the SVG automatically with zero new color logic. The unit test asserts this via the `stroke ∈ { null, '', 'currentColor', 'currentcolor' }` invariant.
5. **`tests/integration/focus-ring-token.test.ts`** scans CSS files for `:focus-visible` overrides — my fix touches zero CSS files (only `.tsx` / `.ts`), so the global focus-ring contract is untouched. The lessons-relevant.md warned about prior waves both violating this; I deliberately avoided the trap.
6. **Visual regression baseline at 375px**: my fix changes the rendered DOM (adds an `<svg>` per tab), so Phase 7 Playwright snapshots WILL need regen at the mobile-bottom-nav crop. This is expected and called out in the proposal §"Visual regression (Phase 7)".
7. **`gap: 4px` already on the Link** — the existing inline style includes `gap: '4px'` which now serves the icon↔label vertical spacing per §6.4 (no new flex-gap added; existing geometry repurposed).
