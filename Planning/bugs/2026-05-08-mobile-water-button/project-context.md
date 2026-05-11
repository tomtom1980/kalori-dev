# Project Context — bugfix-2026-05-08-mobile-water-button

**Project:** Kalori — AI-first calorie/nutrition PWA, dark-only single-user MVP (Vietnamese-first nutrition).

**Tech stack:** Next.js 16 + React 19 + TypeScript strict, Tailwind v4 + shadcn/ui, Supabase (auth + Postgres + RLS + Storage), Gemini Flash for AI, Vercel deploy (function region `iad1`), Sentry errors-only. Test runner Vitest + Playwright (E2E). Design language "The Ledger" (dark editorial, oxblood `#8A2A1F` + ivory `#F4EBDC` on `#0E0A08`). Currently in MVP Stabilization sprint.

**Recent direction — `2026-05-08-mobile-ui-overhaul` batch (commit `bb539df`):** shipped 5 mobile UI fixes including Bug #5 — a dual-FAB pattern that adds a water FAB beside the food FAB on mobile. Bug #6 (water-logging) was dropped because water-logging already exists end-to-end (Phase 3 Task 3.5: `water_log` table + RLS, `/api/water/log` POST, dashboard WaterTracker chip). User chose **Path A**: water FAB navigates to existing `/dashboard` WaterTracker chip — no new flow.

**Water-button feature paths (explicit, from CHANGELOG):**
- `components/nav/log-fab.tsx` — variant prop adds water FAB (8px gutter, 56×56, side-by-side at z-index 41)
- `components/nav/nav-shell.tsx` — dual-FAB host
- `app/(app)/dashboard/page.tsx` — WaterTracker chip target
- `lib/i18n/en.ts` — water FAB i18n keys
- Tests: `tests/components/nav/log-fab.test.tsx`, `tests/components/nav/nav-shell.test.tsx`, `tests/visual/dual-fab-layout.spec.ts`, `tests/e2e/nav-responsive.spec.ts`

**Open follow-ups from prior batch (P2, non-blocking):** orphaned `@keyframes` in globals.css, `useReducedMotionVariants` raw hook usage, LibraryTab finite-quantity guard, baseline drift on `library-visual.spec.ts → empty-state-sm-390.png`.
