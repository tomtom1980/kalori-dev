# Cluster B — SEC-M1 PNG cap + Item 5 lint cleanup — Implementation Output

**Sub-agent:** Cluster B (Sketch Security + Lint)
**Items implemented:** Item 2 (F-LIBOVR-SEC-M1-PNG-DECODE-CAP), Item 5 (Unused-var ESLint cleanup)
**Status:** Both items COMPLETE. TDD discipline followed (RED → GREEN → verify).
**Timestamp:** 2026-05-16T11:36Z

---

## Item 2 — SEC-M1 PNG decode cap

### Files modified

1. **`lib/library/sketch-pipeline.ts`** (production)
   - Added `MAX_INPUT_BYTES = 5 * 1024 * 1024` const after `TARGET_WEBP_MAX_BYTES`.
   - Added `estimateBase64DecodedSize(s: string): number` helper (mirrors `app/api/storage/thumbnail/route.ts:58-61` pattern — uses `replace(/=+$/u, '')` for padding strip).
   - Pre-decode guard: throws `gemini_oversize_response: <bytes> bytes exceeds <limit> limit` BEFORE `Buffer.from(image.base64, 'base64')`.
   - Post-decode defense-in-depth: re-checks `pngBuf.byteLength` after `Buffer.from`.
   - All 3 `sharp(pngBuf)` constructors now pass `{ failOn: 'truncated' }`.
   - Errors propagate through existing `try/catch → recordFailure()` path. The CAS claim already incremented `sketch_attempt_count` BEFORE Gemini, so no double-bump.

2. **`tests/unit/lib/library/sketch-pipeline.test.ts`** (3 new tests appended)
   - `SEC-M1: oversized PNG response (>5MB) → failed=gemini_oversize_response, no sharp call`
     - Stubs `globalThis.fetch` with a `Response` containing a 6MB base64-encoded payload. Pre-decode estimate (~6MB) exceeds the 5MB cap → error fired before `Buffer.from`/sharp/upload.
   - `SEC-M1: truncated PNG header → sharp failOn:truncated triggers failure, recorded`
     - Uses fixture-mode (`KALORI_SKETCH_FIXTURE_BASE64`) with valid 8-byte PNG signature only. sharp rejects (IHDR/IDAT chunks missing).
   - `SEC-M1: normal-sized PNG response (1x1 PNG) → still succeeds (regression guard)`
     - Re-runs the happy-path baseline with `FIXTURE_PNG_B64` (1×1 transparent PNG, ~70 bytes) to confirm the new size guard does NOT regress legitimate Gemini responses.

### TDD evidence

- **RED state:** Test 1 (oversized) failed with `'Input buffer contains unsupported image format'` (sharp's decoder running on the zero-byte buffer). This is the RIGHT failure mode — sharp was being called instead of the pre-decode cap rejecting first. Confirms the production code lacked the guard.
- **Test 2 (truncated PNG):** Already GREEN before the production change — sharp 0.34.x's implicit `'error'` default catches missing IHDR. Adding `failOn: 'truncated'` is defense-in-depth as proposed (Q3 in proposal), explicit-intent guard against future sharp default changes.
- **Test 3 (regression):** GREEN before and after — the new pre-decode guard does not affect the ~70-byte happy-path baseline. Sub-200KB Nano Banana responses far below the 5MB cap.
- **GREEN state (post-implementation):** 13/13 tests pass in `tests/unit/lib/library/sketch-pipeline.test.ts`.

### Verification

- `pnpm exec eslint lib/library/sketch-pipeline.ts tests/unit/lib/library/sketch-pipeline.test.ts` — 0 errors, 0 warnings (lint cleanup verified — the 3 unused-var warnings are GONE).
- `npx tsc --noEmit` — Cluster B files type-check clean. (Pre-existing TS errors on `tests/unit/lib/test-infra/env-loader.test.ts` and `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts` are from Cluster A's parallel work — NOT a Cluster B regression.)
- `pnpm exec vitest run tests/unit/lib/library/sketch-pipeline.test.ts` — 13/13 GREEN, 718ms.

---

## Item 5 — Unused-var ESLint cleanup

### Files modified

1. **`tests/unit/lib/library/sketch-pipeline.test.ts`** (3 surgical edits)
   - Line 91 (original): `from: (_table: string) => ({` → `from: () => ({`. Matches the existing zero-param form in other supabase mocks in the same file (lines 564, 639 in original file).
   - Line 117 (original): Deleted `const isRecover = !isFinal && !isClaim;` (dead variable; subsequent `tag` ternary derives from `isFinal`/`isClaim` directly, never reads `isRecover`).
   - Line 173 (original): `from: (_bucket: string) => ({` → `from: () => ({`. Matches the existing zero-param form in storage mocks (original lines 565, 688).

### Verification

- Lint clean (0 warnings) — confirmed by `pnpm exec eslint tests/unit/lib/library/sketch-pipeline.test.ts` (zero output).
- Test count unchanged: 10 pre-existing tests still pass (plus the 3 new SEC-M1 tests = 13 total).
- TypeScript: no signature mismatch because the supabase mock is cast `as unknown as ...` — JS ignores extra call-site args at runtime.

---

## Cross-cluster status

- Tests passing for Cluster B: **13/13** in `tests/unit/lib/library/sketch-pipeline.test.ts`.
- Full regression sweep: **2432 GREEN / 11 FAIL / 99 skipped**. The 11 failures are in `tests/unit/stores/useLogFlowStore.test.ts` (Item 4 / Cluster C territory) and `tests/unit/lib/test-infra/env-loader.test.ts` (Item 1 / Cluster A territory) — **not caused by Cluster B**.

### Deviations from proposal

- **None material.** The helper `estimateBase64DecodedSize` uses `replace(/=+$/u, '')` (exact mirror of `route.ts:58-61`) instead of the more verbose `if/else if` chain shown in the proposal — functionally equivalent and one fewer branch.
- Production LOC came in at ~47 lines (vs ~25-30 proposed estimate); the overshoot is all JSDoc/inline comments documenting WHY each guard exists, not additional logic. Code-only delta is well within the 25-30 line budget.

### Halts / stop-the-world triggers

- **None triggered.** `recordFailure` signature unchanged (single-arg `errorMessage`). Sharp version 0.34.5 supports `failOn: 'truncated'` as expected. Pre-decode estimate does NOT false-positive on legitimate Nano Banana responses (verified by Test 3 regression guard).

### Acceptance criteria checklist (from proposal §Acceptance criteria)

- [x] `MAX_INPUT_BYTES = 5 * 1024 * 1024` constant defined.
- [x] `estimateBase64DecodedSize()` helper added.
- [x] Pre-`Buffer.from` guard rejects oversized base64 with error containing `gemini_oversize_response`.
- [x] Post-`Buffer.from` defense-in-depth check on `pngBuf.byteLength`.
- [x] All three `sharp(pngBuf)` constructors pass `{ failOn: 'truncated' }`.
- [x] Existing `try/catch` propagates error to `recordFailure()` writing `sketch_last_error`.
- [x] CAS claim already incremented `sketch_attempt_count` — no double-bump.
- [x] Test 1 — oversized response → status='failed', error contains 'gemini_oversize_response', sketch_attempt_count incremented.
- [x] Test 2 — truncated PNG → status='failed' (sharp throws).
- [x] Test 3 — normal-sized PNG → status='generated' (regression guard).
- [x] All existing pipeline tests still PASS (10 existing + 3 new = 13).
- [x] `pnpm exec eslint` clean on both files.
- [x] Item 5 lint warnings cleared (3 warnings → 0).

---

## Hand-off to main agent

- Cluster B implementation complete. Both items ready for Phase 4-5 Codex adversarial review.
- No blockers, no halts, no protocol violations.
- Output ready for batch commit in Phase 8.
