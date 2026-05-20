# Project Context — bugfix-2026-05-17-library-micros

## Tech stack
- **Language/runtime:** TypeScript strict, Node >=20.19, pnpm@10.29.3
- **Framework:** Next.js 16 (App Router) + React 19 + React Compiler
- **Styling/UI:** Tailwind v4, Radix UI primitives, shadcn-style local components, framer-motion, lucide-react
- **State:** zustand stores; client IDB outbox via idb-keyval
- **Backend:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`), RLS-enforced; Gemini `gemini-flash-latest`; Sentry errors-only
- **Validation:** zod v4
- **Testing:** vitest (unit + integration, `happy-dom`), Testing Library, MSW, fake-indexeddb, Playwright (E2E + a11y via `@axe-core/playwright`), Lighthouse CI
- **Project slug:** `kalori` (confirmed in `package.json`)

## Recent work direction (last 5 commits)
1. `60e85c5` feat: library — meal-slot picker on Log This Now + persist micros on add
2. `af5146b` docs: E.CODEX Round-2 closure — 3 fixes + 3 deferred residuals tracked
3. `6b793a6` fix: E.CODEX Round-2 C1+C2 — library-only multi-row persist + dedup banner
4. `60bebd8` fix: E.CODEX Round-2 I1 — isolate library-only Type draft on openModal
5. `ab0cd16` feat: library — Add Item flow is library-only (no log entry side effect)

Project is in the **MVP Stabilization sprint** (post-Phase 5 polish) — current focus is library-only Add Item flow, persisting micros, dedup, and Codex Round-2 residuals. Brainstorm state is `artifacts_complete`. Phase D Codex passed; end-of-project sweep flagged 2 outstanding E2E failures (US-STAB-A3 AC6, US-STAB-B4 AC1).

## Library item flow — file paths

### UI (App Router segment: `app/(app)/library/`)
- `app/(app)/library/page.tsx` — server page (initial fetch)
- `app/(app)/library/_components/LibraryClient.tsx` — top-level client orchestrator (Add Item modal + Type Item draft + library-only multi-row state)
- `app/(app)/library/_components/LibraryEmptyState.tsx` — empty state with Type/Add CTAs
- `app/(app)/library/_components/LibraryGrid.tsx` — card grid
- `app/(app)/library/_components/LibraryCard.tsx` + `LibraryCardActionMenu.tsx` — list cards + per-row actions
- `app/(app)/library/_components/MergeDuplicatesDialog.tsx`, `BulkDeleteConfirmDialog.tsx`, `BulkActionsBar.tsx`, `SelectModeToggle.tsx`, `LibraryToolsRail.tsx`, `LibraryMasthead.tsx`, `MergeField.tsx`, `FilterDropdown.tsx`, `SortDropdown.tsx`, `SearchBar.tsx`
- `app/(app)/library/_components/RecentEntriesSection.tsx` + `RecentEntriesEmpty.tsx` — recent-entries panel
- `app/(app)/library/_components/ThumbnailLetterMark.tsx`, `ThumbnailSketchPending.tsx` — thumbnail variants
- `app/(app)/library/[id]/page.tsx` (+ `loading.tsx`, `not-found.tsx`) — detail route
- `app/(app)/library/_components/FoodDetail/`:
  - `FoodDetail.tsx` (root)
  - `FoodDetailActions.tsx`, `FoodDetailHistory.tsx`, `FoodDetailName.tsx`, `FoodDetailThumbnail.tsx`, `FoodDetailMacros.tsx` (**micros UI lives here**)
  - `useFoodDetailEdit.ts`, `foodDetail.reducer.ts`, `foodDetail.format.ts`, `foodDetail.schema.ts` (**zod schema for micros**)
  - `FoodDetailSkeleton.tsx`

### API routes (`app/api/library/`)
- `app/api/library/create/route.ts` — POST (Add Item / Type Item) — **persists micros on add (recent fix)**
- `app/api/library/[id]/update/route.ts` — PATCH — references `micros`
- `app/api/library/[id]/delete/route.ts` — DELETE
- `app/api/library/[id]/log-now/route.ts` — POST "Log This Now" with meal-slot picker — references `micros`
- `app/api/library/list/route.ts` — GET paginated
- `app/api/library/dedup-check/route.ts` — POST dedup probe
- `app/api/library/bulk-delete/route.ts` + `bulk-delete/undo/route.ts`
- `app/api/library/merge/route.ts` — POST merge — references `micros`
- `app/api/library/sketch/generate/route.ts` + `sketch/backfill/route.ts` — Gemini sketch generation

### Schemas / lib helpers (`lib/library/`)
- `lib/library/create-schema.ts` — zod schema for create payload (Type Item / Add Item)
- `lib/library/types.ts` — shared `LibraryItem` types incl. micros shape
- `lib/library/fetch.ts`, `getItem.ts`, `fetchRecentEntries.ts`
- `lib/library/filter-sort.ts`, `letter-mark.ts`, `merge-default.ts`
- `lib/library/sketch-pipeline.ts`, `sketch-enqueue.ts`, `sketch-pending.ts`
- `lib/library/to-log-library-item.ts` — mapper to log-entry shape

## Notable for the micros-flow bug surface
- Micros JSON is touched by: `FoodDetail/foodDetail.schema.ts`, `FoodDetail/useFoodDetailEdit.ts`, `FoodDetail/FoodDetailMacros.tsx`, `api/library/create/route.ts`, `api/library/[id]/update/route.ts`, `api/library/[id]/log-now/route.ts`, `api/library/merge/route.ts`.
- Recent commit `60e85c5` explicitly added "persist micros on add" to the create flow; this batch likely targets residual gaps (display, edit-mode round-trip, log-now propagation, merge propagation).
- `LibraryClient.tsx` owns the library-only Add Item / Type Item modal state that was isolated from log-flow side effects in commits `ab0cd16` / `60bebd8` / `6b793a6`.

## Ambiguities to flag to main agent
- The exact bug list for batch `2026-05-17-library-micros` was not seen in this priming pass; only the surface area is mapped. Investigation sub-agents will need the bug descriptions to scope per-bug file ownership.
- Two known unresolved E2E failures from End-of-Project Validation Sweep (US-STAB-A3 AC6, US-STAB-B4 AC1) — unrelated to library but may collide with `pnpm test:e2e` runs during this batch's regression check.
- `Planning/` (capital P) vs `planning/` (lowercase) — temp folder uses lowercase per bugfix-tomi convention; canonical planning artifacts use capital P.
- No `AddItemModal.tsx` file located — the Add Item / Type Item flow appears to live inline in `LibraryClient.tsx`. Investigation agents should confirm where the modal markup actually renders.
