# Project Context — bugfix-2026-05-16-library-overhaul

## Tech Stack (confirmed)
- Framework: Next.js 16 (App Router) + React 19 + TypeScript strict
- Test runner: Vitest (unit/integration/components) + Playwright (E2E, visual, a11y)
- UI library / design tokens: Tailwind v4 + shadcn/ui; "The Ledger" — dark editorial, oxblood `#8A2A1F` / ivory `#F4EBDC` on `#0E0A08`, zero-radius, hairline rules, no shadows; serif Newsreader + Inter + JetBrains Mono
- DB / Auth: Supabase (Postgres + RLS + Auth + Storage), single-user MVP
- AI: Gemini Flash (`gemini-flash-latest`), server-only

## Library Feature (from PRD §3.4)
The Library is the user's personal saved-foods grid — items grow from actual logging (no global food DB). Each `food_library_items` row carries `normalized_name` (indexed), nutrition profile, `log_count`, `last_logged_at`, `thumbnail_url`, `client_id`. Library tab in the log flow renders a frequency-sorted grid with search (`/` keyfocus), filter pills (All/Frequent/Recent/Highest-protein), sort toggle, and multi-select → quantity stepper → "Add selected" → shared confirmation screen. Re-logging bumps `log_count` + `last_logged_at` and inserts `food_entries` with `source='library'` + `library_item_id` FK (`ON DELETE SET NULL` so deletes don't orphan history). Normalized-name equality drives dedup/merge prompts.

## Recent Work Direction (from CHANGELOG + git log)
- Phase D Testing Sweep RED→GREEN closed 2026-05-16; D.CODEX (Phase Codex Review) still pending
- Out-of-band bugfix-tomi shipped 2026-05-16: iOS calendar button on dashboard (commit `def2543`)
- Current sprint = MVP Stabilization (2026-05-01 →); Phase D wrap-up in flight
- Library subsystem already has dense test coverage (RLS, merge, tombstone, dedup, bulk-delete, undo, refresh-interceptor) — overhaul will land on tested ground

## Library Source Files (paths only)
- List/grid component: `app/(app)/library/_components/LibraryGrid.tsx`, `LibraryClient.tsx`, `LibraryMasthead.tsx`, `LibraryToolsRail.tsx`, `LibraryEmptyState.tsx`, `RecentEntriesSection.tsx`, `RecentEntriesEmpty.tsx`
- Item card: `app/(app)/library/_components/LibraryCard.tsx`, `ThumbnailLetterMark.tsx`
- Detail view: `app/(app)/library/[id]/page.tsx`, `app/(app)/library/[id]/not-found.tsx`, plus `_components/FoodDetail/{FoodDetail,FoodDetailMacros,FoodDetailName,FoodDetailHistory,FoodDetailThumbnail,FoodDetailActions}.tsx` + reducer/schema/format/hook helpers
- Actions/menu + dialogs: `BulkActionsBar.tsx`, `BulkDeleteConfirmDialog.tsx`, `MergeDuplicatesDialog.tsx`, `MergeField.tsx`, `SelectModeToggle.tsx`, `SearchBar.tsx`, `SortDropdown.tsx`, `FilterDropdown.tsx`
- Page entry: `app/(app)/library/page.tsx`
- API routes: `app/api/library/list/route.ts`, `[id]/{update,delete,log-now}/route.ts`, `merge/route.ts`, `bulk-delete/route.ts`, `bulk-delete/undo/route.ts`, `dedup-check/route.ts`
- Tests existing: 6 component tests under `tests/components/library/*` (LibraryMasthead, LibraryEmptyState, LibraryCard, LibraryGrid, LibraryClient.pagination, log-flow/LibraryTab); 1 visual `tests/visual/library.spec.ts`; 9 E2E specs under `tests/e2e/library/*`; ~26 integration tests under `tests/integration/library-*`; 1 RLS test `tests/rls/library-isolation.test.ts`; 1 unit `tests/unit/api/library-list.test.ts`
- Storybook/visual tests: `tests/visual/library.spec.ts` + `tests/e2e/library/library-visual.spec.ts` + `library-a11y.spec.ts` + `library-keyboard-nav.spec.ts`

## Design Tokens / UI Conventions
- Colors: oxblood `#8A2A1F` (primary), ivory `#F4EBDC` (text), warm near-black `#0E0A08` (bg); hairline rules; `--color-oxblood-soft` for hover/secondary
- Font families: Newsreader (serif display), Inter (UI), JetBrains Mono (numerics)
- Animation library: **Framer Motion 12.38.0** — MANDATORY `LazyMotion + m` import pattern (ui-design.md §9.4, tiebreaker #11). Library detail uses `layoutId` shared-element transition (motion-expressive 320ms ease-editorial) thumbnail → sheet hero. `rule-draw` 320ms hairlines staggered 60ms after.
- Loading-spinner / skeleton pattern: TBD for library specifically; project precedent in `components/charts/ChartSkeleton.tsx`, `WeeklyReviewSkeleton.tsx`, `dashboard/WeeklyInsightSkeleton.tsx` (no dedicated library skeleton found)
- Grid: **Ruled Library Grid** — `gap: 0` with drawn column/row hairlines (printer's column ruling); zero-radius cards

## Notable Constraints
- **R1 residual** — Task 2.1 owns the auth refresh-interceptor; library mutation tasks must use `lib/auth/refresh-interceptor.ts` (no local shims). All library API routes already wired through it (per existing `library-*-refresh.test.ts` coverage).
- **I1 RLS** — `food_library_items` is user-scoped via RLS; never bypass with service-role keys in client paths
- **I11 client_id contract** — every library mutation includes `client_id` UUID with UNIQUE + 200-no-op replay
- **FK survival** — `food_entries.library_item_id` is `ON DELETE SET NULL`; tombstone tests already cover this
- **TDD mandatory** — every bug fix needs a failing test FIRST per `~/.claude/rules/testing.md`
- **Sentry errors-only** — no perf/replay instrumentation in MVP
- **Phase D Codex Review (D.CODEX) is OUTSTANDING** — out-of-band library bugfix work should not touch Phase D firewalls; use the bugfix-tomi pattern that precedent (iOS calendar fix, `def2543`) established
