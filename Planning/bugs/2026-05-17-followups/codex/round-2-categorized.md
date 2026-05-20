# Codex Round 2 — Categorized Findings

**Batch:** bugfix-tomi `2026-05-17-followups`
**Base SHA:** `07273a3`
**Round:** 2 (re-review after R1 auto-fixes in `fd1e3fc`)
**Codex verdict:** `needs-attention`
**Auto-retry signals:** none (review COMPLETE)
**Pre-flight diff size:** 49 files, 7635 insertions, 253 deletions, ~426 KB (under 500 KB safe threshold)

---

## Bucket assignment rationale

- **Critical** = blocks ship / silent data loss / security exposure / R1-fix-broken-the-original-fix → 0 findings
- **Improvement** = correctness / UX / scope-completeness gaps the user should be told about → 3 findings (all Codex `[medium]`)
- **Minor** = nits, polish, style → 0 findings

Per two-round cap: zero auto-fix in round 2, residuals pushed to `pending_minor_findings` and surfaced to user.

---

## Critical (0)

_None._

---

## Improvement (3)

### I-R2-1 — Stale validation banner survives no-op save (R1 regression)

**File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:878-881`

**Codex finding (verbatim):**
> The R1 validation branch now calls `onFailed(saveFailedBanner)`, which sets FoodDetail's parent `errorBanner`. If the user then fixes the invalid input back to the original persisted value, `buildFieldsPatch()` returns null and this branch only calls `setEditing(false)` before returning success. It does not clear local `_form` errors and does not call `onCommitted`, which is the parent path that clears `errorBanner`. Result: the sheet can close edit mode while still showing a stale "save failed" alert after a successful no-op save.

**Verdict on R1 fix:** I1 partially regressed. The validation branch was extended to fire the parent banner (good), but the no-fields success branch (separate code path) doesn't clear the banner state set by a prior validation failure in the same edit session.

**Reproducer scenario:**
1. User opens edit on a food row.
2. User enters invalid value, presses Save → validation fails, banner shows + parent banner set via `onFailed`.
3. User edits back to the original persisted value, presses Save → `buildFieldsPatch()` returns null, branch sets `setEditing(false)`, returns success.
4. Parent `errorBanner` still set from step 2 → user sees stale "save failed" alert after a successful save.

**Recommendation (deferred — round-2 cap, no auto-fix):** Clear both `errors._form` and call `onCommitted()` (or explicitly clear parent banner) on the no-fields success path. Regression test required.

---

### I-R2-2 — Same-value micro edits not registered as "touched" (C1 partial gap)

**File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:393-530`

**Codex finding (verbatim):**
> The generic micro path only records `microEdits[canonicalKey]` when the parsed/clamped number differs from the canonicalized initial value. The R1 preservation pass then uses only `microEdits` and `microClears` to decide whether the user touched a key. A user editing `iron_mg: 3` through the generic `iron` input to `3`, `3.0`, or another same-number representation is indistinguishable from not editing it; with another nutrition change in the same save, the preservation pass keeps `iron_mg` even though the generic micro surface was touched. This violates the stated R1 rule that preservation applies only when the micro was not edited.

**Verdict on R1 fix:** C1 narrowly incomplete. The R1 universal-preservation logic correctly extended from sodium-only to all 30 canonical/legacy pairs, but the "edited" detection it relies on is value-delta-based, not touch-based. Same-value re-entry through the generic input is the seam.

**Real-world impact:** Narrow. User must (a) edit a generic micro input to the same numeric value AND (b) save other fields in the same operation to trigger preservation when they expected canonicalization. No data loss — legacy-shape stays as it was, which matches the user's effective state after the edit.

**Recommendation (deferred — round-2 cap, no auto-fix):** Add a separate `microTouchedKeys: Set<string>` populated on every onChange to the generic micro inputs, regardless of value parity. Use that set in the preservation guard instead of `microEdits`/`microClears` membership.

---

### I-R2-3 — Add Food CTA / icon / skeleton are dead code (out-of-batch scope creep)

**File:** `app/(app)/log/_components/LibraryTab.tsx:406-419` (production LibraryTab empty-state branch)

**Codex finding (verbatim):**
> The branch adds `AddNewItemCTA`, `AddNewItemIconButton`, and `LibraryLoadingSkeleton`, but the production `LibraryTab` empty state still renders only the existing paragraph (`libraryNoMatch`/`libraryEmpty`). A repo-wide search outside tests shows no production imports or render sites for the new components. The isolated component tests pass while the user-visible Add Food tab merge/empty-state path remains absent.

**Verdict:** Net-new finding (not in round 1). Commits `734ce8c`, `38ecf64`, `debf99b` are within the round-2 base range and add components + i18n strings that production code does not consume. The component tests pass in isolation but the user-facing flow they were meant to power is not wired.

**Note for triage:** These commits appear to be part of a separate "Add Food tab merge" feature (per commit subjects), not the original bugfix-tomi `2026-05-17-followups` batch (Bug 1-4 + R1 fix). They landed on `origin/main` between R1 and R2.

**Recommendation (deferred — out of batch scope):** Either (a) wire the new components into the production `LibraryTab` empty state + add an integration test for the search→empty→CTA→add-new flow, or (b) revert/quarantine the dead-code commits until the Add Food merge feature is fully implemented.

---

## Minor (0)

_None._

---

## Verification of R1 fixes against the four scrutiny questions

| Question | Verdict |
|---|---|
| 1. Does universal-preservation correctly distinguish "user did not edit" from "user edited to same value"? | **NO** — see I-R2-2. Value-delta detection is the gap. |
| 2. Are all 30 canonical/legacy pairs covered? | **YES** — Codex did not flag hard-coded subset. Per-canonical-key shape capture during `initMicrosRecord` walk is correct. |
| 3. Does validation banner race with other state updates? | **PARTIALLY** — see I-R2-1. No banner-shown-twice race, but stale-banner-after-recovery-and-no-op-save is real. |
| 4. Cross-bug interaction from `fd1e3fc` on top of Bug 1/2/3/4? | **NONE FLAGGED** — Codex did not surface fresh interactions between the R1 patch and the four original bug fixes. |

---

## Outcome

**Critical = 0, Improvement = 3, Minor = 0.**

Per two-round cap, NO round-3 auto-fix. All 3 Improvement findings are deferred into `pending_minor_findings` and surfaced to the user for force-commit vs round-3 vs abort-and-rollback decision.

**State label:** `codex_round_2: completed_with_fixes` (cap-reached terminology).
