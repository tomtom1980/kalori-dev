# Codex Round 1 — Categorized Findings

**Verdict:** needs-attention (no-ship)
**Source:** `Planning/.tmp/bugfix-2026-05-08-mobile-ui-overhaul/codex/round-1.md` lines 96-117 (verbatim Codex output)
**Pre-flight:** working-tree diff, 18 production files, ~82 KB after noise exclusion (lockfile, screenshots, sw.js, next-env.d.ts excluded). Under 500 KB → invoked as-is.
**Auto-retry signals:** none detected (`Input exceeded 1MB`, `Retrying with tighter scope`, `production files only`, `spec context trimmed` all absent).

---

## Critical

### C1. Log modal centering is overwritten by Framer transform

- **File / lines:** `app/(app)/log/_components/LogFlowModal.tsx:114-115`
- **Bug origin:** Bug #3 (motion infrastructure migration)
- **Severity reason:** USER-VISIBLE REGRESSION on the primary log flow (food entry) on mobile. The `m.div` animates `y`, which means Framer Motion takes ownership of the element's inline `transform` style. The dialog still relies on `.kalori-log-content { top:50%; left:50%; transform: translate(-50%, -50%) }` for centering — Framer's animated `transform` clobbers that centering and the modal renders anchored at the viewport midpoint corner instead of centered. The implementation sub-agent's open concern flagged this exact stacking risk; Codex confirms it is real, not theoretical.
- **Codex recommendation:** Change motion structure so Framer does not overwrite the centering transform — animate a child/wrapper that doesn't own the fixed-position centering. Add a browser-level assertion that the dialog bounding box remains centered after animation settles.

### C2. Library mobile quantity trigger never opens a picker

- **File / lines:** `app/(app)/log/_components/LibraryTab.tsx:524-528`
- **Bug origin:** Bug #4 (wheel picker integration into LibraryTab — the self-added scope expansion)
- **Severity reason:** FEATURE-BREAKING. The mobile branch renders a `library-quantity-wheel-trigger-*` button and sets `wheelOpenForId`, but the file never reads `wheelOpenForId` to render either `MobileWheelSheet` or `MobileWheelPicker`. Codex's `rg` confirms: only the imports, state declaration, setter helper, and click handler exist — no consumer of the state. On mobile, the desktop number input is hidden, so **LibraryTab loses quantity editing entirely**. The "integration" test merely checks the trigger button exists — it never clicks it and observes a sheet opening. This is exactly the kind of false-green test that Quick-Pick / sub-agent self-flagging warned about, and it shipped.
- **Codex recommendation:** Render the wheel sheet for the active item; add a mobile consumer test that clicks the Library trigger, observes the listbox, changes the value, clicks Done, and verifies the selected quantity updates.

---

## Improvement

### I1. Wheel picker ignores the primary touch-scroll interaction

- **File / lines:** `components/primitives/MobileWheelPicker.tsx:239-247`
- **Bug origin:** Bug #4 (MobileWheelPicker primitive itself)
- **Severity reason:** PRIMARY GESTURE MISSING. The picker creates an overflow scroll-snap list, but the `<ul>` only wires `onKeyDown`; rows only change value through explicit click. There is no `onScroll`, `scrollend`, pointer-up, or snap-position calculation that calls `onChange` after a swipe. A mobile user can scroll the wheel visually, tap Done, and still commit the stale `wheelDraft` (because `wheelDraft` only updates on key/click, not on scroll-snap). Existing tests cover keyboard + row click — no scroll/swipe-then-Done assertion exists. The whole point of building a "wheel picker" instead of a `<select>` was native-feel touch scrolling; without snap-end detection the primitive offers no advantage over a regular listbox.
- **Codex recommendation:** Implement snap-end value detection for scroll/touch interaction; cover it with a test that scrolls the list, waits for snap/end handling, and asserts `onChange` receives the centered option.

---

## Minor

*(none surfaced by Codex in this round)*

---

## Codex coverage assessment

- **Bugs reviewed:**
  - Bug #1 (mobile-responsive layout) — implicitly covered (read globals.css, dashboard, MealsBulletin via diff). No findings → considered clean by Codex.
  - Bug #2 (nav labels i18n) — implicitly covered (read en.ts diff). No findings.
  - Bug #3 (motion infra) — covered with C1 against `LogFlowModal.tsx:114-115`. The `WizardShell` migration was NOT separately flagged (Codex either deemed it safe or did not deep-dive; WizardShell does not have the same `position: fixed` centering coupling, so silence here is plausible).
  - Bug #4 (wheel picker) — covered with C2 against `LibraryTab.tsx:524-528` and I1 against `MobileWheelPicker.tsx:239-247`. ConfirmationScreen integration NOT flagged — coverage gap or considered correct.
  - Bug #5 (dual FAB) — NOT flagged. None of the implementation sub-agent's self-flagged concerns (z-index obscuring tabs at 360px, water FAB no-op on `/dashboard`, bg-1 ground vs bar ground contrast) were corroborated as ship-blocking by Codex. Either Codex deemed them acceptable or coverage was thinner here.
- **Diff visibility:** Full — no auto-retry signals, no scope trimming. Codex executed `git diff --stat`, `git diff <path>` per file, and grep'd for usage patterns (e.g., `wheelOpenForId`, `MobileWheelSheet`).
- **Cross-bug interactions:** Codex did NOT explicitly flag the nav-shell.tsx Bug #1+#5 cross-touch or the ui-design.md Bug #4+#5 cross-edit. No conflicts found, but this is silent inference (no positive "checked and clean" statement).
- **TDD discipline:** Codex did NOT do a structured RED-first sample-verify. It DID identify a false-positive test in C2 (the LibraryTab integration test passes by accident — the trigger button exists but nothing it triggers exists), which is a TDD-discipline failure surfaced indirectly.
- **Token drift / reduced-motion / a11y addendum:** Not separately reported as findings. Either clean or under-scrutinized — the wheel-picker scroll defect (I1) implies reduced-motion handling was not deeply audited beyond the structural gap.

**Round 1 outcome:** 2 Critical + 1 Improvement. Two-round cap policy: auto-fix sub-agent must address C1, C2, I1 before round 2 verification. No deferral candidates surfaced.
