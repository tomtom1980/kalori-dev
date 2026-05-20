# Codex Round 1 — Categorized Findings

Source: `planning/.tmp/bugfix-2026-05-17-mobile-bottom-nav/codex/round-1.md`
Reviewer: bugfix-tomi round-1 sub-agent (Phase 4)
Verdict from Codex: `needs-attention` (1 medium finding)

## Critical
_(none)_

## Improvement

### I-1 — Bottom-tab `color` does not flip to ivory on `:focus-visible` for inactive tabs (§6.4 Focus row)

- **File:** `components/nav/bottom-tab-bar.tsx`
- **Lines:** 73-89 (Codex flagged); root cause at line 74 (`color: active ? 'ivory' : 'dust'` — no `:focus-visible` branch)
- **Codex verbatim:** "The link color is derived only from route activity, and the new Lucide icon inherits that color via currentColor. There is no focus-visible branch or class here, so keyboard focus on an inactive bottom-tab keeps both icon and label in dust, while ui-design.md §6.4 requires the Focus state to use ivory icon/label with an ivory outline. The added tests never focus an inactive tab, so this contract gap can ship unnoticed. Recommendation: Add an explicit focus-visible state for bottom-tab link/icon color and cover it with a regression test that focuses an inactive tab against the §6.4 focus contract."
- **Sub-agent's review notes (for main agent to weigh during auto-fix dispatch):**
  - The §6.4 Focus state has TWO requirements: (a) 2px ivory outline + 2px offset, AND (b) icon/label color → ivory.
  - Requirement (a) IS satisfied by the universal `:focus-visible` rule in `app/globals.css:298-301`, which paints a 2px ivory outline + 2px offset on every interactive surface. Codex didn't note this.
  - Requirement (b) — the color flip — is NOT satisfied. Inline `color` only branches on `active`. On keyboard focus of an inactive tab, both label and icon stay `dust`.
  - **Parity check:** `components/nav/sidebar.tsx` (the desktop consumer of the same `PRIMARY_DESTINATIONS` array) has the IDENTICAL pattern — `color: active ? ivory : dust` with no focus-state color override. So the bottom-tab implementation is consistent with the existing Sidebar precedent. The gap is real but pre-existing across the nav family, not introduced by this batch.
  - **A11y impact:** outline visible → user can locate focus → WCAG 2.4.7 PASS, 1.4.11 PASS (ivory outline contrast 16.67:1 vs bg-0). The missing color flip is a §6.4 *visual design* requirement, not an a11y blocker.
  - **Recommended action — main agent to choose:**
    1. Fix in this batch: extend `components/nav/bottom-tab-bar.tsx` Link style with a `kalori-bottom-tab` className + scoped `:focus-visible { color: var(--color-ivory) }` rule in `app/globals.css`, and add a 7th test that mounts the bar, focuses an inactive tab via `tab.focus()`, asserts computed color is ivory. Adds ~10 LOC + 1 CSS block + 1 test. Stays inside the batch's "fix the §6.4 contract gap" scope.
    2. Defer to a follow-up batch covering BOTH Sidebar and BottomTabBar at once: cleaner because the existing Sidebar drift is identical and a single auto-fix sub-agent can land the same scoped class pattern across both surfaces. Risk: this batch ships with one nav surface still drifting from §6.4 even after Codex flagged it — open audit residual.
  - **My recommendation as round-1 reviewer:** Option 1 (fix in batch). The Codex finding is valid for this batch's scope ("§6.4 icon column per state table") — the icon column landed, but the state-row for Focus is the column's third row and is genuinely missing for the keyboard pathway. Fixing it here keeps the §6.4 ledger row green at batch close. Sidebar drift becomes a noted follow-up (`pending_minor_findings` entry) — Sidebar isn't this batch's surface.
- **Auto-fix dispatch target if main agent chooses Option 1:**
  - File set: `components/nav/bottom-tab-bar.tsx` + `app/globals.css` + `tests/components/nav/bottom-tab-bar.test.tsx`
  - Pattern: scoped className `kalori-bottom-tab` + globals.css block matching `.kalori-bottom-tab:focus-visible { color: var(--color-ivory); }` — mirrors the established `.kalori-confirmation-*` scoped-class pattern already used 20+ times in globals.css for inline-style components needing pseudo-selector reach.

## Minor
_(none)_

## Codex meta
- **Auto-retry signals detected?** No. Scanned verbatim output for: "Input exceeded 1MB", "Retrying with tighter scope", "production files only", "spec context trimmed" — none present.
- **Diff size (scoped to 3 nav files):** 11.4 KB (well under 500 KB budget). Total uncommitted diff including out-of-scope sibling batches: 64.6 KB (still under 500 KB).
- **Review wall-clock:** ~60-90s (Codex thread ID `019e325c-0221-7b11-930f-29ec10d7d14f`).
- **Working tree note:** uncommitted changes from sibling batches (FoodDetailMacros, ConfirmationScreen, micros-rda-resolver, i18n) were visible to Codex but the focus prompt scoped attention to the 3 nav files. Codex respected scope — its single finding is on the in-scope `components/nav/bottom-tab-bar.tsx`.
- **Lucide alias risk (LineChart export, raised in implementation notes):** Codex did NOT flag this. Verified in `node_modules/lucide-react/dist/lucide-react.d.ts` — `LineChart` is exported as `ChartLine as LineChart`, so the alias is current-version-stable. Not a finding.
- **Sidebar break risk (new required `icon` field on shared type):** Codex did NOT flag this. Sidebar destructures only `{href, label, testId}`, ignores `icon`. TypeScript structural typing permits the added required property without breaking consumers. Not a finding.
