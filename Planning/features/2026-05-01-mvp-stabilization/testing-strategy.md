# Sprint Testing Strategy — MVP Stabilization Sprint

**Purpose:** Sprint-specific test strategy on top of project-level foundations. Captures per-phase test contracts, fixture changes (additive only), and acceptance evidence tier mapping.
**Who reads this:** Implementation sub-agent at task spawn (test-level guidance); Phase Testing Sweep authors at phase close; FINAL-US authors at Phase E.
**Authoritative sources:**
- Project-level test policy: `Planning/testing-strategy.md` (1662 lines — 10 test levels, E2E Click-Through Mandate, AI accuracy gate, fixture conventions)
- Sprint design (this sprint's tiebreaker): `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §5 (Testing Strategy)
- TDD policy: `~/.claude/rules/testing.md` (CTM — Canonical TDD Mandate)
- Codex review policy: `~/.claude/rules/codex-review.md` + design-doc §8

When this artifact disagrees with project `Planning/testing-strategy.md`, the project doc wins on test-level conventions; THIS doc wins on sprint-specific phase contracts.

---

## 1. Foundation pointer (do not duplicate)

Project `Planning/testing-strategy.md` is the authoritative foundation:
- 10 test levels (Unit / Integration / Component / Hook / RLS / E2E / Visual / Accessibility / Lighthouse / AI accuracy)
- E2E Functional Click-Through Mandate (every interactive surface within a user-story flow MUST be clicked/typed/inspected, NOT just reachable-by-URL)
- AI accuracy gate: `tests/fixtures/ai-accuracy/critical.ts` — 30 fixtures GREEN required at Phase A/C/E gates (Lesson #5 invariant)
- RLS 32-assertion harness — required GREEN at Phase A/C/D/E gates
- Visual regression baselines and axe sweep policies
- Test fixture conventions

This sprint testing-strategy.md adds sprint-specific layers on top of those foundations.

---

## 2. Per-task TDD — Canonical TDD Mandate (CTM)

Verbatim per `~/.claude/rules/testing.md`:

> "Write a failing test BEFORE writing any production code. Verify the test fails for the correct reason. Write minimal code to make it pass. Verify all tests pass. Refactor only after green."

**Sprint application:**
- Every implementation task MUST commit a RED test BEFORE its GREEN implementation, traceable in git history (`git log --grep "RED:" --grep "GREEN:"`)
- Exception: pure `[infrastructure]` / `[design]` tasks may declare `TESTS: N/A` with explicit one-line written justification per D7
- Phase A US-STAB-A-VERIFY meta-task is itself testing — no RED/GREEN required (it produces `verification-report.md`)
- Per-phase Phase Codex Review tasks are review work — no RED/GREEN required
- Per-phase Phase Testing Sweep tasks are aggregator/auditor — no RED/GREEN required
- `[user-story-e2e]` tasks add Playwright RED tests when authoring new flows; existing functionality in flows uses RED→GREEN per the underlying story's RED tests

**Per-task Codex (D8) at task close (Medium + Complex):** Reviews the RED→GREEN trace alongside the diff. Confirms TDD ordering wasn't reversed.

---

## 3. Phase A — AC-by-AC verification methodology

**Dispatch model (DT-7 confirmed in design-doc):**
- 6 sub-agents
- Type: `general-purpose`
- Model: `opus`
- Coverage: ~3 PRD features each (19 total / 6 = ~3.17 features per agent)
- Deliverable: per-feature × per-AC matrix in `Planning/features/2026-05-01-mvp-stabilization/verification-report.md`
- Wall-clock: ~6 hours parallel + ~2 hours synthesis

**Walkthrough depth (Q6 = B locked):**
- Happy-path AC-by-AC, NOT a full edge-case audit
- Every AC of every PRD feature gets WHEN/THEN walked

**verification-report.md schema (DT-3 + DT-6 confirmed):**

| Column | Type | Required |
|---|---|---|
| `Feature ID` | string `F1`..`F19` | YES |
| `AC ID` | string per-feature `AC1`..`ACn` | YES |
| `WHEN clause` | prose | YES |
| `THEN clause` | prose | YES |
| `Pass/Fail` | enum | YES |
| `Evidence Path` | path to screenshot/log/etc. | YES |
| `Bug ID` | string `F-VERIFY-NNN` | required IF Fail |
| `Severity` | `P0`/`P1`/`P2`/`P3` | required IF Fail |
| `Area` | `auth`/`UI`/`AI`/`database`/`offline`/`infra` | required IF Fail |
| `Recommended Phase` | `B` / `C` / `D` / `defer` | required IF Fail |

**Quality control (R-STAB-15 mitigation per design-doc §10 O-5):** if verification reports start showing low-quality "Pass" annotations (e.g., screenshot mismatches AC's THEN clause), Phase A orchestrator pauses verification and re-dispatches with fewer features per agent (8–10 sub-agents). Build the option into the dispatch protocol.

**Triage gate at Phase A close:** Bugs at `Severity: P0` or `P1` → mint US-STAB-C4..C? in `tasks.md` (with `Folder:` metadata). Bugs at `Severity: P2` → triaged into Phase D bundles. Bugs at `Severity: P3` → deferred to post-MVP cleanup tracker.

---

## 4. Per-phase Testing Sweep contract

Closes every phase. The Phase Testing Sweep card runs:

| Test level | Phase A | Phase B | Phase C | Phase D | Phase E |
|---|---|---|---|---|---|
| Vitest full suite (`pnpm test`) | YES | YES | YES | YES | YES |
| Playwright full suite (`pnpm test:e2e`) | YES | YES | YES | YES | YES |
| Visual regression sweep | conditional (UI-touched) | YES | YES | YES | YES |
| axe sweep | YES | YES | YES | YES | YES |
| Lighthouse mobile ≥0.91 | optional | optional | optional | YES | YES |
| AI accuracy 30/30 (`critical.ts`) | YES | optional | YES | optional | YES |
| RLS 32-assertion harness | YES | optional | YES | YES | YES |
| Per-task acceptance evidence audit | YES | YES | YES | YES | YES |

**Single failing test, missing acceptance-evidence file, or RLS regression blocks phase close.**

**Phase D bundle nuance:** Phase D's themed bundles (D-Audit, D-Contracts, D-Offline, D-Infra) feed into a single Phase D Testing Sweep at phase close, but Codex review may split per-bundle if total diff exceeds 1MB (per design-doc §8 + §10 FF #F).

---

## 5. Phase E manual smoke contract

Per Q9 = B locked + design-doc §3 Phase E + AC1/AC2 of US-STAB-E1.

**Issuelog re-check:**
- All 11 issuelog entries get post-fix screenshot evidence in `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-issuelog-recheck.md`
- Each entry has a diff against the corresponding `verification-report.md` row (Pass/Fail flips to Pass)
- ~1 day budget for the full re-check per Q9

**Light walkthrough:**
- Authenticated session walks the major flows: login → dashboard → log a food (text + photo) → check macros + micros → library list → edit + delete + log-now → progress page → weight quick-add → settings → logout
- Captures evidence at each step

**Per-bug screenshot evidence requirement:**
- Each issuelog entry has a "before" screenshot (from verification-report.md or pre-fix manual capture) and an "after" screenshot
- Stored under `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/issuelog-NN/`

---

## 6. End-of-Project Validation Sweep — Phase E.SWEEP

Phase E's Phase Testing Sweep DOUBLES as the End-of-Project Validation Sweep per design-doc §8 + §13. Scope:
- Full Vitest, Playwright (all projects), visual regression, axe, Lighthouse mobile (all categories ≥0.91), AI accuracy (30/30), RLS 32-assertion harness
- Per-task acceptance evidence audit across ALL sprint tasks (not just Phase E tasks)
- Cross-phase invariant check: R1 firewall, I11 idempotency, cache-tag set frozen, AI accuracy preservation, Storage-FIRST cascade unchanged, deletion fence unchanged
- Sprint Closure Criteria 1–12 (design-doc §13) all pass

If any invariant breaks at this stage, the orchestrator surfaces the regression and pauses sprint close — does NOT auto-flip to `complete`.

---

## 7. FINAL-US user-story verification loop

Runs at Phase E close per design-doc §5 + §8 + §13 closure criterion #6.

**Scope:** Every `tests/e2e/web/user-stories/US-STAB-*.spec.ts` against the finalized build (i.e., HEAD after all sprint commits land + 0018 applied to dev).

**Round cap:** 2 fix rounds. Round 3 escalates to user.

**Failure modes (FF #J / R-STAB-10):** every story authored in design-doc §4 has at least one `test-planned:` marker pointing to an actual file. Plan-writing audit confirmed every `test-planned:` path. If FINAL-US discovers a story without a real RED test (RED→GREEN trace missing), the story is escalated to a P0 micro-fix — NOT marked complete.

---

## 8. Acceptance evidence tier per task (D4 locked)

| Tier | Applies to | Required artifacts |
|---|---|---|
| **Lean** | Small + non-UI Medium | Inline note in `progress.md` per task: 1-line outcome + RED→GREEN trace commit hashes |
| **Full** | Complex + any `[UI]` task | `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-<id>.md` with: AC-by-AC pass evidence, screenshots (UI), axe sweep result, manual verification trace, post-deploy smoke |

**Per-task tier mapping (sprint):**

| Story | Tier | Reason |
|---|---|---|
| US-STAB-A1 | Lean | Medium, `[backend][database]` — non-UI |
| US-STAB-A2 | Full | Medium with `[UI]` |
| US-STAB-A3 | Lean | Medium, `[backend][database]` — non-UI |
| US-STAB-A-VERIFY | n/a | Meta-task; produces verification-report.md |
| US-STAB-B1 | Full | Small with `[UI]` |
| US-STAB-B2 | Full | Small with `[UI]` |
| US-STAB-B3 | Full | Small with `[UI]` |
| US-STAB-B4 | Full | Medium with `[UI]` |
| US-STAB-B5 | Lean | Medium, `[testing][infrastructure]` — non-UI (audit script) |
| US-STAB-B6 | Full | Small with `[UI]` |
| US-STAB-C1 | Full | Complex |
| US-STAB-C2 | Full | Complex |
| US-STAB-D1 | Full | Medium with `[UI]` |
| US-STAB-D2 | Lean | Medium, `[backend][API]` — non-UI |
| US-STAB-D3 | Full | Small with `[UI]` |
| US-STAB-D4 | Lean | Medium, `[testing][infrastructure]` — non-UI |
| US-STAB-D5 | Lean | Small, `[infrastructure]` — non-UI |
| US-STAB-D6 | Lean | Medium, `[database][backend]` — non-UI |
| US-STAB-E1 | Full | Closure task — needs full evidence including issuelog re-check + prod migration |
| FINAL-US | n/a | Meta-task; produces FINAL-US run log |

---

## 9. Per-phase test contracts

### Phase A — Unblockers + Verify Dispatch

**Mandatory tests (in addition to per-task RED→GREEN):**
- 3 P0 reproducer tests authored as RED first; preserved as permanent regression sentinels in `tests/integration/` and `tests/e2e/web/user-stories/US-STAB-A*.spec.ts`
- Verification dispatch produces `verification-report.md` with full per-feature × per-AC matrix
- Phase A Testing Sweep at phase close: Vitest full GREEN, Playwright full GREEN, axe sweep GREEN (where UI touched), AI accuracy 30/30, RLS 32-assertion harness GREEN
- Phase A Codex Review under 1MB scope budget — single pass

**Codex schedule:** per-task Codex on each P0 (all 3 are Medium); Phase A Codex Review at phase close.

### Phase B — P1 Single-File Patches

**Mandatory tests:**
- Per-task TDD RED reproducer first
- 6 single-file UI patches with visual regression baselines + axe (where UI touched)
- B5 nav audit produces `scripts/nav-audit.mjs` + `tests/integration/nav-audit.test.ts` GREEN
- Phase B `[user-story-e2e]` task closes the phase
- Phase B Testing Sweep at phase close: Vitest + Playwright + visual regression + axe, all GREEN; per-task acceptance evidence audit
- Phase B Codex Review under 1MB scope budget — single pass per Lesson #3

**Codex schedule:** per-task Codex on Medium tasks (B4, B5); Small tasks rely on phase Codex; Phase B Codex Review at phase close.

### Phase C — P1 Feature Completion

**Mandatory tests:**
- Per-task TDD RED reproducer first
- C1: AI fixture additive — extend `tests/fixtures/ai-accuracy/critical.ts` with micros assertions for VN dishes; existing 30/30 must still pass GREEN BEFORE prompt change is committed (Lesson #5 invariant — RED test asserts this first)
- C2: library CRUD integration tests + RLS assertions; RLS 32-assertion harness GREEN after migration matters land
- Phase C `[user-story-e2e]` task per Complex story
- Phase C Testing Sweep at phase close: full suite GREEN; AI accuracy 30/30; RLS 32-assertion harness GREEN
- Phase C Codex Review under 1MB scope budget — single pass

**Codex schedule:** per-task Codex on both Complex tasks (C1, C2); Phase C Codex Review at phase close.

### Phase D — Hardening

**Mandatory tests:**
- D1: axe sweep on dashboard with zero violations (AC1); IVORY focus ring assertion; chart aria-label assertions
- D2: auth API 401 integration tests on every `/api/*` endpoint; refresh-interceptor handles new 401 shape; service worker fetch-handler skip-on-401 test
- D3: F10 modal regression test (AC4 handler binding); i18n regression test (AC3 no deprecated copy)
- D4: schema-drift CI guard — new test suite under `tests/integration/schema-drift/`; stage 1 report-only mode for 1 day, then stage 2 block mode
- D5: Node 24 CI workflow validation — `tests/integration/ci/action-versions-support-node24.test.ts`; manual PR run with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
- D6: lib dedup migration integration tests — index existence, duplicate-block, soft-delete-no-block, single-transaction-with-lock, security-definer-and-rls-unchanged
- Phase D `[user-story-e2e]` task closes the phase
- Phase D Testing Sweep at phase close: full suite + Lighthouse mobile ≥0.91 (a11y wins from D1) + RLS 32-assertion harness GREEN
- Phase D Codex Review may split per-bundle if total diff exceeds 1MB (per design-doc §8 + §10 FF #F)

**Codex schedule:** per-task Codex on Medium tasks (D1, D2, D4, D6); Small tasks (D3, D5) rely on phase Codex; Phase D Codex Review at phase close (per-bundle if needed).

### Phase E — Closure

**Mandatory tests:**
- Re-run sweep — all phases-tests GREEN
- Manual smoke checklist (issuelog re-check + light walkthrough)
- FINAL-US — every sprint US-STAB-* E2E test GREEN against finalized build
- EOP Codex Review at phase close — macro-level cross-cutting concerns (R1, I11, RLS, fixture non-regression)

**Codex schedule:** Phase E Codex Review at phase close + FINAL-US Codex (alongside FINAL-US task).

---

## 10. Codex review cadence reference

Per design-doc §8 + project `~/.claude/rules/codex-review.md`:

- **Per-task Codex (D8):** required for every Medium + Complex task. Substitute `codex:rescue` sub-agent for the `/codex:adversarial-review` slash command (per `01-pre-design.md` §8 last bullet — slash command unavailable inside agent loop).
- **Per-phase Codex:** mandatory at every phase close. Scope budget: ≤1MB diff per pass. Phase D may split per bundle.
- **FINAL-US end-of-project Codex:** runs alongside FINAL-US task at Phase E close. 2 rounds cap.
- **Round cap (per task and per phase):** 2 rounds. If findings persist past round 2, escalate to user.
- **Categorize findings:** Critical / Improvement / Minor. Auto-fix Critical + Improvement via sub-agent. Surface Minor to user.

---

## 11. Test fixture changes (additive only)

**Phase C:**
- Extend `tests/fixtures/ai-accuracy/critical.ts` with micros assertions for the 5 VN dishes (US-STAB-C1)
- New entries do NOT regress existing 30 fixture pass rate (Lesson #5 invariant)

**Other phases:**
- No fixture changes expected — flag if any execution sub-agent discovers a need
- New test FILES are expected (per AC test-planned: markers across §4 ACs); these are new files under `tests/`, not modifications to existing fixtures

**Forbidden changes:**
- Removing or modifying any of the 30 existing AI accuracy fixtures
- Removing any of the 32 existing RLS assertions
- Modifying existing visual regression baselines (only additive baselines for net-new components like `DashboardMicrosPanel`)
- Modifying the cache-tag set `['24h','D','7d','30d','90d','1y']`

---

## 12. Per-phase user-story-e2e tasks

Per Step 6.4a in `~/.claude/skills/brainstorm-tomi/SKILL.md` + design-doc §3 phase tables: every Medium/Complex story tied to a user story gets an E2E task. Sprint emits 3 `[user-story-e2e]` cards (one per Phase B/C/D bundle):

- `US-STAB-B-USER-STORY-E2E` — closes Phase B
- `US-STAB-C-USER-STORY-E2E` — closes Phase C
- `US-STAB-D-USER-STORY-E2E` — closes Phase D
- `FINAL-US` — closes Phase E (the project-wide user-story-verification at end-of-project)

These cards run the existing `tests/e2e/web/user-stories/US-STAB-*.spec.ts` files for the phase under test, asserting full E2E click-through coverage per project E2E Functional Click-Through Mandate.

---

## 13. Test infrastructure preserved

Per project `Planning/testing-strategy.md` + sprint design-doc §10 invariants:
- Existing CI workflows under `.github/workflows/*.yml` unchanged except for D5's action-version bumps
- Existing test runners (Vitest, Playwright with multiple projects, axe-core, Lighthouse CI) unchanged in shape
- Existing test conventions (file naming, fixture location, snapshot policy) unchanged
- Existing pre-commit hooks unchanged

D4 introduces a NEW workflow `schema-drift-check.yml` — additive; does not modify existing workflows.

---

End of sprint testing strategy.
