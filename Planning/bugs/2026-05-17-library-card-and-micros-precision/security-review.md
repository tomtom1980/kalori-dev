# Security Review — Bug Bundle 2026-05-17-library-card-and-micros-precision

**Reviewer:** bugfix-tomi security-review sub-agent
**Date:** 2026-05-17
**Phase:** 6 — Mandatory single-round security review
**Source state:** `Planning/.tmp/bugfix-2026-05-17-library-card-and-micros-precision/state.md`

---

## Scope reviewed

**Source files (production):**
- `app/api/entries/save/route.ts` — save-to-library branch (lines ~512–835); link UPDATE + 23505 recovery + COUNT-derived bump (R1 + R3 fixes)
- `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` — `formatMilligrams` 4-tier precision (Bug 2)

**Reference (for context):**
- `lib/sentry/before-send.ts` — Sentry PII scrubber (verifies `extra.userId` / `extra.libraryItemId` / `extra.normalizedName` are NOT in `PII_KEYS`, so they survive — see findings below)
- `Planning/architecture.md` §3.2, §3.3 — RLS policies for `food_entries` + `food_library_items`
- `lib/text/normalize.ts` — input transform applied to `normalized_name` before SELECT

**Test files (not security-surface):** `tests/unit/api/entries-save.test.ts`, `tests/unit/library/food-detail-format.test.ts`, `tests/components/library/FoodDetailMacros.test.tsx`

---

## Findings by category

### Input validation

**Status: PASS**

The save-to-library branch reuses the same upstream Zod-strict `BodySchema` as the rest of the route. R1/R3 fixes did NOT introduce new input paths:
- The R1 23505 recovery SELECT keys on `computedNormalized` (line 635), which is server-derived from `firstItem.name` via the canonical `normalizeName` helper (line 534). Client-supplied `body.normalized_name` is explicitly **ignored** (comment at lines 519–522 — by design).
- The R3 link UPDATE keys on `insertedId` (line 697) which is the server-controlled `inserted.id` from the just-committed `food_entries` INSERT — never client-supplied.
- `body.library_item_id` (when present) already goes through the ownership + tombstone fence at lines 165–178 BEFORE reaching any save-to-library code.
- `firstItem.name` cap is 200 chars via `ParsedItemSchema.name.max(200)`; `firstItem.micros` is bounded by `MAX_MICRO_VALUE` per the C2-R2-1 fix.

No new untrusted input surface introduced by R1/R3.

### Authn/Authz

**Status: PASS**

Every new query is correctly scoped:

| Query | Lines | Scope predicate | Verdict |
|---|---|---|---|
| 23505 recovery SELECT | 631–640 | `.eq('user_id', userId).eq('normalized_name', computedNormalized).is('deleted_at', null)` | Correct — user-scoped via `userId` (from `fenced.user.id`, server-derived) |
| Link UPDATE (R3) | 699–706 | `.eq('id', insertedId).eq('user_id', userId)` | Correct — both id-scope and explicit user-scope (defense-in-depth above RLS) |
| COUNT (head:true) | 734–741 | `.eq('user_id', userId).eq('library_item_id', libraryItemId)` | Correct — user-scoped |
| Bump UPDATE | 755–763 | `.eq('id', libraryItemId).eq('user_id', userId).is('deleted_at', null)` | Correct — user-scoped + tombstone-aware |

RLS policies (`architecture.md` §3.2 + §3.3) enforce `auth.uid() = user_id` on SELECT/UPDATE for both tables. Code explicit scoping is defense-in-depth and matches the policy semantics. No cross-user mutation path observed.

The concern raised in the brief — "could one user's library row be updated by another user's request" — is mitigated by BOTH layers: RLS (the SQL-level fence) AND the explicit `.eq('user_id', userId)` chain on every UPDATE.

### PII handling

**Status: PASS (with Informational note below)**

`lib/sentry/before-send.ts` runs on every captured event and:
- Strips `items`, `ai_reasoning`, `weight_kg`, `bio_sex`, `age`, `notes`, `email`, `id`, `ip_address`, `*_token` from anywhere in the payload.
- Redacts `authorization`, `cookie`, `x-supabase-auth`, `sb-*` request headers + cookies.

The new Sentry captures from R1/R3 emit:
- `extra: { userId, libraryItemId, insertedId, count }` — line 722, 749, 773, 785
- `extra: { userId, normalizedName: computedNormalized }` — line 653, 803, 831
- `tags: { component, scope, pg_code }` — all paths

**Critical observation:** The scrubber's `USER_PII_KEYS` (line 37) only matches `email`, `id`, `ip_address`, `username` on the **`user` branch** of the event. `extra.userId` is a different key name in a different branch — it survives the scrubber. This is consistent with the project's existing pattern (every other Sentry capture in `save/route.ts` does the same thing — lines 363, 402, 466, 506) and the project's design-doc §16 evidently considers internal `userId` UUIDs acceptable for Sentry observability.

`normalized_name` is post-normalize (lowercased, punctuation stripped, sorted tokens) — it leaks the food name back to Sentry, but ai_reasoning and `items` (the richer PII) are scrubbed. Food names alone in a single-user MVP context are low PII-impact. Pre-existing pattern — not introduced by this batch.

**Verdict:** PII handling for the new captures matches the existing convention in this same file. No regression. See Informational #1 below for an enhancement opportunity (not blocking).

### Injection vectors

**Status: PASS**

All new queries use Supabase JS client builder methods (`.eq()`, `.is()`, `.maybeSingle()`, `.update()`, `.select()`), which parameterize binding values via PostgREST — no string concatenation, no template SQL.

`computedNormalized` (the SELECT key in the 23505 recovery) is bound via `.eq('normalized_name', computedNormalized)`. PostgREST sends it as a value, not as SQL. Even if the normalizer left dangerous characters in the string (it doesn't — `normalize.ts` replaces non-alphanumerics with spaces, line 23), there would still be no injection vector.

### Secret leakage

**Status: N/A**

No new secret handling. The route reuses `getServerSupabase()` which sources credentials from env. No new env reads or token paths.

### XSS / CSRF

**Status: N/A**

Server-side route only. `formatMilligrams` returns a plain string consumed by React text rendering (auto-escaped). No raw HTML injection sinks introduced; no unsafe-innerHTML props used.

### Race conditions

**Status: PASS (one residual deferred to followups, see below)**

R3's "gate-without-rollback" approach is correctly scoped:
- `linkConfirmed` is a function-scope `let` (line 688). Each request handler has its own boolean. There is no cross-request shared state — Next.js spawns a fresh handler invocation per request. No way for "a parallel request to flip linkConfirmed mid-flight" (the concern raised in the brief).
- The bump UPDATE is gated behind `if (linkConfirmed)` (line 732). If link fails or matches 0 rows, the bump path is skipped entirely — no orphan UPDATE on an unlinked library row.
- The sketch enqueue is gated behind `if (libRow && linkConfirmed)` (line 805) — same protection.

**Known residual:** I1-R2 (lost-update under 3+ concurrent saves) is documented in `state.md.pending_minor_findings` as Improvement-level, deferred per the R2 round-2-cap rule. Self-heals on next re-log. NOT a security issue — it's a UX freshness issue.

**Orphan library row attack vector (raised in brief):**
> "a malicious user could intentionally trigger link failure (e.g., race to delete their own food_entries row mid-handler), they could create unlimited orphan library rows"

Validated as low risk:
- `food_entries.id` is server-generated (`uuid_generate_v4()` default per `architecture.md` §2.3) and not exposed before the INSERT commits. The attacker has no handle to delete.
- Even if they did: each save-to-library INSERT writes one library row. Spamming saves creates rows the attacker owns; RLS prevents cross-user impact. Resource exhaustion is per-user (covered below).
- The orphan row has `log_count: 0` (DB default, never bumped) and is self-healing on re-log.

### Open redirects

**Status: N/A** — server-side mutation route; no redirect handling introduced.

### Resource exhaustion

**Status: PASS**

Considerations:
- **COUNT(*) query:** `.eq('user_id', userId).eq('library_item_id', libraryItemId)` — bounded by entries owned by THIS user linked to ONE library item. Even a malicious flood is bounded by the user's own data (single-user MVP, no abuse vector). Index `food_entries_user_logged_at_idx` does NOT cover `library_item_id`; would benefit from a `(library_item_id)` index, but that's a performance concern not a security one. Not a regression — pre-existing path uses identical pattern.
- **Library INSERT spam:** Per-user RLS confines impact to the attacker's own data. No global resource exhaustion.
- **23505 recovery SELECT:** Single-row `maybeSingle` lookup on indexed `(user_id, normalized_name)` — O(1) per invocation. No DoS surface.

### Error response leakage

**Status: PASS**

Inspected the four error response branches in the new code:
1. Link error → response stays 200 with `{ entry: inserted }` — no error detail in body. Sentry-captured. Pass.
2. 23505 recovery read error → falls through to non-23505 capture path (line 791) — Sentry captured, no body emission. Pass.
3. COUNT error → Sentry captured, no body emission. Pass.
4. Bump UPDATE error → Sentry captured, no body emission. Pass.

The Sentry `extra` payloads include `pg_code` and `error.message` (e.g. line 364–366 for the recheck branch). PostgreSQL error messages can sometimes carry schema metadata, but:
- These are server-side observability captures, NOT client responses.
- The scrubber redacts client-facing headers/cookies.
- Client responses are uniform 200/500 strings (`'db_error'`, `'recheck_failed'`, `'library_item_compensation_failed'`, etc.) — no PG error text leaks to the client.

No data leakage to the client.

---

## Severity summary

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Informational:** 1

---

## Informational findings

### INFO-1 — `extra.userId` in Sentry captures (pre-existing pattern, not regression)

**Lines:** 653, 722, 749, 773, 785, 803, 831 (new R1/R3 captures)
**Severity:** Informational
**Status:** Already deferred / accepted

The new Sentry `extra: { userId }` captures match the existing pattern used throughout `save/route.ts` (lines 363, 402, 466, 506 — pre-existing). The `beforeSend` scrubber's `USER_PII_KEYS` only matches the `user.*` branch, not arbitrary `extra.*` keys. User UUIDs survive into Sentry.

**Why this is Informational, not Medium:**
- Pre-existing project convention; not introduced by this batch.
- Internal Supabase user UUIDs are operator-only telemetry per design-doc §16.
- The richer PII (`items`, `ai_reasoning`, `bio_sex`, weights) is scrubbed.
- Single-user MVP — no operator/end-user delineation in practice.

**Optional enhancement (deferrable):** Add `'userid'`, `'user_id'`, `'libraryitemid'` (lowercased) to `PII_KEYS` if the project later wants UUIDs scrubbed from `extra`. Not required for this batch.

---

## Recommended actions

**None blocking.** Phase 6 closes clean.

- Advance to Phase 7 (E2E + visual — conditional on UI-touching status).
- Bug 1 is server-side (not UI-touching for E2E gate purposes); Bug 2 is UI-touching (formatMilligrams in FoodDetail) — Phase 7 E2E will need to assess.

---

## Concurrent-session check

- `state.md` listed `MacroBars.tsx`, `MicrosOverflowToggle.tsx`, `app/globals.css` as debris.
- Current `git status --short --untracked-files=all`: only `M app/(app)/log/_components/AddFoodTab/LibraryList.tsx` and untracked `.codex/mobile-dashboard-smoke.png`. Neither is part of this batch.
- The three originally-flagged debris files are NO LONGER in the working tree — they appear to have been resolved (committed or re-stashed) since state.md was written.
- Phase 8 commit can use targeted `git add` of the 5 batch files; the unrelated `LibraryList.tsx` modification must be excluded (or committed separately by the user).

---

## Verdict

**APPROVED — advance to Phase 7.**

No Critical/High/Medium findings. One Informational note documents a pre-existing PII convention (not a regression introduced by this batch). The R1 + R3 implementations correctly scope every new SQL query, properly gate the bump path behind `linkConfirmed`, and emit Sentry captures via the existing scrubber-protected pipeline.
