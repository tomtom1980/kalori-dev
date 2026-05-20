# Project Context — bugfix-tomi batch 2026-05-16-library-sketch-display

**Batch slug:** `2026-05-16-library-sketch-display`
**Project slug:** `kalori`
**Date:** 2026-05-16

---

## 1. Tech Stack

- **Language:** TypeScript (strict mode)
- **Framework:** Next.js 16 (App Router, React 19) — PWA, dark-mode only
- **UI:** Tailwind v4 + shadcn/ui + Radix primitives
- **Backend:** Supabase (Postgres + Auth + Storage), Route Handlers (server-only)
- **AI:** Gemini `gemini-flash-latest` for parse/vision/weekly review; **Nano Banana = `gemini-2.5-flash-image`** for sketch thumbnails
- **Test runner:** Vitest (unit/integration/component) + Playwright (E2E + visual regression)
- **Deploy:** Vercel (Hobby, iad1), Sentry errors-only
- **Image processing:** `sharp` (server-side WebP encode, ~32x32 thumbnails)

## 2. Recent Work Direction (last 10 commits)

Active sprint: **MVP Stabilization** (Phases A→E). Latest:
- **`8cf1c86` (2026-05-16) — Library overhaul (12-item bugfix-tomi batch):** Introduced the **sketch thumbnail pipeline** end-to-end. Bug 5 added `gemini-2.5-flash-image` (Nano Banana) async sketch generation for library items via Next.js 16 `after()` hook. Storage at `food-thumbnails/{userId}/sketch_{clientId}.webp`. 200-item backfill cap, 3-retry cap, photo-overrides-sketch rule, CAS-predicate cost cap. Bug 6 added `LibraryAddDialog` + `POST /api/library/create` (manual library create with auto-sketch trigger). Migration `0021_library_overhaul.sql` widened `created_from` CHECK to accept `'manual'`.
- **`cbf4bc5` (mini-batch A):** Followup hardening — 5MB PNG decode cap moved upstream to `image-client.ts` via streaming `readBodyWithCap()` (gzip-bomb safe); `KALORI_SKETCH_FIXTURE_BASE64` gated to non-prod; `LibraryTab` Zustand sort default flipped to `'name-asc'`; new E2E env-loader infra with PROD-ref guard.
- **`fdc51e7` (E.1.1):** `authPost` preserves response body on non-2xx (Codex finding).
- Older: D.6 dedup migration 0020, D.4 schema-drift CI guard, D.SWEEP testing infra.

**Inferred current focus for this batch:** Display/UX bugs in how generated sketches surface on library cards, the FoodDetail route, the log-modal LibraryTab, and possibly the backfill button on the dashboard. Sketch generation pipeline itself is stable post-mini-batch-A; this batch likely targets rendering / signed-URL / placeholder / loading-state issues.

## 3. Key File Paths

### Sketch / Image Generation Pipeline
- `lib/ai/image-client.ts` — Gemini image API client; `callGeminiImage()`, `readBodyWithCap()` 5MB stream cap, `GeminiOversizeError`, fixture base64 path (gated to non-prod).
- `lib/ai/sketch-prompt.ts` — Prompt template for Nano Banana sketches.
- `lib/library/sketch-pipeline.ts` — Core generate-and-upload pipeline; sharp WebP encode, photo-overrides-sketch rule, CAS-predicate cost cap, 3-retry cap.
- `lib/library/sketch-enqueue.ts` — Enqueues sketch jobs via Next.js 16 `after()` hook.
- `lib/storage/sign-thumbnail.ts` — Generates Supabase signed URLs for `food-thumbnails` bucket reads.
- `app/api/library/sketch/generate/route.ts` — Single-item sketch generation endpoint.
- `app/api/library/sketch/backfill/route.ts` — 200-item-cap backfill endpoint.
- `app/(app)/dashboard/_components/SketchBackfillButton.tsx` — Dashboard trigger for batch backfill.

### Library List / Detail UI
- `app/(app)/library/page.tsx` — Library route entry.
- `app/(app)/library/loading.tsx` — Route-level skeleton (Bug 2 add).
- `app/(app)/library/_components/LibraryClient.tsx` — Client orchestrator (uses `useTransition`).
- `app/(app)/library/_components/LibraryGrid.tsx` — Grid layout + `LibraryGridSkeleton`.
- `app/(app)/library/_components/LibraryCard.tsx` — Card root (`<div role="button">`, hosts kebab menu).
- `app/(app)/library/_components/LibraryCardActionMenu.tsx` — Radix DropdownMenu kebab (Delete + Edit).
- `app/(app)/library/_components/ThumbnailLetterMark.tsx` — Fallback letter-mark when no sketch/photo.
- `app/(app)/library/_components/LibraryAddDialog.tsx` — Bug 6 manual-create Sheet (auto-triggers sketch).
- `app/(app)/library/[id]/page.tsx` — Detail route.
- `app/(app)/library/[id]/loading.tsx` — Detail skeleton.
- `app/(app)/library/_components/FoodDetailSkeleton.tsx` — Reusable skeleton.
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — `mode='route'|'modal'` switch; sheet-wide `aria-busy` cross-mutation gate.
- `app/(app)/library/_components/FoodDetail/FoodDetailThumbnail.tsx` — Detail-view image rendering.

### Log-Modal Library Tab (in-flow library reuse)
- `app/(app)/log/_components/LibraryTab.tsx` — Mini-library inside log flow modal; Zustand sort default `'name-asc'`.
- `lib/stores/useLogFlowStore.ts` — `LibrarySort` union + `isLibrarySort` guard + rehydrate coercion.

### Data / Schema
- `lib/library/fetch.ts` — Library list fetcher.
- `lib/library/getItem.ts` — Single library item fetcher.
- `lib/library/create-schema.ts` — Zod schema for manual create.
- `lib/database.types.ts` — Generated Supabase types.
- `supabase/migrations/0021_library_overhaul.sql` — Most recent library migration (`created_from = 'manual'` extension).

### i18n
- `lib/i18n/en.ts` — All user-facing copy; touched in both library-overhaul and mini-batch A.

---

## Notes for Phase 1 Sub-Agents

- **Sketch column on DB:** `food_library_items.sketch_thumbnail_url` (TEXT) — populated by pipeline.
- **Photo overrides sketch:** If a library item has a `thumbnail_url` from a photo log, the sketch is NOT shown (priority order enforced in pipeline + render).
- **Signed URL pattern:** Thumbnails are served via `signThumbnail()` (private bucket); never reference raw storage paths in JSX.
- **`useTransition` pending cue:** `LibraryClient` already wires this — display bugs may relate to skeleton timing vs actual sketch resolution.
- **Backfill button:** `SketchBackfillButton` on dashboard. Sketches generate ASYNC via `after()` — UI must poll or rely on signed-URL freshness to surface results.
- **Sort default:** Both `/library` (page) and log-modal `LibraryTab` default to `'name-asc'` post-mini-batch-A. Persisted state coerced on rehydrate.
- **Test infra:** Use `tests/_utils/env-loader.ts` + `tests/_utils/refuse-prod-supabase.ts` for any E2E env setup; PROD-ref guard refuses runs against `dryysypycsexvlbabtwq`.
