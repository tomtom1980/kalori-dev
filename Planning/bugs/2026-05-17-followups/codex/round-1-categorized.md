# Codex Adversarial Review — Round 1 — Categorized Findings

**Batch:** bugfix-tomi `2026-05-17-followups`
**Base:** `07273a3`
**Origin HEAD:** `0e4d39d`
**Diff size:** 405,170 bytes (44 files, +7124 / -254) — under 900 KB, no split needed
**Auto-retry signals:** NONE (verbatim scan clean)
**Codex verdict:** `needs-attention`
**Codex thread:** `019e3488-c5eb-7812-8d80-ea43bcc4549a`

---

## Critical (auto-fix via sub-agent, then re-verify)

### C1 — LM-I2 merge path still silently rewrites legacy-only non-sodium micros on unrelated saves
- **File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:424-487`
- **Severity in Codex output:** `[high]`
- **Why critical:** Violates the batch's own stated R1-C1 shape-preservation invariant. `buildFieldsPatch` calls `canonicalizeMicrosBag(initMicrosRecord)` which aliases `iron_mg` → `iron`, `vitamin_c_mg` → `vitamin_c`, etc. The only legacy-only undo path is hard-coded for `sodium_mg`. Result: a legacy-only row `{ iron_mg: 3 }` followed by an unrelated macro edit silently persists as `{ iron: 3 }`. This is a silent JSONB shape mutation on an unrelated edit — compatibility/rollback risk for any remaining legacy-shape consumers.
- **Cross-bug impact:** This directly contradicts Bug 2's stated fix scope ("preserve legacy-only rows unchanged while drift cases resolve to canonical"). The fix only applied the preservation rule to sodium; all other canonical/legacy pairs (iron, vitamin_c, etc.) still regress.
- **Codex recommendation:** Preserve raw legacy-only aliases per canonical nutrient, not just sodium. Canonicalize only when both canonical and legacy keys are present, or when the user explicitly edits that nutrient. Add regression tests for legacy-only `iron_mg` / `vitamin_c_mg` plus unrelated macro edits.

---

## Improvement (auto-fix via sub-agent, then re-verify)

### I1 — Collapsed micro errors can block save with no visible error or focus target
- **File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:781-796`
- **Severity in Codex output:** `[medium]`
- **Why improvement (not critical):** User can be blocked from saving with no UX feedback, but no data is lost or corrupted. Codex's own framing places it below the legacy-only persistence bug. A11y/UX regression vs data-integrity bug — distinct buckets.
- **Detail:** On validation failure the hook sets field errors then focuses the first errored micro input by id. The code itself acknowledges the micro input may be inside a closed Radix Collapsible (absent from DOM) → focus call is a no-op. Validation failures return before `onFailed` is called, so parent save banner is also not set. Net result: user enters invalid micro, collapses panel, clicks Save → save blocked silently, errored input + alert hidden until manual re-expand.
- **Codex recommendation:** Make the edit micros collapsible controlled from validation state and auto-open it when `errors.micros` is present, OR force-mount the content and ensure the invalid field/error is visible and focusable when Save is blocked.
- **Note:** This is an existing UX defect surfaced by Codex during review of the Bug 2 region. Not strictly a Bug 2 regression — but lives in the file Bug 2 modified, so should be evaluated for batch inclusion vs. new followup.

---

## Minor (present to user for decision)

None.

---

## Noise-file findings (NOT this batch's bugs)

- `app/globals.css` — no findings generated
- `components/AddFoodTab/LibraryLoadingSkeleton.tsx` — no findings generated

Codex did not flag either as problematic. They remain unrelated lint-staged inclusions from concurrent session; no action required from this review.

---

## Bug-by-bug verdict from Codex

| Bug | Codex outcome |
|---|---|
| Bug 1 (LM-I1, FoodDetailMacros sodium read/exclude symmetry) | No findings — review accepted |
| Bug 2 (LM-I2, useFoodDetailEdit shape preservation) | **C1 — INCOMPLETE — non-sodium aliases still being mutated** + I1 collapsed-error UX |
| Bug 3 (LM-SEC-1, ConfirmationItemMicros 3-layer cap) | No findings — review accepted |
| Bug 4 (LM-SEC-2, getRandomValues UUID fallback) | No findings — review accepted |

---

## Round status

- **Round:** 1 of 2 (cap per `~/.claude/rules/codex-review.md`)
- **Next action:** Auto-fix C1 + I1 via sub-agent, then run round 2.
- **Hard cap:** No round 3. If C1 re-issues after round 2 auto-fix, hand to user.
