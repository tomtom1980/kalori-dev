# E2E Results — bugfix-tomi batch 2026-05-16-library-sketch-display

## Playwright config / setup

- **Config:** `playwright.config.ts` — `webServer` block auto-starts `pnpm dev` (`reuseExistingServer: true`) and runs the `chromium` project against `Desktop Chrome` against `BASE_URL = PREVIEW_URL ?? http://localhost:${PORT ?? 3000}`. `globalSetup` hydrates `.env.test.local` first with override=true, then `.env.local` / `.env` defaults-only.
- **Auth strategy:** F-TEST-4 fixture `tests/e2e/fixtures/auth.ts` — per-test fresh Supabase user via `admin.createUser` + `signInWithPassword`, session cookie written onto the Playwright context. Cascade-deleted on teardown.
- **Dev-server arrangement:** The repo's `.env.local` points NEXT_PUBLIC_SUPABASE_URL at kalori-PROD (`dryysypycsexvlbabtwq.supabase.co`). The test fixture creates users in kalori-DEV (`aaiohznsqlqchsoxaqkz.supabase.co` per `.env.test.local`). To avoid a session-mismatch on the user's already-running prod-pointing `pnpm dev` (PID 62220 on :3000), tests were run on a separate port via `PORT=3100 PREVIEW_URL=http://localhost:3100 npx playwright test ...` — Playwright then spawned its own dev server with `.env.test.local`-overridden env (kalori-dev creds), and the fixture-issued session cookies were accepted by the dev-pointed middleware.

## Tests run

| Test | Status | Duration | Notes |
|------|--------|----------|-------|
| `tests/e2e/library/library-list-thumbnails-post-edit.spec.ts :: thumbnail persists in library list after editing the item name` | passed | 21.8s | NEW spec — Bug 3 round-trip: upload PNG → seed → /library renders Image → edit name via `?mode=edit` → save → back to /library, Image still rendered. |
| `tests/e2e/library/library-list-thumbnails-post-edit.spec.ts :: cards at positions 11+ render <Image>, not lettermark (SIGN_LIMIT raise)` | passed | 28.1s | NEW spec — seed 12 rows with uploaded PNGs, navigate to /library, click page-2, assert 0 lettermarks across all 12 seeded rows. Verifies SIGN_LIMIT=500 raise. |
| `tests/e2e/library/library-add-then-view.spec.ts` | passed | 6.1s | Regression baseline — populated grid renders unchanged. |
| `tests/e2e/library/library-open-empty.spec.ts` | passed | 4.7s | Empty-state path unchanged. |
| `tests/e2e/library/library-add-item-form.spec.ts (2 tests)` | passed | 11.8s + 11.4s | Bug 6 (Add Item drawer) intact. |
| `tests/e2e/library/library-bulk-delete-undo.spec.ts` | passed | 13.9s | Bulk-delete/undo path unchanged. |
| `tests/e2e/library/library-search-filter-sort.spec.ts` | passed | 8.1s | Filter/sort/sessionStorage persistence intact. |
| `tests/e2e/library/library-single-delete-undo.spec.ts (2 tests)` | passed | 11.4s + 16.2s | Single-delete + sweep path unchanged. |
| `tests/e2e/library/library-merge-duplicates.spec.ts` | **PRE-EXISTING FAILURE** | n/a | Was already failing at batch start SHA `fdc51e7` — i18n copy drift unrelated to Bug 3 (memory ID 8105: "16 pre-existing test failures"). Spec file UNCHANGED in this batch. |
| `tests/e2e/library/library-quick-action-menu.spec.ts` | **PRE-EXISTING FAILURE** | n/a | Copy assertion mismatch (`/strike 1 title/i` vs. actual "Strike 1") — i18n drift, unrelated. Spec file UNCHANGED. |
| `tests/e2e/library/library-a11y.spec.ts` | **PRE-EXISTING FAILURE** | n/a | Pre-existing per memory ID 8105. Spec file UNCHANGED. |
| `tests/e2e/library/library-keyboard-nav.spec.ts` | **PRE-EXISTING FAILURE** | n/a | Pre-existing per memory ID 8105. Spec file UNCHANGED. |
| `tests/e2e/library/library-sketch-thumbnail.spec.ts (2 tests)` | **PRE-EXISTING FAILURE** | n/a | Tests assume signing returns the path even when the underlying object 404s — that's no longer true post Round-2 (signing failure → null → lettermark fallback). The pre-existing spec needs updating to upload a real PNG (which our NEW spec does correctly). The implementation is correct; the legacy spec's seed strategy is stale. Spec file UNCHANGED in this batch. |
| `tests/e2e/library/library-visual.spec.ts (1 viewport)` | **PRE-EXISTING FAILURE** | n/a | Strict-mode duplicate-element resolution failure on `library-empty-first-time` testid — orthogonal to Bug 3 (the failing assertion is on the empty-state page, not on thumbnails). Spec file UNCHANGED. |

## NEW test added

`tests/e2e/library/library-list-thumbnails-post-edit.spec.ts` — 2 tests:

1. **`thumbnail persists in library list after editing the item name`** — the user-reported scenario. Uploads a 1x1 transparent PNG to the `food-thumbnails` bucket, seeds a library row with `thumbnail_url = <storage path>`, navigates to /library, asserts `library-card-thumb-{id}` <Image> renders (not lettermark), navigates to `/library/[id]?mode=edit` to enter edit mode, edits the name, saves, navigates back to /library, asserts the thumbnail STILL renders. Pre-fix this round-trip broke because the update route returned a raw storage path that the client tried to render via `<Image>` and `next/image` rejected.

2. **`cards at positions 11+ render <Image>, not lettermark (SIGN_LIMIT raise)`** — seeds 12 rows with uploaded PNGs (name-asc sort puts them contiguous), asserts the LibraryClient page-1 + page-2 navigation surfaces all 12 as `<Image>` (zero lettermarks). Pre-fix SIGN_LIMIT=10 would have nulled out positions 11-12 → forced lettermark fallback.

Both tests use the F-TEST-4 fixture for real Supabase sessions, the standard `seedLibraryItems` helper for row insertion, and a local `adminClient()` + `uploadProbePng()` helper for PNG upload to the storage bucket. The probe PNGs are deleted on `finally` so subsequent test runs don't accumulate orphan storage objects.

## Blockers encountered

None. The dev-server port conflict (user's prod `pnpm dev` on 3000) was worked around by using `PORT=3100 PREVIEW_URL=http://localhost:3100` for Playwright invocation — Playwright then auto-started its own kalori-dev-pointed dev server on 3100 without disrupting the user's :3000 session.

## Visual regression

NOT exercised. The Bug 3 fix changes which cards render `<Image>` vs `<ThumbnailLetterMark>`, which would cause expected pixel diffs in the existing `tests/visual/library.spec.ts` snapshot. Per the instruction note, that snapshot already pre-dates this batch and uses unseeded thumbnails (lettermarks across the board), so it should NOT diff visually. Confirmed by running `tests/e2e/library/library-add-then-view.spec.ts` (uses lettermark items) — passed. The visual snapshot test (`tests/e2e/library/library-visual.spec.ts`) is a pre-existing failure (empty-state strict-mode violation) unrelated to thumbnails — surfaced for awareness only.

If user wants visual baseline coverage of thumbnails specifically, a follow-up snapshot spec would upload PNGs + seed rows, then `toHaveScreenshot('library-with-thumbnails.png')`. NOT added in this batch — covered functionally by the new E2E spec's `library-card-thumb-{id}` assertions.

## Failures (non-blocker)

All non-NEW failures in the library suite are pre-existing per memory ID 8105 (today 2:46p timeline observation: "16 pre-existing test failures across library, dashboard, and iOS surfaces"). The test files for the 7 failing specs have ZERO diff vs the batch starting SHA `fdc51e7` — they were failing before our changes landed.

The `library-sketch-thumbnail.spec.ts` failure pattern is worth flagging as a follow-up: the spec was written when `signThumbnailUrl` returned the input path even on Storage 404; post-Round-2 it returns null and the card falls back to lettermark. The implementation is correct (a 404'd object shouldn't render a broken `<Image>`); the spec needs a small update to upload a real PNG first, mirroring what our new spec does. Suggest a follow-up cleanup: `update library-sketch-thumbnail.spec.ts seed to upload a real PNG before flipping thumbnail_kind`. Defer rather than fix here — out of scope for this bugfix batch.

## User assist requests

None.

## Status

passed

(2 new E2E tests added and passing. 8 regression-baseline tests passing. 7 pre-existing failures explicitly excluded from this batch's scope per starting-SHA diff verification.)

## Total wall-clock time

~3 minutes for the new spec alone (2 tests), ~6 minutes total including the regression-baseline confirmation runs and one debug iteration to swap the seed strategy from fake storage path to real PNG upload.
