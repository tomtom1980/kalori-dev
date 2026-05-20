# Bug Bundle Manifest — 2026-05-16-library-sketch-display

**Batch ID:** `2026-05-16-library-sketch-display`
**Started:** 2026-05-16T06:50:52Z
**Completed:** 2026-05-16
**Starting head SHA:** `fdc51e7`
**Bugs fixed:** 3
**Bugs dropped:** 0
**Total files touched:** ~17 (6 production + 11 tests)
**Tests added:** 15+ new tests (5 sign-thumbnail + 5 merge guard + 2 fetch boundary + 3 update sign-on-write + 1 update reject), plus 7 modified to fit new contract; broader sweep 1928 passed / 33 skipped / 0 failed
**Mode:** bugfix-tomi (parallel investigation → batched approval → parallel implementation → 2-round Codex → security review → E2E)

---

## Why this batch

User reported three observable issues with the library surface:

1. Sketch generation was suspected to be using the expensive Nano Banana Pro model variant.
2. The shipped sketch prompt produced monochrome pen-and-ink output incongruent with user expectation of a "colorful sketch that represents real-life objects".
3. The library list page (`/library`) only rendered thumbnails on the first 10 cards; after editing an item, the just-edited card lost its thumbnail entirely.

bugfix-tomi parallel investigation surfaced that issue 1 was a misperception (already on the cheap variant), issue 2 was a deliberate design choice ("The Ledger" editorial aesthetic) requiring explicit user override, and issue 3 was a real two-defect compound (update route returns raw path + SIGN_LIMIT=10 cap) with a latent data-corruption hazard exposed by the cap raise.

---

## Bugs

### Bug 1 — Verify nano-banana model is the cheap flash variant

- **Classification:** `known_fix` (no-op verification; model already correct)
- **Description:** Confirm `lib/ai/image-client.ts` uses the cheap `gemini-2.5-flash-image` model (Nano Banana) and NOT the expensive `gemini-3-pro-image-preview` (Nano Banana Pro). Add a regression-lock test.
- **Root cause:** Not a defect. `DEFAULT_MODEL = 'gemini-2.5-flash-image'` was wired correctly in Bug 5 of the prior library overhaul batch. Misperception driven by the local `nano-banana` skill metadata which is labeled "Nano Banana Pro (Gemini 3 Pro)" but did not propagate into code.
- **Files touched:**
  - `tests/unit/lib/ai/image-client.test.ts` (one-line negative-match assertion added inline next to the existing positive `gemini-2.5-flash-image:generateContent` assertion)
- **Tests:** 1 modified (negative-match assertion `expect(calledUrl).not.toContain('gemini-3-pro-image-preview');` added to the existing real-fetch test). Result: 16 passed / 0 failed.
- **Codex findings:** No findings raised in R1 or R2 (test-only defensive lock accepted).
- **Security findings:** None.
- **Status:** implemented
- **User decision:** None required (no-op verification).

### Bug 2 — Sketch should be colorful and represent real-life objects well

- **Classification:** `actually_a_feature` requiring user override (design choice intentionally specced per "The Ledger" editorial aesthetic)
- **Description:** Rewrite the Gemini image-generation `STYLE_PREAMBLE` to produce vibrant naturalistic colored sketches that are immediately recognizable as the named food/drink.
- **Root cause:** Not a defect — the shipped prompt explicitly forbade color (`single-color hand-drawn line art`, `NO color fill`, `NO photographic detail`, `19th-century botanical or culinary engraving`, `Editorial / archival broadsheet aesthetic`). Documented design choice from prior Bug 5; aligns with `Planning/design-doc.md` "The Ledger" aesthetic.
- **Files touched:**
  - `lib/ai/sketch-prompt.ts` (STYLE_PREAMBLE rewritten to user-selected Variant A; file-header comment updated to record override rationale; `v1_sketchPrompt` export name preserved per surgical-change override)
  - `tests/unit/lib/ai/sketch-prompt.test.ts` (verbatim-cross-batch-consistency assertion flipped from `'Pen-and-ink line drawing'` to `'Colorful hand-drawn sketch'`; new regression-lock test asserts presence of new colorful tokens AND absence of old monochrome/editorial tokens)
- **NOT touched:** `lib/library/sketch-pipeline.ts` (import is `v1_sketchPrompt` and export name unchanged — surgical-change).
- **Final shipped preamble (verbatim):** `Colorful hand-drawn sketch in the style of a food illustration. Vibrant naturalistic colors. Visible pen/ink strokes. Subject must be immediately recognizable as the specific food/drink named. Clean light background. No photographic realism.`
- **Tests:** 1 modified + 1 new added. RED step: 2 failed (correct reasons — production still emitted monochrome). GREEN step: 8 passed / 0 failed. Broader `lib/ai/` sweep: 24 passed.
- **Idempotency:** Existing sketches with `sketch_generated_at IS NOT NULL` are NOT regenerated (pipeline short-circuit at `sketch-pipeline.ts:232`). Only NEW library inserts pick up the colorful preamble.
- **Codex findings:** No findings raised in R1 or R2 on the colorful-prompt change. R2 silence is intentional (the prompt is a static string + no model-output risk in current call graph).
- **Security findings:** I-5 informational only — `displayName` template-literal interpolation has a pre-existing prompt-injection posture unchanged by this batch; user-scoped, no cross-user surface, worst-case self-pwn.
- **Status:** implemented
- **User decision:** Approved override of the editorial "Ledger" aesthetic for the sketch component; Variant A (sketchy-colorful) chosen over Variant B (watercolor-illustrative). `v1_` export name preserved in place per surgical-change override (no `v2_` bump and no caller-update churn).

### Bug 3 — Library list page should display sketches and photos

- **Classification:** `known_fix` (two compounding data-path defects + a latent persistence hazard surfaced by the cap raise)
- **Description:** `/library` only rendered thumbnails on the first 10 cards (SIGN_LIMIT=10 cap). After editing an item, the just-edited card lost its thumbnail entirely (update route returned raw storage path, not a signed URL). Fix the cap and add sign-on-write to the update route.
- **Root cause (3 contributing defects):**
  1. `app/api/library/[id]/update/route.ts` — UPDATE returned raw `thumbnail_url` storage path; `.select(...)` column list was missing `thumbnail_kind` (parity drift vs `fetch.ts` and `getItem.ts`).
  2. `lib/library/fetch.ts` — `SIGN_LIMIT = 10` constant force-nulled `thumbnail_url` for positions 11+; documented Round-3 trade-off from the prior library overhaul batch.
  3. Codex R1 surfaced a latent third defect: raising SIGN_LIMIT to 500 expanded the existing signed-URL persistence hazard 50x — the merge UI copies `a.thumbnail_url` / `b.thumbnail_url` into the canonical column, and 1-hour signed URLs could be persisted permanently.
- **Files touched:**
  - **Production (4):** `app/api/library/[id]/update/route.ts` (sign-on-write + `thumbnail_kind` parity + 400 reject on `http(s)://` payload + reordered `revalidateTag` before signing await), `lib/library/fetch.ts` (SIGN_LIMIT raised 10 → 500; switched from bare `Promise.all` to `signThumbnailUrlBatch`), `lib/storage/sign-thumbnail.ts` (added `signThumbnailUrlBatch` bounded-worker pool with concurrency cap 20 + `console.warn` telemetry on legacy-URL passthrough), `app/api/library/merge/route.ts` (optional `thumbnail_source_id` discriminator + server-side raw-path resolve when `fields.thumbnail_url` is URL-shaped, force-null otherwise + Sentry capture on legacy-client guard).
  - **Client (1):** `app/(app)/library/_components/MergeDuplicatesDialog.tsx` (payload now includes `thumbnail_source_id: thumbnailSource.id` of `a` or `b` based on user's `choices.thumbnail_url` selection).
  - **Tests (11):** new `tests/unit/lib/library/fetch.test.ts` (Tests F, G, H, I), new `tests/integration/library-merge-signed-url-guard.test.ts` (5 tests for R1 C1 guard), extended `tests/integration/library-item-update.test.ts` (Tests A, B, D, E, J, K, L, M), extended `tests/unit/lib/storage/sign-thumbnail.test.ts` (warn signal + batch concurrency + per-item degradation + override option), rewrote pre-existing assertions in `tests/unit/lib/library/sign-on-read.test.ts` to assert new cap 500. 4 sibling test files received `vi.mock('server-only', () => ({}))` shim because the update route's new `signThumbnailUrl` import pulls `server-only` into the route's import graph (`library-item-update-round1.test.ts`, `library-update-refresh.test.ts`, `dashboard-orphan-profile.test.ts`, `library-item-update.test.ts`).
- **NOT touched:** `LibraryCard.tsx` (markup already renders `{thumbnail_url ? <Image /> : <LetterMark />}` correctly), `FoodDetailThumbnail.tsx`, `getItem.ts`.
- **Tests:** RED step: 5 failed for the right reasons. GREEN step after implementation: 12 passed (targeted). Broader sweep: 1913 → 1928 tests in unit + integration after batch (post-Codex R1 fixes), 0 failed.
- **Codex R1 findings (3 — all auto-fixed in a single round):**
  - **C1 (Critical):** Signed display URLs can be persisted as canonical thumbnail data via the merge UI/route. Fix: 3-layer defense (telemetry `console.warn` in `signThumbnailUrl` + optional `thumbnail_source_id` discriminator on merge route with server-side raw-path resolve + strict 400 reject on update route for `http(s)://` payloads).
  - **C2 (Critical):** Library render fans out up to 500 unbounded thumbnail signing calls. Fix: hand-rolled bounded-worker pool with `DEFAULT_SIGN_CONCURRENCY = 20`, per-worker try/catch for graceful degradation, no new dependency.
  - **I1 (Improvement):** Post-edit save success coupled to thumbnail signing after the DB write. Fix: reordered so `revalidateTag` fires synchronously immediately after the DB write succeeds, BEFORE the signing await; defense-in-depth try/catch on signing throw.
- **Codex R2 findings (3 — all accepted as `pending_minor_findings` under two-round cap):** R2-1 hung-signer worker stall / R2-2 merge raw-path passthrough back-compat / R2-3 update route Zod schema vs guard mismatch. None reachable in current execution graph.
- **Security findings (5 Medium + 11 Informational defense-in-depth confirmations):** M-1 (warn prefix leaks 32 chars of path), M-2 (Sentry raw user UUIDs in merge route), M-3 (signed URL TTL = 1 hour shared-device caveat — document-only), M-4 (Zod schema vs guard mismatch — already in R2-3), M-5 (sign error swallowed loses RLS-401 signal).
- **Status:** implemented
- **User decision:** `SIGN_LIMIT = 500` (per user direction passed via orchestrator — covers essentially unbounded single-user library; ~50ms per-render JWT-sign cost at the new cap).

---

## Codex round 1 findings (resolved)

### C1 — Signed display URLs can be persisted as canonical thumbnail data
- **File:** `lib/library/fetch.ts:60` + merge UI/route call chain
- **Origin:** Bug 3 SIGN_LIMIT raise from 10 → 500 expanded existing hazard 50x
- **Fix:** Three independent boundaries: (a) `console.warn` in `signThumbnailUrl` when legacy `http(s)://` value flows in (telemetry, kept passthrough for back-compat); (b) added optional `thumbnail_source_id: z.string().uuid().nullable().optional()` to merge route `BodySchema` — when `fields.thumbnail_url` matches `^https?://`, looks up source row's raw `thumbnail_url` from `food_library_items` by `thumbnail_source_id` (RLS-scoped) and substitutes the raw path; if `thumbnail_source_id` is absent or lookup fails, force-nulls the value rather than persisting the signed URL (Sentry warning on legacy-client path); (c) strict 400 reject on update route for `^https?://` payloads with body `signed_url_not_writable`; (d) MergeDuplicatesDialog wired to send `thumbnail_source_id: thumbnailSource.id`.
- **Status:** RESOLVED in R1 fix batch

### C2 — Library render fans out up to 500 unbounded thumbnail signing calls
- **File:** `lib/library/fetch.ts:145-153`
- **Origin:** Bug 3 SIGN_LIMIT raise from 10 → 500 with bare `Promise.all`
- **Fix:** Added `SignBatchOptions` type and rewrote `signThumbnailUrlBatch` as a bounded-worker pool with `DEFAULT_SIGN_CONCURRENCY = 20` (overrideable). Each worker pulls the next index from a shared cursor, signs, writes back to a pre-allocated `results` array. Per-item try/catch inside the worker loop catches throws (degrades to `null` for that row only; batch survives). `fetch.ts` switched from `Promise.all(rows.map(...))` to `signThumbnailUrlBatch` invocation. SIGN_LIMIT=500 semantics preserved; rows 500+ get `thumbnail_url=null` via cheap O(N) loop without signing call. No new dependency (~15 LoC).
- **Status:** RESOLVED in R1 fix batch

### I1 — Post-edit save success coupled to thumbnail signing
- **File:** `app/api/library/[id]/update/route.ts:185-187`
- **Origin:** Bug 3 sign-on-write added to update route, awaited before `revalidateTag`
- **Fix:** Reordered post-DB-write steps: DB write → `revalidateTag(...)` (synchronous, immediate) → `signThumbnailUrl(...)` wrapped in try/catch (defense in depth) → return. Mutation result is authoritative; cache invalidation is part of mutation's correctness contract. Thumbnail signing is best-effort display-URL resolution and never blocks cache invalidation.
- **Status:** RESOLVED in R1 fix batch

---

## Codex round 2 findings (accepted as pending follow-ups under two-round cap)

### R2-1 — Hung signing still stalls the entire library render
- **File:** `lib/storage/sign-thumbnail.ts:146-157` (worker pool)
- **Codex severity:** `[high]` → categorized as Improvement (forward-defensive; no observed live trigger; Supabase JWT signing is documented synchronous-equivalent — no remote round-trip in steady state; R1 worker pool DOES catch thrown errors)
- **Codex recommendation:** Put a per-item `Promise.race(timeout)` around signing and resolve that item to null on timeout before awaiting the worker pool; apply the same timeout policy to single-item signing in mutation responses.
- **Decision:** Defer — no observed live trigger, R1 worker pool already prevents cascade failure from throws, current Supabase architecture is JWT-synchronous.

### R2-2 — Merge guard still trusts client-supplied raw thumbnail paths
- **File:** `app/api/library/merge/route.ts:218-262` (post-R1 guard)
- **Codex severity:** `[medium]` → categorized as Improvement (RLS scopes by `user_id` so cross-user data corruption not reachable; raw-path passthrough is intra-user "wrong thumbnail" only; not reachable from MergeDuplicatesDialog post-SIGN_LIMIT raise because dialog values are now URL-shaped → tight guard fires)
- **Codex recommendation:** Require/validate `thumbnail_source_id` whenever `fields.thumbnail_url !== null` and always resolve raw path server-side; reject or null any client-supplied path that cannot be resolved from those rows.
- **Decision:** Defer — not reachable from current execution graph; removing back-compat is a contract change that warrants its own dedicated mini-batch.

### R2-3 — Update route thumbnail schema contradicts the raw-path contract
- **File:** `app/api/library/[id]/update/route.ts:84` (Zod schema)
- **Codex severity:** `[medium]` → categorized as Improvement (intended canonical write surface — raw storage paths — currently UNREACHABLE through this endpoint because Zod's `z.string().url()` rejects them; non-http URL schemes like `ftp://`, `data:`, `javascript:` pass Zod and slip past `^https?://` guard; NOT reachable for XSS via next/image remotePatterns whitelist; intra-user data-corruption only)
- **Codex recommendation:** Replace the URL validator with an explicit storage-path-or-null validator (e.g. `z.string().refine(v => !v.includes('://'))`) and reject all URL schemes for this write field.
- **Decision:** Defer — current caller `useFoodDetailEdit.ts` does not send `thumbnail_url` at all; contradiction is contract-hygiene gap, not a corruption path.

---

## Security findings (5 Medium rolled to follow-ups + 11 defense-in-depth confirmations)

### Medium (deferred to follow-ups)

- **M-1 — `console.warn` URL passthrough prefix leaks first 32 chars of legacy thumbnail URL** (`lib/storage/sign-thumbnail.ts:77-82`). Today bounded to project-ref + supabase.co host; magic-number drift could push it into PII territory. Recommended: drop URL prefix from log line entirely, or replace with shape-only marker.
- **M-2 — Sentry `extra` payload includes raw user/winner/loser UUIDs in merge route** (`app/api/library/merge/route.ts:197-199, 236, 257`). Breaks `lib/auth/orphan-profile-fence.ts` SHA-256 anonymization precedent. Recommended: extract shared `hashUserId` helper or accept inconsistency explicitly. Should be cleaned up in a dedicated PII-redaction mini-batch covering all routes.
- **M-3 — Signed URL TTL = 1 hour shared-device caveat** (`lib/storage/sign-thumbnail.ts:36`). Standard signed-URL tradeoff; already a hardening from prior 7-day TTL. Document-only — no further action this batch.
- **M-4 — Update route Zod schema admits non-HTTP URL schemes the runtime guard does not reject** (`app/api/library/[id]/update/route.ts:84`). Echoes R2-3. Confirmed unreachable for XSS via next/image `remotePatterns` whitelist; corruption surface is intra-user only.
- **M-5 — Signing failure inside `signThumbnailUrl` swallows underlying error code** (`lib/storage/sign-thumbnail.ts:85-93`). Graceful degradation is correct, but eliminates security-relevant signal of RLS denial. Recommended: add `console.warn` or Sentry breadcrumb on catch branch distinct from null/error data branch.

### Informational defense-in-depth confirmations (positive findings)

- **I-1:** `signThumbnailUrlBatch` shared-state worker pool is safe given JS single-threaded model (cursor read+increment atomic, distinct results indices per worker).
- **I-2:** Merge route raw-path passthrough relies on RLS for cross-user isolation (echo of R2-2); confirmed no cross-user data leak possible.
- **I-3:** Update route uses 404 (not 403) for cross-user attempts — correct existence-hiding posture.
- **I-4:** Storage RLS uses strict UUID regex before `::uuid` cast — short-circuits malformed first segments (path-traversal block confirmed).
- **I-5:** Bug 2 colorful prompt displayName interpolation has documented prompt-injection posture upstream (user-scoped, no cross-user surface, worst-case self-pwn — pre-existing posture unchanged by this batch).
- **I-6:** next/image escapes URL via `remotePatterns` validation — XSS via `thumbnail_url` not reachable.
- **I-7:** MergeDuplicatesDialog new `thumbnail_source_id` field interpolated into JSON payload only — no DOM interpolation, no new XSS surface.
- **I-8:** CSRF posture — Supabase SSR auth uses HTTP-only same-site cookies (existing posture; no regression).
- **I-9:** Revalidate-before-sign reorder is data-consistency hygiene, not a security concern (sub-millisecond race window).
- **I-10:** Update route 400 error response does NOT echo user input — safe.
- **I-11:** Sentry-captured error messages from Supabase do NOT contain service-role secrets or signed-URL signatures.

Plus 10 standalone defense-in-depth confirmations: Storage RLS path-based ownership, Library RLS row-level ownership, `requireProfileOrJson401` ordering, next/image remotePatterns whitelist, three-layer signed-URL persistence guard, per-item error isolation in batch worker, fail-closed `requireProfileOrJson401` on lookup error, self-merge guard at Zod + RPC layer, UUID validation on URL segment, `thumbnail_source_id` Zod uuid validation.

---

## E2E

**Test file added:** `tests/e2e/library/library-list-thumbnails-post-edit.spec.ts` (2 tests, both passing).

| Test | Status | Duration | Verifies |
|------|--------|----------|----------|
| `thumbnail persists in library list after editing the item name` | passed | 21.8s | Bug 3 round-trip — upload PNG → seed → /library renders `<Image>` → edit name via `?mode=edit` → save → back to /library, `<Image>` still rendered (proves the update route's sign-on-write). Pre-fix this broke because the update route returned a raw storage path and `next/image` rejected it. |
| `cards at positions 11+ render <Image>, not lettermark (SIGN_LIMIT raise)` | passed | 28.1s | Seed 12 rows with uploaded PNGs (name-asc sort puts them contiguous), navigate /library, page-2 navigation, assert zero `library-card-lettermark-*` across all 12 seeded rows. Verifies SIGN_LIMIT=500 raise. |

**Regression baseline (8 specs):** add-then-view / open-empty / add-item-form (×2) / bulk-delete-undo / search-filter-sort / single-delete-undo (×2) — all passing.

**Excluded from this batch's scope (7 pre-existing failures, zero diff vs starting SHA `fdc51e7`, per memory ID 8105):**
- `library-merge-duplicates.spec.ts` (i18n copy drift)
- `library-quick-action-menu.spec.ts` (copy assertion `'strike 1 title'` vs `'Strike 1'`)
- `library-a11y.spec.ts` (pre-existing)
- `library-keyboard-nav.spec.ts` (pre-existing)
- `library-sketch-thumbnail.spec.ts` (legacy seed strategy doesn't upload real PNG; signing-failure-returns-null path now correctly falls back to lettermark — spec needs update, defer)
- `library-visual.spec.ts` (strict-mode duplicate `library-empty-first-time` element)

**Dev-server arrangement:** Worked around port conflict (user's prod-pointing `pnpm dev` on :3000) by running Playwright with `PORT=3100 PREVIEW_URL=http://localhost:3100` — Playwright auto-spawned its own kalori-dev-pointed dev server via `.env.test.local` global-setup.

**Visual regression:** NOT exercised; new functional E2E spec covers `library-card-thumb-{id}` assertions instead.

---

## Pending follow-ups

To be filed to `Planning/followups.md` at commit time (next sub-agent step):

1. **R2-1** — Add per-call `Promise.race(timeout)` to `signThumbnailUrl` and worker-pool per-item await (hung-task hardening).
2. **R2-2** — Require `thumbnail_source_id` whenever `fields.thumbnail_url !== null` in merge schema; always resolve raw path server-side (close back-compat surface).
3. **R2-3** — Replace `z.string().url()` with raw-path-or-null validator in update route `BodySchema.thumbnail_url`.
4. **SEC-M-1** — Drop URL prefix from `console.warn` in `signThumbnailUrl` (or replace with shape-only marker).
5. **SEC-M-2** — SHA-256 anonymize user/winner/loser UUIDs in merge route Sentry payloads.
6. **SEC-M-5** — Add Sentry breadcrumb on `signThumbnailUrl` catch branch (preserve RLS-401 signal).
7. **Sketch-thumbnail E2E spec update** — Update `tests/e2e/library/library-sketch-thumbnail.spec.ts` seed strategy to upload a real PNG (post Round-2 signing-failure-returns-null now correctly falls back to lettermark; legacy spec assumed path-passthrough behavior).

---

## Phase outcomes

| Phase | Outcome |
|---|---|
| Phase 1 — Per-bug planning (parallel investigation) | 3 proposals written |
| Phase 2 — User approval gate | Approved all 3 bugs; Bug 2 design override confirmed (Variant A colorful sketch); Bug 3 SIGN_LIMIT=500 chosen |
| Phase 3 — Batched implementation (TDD, parallel where independent) | 3 bugs implemented; broader sweep 1913 passed / 33 skipped / 0 failed |
| Phase 4 — Codex review round 1 | 2 Critical + 1 Improvement → all auto-fixed; 1928 passed / 33 skipped / 0 failed |
| Phase 5 — Codex review round 2 | 0 Critical + 3 Improvement → accepted as `pending_minor_findings` under two-round cap |
| Phase 6 — Security review | 0 Critical / 0 High / 5 Medium / 11 Informational; rolled Medium findings to `pending_minor_findings`; no auto-fix |
| Phase 7 — E2E + UI testing | 2 new tests passing; 8 regression baselines passing; 7 pre-existing failures excluded per zero-diff verification |
| Phase 8 — Docs, lessons, commit | (in progress) |
