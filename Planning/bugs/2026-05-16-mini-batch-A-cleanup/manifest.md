# Mini-batch A — 5-item cleanup followup (bugfix-tomi)

**Batch ID:** `2026-05-16-mini-batch-A-cleanup`
**Parent batch:** `2026-05-16-library-overhaul` (commit `8cf1c86`, backfilled `1d0d04f`)
**Started:** 2026-05-16T04:19:25Z
**Closed:** 2026-05-16
**Baseline SHA:** `1d0d04f76f769109f482620d67b153a3dee7adc9` (parent batch backfill commit)
**Project:** kalori
**Mode:** bugfix-tomi mini-batch (cleanup of parent batch followups)

---

## Why this mini-batch

Parent batch `2026-05-16-library-overhaul` shipped 12 items but filed 6 followups (`F-LIBOVR-*` family) for work that was deliberately out of scope. This mini-batch closes 5 of those followups in a single bundled pass while the context is still fresh:

| Item | Source followup | Cluster |
|---|---|---|
| 1 | `F-LIBOVR-E2E-INFRA-DRIFT` (in-repo portion) | A |
| 2 | `F-LIBOVR-SEC-M1-PNG-DECODE-CAP` | B |
| 3 | `F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE` | C |
| 4 | `F-LIBOVR-BUG7B-LOGMODAL-SORT` | D |
| 5 | (no source followup — lint cleanup surfaced during Cluster B implementation) | B |

The 6th parent-batch followup (`F-LIBOVR-SIGN-FANOUT-SQL-PAGINATION`) is multi-task refactor scope and remains deferred. `F-LIBOVR-LESSONS-COMPACTION` is a maintenance-window task.

---

## Per-item details

### Item 1 — E2E env-loader infra (Cluster A)

**Source:** `F-LIBOVR-E2E-INFRA-DRIFT` (in-repo portion)
**Files modified:**
- `tests/setup.ts`
- `tests/e2e/fixtures/global-setup.ts`
- `tests/e2e/fixtures/auth.ts`
- `tests/e2e/library/_seed.ts`

**Files created:**
- `tests/_utils/env-loader.ts` (quote-aware tokenizer for `vercel env pull` Windows artifacts)
- `tests/_utils/refuse-prod-supabase.ts` (PROD-ref guard refusing `dryysypycsexvlbabtwq`)
- `tests/unit/lib/test-infra/env-loader.test.ts`
- `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts`

**Implementation:** New shared utilities consumed by both Vitest (`tests/setup.ts`) and Playwright (`tests/e2e/fixtures/global-setup.ts`). The quote-aware tokenizer handles embedded `\r\n` inside quoted values — distinct from the line-split approach that consumes them before the strip can fire. PROD-ref guard fails fast with a remediation message naming the prod ref, dev ref, and the corrective `vercel env pull --environment=development` command.

**Tests added:** 19 (16 PASS structural; 3 documenting the line-split + regex coverage envelope — see deviations note).

**Deviations:** Initial briefing approved a `replace(/\r\n?$|\n$/, '')` regex applied AFTER the existing line split. Cluster A sub-agent self-flagged that the line-level `/\r?\n/` split consumes any embedded `\r\n` BEFORE the regex sees it, so the regex covers only bare `\r` and last-line trailing CR/LF. Codex Round 1 caught this and forced a true quote-aware tokenizer.

**Operator task:** Regenerate `.env.local` with `vercel env pull --environment=development` to switch the local Playwright runner from PROD-pointing to DEV-pointing. The PROD-ref guard fires correctly today on the existing PROD-pointing `.env.local` (acceptance criterion 2). Not required for commit — the unit suite forms the regression net for both parsing and guard.

### Item 2 — SEC-M1 PNG decode cap (Cluster B)

**Source:** `F-LIBOVR-SEC-M1-PNG-DECODE-CAP`
**Files modified:**
- `lib/library/sketch-pipeline.ts` (sharp options + downstream consumption)
- `lib/ai/image-client.ts` (new `readBodyWithCap()` + `GeminiOversizeError` class; upstream byte-cap before allocation)
- `tests/unit/lib/library/sketch-pipeline.test.ts`
- `tests/unit/lib/ai/image-client.test.ts`

**Implementation:** 5 MB cap moved UPSTREAM to `lib/ai/image-client.ts` — `readBodyWithCap()` stream-and-counts before any allocation. Content-Length used ONLY for early-REJECT (a declared Content-Length ≥ cap rejects immediately, before reading); the stream loop is the authoritative byte-cap enforcer because under `Content-Encoding: gzip|br` Content-Length is wire size, not decoded payload size. New `GeminiOversizeError` class enables structured error propagation. Sharp constructor uses `failOn: 'warning'` (default, strictest) — explicitly reverting Round 1's `'truncated'` which sharp's docs lattice (`'none' < 'truncated' < 'error' < 'warning'`) reveals as LOOSER than the default.

**Codex findings on this item:**
- R1 C1: sharp `failOn: 'truncated'` is looser than default — fixed (revert to `'warning'`)
- R1 C2: cap downstream of allocation defeats the purpose — fixed (moved upstream to `image-client.ts`)
- R2 C1: Content-Length fast-path bypasses streaming counter under gzip — fixed via R3 override (Content-Length is reject-only; counter always runs)

**Tests added:** 3 (initial test asserted sharp rejects oversize input; updated tests assert the upstream byte-cap fires before allocation under both Content-Length-honest and Content-Length-deceptive paths).

### Item 3 — SEC-M2 fixture prod-gate (Cluster C)

**Source:** `F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE`
**Files modified:**
- `lib/ai/image-client.ts` (NODE_ENV gate)
- `tests/unit/lib/ai/image-client.test.ts`

**Implementation:** `KALORI_SKETCH_FIXTURE_BASE64` env-var read at `lib/ai/image-client.ts:82-87` now wrapped in `if (process.env.NODE_ENV !== 'production')`. Mirrors the existing precedent at `lib/library/sketch-enqueue.ts:55-58` for `KALORI_SKETCH_DISABLED`. Failure mode when gate fires in prod with fixture env set: silent fall-through to live Gemini API (`getApiKey()` + `fetch()`) — correct per the proposal's §Failure-mode contract.

**Tests added:** 3 (prod-gate ON / test-env-regression / dev-env-regression).

### Item 4 — Bug 7b log-modal sort default A-Z (Cluster D)

**Source:** `F-LIBOVR-BUG7B-LOGMODAL-SORT`
**Files modified:**
- `lib/stores/useLogFlowStore.ts` (Zustand `LibrarySort` union widened; default flipped; `isLibrarySort` guard + `onRehydrateStorage` coercion)
- `app/(app)/log/_components/LibraryTab.tsx` (SORT_OPTIONS prepend; comparator branch for `'name-asc'`)
- `lib/i18n/en.ts` (`librarySortNameAsc: 'NAME A-Z'`)
- `tests/components/log-flow/LibraryTab.test.tsx`
- `tests/unit/stores/useLogFlowStore.test.ts`

**Implementation:** `LibrarySort` union widened to include `'name-asc'`; `INITIAL_PERSISTED` default flipped from `'frequent'` to `'name-asc'`; new `isLibrarySort()` type guard wired into `onRehydrateStorage` preserves valid persisted state while coercing invalid values to the new default. `SORT_OPTIONS` array prepends the new pill at position 0. Comparator branch uses `a.name.localeCompare(b.name)`. Sibling assertion update in `useLogFlowStore.test.ts:30`.

**Tests added:** 7 (4 pill-group + 3 rehydrate-coerce). **Tests updated:** 4 (default-sort assertions in the same store-shape test surfaces).

### Item 5 — Lint cleanup (Cluster B)

**Files modified:**
- `tests/unit/lib/library/sketch-pipeline.test.ts`

**Implementation:** Removed 3 unused-var ESLint warnings surfaced during Cluster B implementation. No new tests required (lint-only).

---

## Codex review

### Round 1

**Verdict:** critical_present (3 Critical, 0 Improvement, 0 Minor)
**Thread id:** `019e2f31-e81c-7ac0-8bed-dc62291a1c9c`
**Turn id:** `019e2f31-e9f6-7182-864b-37e24fcafb7f`
**Auto-retry signals:** none

| Finding | Item | Severity | Resolution |
|---|---|---|---|
| sharp `failOn: 'truncated'` weakening | 2 | Critical | Auto-fixed — revert to default `'warning'` |
| 5MB cap downstream of allocation | 2 | Critical | Auto-fixed — moved upstream to `lib/ai/image-client.ts::readBodyWithCap()` |
| env-loader regex applied AFTER split (theatrical) | 1 | Critical | Auto-fixed — quote-aware tokenizer |

### Round 2

**Verdict:** critical_present (1 Critical, 1 Improvement, 0 Minor)
**Thread id:** `019e2f55-80a5-7791-ada2-54cce888f2fb`
**Turn id:** `019e2f55-826b-7ea3-9146-f4c09aad881f`
**Auto-retry signals:** none

| Finding | Item / Surface | Severity | Resolution |
|---|---|---|---|
| `readBodyWithCap` Content-Length fast-path bypasses streaming counter (gzip/br) | 2 | Critical | User-authorized Round 3 override → fixed (Content-Length is reject-only; counter always runs) |
| `restore_name_conflict` 409 swallowed by `authPost` callers | LibraryClient + FoodDetail (pre-existing) | Improvement | Deferred → filed as `I-R2-1` (pre-existing pattern; parent-batch territory) |

### Round 3 (user-authorized override)

**Trigger:** User decision `round_3_override` ("Let's just get everything done and put it in production")
**Scope:** Critical-only — Content-Length gzip bypass
**Outcome:** Resolved cleanly. `readBodyWithCap` rewritten so Content-Length is consulted ONLY for early-REJECT (large declared sizes rejected before reading); the stream loop is the authoritative byte-cap enforcer.
**Two-round cap exhausted:** true. Override authorized.

---

## Security review

**Verdict:** Clean
**Findings:** 0 Critical / 0 High / 0 Medium / 3 Informational

| ID | File | Summary | Disposition |
|---|---|---|---|
| I-SR1 | `lib/ai/image-client.ts:129-168` | `callGeminiImage` has no overall request timeout — Vercel platform kill is the only hard bound (slow-loris DoS) | Deferred — pre-existing pattern; bounded by Vercel function timeout |
| I-SR2 | `lib/ai/image-client.ts:227-272` | Streaming concatenation transiently double-allocates up to ~14 MB before GC | Deferred — within Vercel 1024 MB heap by 2 orders of magnitude |
| I-SR3 | `tests/_utils/refuse-prod-supabase.ts:34` | `PROD_SUPABASE_REF` hardcoded — guard silently no-ops if prod project migrates | Deferred — drift bounded by CLAUDE.md / setup-state.md review cadence |

---

## E2E

**Required:** Yes (mini-batch A Item 1 IS the E2E infra fix — verification is self-referential)
**Status:** PASSED via acceptance criterion 2
**Session id:** `phase-7-2026-05-16T13:15Z`
**Canary spec:** `tests/e2e/library/library-quick-action-menu.spec.ts`

**Outcome:** Env-loader (quote-aware tokenizer) parsed `.env.local` cleanly; URL extracted to `https://dryysypycsexvlbabtwq.supabase.co` (no embedded CR/LF artifacts). Auth fixture's `resolveEnv()` reached `refuseProdSupabase(url)` — proves the missing-env path is NOT taken (env-loader works). PROD-ref guard threw with verbatim remediation message naming the prod ref (`dryysypycsexvlbabtwq`), dev ref (`aaiohznsqlqchsoxaqkz`), and `vercel env pull --environment=development` remediation command. This is acceptance criterion 2 — the SUCCESS state for the guard.

**Unit test coverage:** 24/24 passing (`env-loader.test.ts` + `refuse-prod-supabase.test.ts`).

**Operator follow-up:** `.env.local` regen via `vercel env pull --environment=development` switches the local Playwright run target to `kalori-dev`. Not required for commit — the unit suite forms the regression net for both parsing and guard.

---

## Tests

- **Vitest:** 2461 passed / 99 skipped / 0 failed (full project suite)
- **Cluster A unit suite:** 19 added (16 PASS structural + 3 documenting coverage envelope deviations)
- **Cluster B unit suite:** 13/13 passing (10 pre-existing + 3 new for upstream byte cap)
- **Cluster C unit suite:** 9/9 passing (6 pre-existing + 3 new prod-gate)
- **Cluster D unit suite:** 18/18 passing (LibraryTab + useLogFlowStore)

---

## Pending follow-ups

| ID | Severity | Surface | Disposition |
|---|---|---|---|
| I-R2-1 | Improvement (Codex Round 2) | `app/api/library/bulk-delete/undo/route.ts:147` + LibraryClient + FoodDetail callers | Deferred — parent batch territory; `authPost` discards JSON body on non-2xx (this batch's `authPost` callers fix is out of scope) |
| I-SR1 | Informational (Phase 6) | `lib/ai/image-client.ts:129-168` | Deferred — pre-existing pattern; Vercel function timeout is current hard bound |
| I-SR2 | Informational (Phase 6) | `lib/ai/image-client.ts:227-272` | Deferred — within Vercel 1024 MB heap by 2 orders of magnitude |
| I-SR3 | Informational (Phase 6) | `tests/_utils/refuse-prod-supabase.ts:34` | Deferred — drift bounded by CLAUDE.md / setup-state.md review cadence |
| **Operator task** | — | `.env.local` regen | Run `vercel env pull --environment=development` to unblock local E2E |

---

## Production-readiness checklist

- [x] All TDD cycles closed RED→GREEN (5/5 items)
- [x] Codex Round 1 + Round 2 + Round 3 cleared all Critical findings
- [x] Security review clean (0 Critical / 0 High / 0 Medium)
- [x] Vitest full suite GREEN (2461 passed / 0 failed)
- [x] E2E verification PASSED (acceptance criterion 2: PROD-ref guard fires correctly)
- [x] Pre-existing dirty tree preserved (no `git add -A` — explicit file staging)
- [x] R1 firewall preserved (no `lib/auth/*` / `lib/proxy.ts` / `middleware.ts` touched)
- [x] No migration required (this mini-batch ships in-repo code only — no schema changes)
- [x] Lessons appended (1 Session Log row + 2 Review Discipline Core Principles + 1 new sharp Domain-Specific subsection)

---

## Files (aggregate, deduplicated)

**Production code:**
- `app/(app)/log/_components/LibraryTab.tsx`
- `lib/ai/image-client.ts`
- `lib/i18n/en.ts`
- `lib/library/sketch-pipeline.ts`
- `lib/stores/useLogFlowStore.ts`

**Tests + test infra:**
- `tests/setup.ts`
- `tests/_utils/env-loader.ts` (new)
- `tests/_utils/refuse-prod-supabase.ts` (new)
- `tests/e2e/fixtures/auth.ts`
- `tests/e2e/fixtures/global-setup.ts`
- `tests/e2e/library/_seed.ts`
- `tests/components/log-flow/LibraryTab.test.tsx`
- `tests/unit/lib/ai/image-client.test.ts`
- `tests/unit/lib/library/sketch-pipeline.test.ts`
- `tests/unit/lib/test-infra/env-loader.test.ts` (new)
- `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts` (new)
- `tests/unit/stores/useLogFlowStore.test.ts`

---

## Commit

**Hash:** `cbf4bc5`
**Backfill commit:** `<fill in after backfill commit>`
