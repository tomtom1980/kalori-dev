# Project Context — `kalori` — Mobile Bottom Nav Bugfix Batch

**Batch:** `2026-05-17-mobile-bottom-nav`
**Project slug:** `kalori`

## Tech stack (confirmed)
- Next.js `^16.2.4` (App Router)
- React `^19.2.5`
- Tailwind v4
- shadcn/ui primitives
- TypeScript strict
- Supabase + Gemini backend (not relevant to nav bug)

## Design tokens — relevant to bottom nav
- **Palette:** oxblood `#8A2A1F` (signature/active), ivory `#F4EBDC` (active text/icon, focus ring), near-black `#0E0A08` (bg-0), `bg-1` (nav surface), `dust` (default tab text/icon), `rule-strong` (1px hairline)
- **Geometry:** zero-radius, hairline rules, **no shadows**
- **Fonts:** Newsreader serif (display), Inter (UI labels — T10 nav items Inter 500 11px 0.18em tracking), JetBrains Mono (data)
- **Tap target:** 44×44 minimum (WCAG 2.5.5 referenced repeatedly)

## Bottom-nav component file paths (MANDATORY)
- **Primary component:** `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\bottom-tab-bar.tsx` (84 lines)
- **Destinations source-of-truth:** `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\primary-destinations.ts` (61 lines) — shared across sidebar / rail / bottom tab
- **Parent shell:** `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (529 lines) — renders all three nav patterns via `hidden md:flex xl:flex` guards
- **Related siblings (do not edit unless task requires):** `components/nav/log-fab.tsx`, `components/nav/log-flow-modal-mount.tsx`, `components/nav/sidebar.tsx`, `components/nav/identity-row.tsx`, `components/nav/sign-out-button.tsx`
- **Existing tests:** `tests/components/nav/bottom-tab-bar.test.tsx`, `tests/components/nav/nav-shell.test.tsx`
- **Audit script:** `scripts/nav-audit.mjs`

## ui-design.md Library Prescription for bottom nav (verbatim §6.4)
> **Bottom tab bar:** Fixed 56px + `env(safe-area-inset-bottom)`. `bg-1`, top 1px `rule-strong`. 4 destinations: Dashboard, Library, Progress, Settings. Log NOT a tab. Slot layout: `[Dashboard] [Library] [120px gap for FAB pair] [Progress] [Settings]` (was 72px gap pre-tiebreaker-#24). The bar uses `gridTemplateColumns: 'repeat(4, 1fr)'` so the four destinations distribute evenly across the full viewport width — there is no fixed "middle gap" cell to widen; the FAB pair simply floats at z-index 41 over the centre two tabs (Library + Progress). Tab switch instant; label/icon color 120ms `ink-fade` dust→ivory.
>
> **States:** Default — icon/label `dust`, no top bar. Active — icon/label `ivory` + 2px `oxblood` flush top of slot. Focus — icon/label `ivory` + 2px **ivory** outline + 2px offset.
>
> **Center FAB pair (tiebreaker #3 + #24):** Food (oxblood 56×56, custom SVG + glyph, opens log-flow modal, `data-testid="log-fab-food"`) + Water (bg-1 56×56, custom SVG drop, navigates to `/dashboard`, `data-testid="log-fab-water"`). Container: `position: fixed; left: calc(50% - 60px); bottom: calc(56px + env(safe-area-inset-bottom) + 8px); z-index: 41; gap: 8px;` Pair exists on mobile only (375–767px).
>
> **Rendering strategy (§6.6):** all three nav patterns render unconditionally via Tailwind `hidden md:flex xl:flex` guards — zero `useMediaQuery`. Active-state via `usePathname()` in tiny `<NavActiveIndicator>` client island per nav item.

## Icon library
- **`lucide-react` `^1.8.0`** (in package.json — sole UI icon dep present). Note: ui-design.md sometimes references "Phosphor" glyph names by tradition, but the production icon import is lucide-react. Some FAB glyphs are custom inline SVG per §6.4.

## Mobile breakpoint convention
- **Tailwind defaults** — mobile = `<md` (i.e. 0–767px); tablet `md:` = 768–1279; desktop `xl:` = ≥1280. The 4-row responsive table at §6.6 codifies 375–767 / 768–1279 / 1280+. Bottom tab bar shows via default + `md:hidden` (visible <768), sidebar/rail via `md:flex`/`xl:flex`.

## Recent direction (last 5 commits)
- `d1118c9` test: characterize POST-MVP-CODEX-R2-IDRIFT FoodDetail behaviors (cancel→/library, edit-mode micros collapsible)
- `bc3a57e` test: refresh visual baselines after library refactors + log misc
- `393f9ab` fix: dashboard micros panel — hide rows below 1% of RDA
- `60e85c5` feat: library — meal-slot picker on Log This Now + persist micros on add
- `af5146b` docs: E.CODEX Round-2 closure — 3 fixes + 3 deferred residuals tracked

Project is in **post-MVP polish phase** — bug-bundle batches (E.CODEX, library overhaul, micros display). No active feature work; this batch fits the polish cadence.
