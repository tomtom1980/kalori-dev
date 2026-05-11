# Project Context — Batch 2026-05-09-water-custom-button

## Project Slug
kalori

## Tech Stack
- Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui (PWA, dark-only, single-user MVP)
- Supabase (Postgres + RLS + Auth, dual `kalori-prod` / `kalori-dev`) + Gemini `gemini-flash-latest` + Vercel + Sentry
- Test runners: Vitest (unit + integration) + Playwright (E2E + visual baselines), pnpm 10.29.3, Node ≥20.19.0

## Recent Work Direction
Phase B execution-mode work paused for an MVP-stabilization bugfix sprint. Last 3 commits are bugfix-tomi batches focused on the mobile water FAB shipped in `2026-05-08-mobile-ui-overhaul` (Bug #5 — dual FAB pair). `2026-05-08-mobile-water-button` wired the FAB tap-to-log POST + 2s toast feedback; `2026-05-09-water-fab-ux` fixed toast-latency + dashboard chip staleness + closed `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09`. Current batch will likely target the water FAB / chip surface again.

## Water FAB / Dashboard Surfaces (CRITICAL)
From `Planning/ui-design.md` §6.4 "Mobile bottom tab + center FAB pair (food + water — tiebreaker #3 + #24)":
> "**Center FAB pair:** Food (primary) — 56×56 zero-radius square, oxblood ground, 1px rule-strong border, custom SVG `+` glyph (NOT Phosphor Plus); Water (secondary) — 56×56 zero-radius square, **bg-1 ground**, 1px ivory border, **custom SVG water-drop polygon — `M10 2 L4 12 a6 6 0 0 0 12 0 z` path, 2px ivory stroke, no fill. NOT Phosphor Drop**. aria-label `Log water`, data-testid `log-fab-water`."
> "Container: `position: fixed; left: calc(50% - 60px); bottom: calc(56px + env(safe-area-inset-bottom) + 8px); z-index: 41; display: flex; gap: 8px;`."
> "**FAB motion:** Press scale(0.98) over 80ms; release back to scale(1) over 180ms; ember pulse on release expands to 110% over 180ms at 0.15 alpha. **Per tiebreaker #11, motion uses `LazyMotion + m` from `lib/motion/defaults.ts` — never direct `framer-motion` import.** Reduced-motion: opacity-only 60ms flash."

From `Planning/ui-design.md` §7.1.5 Water Tracker chip (dashboard surface):
> "`<WaterTracker>` — Split (bullet grid + metadata RSC; `<WaterQuickAdd>` client for optimistic state). `water-actions`: 3 chip buttons, **44×44 min**: `+ GLASS · 250ml`, `+ BOTTLE · 500ml`, `CORRECT`. 1px `rule-strong` border, zero-radius, Inter 10.5 UPPERCASE `sand` tracking 0.18em. `+` mono glyph `oxblood`. `slate` tint per tiebreaker #7."

`MobileWheelPicker` primitive (§4.1.10, §10.6.1, tiebreaker #23) exists at `components/primitives/MobileWheelPicker.tsx` (304 LoC) + `components/primitives/MobileWheelSheet.tsx` (206 LoC) + `lib/hooks/use-is-mobile.ts` — currently consumed by Portion Picker (Log flow) only.

## Library Prescriptions Cited
No top-level "Library Prescriptions" section header in `Planning/ui-design.md`. Prescribed libs are scattered inline:
- **Motion / animations:** `framer-motion@12.38.0` via `lib/motion/defaults.ts` (LazyMotion + m + EASE_EDITORIAL + motionPresets + variants + useReducedMotionVariants). **Tiebreaker #11 forbids direct `framer-motion` imports** — must go through `lib/motion/defaults.ts`.
- **Mobile picker UI / 3D wheel picker:** Project-built `MobileWheelPicker` primitive (§4.1.10) — NO third-party wheel/picker library. Built on `LazyMotion + m`. ≤ 50 rows cap. Reduced-motion collapses inertial spring to instant snap.
- **Gestures / touch:** Native browser scroll-snap + Radix Dialog (sheet wrapper). No prescribed gesture library.
- **Charts:** Recharts (dynamic-imported, ssr:false) for most; inline SVG for water adherence (tiebreaker #10).
- **Icons:** `@phosphor-icons/react/dist/ssr/{Icon}` only (no barrel imports). Custom SVG REQUIRED for FAB glyphs.

## Notes for Sub-Agents
- **R1 firewall is in force** — never edit `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`. The water FAB calls `authPost('/api/water/log', ...)` at the call-site only.
- Dirty tree from prior batch: `next-env.d.ts`, `public/sw.js{,.map}`, and ~30 visual baseline PNGs (mostly water-fab-toast + reduced-motion regen + US-5.2 / US-STAB screenshots). Verify these aren't in scope before staging.
- Infra fully configured per `Planning/setup-state.md`. `kalori-dev` Supabase + real `authedPage` Playwright fixture available. Cross-region IAD↔SG latency ~150-200ms — use `waitForResponse` not `waitForTimeout` in E2E.
