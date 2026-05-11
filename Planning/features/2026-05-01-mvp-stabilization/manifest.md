# MVP Stabilization Sprint

**Mode**: FA
**Complexity**: Complex FA
**Created**: 2026-05-01
**Status**: planning

## Description

Post-build pre-soft-launch remediation sprint for the Kalori MVP. Manual smoke (Task 5.4 Step 11) surfaced 11 user-visible bugs in `bugs/issuelog.txt`; `Planning/followups.md` tracks ~76 still-open deferred residuals from execution Phases 1–5. This sprint covers all P0 + P1 user-facing items + selected P2 hardening (dashboard a11y, auth API 401 shape, F10 conflict-modal honesty, Node 20 deprecation, schema-drift CI guard, library duplicate-insert prevention) to reach soft-launch readiness in ~3 weeks across 5 phases (Unblockers + Verification → P1 Patches → P1 Features → Hardening → Closure).

## Key Artifacts (sprint-scoped)

| Artifact | Path | Owner step | Status |
|---|---|---|---|
| manifest.md | this file | Phase 0f folder creation | ✅ written |
| brainstorm-state.md | sprint folder | Phase 0f | ✅ written |
| brainstorm-context/01-pre-design.md | sprint folder | Step 4.6 | ✅ written |
| brainstorm-context/02-pre-plan.md | sprint folder | Step 5.5 | pending |
| feature-brief.md | sprint folder | Step 6.7 | pending |
| impact-analysis.md | sprint folder | Step 6.7 | pending |
| migration-plan.md | sprint folder | Step 6.7 (schema/API change) | pending |
| design-system-snapshot.md | sprint folder | Step 6.7 (UI gate yes) | pending |
| testing-strategy.md | sprint folder | Step 6.7 (Medium/Complex FA) | pending |
| failure-analysis.md | sprint folder | Step 6.7 (Complex FA) | pending |
| design-doc.md | sprint folder | Step 5 | pending |
| tasks.md | root `Planning/tasks.md` w/ `Folder:` metadata | Step 6 | pending |
| verification-report.md | sprint folder | Phase A execution time | pending (post-brainstorm) |

## Brownfield Engagement

**Skipped — user override (Q3, 2026-05-01).**

### Override reason

Project already has 7 Complex-tier planning artifacts (PRD, architecture, design-doc, ui-design, tasks, testing-strategy, progress.md) and one project-level CHANGELOG.md, all maintained continuously across 5 execution phases with detailed per-task progress tracking + commit-by-commit Codex review history. Just-completed Task 5.4 sweep verifies baseline (Vitest 1725/1725 GREEN, branch coverage 70.85% above 70 threshold, Playwright + axe GREEN, Lighthouse mobile ≥0.91 all categories, AI accuracy 30/30, all 17 prior migrations applied to kalori-prod). Per-task impact analysis happens naturally via `superpowers-exec-tomi` `Reads:` field at execution time. Re-running formal Phase 0f sub-agents would re-derive ~90% already-known context.

### Compensating controls

- Per-task Codex review for Medium + Complex tasks (D8)
- Phase A verification report's per-feature × per-AC matrix surfaces unknown cross-cutting impacts
- Per-phase Codex Adversarial Review at every phase close
- Per-task `Reads:` field briefs each execution sub-agent on relevant project artifacts

## Locked Decisions (Q1–Q10 + Approach)

| # | Question | Answer |
|---|---|---|
| Q1 | "MVP usable" acceptance bar | Soft-launch B (P0+P1+selected P2+Node 20; defer P3 polish + P4) |
| Q2 | Structural shape | Dated FA folder pattern (this folder) |
| Q3 | Brownfield engagement | Skip with explicit override (this section) |
| Q4 | Verification timing | Parallel-first Day 1 dispatch (~6 sub-agents) |
| Q5 | Phase structure | 5-phase split (A / B / C / D / E) |
| Q6 | Verification depth | AC-by-AC re-check, all 19 PRD features |
| Q7 | Migration policy | Per-task to dev, batch to prod at Phase E |
| Q8 | UI mockup treatment | Skip sprint-level mockups (Ledger direction locked from project brainstorm); per-task minis ad-hoc |
| Q9 | Phase E manual smoke | Issuelog re-check + light flow walkthrough (~1 day) |
| Q10 | Operational defaults D1–D10 | All locked (see brainstorm-state.md and 01-pre-design.md) |
| Approach | Implementation tactics | Approach 3 Hybrid (P0 serial, P1+ parallel within phases) |

## Coverage commitment

- All 11 issuelog.txt bugs in scope (mapped to user stories US-STAB-A1..E1)
- 9 selected followups.md entries in scope (escalated P0/P1 + scheduled P2 hardening)
- Verification-found bugs and Codex deferrals fold into Phase B/C/D at triaged tier
- ~67 deferred items (P3 polish + P4 cleanup) parked as future "post-MVP cleanup" followup tracker

## Phase plan

| Phase | Theme | Days | Tasks (est) | Tactics |
|---|---|---|---|---|
| A | Unblockers + Verification Dispatch | ~4 | 4 (3 P0 serial + 1 verification meta) | Serial P0; parallel verification sub-agents |
| B | P1 Single-File Patches | ~5 | 5–6 | 2–3 parallel impl sub-agents, themed bundles |
| C | P1 Feature Completion | ~7 | 3–5 | 1–2 parallel impl sub-agents |
| D | Hardening | ~5 | 6 | 2–3 parallel impl sub-agents, themed bundles |
| E | Closure | 1–2 | 1–2 | Serial single sub-agent for closure paperwork |

Total: ~21 days, ~19–23 tasks, ~20 user stories.

## Tasks location

Per CD1 (Source of Truth Map in `~/.claude/skills/brainstorm-tomi/SKILL.md`), feature tasks for THIS sprint live in **root `Planning/tasks.md`** with `Folder: Planning/features/2026-05-01-mvp-stabilization/` metadata on each task card. The root `tasks.md` is the canonical execution source for `superpowers-exec-tomi`. This folder holds the supporting artifacts (manifest, design doc, impact analysis, migration plan, testing strategy, failure analysis, feature brief, design system snapshot, brainstorm state, brainstorm context, verification report).

## Status field updates

- `planning` (now) → set at Phase 0f folder creation (this commit)
- `in-progress` → set when `superpowers-exec-tomi` picks up the first sprint task
- `complete` → set at Phase E closure when manual smoke + cutover passes
