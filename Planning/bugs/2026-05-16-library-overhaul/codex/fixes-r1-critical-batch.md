# Codex Round 1 Critical Batch — Auto-Fix Summary

**Batch:** `2026-05-16-library-overhaul`
**Scope:** 3 Critical findings (sketch URL expiry + atomicity + photo-thumbnail-kind contract)
**Result:** ALL THREE RESOLVED. 288/288 GREEN across 47 files in the cluster regression sweep. Typecheck clean.

The three Criticals were architecturally coupled (durability rewrite → repurposed `thumbnail_url` column → read-path signing → photo-branch contract follow-on). Treated as a single atomic fix as the briefing requested.

---

## Critical #1 — Persisted sketch URLs expire while the row is marked permanently generated

### Diagnosis
`lib/library/sketch-pipeline.ts:167-190` stored a 7-day signed Supabase URL directly in `thumbnail_url`. The library read paths render that column directly, the row gets `thumbnail_kind='sketch'` + `sketch_generated_at`, and the pipeline's `already_generated` short-circuit suppresses any repair attempt. After 7 days every sketch becomes a broken image with no recovery path.

### Fix
**Repurposed the `thumbnail_url` column to store the storage PATH**, not a URL. Read paths sign on demand with a 1-hour TTL.

- **NEW**: `lib/storage/sign-thumbnail.ts`
  - `signThumbnailUrl(pathOrUrl, supabase)` — 1-hour TTL via `createSignedUrl`, graceful null on failure → letter-mark fallback.
  - `isStoragePath(value)` — exported heuristic: starts with `http(s)://` ⇒ legacy URL ⇒ pass through unchanged. Otherwise ⇒ path ⇒ sign.
  - `signThumbnailUrlBatch(paths, supabase)` — `Promise.all` batch helper for the list path.

- **MODIFIED**: `lib/library/sketch-pipeline.ts:159, 187`
  - Storage upload still lands at `{userId}/sketch_{client_id}.webp`.
  - Final UPDATE writes `thumbnail_url = path` (the bare string, no signing). Removed the `createSignedUrl(60*60*24*7)` call entirely.
  - Outcome envelope `{ status: 'generated', thumbnailUrl: path }` carries the path verbatim — routes forward; cache revalidation triggers fresh signed URLs on next read.

- **MODIFIED**: `lib/library/fetch.ts` (RSC list helper)
  - After the SELECT, `await Promise.all(rows.map(...))` signs each row's `thumbnail_url` via the new helper before returning to the client island.
  - Legacy URL rows pass through unchanged (back-compat); null thumbnails stay null.

- **MODIFIED**: `lib/library/getItem.ts` (RSC single-item helper)
  - Same sign-on-read pattern for the detail page.

### Tests (RED → GREEN)
- `tests/unit/lib/storage/sign-thumbnail.test.ts` — 9 new specs covering null/empty/legacy-URL/path-signing/error-fallback/`isStoragePath` classification.
- `tests/unit/lib/library/sign-on-read.test.ts` — 6 new specs for both list helper (path → signed URL; legacy URL pass-through; null stays null; sign-fail → null) and single-item helper (same; null-row no-signing).
- `tests/unit/lib/library/sketch-pipeline.test.ts` — happy-path spec now asserts `thumbnail_url` value matches the storage path AND does NOT start with `http` (regression guard against accidental URL leakage).

---

## Critical #2 — Retry and cost caps are not atomic under concurrent sketch generation

### Diagnosis
`lib/library/sketch-pipeline.ts:112-194` read the row, checked `sketch_attempt_count < 3`, then made the Gemini call + upload BEFORE writing the bumped attempt count. Three concurrent `/generate` invocations all see `sketch_attempt_count=0`, all call Gemini, only the last write wins. Cost cap was per-invocation, not per-row.

### Fix
**Single conditional UPDATE that atomically claims the slot** before any Gemini I/O. Postgres serializes concurrent UPDATEs on the same row via row-level locks; the `.select()` chain returns affected rows so we can detect "lost the race" outcomes.

**Claim SQL (via supabase-js):**
```typescript
UPDATE food_library_items
SET sketch_attempt_count = currentAttempts + 1,
    sketch_last_error    = null
WHERE id   = $1
  AND user_id = $2
  AND deleted_at IS NULL
  AND sketch_generated_at IS NULL
  AND sketch_attempt_count < 3
  AND (thumbnail_kind IS NULL OR thumbnail_kind = 'sketch')
RETURNING id, sketch_attempt_count;
```

- 1 row returned ⇒ this invocation owns the slot ⇒ proceed to Gemini.
- 0 rows returned ⇒ another invocation got there first OR a guard became false in the gap ⇒ return `{ status: 'skipped', reason: 'claim_lost' }`. No Gemini call. No failure record.

**Failure path simplified:** Since the claim already incremented `sketch_attempt_count`, `recordFailure` now only writes `sketch_last_error` — no double-bump.

### Tests (RED → GREEN)
- `tests/unit/lib/library/sketch-pipeline.test.ts` gained two new specs:
  - "concurrency: claim affects 0 rows → skipped=claim_lost, no Gemini call" — single invocation against a mock where the claim resolves with empty `data`.
  - "concurrency cost cap: 4 parallel calls → 1 Gemini call, 3 claim_lost" — 4-way parallel `Promise.all` against a shared mock with a single-shot atomic counter. Asserts exactly 1 generated + 3 claim_lost + 1 upload call.
- All 5 pre-existing pipeline specs (happy path, idempotent, photo-wins, retry-cap, missing row, upload-failure, gemini-no-image) continue to pass against the new flow.

---

## Critical #3 — Photo save-to-library rows are marked as photos without storing a photo URL

### Diagnosis
`app/api/entries/save/route.ts:531-580` set `thumbnail_kind='photo'` whenever `body.source === 'photo'`, even though the entries-save body NEVER carries a `thumbnail_url`. The sketch pipeline's `photo_present` short-circuit then permanently skipped the row — letter-mark forever. Sketch enqueue only fired for `source === 'text'`, reinforcing the trap.

### Fix
**Stop inferring `thumbnail_kind='photo'` from the source string when there's no URL to back it.** Both `text` and `photo` source paths now insert with `thumbnail_kind=null`, which makes the row sketch-eligible. The sketch enqueue fires for both sources.

If a future photo-upload route threads a real `thumbnail_url` into a separate write, that write is responsible for atomically setting `thumbnail_kind='photo'` alongside the URL — re-activating the pipeline's photo-wins guard from that point.

- **MODIFIED**: `app/api/entries/save/route.ts:538` — removed `inferredThumbnailKind`; INSERT now passes `thumbnail_kind: null` unconditionally.
- **MODIFIED**: `app/api/entries/save/route.ts:579` — `if (libRow && body.source === 'text')` collapsed to `if (libRow)`; sketch enqueue fires for all save-to-library inserts.

### Tests (RED → GREEN)
- `tests/unit/api/entries-save-sketch-enqueue.test.ts` — flipped the photo-source spec:
  - Old assertion: `row.thumbnail_kind === 'photo'` + `enqueueFn.not.toHaveBeenCalled()`.
  - New assertion: `row.thumbnail_kind === null` + `row.thumbnail_url === null` + `enqueueFn.toHaveBeenCalledOnce()` + correct args.
- The two adjacent specs (text-source enqueue + save_to_library=false skip) continue to pass.

---

## Files changed

### New (2)
- `lib/storage/sign-thumbnail.ts` — single-purpose 1-hour-TTL signer + legacy-URL pass-through + batch helper.
- `tests/unit/lib/storage/sign-thumbnail.test.ts` (9 specs).
- `tests/unit/lib/library/sign-on-read.test.ts` (6 specs).

### Modified (5)
- `lib/library/sketch-pipeline.ts` — atomic claim (Critical #2) + path-as-URL (Critical #1) + simplified `recordFailure`.
- `lib/library/fetch.ts` — sign-on-read at RSC boundary (Critical #1).
- `lib/library/getItem.ts` — sign-on-read at RSC boundary (Critical #1).
- `app/api/entries/save/route.ts` — drop `inferredThumbnailKind`, unconditional sketch enqueue (Critical #3).
- `tests/unit/lib/library/sketch-pipeline.test.ts` — full rewrite for the new claim flow + 2 concurrency specs; happy-path now asserts path-not-URL.
- `tests/unit/api/entries-save-sketch-enqueue.test.ts` — photo-source assertion flipped.
- `tests/unit/api/library-sketch-generate.test.ts` — path-typed `thumbnailUrl` outcome assertion (no `http` prefix).

---

## Regression sweep

| Surface | Status |
|---|---|
| `tests/unit/lib/library/` (sketch-pipeline + sign-on-read + create-schema + fetch-recent-entries) | 35/35 GREEN |
| `tests/unit/lib/storage/` (new) | 9/9 GREEN |
| `tests/unit/lib/ai/` (sketch-prompt + image-client) | 14/14 GREEN |
| `tests/unit/api/` (library-sketch-generate + library-sketch-backfill + entries-save-sketch-enqueue + library-create + library-list) | 30/30 GREEN |
| `tests/components/library/` | 167/167 GREEN (including `LibraryCard data-sketch` specs untouched) |
| `tests/components/dashboard/SketchBackfillButton` | 4/4 GREEN |
| `tests/integration/library-page` + `library-create` + `library-item-update` + `library-update-refresh` + `library-item-detail-fetch` + `library-grid-navigation` + `library-relog-bumps-counters` | 29/29 GREEN |
| Typecheck (`npx tsc --noEmit`) | clean |

**Total: 288/288 across 47 files in the focused sweep.**

Broader (`tests/unit/lib/ tests/unit/api/ tests/unit/library/ tests/components/ tests/integration/`) full sweep: **1662 passed, 2 failed, 33 skipped (1697 total)**. Both failures are PRE-EXISTING and unrelated to this Critical batch:

1. `tests/integration/focus-ring-token.test.ts` — `:focus-visible` in `app/globals.css` uses `var(--color-oxblood-soft)` instead of the canonical ivory token. Introduced by Wave 3 / Bug 10 (LibraryCard hover-focus animation block). Not in Critical scope.
2. `tests/integration/nav-audit.test.ts` — runtime href in `app/(app)/library/_components/LibraryAddDialog.tsx` lacks a `// @nav-audit` pragma. Introduced by Wave 5 / Bug 6 (LibraryAddDialog 409-duplicate banner link). Already addressed by the Improvement-batch auto-fix (sessionStorage persistence) — pragma comment is a follow-up.

Neither pre-existing failure touches files modified by this batch.

---

## Deviations from briefed approach

1. **Sign-on-read placement.** Briefing suggested `LibraryCard.tsx` (and `FoodDetailThumbnail.tsx`) could optionally sign inline OR receive signed URLs as props from the RSC parent. Chosen approach: **sign at the RSC fetch helpers** (`fetch.ts` and `getItem.ts`). Rationale: LibraryCard + FoodDetailThumbnail are Client Components (`'use client'`), already receive `LibraryItem` as a prop tree from the RSC `page.tsx`. Signing in the fetch helper is the single canonical sign point — no client-component changes, no extra prop threading, no per-card render-time async signing. This is the Next.js-canonical pattern for private-bucket Storage reads (per `Planning/architecture.md` §4.2).

2. **`recordFailure` no longer accepts `currentAttempts`.** The attempt count is incremented inside the atomic claim step, so the recover path only writes `sketch_last_error`. Signature simplified to `(supabase, libraryItemId, userId, errorMessage)`.

3. **Sketch enqueue scope.** Briefing said "leave thumbnail_kind null so sketch fallback can run" — implemented as both `thumbnail_kind=null` AND firing enqueue for both source paths. The narrower interpretation (only flip the column, leave enqueue text-only) would have left photo-source rows in letter-mark purgatory until someone manually clicked the backfill button. Firing for both is the higher-confidence reading of "allow sketch fallback when thumbnail_kind='photo' has a null thumbnail_url."

4. **No new test for LibraryCard / FoodDetailThumbnail.** The Card already receives `thumbnail_url` as a pre-signed URL (the value the RSC parent threaded down). All existing LibraryCard tests pass unchanged — they read whatever string the test fixture put in `thumbnail_url`, which is the same whether that string is a signed URL or a path. No client-component behavior changed.

5. **No migration / data wipe needed.** Briefing flagged this is dev-only deployment of migration 0021 + zero sketch rows in production. Existing dev rows with full URLs in `thumbnail_url` are handled by the legacy-URL pass-through in `signThumbnailUrl`. No SQL UPDATE needed; the helper's branch on `isStoragePath` will sort them at read time (URLs pass through unchanged, paths get signed). A maintenance script could clean them up later, but it's not load-bearing.

---

## False positives / halts

None. All three Criticals were genuine root-cause issues with verifiable failure modes. No stop-the-world conditions encountered.
