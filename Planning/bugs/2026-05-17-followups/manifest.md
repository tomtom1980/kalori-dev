# bugfix-tomi batch 2026-05-17-followups — Manifest

**Batch label:** 2026-05-17-followups
**Date:** 2026-05-17
**Trigger:** Follow-up batch to clear 4 deferred entries from the prior `2026-05-17-library-micros` batch (LM-I1, LM-I2, LM-SEC-1, LM-SEC-2)
**Starting SHA:** `07273a3`
**Final SHA (HEAD):** `fd1e3fc` (origin/main)

---

## Bugs in scope (4)

### Bug 1 — POST-MVP-BUGFIX-2026-05-17-LM-I1 (Improvement)

**Title:** FoodDetailMacros `resolveSodiumMg` read/exclude asymmetry with display-name "Sodium"
**Source file:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`
**Tests file:** `tests/components/library/FoodDetailMacros.test.tsx`
**Commit:** `e496627`
**Risk:** low

**Root cause:** `resolveSodiumMg` (lines 101-116) read only `micros.sodium` and `micros.sodium_mg` via direct bracket access. The extras-exclusion filter (lines 613-629) canonicalized every key via `canonicalizeMicroKey` and dropped anything whose canonical form was `sodium` — including display-name `"Sodium"` mapped via `DISPLAY_NAME_TO_CANONICAL_CODE`. Asymmetric: shape-strict read path vs canonical-aware exclude path. A row with `micros: { "Sodium": 500 }` was hidden from BOTH the always-visible sodium meter AND the collapsible extras.

**Fix:** Rewrote `resolveSodiumMg` to iterate `Object.entries(micros)`, canonicalize each key via `canonicalizeMicroKey`, apply canonical-wins precedence (`sodium` > `sodium_mg` > display-name aliases). JSDoc updated to cite LM-I1 and the 2026-05-14 encoding-boundary lesson.

**Tests:** 5 new (1 RED-then-GREEN display-name read driver + 4 regression/symmetry assertions). Pre-fix: test 1 failed with the load-bearing testid absent. Post-fix: 39/39 in target file + 1483/1483 in full vitest pre-push sweep.

---

### Bug 2 — POST-MVP-BUGFIX-2026-05-17-LM-I2 (Improvement, extended via Codex R1 C1)

**Title:** `useFoodDetailEdit` canonical/legacy dedup only fired when `sodiumChanged === true`
**Source file:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
**Tests files:** `tests/unit/library/food-detail-edit-validation.test.ts`, `tests/unit/library/food-detail-edit-validation-banner.test.tsx` (NEW)
**Commits:** `42126c0` (initial sodium-only) + `fd1e3fc` (R1 C1+I1 universal fix)
**Risk:** low

**Root cause (original proposal):** Dedup block conditional on `sodiumChanged === true`. Drifted row with both `sodium` and `sodium_mg` keys leaked both into the patch on unrelated edits, double-counting in `aggregateMicros`.

**Implementation refinement (TDD-driven):** Earlier commit `e8af134` (library-micros-parse R1-C2) had already introduced `canonicalizeMicrosBag` at the merge spread, which two-pass-collapses drift to canonical correctly. The actual residual bug was the *inverse*: legacy-only rows getting aggressively migrated to canonical, contradicting R1-C1's committed "preserve legacy shape" policy. Fix pulled dedup OUTSIDE the `sodiumChanged` branch and added R1-C1 preservation for legacy-only no-edit cases.

**Codex R1 C1 (Critical) gap:** Initial `42126c0` preservation was sodium-only. Codex caught that the R1-C1 "shape policy preserved" claim still let `iron_mg` / `vitamin_c_mg` / `vitamin_a_mcg` / etc. silently migrate to canonical. Fix `fd1e3fc` extended preservation to all 30 canonical/legacy pairs via per-canonical-key shape map walk during `initMicrosRecord`.

**Codex R1 I1 (Improvement) fix:** Validation-failure branch now sets `errors._form = saveFailedBanner` AND calls `onFailed(saveFailedBanner)`, mirroring the network-failure branch exactly so the parent's existing `<p role="alert">` banner renders even when the errored input lives inside a closed Radix Collapsible.

**Tests:** 4 dedicated dedup tests + 6 new R1 tests for non-sodium aliases + 2 new R1 banner tests via `renderHook`. Pre-fix on R1 C1: legacy-only `iron_mg` + protein edit emitted `iron`. Post-fix: `iron_mg` preserved verbatim. 104/104 library unit + 325/325 broader sweep GREEN.

**Codex R2 residuals (deferred):** I-R2-1 (stale banner on no-op save — partial regression introduced by R1 I1), I-R2-2 (same-value micro edits not registered as touched — partial gap in R1 C1 touch detection). Both tracked as FU-I1 / FU-I2 in followups.md.

---

### Bug 3 — POST-MVP-BUGFIX-2026-05-17-LM-SEC-1 (Informational, defense-in-depth)

**Title:** `EDIT_ITEM_MICRO` accepts arbitrarily large positive finite values (scientific notation paste)
**Source file:** `app/(app)/log/_components/ConfirmationScreen.tsx` (Layer 3 in `lib/library/create-schema.ts` was pre-existing — no edit)
**Tests file:** `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx`
**Commit:** `d579fbe`
**Risk:** low

**Root cause:** Three checkpoints accepted arbitrary positive finite values: HTML `<input type="number">` with no `max`, inline `onChange` with `Number()` parse (accepts `1e300` as finite), reducer `EDIT_ITEM_MICRO` calling `roundNutrition` which floors NaN/≤0 to 0 but never caps the upper bound. RLS-gated single-user surface so not a privilege boundary — defense-in-depth fix.

**Fix:** 3-layer defense.
- Layer 1: `max="999999"` HTML attribute added.
- Layer 2: `Math.min(parsed, 999999)` cap in inline `onChange` handler before `actions.editMicro` dispatch.
- Layer 3: Zod `.max(MAX_MICRO_VALUE = 1_000_000)` was ALREADY PRESENT via `lib/library/micros-bounds.ts` (deployed earlier on 2026-05-17 by the library-micros-parse R1-C3 batch). No edit required. 1-unit headroom (999_999 input vs 1_000_000 schema) absorbs `roundNutrition`'s 1-decimal rounding.

**Tests:** 3 new (max attribute assertion + typed-value 99999999999 → 999999 cap + scientific-notation `1e10` paste → 999999 cap). 7/7 target file + 71/71 broader log-flow sweep GREEN.

**Surprise:** Proposal assumed Layer 3 was missing; on inspection the Zod cap was already deployed. Surgical Changes principle — skipped the redundant schema edit, documented in commit message.

---

### Bug 4 — POST-MVP-BUGFIX-2026-05-17-LM-SEC-2 + sibling (Informational, defense-in-depth)

**Title:** `mintLibraryClientId` + `generateClientId` v4 UUID fallback uses non-cryptographic `Math.random()`
**Source files:** `app/(app)/log/_components/ConfirmationScreen.tsx`, `lib/stores/useLogFlowStore.ts`
**Tests files:** `tests/unit/components/log-flow/mint-library-client-id.test.ts` (NEW), `tests/unit/stores/useLogFlowStore.test.ts` (extended)
**Commits:** `8d4a07f` (main fix) + `0e4d39d` (typecheck fixup for `noUncheckedIndexedAccess`)
**Risk:** low

**Reachability re-verification:** Branch B (function IS reachable) — the original deferral note's claim that `mintLibraryClientId` was "effectively dead in the post-e7400e9 working tree" was incorrect. Commit `e7400e9` did NOT eliminate the call site — it RELOCATED it from the per-attempt save loop to the per-row reducer lazy-init at `ConfirmationScreen.tsx:645`. Function runs once per row at component mount.

**Scope expansion:** User approved including the sibling `generateClientId` at `lib/stores/useLogFlowStore.ts:439` in the same batch (identical defect, called from `ensureClientId` at line 609).

**Fix:** Three-branch fallback structure in both functions.
1. Fast path: `crypto.randomUUID()` (unchanged — >99% of runtime hits)
2. Cryptographic fallback: `crypto.getRandomValues(new Uint8Array(16))` with RFC 4122 §4.4 byte-twiddle: `bytes[6] = (bytes[6] & 0x0f) | 0x40` (version 4), `bytes[8] = (bytes[8] & 0x3f) | 0x80` (variant 10xx).
3. Last-resort: original `Math.random()` template preserved for environments with NO crypto API at all (vanishingly rare; preserved so the function never throws + schema-validation contract `z.string().uuid()` still gets a syntactically-valid string).

Both functions newly `export`ed for test access (1-line surgical change each).

**Tests:** 8 new (4 per call site). Test 2 in each suite is the RED-then-GREEN driver: stubs `crypto.randomUUID` undefined, asserts `crypto.getRandomValues` called once and `Math.random` NOT called, asserts output matches v4 regex with correct version/variant nibbles. 29/29 target + 1501/1501 pre-push.

**Third sibling defect surfaced:** `lib/stores/useOnboardingStore.ts:210` has the same `Math.random()` fallback. Sub-agent surfaced and held back rather than silently growing scope. Tracked as LM-SEC-3 in followups.md.

**Push race note:** Background-task push of the same SHAs landed before foreground retry; final state `HEAD == origin/main == 0e4d39d`. No data loss.

---

## Codex Adversarial Review summary

**Round 1** (verdict: `needs-attention`)
- C1 [high] Universal legacy-shape preservation gap on Bug 2 — auto-fixed in `fd1e3fc`.
- I1 [medium] Collapsed-Collapsible focus no-op + missing parent save banner on validation failure — auto-fixed in `fd1e3fc`.
- Bug 1, 3, 4: clean.

**Round 2** (verdict: `needs-attention`, cap-reached)
- I-R2-1 [medium] Stale validation banner survives no-op save (R1-I1 partial regression). Deferred → FU-I1.
- I-R2-2 [medium] Same-value micro edits not registered as touched (R1-C1 partial gap). Deferred → FU-I2.
- I-R2-3 [medium] AddFoodTab dead code from sibling concurrent-session commits (OUT-OF-SCOPE). Deferred → FU-I3.
- 0 Critical. 2-round cap honored.

**Round 3:** Not run. Per-policy hard cap.

---

## Security review summary

**Verdict:** clean — 0 Critical / 0 High / 0 Medium / 2 Informational.

- INFO-1: Math.random() tertiary UUID fallback retained — unreachable in supported runtimes, documented as defense-in-depth. No action.
- INFO-2: Sentry `extra: { userId, loserId }` in `library/merge` — pre-existing logging; UUIDs are not PII. No action.

Special-focus areas (Bug 3 input bound, Bug 4 UUID compliance, Bug 1+2 canonicalization): all PASS.

---

## E2E + UI testing summary

**Verdict:** PASS.

- Playwright chromium aggregate: 18 passed / 2 pre-existing failures / 16 skipped.
- Pre-existing failures: lettermark testid (memory note 8105) + US-STAB-A3 AC6 (documented historical flake).
- Visual blocking baselines: 6/6 PASS (visual-baseline-chromium × 3 viewports × 2 specs).
- Visual advisory failures: 4 (firefox + safari × library + log-confirmation) — pre-existing browser-rendering drift; `continue-on-error` per playwright.config.
- New E2E specs added: 0. Bug 1 + Bug 3 covered exhaustively at component layer; Bug 4 covered at unit layer by design.
- Total wall-clock: ~80s.

---

## Commits in batch

| SHA | Author | Summary |
|---|---|---|
| `e496627` | Bug 1 sub-agent | `fix: bugfix batch followups LM-I1 — FoodDetailMacros sodium read/exclude symmetry` |
| `42126c0` | Bug 2 sub-agent | `fix: bugfix batch followups LM-I2 — useFoodDetailEdit canonical/legacy dedup invariant (sodium-only initial scope)` |
| `d579fbe` | Bug 3 sub-agent | `fix: bugfix batch followups LM-SEC-1 — micros input upper bound defense-in-depth` |
| `8d4a07f` | Bug 4 sub-agent | `fix: bugfix batch followups LM-SEC-2 — UUID fallback uses crypto.getRandomValues (+ generateClientId sibling)` |
| `0e4d39d` | Bug 4 sub-agent | `fix: LM-SEC-2 typecheck — non-null assertions on bytes[6]/bytes[8]` |
| `fd1e3fc` | Codex R1 auto-fix sub-agent | `fix: Codex R1 C1+I1 — universal legacy-shape preservation + validation banner mirror` |

---

## Artifacts

- `proposals/bug-{1-4}.md`
- `outputs/bug-{1-4}.md`
- `codex/round-1.md`, `codex/round-1-categorized.md`, `codex/fixes-r1-useFoodDetailEdit.md`, `codex/round-2.md`, `codex/round-2-categorized.md`
- `security-review.md`
- `e2e-results.md`
- `state-final.md` (was `state.md` in `.tmp`)
