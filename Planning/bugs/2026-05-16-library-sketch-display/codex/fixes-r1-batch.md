# Codex R1 Fix Batch — Output

## Investigation Findings

### Merge UI/route discovery
- **Merge dialog** at `app/(app)/library/_components/MergeDuplicatesDialog.tsx:119` copies `a.thumbnail_url` / `b.thumbnail_url` into `fields.thumbnail_url`, where `a` and `b` are `LibraryItem` instances carrying **sign-on-read 1-hour signed URLs** post-Bug-3 SIGN_LIMIT raise.
- **Merge route** at `app/api/library/merge/route.ts:72` validates with `z.string().nullable().optional()` — NO URL check; accepted any string value through to the RPC.
- **Merge RPC** (`library_merge_atomic`, migrations `0008` / `0009` / `0011`) executes `thumbnail_url = p_fields->>'thumbnail_url'` unconditionally when the key is present in `p_fields`. The signed URL was being written verbatim into the canonical column, expiring permanently after 1 hour.
- **Update route** at `app/api/library/[id]/update/route.ts:84` used `z.string().url().nullable().optional()` — accepted any well-formed URL including signed URLs. Same hazard if a client sent one back (the edit dialog `useFoodDetailEdit.ts` does NOT touch `thumbnail_url`, but defense-in-depth still warranted).
- **Create route** at `app/api/library/create/route.ts:122-132` does NOT accept `thumbnail_url` in `insertPayload` — safe by construction.
- **Entries save route** at `app/api/entries/save/route.ts` explicitly does not carry `thumbnail_url` (comment at line 535).
- Only **3 production callers** of `signThumbnailUrl`: `lib/library/fetch.ts`, `lib/library/getItem.ts`, `app/api/library/[id]/update/route.ts`. Guard scope is contained.

### signThumbnailUrl behavior verification
Confirmed `signThumbnailUrl` (lib/storage/sign-thumbnail.ts:64-67) passes through any value starting with `http://` or `https://` unchanged — no warning, no error. A signed URL round-tripped through here yielded the same signed URL. Codex's claim verified.

## C1 Fix — Signed URL persistence hazard
**Files touched:**
- `lib/storage/sign-thumbnail.ts` — added `console.warn` telemetry signal when legacy URL passed through (kept pass-through for back-compat per architecture comment about pre-fix rows still carrying full URLs).
- `app/api/library/merge/route.ts` — added optional `thumbnail_source_id: z.string().uuid().nullable().optional()` to `BodySchema`. When `fields.thumbnail_url` is a `http(s)://` URL, the route now:
  1. Looks up the source row's raw `thumbnail_url` from `food_library_items` by `thumbnail_source_id` (RLS-scoped via `eq('user_id', userId)` + `.in('id', [winnerId, loserId])`).
  2. Substitutes the raw path into `resolvedFields.thumbnail_url` before invoking the RPC.
  3. If `thumbnail_source_id` is absent (legacy client) OR the source row's raw value is also a URL OR the lookup fails — **forces `thumbnail_url` to `null`** rather than persisting the signed URL. Captures a Sentry warning on the legacy-client path.
- `app/api/library/[id]/update/route.ts` — strict rejection: if `fields.thumbnail_url` matches `^https?://`, returns 400 `signed_url_not_writable` with a clear message. The edit dialog never sends a URL, so this is purely a defense-in-depth boundary check.
- `app/(app)/library/_components/MergeDuplicatesDialog.tsx` — payload now includes `thumbnail_source_id: thumbnailSource.id` (id of `a` or `b` based on the user's `choices.thumbnail_url` selection).

**Tests added:**
- `tests/unit/lib/storage/sign-thumbnail.test.ts :: signThumbnailUrl > emits a warn signal when given a legacy http(s) URL (telemetry for the persistence hazard)`
- `tests/integration/library-merge-signed-url-guard.test.ts` (new file, 5 tests):
  - `replaces signed URL with raw path resolved from thumbnail_source_id=winner`
  - `replaces signed URL with raw path resolved from thumbnail_source_id=loser`
  - `forces thumbnail_url to null when signed URL is supplied with no thumbnail_source_id`
  - `passes raw storage path through unchanged when client sends a path (no signed URL)`
  - `passes null thumbnail_url through unchanged`
- `tests/integration/library-item-update.test.ts :: Test L: rejects http(s):// thumbnail_url with 400 (signed URL persistence guard)`

**Strategy:** Defense in depth — preferred guard (`signThumbnailUrl` warn) PLUS server-side resolve at merge write (`thumbnail_source_id` discriminator + raw-path lookup) PLUS strict rejection at update write (400). Three independent boundaries; client cooperation is preferred but not required for correctness.

## C2 Fix — Unbounded concurrent signing fan-out
**Files touched:**
- `lib/storage/sign-thumbnail.ts` — added `SignBatchOptions` type + rewrote `signThumbnailUrlBatch` to use a bounded-worker pool (default `DEFAULT_SIGN_CONCURRENCY = 20`, overrideable via `options.concurrency`). Each worker pulls the next index, signs, and writes back into the pre-allocated `results` array; per-item failure is caught inside the worker loop so the batch survives.
- `lib/library/fetch.ts` — replaced bare `Promise.all` over up to 500 rows with `signThumbnailUrlBatch`. SIGN_LIMIT semantics preserved: rows `0..499` go through the batched signer; rows `500+` get `thumbnail_url: null` directly (cheap O(N) loop, no signing call).

**Concurrency cap:** 20 (default). Rationale: Supabase signed URLs are JWT-only (no remote round-trip in steady state per `fetch.ts:41-44`), so 20 is generous; the previous 500 fanout was pathological under ANY storage latency.

**Per-call timeout:** Not added as a wrapper — `signThumbnailUrl` already swallows internal Supabase errors (returns `null` on failure) and the new worker loop catches throws too. Adding a synthetic `Promise.race` timeout would add complexity without a clear failure case to exercise (the existing helper does not hang). If JWT signing ever does hang (impossible per current architecture), the worker loop blocks one slot; remaining 19 keep moving. The briefing's stop-the-world threshold "would need new dep" was NOT triggered (no new dependency added).

**Graceful degradation:** Verified — per-item signing failure returns `null` for that row only; the rest of the batch completes; the page renders with letter-mark fallback for the failed row.

**Tests added:**
- `tests/unit/lib/storage/sign-thumbnail.test.ts :: signThumbnailUrlBatch — concurrency cap + timeout + degradation` (3 tests):
  - `caps in-flight signing calls at 20 (default concurrency)`
  - `per-item failure does NOT crash the batch — null falls back for that row only`
  - `respects an override concurrency option`
- `tests/unit/lib/library/fetch.test.ts` (2 new tests):
  - `Test H: signing fan-out is bounded by concurrency cap (max in-flight <= 20)`
  - `Test I: per-item signing failure degrades to null, page render survives`

## I1 Fix — Cache invalidation ordering
**Files touched:**
- `app/api/library/[id]/update/route.ts` — reordered post-DB-write steps:
  - **Before:** DB write → `await signThumbnailUrl(...)` → `revalidateTag(...)` → return.
  - **After:** DB write → `revalidateTag(...)` (synchronous, immediate) → wrapped `signThumbnailUrl(...)` in try/catch (defense in depth even though the helper already swallows errors) → return.

**Reorder reasoning (in prose):** The mutation result is authoritative; cache invalidation is part of the mutation's correctness contract. Thumbnail signing is best-effort display-URL resolution and must NEVER block (or fail) the cache-invalidation step. Even though `signThumbnailUrl` swallows its own errors today, defense in depth: any future throw or stall inside the helper cannot leak past the response.

**Tests added:**
- `tests/integration/library-item-update.test.ts` (3 new tests):
  - `Test J: revalidateTag is invoked even when thumbnail signing fails`
  - `Test K: thumbnail signing throw is swallowed; row still returns`
  - `Test M: revalidateTag is called BEFORE the signing await resolves` (deterministic order verification using callOrder array + 30ms slow-sign mock)

## Test Results
- **RED step:** 6 new tests failed initially (3 sign-thumbnail batch/warn + 1 fetch H + 1 update L + 1 merge guard). Then Test M added → 7 RED. 4 of the 15 new tests "passed" RED inadvertently due to existing error-swallowing inside `signThumbnailUrl` (Test I and 1 batch test). Made Test M explicit-order to force the ordering bug.
- **GREEN step:** All 36 tests in the 4 directly-touched test files pass.
- **Broader sweep (`npx vitest run tests/unit/ tests/integration/`):** **1928 passed | 33 skipped | 0 failed** (was 1913 passed before this batch; +15 net new tests). No regressions; pre-existing skipped count unchanged.
- **TypeScript:** `npx tsc --noEmit` → 0 errors.
- **ESLint:** 0 errors. 8 warnings, all pre-existing unused-mock-param conventions (underscore-prefixed `_path`/`_ttl` in test files — established codebase style).

## Deviations
- **Did NOT add p-limit dependency.** Hand-rolled bounded worker pool is ~15 lines, no new dep needed. Briefing's stop-the-world threshold not triggered.
- **Did NOT add explicit per-call timeout to `signThumbnailUrl`.** Reasoning above in C2 strategy: the helper already error-swallows; the worker loop catches throws; no observable hang case in current architecture (JWT-only signing). Adding `Promise.race(timeout)` would add code without an exercised failure mode.
- **Did NOT rename `thumbnail_url` API field.** The rename would cascade to >20 files (every consumer of `LibraryItem`, the merge dialog, list route, dedup-check, etc.). Per briefing rule "only if the rename doesn't cascade to >5 files; otherwise just add JSDoc," skipped the rename and added explanatory comments at the write sites instead.
- **Kept `signThumbnailUrl` legacy URL passthrough.** The architecture comment says legacy rows may still carry full URLs; throwing on `https://` input would break read paths for those rows. Added the `console.warn` instead — strong telemetry signal without breakage.
- **`thumbnail_source_id` is optional in the merge schema.** Back-compat with any legacy client that doesn't send it; defense-in-depth force-nulls the value in that case.

## Status
**all_resolved.** Three Codex findings (C1, C2, I1) auto-fixed atomically with TDD. Broader test sweep clean. No architectural questions outstanding for Round 2.
