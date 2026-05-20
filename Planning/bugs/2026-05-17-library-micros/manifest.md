# bugfix-tomi Batch Manifest — 2026-05-17-library-micros

**Batch ID:** 2026-05-17-library-micros
**Started:** 2026-05-16T19:14:49Z
**Completed:** 2026-05-17 (Phase 8 docs-write)
**Starting SHA:** 60e85c5172eed97adbfd42bad7af3b5e82cef042
**Final SHA (Bug 1 push):** 9361fe6 (post-batch HEAD progressed to 8dc799f after R1-C1 fix)
**Project slug:** kalori
**Batch theme:** Library micronutrient flow — adding the missing micros expander on the Add/Record form (Bug 1), restoring units on display (Bug 2), and adding daily-value comparison (Bug 3).
**Codex rounds run:** 2
**Codex outcome:** Round 1 → 2 Critical (1 in-batch auto-fix C1; 1 pre-existing C2). Round 2 → 0 Critical / 2 Improvement (both deferred to followups per round-2 cap).
**Security review outcome:** CLEAN (0 Critical, 0 High, 0 Medium, 2 Informational deferred).
**E2E verdict:** PASS at unit/component layer (461/461 GREEN); Playwright hampered by concurrent-session uncommitted LibraryCard.tsx edits unrelated to this batch.
**Concurrent-session collision:** A sibling Claude Code session ran `git stash; git reset --hard` twice mid-batch. Bug 2/3 work recovered from stash@{0}; Bug 1's first production implementation was lost (not in any stash) and was re-implemented from the surviving test file as TDD anchor.

---

## Bug 1 — Library Add/Record form micros expander

- **Description:** Library ADD/RECORD flow on the AI Confirmation screen was missing a collapsible Micronutrients section, preventing users from entering canonical micros (iron, vitamin C, zinc, etc.) at library-creation time.
- **Classification:** `known_fix_or_actually_a_feature_kept_in_batch` (user-scoped + contained; kept in batch despite feature framing)
- **Files changed:**
  - `app/(app)/log/_components/ConfirmationScreen.tsx` — `Collapsible` + `DEFAULT_MICROS_LIST` imports; `EDIT_ITEM_MICRO` reducer action; `editMicro` callback on `ConfirmationActions`; new `ConfirmationItemMicros` function component (library-only gated) with stable `confirmation-item-{i}-micro-{code}-input` testids.
  - `lib/i18n/en.ts` — `confirmationItemMicrosExpandShow` + `confirmationItemMicrosExpandHide` (committed earlier in `b51cad1`).
  - `tests/components/library/FoodDetailMacros.test.tsx` — push-unblock side-fix only (pre-existing `sugar_g` TS literal widening to match commit `a0879b1` precedent).
- **Tests added:**
  - `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx` (4 tests TDD-anchored): trigger renders in library-only mode, does NOT render in standard log flow, all 30 canonical inputs render once expanded, edits round-trip into POST body.
- **Codex findings:** Round 1 C1 cross-bug regression — the canonical sodium write path in Bug 1 collided with Bug 2/3's legacy-only read path. Fixed in commit `8dc799f` by routing both read+write through `canonicalizeMicroKey`.
- **Security findings:** SEC-1 (Informational) — no upper bound on `EDIT_ITEM_MICRO` input (defense-in-depth). Deferred.
- **Status:** implemented_committed_pushed
- **Commits:** `45376f8` (production code + tests) + `9361fe6` (push-unblock side-fix)

---

## Bug 2 — Library micros display missing units (mg, ug, g)

- **Description:** Library view/edit displayed nutrient values without their units (e.g. "30" instead of "30 mg"), confusing the user and divorcing the displayed value from the daily-value reference frame.
- **Classification:** `needs_debug_shallow`
- **Files changed:**
  - `lib/nutrition/micros-rda.ts` — added `CANONICAL_CODE_TO_UNIT` frozen map built from `DEFAULT_MICROS_LIST` (single source of truth).
  - `lib/dashboard/micros-rda-resolver.ts` — added `canonicalMicroUnit(rawKey)` helper; resolution chain `canonicalizeMicroKey` → case-insensitive retry → map lookup.
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — `buildMicroRow` now calls `canonicalMicroUnit(key) ?? unitFromMicroKey(key)`; sodium always-visible row resolves through `canonicalMicroUnit('sodium')`.
  - `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` — `unitFromMicroKey` JSDoc updated to mark it a LEGACY FALLBACK only.
- **Tests added:**
  - `tests/unit/lib/dashboard/canonical-micro-unit.test.ts` (9 cases): suffixed legacy, bare canonical, uppercased canonical, mcg-suffixed, display-name, orphan, cross-unit suffix (`sodium_g → undefined`), canonical sodium, canonical vitamin_a.
  - `tests/components/library/FoodDetailMacros.test.tsx` — appended `Bug 2 library micros unit display` describe block (6 cases).
- **Codex findings:** Folded into Round 1 C1 (cross-bug sodium canonical/legacy alignment). Round 2 I1 (display-name "Sodium" key drop) deferred to followups.
- **Security findings:** None bug-specific.
- **Status:** implemented (in commit `b51cad1`)
- **Commits:** `b51cad1` (joint with Bug 3)

---

## Bug 3 — Library detail view missing daily-value comparison

- **Description:** Library detail view should show "30 mg / 90 mg DV" (or `33% DV`) so users can see how a food contributes against the canonical daily value reference. Without DV comparison, the bare number is meaningless.
- **Classification:** `known_fix`
- **Files changed:**
  - `lib/dashboard/micros-rda-resolver.ts` — added `CANONICAL_CODE_TO_RDA` frozen map + `canonicalMicroRda(rawKey)` sibling helper (same resolution chain as `canonicalMicroUnit`).
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — extended `MicroRow` with `dvPct: number | null`; new internal `<MicroRowDisplay />` component renders measurable rows wrapped in `<div role="meter" aria-valuenow={clampedPct} aria-valuemin={0} aria-valuemax={100} aria-label={...}>`. Sodium default-row computes `dvPct` via `canonicalMicroRda('sodium') → 2300`. Non-measurable rows (sugar, orphans) omit meter role + DV suffix.
  - `app/globals.css` — added `.kalori-fd-micro-dv` rule mirroring `.kalori-fd-macro-dv` typography.
- **Tests added:**
  - `tests/unit/lib/dashboard/canonical-micro-unit.test.ts` — appended `canonicalMicroRda — Bug 3 library micros DV resolver` describe block (10 cases).
  - `tests/components/library/FoodDetailMacros.test.tsx` — appended `<FoodDetailMacros /> — Bug 3 library micros DV suffix + role=meter` describe block (9 cases) covering DV text, `role="meter"` wrapper, `aria-valuenow` correctness, over-RDA clamp (sodium 4600 mg → `aria-valuenow="100"`, text `200% DV`), orphan row with no DV suffix and no meter.
- **Codex findings:** No new findings (joint with Bug 2's R1 C1 sodium fix). Round 2 I2 (useFoodDetailEdit canonical/legacy dedup only on sodiumChanged=true) deferred to followups.
- **Security findings:** None bug-specific.
- **Status:** implemented (in commit `b51cad1`)
- **Commits:** `b51cad1` (joint with Bug 2)

---

## Aggregate Codex review summary

### Round 1 (commits in scope: `b51cad1`, `45376f8`, `9361fe6`)
- **C1 (Critical):** Cross-bug regression — Bug 1 wrote canonical `micros.sodium`; Bug 2/3 read only legacy `micros.sodium_mg`. Canonical sodium fell into "extras" (or was duplicated when both shapes coexisted). **Auto-fixed in commit `8dc799f`** by routing read+write through `canonicalizeMicroKey` and adding migration logic in `useFoodDetailEdit` to migrate legacy duplicates to canonical on save.
- **C2 (Critical):** Multi-row library-only batch save not retry-safe. **Determined PRE-EXISTING** (introduced commit `783fcc1`, before this batch's starting SHA `60e85c5`). Already tracked in `Planning/followups.md` as `POST-MVP-CODEX-R3-C1` (RESOLVED in `e7400e9`). Strengthened with new evidence from this batch's Codex output. No code change in this batch.

### Round 2 (commits in scope: `b51cad1`, `45376f8`, `9361fe6`, `8dc799f`)
- **I1 (Improvement, medium per Codex):** Display-name "Sodium" key dropped from FoodDetail (read/exclude asymmetry). Deferred — theoretical, no write path persists display-name today.
- **I2 (Improvement, medium per Codex):** Legacy sodium duplicate survives unrelated edits (requires pre-existing drift to trigger). Deferred — back-compat scenario, not a new regression from this batch.

Both R2 findings filed to followups as `POST-MVP-BUGFIX-2026-05-17-LM-I1` and `-LM-I2`. Round-2 cap applies — no Round 3.

---

## Aggregate security review summary

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Informational:** 2
  - **SEC-1:** `EDIT_ITEM_MICRO` has no upper bound on input. Defense-in-depth only; RLS-scoped, no privilege boundary crossed. Filed as `POST-MVP-BUGFIX-2026-05-17-LM-SEC-1`.
  - **SEC-2:** `mintLibraryClientId` v4 fallback uses `Math.random()`. Non-cryptographic but `client_id` is not a secret; function appears dead in post-`e7400e9` working tree. Filed as `POST-MVP-BUGFIX-2026-05-17-LM-SEC-2`.

Verdict: clean.

---

## Aggregate E2E + UI testing summary

- **Unit/component layer:** 461 tests / 53 files / 0 failures (57 bug-anchored; broader dashboard micros 132; library component + log-flow 272).
- **Playwright E2E:** Hampered by concurrent-session uncommitted `LibraryCard.tsx` edits (bottom-tab-bar / portion-unit batch — NOT this batch's territory). Dev server unresponsive mid-attempt; `library-card-lettermark-{id}` testid failed for unrelated reasons.
- **MCP browser scenarios:** None (dev server instability + concurrent ownership of dev server).
- **Visual regression:** No baselines intersect the changed UI surface (FoodDetail view + ConfirmationScreen library-only mode). No new baselines written.
- **Verdict:** PASS at unit/component layer. E2E layer non-regressive (failures are concurrent-session, not from this batch).

---

## Commits in this batch

| SHA | Description |
|---|---|
| `b51cad1` | Bug 2 + Bug 3 (canonical unit/RDA helpers, DV comparison, role=meter, MicroRowDisplay) — also includes i18n keys for Bug 1 and the initial test file recovery |
| `45376f8` | Bug 1 production (`ConfirmationScreen` library-only micros collapsible, `EDIT_ITEM_MICRO` reducer action, `ConfirmationItemMicros` component) |
| `9361fe6` | Push-unblock side-fix — pre-existing TS error in `tests/components/library/FoodDetailMacros.test.tsx` `sugar_g` literal widening (matches commit `a0879b1` precedent) |
| `8dc799f` | R1-C1 sodium canonical/legacy alignment in `useFoodDetailEdit` + `FoodDetailMacros` reads |

---

## Status: COMPLETE

All 3 bugs implemented, committed, and pushed to `origin/main`. Two Codex rounds run (max cap applied). Security review clean. E2E pass at unit/component layer. Two Codex R2 improvements + two Informational security findings deferred to `Planning/followups.md`. `POST-MVP-CODEX-R3-C1` strengthened with new evidence (C2 finding determined pre-existing).
