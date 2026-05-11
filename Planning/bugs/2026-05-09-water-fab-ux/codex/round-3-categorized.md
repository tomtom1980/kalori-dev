# Codex Round 3 Findings — Categorized

**Round:** 3 (verification round, post-cap override)
**Base:** `ca8e4fe`
**Scope:** working-tree diff (9 prod files, ~64KB)
**Verdict:** **needs-attention** — NEW Critical surfaced

**Pre-flight:** auth ok, runtime ready (codex-cli 0.125.0), prod-only diff 64KB (well within 500KB safe budget).
**Auto-retry signals scanned:** none. Review is reliable.

---

## NEW Critical (1)

### C2-prime — Skipped-success path drops chip writes when baseline shift is unrelated

- **File:** `components/dashboard/WaterTracker.tsx:105–217`
- **Severity (Codex label):** `high`
- **Categorization:** **NEW Critical** (orthogonal scenario not covered by R1/R2 fixes)
- **Summary:** The resetKey bump is global to any `initial.consumedMl` change. The reducer drops all optimistic actions under the prior key, and the success path skips `setCommittedConsumedMl` whenever `resetKeyRef.current !== issuedResetKey`.
- **Race scenario:**
  1. User taps +250 chip → optimistic action issued under `resetKeyA`, POST in flight.
  2. **Unrelated** baseline refresh fires (e.g., another tab logs water, or unrelated server-action triggers `router.refresh()`). New baseline reflects *other* activity but does NOT include the still-pending +250.
  3. `initial.consumedMl` changes → resetKey bumps to `resetKeyB`, optimistic action under `resetKeyA` is wiped.
  4. POST resolves successfully. Success handler sees `resetKeyRef.current (B) !== issuedResetKey (A)` → silently skips `setCommittedConsumedMl`.
  5. Row IS persisted server-side, but chip total locally undercounts by 250ml until next navigation/refresh.
- **Real-world impact:** User sees their successful intake disappear → may re-tap chip → duplicate logging.
- **Why R3 didn't catch this:** R3 fixes the layout-effect timing (microtask race within a single resetKey window). Different ordering bug — same "skipped success" code path, different upstream condition.
- **Test coverage gap:** Existing tests cover only the happy interleaving where refreshed baseline includes the same +250. The "baseline-shift-without-this-write" ordering is unpinned.
- **Recommended remediation (per Codex):**
  - Option A: On skipped success, trigger a forced reconciliation (dashboard refresh/refetch).
  - Option B: Have `/api/water/log` return an authoritative total for `logged_on` and set the committed baseline from that response (always-trust-server).
  - Option C: Track per-action persistence flags so successful in-flight writes can be re-applied on top of the new baseline if they're not yet reflected.
  - Add a regression test where the mid-flight baseline shift is unrelated and does NOT include the chip write.

---

## NEW Improvement (0)

None.

## NEW Minor (0)

None.

---

## Round 1 + Round 2 fix verification (per Codex)

Codex did not explicitly re-flag R1/R2 fixes in Round 3. Inferred status:

| Fix | Status | Notes |
|---|---|---|
| C1 (resetKey guard) | **PARTIALLY VERIFIED** — closes the within-key race, but C2-prime exposes that the resetKey-discriminator model itself is incomplete for orthogonal baseline shifts | Not re-flagged for the original timing concern; the new finding is a different ordering bug on the same code path |
| R3 fix (`useLayoutEffect` on resetKeyRef mirror) | **NOT EXPLICITLY VERIFIED** — Codex did not separately address whether the layout-effect change closes the original C1-prime race | Codex's C2-prime finding is upstream of the timing question; even if useLayoutEffect closes the microtask race, the silent-skip behavior still drops successful writes |
| C2 (truthful feedback on SessionExpiredError) | **NOT RE-FLAGGED** — implicitly verified | Codex's focus was entirely on the WaterTracker; no comments on UndoToast/store changes |
| I1 (cross-tab dismiss) | **NOT RE-FLAGGED** — implicitly verified | Same — no comments on the store/cross-tab path |

---

## Decision per HARD-RULE 4 (post-cap override protocol)

**NEW Critical = 1 → Cycle is BROKEN.** Per the protocol:
- No round 4 is permitted.
- User options shrink to: **force-commit** (accept the residual risk) OR **abort** (continue iterating without further Codex sign-off, or treat the bundle as failed).
- This decision is the user's, not the sub-agent's.

State.md → `codex_round_3: cycle_broken_pending_user_decision`.
