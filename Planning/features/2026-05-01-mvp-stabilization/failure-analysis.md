# Failure Analysis — MVP Stabilization Sprint

**Purpose:** Failure-First Analysis at sprint scope. Re-renders the design-doc §10 content with sprint-execution-time orientation: which phase will catch each failure, which sub-agent role will surface it, which audit mechanism applies.
**Who reads this:** Implementation sub-agent at task spawn (knows what to watch for); Phase Codex reviewer at phase close (knows what's most likely to fail); FINAL-US authors at Phase E (knows the invariants to re-confirm).
**Authoritative source:** `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §10 — where the canonical Top 10 + Invariants + 3 Adversarial reviewers live. When this artifact disagrees with design-doc §10, design-doc §10 wins. Risk register cross-reference: design-doc §12 (R-STAB-1..R-STAB-15).

---

## 1. Top 10 failure modes (sprint-specific)

**Pointer:** Full prose grounded in project state, with Severity / Likelihood / Mitigation columns, lives in design-doc §10 as Failure Modes A–J. This artifact summarizes each + adds sprint-execution-time orientation.

### Mode A — Phase A verification surfaces >5 new P0/P1 → 3-week budget blowout

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase A close |
| **Caught by** | Phase A orchestrator at "verification-found bug count" sanity check |
| **Severity / Likelihood** | High / Medium |
| **Mitigation** | Sanity check at Phase A close; if >5 P0/P1, raise to user with options (extend Phase B, defer to soft-launch+1, descope). Cross-ref R-STAB-1. |
| **Audit mechanism** | Read `verification-report.md` Bug ID column count by Severity |

### Mode B — Micros/RDA AI prompt change degrades AI accuracy below 30/30 fixture pass rate

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase C — US-STAB-C1 RED test |
| **Caught by** | C1 implementation sub-agent's RED test asserts `tests/fixtures/ai-accuracy/critical.ts` 30/30 still passes BEFORE prompt change is committed |
| **Severity / Likelihood** | High / Medium |
| **Mitigation** | Lesson #5 invariant. If prompt changes break a fixture, EITHER reframe the prompt to preserve OR add a regression fixture for the new behavior + escalate to user (no silent fixture removal). Cross-ref R-STAB-2. |
| **Audit mechanism** | C1 RED test commit must precede the prompt-change commit; Phase C Testing Sweep re-runs critical.ts |

### Mode C — F-LIB-DEDUP partial unique index conflicts with existing duplicate rows in dev

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase D — D6 task |
| **Caught by** | `scripts/dedup-pre-flight.mjs` runs BEFORE migration applies to dev; halts with manual-review prompt if dupes exist |
| **Severity / Likelihood** | High / Medium |
| **Mitigation** | Pre-flight halts; documented runbook in `migration-plan.md` (keep most-recent `updated_at`, soft-delete older). Migration's own 7-step transactional cleanup with ACCESS EXCLUSIVE LOCK + SECURITY DEFINER handles in-transaction. Cross-ref R-STAB-3. |
| **Audit mechanism** | Pre-flight script + AC3/AC6/AC7 of US-STAB-D6 + Phase D Codex |

### Mode D — D3 client-wins-resubmit scope explodes if attempted as full impl

| Field | Value |
|---|---|
| **Sprint surfaces in** | Already realized at design time — mitigated via DT-2 scope-down |
| **Caught by** | DT-2 design-time decision; no execution-time surface |
| **Severity / Likelihood** | High / High (already realized) |
| **Mitigation** | D3 scoped to honest-copy-only (verification + AC3 i18n guard + AC4 handler-binding guard). Full impl deferred under existing followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`. Cross-ref R-STAB-4. |
| **Audit mechanism** | Design-time locked at DT-2; manifest + design-doc §11 reflects this; no sprint task references the deferred work spec |

### Mode E — Phase B parallel sub-agents conflict on shared cache-tag invalidation set

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase B parallel waves |
| **Caught by** | Pre-task `Files:` audit by orchestrator before sub-agent spawn (file-disjoint enforcement per design-doc §9) |
| **Severity / Likelihood** | Medium / Low |
| **Mitigation** | File-disjoint check ensures parallel tasks don't share files. Cache-tag set frozen `['24h','D','7d','30d','90d','1y']` — no sprint task adds/removes from it. Cross-ref R-STAB-6. |
| **Audit mechanism** | Pre-task `Files:` audit + Phase B Codex |

### Mode F — Codex review scope >1MB on Phase D combined hardening

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase D close |
| **Caught by** | Phase D Codex orchestrator measures diff size before invoking |
| **Severity / Likelihood** | Medium / Medium |
| **Mitigation** | Per-bundle Codex passes (D-Audit, D-Contracts, D-Offline, D-Infra) split D's review into 4 separate passes. Each <1MB. Per Lesson #3. Cross-ref R-STAB-5. |
| **Audit mechanism** | Diff size measurement at Phase D close; per-bundle scope discipline |

### Mode G — Schema-drift CI guard (D4) flags every existing test on day 1 → CI red wave blocks merges

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase D — D4 task close |
| **Caught by** | D4 ships in 2 stages: stage 1 = `report-only` mode for 1 day (annotation-only, never red); stage 2 = `block` mode after triage and fixture cleanup |
| **Severity / Likelihood** | High / High (realistic on first run) |
| **Mitigation** | Stage 2 only enabled after report-only run is clean. AC2 of US-STAB-D4 specifies the staged rollout. Cross-ref R-STAB-7. |
| **Audit mechanism** | D4 release process + Phase D Codex |

### Mode H — Node 24 action-runtime migration breaks a workflow whose `uses:` action major version is incompatible

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase D — D5 task |
| **Caught by** | Pre-merge dry-run CI cycle on a test PR with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env flag set (AC2 of US-STAB-D5) |
| **Severity / Likelihood** | Medium / Low–Medium |
| **Mitigation** | Audit script `tests/integration/ci/action-versions-support-node24.test.ts` enforces only Node-24-compatible action majors. App-runtime Node bump tracked separately as opt-in `F-DEP-NODE22-APP-RUNTIME`. Cross-ref R-STAB-8. |
| **Audit mechanism** | AC1+AC2 of D5 + Phase D Codex |

### Mode I — Settings page completion (C3) hits unscoped server-side requirements

| Field | Value |
|---|---|
| **Sprint surfaces in** | Already mitigated at design time via DT-1 scope-down |
| **Caught by** | DT-1 design-time decision; no execution-time surface unless verification surfaces a true missing setting |
| **Severity / Likelihood** | Medium / Low (mitigated) |
| **Mitigation** | US-STAB-B6 stays patch-shaped; C3 slot officially unused. If verification surfaces a missing setting, story is minted as US-STAB-C4+ with explicit scope. Cross-ref R-STAB-9. |
| **Audit mechanism** | Design-time locked at DT-1; verification-report.md may surface a follow-up |

### Mode J — FINAL-US fails on a story authored without a proper RED test in plan-writing

| Field | Value |
|---|---|
| **Sprint surfaces in** | Phase E — FINAL-US task |
| **Caught by** | FINAL-US task discovers missing test files; escalates to P0 micro-fix |
| **Severity / Likelihood** | High / Medium |
| **Mitigation** | Every story in design-doc §4 has at least one `test-planned:` marker pointing to an actual file path. Plan-writing audit (Step 6 sub-agent) verifies every `test-planned:` path. If a story lands without a real test (RED→GREEN trace missing), it is escalated to a P0 micro-fix, NOT just marked complete. Cross-ref R-STAB-10. |
| **Audit mechanism** | FINAL-US Codex + 2-round cap |

---

## 2. Invariants — load-bearing project invariants the sprint MUST preserve

**Pointer:** Authoritative table with sources + enforcement lives in design-doc §10. Re-rendered with sprint-execution-time orientation:

| Invariant | Source | Threatened by (sprint task) | Audit mechanism at task-close time |
|---|---|---|---|
| **R1 firewall** | Project Lesson, `lib/auth/refresh-interceptor.ts` | A1, B4, C2, D2 (any new fetch path) | Per-task pre-flight grep for `fetch(` not wrapped in interceptor; per-task Codex (M+C) reviews this |
| **I11 client_id idempotency** | Project `architecture.md` | A1, B4, C2 (new mutation routes) | Per-task code review verifies `client_id` header acceptance + storage; per-task Codex |
| **Cache-tag set frozen `['24h','D','7d','30d','90d','1y']`** | Project `architecture.md` | Theoretically any task that touches cache-tags (sprint scope says NONE should) | Pre-task `Files:` review; per-phase Codex |
| **Weight bounds `[30, 350]` kg** | Project `PRD.md` F9 | B4 quick-add | AC2 of US-STAB-B4 explicit bounds-validation test |
| **lbToKg constant `0.45359237`** | Project `architecture.md` weight-conversion module | B4 (must import existing constant, no redefinition) | AC2 of US-STAB-B4 + per-task Codex |
| **AI accuracy 30/30 fixture set** | `tests/fixtures/ai-accuracy/critical.ts` | C1 prompt change | RED test asserts 30/30 BEFORE prompt change; new fixtures additive only; Phase C Testing Sweep re-runs |
| **Storage-FIRST cascade on account delete** | Project F14 | None — sprint introduces no change to `/api/account-delete` | Existing test harness re-runs at every Phase Testing Sweep |
| **Fail-closed deletion fence on mutation routes** | Project `architecture.md` | C2 inherits existing fence | Per-task Codex on C2 verifies fence preserved |
| **RLS 32-assertion harness GREEN** | Project test harness | A1, A3, C2, D6 (any DB schema or data change) | Phase A/C/D/E Testing Sweep gates include the harness |

---

## 3. Three adversarial reviewer perspectives

**Pointer:** Full prose for P-1..P-5, O-1..O-5, U-1..U-5 lives in design-doc §10. Re-rendered with sprint-execution-time orientation: status (locked-at-design / fix-expected-at-task / monitor-only).

### 3.1 Paranoid Staff Engineer (P-1..P-5)

| Concern | Sprint task | Status |
|---|---|---|
| **P-1** Library CRUD "Log Now" stale snapshot race (atomicity at click-time) | C2 | Fix expected at C2 — handler MUST read library item snapshot atomically at click-time (NOT cached list view); per-task Codex assertion: snapshot freshness contract documented |
| **P-2** Orphan-profile fence TOCTOU race | A3 | Fix expected at A3 — single-pass LEFT JOIN orphan-check (AC5); auth.uid() scoping on every aggregate (AC4); atomic INSERT ON CONFLICT for fallback (AC6) |
| **P-3** `lower(name)` is locale-dependent — Vietnamese diacritics may leak duplicates | D6 | Monitor + mitigate at D6 — pre-flight script `dedup-pre-flight.mjs` MUST normalize using ICU collation OR `unaccent` before dupe scan; migration 0018 SQL annotated with TODO `F-LIB-VN-DIACRITIC-DEDUP` if not addressed in this sprint |
| **P-4** Service worker pre-caches the new JSON 401 instead of user data | D2 | Fix expected at D2 — SW fetch-handler test asserts skip-on-401; reference `public/sw.js` audit at D2 close |
| **P-5** Phase E prod migration cutover — kalori-prod schema drift may break apply script | E1 | Fix expected at E1 — pre-flight schema diff in `apply-prod-migrations.mjs` halts on unexpected state; documented runbook in `migration-plan.md` Phase E section |

### 3.2 Over-Engineering Reviewer (O-1..O-5)

| Concern | Sprint task | Status |
|---|---|---|
| **O-1** Schema-drift CI guard scope creep | D4 | Locked at design — D4 scope deliberately bounded to CI annotation only (no auto-fix, no mock generation); acceptance evidence audit at Phase D close confirms footprint stays in `tests/integration/schema-drift/` only |
| **O-2** Per-user RDA override speculative for single-user MVP | C1 | Locked at design — migration 0019 DEFERRED per DT-5; C1 ships with code constants only; followup `F-MICROS-RDA-OVERRIDE-COLUMN` logged for post-MVP |
| **O-3** Node 24 ceremonial bumps for non-javascript-action workflows | D5 | Fix expected at D5 — scope only bumps `uses:` majors that ACTUALLY run javascript-actions; AC1 of D5 audit script allows skip for non-javascript-action workflows |
| **O-4** B5 nav audit duplicates existing axe + Playwright sweep | B5 | Locked at design — B5 is CI-time STATIC analysis (route map vs nav links), NOT a runtime test; AC1 distinguishes |
| **O-5** 6 verification sub-agents may degrade attention across 9–10 ACs each | A-VERIFY | Monitor at A-VERIFY — if quality empirically poor, Phase A orchestrator pauses + re-dispatches with 8–10 agents |

### 3.3 Under-Specification Reviewer (U-1..U-5)

| Concern | Sprint task | Status |
|---|---|---|
| **U-1** B4 AC1 "RSC re-fetches without hard reload" needs concrete falsification | B4 | Fixed at design-doc §4 (DT-7) — AC1 now reads "router.refresh() called, no window.location.reload(), Playwright network confirms only `_rsc=` POST to current path" |
| **U-2** C1 AC1 "30 micros" needs a concrete code constant | C1 | Fixed at design-doc §4 (DT-8) — AC1 references `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST`; AI prompt and dashboard both read from this constant |
| **U-3** A2 AC1 assumes happy-path Gmail; what about empty email? | A2 | Fixed at design-doc §4 (DT-9) — AC4 added: empty-email fallback to `user_metadata.full_name` then literal `"Account"`, NEVER "dev user" |
| **U-4** D3 AC3 (i18n static check) insufficient for runtime label-handler binding | D3 | Fixed at design-doc §4 (DT-10) — AC4 added: handler-binding regression test (Cancel→handleCancel, USE CURRENT VALUE→handleUseCurrent, distinct functions) |
| **U-5** Phase E (E1) AC2 "every migration applies successfully" needs explicit success criteria | E1 | Fixed at design-doc §10 U-5 — migration 0018 success defined as "Partial unique index exists in `pg_indexes` on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`"; 0019 deferred per DT-5 |

---

## 4. Sprint-execution-time orientation

For each failure mode (a–j), this section maps the catching surface across the sprint phases:

| Mode | Most likely surfaces in phase | Catching role | Why this role catches it |
|---|---|---|---|
| **A** Verification overflow | A | Phase A orchestrator | At Phase A close, count P0/P1 bugs in `verification-report.md` |
| **B** AI fixture regression | C | C1 implementation sub-agent (RED test) | Per-task TDD ordering: RED before GREEN; fixture re-run before prompt commit |
| **C** Migration dedup conflict | D | D6 implementation sub-agent (pre-flight) | `scripts/dedup-pre-flight.mjs` halts on existing dupes |
| **D** D3 scope explosion | (already mitigated) | DT-2 design-time decision | Locked at design |
| **E** Cache-tag conflict | B (parallel waves) | Orchestrator file-disjoint check | Pre-task `Files:` audit |
| **F** Phase D Codex >1MB | D | Phase D Codex orchestrator | Diff measurement before Codex invocation |
| **G** Schema-drift CI red wave | D | D4 implementation sub-agent (staged rollout) | Stage 1 report-only first |
| **H** Node 24 action-runtime break | D | D5 implementation sub-agent (dry-run PR) | `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` validation |
| **I** Settings unscoped | (already mitigated) | DT-1 design-time decision | Locked at design |
| **J** FINAL-US missing test | E | FINAL-US sub-agent | Discovers missing test file; escalates to P0 micro-fix |

For each invariant, the sprint task most actively threatening it + the audit mechanism at task-close:

| Invariant | Most active sprint task | Audit at task close |
|---|---|---|
| R1 firewall | A1, B4, C2, D2 | Per-task Codex grep for raw `fetch(` |
| I11 idempotency | A1, B4, C2 | Per-task Codex verifies `client_id` header + storage |
| Cache-tag frozen | (none — sprint scope) | Pre-task `Files:` audit; per-phase Codex |
| Weight bounds [30, 350] | B4 | AC2 explicit test |
| lbToKg constant | B4 | AC2 + per-task Codex (no redefinition) |
| AI accuracy 30/30 | C1 | C1 RED test + Phase C Testing Sweep |
| Storage-FIRST cascade | (none — no /api/account-delete change) | Existing test harness at every Phase Sweep |
| Deletion fence | C2 (inherits) | Per-task Codex |
| RLS 32-assertion harness | A1, A3, C2, D6 | Phase A/C/D/E Testing Sweep |

---

## 5. Risk register cross-reference

The sprint-level risk register (R-STAB-1 .. R-STAB-15) lives in design-doc §12 with full Severity / Likelihood / Mitigation / Owner-Phase columns.

Failure mode → Risk ID mapping:
- Mode A → R-STAB-1
- Mode B → R-STAB-2
- Mode C → R-STAB-3 (and partially R-STAB-12 for VN-diacritic case)
- Mode D → R-STAB-4 (mitigated)
- Mode E → R-STAB-6
- Mode F → R-STAB-5
- Mode G → R-STAB-7
- Mode H → R-STAB-8
- Mode I → R-STAB-9 (mitigated)
- Mode J → R-STAB-10

Adversarial concern → Risk ID:
- P-2 → R-STAB-11 (TOCTOU)
- P-3 → R-STAB-12 (VN diacritic)
- P-4 → R-STAB-13 (SW caches 401)
- P-5 → R-STAB-14 (prod schema drift)
- O-5 → R-STAB-15 (sub-agent attention)

---

End of failure analysis.
