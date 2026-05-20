# Bug 1: Mobile bottom-nav buttons need bigger tap area + professional icons

## Classification
**known_fix** — Implementation drifted from `Planning/ui-design.md` §6.4 which explicitly contracts an **Icon column** in the Default/Active/Focus state table ("Icon: dust / ivory / ivory"). The shipped component (`components/nav/bottom-tab-bar.tsx`) renders the `shortLabel` only — no `<svg>` icon child anywhere. The user's "thin, hard to press" perception is the visual consequence of a 56px-tall bar whose entire interior is filled by a 10.5px UPPERCASE label centred via `justifyContent: 'center'` — the slot reads as a label strip, not a button.

## Root Cause
1. **Missing icons.** `Planning/ui-design.md` §6.4 (line 758–762) prescribes a 3-column state table — `Icon | Label | Top bar` — with icon color `dust` (default), `ivory` (active/focus). `primary-destinations.ts` has no `icon` field on `PrimaryDestination`; `bottom-tab-bar.tsx` line 76 renders only `{destination.shortLabel}`. Spec drift, confirmed.
2. **Tap area is contractually correct but visually under-presented.** Slot is `repeat(4, 1fr)` × 56px high with `minWidth/minHeight: 44px` (lines 38, 58–59). On a 375px iPhone each slot is ≈93.75px × 56px — already double the 44×44 WCAG 2.5.5 floor. The user's "thin" complaint maps to **vertical hierarchy**, not horizontal width: a single small label with no icon and no visible boundary feels like "a strip of text," not "a button."
3. **No press feedback.** No `:active` tonal change or scale on press — Sidebar and identity-row patterns elsewhere in the codebase use 180ms tonal ripples; the bottom-tab is bare.
4. **Type size is per-spec but secondary.** 10.5px / 0.18em / UPPERCASE label is correct per §6.4 once an icon sits above it. Adding the icon restores the intended ~24px icon + 4px gap + 13px label-block visual hierarchy that makes the slot read as a button.

## Proposed Change (Diff Outline)

### `components/nav/primary-destinations.ts`
- Add `icon: LucideIcon` field to `PrimaryDestination` interface.
- Import from `lucide-react` (already `^1.8.0` per `package.json` line 52):
  - Dashboard → `LayoutDashboard` (matches "dashboard panels" semantic)
  - Library → `BookOpen` (Ledger metaphor: an open ledger book — design-doc archival broadsheet vibe; `Library` glyph is too "row of books" / institutional)
  - Progress → `LineChart` (matches `/progress` chart-heavy route; `TrendingUp` is too generic / business-y)
  - Settings → `Settings` (no controversy)
- Wire icons into each of the 4 entries.

### `components/nav/bottom-tab-bar.tsx`
- Render icon above the label using flex column (already in place: `flexDirection: 'column'`, `gap: 4px`).
- Icon size: 22px (sits comfortably inside 56px tall slot with 4px gap + 13px label cap height).
- Add `aria-hidden="true"` + `focusable="false"` to the icon — the slot itself already carries semantic via `aria-current` + visible `shortLabel`; the icon is decorative.
- Apply `currentColor` to the icon `stroke` so it inherits the slot's `color` token (which already switches `dust ↔ ivory` based on active state — zero new color logic needed).
- Stroke width 1.75 (lucide default 2 is heavy for editorial Ledger aesthetic; 1.75 stays hairline-consistent with the rest of the design system).
- Confirm `minHeight: 44px` and `minWidth: 44px` remain — keep existing 44×44 floor and 56px slot height.
- Optional polish (recommend YES): add `:active` opacity dip via inline `onPointerDown`/`onPointerUp` is risky for SSR — instead use `transition: 'opacity 120ms'` on the Link and rely on existing `ink-fade` token contract. **Defer to user if any motion change is in scope** (lessons: stay surgical).

### `tests/components/nav/bottom-tab-bar.test.tsx`
- Extend two new test blocks (preserves all 6 existing tests untouched — they still pass because label text + tap area + landmark are unchanged):
  - `renders a lucide icon above the label for each destination` — asserts each tab has a child `<svg>` with `aria-hidden="true"` discoverable via `within(tab).getByTestId('tab-icon-{key}')` (we will add `data-testid={\`tab-icon-${destination.testId.replace('nav-', '')}\`}` to the SVG wrapper).
  - `icon color tracks active state via currentColor` — render two states (`/dashboard` vs `/library`), assert active tab's icon receives `color: var(--color-ivory)` (inherited from parent), inactive receives `color: var(--color-dust)`. In jsdom we assert via `tab.style.color` parent inheritance.

### Files NOT touched (out-of-batch scope, surface as follow-up)
- `components/nav/sidebar.tsx` + `components/nav/identity-row.tsx` already consume `PRIMARY_DESTINATIONS`. Adding `icon` to the type **forces a non-breaking field** (TypeScript fine: new required field but sidebar consumers ignore it). Sidebar/Rail can later render the same icons for design consistency — surface this as an **Open Question** for the user (in-scope-or-not).

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\primary-destinations.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\bottom-tab-bar.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\bottom-tab-bar.test.tsx`

## TDD Required
**yes** — logic-touching (adds new rendered element + new prop on shared type). RED tests first.

## Test Approach
1. **RED Test 1 — icon presence:** Add test `renders a lucide icon for each destination`. Expect `within(screen.getByTestId('nav-dashboard')).getByTestId('tab-icon-dashboard')` to exist; same for library, progress, settings. Run — fails (no icon rendered yet).
2. **RED Test 2 — semantic correctness:** Each icon should have `aria-hidden="true"`. Run — fails.
3. **GREEN:** Add `icon` field to `PrimaryDestination`, wire lucide imports, render icon above label with `data-testid` + `aria-hidden`. Run — both tests pass.
4. **Regression sweep — confirm existing tests still GREEN:**
   - `renders four tabs (no Log tab; FAB handles logging)` — unchanged.
   - `marks the active tab with aria-current="page"` — unchanged.
   - `every tab meets the 44×44 tap-target minimum` — unchanged (minWidth/minHeight unchanged).
   - `exposes a Primary navigation landmark` — unchanged.
   - `renders full-word labels (Dashboard/Library/Progress/Settings)` — unchanged (`shortLabel` still rendered).
   - `keeps textTransform: uppercase` — unchanged.
5. **Integration regression checks:**
   - `tests/integration/focus-ring-token.test.ts` — verify focus ring tokens unchanged (no token edits in this fix).
   - `tests/integration/nav-audit.test.ts` — verify nav-audit static-extraction of `href` from `primary-destinations.ts` still passes (adding `icon` field doesn't break the audit's regex/AST since it only inspects `href`).
6. **Visual regression (Phase 7):** Playwright snapshot of mobile bottom-nav at 375px width — baseline regen required because rendered DOM changes.

## Risk Assessment
**low** — pure additive UI change. Adds a new field to a typed config object + renders one extra child element per slot. No state, no async, no auth surface, no schema. Failure modes:
- TypeScript: `icon: LucideIcon` field becomes required across all consumers of `PrimaryDestination` — Sidebar + identity-row will TS-error if they don't ignore or render it. Mitigation: define `icon` field, ensure sidebar's destructuring drops it (it likely uses object-spread; if not, add `_icon` to destructure-ignore). Verify by `pnpm typecheck` after change.
- Bundle size: `lucide-react` is tree-shakeable per-import; 4 icon imports add ~2 KB gzipped. Negligible against the existing `lucide-react@^1.8.0` baseline (already pulled in via dashboard cards per smart_outline searches in prior sessions).

## Regression Sweep Needed
- `tests/components/nav/bottom-tab-bar.test.tsx` (will be extended in this fix)
- `tests/integration/focus-ring-token.test.ts` (focus-ring token contract — confirm no drift)
- `tests/integration/nav-audit.test.ts` (nav-audit static extraction — confirm `icon` field doesn't break href detection)
- `pnpm typecheck` on `components/nav/sidebar.tsx`, `components/nav/identity-row.tsx`, `components/nav/nav-shell.tsx` — all consume `PRIMARY_DESTINATIONS`; new required field may cascade
- Playwright visual-regression baseline at 375px mobile breakpoint — regen required (DOM change)
- E2E smoke: `npm run dev`, manually navigate `/dashboard` → `/library` → `/progress` → `/settings` on a 375px viewport, verify icon switches dust→ivory on active

## UI Touching
**true** — `components/nav/bottom-tab-bar.tsx` + `components/nav/primary-destinations.ts`

## Open Questions
1. **(Highest priority)** Should the Sidebar (desktop ≥1280px) and Tablet Rail (768–1279px) also render the same lucide icons for design consistency? §6.2 and §6.3 of ui-design.md do not prescribe icons for those surfaces (sidebar is text-led "LOG / DASH / LIB / PROG / SET" rows per the Ledger editorial brief). Recommend **bottom-tab-bar only** for this batch — sidebar/rail icon adoption is a separate design decision the user should make explicitly, not silently expand into.
2. Confirm lucide icon picks: `LayoutDashboard`, `BookOpen`, `LineChart`, `Settings`. Alternatives that fit the Ledger aesthetic: `Newspaper` (Library — matches "broadsheet" metaphor), `Activity` or `TrendingUp` (Progress), `SlidersHorizontal` (Settings — editorial knobs vibe). User aesthetic call.
3. Icon stroke width: 1.75 (hairline, matches design-system "no shadows / hairline rules" rule) vs 2.0 (lucide default, slightly heavier). Recommend **1.75** for Ledger consistency.
4. Active-state press feedback: keep current "no scale, color-only" (matches §6.4 contract — "Tab switch instant; label/icon color 120ms ink-fade") or add a `bg-2` tonal flash on press (matches design-lead §6.3 — tonal-only Ledger philosophy)? Recommend **keep current** — §6.4 explicitly says "Tab switch instant," no scale, no flash. Don't over-add.
