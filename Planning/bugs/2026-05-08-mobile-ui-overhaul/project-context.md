# Project Context — bugfix-tomi 2026-05-08-mobile-ui-overhaul

## Tech Stack
Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase (RLS) + Gemini `gemini-flash-latest` + Vercel + Sentry. Dark-only PWA, single-user, Vietnamese-primary nutrition. PPR + Cache Components + Server Actions + `useOptimistic`.

## Project Status
Sprint MVP Stabilization (Complex FA, brownfield-skip). Phase A ✅ closed (commit `b0cbb53` A.CODEX); Phase B 8/9 — `B.SWEEP` ✅ done at HEAD `a2e4353`; `B.CODEX` next. 3 most recent commits are E2E-flake hardening, not feature work. Phase 3 implementation tasks (incl. `Task 3.5` water tracker) are unstarted — Phase B is patch work over Phase A foundations only.

## Mobile / Responsive Design Specs (ui-design.md)
Mobile-first canonical. Breakpoints (lib/tokens.ts): `mobile: 375`, `tablet: 768`, `desktop: 1280`. Page padding `--page-padding-mobile: 16px`. Containers 4-col / 12px gutter / 20px margin on mobile. Section titles T2 28px mobile / chronometer 200px / wordmark 48px.
**Bottom-nav spec (§6.4):** fixed 56px + `env(safe-area-inset-bottom)`, `bg-1`, top 1px `rule-strong`. **4 destinations only — Dashboard, Library, Progress, Settings** (Log NOT a tab — it's modal launched from FAB). Slot layout `[Dashboard] [Library] [72px FAB gap] [Progress] [Settings]`. Labels render as **Inter T10 11px 0.18em UPPERCASE dust→ivory** — text labels, not icons-only and not abbreviated. Active indicator = 2px oxblood top-border. Three nav patterns rendered unconditionally via Tailwind `hidden md:flex xl:flex` — no `useMediaQuery`, zero hydration flash.
**FAB (§6.4 / tiebreaker #3):** **single 56×56 zero-radius oxblood square**, ivory custom-SVG `+` glyph (NOT Phosphor Plus). Centered between Library and Progress. Single FAB only — no expansion / multi-action. Reduced-motion: 60ms opacity flash.

## Water-Logging Surface
- **PRD scope:** YES — Feature 3.7 fully specced (Goal/Flow/Data Model/Invariants/Optimistic-allowlist). PRD Feature 3.6 also includes water in dashboard composition.
- **DB schema present:** YES in `architecture.md` — `public.water_log` table fully designed (DDL §2.6, RLS 4 policies §3.5, `water_log_user_date_idx`). NOT YET APPLIED to live DB (deferred to Task 3.1).
- **API endpoints planned/built:** YES PLANNED — `POST /api/water/log` (architecture §6 row 6) accepts `{client_id, date, count, unit}`, returns `{row}`, fires `updateTag(TAGS.userEntries(uid, day))`. NOT YET BUILT — owner is Task 3.5.
- **UI components present:** Specced — `<WaterTracker>` + `<WaterQuickAdd>` (ui-design.md §7.1.5): bullet grid, 16×16 slate-fill circles, `+ GLASS · 250ml` / `+ BOTTLE · 500ml` / `CORRECT` 44×44 chips, Newsreader 28px tabular consumed-number meta, ember-pulse on add. Optimistic via `useOptimistic` (one of 3 optimistic-allowlist categories). NOT YET BUILT.
- **Verdict:** **fully scoped, ZERO code shipped.** Implementing this is net-new feature work owned by Task 3.5 — not a bug-fix. **STOP-THE-WORLD if "mobile UI overhaul" intends to deliver water-logging.**

## Library Prescriptions (ui-design.md, relevant for this batch)
No dedicated "Library Prescriptions" section. Inferred from inline references:
- **Wheel/portion picker:** NO wheel-picker library specified. Portion Picker is hand-built flush-serif `VALUE × [UNIT]` (tiebreaker #12, anti-generic — NOT a stepper). Native `<input type="datetime-local">` via shadcn date-picker wrapper for time edits.
- **FAB library:** NONE — hand-built 56×56 zero-radius oxblood square + custom-SVG `+`. No FAB lib (Material/etc.) prescribed.
- **Animation library:** **Framer Motion** with mandatory `LazyMotion + m` import pattern (tiebreaker #11, ~27 KB savings/route). Shared config `lib/motion/defaults.ts` (`EASE_EDITORIAL`, `motion.{micro,standard,expressive,chrono,pageTurn}`, `variants.{inkFade,emberPulse,pageSettle}`). Chronometer arc uses CSS `@keyframes` (NOT Framer per react-perf §11). `Recharts` dynamically imported; Water Adherence inline SVG.
- **Bottom-nav library:** NONE — hand-built `<nav aria-label="Primary">` rendered via Tailwind responsive guards. Active state via `usePathname()` in `<NavActiveIndicator>` client island per item.
- **Scroll/gesture library:** NONE specified. `react-aria/useFocusScope` for focus trap in modals/sheets. Long-press on mobile and right-click on desktop both reach Radix `ContextMenu`. No `@use-gesture`, no `vaul`, no `framer-motion drag`. Bottom-sheet drag-to-dismiss = 48px `drag-handle zone` (FoodDetail §7.3.6) — implementation pattern not prescribed.
- **Discrepancy note:** none flagged from planning artifacts alone (no source-file reads per hard rules). If main agent expects a "wheel picker" or "expandable FAB" or "vaul drawer" overhaul, that conflicts with the canonical hand-built / Framer-`LazyMotion+m` discipline.

## Project slug for lessons-learned tag
kalori
