# 01-pre-design.md — MVP Stabilization Sprint Pre-Design Checkpoint

**Written:** 2026-05-01
**Sprint:** mvp-stabilization
**Mode:** Feature Addition (Complex FA)
**Project:** Kalori
**Working directory:** `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp`

This file captures everything a fresh agent (or the Step 5 design-doc sub-agent in this same session) needs to continue from Step 5 without access to the live conversation transcript. The Step 5 sub-agent MUST read this file FIRST before writing the design doc, and confirm understanding of Sections 8 (Decisions Finalized) and 9 (Open Items for Step 5) before proceeding.

---

## 1. Project Identity

- **Topic:** Post-build pre-soft-launch remediation sprint for the Kalori MVP.
- **Project context:** Kalori is an AI-first calorie/nutrition tracker (PWA, dark-only, single-user). Vietnamese nutrition primary, Western secondary. Stack: Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase (kalori-prod ref `dryysypycsexvlbabtwq`, kalori-dev ref `aaiohznsqlqchsoxaqkz` — both ap-southeast-1) + Gemini Flash (`gemini-flash-latest`) + Vercel (project `kalori`, region `iad1`) + Sentry. Production live at `https://kalori-one.vercel.app`. Original brainstorm direction "The Ledger" (oxblood `#8A2A1F` + ivory `#F4EBDC` on warm near-black `#0E0A08`, Newsreader serif + Inter + JetBrains Mono).
- **Mode:** Feature Addition layered on top of existing Kalori project. The original 5-phase Complex-tier execution is at Phase 5.4 in_progress (Step 11 manual smoke surfaced the 11 issuelog bugs). This sprint runs as a parallel FA sprint that closes Task 5.4 + Phase 5 + project state at its Phase E.
- **Complexity tier:** Complex FA (~22 tasks, 5 phases, ~3 weeks).
- **UI gate:** YES — sprint touches dashboard a11y, settings page, library CRUD UI, sidebar identity, F10 conflict modal, micros panel, and includes a site-wide nav audit.
- **Platform:** Web (existing Next.js 16 app).
- **Sprint folder:** `Planning/features/2026-05-01-mvp-stabilization/`
- **Sprint state file:** `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md`

## 2. Lessons Applied

The brainstorm-tomi Phase 0e (Load Lessons) was effectively a no-op for this sprint — Kalori-specific lessons are already embedded in the project's planning artifacts (especially `Planning/design-doc.md`, `Planning/architecture.md`, `Planning/testing-strategy.md`) and in `~/.claude/lessonlearned.md` Kalori entry from the original brainstorm Step 6.6.

Lessons that DO apply to this sprint:

1. **R1 firewall is load-bearing.** Phase 3/4/5 mutation tasks are FORBIDDEN from local refresh shims; all session-refresh logic flows through `lib/auth/refresh-interceptor.ts` (Task 2.1's canonical helper). This applies to every new mutation route or client-side fetch added during this sprint. Verified clean across 9 prior consumers.

2. **Schema-drift kills tests silently.** Mocked tests have fabricated column shapes that didn't match prod, causing 500s. The sprint includes US-STAB-D4 (schema-drift CI guard) explicitly to address this class of failure.

3. **Codex 1MB scope budget per gate.** When per-phase reviews touch large diffs, split into multiple per-area Codex passes rather than blowing scope. Phase B/D parallelism is sized to keep per-phase scope under 1MB.

4. **Direction-tiebreaker is design-doc.** The original `Planning/design-doc.md` is authoritative for any conflict between sprint design decisions and UI-design fragments / component patterns / RLS policies / cache-tag invariants.

5. **VN nutrition fixtures are merge-blocking.** Any AI prompt change (e.g., micros/RDA addition for US-STAB-C1) must keep `tests/unit/ai/vn-smoke.test.ts` GREEN against `tests/fixtures/ai-accuracy/critical.ts` registry; new fixtures may be added but the existing 5-VN smoke set cannot regress.

6. **Phase Testing Sweep audits acceptance evidence.** Missing per-task evidence blocks phase close, even with green test suite.

## 3. Project Exploration Findings

Captured by 4 parallel sub-agents at Phase 1 Step 1.

### 3.1 Bug catalog

**Source 1 — `bugs/issuelog.txt` (11 entries, all in scope):**

| # | One-line | Severity | Area | Story |
|---|---|---|---|---|
| 1 | Homepage `/` should redirect authed users to `/dashboard` | P1 | UI | US-STAB-B1 |
| 2 | Micronutrients (vitamins/minerals) not calculated/displayed; no RDA | P1 | AI/Gemini | US-STAB-C1 |
| 3 | New-item entry form retains previous text | P2 | UI | US-STAB-B2 |
| 4 | Newly added items not saved to library | **P0** | database | US-STAB-A1 |
| 5 | Library management is incomplete (CRUD) | P1 | UI | US-STAB-C2 (with #10) |
| 6 | Verify all navigation/site functions | P2 | UI | US-STAB-B5 |
| 7 | Settings page shows "Settings arrive with Task 2.2" stub | P1 | UI | US-STAB-B6 → C3 if escalates |
| 8 | "Navigation" header at sidebar top is non-interactive | P3 | UI | US-STAB-B3 |
| 9 | Sidebar shows "dev user" in prod despite Gmail login | **P0** | auth | US-STAB-A2 |
| 10 | Library page lacks logged-food management (CRUD) | P1 | UI | US-STAB-C2 (with #5) |
| 11 | Progress page shows "wait" with no add/modify option for weight | P1 | UI | US-STAB-B4 |

**Source 2 — `Planning/followups.md` (9 entries selected as in-scope):**

| ID | Severity (re-tiered) | Area | Story |
|---|---|---|---|
| F-SEC-2026-04-25-ORPHAN-PROFILE-DASHBOARD-READ | **P0** (escalated from Improvement) | auth | US-STAB-A3 |
| F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS | **P1** (escalated from Improvement) | UI | US-STAB-D1 |
| F-API-401-VS-HTML-REDIRECT | P2 | auth | US-STAB-D2 |
| F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT | P2 | offline/PWA | US-STAB-D3 |
| F-OFFLINE-5.1.5-KEEP-OFFLINE-DEFERRED | P2 | offline/PWA | US-STAB-D3 (rolled in) |
| F-UI-3.7-SCHEMA-DRIFT-GUARD | **P1** (escalated from Improvement) | tests | US-STAB-D4 |
| F-DEP-1 GH Actions Node 20 deprecation (deadline 2026-06-02) | P2 | infra | US-STAB-D5 |
| F-LIB-DEDUP-DUPLICATE-INSERT | P2 | database | US-STAB-D6 |
| F-WEIGHT-QUICK-ADD-RSC-REFRESH | P2 | UI | US-STAB-B4 (rolled in) |

**~67 followups deferred** to a future "post-MVP cleanup" tracker — broken into 5 P3 polish clusters (`F-MINOR-5.2-*`, `F-UI-3.4-*`, `F-UI-3.5-*`, `F-UI-4.1-*`, `F-UI-4.3a/b-*`) plus ~10 P3 individual items + ~10 P4 cleanup items.

### 3.2 Project state at sprint start

- Phases 1–4 closed.
- Phase 5: 5.1 ✅, 5.2 ✅, 5.3 ✅, **5.4 🔄 In Progress** at Step 11 manual smoke (which is the current bug-fix entry point).
- Most recent commits: `96ad230` docs close-out, `7209888` prod-readiness audit close, `d2e287c` root redirect + 4-page graceful fallback, `1ba09cd` 17 migrations applied to kalori-prod, `0e7781f` Phase 5 Codex R2 fix, `52214c8` Phase 5 Codex R1 fix.
- Tests at HEAD: Vitest 1725/1725 GREEN, branch coverage 70.85% vs 70 target, Playwright + axe GREEN, Lighthouse mobile ≥0.91 all categories, AI accuracy 30/30.
- Visual: CI Linux GREEN; Windows host shows 15/18 platform-drift (pre-known, F-VISUAL-* tracked).
- Sentry: 0 unresolved at HEAD.
- Production: live on Vercel at `https://kalori-one.vercel.app`, function region `iad1`, all 17 migrations applied to kalori-prod.
- Pending user action: `NEXT_PUBLIC_KALORI_ENV` across 3 Vercel scopes (Sentry env tagging until set; flagged in `Planning/setup-state.md` §5).

### 3.3 PRD feature catalog (19 features at AC verification level)

PRD lists 14 user-facing features (F1 onboarding, F2 Text Log, F3 Photo Log, F4 Library Log, F5 Confirmation Screen, F6 Dashboard, F7 Water Tracker, F8 Progress View, F9 Weight Log + Auto-Recalc, F10 Auto/Manual Target, F11 Undo Toast, F12 Weekly AI Review, F13 Data Export, F14 Account Delete) plus 5 cross-cutting features that earned implicit ID assignment (F15 PWA Install + Offline, F16 RLS Isolation, F17 Refresh Interceptor, F18 Keyboard Shortcuts, F19 Food Detail + Edit + Log-Now).

Highest verification difficulty (per Step 1 PRD sub-agent): F2/F3/F12 AI features (need quality judgment, not just pass/fail), F15 PWA install/offline (manual flow + real device), F16 RLS isolation (32 assertions across 8 tables × 4 verbs), F11 undo toast cross-tab (BroadcastChannel realm semantics).

Highest "likely silently dropped" suspicion: F18 keyboard shortcuts (`/`, `n`, `?`), magic-link auth path (Google OAuth wired but magic-link untested), copy-yesterday multi-select subset, sparse-data fallbacks on Progress + Weekly Review, server-side block on >30d backfill.

## 4. Multi-Round Q&A

10 questions, all locked. Verbatim user-facing answers preserved.

### Q1 — Acceptance bar

> "What does 'MVP more usable' mean to you, concretely?"

**Locked answer: B (Soft-launch ready).** A + dashboard a11y + auth API 401 shape + F10 conflict modal honesty + orphan-profile fallback + dev-user identity + Node 20 deprecation. P3 polish DEFERRED. Estimated ~3 weeks.

User's exact reply: `B`.

### Q2 — Structural shape

> "Where do the stabilization tasks live, and what happens to the open Phase 5.4?"

**Locked answer: A (Dated FA folder).** `Planning/features/2026-05-01-mvp-stabilization/` with manifest + supporting artifacts. Tasks live in root `Planning/tasks.md` with `Folder:` metadata. New per-sprint `brainstorm-state.md` inside the FA folder. Existing project state stays at `5.4 in progress` until Phase F (i.e., this sprint's Phase E) closes both. Phase 5 closes when sprint Phase E closes.

User's exact reply: `A`.

### Q3 — Brownfield engagement

> "How much formal Brownfield Engagement do we run?"

**Locked answer: A (Skip with explicit override).** Override reason recorded verbatim in `manifest.md` "Brownfield Engagement" section. Compensating controls: per-task Codex (Medium/Complex), Phase A verification report, per-phase Codex Adversarial Review.

User's exact reply: `A`.

### Q4 — Verification timing

> "When does the feature-verification sweep run?"

**Locked answer: A (Parallel-first Day 1 dispatch).** 6 parallel sub-agents (general-purpose, opus) walk all 19 PRD features × per-AC. Verification report produced by Day 2; bugs fold into Phase B/C scope at triaged tier.

User's exact reply: `A`.

### Q5 — Phase structure

> "How many phases — 4 (compressed) or 5 (granular split)?"

**Locked answer: 5-phase split.** Phase A (Unblockers + Verify Dispatch) → Phase B (P1 Single-File Patches) → Phase C (P1 Feature Completion) → Phase D (Hardening) → Phase E (Closure). Per-phase sizing fits 2–6 task budget.

User's exact reply: `5-phase (granular split).`.

### Q6 — Verification depth

> "How deep does verification go per feature?"

**Locked answer: B (Happy + AC-by-AC re-check) for all 19 features.** Per-feature × per-AC matrix output to `verification-report.md`.

User's exact reply: `B`.

### Q7 — Migration policy

> "Migration & deployment policy — when do new migrations land in dev vs prod?"

**Locked answer: A (Per-task to dev, batch to prod at Phase E closure).** Continues existing project pattern (all 17 prior migrations followed this). `scripts/apply-prod-migrations.mjs` handles batch cutover at Phase E. Sprint expected migrations: 0018 (F-LIB-DEDUP partial unique index), 0019 (micros/RDA, design-deferred to Step 5), possibly 0020 (F-OFFLINE-5.1.5 conditional).

User's exact reply: `A`.

### Q8 — UI mockup treatment

> "UI mockup treatment for sprint-level work."

**Locked answer: A (Skip sprint-level mockups entirely).** Direction locked from project brainstorm. Per-task mini-mockups available ad-hoc during execution if a layout decision warrants visualization.

User's exact reply: `A`.

### Q9 — Phase E manual smoke

> "What does Phase E manual smoke check, exactly?"

**Locked answer: B (Issuelog re-check + light walkthrough).** ~1 day budget. Phase A verification report's pre-fix evidence becomes diff-target for Phase E post-fix observation.

User's exact reply: `B`.

### Q10 — Operational defaults batch

10 defaults locked verbatim. Summarized:

- **D1** Phase E new-bug policy: P0/P1 fix-now extension; P2/P3 log-and-defer with sprint source tag.
- **D2** User Story IDs: reuse existing PRD/design-doc IDs for fixes touching existing features; mint `US-STAB-N` for net-new.
- **D3** E2E test mapping: per-phase user-story E2E tasks for every Medium/Complex task tied to a story; existing specs reused; new specs at `tests/e2e/web/user-stories/US-STAB-N.spec.ts`.
- **D4** Acceptance evidence tier: Lean for Small + non-UI Medium; Full (artifact + screenshots + axe) for Complex / `[UI]`.
- **D5** Verification dispatch: 6 parallel sub-agents (general-purpose, opus). Each owns ~3 features. Single matrix output.
- **D6** Followups treatment: `Status: RESOLVED-2026-05-XX (commit hash)` on close; `Status: DEFERRED-soft-launch (revisit post-MVP)` on closeout for the deferred 67.
- **D7** TDD: Canonical Mandate verbatim per implementation task; only pure `[infrastructure]` / `[design]` may declare `TESTS: N/A` with written justification.
- **D8** Codex cadence: per-task for Medium + Complex; per-phase for all phases; end-of-project FINAL-US.
- **D9** UI skill stack: `ui-ux-pro-max:ui-ux-pro-max` + `frontend-design:frontend-design` + `vercel-react-best-practices` invoked at design + execution time on every UI task.
- **D10** Verification report: `Planning/features/2026-05-01-mvp-stabilization/verification-report.md`, per-feature × per-AC matrix with evidence paths.

User's exact reply: `sounds good go ahead`.

### User-Facing Phase Story Round (folded into Q5)

User-visible outcomes per phase synthesized at design presentation time. See Section 6 below ("Design Presentation Key Points") for the per-phase user-story scaffolding the Step 5 design doc must expand.

## 5. Approaches Considered

Three implementation tactics presented at Step 3:

- **Approach 1 (Sequential tight):** one sub-agent per task serially within each phase. Per-task Codex for Medium/Complex; Phase Codex at every gate. **Rejected** — slowest (~22+ days), underutilizes parallelism on independent fixes (e.g., sidebar-fix + form-clear-fix + nav-header-fix in Phase B).
- **Approach 2 (Themed parallel):** group fixes by area, 2–4 parallel sub-agents per phase, single per-phase Codex covers all bundles. **Rejected** — Codex scope blowup risk past 1MB budget; loses per-task Medium/Complex Codex value (D8); single sub-agent owning a fat bundle becomes wall-clock bottleneck defeating the parallel premise; harder fix isolation across bundles.
- **Approach 3 (Hybrid: P0 serial, P1+ parallel) — CHOSEN:** P0s serial within Phase A (high stakes); 2–3 parallel impl sub-agents per Phase B/D themed bundles; 1–2 parallel sub-agents in Phase C (smaller phase, larger features); serial single sub-agent in Phase E. Per-task Codex for Medium/Complex preserved; per-phase Codex scope kept under 1MB by Q5 5-phase split.

User's exact reply: `approach 3`.

### Test strategy per Approach 3

- **P0 (Phase A, serial):** TDD strict — reproducer test for each P0 (preserved as permanent regression sentinel). Per-task Codex per P0 (treated as Medium minimum).
- **P1 patches (Phase B, parallel):** TDD per-task — focused failing test per fix. Bundles are FILE-scoped (not test-scoped), so each task owns its own RED-then-GREEN cycle.
- **P1 features (Phase C, 1–2 parallel):** TDD per-task with feature-level integration. Micros/RDA gets new VN AI accuracy fixtures (additive to critical.ts registry); library CRUD gets new RLS + UI integration tests.
- **Hardening (Phase D, parallel):** TDD per-task with type-tag specific tests — axe for D1, schema-drift CI for D4, Node 22 CI workflow for D5, partial-unique-index integration for D6.
- **Per-phase Testing Sweep:** full applicable suite at every phase boundary; audits per-task acceptance evidence.
- **Phase A verification:** AC-level Playwright headed walkthroughs by 6 parallel sub-agents; output goes to `verification-report.md`.
- **Phase E manual smoke:** issuelog re-check (per-bug screenshot evidence) + light walkthrough; verification report becomes diff-target.
- **End-of-project FINAL-US:** every sprint user story E2E test runs against finalized build; 2 fix rounds capped.

## 6. Design Presentation Key Points

Step 4 design presented and approved by user. The Step 5 design doc must expand:

1. **Phase plan** as locked in Q5 (5-phase, with day estimates and task counts per phase).
2. **Phase Deliverables & User Stories** — 20 stories across 5 phases. Story IDs locked. The Step 5 sub-agent must:
   - Synthesize the full "As a [role], I want [X], so that [Y]" phrasing per story (the Step 4 presentation has high-level versions; expand with specific roles and outcomes).
   - Author 1–5 numbered Acceptance Criteria per story in Given/When/Then form (ACs at Step 4 are bullet-summary; design doc must produce AC1, AC2, ... that are falsifiable by tests).
   - For US-STAB-B6 ("Settings stub copy"): include the BRANCH — patch-shaped (Phase B simple copy-fix) vs feature-shaped (escalate to US-STAB-C3 with full settings page completion). Decision criterion: if Settings page only has stub COPY (string is "Settings arrive with Task 2.2..." but real options exist behind it), patch; if Settings page is genuinely missing real options, escalate.
   - For US-STAB-D3 ("F10 modal honesty"): include the BRANCH — full client-wins-resubmit impl (server-side precondition refresh API + client retry queue, ~5 days) vs honest-copy-only fix (relabel buttons + remove the lying-CTA, ~2 hours). Decision criterion: scope check at Phase D entry; if server work is too large for ~5-day Phase D budget, scope down to honest-copy + log full impl as deferred followup.
   - For US-STAB-C4+: explicitly note "TBD post-Phase-A" — story IDs assigned after verification report ingestion at Phase A close.
3. **Failure-First Analysis** (REQUIRED per skill Step 5):
   - **Top 10 failure modes.** Cover at minimum: (a) Phase A verification surfaces >5 new P0/P1 bugs blowing budget; (b) Micros/RDA AI prompt change degrades AI accuracy below 30/30 fixture pass rate; (c) F-LIB-DEDUP partial unique index conflicts with existing duplicate rows in dev preventing migration; (d) US-STAB-D3 client-wins-resubmit scope explodes; (e) Phase B parallel sub-agents conflict on shared cache-tag invalidation; (f) Codex review scope exceeds 1MB on Phase D combined hardening; (g) Schema-drift CI guard (D4) flags every existing test causing CI red wave; (h) Node 22 migration breaks a workflow that depended on Node 20 syntax; (i) Settings page completion (C3) hits unscoped server-side requirements; (j) End-of-project FINAL-US fails on a story authored without proper RED test in plan-writing.
   - **Invariants.** Cover at minimum: R1 firewall (no raw `fetch(` in new mutation paths), I11 client_id idempotency on sprint mutation routes, schema-tag set frozen `['24h','D','7d','30d','90d','1y']`, weight bounds `[30, 350]` kg, lbToKg constant 0.45359237, AI accuracy fixture set `tests/fixtures/ai-accuracy/critical.ts` non-regressing, Storage-FIRST cascade on account delete, fail-closed deletion fence on mutation routes, RLS 32-assertion harness GREEN at every phase close.
   - **3 adversarial reviewer perspectives** (Paranoid Staff Engineer, Over-Engineering Reviewer, Under-Specification Reviewer) — each reviews the design and produces 3–5 concrete concerns with proposed mitigations.
4. **Decision Summary**: per skill — what was chosen, short-term path, long-term path, remaining unknowns, follow-up questions, dependency mapping.

## 7. Mockup Pipeline Outcome

**SKIPPED.** Direction locked from original project brainstorm:

- **Color:** oxblood `#8A2A1F` (primary action), ivory `#F4EBDC` (foreground/text), warm near-black `#0E0A08` (background)
- **Typography:** Newsreader serif (display + headings), Inter (sans body), JetBrains Mono (numerics)
- **Layout:** zero-radius (no rounded corners except square FAB exception), hairline rules, no shadows
- **Focus ring:** IVORY 2px outline + 2px offset (per ux-auditor WCAG correction; NOT oxblood — oxblood 2.28:1 fails WCAG 2.5.8)
- **Component architecture:** 9 primitives + 6 compound + 4 headless (per `Planning/ui-design.md` §13)
- **RSC/Client/Split:** 27 / 38 / 14 (per `Planning/ui-design.md`)

Net-new UI elements in this sprint:

- **Micros/RDA dashboard panel (US-STAB-C1):** layout decision deferred to per-task design at execution. Likely follows existing dashboard component patterns (Macros panel structure, Water panel structure). Per-task mini-mockup possible if layout warrants iteration.
- **F10 conflict modal honest CTAs (US-STAB-D3):** text + button-handler change in existing modal (`components/pwa/GoalWeightConflictModal.tsx`); no layout change — adds clear ESC=Cancel + relabels CTAs to reflect actual outcome.

All other UI work fixes existing components in their existing visual treatment.

## 8. Decisions Finalized

All locked at Q1–Q10 + Approach 3 + Step 4 design approval:

- **Sprint folder:** `Planning/features/2026-05-01-mvp-stabilization/`
- **Tasks:** in root `Planning/tasks.md` with `Folder: Planning/features/2026-05-01-mvp-stabilization/` metadata per task card (CD1)
- **5 phases × 4–6 tasks** = ~22 tasks total
- **20 user stories** US-STAB-A1..E1 (with C4+ TBD post-verification)
- **3 weeks** target duration
- **Verification-first parallel dispatch** Day 1 (6 sub-agents)
- **Coverage:** all 11 issuelog + 9 followups + verification-found + Codex deferrals; ~67 deferred to "post-MVP cleanup"
- **Per-task Codex** for Medium/Complex; **per-phase Codex** at every phase close; **FINAL-US** at end
- **TDD canonical mandate** for every implementation task
- **Migrations:** per-task to kalori-dev; batch to kalori-prod at Phase E
- **UI direction:** locked (Ledger); no sprint-level mockup pipeline
- **Codex invocation:** substitute `codex:rescue` sub-agent for `/codex:adversarial-review` slash command inside agent loop
- **Override decisions:** Phase 0f Brownfield SKIPPED; Step 4.5 Mockups SKIPPED; Step 4.6 STOP and Step 5.5 STOP overridden via "continue without reset" interpretation of user directive

## 9. Open Items for Step 5 (design doc writer)

The Step 5 design-doc sub-agent must:

1. **Synthesize full Acceptance Criteria** (Given/When/Then or numbered bullet) for every user story. ACs at Step 4 are high-level summaries; design doc must produce AC1, AC2, ... per story that are falsifiable by tests.

2. **Produce full Failure-First Analysis** per Section 6.3 above.

3. **Produce full Decision Summary** per skill Step 5 spec.

4. **Embed Phase Deliverables & User Stories** with full AC tables per phase.

5. **Reference (do NOT duplicate) project authoritative docs**:
   - `Planning/PRD.md` — feature catalog
   - `Planning/architecture.md` — DDL, RLS, route map
   - `Planning/ui-design.md` — design tokens, component specs
   - `Planning/testing-strategy.md` — test levels, fixtures, E2E click-through mandate
   - `Planning/design-doc.md` — original design (conflict tiebreaker)
   - `Planning/progress.md` — current task status
   - `Planning/CHANGELOG.md` — execution change log
   - `Planning/setup-state.md` — infra state

6. **Resolve design-time decisions** for the few items still open:
   - **Micros/RDA RDA reference data:** code constants vs DB seed table. Recommend: code constants for ~30 micronutrients (covers FDA + WHO baseline), with per-user override field on `profiles` table (additive migration `0019`) for users who want to customize. AI prompt extracts micros; dashboard panel computes `% of RDA` client-side from constants × value.
   - **Settings page completion (C3 escalation criterion):** Read `app/(app)/settings/page.tsx` at design time. If real settings exist behind stub copy → US-STAB-B6 stays Phase B (patch). If page is genuinely missing real options → escalate to US-STAB-C3 in Phase C.
   - **F10 conflict modal scope (D3 escalation criterion):** Read `lib/offline/conflict-resolver.ts` and `components/pwa/GoalWeightConflictModal.tsx`. If client-wins-resubmit needs server-side `If-Match` ETag + client retry queue redesign → scope down to honest-copy fix only (relabel buttons + remove lying CTA + add ESC=Cancel) and log full impl as deferred followup.
   - **Verification report format:** confirm column set: `Feature ID | AC ID | WHEN clause | THEN clause | Pass/Fail | Evidence Path | Bug ID (if fail) | Severity | Area | Recommended Phase`.
   - **Sub-agent dispatch model for verification (D5):** confirm `general-purpose` type, `model: opus`, ~3 features per agent, 6 agents total.

7. **Specify per-task complexity, type tags, Reads field** in the user-story-to-task mapping section. Type tags drawn from canonical 15-tag set in `superpowers-exec-tomi/references/task-schema.md`. Sample: P0 fixes are mostly Medium `[UI][backend]` or `[backend][database]`; P1 patches are mostly Small `[UI]`; micros/RDA is Complex `[UI][backend][AI]`; schema-drift CI guard is Medium `[testing][infrastructure]`.

8. **Risk register expansion** beyond the 5 high-level R-STAB-1..5 from Step 4 — add R-STAB-6..10+ as the Failure-First Analysis Top 10 modes are formalized.

## 10. File Pointers

### Sprint folder (this folder)

- `Planning/features/2026-05-01-mvp-stabilization/manifest.md`
- `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md` (sprint state)
- `Planning/features/2026-05-01-mvp-stabilization/brainstorm-context/01-pre-design.md` (this file)

### Project authoritative docs (read-only inputs for sub-agents)

- `Planning/PRD.md`
- `Planning/architecture.md`
- `Planning/ui-design.md`
- `Planning/testing-strategy.md`
- `Planning/design-doc.md` (conflict tiebreaker)
- `Planning/progress.md`
- `Planning/CHANGELOG.md`
- `Planning/setup-state.md`
- `Planning/tasks.md` (root — sprint tasks will be appended here at Step 6)
- `Planning/brainstorm-state.md` (project-level — has FA pointer)
- `Planning/followups.md` (~76 open entries)

### User-provided source files (preserve, do not modify)

- `bugs/issuelog.txt` — 11 manual-smoke bugs

### Skill artifacts referenced

- `~/.claude/skills/brainstorm-tomi/SKILL.md`
- `~/.claude/skills/brainstorm-tomi/feature-addition.md`
- `~/.claude/skills/brainstorm-tomi/codex-safety.md`
- `~/.claude/skills/brainstorm-tomi/state-persistence.md`
- `~/.claude/skills/brainstorm-tomi/failure-first.md`
- `~/.claude/skills/brainstorm-tomi/artifacts.md`
- `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md` (canonical type tag set)
- `~/.claude/rules/testing.md`

## 11. User Preferences Surfaced During Questioning

- **Single-letter / short-form answers preferred.** User answered `B`, `A`, `5-phase (granular split)`, `B`, `A`, `A`, `A`, `A`, `B`, `sounds good go ahead`, `approach 3`, `path 1 lets create plan, tasks and all related documents`. Optimize future Q&A toward concrete decisions with named options.
- **Soft-launch over public-launch** — pragmatic scope, accepts deferred polish; willing to defer ~67 P3/P4 items to a future tracker.
- **Canonical patterns over project-specific shortcuts** — picked dated FA folder over inline Phase 5 continuation.
- **Skip-with-override over re-derivation** — picked Skip for brownfield engagement, accepting override responsibility.
- **Parallel sub-agent dispatch embraced** for both verification (Phase A) and impl (Phase B/D).
- **Granular phasing** — picked 5-phase over 4-phase for cleaner Codex scope per gate.
- **Per-task to dev, batch to prod migration** — continues existing project pattern; values cutover discipline.
- **Direction locked, no re-mocking** — picked skip sprint-level mockups.
- **Lean Phase E smoke** — picked issuelog re-check + light walkthrough over full AC re-check.
- **Approach 3 Hybrid** — picked speed-where-safe over pure-serial or pure-parallel.
- **Coverage transparency requested** — explicitly asked "are we fixing all the bugs"; values knowing what's deferred.
- **Pipeline push-through** — said "create plan, tasks and all related documents", interpreted as "continue without reset" override of skill's two STOP points.

---

End of pre-design checkpoint. Step 5 design-doc sub-agent reads this file FIRST, confirms Section 8 (Decisions Finalized) + Section 9 (Open Items for Step 5), then writes `Planning/features/2026-05-01-mvp-stabilization/design-doc.md`.
