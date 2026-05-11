# MVP Stabilization Sprint — Task Summary (Navigation Index)

**Purpose:** Quick navigation index for the 35 task cards in this sprint.

**Canonical source:** Full task definitions (Goal, verbatim ACs, Steps, FA block, Reads, Files, Notes) live at the `### Task <ID>: <name>` heading in root `Planning/tasks.md`. **This file is INDEX ONLY** — open the canonical source for actual execution detail.

**Quick lookup:** `grep "### Task A.1" Planning/tasks.md` (or any task ID) jumps you to the full card.

---

## How to execute tasks

When you're ready to work on a task, say one of these to start a session:

| Command | What happens |
|---------|--------------|
| `start tasks` | Routes to `superpowers-exec-tomi` → reads `Planning/progress.md` for current position → resumes from first non-✅ task in the sprint section |
| `continue tasks` | Same as `start tasks` |
| `do task A.1` | Jumps to the specified task (e.g., `do task B.4`, `do task D.6`, `do task FINAL-US`) |
| `status` | Reports current sprint state from `progress.md` without executing anything |

### What `superpowers-exec-tomi` does per task

1. **Reads the task card** from `Planning/tasks.md` (resolves the `### Task <ID>:` heading)
2. **Loads context** named in the card's `Reads:` field (typically: this folder's `design-doc.md`, `impact-analysis.md`, `migration-plan.md`; project `Planning/architecture.md`, `Planning/ui-design.md`, etc.)
3. **Resolves `Folder:` metadata** to load this FA folder's supporting artifacts as background context
4. **Executes per Canonical TDD Mandate**: writes a failing test asserting AC1 → confirms RED for right reason → writes minimal code to GREEN → refactors → runs full applicable test suite per Type tags
5. **For Medium/Complex tasks**: runs per-task Codex Adversarial Review (auto-fix sub-agent applied if findings)
6. **Captures Acceptance Evidence**: Lean (AC-to-test map in `progress.md` Notes) for Small + non-UI Medium; Full (`Planning/acceptance-evidence/task-<ID>.md` + screenshots + axe scan) for Complex / `[UI]`
7. **Updates `Planning/progress.md`** with status, files changed, tests added, commit hash
8. **Updates `Planning/CHANGELOG.md`** with task entry
9. **Commits** with conventional message (e.g., `task A.1: fix library save path; ensure newly-saved foods appear in library list`)
10. **Per phase boundary**: runs Phase Testing Sweep + Phase Codex Adversarial Review + audits acceptance evidence

### Phase ordering enforcement

Tasks within a phase have implicit dependency order. Within phase A: `A.1` → `A.2` → `A.3` → `A.VERIFY` → `A.E2E` → `A.SWEEP` → `A.CODEX`. Phase mandatory cards (Sweep + Codex) **must run last** in their phase — exec-tomi enforces this gate semantics.

---

## Phase A — Unblockers + Verification Dispatch (~4 days; 7 cards)

| Task | Story | Cx | Type tags | Goal (one-line) |
|------|-------|----|-----------|-----------------|
| **A.1** | US-STAB-A1 | Medium | `[backend][database][FA][brownfield]` | Library save bug fix — newly-saved foods appear in library with correct cache invalidation |
| **A.2** | US-STAB-A2 | Medium | `[UI][backend][FA][brownfield]` | Sidebar identity fix — show real Gmail user (not "dev user"); empty-email fallback |
| **A.3** | US-STAB-A3 | Medium | `[backend][API][FA][brownfield]` | Orphan profile fallback — 302 redirect to `/onboarding`; `auth.uid()` scoping; TOCTOU-safe single LEFT JOIN |
| A.VERIFY | (meta) | meta | `[user-story-verification][FA]` | Dispatch 6 parallel sub-agents (`general-purpose` × `opus`) to AC-by-AC verify all 19 PRD features → produces `verification-report.md` matrix |
| A.E2E | A1+A2+A3 (bundled) | — | `[e2e][user-story-e2e][testing]` | Bundled by design — share post-login flow per Step 6.4a |
| A.SWEEP | mandatory | — | `[testing]` | Phase A Testing Sweep |
| A.CODEX | mandatory | — | `[review]` | Phase A Codex Adversarial Review |

## Phase B — P1 Single-File Patches (~5 days; 9 cards)

| Task | Story | Cx | Type tags | Goal (one-line) |
|------|-------|----|-----------|-----------------|
| **B.1** | US-STAB-B1 | Small | `[UI][FA][brownfield]` | Verify root `/` auto-redirects authed → `/dashboard` (commit `d2e287c`); unauthed → landing |
| **B.2** | US-STAB-B2 | Small | `[UI][FA][brownfield]` | New-item form clears between submissions; no stale state on remount |
| **B.3** | US-STAB-B3 | Small | `[UI][FA][brownfield]` | Sidebar "Navigation" header — purposeful or removed; document choice |
| **B.4** | US-STAB-B4 | Medium | `[UI][backend][FA][brownfield]` | Progress page weight entry path + WeightQuickAdd `router.refresh()` (no full reload); `_rsc=` revalidation request asserted |
| **B.5** | US-STAB-B5 | Medium | `[UI][testing][infrastructure][FA][brownfield]` | Site-wide nav audit script + integration test + 404 canonical page |
| **B.6** | US-STAB-B6 | Small | `[UI][FA][brownfield]` | Settings stub copy delete (`lib/i18n/en.ts:769-770`); patch-shaped per DT-1 |
| B.E2E | B1–B6 (bundled) | — | `[e2e][user-story-e2e][testing]` | Bundled by design — share dashboard-area flows per Step 6.4a |
| B.SWEEP | mandatory | — | `[testing]` | Phase B Testing Sweep |
| B.CODEX | mandatory | — | `[review]` | Phase B Codex Adversarial Review |

## Phase C — P1 Feature Completion (~7 days; 9 cards)

**Execution order (revised 2026-05-02):** C.4 → C.5 → C.6 → C.1 → C.2 → C.E2E.1 → C.E2E.2 → C.SWEEP → C.CODEX. Verification-found bug fixes (C.4/C.5/C.6) run BEFORE new feature work (C.1/C.2) so the new features build on stabilized surfaces. Numbering preserved; execution order overrides ID order.

| Task | Story | Cx | Type tags | Goal (one-line) |
|------|-------|----|-----------|-----------------|
| **C.4** | US-STAB-C4 | Medium | `[database][API][backend][FA][brownfield]` | Library `log_count` / `last_used_at` bumped on re-log + reversed on undo (F-VERIFY-201, F4 AC5) |
| **C.5** | US-STAB-C5 | Medium | `[UI][backend][API][FA][brownfield]` | Confirmation screen Time editor compound child + 30-day backfill Zod refinement (F-VERIFY-203, F5 AC4) |
| **C.6** | US-STAB-C6 | Small | `[UI][FA][brownfield]` | Library grid card → `/library/[id]` detail page navigation wired (F-VERIFY-204, F19 AC1) |
| **C.1** | US-STAB-C1 | Complex | `[UI][backend][integration][FA]` | Micros/RDA dashboard panel + AI prompt extraction; `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (~30 entries from FDA + WHO baseline); %RDA computed client-side |
| **C.2** | US-STAB-C2 | Complex | `[UI][backend][API][database][FA][brownfield]` | Library CRUD completion (add/edit/delete with undo/list with pagination/search) |
| C.E2E.1 | US-STAB-C1 | — | `[e2e][user-story-e2e][testing]` | E2E for Micros/RDA panel |
| C.E2E.2 | US-STAB-C2 | — | `[e2e][user-story-e2e][testing]` | E2E for Library CRUD |
| C.SWEEP | mandatory | — | `[testing]` | Phase C Testing Sweep |
| C.CODEX | mandatory | — | `[review]` | Phase C Codex Adversarial Review |

> **C.3** ID intentionally skipped (gap preserved per A.VERIFY AC3 wording "C4..C?"). C.4/C.5/C.6 were minted post-Phase-A from `verification-report.md` P1 findings and are now committed cards in `Planning/tasks.md`. Empty placeholder cards explicitly NOT pre-emitted (per Codex Plan R2 N-C2 schema-compliance fix).

## Phase D — Hardening (~5 days; 9 cards)

| Task | Story | Cx | Type tags | Goal (one-line) |
|------|-------|----|-----------|-----------------|
| **D.1** | US-STAB-D1 | Medium | `[UI][testing][FA][brownfield]` | Dashboard zero serious/critical axe (nested-interactive, contrast, aria-valid-attr-value) |
| **D.2** | US-STAB-D2 | Medium | `[backend][API][FA][brownfield]` | Authed `/api/*` returns 401 JSON (not 302 HTML) for fetch/XHR; refresh-interceptor handles |
| **D.3** | US-STAB-D3 | Small | `[UI][testing][FA][brownfield]` | F10 conflict modal verify (already honest per Phase 5.1.5 fixes); log `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` deferred; AC4 distinct-onClick regression guard |
| **D.4** | US-STAB-D4 | Medium | `[testing][infrastructure][FA]` | Schema-drift CI guard — audits fixtures + `lib/**` + `app/api/**` + Supabase generated types staleness |
| **D.5** | US-STAB-D5 | Small | `[infrastructure][FA]` | Node 24 GitHub Actions runtime migration; deadline 2026-06-02 forced / 2026-09-16 hard-stop |
| **D.6** | US-STAB-D6 | Medium | `[database][backend][testing][FA][brownfield]` | Library duplicate-insert prevention; migration 0018 with `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE` + `SECURITY DEFINER` + 7-step BEGIN/LOCK/.../COMMIT cleanup |
| D.E2E | D1+D2+D6 (bundled) | — | `[e2e][user-story-e2e][testing]` | Bundled by design — D3/D4/D5 verified via integration/unit/CI not E2E |
| D.SWEEP | mandatory | — | `[testing]` | Phase D Testing Sweep |
| D.CODEX | mandatory | — | `[review]` | Phase D Codex Adversarial Review |

## Phase E — Closure (~1–2 days; 4 cards)

| Task | Story | Cx | Type tags | Goal (one-line) |
|------|-------|----|-----------|-----------------|
| **E.1** | US-STAB-E1 | Medium | `[review][infrastructure][FA]` | Closure paperwork: full test suite re-run → manual smoke → prod migration 0018 cutover via `scripts/apply-prod-migrations.mjs` → FA `Status: complete` → Task 5.4 ✅ → Phase 5 GATE CLOSED → project state update |
| E.SWEEP | mandatory | — | `[testing]` | Phase E Testing Sweep / End-of-Project Validation Sweep |
| **FINAL-US** | end-of-project | — | `[user-story-verification][e2e][testing]` | End-of-Project User Story Verification Pass across all 19 sprint stories; 2 fix rounds capped |
| E.CODEX | mandatory | — | `[review]` | Final Codex Adversarial Review (End-of-Project Codex) |

---

## Bug → Story → Phase mapping

| Bug source | Severity | Story | Phase |
|------------|----------|-------|-------|
| issuelog #4 — Library not saving | **P0** | US-STAB-A1 | A |
| issuelog #9 — "Dev user" identity in prod sidebar | **P0** | US-STAB-A2 | A |
| F-SEC-2026-04-25-ORPHAN-PROFILE-DASHBOARD-READ | **P0** (escalated) | US-STAB-A3 | A |
| issuelog #1 — Homepage redirect verification | P1 | US-STAB-B1 | B |
| issuelog #3 — New-item form retains text | P2 | US-STAB-B2 | B |
| issuelog #8 — Sidebar nav-header dead element | P3 | US-STAB-B3 | B |
| issuelog #11 + F-WEIGHT-QUICK-ADD-RSC-REFRESH | P1 + P2 | US-STAB-B4 | B |
| issuelog #6 — Site-wide nav audit | P2 | US-STAB-B5 | B |
| issuelog #7 — Settings page stub copy | P1 | US-STAB-B6 | B |
| issuelog #2 — Micronutrients/RDA missing | P1 | US-STAB-C1 | C |
| issuelog #5 + #10 — Library CRUD incomplete | P1 | US-STAB-C2 | C |
| F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS | **P1** (escalated) | US-STAB-D1 | D |
| F-API-401-VS-HTML-REDIRECT | P2 | US-STAB-D2 | D |
| F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT + -KEEP-OFFLINE-DEFERRED | P2 | US-STAB-D3 | D |
| F-UI-3.7-SCHEMA-DRIFT-GUARD | **P1** (escalated) | US-STAB-D4 | D |
| F-DEP-1 — GH Actions Node 24 deprecation | P2 (deadline 2026-06-02) | US-STAB-D5 | D |
| F-LIB-DEDUP-DUPLICATE-INSERT | P2 | US-STAB-D6 | D |
| Sprint closure paperwork | n/a | US-STAB-E1 | E |

---

## Card breakdown

- **19 implementation tasks** (P0+P1+P2 fixes mapped to user stories)
- **1 verification dispatch meta-task** (A.VERIFY)
- **5 user-story-e2e tasks** (A.E2E, B.E2E, C.E2E.1, C.E2E.2, D.E2E)
- **10 phase-mandatory cards** (5× Testing Sweep + 5× Codex Adversarial Review)
- **1 FINAL-US** end-of-project verification

**Total: 35 cards.**

Implementation tactics: **Approach 3 Hybrid** — P0 serial within Phase A (high stakes); 2–3 parallel impl sub-agents per Phase B/D themed bundle; 1–2 parallel sub-agents in Phase C; serial single sub-agent in Phase E.

---

## Out of scope (deferred to "post-MVP cleanup" tracker)

- ~50 P3 polish items in 5 clusters: `F-MINOR-5.2-*`, `F-UI-3.4-*`, `F-UI-3.5-*`, `F-UI-4.1-*`, `F-UI-4.3a/b-*`
- ~10 P3 individual items (font preload warnings, Sentry release mapping, missing PWA-install + offline-shell user-story E2E specs, visual baseline gaps, LHCI improvements, CI ergonomics, AI hardening)
- ~10 P4 cleanup (doc drift, ENV polish, FixtureSchema completeness, deferred AI suggestions)
- Migration 0019 (per-user RDA override) → `F-MICROS-RDA-OVERRIDE-COLUMN`
- F10 client-wins-resubmit full impl → existing `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`

---

## Pointers

- **Authoritative task definitions:** root `Planning/tasks.md` lines ~2010–3266
- **Authoritative design (conflict tiebreaker):** `design-doc.md` (this folder)
- **Sprint state file:** `brainstorm-state.md` (this folder)
- **Sprint progress tracker:** root `Planning/progress.md` → `## Sprint: MVP Stabilization (2026-05-01)` section
- **Pre-design + pre-plan checkpoints:** `brainstorm-context/01-pre-design.md` and `02-pre-plan.md`
- **Supporting artifacts:** `feature-brief.md`, `design-system-snapshot.md`, `migration-plan.md`, `impact-analysis.md`, `testing-strategy.md`, `failure-analysis.md` (all in this folder)
