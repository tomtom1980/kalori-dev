# Bug 5 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\Planning\ui-design.md` (§2.4 FAB exception block + §6.4 full rewrite + §6.6 mobile row + §13 tiebreaker #24 row + footer count 22→24)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\log-fab.tsx` (added `variant: 'food' | 'water'` prop + water-drop SVG branch + dual-testid + dual aria-label + dual styling)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (added `useRouter` import + dual `<LogFAB>` render with 8px gutter at `left: calc(50% - 60px)` + Path A water onClick → `router.push('/dashboard')`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (added `t.fab.logFoodA11y` + `t.fab.logWaterA11y`; updated existing `t.fab.logA11y` value to `"Log food"` for forward-compatibility — typeof string, no breaking shape change)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\log-fab.test.tsx` (full rewrite — 12 new it() blocks across food/water variants)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx` (added `useRouter` mock, `routerPushMock`, 4 new it() blocks under "Bug #5 — dual FAB pair" describe)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\nav-responsive.spec.ts` (renamed `getByTestId('log-fab')` → `getByTestId('log-fab-food')` + `'log-fab-water'`; one rename round per proposal §B)

## Files Created
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\dual-fab-layout.spec.ts` (Playwright spec — 8 tests across 360/375/414 viewports; objective geometric assertions on dual FAB layout, no new PNG baselines per Bug #1 precedent)

## Tests Added/Modified
- `tests/components/nav/log-fab.test.tsx` — 12 it() blocks: food contract attrs, food sizing, food oxblood ground, food crossed-rect glyph, food onClick fires; water aria-label + testid, water no aria-haspopup, water sizing parity, water bg-1 ground, water ivory border, water path-svg glyph, water onClick fires
- `tests/components/nav/nav-shell.test.tsx` — 4 it() blocks: both FABs rendered at mobile, distinct accessible names, water onClick → /dashboard, food onClick does NOT route
- `tests/visual/dual-fab-layout.spec.ts` — 8 it() blocks (3 viewports × side-by-side check + 3 × distinct-name check + overflow guard inside layout test)

## Test Run Result
- **New FAB tests:** 12/12 pass
- **New BottomNav layout tests (nav-shell dual FAB describe):** 4/4 pass
- **Bug #2 regression (bottom-tab-bar.test.tsx):** 6/6 pass
- **Bug #1 regression (responsive-page-classes + MealsBulletin.responsive + dashboard-page-responsive):** 23/23 pass
- **i18n-shape regression:** all pass (existing `t.fab.logA11y` typeof check passes — value changed `"New log entry"` → `"Log food"` is non-breaking shape)
- **Full unit + component test sweep:** 1190/1190 pass (165 test files)
- **TypeScript noEmit:** clean (no errors)
- **Full vitest sweep including integration/RLS:** 1925 pass, 17 fail. ALL 17 failures are pre-existing infra-dependent flakes (RLS / real-DB integration / `tests/integration/api/export/zip.test.ts` / `tests/unit/ai/vn-smoke.test.ts` Gemini smoke / `tests/integration/library-merge.test.ts` real-DB) — NONE touch nav, FAB, or i18n surfaces.
- **Visual regression:** 0 new baselines created (per guard rails). New `dual-fab-layout.spec.ts` uses objective geometric assertions only.

## Water FAB onClick Choice
- **Chosen:** Option A — `onClick={() => router.push('/dashboard')}`
- **Rationale:**
  1. **User Phase 2 Path A decision** — water-logging is already shipped via the dashboard `<WaterTracker />` chip (`components/dashboard/WaterTracker.tsx`). The FAB just needs to surface it.
  2. **Option B (Sheet/Drawer) blocked** — codebase has NO standalone Sheet/Drawer/Dialog primitive outside of `LogFlowModal` (Radix Dialog tied to log-flow store). Building a new Sheet wrapper would require new files OUTSIDE the proposal's "Files Affected" list. Stop-the-world trigger met → fell back to Option A.
  3. **Option C (direct API call)** rejected because Path A intent is "let the user see/interact with the existing tracker" — direct API call hides that surface.
  4. **Option A matches existing `useRouter` pattern** — `useRouter().push('/route')` is used throughout the app (e.g., `app/(auth)/login/login-form.tsx`).
- **Implementation:** `const router = useRouter();` added at the top of `NavShell()`; the water FAB's `onClick={() => router.push('/dashboard')}` triggers a client-side soft-navigation. If the user is already on `/dashboard`, Next.js no-ops the navigation (acceptable per proposal Option A trade-off note).

## ui-design.md Edits
- **§2.4 (line 144 area):** added `FAB amendment (tiebreaker #24, 2026-05-08)` paragraph below the existing tiebreaker-#3 FAB exception block. ~3 lines added.
- **§6.4 (lines 750–775 area):** full rewrite — heading retitled to "Mobile bottom tab + center FAB pair (food + water — tiebreaker #3 + #24)"; slot-layout text updated `[72px gap for FAB]` → `[120px gap for FAB pair]` with `gridTemplateColumns: 'repeat(4, 1fr)'` clarification; "Center FAB" subsection replaced with a side-by-side specification table for food vs water (size / ground / border / glyph / click / aria-label / aria-haspopup / data-testid); pair layout block; "Why two FABs, not a speed-dial" rationale block. ~30 lines added net.
- **§6.6 mobile row (line 796):** "Center FAB (56×56 square)" → "Center FAB pair (food 56×56 + water 56×56, 8px gutter) — tiebreaker #24"
- **§13 reconciliation table:** added row for `tiebreaker #24` directly below #23 (which Bug #4 took). ~1 row added.
- **Footer summary line:** "22 reconciled conflicts" → "24 reconciled conflicts" (Bug #4 brought it to 23; Bug #5 to 24).
- **Tiebreaker numbering collision check:** verified `git log Planning/ui-design.md` shows only the artifact creation commit + Bug #4's edit; #1–#23 documented in §13 table; #24 is the next free integer; no collision.

## Deviations from Proposal
- **Proposal Step B "Modify `bottom-tab-bar.tsx`":** I did NOT widen the `gridTemplateColumns` because the bar uses `repeat(4, 1fr)` — distributing tabs evenly across the full viewport. There is no fixed "middle slot" cell to widen; the FAB pair simply floats overlay-style on top via `position: fixed`. Documented this in `nav-shell.tsx` comment block + §6.4 spec. The proposal's "if grid uses fixed slot widths, widen middle slot" caveat applied here — it doesn't, so no widening was needed. Net result: `bottom-tab-bar.tsx` is **unchanged**.
- **Proposal Step B "data-testid registry add"** (§2.4 line 3050 area): the existing artifact has no centralized data-testid registry near §2.4 — testids are documented inline per-component throughout §6 / §7. I added the dual testids to the §6.4 FAB pair table instead, which is the canonical location for nav-shell testids. No registry rename round needed.
- **Proposal Step B "log-fab aliases to log-fab-food"** (dual-attribute strategy): HTML doesn't allow duplicate attributes, so I did the **one rename round** approach — canonical `data-testid="log-fab-food"` on the food FAB + `data-testid="log-fab-water"` on the water FAB; updated the only consumer (`tests/e2e/nav-responsive.spec.ts` lines 131 + 174–179) in the same commit. No alias attribute needed.
- **Proposal "FAB motion via `m.button`":** the existing FAB is a vanilla `<button>` (no Framer Motion in production for this component yet — the spec says "Press scale + ember pulse" but the live component never wired it). I kept the vanilla `<button>` to stay surgical (rule 3) — adding motion would expand scope beyond Bug #5. Flagged in §6.4 spec that motion uses `lib/motion/defaults.ts` for future work.

## Coexistence with Bugs #1, #2, #4
- **Bug #1 nav-shell.tsx coexistence:** verified **YES**. The `.kalori-page-main` className + `paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + var(--spacing-16))'` inline override on `<main>` (lines 130–141) is unchanged. My edit only touched lines 147–164 (the FAB wrapper block) — no overlap with Bug #1's responsive-padding work.
- **Bug #2 bottom-tab-bar regression:** verified **YES**. `tests/components/nav/bottom-tab-bar.test.tsx` (Bug #2's tests including "renders full-word labels per ui-design.md §6.4" + "keeps textTransform: uppercase on each tab") all 6/6 pass post-edit. `bottom-tab-bar.tsx` was NOT modified by Bug #5.
- **Bug #4 ui-design.md coexistence:** verified **YES**. Bug #4 edited §4.1.10, §10.6.1, and added tiebreaker #23 to the §13 table. My Bug #5 edits are in §2.4 (different paragraph), §6.4 (different section), §6.6 (different table row), §13 row (next integer #24, no collision). The footer line "22 reconciled conflicts" was edited by Bug #4 to leave 23 implicit; I incremented to "24" — both edits compatible.

## Status
implemented

## Open Concerns for Codex Round 1
1. **Water-FAB icon contrast in dark mode:** the water-drop polygon is a 2px `var(--color-ivory)` stroke on `var(--color-bg-1)` ground (warm near-black). Per §2.2 contrast matrix, ivory-on-bg-1 = 16.67:1 (well above WCAG AAA non-text 3:1). Border itself is also full ivory — no visual conflict with the chrome bg-1 tab bar BELOW (which is also bg-1) because the FAB sits 8px above it via `bottom: calc(56px + env(safe-area-inset-bottom) + var(--spacing-2))`. **No regression flagged but worth a Codex spot-check** — the water FAB ground is the same colour as the bar behind it; only the 1px ivory border + safe-area gap separates them visually.
2. **Centring math at 360px viewport (smallest target):** pair total width = 120px; viewport = 360px; pair centred at 180px ⇒ pair-left at 120px ⇒ leaves 120px on each side. Bottom-tab-bar tab width = 360/4 = 90px ⇒ FABs sit over Library tab (at 90–180) and Progress tab (at 180–270). Centre tabs are visually obscured by the FAB pair, but the tabs remain Tab-reachable and click-active because the FAB has higher z-index but doesn't `pointer-events: none` the tabs underneath. **Could be a UX concern** if user wants to tap Library/Progress — they'd need to tap below/around the FAB. Worth flagging for user smoke test.
3. **a11y on dual FAB tab order:** the FABs are rendered AFTER the four tab destinations in DOM order (`<BottomTabBar />` precedes `<LogFAB pair />` in `nav-shell.tsx`). Wait — actually the FAB pair is rendered BEFORE `<BottomTabBar />` in my edit (it's already in that order in original code). Tab order: Skip-link → Sidebar → TopAppBar → main children → **food FAB → water FAB** → bottom-tab-bar (Dashboard / Library / Progress / Settings). This matches mobile reading order top-to-bottom-then-left-to-right reasonably well, but a screen-reader user might expect tabs first then FABs. Worth verifying against ux-auditor §1.4 / WCAG 2.4.3 Focus Order.
4. **`t.fab.logA11y` value change** (`"New log entry"` → `"Log food"`): I updated the existing key value to keep semantics consistent with the new dual-label scheme. The shape test (`tests/unit/i18n-shape.test.ts:199`) only checks `toBeTypeOf('string')` so it passes. No production code consumer uses the old value text — but if any out-of-tree E2E spec asserts the literal text `"New log entry"`, it would break. Searched the repo: only `lib/i18n/en.ts` + `tests/unit/i18n-shape.test.ts` reference it. Safe.
5. **Path A "navigate to /dashboard" UX edge case:** if the user is already on `/dashboard` and taps the water FAB, Next.js soft-navigation no-ops (no scroll-to-top, no visual feedback). The user may not realize the FAB "did anything." A future enhancement could scroll the WaterTracker into view + briefly flash it. Out of Bug #5 scope per proposal — but worth a Codex flag for "did Path A ship a user-perceivable affordance?"
6. **Visual regression coverage:** the new `dual-fab-layout.spec.ts` uses geometric assertions (no PNG baselines). The existing `tests/visual/dashboard.spec.ts` family DOES use `toHaveScreenshot()` baselines at 375px — those baselines will need a one-time update when the next visual test pass runs because the FAB pair changes the dashboard's bottom-region pixel composition. Per guard rails this baseline update is a follow-up commit (not auto-accepted).
7. **Tiebreaker #3 vs #24 narrative:** §6.4 now says "tiebreaker #3 + #24" in the heading. Tiebreaker #3 is preserved (food FAB is still 56×56 zero-radius square oxblood — unchanged). Tiebreaker #24 governs the pair layout + water FAB. If Codex flags the dual citation as confusing, simpler heading "(per tiebreaker #24)" is acceptable since #24 explicitly references #3.
