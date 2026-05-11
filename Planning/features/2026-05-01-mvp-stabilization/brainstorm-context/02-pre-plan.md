# 02-pre-plan.md — MVP Stabilization Sprint Pre-Plan Checkpoint

**Written:** 2026-05-01
**Sprint:** mvp-stabilization
**Sprint position before this checkpoint:** `design_pqr_pass_codex_round_2_complete`
**Sprint position AFTER this checkpoint:** `design_complete` (about to enter Step 6 — plan writing)

This file captures everything the Step 6 plan-writing sub-agent (and any fresh agent resuming from this checkpoint) needs to write the sprint plan without access to the live conversation transcript. The Step 6 sub-agent MUST read this file FIRST, plus `design-doc.md`, plus optionally `01-pre-design.md`, before writing tasks.md additions.

---

## 1. Upstream Context

### Required reads (in this order)

1. **THIS FILE** — `Planning/features/2026-05-01-mvp-stabilization/brainstorm-context/02-pre-plan.md` (you're here)
2. **`Planning/features/2026-05-01-mvp-stabilization/design-doc.md`** — authoritative sprint design (1002 lines, post-Codex Round 2). Conflict tiebreaker for sprint artifacts.
3. **`Planning/features/2026-05-01-mvp-stabilization/manifest.md`** — sprint metadata + override decisions

### Optional reads (for deeper context, only if needed)

4. **`Planning/features/2026-05-01-mvp-stabilization/brainstorm-context/01-pre-design.md`** — Q&A transcript + project exploration findings (referenced when sub-agent needs to understand WHY a decision was made)
5. **`Planning/PRD.md`**, **`Planning/architecture.md`**, **`Planning/ui-design.md`**, **`Planning/testing-strategy.md`** — project authoritative docs (read targeted, not full)

## 2. Project Identity

Refer to `01-pre-design.md` Section 1. Copied here for self-containment:

- **Topic:** Post-build pre-soft-launch remediation sprint for Kalori MVP
- **Mode:** Feature Addition (Complex FA brownfield)
- **Project context:** Kalori — AI-first calorie/nutrition tracker (PWA, dark-only, single-user). Vietnamese nutrition primary, Western secondary. Stack: Next.js 16 + React 19 + TS strict + Tailwind v4 + shadcn/ui + Supabase + Gemini Flash + Vercel + Sentry. Production live at `https://kalori-one.vercel.app`. Direction "The Ledger" locked.
- **Sprint folder:** `Planning/features/2026-05-01-mvp-stabilization/`
- **Sprint state file:** `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md`
- **UI gate:** YES
- **Mockup pipeline:** SKIPPED (direction locked)
- **Brownfield engagement:** SKIPPED (user override, justified in manifest.md)

## 3. Decisions Finalized

### From Q1–Q10 (locked at questioning round close)

See `01-pre-design.md` Section 4 + `manifest.md` "Locked Decisions" table for the full Q&A transcript. Summary:

- Q1 Soft-launch B (P0+P1+selected P2+Node 24 deprecation; defer P3 polish + P4)
- Q2 Dated FA folder pattern (this folder)
- Q3 Skip Phase 0f Brownfield Engagement (user override + compensating controls)
- Q4 Parallel-first verification dispatch (6 sub-agents Day 1)
- Q5 5-phase split (A/B/C/D/E)
- Q6 AC-by-AC verification depth (all 19 PRD features)
- Q7 Per-task to dev, batch to prod at Phase E (existing project pattern)
- Q8 Skip sprint-level mockups (direction locked, per-task minis on demand)
- Q9 Phase E manual smoke = issuelog re-check + light walkthrough (~1 day)
- Q10 D1–D10 operational defaults locked
- Approach 3 Hybrid (P0 serial, P1+ parallel)

### From design-time decisions (DT-1..DT-10) — locked during Step 5 design doc writing

- **DT-1** Settings (US-STAB-B6) = patch-shaped — `app/(app)/settings/page.tsx` already renders real components; only stub copy at `lib/i18n/en.ts:769-770` needs deletion
- **DT-2** F10 modal (US-STAB-D3) = honest-copy-only — modal already shipped honest CTAs in Phase 5.1.5 Codex F2/F3 fixes; full client-wins-resubmit deferred to existing `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` followup
- **DT-3** Migration 0018 in scope (F-LIB-DEDUP partial unique index, with ACCESS EXCLUSIVE lock + SECURITY DEFINER per Codex N-C1 + N-I1)
- **DT-4** Migration 0019 DEFERRED (per O-2 over-engineering review — single-user MVP doesn't justify per-user RDA override day-1; logged as `F-MICROS-RDA-OVERRIDE-COLUMN`)
- **DT-5** Migration 0020 RESERVED (not used — D3 scope-down means no offline-conflict-resolver server-side state needed)
- **DT-6** Verification report column set confirmed (10 columns: Feature ID | AC ID | WHEN | THEN | Pass/Fail | Evidence Path | Bug ID | Severity | Area | Recommended Phase)
- **DT-7** Verification dispatch model: 6 sub-agents, `general-purpose`, `model: opus`, ~3 features each
- **DT-8** Micros/RDA single source of truth: `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` constant (~30 entries from FDA + WHO baseline)
- **DT-9** US-STAB-A2 AC4 added: empty-email Google scope fallback to `user_metadata.full_name`, else literal "Account"
- **DT-10** US-STAB-D3 AC4 added: distinct `onClick` handler regression guard

### From Codex Round 1 + Round 2 fixes (locked during Step 5.5)

Final design doc state at Codex gate close (1002 lines):

- **C1 fixed**: Migration 0019 deferral propagated across §3 Phase E gate, §7 migration table, §7 batch-to-prod, US-STAB-C1 AC3+AC4, US-STAB-E1 AC2, U-5 mitigation, Q7 implementation note, §11 Decision Summary, §10 P-5, §8 [project-sweep], closure criterion #4
- **C2 + N-C1 fixed**: Migration 0018 spec — `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE` held continuously through cleanup-then-index transaction; 7-step BEGIN/LOCK/.../COMMIT sequence; predicate `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`; 5 D6 ACs covering predicate, active-row violation, transactional cleanup, soft-deleted re-insert, RLS preservation
- **C3 REJECTED with verification**: `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md` confirmed canonical 15-tag set is `[UI]`, `[backend]`, `[API]`, `[database]`, `[design]`, `[testing]`, `[infrastructure]`, `[integration]`, `[review]`, `[e2e]`, `[user-story-e2e]`, `[user-story-verification]`, `[FA]`, `[brownfield]`, `[project-sweep]`. Citation added to §14 with anti-pattern note.
- **C4 fixed**: A3 user story rewritten to "redirect to /onboarding" framing. AC1=302 redirect (page routes); AC2=API endpoints return 401 JSON (per D2); AC3-AC6 cover auth.uid() scoping, single-pass TOCTOU-safe LEFT JOIN, atomic profile-insert with no client fields, post-fallback redirect.
- **N-I1 fixed**: D6 executor role specified — `SECURITY DEFINER` via service-role key per `scripts/apply-prod-migrations.mjs` execution context (justified for cross-user_id soft-deletes); runtime RLS unchanged.
- **I1, I2, I3, I4 fixed**: AC table updates (B4 router.refresh + _rsc=, D3 AC4 handler binding, D4 lib/** + app/api/** + generated types staleness, D5 Node 24 actions runtime).
- **M1, M2 fixed**: B6 concrete h1 assertion + i18n stub deletion line ref; B5 cross-ref to verification-report.md.
- **N-I2-N-I4 + N-M1-N-M2 fixed in R2**: AC1 micros-list constant SoT, A2 AC4 empty-email fallback, F10 strong-validator example, dependency map Node 24 wording, task count reconciliation (~22 implementation / ~30-33 total cards).

**Internal consistency at gate close (CLEAN):**
- "Node 22" remaining: 3 (all intentional app-runtime opt-in mentions, distinct from action-runtime Node 24 readiness)
- "0019" remaining: 13 (all explicit DEFERRED markers / DT-5 audit trail)
- "FDA + WHO baseline" without DEFAULT_MICROS_LIST context: 0 active spec
- "user override" without F-MICROS-RDA-OVERRIDE-COLUMN deferred context: 0

## 4. Design Doc Summary (1002 lines, 14 sections)

The plan-writer should treat the design doc as authoritative. Section pointers:

- **§1 Identity** — sprint metadata + ~22 implementation tasks / ~30-33 total cards header
- **§2 Scope Summary** — in-scope (11 issuelog + 9 followups + verification-found + Codex deferrals) vs deferred (~67 P3+P4)
- **§3 Architecture / Phase Plan** — 5 phases with day estimates, gate criteria, sub-agent dispatch shape
- **§4 Phase Deliverables & User Stories** — 20 stories US-STAB-A1..E1, full ACs in Given/When/Then; **THIS IS WHERE THE PLAN-WRITER MAPS USER STORIES TO TASK CARDS**
- **§5 Testing Strategy** — per-task TDD (Canonical Mandate), per-phase sweep, Phase A AC-by-AC verification, FINAL-US, Lean/Full evidence tiers, E2E Functional Click-Through Mandate
- **§6 UI / Visual Design** — direction locked; net-new = micros panel layout + F10 modal copy
- **§7 Migration Plan** — migration 0018 only; 5-step transactional cleanup + ACCESS EXCLUSIVE lock + SECURITY DEFINER; deferred D3 spec subsection (informational)
- **§8 Codex Review Strategy** — per-task M+C; per-phase always; FINAL-US end-of-project; substitute `codex:rescue` agent for slash command; `[project-sweep]` task NOT expected
- **§9 Implementation Tactics** — Approach 3 Hybrid
- **§10 Failure-First Analysis** — 10 modes (a–j), 9 invariants table, 3 reviewer perspectives (P-1..5, O-1..5, U-1..5)
- **§11 Decision Summary** — DT-1..DT-10 + Q1-Q10 reflected; remaining-unknowns table with deferred followups
- **§12 Risks** — R-STAB-1..15 with severity / likelihood / mitigation / owner phase
- **§13 Closure Criteria** — Phase E gate definition (12 numbered criteria)
- **§14 Per-task Complexity / Type-tag / Reads Mapping** — 23 task slots (20 stories + 3 user-story-e2e), with canonical 15-tag enum citation

## 5. Plan Quality Review (Step 5.4) Outcome

**Verdict: PASS.** All 13 required sections present and substantive. Two MINOR concerns:
- US-STAB-A-VERIFY non-implementation classification labelling (already handled in doc)
- US-STAB-D3 AC4 only in DT-table not inline §4 (DT-table is canonical record per line 803 note)

Both non-blocking. No methodology gaps. Ready for plan writing.

## 6. Codex Adversarial Review (Step 5.5) Outcome

- **Round 1:** 4C + 4I + 2M findings. Auto-fix sub-agent applied 9 fixes; rejected C3 with task-schema.md verification (canonical 15-tag set confirmed correct as written, citation added to §14).
- **Round 2:** 6 of 9 R1 fixes verified RESOLVED; 3 RESIDUAL (C1 AC3 incomplete, C2 lock missing, I3 §11 stub). 1 NEW Critical (N-C1 cleanup race), 4 NEW Improvement (N-I1..N-I4), 2 NEW Minor (N-M1, N-M2). Final-fix sub-agent applied all 8 fixes.
- **Gate verdict at R2 close: CLOSED** with 0 deferred Critical/Improvement.
- 2-round cap honored (per `~/.claude/skills/brainstorm-tomi/codex-safety.md`).
- Codex invocation substituted via `codex:codex-rescue` sub-agent (Bash + Codex CLI 0.125.0) per documented override.

## 7. Final Design State (deviations from Step 4 presentation)

The Step 4 design presentation showed 5 phases × 4-6 tasks with high-level user stories. The post-Codex final design retains all of that, with these substantive deviations made during Step 5 + Step 5.5:

- **DT-2 (F10 modal)** — D3 scoped DOWN from "honest-copy + new functionality" to "verify existing modal honesty + log full client-wins-resubmit deferred". This frees ~2 days from Phase D budget for verification-found work.
- **DT-4 (Migration 0019)** — DEFERRED entirely. Sprint migrations: 1 (0018) instead of planned 2.
- **C2 + N-C1** — Migration 0018 hardened with ACCESS EXCLUSIVE LOCK + SECURITY DEFINER (not in Step 4 presentation; emerged from Codex review).
- **C4** — A3 ACs from "401 OR graceful empty-state" (Step 4) to "302 redirect to /onboarding" + 5 supporting ACs (auth.uid scoping, TOCTOU-safe, atomic insert, etc.).
- **DT-9** — A2 AC4 added for empty-email fallback (not in Step 4 presentation).
- **DT-10** — D3 AC4 added for handler binding regression guard.
- **N-I3** — D5 reframed Node 22 → Node 24 GitHub Actions runtime migration.

Phase plan unchanged at the structural level. Story ID assignments unchanged. Total task count clarified (~22 implementation, ~30-33 with phase-mandatory + e2e cards).

## 8. Open Items for Step 6 (plan-writing sub-agent)

The Step 6 sub-agent must:

1. **Generate `tasks.md` ADDITIONS** — append to root `Planning/tasks.md` (do NOT replace). Each new task card must include `Folder: Planning/features/2026-05-01-mvp-stabilization/` metadata per CD1 convention. Every task card uses the format defined in `~/.claude/skills/brainstorm-tomi/SKILL.md` Step 6.2 + `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md`.

2. **Map user stories to task cards** — 20 user stories produce ~22 implementation task cards + per-phase (Phase Testing Sweep + Phase Codex Review = 10 phase-mandatory cards) + per-phase user-story-e2e cards (per Step 6.4a — required for Medium/Complex stories). Net total ~30-33 cards.

3. **Right-size tasks per Step 6.1** — bundle setup+use, component+tests, handler+validation+errors. Don't over-split on cosmetic signals. Use the per-task table in design-doc §14 as the canonical mapping.

4. **Include per-task header fields** — Complexity (Small/Medium/Complex), Codex review (Yes for M+C; phase-only for Small), Type tags (canonical 15-tag enum), Files (estimated list), Reads (artifact paths), Goal (one-liner), User Story (US-STAB-N reference), Acceptance Criteria (numbered AC1, AC2... copied from design-doc §4 — DO NOT abbreviate).

5. **Embed Canonical TDD Mandate verbatim** at the top of `tasks.md` additions (or reference if already in root tasks.md preamble).

6. **Phase A specifics** — 3 P0 task cards (US-STAB-A1, A2, A3) + 1 verification-dispatch meta task (`[project-sweep]`-flavored but really `[testing]` in the canonical enum since it dispatches Playwright walkthroughs, not adversarial review).

7. **Phase B specifics** — 5-6 P1 single-file patches, parallel-friendly bundles (orchestrator decides parallelism at execution time per Approach 3).

8. **Phase C specifics** — 3-5 P1 features. C1 (micros/RDA, Complex), C2 (library CRUD, Medium), C3 (settings completion if escalates from B6, Medium-conditional), C4+ (verification-found gaps placeholder).

9. **Phase D specifics** — 6 hardening cards. D1 (a11y), D2 (auth API 401), D3 (F10 honest-copy verify + log followup), D4 (schema-drift CI), D5 (Node 24 actions migration), D6 (lib dedup with migration 0018 ACCESS EXCLUSIVE / SECURITY DEFINER).

10. **Phase E specifics** — 1-2 closure cards. E1 (closure paperwork: re-run sweep, manual smoke, prod migration cutover, FA folder Status flip, Phase 5 close, project state update).

11. **Per-phase mandatory cards** — Phase Testing Sweep + Phase Codex Adversarial Review at every phase close (5 sweeps + 5 Codex reviews = 10 cards). These are non-negotiable per skill Step 6.3 / 6.4.

12. **Per-phase user-story-e2e cards** — per Step 6.4a, every Medium/Complex story tied to a user story gets an E2E task. Estimate ~3-5 cards covering critical user-facing flows (e.g., one per Phase B/C/D bundle).

13. **`[project-sweep]` task — NOT EMITTED.** Per design doc §8: sprint introduces no new subsystem, no 3+ Break-Risk-High API change, schema migration affects single consumer (food_library_items). Audit decision recorded in tasks.md "Project-Sweep Decision" section per Step 6.7a contract.

14. **Output to root `Planning/tasks.md`** — APPEND tasks under a new heading like `## Sprint: MVP Stabilization (2026-05-01)` so existing 26-task original plan stays intact.

15. **Verify task complexity tags before completion** — every task's `Type tags:` field uses ONLY canonical 15-tag enum. Reject any conventional-commits-style tags.

## 9. Required Artifact Set (Step 6.7 sequential creation)

Per Complex FA tier in `~/.claude/skills/brainstorm-tomi/feature-addition.md`:

| # | Artifact | Path | Required for | Status |
|---|---|---|---|---|
| 1 | feature-brief.md | sprint folder | All FA | pending |
| 2 | impact-analysis.md | sprint folder | All FA | pending |
| 3 | migration-plan.md | sprint folder | If schemas/APIs change (YES) | pending |
| 4 | design-system-snapshot.md | sprint folder | If UI (YES) | pending |
| 5 | testing-strategy.md (sprint) | sprint folder | Medium/Complex FA | pending |
| 6 | failure-analysis.md | sprint folder | Complex FA only | pending |
| 7 | tasks.md additions | root `Planning/tasks.md` | All FA | pending (Step 6 / now) |
| 8 | progress.md additions | root `Planning/progress.md` | All FA tasks | pending |
| 9 | brainstorm-state.md update to `artifacts_complete` | sprint folder | At Step 6.7 completion | pending |

Sequential creation only — never parallelize across artifacts (per skill Step 6.7).

## 10. User Preferences Carried Forward

- Single-letter / short-form answers preferred
- Soft-launch readiness over public-launch
- Canonical patterns over project-specific shortcuts
- Skip-with-override accepted (brownfield engagement, mockup pipeline, STOPs)
- Parallel sub-agent dispatch embraced
- Per-task to dev, batch to prod migration cadence
- Lean Phase E smoke
- Approach 3 Hybrid implementation
- Coverage transparency requested
- Pipeline push-through (override on STOPs interpreted from "create plan, tasks and all related documents")

---

End of pre-plan checkpoint. Step 6 sub-agent (plan-writer) reads this file FIRST, then `design-doc.md`, then optionally `01-pre-design.md`. After Step 6 completes (tasks.md additions written), Step 6.5 Codex Adversarial Review runs on the new tasks.
