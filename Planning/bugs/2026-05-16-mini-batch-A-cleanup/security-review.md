# Security Review — bugfix-tomi mini-batch A

**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Reviewer:** Phase 6 security sub-agent
**Date:** 2026-05-16
**Base SHA:** `1d0d04f76f769109f482620d67b153a3dee7adc9`
**Scope:** aggregate diff for the 5 items + 4 Codex auto-fixes (C1, C2 / C-R2-1, C3) in mini-batch A.

## Summary

- **Files reviewed:** 9 production + 4 test files (env-loader, refuse-prod-supabase, image-client, sketch-pipeline, useLogFlowStore, LibraryTab, i18n/en, e2e/fixtures/auth, e2e/library/_seed; +tests)
- **Critical: 0**
- **High: 0**
- **Medium: 0**
- **Informational: 3**

Verdict: **completed_clean** — zero Critical or High findings. Three Informational items recorded for follow-up consideration; none block ship.

---

## Critical findings

None.

## High findings

None.

## Medium findings

None.

## Informational findings

### I1 — `callGeminiImage` has no overall request timeout (DoS / slow-loris)

**File:** `lib/ai/image-client.ts:129-168` + `lib/library/sketch-pipeline.ts:269`
**Severity:** Informational
**Category:** DoS / resource exhaustion

The Round 3 streaming reader correctly bounds in-flight memory (`total > MAX_RESPONSE_BYTES → throw`), but the read loop has no wall-clock deadline. `runSketchPipeline` calls `callGeminiImage({ payload })` without an `abortSignal` (line 269 — only `payload` is passed). The `fetch(url, init)` call therefore relies entirely on Node's default socket timeout, and `reader.read()` will wait indefinitely between chunks.

A hostile or malfunctioning upstream that sends headers + 1 byte every 60 seconds could keep the serverless function alive until the platform's hard wall-clock kill (Vercel Hobby = 60s function timeout for the `nodejs` runtime on the `/api/library/sketch/*` routes). Vercel's platform kill terminates the function before it can become a tarpit, so the practical impact is bounded — but the code-level defense relies on platform configuration rather than application logic.

**Why Informational, not Medium:**
- The `runtime = 'nodejs'` Vercel function ceiling provides a hard upper bound (60s on Hobby; 5min on Pro).
- This is a pre-existing pattern across the codebase (`lib/ai/client.ts` text wrapper has the same shape).
- No CVE-class behavior — at worst, one slow request consumes one function slot.
- Out-of-scope for this batch's stated mandate (the batch fixed the heap-amplification surface, not the wall-clock surface).

**Suggested follow-up (NOT blocking ship):** add an `AbortController` with a configurable timeout (e.g. 30s) inside `callGeminiImage`, wired into both `fetch(url, { signal })` and as a `reader.cancel()` trigger. Add a regression test that asserts a stalled `pull()` causes the function to reject within the budget.

### I2 — Round 3 streaming concatenation can double-allocate up to ~14 MB transiently

**File:** `lib/ai/image-client.ts:227-272`
**Severity:** Informational
**Category:** Memory / resource exhaustion

The streaming loop accumulates `chunks: Uint8Array[]` with running `total` byte counter. On clean termination it concatenates into `merged: Uint8Array` via `new Uint8Array(total) + .set(c, offset)`, then `TextDecoder.decode(merged)` and `JSON.parse(text)`. At the moment of concatenation, both `chunks` (sum ≤ MAX_RESPONSE_BYTES = 7 MB) and `merged` (≤ 7 MB) coexist, peaking transient memory at roughly 2× cap = 14 MB before the GC reclaims `chunks`. Then `TextDecoder.decode` + `JSON.parse` allocate additional UTF-8 string + parsed object representations, layering on top.

For the Vercel `nodejs` runtime on Hobby (1024 MB heap), 14 MB is well within budget. The single-chunk fast path (`chunks.length === 1 → merged = chunks[0]`) avoids the double-allocation on the common path.

**Why Informational:** within budget by ~2 orders of magnitude; the defense-in-depth post-decode 5MB check in `sketch-pipeline.ts:289` still bounds the Buffer.from call. Not exploitable.

**Suggested follow-up (NOT blocking):** consider whether the streaming-counter could feed chunks directly to a `TextDecoder({ stream: true })` to avoid the intermediate concatenation entirely. Marginal optimization.

### I3 — `refuseProdSupabase` prod-ref hardcoded (drift risk if a new prod project appears)

**File:** `tests/_utils/refuse-prod-supabase.ts:34`
**Severity:** Informational
**Category:** Defense in depth (operational)

The guard hardcodes `PROD_SUPABASE_REF = 'dryysypycsexvlbabtwq'` (kalori-prod). If the project ever migrates to a new prod Supabase project (e.g. region change, account migration), this guard would silently no-op against the new prod project until the constant is updated — exactly the scenario it was designed to prevent.

The guard is a blocklist not an allowlist by deliberate design (per docstring comment), so a future staging or contributor project is correctly not pre-judged. The drift risk is real but bounded: any new prod project would surface in CLAUDE.md and `Planning/setup-state.md` immediately, and a routine review of those docs catches the drift.

**Why Informational:** the drift surface is operational, not exploitable; the guard's failure mode is "fails open against a future prod project" which is the same as the pre-fix baseline (no guard at all). The fix is a strict improvement over baseline; the drift caveat is documented in the file's own docstring.

**Suggested follow-up (NOT blocking):** add a CI check that compares the constant to `setup-state.md`'s recorded prod ref. Or, drive the prod ref from an env var (`KALORI_PROD_REF`) and fail the build if it's missing. Either is post-mini-batch territory.

---

## Spot-checks performed

| Check | Target | Result |
|---|---|---|
| Input validation — env-loader malicious input | Quote-aware tokenizer (`tests/_utils/env-loader.ts:116-170`) handles giant content (O(N) walk, no recursion / no stack risk), embedded null bytes (preserved verbatim inside quoted spans — caller's responsibility), unterminated quotes (file ends with partial span surfaced as last "line" — `outer-quote strip` fails benignly, value retains leading `"`). No buffer overflow surface in JavaScript. **PASS** |
| Input validation — Zustand rehydrate coercion | `isLibrarySort` guard at `useLogFlowStore.ts:140-142` checks `typeof v === 'string'` + membership in `LIBRARY_SORT_VALUES`. A crafted localStorage entry that does not match the allowlist falls through to the `'name-asc'` default — no script execution risk (rendered as plain React text node, never as raw HTML), no behavior change. Persist middleware's `JSON.parse` coerces. **PASS** |
| Authn/authz — PROD-ref guard fail-closed | `refuseProdSupabase('')` returns silently (line 40); `refuseProdSupabase(undefined-as-string)` — guard is called AFTER the missing-env throw in both `auth.ts:117-121` and `_seed.ts:61-65`, so undefined never reaches it. Empty-string short-circuit is correct for the documented contract (caller still feeds `''` to `createClient` which will throw its own URL parse error). **PASS** |
| Authn/authz — new "NAME A-Z" sort pill | Sort is purely client-side over already-authorized `libraryItems` hydrated server-side via `/api/library/list` (existing route, no change). No access-control bypass surface. **PASS** |
| PII handling — Codex auto-fix logs | `GeminiOversizeError` messages echo only `contentLength`, `MAX_RESPONSE_BYTES` (constants), and the cap value — no user input, no API key, no Supabase URL. `recordFailure` slices to 500 chars and writes to `sketch_last_error` column (RLS-scoped to user). **PASS** |
| PII handling — env-loader error paths | `loadEnvFile` does NOT throw on malformed input (it silently skips lines without `=`, blank lines, comments). No env values appear in any thrown error. The tokenizer's only "error" path is the unclosed-quote case which returns the partial span as a line — no exception. **PASS** |
| Injection — i18n value escape (LibraryTab pill) | `{label}` rendered via React text node at `LibraryTab.tsx:394` — React escapes HTML by default. The i18n value `librarySortNameAsc: 'NAME A-Z'` is a string constant in `lib/i18n/en.ts:417`, not sourced from user input. Grep over `LibraryTab.tsx` for `innerHTML` returned 0 matches (no raw-HTML render paths). **PASS** |
| Secret leakage — PROD-ref error message | `refuse-prod-supabase.ts:48-56` error message embeds only the project refs (`dryysypycsexvlbabtwq`, `aaiohznsqlqchsoxaqkz`) and a remediation hint — no API key, no service role, no password. Project refs are not secrets (they appear in the public Supabase URL). **PASS** |
| Secret leakage — fixture prod-gate fallback | `image-client.ts:132-137` — when `NODE_ENV === 'production'` AND fixture env is set, the gate does NOT log the fixture value; it silently falls through to `getApiKey() + fetch()`. The fixture env var name (`KALORI_SKETCH_FIXTURE_BASE64`) is documented in the docstring but never echoed at runtime. **PASS** |
| Secret leakage — env-loader malformed-input error | No throw path. Tokenizer cannot leak values. **PASS** |
| XSS — LibraryTab pill | React text rendering at `LibraryTab.tsx:380-397`. No raw-HTML render paths. **PASS** |
| CSRF — sort pill action | Sort is pure client-side state mutation via `setSort(key)`. No server round-trip, no token surface. **PASS** |
| Race conditions — streaming counter vs cancel | `await reader.cancel()` is awaited in the catch path (line 239); the `try/finally` releases the lock. If a chunk arrives in-flight between `total > cap` check and `cancel()`, it's already in `value` and is GC'd when the throw unwinds. No exploit vector (in-flight chunk size is bounded by upstream's chunk size policy, not by attacker control). The test at `image-client.test.ts:370` asserts `pullCallsAfterCap <= 1` — single in-flight chunk tolerance is the documented contract. **PASS** |
| Race conditions — Zustand rehydrate coerce/write | `onRehydrateStorage` runs synchronously after `JSON.parse` of the persisted blob (Zustand persist middleware contract). Coercion is in-place on `state` object before `state.restoredAt` TTL check overwrites; no other thread sees the intermediate state. **PASS** |
| DoS / resource exhaustion — env-loader pathological input | Tokenizer is O(N) single-pass with `chunks: string` accumulator. Worst-case adversarial input is a 1MB single-line quoted value — peak memory = 2× input size (line accumulator + final array entry). No recursion → no stack risk. Comparable to the prior `split(/\r?\n/)` implementation's memory profile. **PASS** |
| DoS / resource exhaustion — streaming counter | Bounded by `MAX_RESPONSE_BYTES = 7 MB` plus the in-flight chunk size from one outstanding `pull()`. No timeout — see I1 above. **INFORMATIONAL (I1)** |
| Defense in depth — items 2 + 3 actually harden | Item 2 (PNG decode cap): primary cap upstream at 7 MB + post-decode 5 MB defense-in-depth in `sketch-pipeline.ts:289`. Round 3 hardening proves the cap is enforceable under gzip. Real defense. Item 3 (fixture prod-gate): positive-allowlist pattern `NODE_ENV !== 'production'`, mirrors `lib/library/sketch-enqueue.ts:55-58` (existing pattern). Real defense. **PASS** |
| Supply chain — new dependencies | `dotenv` was NOT added (verified via grep on `package.json` — quote-aware tokenizer is custom). No new external API calls. No new transitive deps. **PASS** |

---

## Areas NOT covered

1. **Existing pre-batch surfaces not touched by this batch.** The PROD-ref guard's interaction with future Supabase project migrations, the missing wall-clock timeout in `lib/ai/client.ts` text wrapper, and the broader `authPost` 409 swallowing (I-R2-1 — already in `pending_minor_findings`) are pre-existing or sibling concerns and out of mini-batch A scope.

2. **Browser-side cookie tampering against the auth fixture.** The `tests/e2e/fixtures/auth.ts` cookie writer produces real Supabase-issued sessions; a malicious test environment could write arbitrary cookies, but that's the test harness's threat model, not production code.

3. **Multi-byte UTF-8 boundary in TextDecoder.** `TextDecoder('utf-8').decode(merged)` with `chunks.length > 1` could in principle land a multi-byte sequence boundary across chunks. The TextDecoder API handles this correctly when given the full buffer in one call (which the implementation does); only `stream: true` mode has the boundary concern, and that's not used. Verified by reading the code — no defect, no further test needed.

4. **Sentry payload audit.** `Sentry.captureException` at `sketch-pipeline.ts:343` passes the err + `{ libraryItemId, userId, attempt }`. The `userId` field is a UUID, not a username/email — acceptable PII envelope for Sentry tags per project's existing privacy posture. Not in batch scope, no change to the call shape.

5. **Test fixture race against admin connection pool.** The `authedPageWithDeletedProfile` fixture's dual-connection probe + 2s settle (`auth.ts:464-549`) is an existing fixture; this batch did not modify its body. Not reviewed.

---

## State update payload

```yaml
security_review: completed_clean
phase: 6
phase_status: complete
pending_minor_findings:
  # (existing I-R2-1 from Codex Round 2 already present, preserved)
  - id: I-SR1
    severity: Informational
    file: lib/ai/image-client.ts:129-168
    summary: "callGeminiImage has no overall request timeout — Vercel platform kill is the only hard bound (slow-loris DoS)"
    decision: deferred — pre-existing pattern; bounded by Vercel function timeout
    recommendation: "Add AbortController(timeout=30s) wired into fetch + reader.cancel; add stalled-pull regression test"
  - id: I-SR2
    severity: Informational
    file: lib/ai/image-client.ts:227-272
    summary: "Streaming concatenation transiently double-allocates up to ~14 MB before GC"
    decision: deferred — within Vercel 1024 MB heap by 2 orders of magnitude
    recommendation: "Consider TextDecoder({ stream: true }) over the chunk stream to avoid intermediate concatenation"
  - id: I-SR3
    severity: Informational
    file: tests/_utils/refuse-prod-supabase.ts:34
    summary: "PROD_SUPABASE_REF hardcoded — guard silently no-ops if prod project migrates"
    decision: deferred — drift bounded by CLAUDE.md / setup-state.md review cadence
    recommendation: "Drive constant from env var or add CI parity check against setup-state.md"
last_completed_action: "Phase 6 security review complete (mini-batch A); 0 Critical, 0 High, 0 Medium, 3 Informational"
```
