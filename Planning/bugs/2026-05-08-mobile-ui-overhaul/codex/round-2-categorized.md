# Codex Round 2 — Categorized Findings

**Verdict:** needs-attention
**Auto-retry signals:** none detected — review complete
**Diff size:** ~85 KB after noise exclusion (well under 900 KB budget)

---

## Critical

### C-R2-1 — Wheel scroll math cannot select boundary rows by touch
**File:** `components/primitives/MobileWheelPicker.tsx:250-257`

**Codex finding (verbatim):**
> The picker renders a 5-row viewport with `padding: 0`, then derives the active row from the viewport center. That math assumes the first and last options can be physically centered, but the scroll range does not allow it: at `scrollTop=0`, the center maps to index 2, not index 0. With the 0.25-10 quantity options used by LibraryTab and ConfirmationScreen, touch scrolling cannot land on the first two or last two values, and opening an existing 0.25 value can be visually clamped at the top while a browser scroll event maps it to 0.75. The new tests only cover a middle-row scroll, so this remains false-green.

**Why this is Critical:**
- Real mobile users CANNOT touch-select the first 2 or last 2 quantity rows (i.e., 0.25, 0.5, 9.5, 9.75, 10).
- Opening an existing 0.25 value triggers a state mismatch — visual position vs derived index disagree.
- The I1 R1 fix's new tests are FALSE-GREEN — only a middle-row scroll is exercised, masking the boundary defect.
- The Round 1 fix is structurally incomplete: it wires `onScroll → onChange` but doesn't account for top/bottom padding sentinels needed to allow boundary rows to physically center.

**Codex recommendation (verbatim):**
> Add top and bottom spacer padding/sentinel rows equal to half the viewport minus half an item, adjust the scroll-index formula accordingly, and add boundary tests for first/last options plus opening an existing min/max value.

**Round 1 verification status:** REGRESSED — I1 was nominally fixed, but the fix is incomplete and introduces a new boundary-row defect unmasked by the new behavior.

---

## Improvement

### I-R2-1 — Framer reduced-motion path ignores the app-level setting override
**File:** `lib/motion/defaults.ts:144-207`

**Codex finding (verbatim):**
> The migrated motion consumers rely on the raw Framer `useReducedMotion` re-export. That only reflects the OS media query, while the app already has an explicit Settings toggle that writes `localStorage['kalori.reduce-motion']` and `html[data-reduce-motion='1']` to disable transitions across the app. CSS animations are mirrored for that override, but LogFlowModal, WizardShell, MobileWheelSheet, and MobileWheelPicker will still run Framer animations/smooth scroll when the user enables the in-app setting with OS no-preference. This regresses the existing accessibility contract documented in ReduceMotionToggle and network-state.

**Why this is Improvement (high) not Critical:**
- A11y regression for users who rely on the in-app toggle WITHOUT OS-level reduced-motion preference set — likely a small but real user segment.
- Pre-existing accessibility contract: ReduceMotionToggle component writes `kalori.reduce-motion` localStorage + `html[data-reduce-motion='1']` attribute. CSS-side animations honor this; Framer-side animations introduced by Bug 3 do not.
- Affects all new Framer consumers introduced by this batch (LogFlowModal, WizardShell, MobileWheelSheet, MobileWheelPicker).

**Codex recommendation (verbatim):**
> Expose an effective reduced-motion hook from the motion layer that ORs Framer/OS preference with the Kalori settings override and subscribes to the existing `kalori:reduce-motion-change` event, then use it in `useReducedMotionVariants` and all new motion consumers. Add a test that toggles the app setting without mocking OS reduced motion.

**Round 1 connection:** Pre-existing Bug 3 design issue — not introduced by R1 fixes, but surfaced now that Codex inspected the Framer-Motion infrastructure rigorously in R2.

---

## Minor

(none)

---

## Round 1 Findings — Verification Status

- **C1 (LogFlowModal centering):** verified-clean — Codex did not flag the wrapper/animator split or sibling-gap mirror; the fix landed correctly.
- **C2 (LibraryTab wheel sheet):** verified-clean — Codex did not flag the new MobileWheelSheet render block, the IIFE pattern, or the strengthened end-to-end tests; the fix landed correctly.
- **I1 (MobileWheelPicker touch-scroll):** REGRESSED — the I1 fix wired `onScroll → onChange` but exposed (or failed to address) a boundary-row scroll-math defect (C-R2-1 above). The fix's new tests are false-green.

---

## Codex coverage assessment

- Codex SAW the fix files: it diffed `LogFlowModal.tsx`, `LibraryTab.tsx`, `MobileWheelPicker.tsx`, and reviewed `lib/motion/defaults.ts` directly.
- Codex correctly understood C1/C2/I1 were R1 fixes — it explicitly framed C-R2-1 as "the wheel fix still leaves real mobile touch paths unable to select boundary quantities" (i.e., it knew the wheel was just-fixed and was probing the fix's completeness).
- Codex correctly flagged the false-green test in I1 as the test only covering a middle-row scroll — confirming the verification mandate landed.
- Coverage of cross-fix interactions: Codex did review LibraryTab + MobileWheelPicker interaction; the wheel-boundary defect WILL impact LibraryTab quantity editing (boundary 0.25 / 10 selections).
- Coverage of the rest of the batch (Bugs 1, 2, 5): Codex did NOT surface findings on these, suggesting they passed the adversarial pass cleanly OR were de-prioritized in favor of the higher-impact wheel + reduced-motion findings.
