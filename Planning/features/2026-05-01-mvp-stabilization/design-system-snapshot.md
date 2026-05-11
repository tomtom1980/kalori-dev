# Design System Snapshot — MVP Stabilization Sprint

**Purpose:** Snapshot of the design system state at sprint start, plus the (small) sprint-specific UI delta. Most of this artifact is "use what already exists; here is what is NEW."
**Who reads this:** UI-track sub-agents on stories US-STAB-A2, B1–B6, C1, C2, D1, D3 (any story whose Type tags include `[UI]`).
**Authoritative sources:**
- Project-level UI: `Planning/ui-design.md` (3145 lines — design tokens, 9 primitives + 6 compound + 4 headless components, accessibility rules)
- Project-level direction: `Planning/design-doc.md` ("The Ledger" direction locked at project brainstorm)
- Sprint design (this sprint's tiebreaker): `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §6
- WCAG focus-ring decision: project ux-auditor correction (IVORY 2px, NOT oxblood — oxblood 2.28:1 fails WCAG 2.5.8)

When this snapshot disagrees with `Planning/ui-design.md`, the project ui-design wins. When the sprint design doc §6 disagrees with this snapshot, the sprint design doc wins.

---

## Direction continuity confirmation (LOCKED — no deviations this sprint)

Per design-doc §6, sprint design direction is **"The Ledger"** — locked from project brainstorm at project start; no sprint-level mockup pipeline (Q8=A). Zero deviations. Every UI-track sprint task fixes existing components in their existing visual treatment — NO redesign.

---

## Design tokens — quick reference

(Detailed authoritative list in `Planning/ui-design.md` §3 Design Tokens. Summary only here.)

| Token category | Value (sprint-stable) |
|---|---|
| **Background** | warm near-black `#0E0A08` (`bg`) |
| **Foreground / text** | ivory `#F4EBDC` (`fg`) |
| **Primary action** | oxblood `#8A2A1F` (`primary`) |
| **Sand (secondary text)** | per `ui-design.md` token map |
| **Hairline rule** | per `ui-design.md` token map |
| **Display + heading typeface** | Newsreader (serif) |
| **Body typeface** | Inter (sans) |
| **Numeric typeface** | JetBrains Mono (tabular-nums for `% of RDA`, weights, calories) |
| **Letter spacing for label uppercase** | `0.22em` (per `ui-design.md` panel chip pattern) |
| **Border radius** | `0` everywhere (zero-radius — no rounded corners except square FAB exception) |
| **Shadows** | NONE (no elevation shadow allowed) |
| **Focus ring** | IVORY 2px outline + 2px offset (NOT oxblood — WCAG 2.5.8 corrected per ux-auditor) |

No new token may be added by any sprint task. If a sprint task discovers a missing token, it is a P1 escalation to the user.

---

## Component patterns — quick reference

| Layer | Source | Sprint policy |
|---|---|---|
| **9 primitives** | `Planning/ui-design.md` §13 (Button, Input, Select, Modal, Card, Badge, Chip, Toast, Tooltip) | No new primitives. Existing primitives may be re-styled ONLY if a sprint AC explicitly requires it (none does). |
| **6 compound components** | `Planning/ui-design.md` §13 | No new compound components in this sprint. |
| **4 headless components** | `Planning/ui-design.md` §13 (focus traps, etc.) | No new headless components in this sprint. |
| **Accessibility rules** | `Planning/ui-design.md` §A11y | Sprint task US-STAB-D1 audits dashboard; AC1 enforces zero axe violations. |
| **RSC / Client / Split** | 27 / 38 / 14 (per `ui-design.md`) | Sprint adds work within existing pattern; new mutation routes go through R1 firewall (per design-doc §9 + §10 invariants). |

---

## Sprint UI work scope — components touched

Per design-doc §14 per-task `Reads:` field + §6 net-new UI elements. Approximate file map of UI-track sprint work:

**Existing components that get patched (no redesign):**
1. `app/(marketing)/page.tsx` — root redirect logic for authed users (US-STAB-B1)
2. `components/SidebarIdentity.tsx` (or equivalent identity row component, per `Planning/ui-design.md` sidebar identity row spec) — Gmail address rendering + empty-email fallback (US-STAB-A2)
3. `components/Sidebar.tsx` (or equivalent sidebar shell) — "Navigation" header non-interactive heading semantics (US-STAB-B3)
4. `components/library/LibraryNewItemForm.tsx` (or equivalent) — clear-after-save behavior + focus management (US-STAB-B2)
5. `components/library/Library*.tsx` — list, detail, edit modal, delete confirmation, "Log Now" CTA (US-STAB-C2)
6. `components/library/LibraryCreate*.tsx` (or equivalent) — persists to `food_library_items` (US-STAB-A1)
7. `components/dashboard/DashboardMacrosPanel.tsx` (or equivalent) + new sibling `DashboardMicrosPanel.tsx` (US-STAB-C1)
8. `components/dashboard/Dashboard*.tsx` — a11y violations + IVORY focus ring + chart aria-labels (US-STAB-D1)
9. `components/progress/ProgressWeightQuickAdd.tsx` (or equivalent) — inline weight quick-add + `router.refresh()` (US-STAB-B4)
10. `components/pwa/GoalWeightConflictModal.tsx` — verification only (existing implementation already correct per Phase 5.1.5 Codex F2/F3); AC4 binding regression test added (US-STAB-D3)
11. `app/(app)/settings/page.tsx` + `lib/i18n/en.ts:769-770` — delete stub copy (US-STAB-B6, patch-shaped per DT-1)
12. `components/Settings*.tsx` (`ReduceMotionToggle`, `DataSubsection`, `AccountSubsection` already mounted — regression check only)
13. Sidebar/topbar/footer link audit (US-STAB-B5 via `scripts/nav-audit.mjs` — not a UI patch but a static analysis)
14. Canonical 404 page component (`app/not-found.tsx` or equivalent) — verified renders (US-STAB-B5 AC3)

(File paths above are estimates; per-task `Reads:` field at execution time confirms exact paths.)

---

## Sprint-specific NEW UI elements

Per design-doc §6. Only TWO net-new UI elements in the sprint, and both follow existing patterns:

### NEW 1 — Micros / RDA dashboard panel (US-STAB-C1)

**Layout decision (per design-doc §6):** follow the existing Macros panel structure — same panel pattern that renders Carbs / Protein / Fat is the closest existing analog for `% of RDA` chips.

**Per-micronutrient chip render spec:**
- Name in Inter, sans body, uppercase, letter-spacing `0.22em`
- `% of RDA` value in JetBrains Mono, tabular-nums; oxblood foreground when ≥90%, sand otherwise
- Hairline rule between chips (matches existing Macros panel)
- Empty-state per `Planning/ui-design.md` empty-state pattern when sparse data (AC5 of US-STAB-C1) — NOT a chart with 0% for all 30 micros

**Mini-mockup decision:** deferred to per-task design at execution time IF layout iteration warrants. The sprint commits the panel structure (parallel to Macros panel) but not the exact pixel rhythm.

**Source of truth for the micronutrient list:** `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (~30 entries, FDA + WHO baseline-derived, per DT-8). The AI prompt and the dashboard both read from this constant. Per-user RDA override DEFERRED (DT-5 / O-2).

### NEW 2 — F10 conflict modal honest CTAs (US-STAB-D3)

**Already implemented per Phase 5.1.5 Codex F2/F3.** The modal at `components/pwa/GoalWeightConflictModal.tsx` already ships:
- Cancel button on the LEFT, "USE CURRENT VALUE" on the RIGHT
- ESC = Cancel = non-destructive close
- `aria-modal="true"`, `role="alertdialog"`, scrim-click-disabled
- Initial focus on Cancel

**Sprint-introduced delta:** AC3 (i18n regression guard — no deprecated "USE OFFLINE VALUE" string) + AC4 (handler-binding regression test — Cancel calls `handleCancel`, USE CURRENT VALUE calls `handleUseCurrent`, distinct functions, never swapped).

**No new UI structure.** Pure regression-prevention contracts on the existing component.

---

## Sprint UI fragments folder

Per manifest + design-doc §6: `Planning/features/2026-05-01-mvp-stabilization/ui-design-fragments/` reserved for per-component specs IF execution warrants. Empty at design time.

---

## Direction continuity — what to NEVER touch

Per design-doc §6 + project ui-design.md §3. Across all sprint tasks the following must remain unchanged:

| Element | Locked value |
|---|---|
| Background color | warm near-black `#0E0A08` |
| Primary action color | oxblood `#8A2A1F` |
| Foreground color | ivory `#F4EBDC` |
| Display typeface | Newsreader |
| Body typeface | Inter |
| Numeric typeface | JetBrains Mono |
| Border radius | `0` (zero) |
| Shadow | none |
| Focus ring | IVORY 2px outline + 2px offset |

Any sprint task that proposes deviating from these values is a P1 escalation to the user — NOT an autonomous design decision.

---

End of design system snapshot.
