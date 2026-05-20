# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-16-ios-calendar-fix`
**Target:** uncommitted working-tree diff vs HEAD
**Codex verdict:** `needs-attention`
**Completion status:** CLEAN — no auto-retry signals detected (scanned for `Input exceeded 1MB`, `Retrying with tighter scope`, `production files only`, `spec context trimmed`)
**Total findings:** 1 (0 Critical / 1 Improvement / 0 Minor)

---

## Critical

_None._

---

## Improvement

### I-1 — Tests do not verify the input covers the 44×44 tap target

**Severity (Codex):** medium
**Category:** Improvement (test discipline / regression guard strength)
**Files / lines:** `tests/unit/components/dashboard/DashboardDateControl.test.tsx:92-156`

**Verbatim Codex quote:**

> [medium] Improvement: tests do not verify the input covers the 44x44 tap target (tests/unit/components/dashboard/DashboardDateControl.test.tsx:92-156)
> The core iOS requirement is that the user's tap hit-tests to the real date input, but this test only checks pointer-events, opacity, and the parent wrapper's min size. It never asserts the input's own position/inset/width/height or performs any hit-test through the visible trigger area. A broken regression with a 1px input, pointerEvents:auto, and a 44px parent would still satisfy the important assertions while failing the same iOS scenario this fix is meant to close. The showPicker spy also clicks the input directly in jsdom, so it does not validate wrapper/icon-area tapping or native picker behavior.
> Recommendation: Add coverage that proves the input owns the visible trigger hit area, e.g. assert wrapper position:relative plus input position:absolute/inset:0/100% sizing, and preferably a browser-level elementFromPoint/click-through test on the trigger center/corners.

**Why this matters:** The TDD harness asserts shape (opacity, pointer-events, parent box) but not the geometric covering contract that the iOS fix depends on. A future regression that shrinks the input back to 1×1 with pointer-events:auto would still pass the current tests. The bug class this fix exists to prevent (iOS Safari refusing showPicker because the input is unhittable) is therefore not protected by a real regression guard.

**Recommended fix scope (for round 2 auto-fix sub-agent):**
1. Assert `position: absolute` + `inset: 0` (or top/left/right/bottom: 0) + `width: 100%` + `height: 100%` on the date input itself.
2. Assert `position: relative` on the wrapper span (so absolute positioning resolves against it).
3. Optionally add a Playwright/elementFromPoint test in the user-stories suite confirming the input is the element hit when tapping center/corners of the visible 44×44 box. (Defer to FU if Playwright suite is out of scope for this bugfix-tomi batch.)

---

## Minor

_None._

---

## Categorization summary

| Severity (Codex) | bugfix-tomi bucket | Action |
|---|---|---|
| medium | Improvement | Auto-fix via sub-agent in round 2 |

**Auto-fix candidates:** I-1
**Defer-to-FU candidates:** none (the unit-level reinforcement is in scope; only the optional Playwright addendum could become a FU if it expands scope)
**User decision required:** none

**Two-round cap status:** Round 1 of 2 complete. Round 2 will run after the auto-fix sub-agent strengthens the geometric covering assertions.
