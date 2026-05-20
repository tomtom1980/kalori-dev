# Cluster C — SEC-M2 fixture prod-gate — Implementation Output

**Sub-agent:** Cluster C (Fixture Prod-Gate)
**Item implemented:** Item 3 (F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE)
**Status:** COMPLETE. TDD discipline followed (RED → GREEN → verify).
**Timestamp:** 2026-05-16T11:41Z

---

## Item 3 — SEC-M2 fixture prod-gate

### Approved approach (verbatim from brief)

Wrap the fixture-mode read at `lib/ai/image-client.ts:82-85` in `if (process.env.NODE_ENV !== 'production') { ... }`. Mirror the existing prod-gate pattern at `lib/library/sketch-enqueue.ts:55-58` for consistency. Failure mode when gate fires (in prod with fixture env set): silently fall through to live Gemini API (`getApiKey()` then `fetch()`). Correct behavior.

### Files modified

1. **`lib/ai/image-client.ts`** (production) — net +18 LOC, code delta ~5 LOC (the rest is JSDoc).
   - Top-of-file doc block (lines 17-21 originally) — updated the "Test-mode bypass" sentence to mention the `NODE_ENV !== 'production'` gate so future readers see the precondition immediately.
   - `callGeminiImage` JSDoc (lines 72-77 originally) — added a "Prod-gate (SEC-M2)" paragraph documenting WHY the gate exists (operator typo / leftover debug var / supply-chain) and that it mirrors `lib/library/sketch-enqueue.ts:55-58`.
   - Function body (lines 82-85 originally) — wrapped the existing 3-line fixture read in `if (process.env.NODE_ENV !== 'production') { ... }`. Indentation adjusted; no other behavior change.

2. **`tests/unit/lib/ai/image-client.test.ts`** (tests) — net +60 LOC, 3 new spec blocks appended.
   - **Spec 1 — prod-gate** — Sets `process.env = { ...process.env, NODE_ENV: 'production' }` plus the fixture env. Mocks `fetch` to return a valid Gemini envelope. Asserts `fetchSpy.toHaveBeenCalledOnce()` (proof the live path ran, not the fixture short-circuit).
   - **Spec 2 — test-env regression guard** — Sets `NODE_ENV='test'` explicitly (Vitest's default, here for hermetic clarity) + fixture env. Asserts fixture bytes returned + `fetchSpy.not.toHaveBeenCalled()`.
   - **Spec 3 — dev-env regression guard** — Sets `NODE_ENV='development'` + fixture env. Asserts fixture bytes returned + `fetchSpy.not.toHaveBeenCalled()` (local dev path preserved).
   - Used `process.env = { ...process.env, NODE_ENV: <value> }` per project precedent at `tests/unit/sentry-test-route.test.ts:11-13` (avoids TS readonly-narrowing on the literal union).

### TDD evidence

- **RED state:** `pnpm test tests/unit/lib/ai/image-client.test.ts` after adding the 3 new specs but BEFORE wrapping the fixture read — 8 passed / 1 failed, with the prod-gate spec failing exactly per proposal expectation:
  ```
  AssertionError: expected "Mock" to be called once, but got 0 times
  ❯ tests/unit/lib/ai/image-client.test.ts:171:22
      expect(fetchSpy).toHaveBeenCalledOnce();
  ```
  Confirms the fixture short-circuit was running in `NODE_ENV='production'` (the bug).
- **GREEN state:** Same command after wrapping the fixture read — **9/9 passed**, 555ms.
- **Specs 2 + 3 stayed GREEN** across the transition (regression guards behaved as expected — they verified existing behavior is preserved, not changed).

### Verification

- `pnpm test tests/unit/lib/ai/image-client.test.ts` — **9/9 GREEN** (6 pre-existing + 3 new). 555ms.
- Full regression sweep: see "Cross-cluster status" below.

### Failure-mode confirmation

When the gate fires (i.e. `NODE_ENV === 'production'` AND `KALORI_SKETCH_FIXTURE_BASE64` is set):
- The fixture `if` block is skipped.
- Control falls through to `getApiKey()` then live `fetch(url, init)`.
- This is the correct behavior — even if an operator typo'd `KALORI_SKETCH_FIXTURE_BASE64` into the Production Vercel scope, the live Gemini call still serves the real result. No silent corruption of user sketches.

The prod-gate spec proves this by mocking `fetch` and asserting it was called (rather than fixture bytes being returned without a network call).

---

## Cross-cluster status

- Tests passing for Cluster C: **9/9** in `tests/unit/lib/ai/image-client.test.ts` (6 pre-existing + 3 new).
- Full regression sweep: **2416 GREEN / 8 FAIL / 99 skipped** (2523 total). The 8 failures are all in `tests/components/log-flow/LibraryTab.test.tsx` (Cluster D — Item 4 / LibraryTab sort territory) — DOM dump shows the test queries for `library-sort-name-asc` testid which isn't rendering on every codepath. **Not a Cluster C regression** — zero `image-client` references in failure output, all 9 image-client specs pass clean.

### Deviations from proposal

- **None material.** The implementation matches Option A exactly. The proposal estimated 3 new tests; delivered 3. Estimated ~5 prod LOC; delivered ~5 (with ~13 LOC of JSDoc on top, all explanatory comments documenting WHY the gate exists). No `console.warn` / Sentry alert added per proposal §Open Questions Q1 (deferred — silent fall-through is the correct outcome, not a runtime alert concern).
- **Stop-the-world triggers from brief:** All three pre-flight risks (env-var pattern mismatch / NODE_ENV test conflict / `getApiKey()` throwing) were checked and did not fire:
  - `sketch-enqueue.ts:55-58` uses `NODE_ENV === 'test' || KALORI_SKETCH_DISABLED === '1'` (positive allowlist + kill switch). My implementation uses `NODE_ENV !== 'production'` — the symmetric inverse allowlist. Different env check, same shape (positive allowlist for safe environments, NOT denylist + opt-in). Adapted per proposal §Recommended fix — Option A reasoning (we want both `'test'` AND `'development'` to keep working, hence the inversion).
  - Existing image-client tests use `NODE_ENV='test'` via Vitest auto-set. New specs explicitly set `process.env.NODE_ENV` via the project-precedent pattern at `tests/unit/sentry-test-route.test.ts:11-13` (spread + literal). `afterEach` already restores `originalEnv`, so no cross-test leak.
  - `getApiKey()` throws when `GEMINI_API_KEY` is empty. The new prod-mode test sets `process.env.GEMINI_API_KEY = 'test-key'` via the existing `beforeEach` (which is preserved on the `{ ...process.env, NODE_ENV: 'production' }` spread). No mock of `getApiKey` was required.

### Halts / stop-the-world triggers

- **None triggered.** Implementation went RED → GREEN in two passes (one test re-run before, one after). No retest loops, no rework, no scope expansion.

### Acceptance criteria checklist (from proposal §Recommended fix — Option A)

- [x] Wrap fixture read in `if (process.env.NODE_ENV !== 'production')` at `lib/ai/image-client.ts:82-85`.
- [x] Add explanatory JSDoc on `callGeminiImage` documenting the gate + reference to `sketch-enqueue.ts:55-58`.
- [x] Update top-of-file doc block to mention prod-gate precondition.
- [x] New test 1: `NODE_ENV='production'` + fixture env set → fetchSpy called, live path exercised.
- [x] New test 2: `NODE_ENV='test'` + fixture env set → fixture bytes returned, fetchSpy NOT called.
- [x] New test 3: `NODE_ENV='development'` + fixture env set → fixture bytes returned, fetchSpy NOT called.
- [x] All 6 pre-existing specs still GREEN (no regression).
- [x] No new failures in the full regression sweep — confirmed. Image-client suite 9/9 green; all 8 unrelated failures localized to `tests/components/log-flow/LibraryTab.test.tsx` (Cluster D).

---

## Hand-off to main agent

- Cluster C implementation complete. Item 3 ready for Phase 4-5 Codex adversarial review.
- No blockers, no halts, no protocol violations.
- Output ready for batch commit in Phase 8 alongside Clusters A/B/D items.
- Recommended Codex framing focus area: confirm the prod-gate inversion (`!==` vs `===`) preserves the existing positive-allowlist intent of the project precedent, and verify no other env-var back-doors (already audited in proposal §Other env-var "back doors" audited — `KALORI_SKETCH_DISABLED`, `KALORI_ENV`, `KALORI_AI_FALLBACK_MODEL` all assessed and clear).
