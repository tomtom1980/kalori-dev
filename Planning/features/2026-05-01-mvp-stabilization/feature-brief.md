# Feature Brief — MVP Stabilization Sprint

**Purpose:** 1-page sprint summary readable in 2 minutes by anyone joining the project.
**Who reads this:** Anyone joining or resuming the sprint who needs the quickest possible orientation. The first artifact a new orchestrator or sub-agent should open.
**Authoritative source:** `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` (1002 lines). When this brief disagrees with the design doc, the design doc wins.

---

## Sprint identity

| Field | Value |
|---|---|
| **Name** | MVP Stabilization Sprint |
| **Slug** | `mvp-stabilization` |
| **Mode** | Feature Addition (Complex FA, brownfield-skip with override) |
| **Complexity tier** | Complex FA — ~22 implementation tasks / ~30–33 total cards across 5 phases |
| **Dates** | Created 2026-05-01; budget ~3 weeks (~18–21 days) |
| **Folder** | `Planning/features/2026-05-01-mvp-stabilization/` |
| **State file** | `brainstorm-state.md` (currently `artifacts_complete`) |
| **Tasks file** | Root `Planning/tasks.md` (sprint section, each task carries `Folder:` metadata) |

---

## Problem statement

Per design-doc §2 + manifest. Manual smoke at end of Task 5.4 (Phase 5 close) surfaced 11 user-visible bugs in `bugs/issuelog.txt`. In parallel, `Planning/followups.md` carries ~76 still-open deferred residuals from execution Phases 1–5 (a11y, API contract, offline modal honesty, schema-drift guard, GH Actions Node 20 deprecation, library duplicate-insert prevention, etc.). The MVP cannot soft-launch until the user-facing P0/P1 bugs are fixed and the load-bearing P1/P2 followups close. This sprint covers all P0+P1 issuelog entries + 9 selected followups + verification-found gaps + Phase 5.x Codex deferrals to reach soft-launch readiness.

---

## Scope summary

**In scope (35 task cards across 5 phases):**
- 11 issuelog.txt bugs — all in scope, mapped to user stories US-STAB-A1..D6 (3 P0, 7 P1, 1 P2 rolled into B4)
- 9 selected `followups.md` entries — escalated P0/P1 + scheduled P2 hardening
- Verification-found bugs (TBD post-Phase-A; minted as US-STAB-C4..C? at Phase A close)
- Phase 5.x Codex deferrals (already covered via the 9 followups — F-OFFLINE-5.1.5-* derives from Phase 5.1.5 Codex F2/F3)

**Deferred (post-MVP cleanup tracker):**
- ~67 entries from `Planning/followups.md` — broken into 5 P3 polish clusters (`F-MINOR-5.2-*`, `F-UI-3.4-*`, `F-UI-3.5-*`, `F-UI-4.1-*`, `F-UI-4.3a/b-*`) + ~10 P3 individual items + ~10 P4 cleanup items
- Status mark: `Status: DEFERRED-soft-launch (revisit post-MVP)` per D6

---

## Phase plan summary

| Phase | Theme | Days | Key deliverables |
|---|---|---|---|
| **A** | Unblockers + Verify Dispatch | 3 | 3 P0 fixes (library save, sidebar identity, orphan-profile fence) serial; 6 sub-agent verification fan-out parallel; verification-report.md artifact |
| **B** | P1 Single-File Patches | 4–5 | 6 stories B1–B6 in 3 themed parallel waves (B-Nav / B-Forms / B-Settings) |
| **C** | P1 Feature Completion | 5–6 | 2–3 net-new feature surfaces — micros/RDA panel (Complex), Library CRUD UI (Complex), C4+ from verification |
| **D** | Hardening | 4–5 | 6 stories — a11y, API 401 contract, F10 modal honest copy verify, schema-drift CI guard, Node 24 GH Actions runtime, lib dedup migration 0018 |
| **E** | Closure | 2 | Manual smoke + issuelog re-check + prod migration cutover (0018) + FINAL-US + sprint state flip |

Total: ~33 cards including phase-mandatory (10 = Codex+Sweep×5) + per-phase user-story-e2e cards (~3).

---

## 20 user stories

| ID | One-liner |
|---|---|
| **US-STAB-A1** | Library save on new-item creation — issuelog #4 (P0) |
| **US-STAB-A2** | Sidebar identity shows real Gmail in prod, not "dev user" — issuelog #9 (P0) |
| **US-STAB-A3** | Orphan-profile dashboard read fence — F-SEC-2026-04-25-* (P0); 302 to /onboarding |
| **US-STAB-A-VERIFY** | 6-sub-agent AC-by-AC verification dispatch (non-implementation meta) |
| **US-STAB-B1** | Authed users redirect from `/` to `/dashboard` — issuelog #1 (P1) |
| **US-STAB-B2** | New-item form clears after successful save — issuelog #3 (P2) |
| **US-STAB-B3** | Sidebar "Navigation" header is non-interactive heading — issuelog #8 (P3) |
| **US-STAB-B4** | Progress page weight quick-add + RSC `router.refresh()` — issuelog #11 + F-WEIGHT-QUICK-ADD-RSC-REFRESH (P1) |
| **US-STAB-B5** | Site-wide nav audit closes 404s/orphans — issuelog #6 (P2) |
| **US-STAB-B6** | Settings stub copy removed (patch-shaped) — issuelog #7 (P1) |
| **US-STAB-C1** | Micros + RDA on AI prompt + dashboard panel — issuelog #2 (P1, Complex) |
| **US-STAB-C2** | Library CRUD UI (list/edit/delete/log-now) — issuelog #5 + #10 (P1, Complex) |
| **US-STAB-C3** | RESERVED, EMPTY (DT-1 — B6 stays patch-shaped) |
| **US-STAB-C4..C?** | TBD post-Phase-A from verification report |
| **US-STAB-D1** | Dashboard a11y violations resolved — F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS (P1) |
| **US-STAB-D2** | API returns JSON 401 (no HTML redirect) — F-API-401-VS-HTML-REDIRECT (P2) |
| **US-STAB-D3** | F10 conflict modal honest-copy verify + AC4 handler-binding regression guard (P2) |
| **US-STAB-D4** | Schema-drift CI guard (fixtures + lib/** + app/api/**) — F-UI-3.7-SCHEMA-DRIFT-GUARD (P1) |
| **US-STAB-D5** | Node 24 GH Actions runtime migration — F-DEP-1 (P2, deadline 2026-06-02) |
| **US-STAB-D6** | F-LIB-DEDUP partial unique index migration 0018 (P2) |
| **US-STAB-E1** | Phase E manual smoke + prod cutover (0018; 0019 deferred) |

---

## Closure signal — what "soft-launch ready" means

Per design-doc §13 closure criteria. The sprint closes when ALL 12 numbered criteria pass:
- All 11 issuelog entries closed with post-fix screenshot evidence + diff against verification-report.md (every Pass/Fail flips to Pass)
- All 9 in-scope followups marked `RESOLVED-2026-05-XX` with commit hash
- Migration 0018 applied to kalori-prod via `scripts/apply-prod-migrations.mjs` (0019 deferred)
- FINAL-US runs every `tests/e2e/web/user-stories/US-STAB-*.spec.ts` GREEN (2 fix rounds capped)
- Phase E Testing Sweep FULL GREEN: Vitest + Playwright + axe + Lighthouse mobile ≥0.91 + AI accuracy 30/30 + RLS 32-assertion harness
- Phase E Codex Review OK
- All sprint task entries `✅ Completed`; sprint `state = complete`

If any criterion fails, sprint stays open and orchestrator surfaces the gap to the user.

---

## Out of scope (deferred to "post-MVP cleanup" tracker)

- 5 P3 polish clusters: `F-MINOR-5.2-*`, `F-UI-3.4-*`, `F-UI-3.5-*`, `F-UI-4.1-*`, `F-UI-4.3a/b-*`
- ~10 P3 individual items
- ~10 P4 cleanup items
- Migration 0019 (`profiles.micros_rda_override`) — deferred per DT-5 / O-2 (single-user MVP doesn't need per-user override day-1; tracked as `F-MICROS-RDA-OVERRIDE-COLUMN`)
- Migration 0020 — RESERVED, NOT USED (D3 honest-copy-only scope-down means no offline-conflict-resolver server-side state needed; full client-wins-resubmit impl remains under existing `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`)

---

## Pointers to other sprint artifacts

| Artifact | Purpose |
|---|---|
| `design-doc.md` | Authoritative tiebreaker — 14 sections, 1002 lines |
| `manifest.md` | Sprint metadata + Q1–Q10 + Approach 3 locked decisions table |
| `brainstorm-state.md` | Current sprint state (`artifacts_complete` at end of Step 6.7) |
| `brainstorm-context/01-pre-design.md` | Pre-design Q&A transcript + project exploration findings |
| `brainstorm-context/02-pre-plan.md` | Pre-plan checkpoint — Step 6 sub-agent reads this first |
| `impact-analysis.md` | Per-bug code/module/test impact map (companion to per-task `Reads:` field) |
| `migration-plan.md` | Migration 0018 spec + apply order + rollback + cutover runbook |
| `design-system-snapshot.md` | UI direction continuity confirmation + sprint-specific UI delta |
| `testing-strategy.md` (sprint) | Per-phase test contracts on top of project `Planning/testing-strategy.md` |
| `failure-analysis.md` | 10 failure modes + 9 invariants + 3 adversarial reviewer perspectives + sprint-execution orientation |
| `verification-report.md` | Phase A output (written at execution time, not now) |
| `acceptance-evidence/task-<id>.md` | Per-Complex-task evidence (Full tier per D4) |

Project-level pointers: `Planning/PRD.md`, `Planning/architecture.md`, `Planning/ui-design.md`, `Planning/testing-strategy.md`, `Planning/design-doc.md` (project-level — beats sprint design doc on disagreement).

---

End of brief.
