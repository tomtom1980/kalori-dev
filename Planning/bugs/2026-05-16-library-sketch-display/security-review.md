# Security Review — bugfix-tomi batch 2026-05-16-library-sketch-display

**Reviewer:** Security review sub-agent (bugfix-tomi Phase 6)
**Date:** 2026-05-16
**Scope:** Aggregate uncommitted diff across 7 production files + 7 test files.
**Method:** Targeted per-file `git diff HEAD`, followed by directed review of input validation, authn/authz, PII handling, injection, secret leakage, XSS/CSRF, and race conditions per the brief.

---

## Critical

_None._

---

## High

_None._

---

## Medium

### M-1. `console.warn` in `signThumbnailUrl` leaks first 32 chars of legacy thumbnail URL to server logs (PII / token leakage hazard)
- **File:** `lib/storage/sign-thumbnail.ts:77-82`
- **Issue:** When a legacy `http(s)://` value flows in, the helper emits `console.warn(... 'Input prefix: ' + pathOrUrl.slice(0, 32))`. The first 32 chars of a Supabase signed URL covers the protocol + hostname (`https://<project-ref>.supabase.co/`) which is non-secret, BUT for the `food-thumbnails` bucket the path prefix immediately following is `/storage/v1/object/sign/food-thumbnails/{user_id}/...` — and the bucket name + user-id segment can leak in the next ~40-50 chars if the prefix length is ever increased. At 32 chars today the leakage is bounded to project ref + supabase.co host (already known), but the value comes from arbitrary upstream callers — if a future caller ever passes a string that happens to start with a JWT-bearing query string (unlikely for this helper, but theoretically possible) the first 32 chars would include token material.
- **Reachability:** Today, only the read path + tests exercise this branch in production. Anonymous user-id leakage is not currently reachable from the 32-char prefix.
- **Recommended fix (defer):** Drop the URL prefix from the log line entirely; the static "received an already-signed URL" message is enough telemetry. Anyone investigating can reproduce locally without seeing the raw value. Alternatively, replace with `pathOrUrl.startsWith('https://') ? 'https-prefixed' : 'http-prefixed'` so the warn is shape-only, never content.
- **Severity rationale:** Today the 32-char slice does not include any per-user identifier. Treating as Medium because (a) the slice length is a magic number that future edits could grow into PII territory, (b) `console.warn` in Next.js server runtime flows to Vercel logs which are accessible to anyone with project-team access, and (c) the warn fires on every legacy-row render until the maintenance script clears them, so log volume could be non-trivial.

### M-2. Sentry `extra` payload in merge route includes raw user/winner/loser UUIDs (anonymization inconsistency vs. orphan-profile-fence)
- **File:** `app/api/library/merge/route.ts:197-199, 236, 257`
- **Issue:** Three Sentry capture sites in the merge route attach `extra: { userId, winnerId, loserId }` (and one with `loserId`). The orphan-profile-fence module deliberately SHA-256 hashes user ids before sending to Sentry to avoid leaking the auth-user UUID into the error pipeline (per `lib/auth/orphan-profile-fence.ts:62-65` + breadcrumb `user_id_hash` field). The merge route's new Sentry additions break that anonymization invariant.
- **Reachability:** Always fires on the relevant error paths (cache-invalidation prefetch failure, thumbnail-source lookup failure, legacy-client signed-URL guard).
- **Recommended fix (defer):** Either (a) reuse a shared `hashUserId` helper (extract from orphan-profile-fence into `lib/auth/anonymize.ts`), or (b) accept the inconsistency explicitly and document it. For this batch, the additions to lines 197-201, 234-237, and 255-259 should anonymize user_id minimum; winner/loser ids are intra-library identifiers and lower-PII than auth.user.id.
- **Severity rationale:** Project convention (set in orphan-profile-fence) says auth user ids never reach Sentry in raw form. The merge route bypasses that convention. Not a critical leak — Sentry is access-controlled — but a defense-in-depth regression worth flagging. The existing `library-merge-cache-invalidation` Sentry capture at line 197 already does this (pre-existing in the codebase before this batch), so this batch is following existing precedent rather than introducing a new pattern. If treated as out-of-scope cleanup, defer to a dedicated PII-redaction mini-batch.

### M-3. Signed URL lifetime / shared-device leakage (informational — known signed-URL caveat, raised by the brief)
- **File:** `lib/storage/sign-thumbnail.ts:36` (`SIGN_TTL_SECONDS = 60 * 60`)
- **Issue:** Signed URLs returned to the client carry a 1-hour TTL. Once handed to the browser, the URL itself is a bearer token — anyone with access to the browser cache, history, or DOM source for an hour can retrieve the thumbnail directly (bypassing session). This is the standard signed-URL tradeoff; the previous shipped value was 7 days, which Codex flagged in an earlier round, so 1 hour is already a hardening. Worst-case impact: a user steps away from a shared device, attacker reads the page source, copies `<img src>` for every visible thumbnail, retains access for up to 1 hour.
- **Reachability:** Standard signed-URL caveat; applies to every URL handed to the client.
- **Recommended fix (defer):** Document as a known posture in `Planning/.tmp/.../followups.md`. Possible future hardenings: lower TTL to 15 min (forces more frequent sign-on-read, costs more CPU); short-lived signed cookies tied to session instead of bearer URLs (architecture change). For MVP single-user use, the current TTL is acceptable.

### M-4. Update route Zod schema admits non-HTTP URL schemes that the runtime guard does NOT reject (R2-3 echo, already in pending_minor_findings)
- **File:** `app/api/library/[id]/update/route.ts:84` (`z.string().url()`) + `:147-159` (guard)
- **Issue:** Codex R2-3 flagged the schema-vs-guard mismatch: `z.string().url()` accepts `ftp://`, `data:`, `javascript:`, `file://`, `gopher://`, and similar URI schemes. The guard at line 149 only rejects `^https?://`. A malicious or version-skewed caller could send `thumbnail_url: "javascript:alert(1)"` and it would pass schema validation, slip past the guard, and be persisted into the canonical `thumbnail_url` column.
- **Reachability of impact:** The persisted value would later be fed to `signThumbnailUrl`. `isStoragePath()` at line 47 short-circuits `http://`/`https://` to URL-passthrough; for any other scheme (e.g. `javascript:`, `data:`), it returns `true` (because the path neither starts with http nor https), so the value would flow into `supabase.storage.from(...).createSignedUrl(...)`. The Supabase client would attempt to create a signed URL for the literal path `javascript:alert(1)`, which would 400 against the storage API — but the row is still corrupted (the column contains a non-path value). If later read by a different code path (or by `fetchLibraryPage`'s `signed[idx]!` non-null assertion) without going through the signing helper, the corrupted value could surface in `next/image`'s `src`. `next/image` would reject any URL not matching `remotePatterns` (configured to `supabase.co/storage/v1/object/sign/...`) — so XSS via `javascript:` URLs is **NOT** reachable. Worst-case: row gets a corrupted, never-renderable value.
- **Reachability of attack:** The known caller (`useFoodDetailEdit.ts`) does not send `thumbnail_url` at all. The contradiction is only reachable via a malicious or version-skewed direct API caller, AND any user submitting a malicious payload only damages their own library row (RLS enforces `user_id = auth.uid()`).
- **Recommended fix (defer — already in pending_minor_findings):** Replace `z.string().url()` with `z.string().refine(v => !v.includes('://') && v.length <= 256)` for raw-path-or-null contract. Tracked as R2-3 in `Planning/.tmp/.../codex/round-2-categorized.md`.
- **Severity rationale:** This was already in pending_minor_findings from Codex R2-3. Re-stated here for completeness of the security view and to confirm the chain `Zod → guard → signer → next/image` does prevent XSS even with the schema-vs-guard mismatch. The corruption surface is intra-user only.

### M-5. Signing failure inside `signThumbnailUrl` swallows the underlying error code silently (degradation visibility)
- **File:** `lib/storage/sign-thumbnail.ts:85-93`
- **Issue:** The `try { ... } catch { return null; }` swallows every storage error category — 404 (object missing, recoverable), 401 (RLS denied, security signal), 5xx (Supabase outage, ops signal), schema mismatch (bug signal). All collapse to "render letter-mark." For graceful degradation that's correct, but it eliminates the security-relevant signal of RLS denial (a user attempting to sign a path they don't own would currently silently fall back to letter-mark, with zero telemetry).
- **Reachability:** Today the only callers feed in paths from rows the user already owns (RLS-scoped read), so an RLS denial during signing should never legitimately happen. If it ever does, it's a bug-or-attack signal worth surfacing.
- **Recommended fix (defer):** Add a `console.warn` or Sentry breadcrumb on the catch branch, distinct from the `null/error` data branch. Out of scope for this batch.

---

## Informational

### I-1. `signThumbnailUrlBatch` shared-state worker pool is safe given JS single-threaded model
- **File:** `lib/storage/sign-thumbnail.ts:126-159`
- **Note:** The worker pool uses a shared `cursor` counter + shared `results` array indexed by per-worker `index`. JavaScript's single-threaded event loop guarantees `const index = cursor; cursor += 1;` is atomic relative to other workers (no thread context switch can interleave between read and increment). Each worker writes to a distinct index. **Confirmed safe.** No race condition possible under the current runtime contract.

### I-2. Merge route raw-path passthrough relies on RLS for cross-user isolation (R2-2 echo)
- **File:** `app/api/library/merge/route.ts:218-262`
- **Note:** When the client sends a raw `thumbnail_url` path (not URL-shaped), the merge route passes it through to the RPC unchanged. RLS on `food_library_items` enforces `auth.uid() = user_id`, so even if a malicious client sends a path under another user's id prefix, the row that gets updated is still the calling user's row — the column just stores a path that won't render (the storage RLS at `0004_storage_buckets.sql:39-45` denies SELECT on objects not under `auth.uid()/...`). Worst-case: intra-user "wrong thumbnail" / 403-on-render. Already in pending_minor_findings as R2-2. **Confirmed: no cross-user data leak possible.**

### I-3. Update route uses 404 (not 403) for cross-user attempts — correct existence-hiding posture
- **File:** `app/api/library/[id]/update/route.ts:187-191`
- **Note:** When the SELECT returns no row (either the id doesn't exist, the row is tombstoned, OR the row is owned by another user and RLS filtered it out), the route returns 404 rather than 403. This is the correct posture (don't leak existence to cross-user probes). **Confirmed.**

### I-4. Storage RLS uses strict UUID regex before `::uuid` cast — short-circuits malformed first segments
- **File:** `supabase/migrations/0004_storage_buckets.sql:39-74`
- **Note:** Each RLS policy gates on `split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'` BEFORE the `::uuid` cast. Path-traversal attempts like `../../../etc/passwd`, `//foo`, or `not-a-uuid/foo` fail the regex and deny — they never reach the cast (which could otherwise raise a Postgres error inside the RLS predicate). Confirmed defense-in-depth path-traversal block.

### I-5. Bug 2 colorful prompt — displayName interpolation has documented prompt-injection posture upstream
- **File:** `lib/ai/sketch-prompt.ts:51-53`
- **Note:** The new prompt interpolates `displayName` directly via template literal `Subject: "${name}".`. A malicious displayName containing `"); ignore previous instructions; ...` would escape the inner quote and inject. **HOWEVER:** (a) the sketch pipeline takes displayName from `food_library_items.display_name`, which is user-scoped (the attacker can only attack their own sketch generation — no cross-user surface); (b) the existing sanitize.ts pipeline applies to the text-prompt path but **NOT** to v1_sketchPrompt — verified by reading sketch-pipeline.ts:255-269 (displayName is used raw via `args.displayName ?? row.display_name`). This is a **pre-existing** posture unchanged by this batch. Worst-case impact: a self-pwning user generates a different sketch than intended for their own library row. No cross-user, no auth bypass, no data corruption. Not introduced by this bugfix. Flag as informational for a future hardening pass: route sketch-prompt displayName through `sanitizeUserText()` from `lib/ai/sanitize.ts` for defense in depth.

### I-6. next/image escapes URL via `remotePatterns` validation — XSS via thumbnail_url not reachable
- **File:** `app/(app)/library/_components/LibraryCard.tsx:140-155` + `next.config.ts:42-53`
- **Note:** `<Image src={item.thumbnail_url}>` validates against `remotePatterns` which restricts to `https://*.supabase.co/storage/v1/object/{sign,public}/food-thumbnails/**`. Any non-matching URL (including the M-4 hypothetical `javascript:` smuggle) triggers Next.js's runtime validation error rather than rendering a clickable URL. **Confirmed: no XSS surface via thumbnail rendering.**

### I-7. MergeDuplicatesDialog new `thumbnail_source_id` field is interpolated into JSON payload only — no DOM interpolation
- **File:** `app/(app)/library/_components/MergeDuplicatesDialog.tsx:127, 155`
- **Note:** `thumbnailSource.id` (a UUID from a user-owned `LibraryItem`) is included in the merge POST body as JSON. It is NOT rendered into the DOM, NOT interpolated into a URL, NOT placed into `innerHTML`. The merge UI displays only `display_name` and per-field values which were already rendered pre-batch. **No new XSS surface introduced.**

### I-8. CSRF posture — Supabase SSR auth uses HTTP-only same-site cookies (existing posture)
- **Note:** The codebase has no top-level `middleware.ts`. The update + merge routes rely on `requireProfileOrJson401` (which calls `auth.getUser()` against Supabase's SSR cookie). Cookie-based auth without explicit CSRF tokens is acceptable WHEN: (a) cookies are `SameSite=Lax` or `Strict` (Supabase default is Lax — confirmed via `@supabase/ssr` defaults), (b) routes accept JSON only (both routes parse `request.json()` and reject non-JSON via try/catch), (c) routes do not act on simple form-encoded POSTs (they would 400 the FormData parse). The new code does NOT change this posture. **No CSRF regression.** Note that classical CSRF protection (token in body+cookie) is not implemented anywhere; this is a known posture for the project. If ever a route is added that accepts `application/x-www-form-urlencoded` POSTs from the browser, CSRF tokens would become required. Out of scope for this batch.

### I-9. revalidate-before-sign reorder — data consistency, not a security concern
- **File:** `app/api/library/[id]/update/route.ts:201-227`
- **Note:** `revalidateTag` fires BEFORE the signing await resolves. A concurrent fetch hitting between the DB write and the revalidate fire window would get stale data. Not a security issue — it's a cache-consistency footgun. Mitigations: revalidate fires synchronously (next/cache's invalidate is in-process), so the race window is sub-millisecond. The reorder is correct (DB write is authoritative; signing is best-effort) and the previous order would have been worse (signing failure could starve the cache).

### I-10. Update route 400 error response does NOT echo user input — safe
- **File:** `app/api/library/[id]/update/route.ts:151-158`
- **Note:** The signed-URL reject response says `"thumbnail_url must be null or a raw storage path; signed URLs are never written."` — does not echo the offending value. Validation errors at line 121-124 return `parsed.error.issues` which is Zod-generated and may include field paths but not raw values for `.url()` schema mismatches (Zod's default message for `.url()` is "Invalid url"). **Confirmed: no input echo in error responses.**

### I-11. Sentry-captured error messages from Supabase do NOT contain service-role secrets or signed-URL signatures
- **Note:** Supabase JS client error messages contain operation context (e.g., `"violates row-level security policy"`) and HTTP status codes — never the project's service-role key or signed-URL HMAC signature. Sentry `captureException(rpcError)` at merge route line 196 captures the error object whose `.message` field is bounded by Supabase's error model. **Confirmed: no secret leakage via Sentry payloads.**

---

## Defense-in-Depth Confirmations (Positive Findings)

1. **Storage RLS path-based ownership** — `0004_storage_buckets.sql:39-74` enforces `split_part(name, '/', 1)::uuid = auth.uid()` on every Storage verb. Path traversal, cross-user fetches, malformed first-segment paths all denied at the database layer. Even if a higher layer leaks a path under another user's prefix, the storage layer denies the sign request.

2. **Library RLS row-level ownership** — `0003_food_schema.sql:65-81` enforces `auth.uid() = user_id` on every CRUD verb on `food_library_items`. Update + merge routes write `.eq('user_id', userId)` to defense-in-depth this layer, and the orphan-profile-fence ensures `userId` is server-derived (never client-supplied).

3. **`requireProfileOrJson401` is called BEFORE any aggregate read** — update route line 128, merge route line 146. Cross-user data exposure via update/merge requires bypassing both auth.getUser AND RLS — both server-enforced.

4. **next/image remotePatterns whitelist** — `next.config.ts:42-53` restricts image sources to `*.supabase.co/storage/v1/object/{sign,public}/food-thumbnails/**`. No `javascript:`, `data:`, or arbitrary HTTP/HTTPS URLs can render through `<Image>`. Closes the M-4 XSS vector definitively.

5. **`isStoragePath()` heuristic + 400 reject + server-side raw-path resolve** — three layers prevent signed URL persistence: the client sends `thumbnail_source_id`, the server re-resolves from the DB row, the update route rejects `http(s)://` at the boundary. Defense-in-depth correct.

6. **`signThumbnailUrlBatch` per-item error isolation** — try/catch in the worker per call means one rogue path cannot crash the entire library render. Combined with the SIGN_LIMIT=500 cap, worst-case attacker damage is degraded rendering of their own library page (no cross-user surface).

7. **`requireProfileOrJson401` fail-closed on lookup error** — transient Supabase errors return 503 (with distinct `profile_lookup_unavailable` body) rather than the orphan 401 (`profile_lookup_failed`). The refresh interceptor pattern-matches the orphan body, so a transient blip never forces a session sign-out. Confirmed correct posture preserved.

8. **Self-merge guard at Zod + RPC layer** — winnerId ≠ loserId enforced at Zod refine (line 106-109) AND at the RPC P0002 fence (line 284-289). Belt-and-suspenders for direct-RPC callers who bypass the route. No data-loss surface from concurrent same-id merges.

9. **UUID validation on URL segment** — update route line 108-111 validates the `[id]` path segment is a UUID via `z.string().uuid().safeParse(id)` before any query. Defense-in-depth against non-UUID injection at the query layer.

10. **Merge `thumbnail_source_id` is `z.string().uuid().nullable().optional()`** — line 96. Even if a malicious client sends an arbitrary string, Zod rejects with a 400 ValidationError before any query. SQL injection through this field is **not** possible at the parser layer; even if it were bypassed, the Supabase client always parameterizes via the REST API.

---

## Decision: Proceed to Phase 7

**Counts:** Critical 0 / High 0 / Medium 5 / Informational 11.

Per bugfix-tomi Phase 6 rule: "If only Medium/Informational findings → roll into `pending_minor_findings` in state.md, do not auto-fix, proceed to Phase 7."

**Rationale for not auto-fixing:**
- M-1 (warn prefix leak) — bounded today; cleanup is hygiene, not security. Defer.
- M-2 (Sentry raw user-id) — follows existing project precedent (merge route already had this pattern before this batch). Should be cleaned up in a dedicated PII-redaction mini-batch covering all routes consistently, not in this bugfix scope.
- M-3 (signed-URL TTL) — known posture; 1-hour TTL is already a hardening from a prior 7-day. Document only.
- M-4 (Zod url() vs http(s) guard mismatch) — already in pending_minor_findings as R2-3. Confirmed unreachable for XSS via next/image remotePatterns. Intra-user data-corruption only.
- M-5 (sign error swallowed) — graceful-degradation tradeoff is correct; adding a warn is hygiene.

**state.md updates:**
- `security_review: completed_clean` (no Critical/High; Medium/Informational rolled to pending_minor_findings)
- Append M-1 / M-2 / M-5 to `pending_minor_findings` (M-3 is doc-only; M-4 already present as R2-3)

**No fix sub-agent dispatch required. No user escalation required. Proceed to Phase 7 (E2E + UI testing).**
