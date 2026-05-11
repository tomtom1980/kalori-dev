# Design Doc — MVP Stabilization Sprint

**Authoritative conflict-tiebreaker for the sprint.** All downstream artifacts (`impact-analysis.md`, `migration-plan.md`, `testing-strategy.md`, `failure-analysis.md`, `tasks.md`, `verification-report.md`) reference back to this file. When this doc disagrees with a sprint artifact, this doc wins. When this doc disagrees with project-level docs (`Planning/design-doc.md`, `Planning/architecture.md`, etc.), the project-level doc wins (it is THE original tiebreaker).

---

## 1. Identity, Mode, Complexity Tier, Folder Layout

| Field | Value |
|---|---|
| **Sprint name** | MVP Stabilization Sprint |
| **Sprint slug** | `mvp-stabilization` |
| **Project** | Kalori |
| **Mode** | Feature Addition (Complex FA) layered on top of in-progress Phase 5.4 |
| **Complexity tier** | Complex FA — ~22 implementation tasks (~30–33 total task cards including phase-mandatory sweeps + e2e tasks) across 5 phases over ~3 weeks |
| **Sprint folder** | `Planning/features/2026-05-01-mvp-stabilization/` |
| **Sprint state file** | `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md` |
| **Tasks file** | Root `Planning/tasks.md` (each task carries `Folder: Planning/features/2026-05-01-mvp-stabilization/` metadata per CD1) |
| **Working dir** | `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp` |
| **Pre-design context** | `Planning/features/2026-05-01-mvp-stabilization/brainstorm-context/01-pre-design.md` |
| **Verification report (Phase A output)** | `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` |
| **Manifest** | `Planning/features/2026-05-01-mvp-stabilization/manifest.md` |
| **Acceptance evidence (Complex tasks)** | `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-<id>.md` |
| **Sprint UI fragments** | `Planning/features/2026-05-01-mvp-stabilization/ui-design-fragments/` |
| **Phase tracker** | `Planning/progress.md` (mirrored) |

**Folder layout (added to existing `Planning/features/`):**

```
Planning/features/2026-05-01-mvp-stabilization/
├── manifest.md                          (already exists)
├── brainstorm-state.md                  (already exists)
├── brainstorm-context/
│   └── 01-pre-design.md                 (already exists)
├── design-doc.md                        (THIS FILE)
├── impact-analysis.md                   (Step 6 sub-agent)
├── migration-plan.md                    (Step 6 sub-agent)
├── failure-analysis.md                  (Step 6 sub-agent — codified Section 10)
├── testing-strategy.md                  (Step 6 sub-agent)
├── verification-report.md               (Phase A output, written by 6 verification sub-agents)
├── design-system-snapshot.md            (locked from project — pointer only)
├── ui-design-fragments/                 (per-component UI specs as needed)
└── acceptance-evidence/                 (per-Complex-task evidence per D4)
    └── task-<id>.md
```

---

## 2. Scope Summary

### In-scope (this sprint)

**Source 1 — `bugs/issuelog.txt` (11 entries, all in scope):**

| # | One-line | Severity | Story |
|---|---|---|---|
| 1 | Homepage `/` should redirect authed users to `/dashboard` | P1 | US-STAB-B1 |
| 2 | Micronutrients (vitamins/minerals) not calculated/displayed; no RDA | P1 | US-STAB-C1 |
| 3 | New-item entry form retains previous text | P2 | US-STAB-B2 |
| 4 | Newly added items not saved to library | **P0** | US-STAB-A1 |
| 5 | Library management is incomplete (CRUD) | P1 | US-STAB-C2 (with #10) |
| 6 | Verify all navigation/site functions | P2 | US-STAB-B5 |
| 7 | Settings page shows "Settings arrive with Task 2.2" stub copy | P1 | US-STAB-B6 (patch-shaped — see §11 Open Item 1) |
| 8 | "Navigation" header at sidebar top is non-interactive | P3 | US-STAB-B3 |
| 9 | Sidebar shows "dev user" in prod despite Gmail login | **P0** | US-STAB-A2 |
| 10 | Library page lacks logged-food management (CRUD) | P1 | US-STAB-C2 (with #5) |
| 11 | Progress page shows "wait" with no add/modify option for weight | P1 | US-STAB-B4 |

**Source 2 — `Planning/followups.md` (9 selected, all in scope):**

| ID | Severity (re-tiered) | Story |
|---|---|---|
| `F-SEC-2026-04-25-ORPHAN-PROFILE-DASHBOARD-READ` | **P0** | US-STAB-A3 |
| `F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS` | **P1** | US-STAB-D1 |
| `F-API-401-VS-HTML-REDIRECT` | P2 | US-STAB-D2 |
| `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` + `F-OFFLINE-5.1.5-KEEP-OFFLINE-DEFERRED` | P2 | US-STAB-D3 (honest-copy fix — see §11 Open Item 2; full client-wins-resubmit impl remains deferred under the SAME existing ID, not a new `-IMPL` ID) |
| `F-UI-3.7-SCHEMA-DRIFT-GUARD` | **P1** | US-STAB-D4 |
| `F-DEP-1` (GH Actions Node 20 deprecation, deadline 2026-06-02) | P2 | US-STAB-D5 |
| `F-LIB-DEDUP-DUPLICATE-INSERT` | P2 | US-STAB-D6 |
| `F-WEIGHT-QUICK-ADD-RSC-REFRESH` | P2 | US-STAB-B4 (rolled in) |

**Source 3 — verification-found bugs (TBD post-Phase-A).** Triaged into Phase B/C at Phase A close. Stories `US-STAB-C4..C?` minted from the verification report.

**Source 4 — Codex deferrals from Phase 5.x.** Already covered in Source 2 (F-OFFLINE-5.1.5-* derives from Phase 5.1.5 Codex Round 1 F2/F3).

### Deferred (post-MVP cleanup tracker)

**~67 entries from `Planning/followups.md` deferred** — broken into 5 P3 polish clusters (`F-MINOR-5.2-*`, `F-UI-3.4-*`, `F-UI-3.5-*`, `F-UI-4.1-*`, `F-UI-4.3a/b-*`) + ~10 P3 individual items + ~10 P4 cleanup items. Closure: `Status: DEFERRED-soft-launch (revisit post-MVP)` per D6.

### Coverage acceptance

User explicitly asked at Q2/Q5: "are we fixing all the bugs?" Locked answer per Q1=B (Soft-launch ready) is YES for all 11 issuelog + 9 followups + verification-found + Phase 5.x Codex deferrals. P3 polish DEFERRED transparently.

---

## 3. Architecture / Phase Plan

5 phases × 4–6 tasks ≈ 22 implementation tasks + per-phase Codex Review + per-phase Testing Sweep + FINAL-US.

### Phase A — Unblockers + Verify Dispatch (3 days)

**Theme:** Land the 3 P0 fixes serially while a 6-agent verification fan-out runs in parallel.

**Tasks:** 3 P0 implementation + 1 verification dispatch task + Phase A Testing Sweep + Phase A Codex Review.

**Sub-agent dispatch shape:**
- P0 fixes are **serial within Phase A** (high stakes, prevents data loss / auth confusion / library save).
- Verification dispatch fans out 6 sub-agents (`general-purpose`, `model: opus`, ~3 features each) on Day 1.
- Verification report due Day 2; bugs fold into Phase B/C at triage.

**Gate criteria:**
- All 3 P0 reproducer tests written + commits include RED→GREEN trace per CTM.
- `verification-report.md` complete with per-feature × per-AC matrix.
- Phase A Codex returns `OK` (or 2-round auto-fix passes).
- Phase A Testing Sweep: full suite GREEN; AI accuracy 30/30 unchanged; RLS 32-assertion harness GREEN.

### Phase B — P1 Single-File Patches (4–5 days)

**Theme:** Ship the small UI/API patches in 2–3 parallel themed bundles.

**Tasks:** 6 stories (B1–B6) executed in 2–3 parallel sub-agents per bundle wave, plus Phase B Testing Sweep + Phase B Codex Review.

**Bundle plan:**
- **Bundle B-Nav:** B1 (root redirect) + B3 (sidebar Navigation header) + B5 (nav audit).
- **Bundle B-Forms:** B2 (form clear after save) + B4 (Progress page weight quick-add + RSC refresh).
- **Bundle B-Settings:** B6 (Settings stub copy patch).

**Sub-agent dispatch shape:**
- Wave 1: B-Nav bundle (3 sub-agents, parallel — files don't overlap).
- Wave 2: B-Forms bundle (2 sub-agents, parallel — files don't overlap).
- Wave 3: B-Settings (1 sub-agent — single-file copy patch).

**Gate criteria:**
- Per-task TDD RED→GREEN trace.
- Per-task Codex (`Per-task (required)`) for each Medium task; per-phase Codex covers Small.
- Phase B Testing Sweep: full suite GREEN; per-task acceptance evidence audited.
- E2E `[user-story-e2e]` task closes the phase.

### Phase C — P1 Feature Completion (5–6 days)

**Theme:** 2–3 net-new feature surfaces (Library CRUD, Micros/RDA panel, plus any C4+ from verification report).

**Tasks:**
- C1: Micros/RDA on AI prompt + dashboard panel (Complex).
- C2: Library CRUD UI (Complex; bundles issuelog #5 + #10).
- C3: TBD post-Phase-A — only if US-STAB-B6 escalates (it does not — see §11 Open Item 1, so C3 stays empty unless verification surfaces a new feature need).
- C4+: TBD post-Phase-A from verification report.

**Sub-agent dispatch shape:**
- 1–2 parallel impl sub-agents (smaller phase, larger features).
- C1 owns AI prompt change + RDA constants + dashboard panel — all in C1's subagent scope.
- C2 owns full library CRUD: list / detail / edit / delete / log-now — wider but UI-shaped.

**Gate criteria:**
- AI accuracy 30/30 fixture pass rate preserved (mandatory invariant from Lessons #5).
- New VN micros fixtures additive (do not regress critical.ts existing 5-VN smoke).
- Library RLS 32-assertion harness GREEN after C2 (CRUD touches food_library_items).
- Phase C Codex Review under 1MB scope budget.
- E2E `[user-story-e2e]` task per story.

### Phase D — Hardening (4–5 days)

**Theme:** Cross-cutting hardening — a11y, API contract, offline modal honesty, schema-drift guard, infra deprecations, library dedup migration.

**Tasks:** D1 (a11y), D2 (API 401 vs HTML), D3 (F10 modal honest copy — see §11 Open Item 2), D4 (schema-drift CI guard), D5 (Node 24 GitHub Actions runtime migration), D6 (F-LIB-DEDUP partial unique index).

**Bundle plan (parallel waves):**
- **Bundle D-Audit:** D1 (a11y) + D4 (schema-drift CI guard) — both auditing/guarding.
- **Bundle D-Contracts:** D2 (API 401 contract) + D6 (DB partial unique index) — both contract/data shape.
- **Bundle D-Offline:** D3 (F10 modal copy) — single-file UI fix, decoupled.
- **Bundle D-Infra:** D5 (Node 24 action-runtime readiness) — workflow `uses:` major-version bumps; not a single-file change.

**Sub-agent dispatch shape:**
- Wave 1: D-Audit + D-Contracts (2–3 sub-agents — independent files).
- Wave 2: D-Offline + D-Infra (2 sub-agents — independent files).

**Gate criteria:**
- D6 partial unique index: pre-flight dedup probe on dev DB BEFORE migration runs (else FF #C trigger).
- D5 Node 24 action runtime: every workflow's `uses:` declarations bumped to major versions that support Node 24 javascript-action runtime; matrix verified GREEN before merge under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.
- D4 schema-drift guard: starts in `report-only` mode for 1 day, then `block` mode (else FF #G trigger).
- Phase D Codex Review under 1MB scope (split into per-bundle passes if needed per Lesson #3).

### Phase E — Closure (2 days)

**Theme:** Manual smoke against issuelog, prod migration cutover, post-fix evidence diff vs Phase A pre-fix evidence, sprint close.

**Tasks:** E1 (manual smoke + prod cutover) + Phase E Testing Sweep + Phase E Codex Review + FINAL-US.

**Sub-agent dispatch shape:**
- Serial, single sub-agent — high coordination, low per-task complexity, requires human checkpoint.

**Gate criteria:**
- All 11 issuelog entries re-verified with post-fix screenshot evidence.
- Pre-fix evidence diff against verification-report.md → all `Pass/Fail` columns flip to `Pass`.
- All 17 + sprint migration 0018 applied to kalori-prod via `scripts/apply-prod-migrations.mjs` (0019 deferred per DT-5).
- FINAL-US runs every sprint user-story E2E against finalized build, 2 fix rounds capped.
- `Planning/progress.md` Phase 5 + Sprint Phase E both close.
- Sprint moves to `state: complete` in `brainstorm-state.md`.

### Phase day budget summary

| Phase | Theme | Days | Tasks |
|---|---|---|---|
| A | Unblockers + Verify | 3 | 3 P0 + 1 verify dispatch + sweep + codex = 6 |
| B | P1 Patches | 4–5 | 6 stories + 1 user-story-e2e + sweep + codex = 9 |
| C | P1 Features | 5–6 | 2–3 features + 1–N user-story-e2e + sweep + codex = 5–7 |
| D | Hardening | 4–5 | 6 stories + 1 user-story-e2e + sweep + codex = 9 |
| E | Closure | 2 | 1 closure + sweep + codex + FINAL-US = 4 |
| **Total** | | **~18–21 days (~3 weeks)** | **~33 tasks (incl. sweeps + codex + e2e + FINAL-US)** |

---

## 4. Phase Deliverables & User Stories

### Story ID conventions (LOCKED)

- IDs `US-STAB-A1..E1` — stable, do not rename.
- C4+ slots reserved for verification-report-discovered bugs.
- Each story has 1–5 falsifiable ACs in Given/When/Then form.
- ACs map 1:1 or 1:N to test assertions per CTM (`test:` or `test-planned:` markers per task-schema.md §Acceptance Criteria Rules).

### Phase A stories

#### US-STAB-A1 — Library save on new-item creation (issuelog #4, P0)

**As a** logged-in user logging a new food via the Library entry form,
**I want** the new food item to actually persist into my personal library,
**So that** I can re-log it next time without re-typing or re-photographing.

**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I have 0 entries with name `'kale-A1-test'` in `food_library_items`, WHEN I create a new item via the Library new-item form, THEN a row appears in `food_library_items` with my `user_id` AND the item is visible in the library list on next reload. *(test-planned: tests/integration/library-create.test.ts::persists-to-food-library-items)*
- AC2: GIVEN I am logged in AND I have just created a new library item, WHEN I navigate to `/library`, THEN the new item is visible in my library list within 1 second of navigation completion. *(test-planned: tests/e2e/web/user-stories/US-STAB-A1.spec.ts::library-create-visible-after-nav)*
- AC3: GIVEN I am logged in AND another user (RLS test fixture) has 0 entries, WHEN I create a new library item, THEN the other user's library list is unchanged. *(test: existing RLS 32-assertion harness extended; library_items_user_isolation case)*

#### US-STAB-A2 — Sidebar identity shows real Gmail login (issuelog #9, P0)

**As a** Google-OAuth-authenticated user in production,
**I want** the sidebar to display my real Gmail address,
**So that** I trust I am viewing my own data, not a dev fixture user.

**Acceptance Criteria:**
- AC1: GIVEN I am logged in via Google OAuth in production AND my Gmail is `tamas.szalay@gmail.com`, WHEN I render any page that includes the sidebar, THEN the sidebar identity row reads `tamas.szalay@gmail.com`, NOT `dev user`. *(test-planned: tests/e2e/web/user-stories/US-STAB-A2.spec.ts::sidebar-shows-gmail-not-devuser)*
- AC2: GIVEN I am logged in AND my email contains exotic characters (encode test fixture), WHEN the sidebar renders, THEN the email is HTML-escaped and not raw-injected. *(test-planned: tests/unit/sidebar/identity-row.test.tsx::escapes-email-html)*
- AC3: GIVEN I am NOT logged in (anon visit), WHEN the sidebar renders, THEN the identity row displays the configured anonymous placeholder per `ui-design.md` (NOT `dev user`). *(test-planned: tests/unit/sidebar/identity-row.test.tsx::anon-shows-placeholder)*
- AC4: GIVEN I am logged in via Google OAuth AND the email scope was not granted (empty `auth.users.email`), WHEN the sidebar renders, THEN the identity row falls back to `auth.users.user_metadata.full_name` if available, else the literal string `Account` — and NEVER displays `dev user` or any hardcoded test identifier. *(test-planned: tests/unit/sidebar/identity-row.test.tsx::email-missing-falls-back-to-fullname-or-account-literal)*

#### US-STAB-A3 — Orphan-profile dashboard read fence (F-SEC-2026-04-25-*, P0)

**As a** user with a missing profile row (orphaned `auth.users`),
**I want** graceful redirect to `/onboarding` to complete profile setup,
**So that** I can recover access without seeing a 500 error AND without any chance of seeing another user's data.

**Acceptance Criteria:**
- AC1: GIVEN a logged-in user whose `profiles` row is missing (orphan-state fixture) AND who hits any of the affected route handlers (dashboard, log, library, progress, weight, settings), WHEN they request the page, THEN the response is a 302 server-side redirect to `/onboarding` (NOT a 401 JSON, NOT a graceful empty-state of dashboard, NOT another user's aggregates). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::redirects-302-to-onboarding)*
- AC2: GIVEN the same orphan state, WHEN the user calls any dashboard-aggregate API endpoint, THEN every endpoint returns a JSON 401 with `Content-Type: application/json` and body `{ "error": "profile_lookup_failed" }` (per US-STAB-D2 contract). API routes do NOT serve a 302 — only page route handlers do. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::all-aggregate-api-endpoints-401)*
- AC3: GIVEN the dashboard route handler logs a Sentry breadcrumb on orphan detection, WHEN orphan is detected, THEN Sentry receives a `dashboard.orphan-profile-fenced` breadcrumb with anonymized user_id (hash of `auth.uid()`, NOT the raw UUID). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::sentry-breadcrumb)*
- AC4: GIVEN the affected route handlers (dashboard, log, library, progress, weight, settings), WHEN any aggregate query runs, THEN every query is constrained to `auth.uid()` via either RLS enforcement OR an explicit `WHERE user_id = auth.uid()` predicate; no other user's profile or aggregate row is returned even when `profile_lookup_failed`. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::auth-uid-scoping-enforced-on-every-aggregate)*
- AC5: GIVEN a single request entering an affected route handler, WHEN profile lookup AND the page's primary aggregate fetch happen, THEN they are co-located in a single SQL operation (LEFT JOIN OR a single transaction) — no possibility of profile being valid for one query and missing for another in the same request (TOCTOU-safe per P-2). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::single-pass-profile-aggregate-toctou-safe)*
- AC6: IF the implementation chooses the fallback-create-profile branch instead of redirect, THEN it creates ONLY `profiles.id = auth.uid()` in one atomic `INSERT INTO profiles (id) VALUES (auth.uid()) ON CONFLICT (id) DO NOTHING` server-side; no client-controlled fields are accepted; the insert is followed by the same redirect-to-onboarding so the user completes profile setup explicitly. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::fallback-insert-no-client-fields-then-redirect)*

#### US-STAB-A-VERIFY (verification dispatch — non-implementation)

**As a** sprint orchestrator,
**I want** all 19 PRD features re-verified AC-by-AC against the live HEAD build by 6 parallel sub-agents on Day 1,
**So that** Phase B/C scope is grounded in evidence, not assumption.

**Acceptance Criteria:**
- AC1: GIVEN 6 sub-agents are dispatched (`general-purpose`, `model: opus`) with ~3 features each, WHEN all sub-agents return, THEN `verification-report.md` exists with one row per `Feature ID × AC ID`. *(manual: artifact existence check + matrix completeness audit)*
- AC2: GIVEN a Pass/Fail column per row, WHEN rendered, THEN every Fail row has a populated `Bug ID`, `Severity`, `Area`, `Recommended Phase`, AND `Evidence Path`. *(manual: per-row column audit script `scripts/verify-report-completeness.mjs`)*
- AC3: GIVEN a verification-found bug at `Severity: P0` or `P1`, WHEN sprint orchestrator reads the report, THEN a story `US-STAB-C4..C?` is minted in `tasks.md` with `Folder:` metadata. *(manual: `tasks.md` diff after Phase A close)*

### Phase B stories

#### US-STAB-B1 — Authed users redirected to /dashboard from / (issuelog #1, P1)

**As a** logged-in user opening the homepage,
**I want** to land on `/dashboard` immediately,
**So that** I don't bounce through a marketing/landing page on every visit.

**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I navigate to `/`, WHEN the request resolves, THEN I land on `/dashboard` (HTTP 302 server-side OR client-side replace). *(test-planned: tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-redirects-authed-to-dashboard)*
- AC2: GIVEN I am NOT logged in AND I navigate to `/`, WHEN the request resolves, THEN I see the public landing page (no auth gate, no redirect to dashboard). *(test-planned: tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-shows-landing-anon)*
- AC3: GIVEN the redirect is server-side, WHEN measured at a cold response, THEN total LCP delta vs the landing baseline is within +50ms (no waterfall added). *(manual: lighthouse delta against `tests/lighthouse/landing.json`)*

#### US-STAB-B2 — New-item form clears after save (issuelog #3, P2)

**As a** user adding a new food via Library,
**I want** the input fields to clear after a successful save,
**So that** I can immediately add another item without manual deletion.

**Acceptance Criteria:**
- AC1: GIVEN the new-item form has any input value, WHEN I submit successfully (server returns 2xx), THEN every input resets to its initial empty/default state. *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::clears-on-success)*
- AC2: GIVEN the new-item form has input values, WHEN I submit and the server returns an error, THEN inputs are preserved (do not clear). *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::preserves-on-error)*
- AC3: GIVEN the form just cleared after save, WHEN I focus the first input, THEN it has focus AND the cursor is positioned at offset 0. *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::focus-first-input-after-clear)*

#### US-STAB-B3 — Sidebar "Navigation" header is not a misleading control (issuelog #8, P3)

**As a** user reading the sidebar,
**I want** the "Navigation" label at the top to behave as a non-interactive heading,
**So that** I am not confused by a clickable-looking element that does nothing.

**Acceptance Criteria:**
- AC1: GIVEN the sidebar is rendered, WHEN I inspect the "Navigation" header, THEN it is a `<h2>` (or equivalent) with no `href`, no `onClick`, no `tabindex` 0. *(test-planned: tests/unit/sidebar/nav-header-non-interactive.test.tsx::no-interactive-attrs)*
- AC2: GIVEN the same element, WHEN keyboard-traversed via Tab, THEN it is NOT in the tab order (skipped). *(test-planned: tests/unit/sidebar/nav-header-non-interactive.test.tsx::not-in-tab-order)*
- AC3: GIVEN the same element, WHEN inspected via axe, THEN no a11y violation arises (proper heading semantics). *(test: existing axe sweep extended to cover sidebar `<nav>` block)*

#### US-STAB-B4 — Progress page weight quick-add + RSC refresh (issuelog #11 + F-WEIGHT-QUICK-ADD-RSC-REFRESH, P1)

**As a** user on the Progress page who needs to log a new weight,
**I want** an inline weight quick-add control with a server-side refresh after save,
**So that** I see my updated weight without manually reloading.

**Acceptance Criteria:**
- AC1: GIVEN I am on `/progress`, WHEN I click the weight quick-add affordance and submit a value, THEN the weight is saved AND the page state updates via `router.refresh()` only — NO `window.location.reload()` and NO full-document navigation; Playwright network confirms the refresh issues an `_rsc=` revalidation request to the current path, NOT a full HTML re-fetch. *(test-planned: tests/e2e/web/user-stories/US-STAB-B4.spec.ts::quick-add-router-refresh-no-hard-reload)*
- AC2: GIVEN the same flow, WHEN the value is outside `[30, 350]` kg or violates the lbToKg conversion (constant `0.45359237`), THEN an inline error renders AND no save occurs. *(test-planned: tests/unit/progress/weight-quick-add.test.tsx::bounds-validation)*
- AC3: GIVEN a successful save, WHEN I check the rendered chart, THEN the new datapoint appears within 1.5s of submit. *(test-planned: tests/e2e/web/user-stories/US-STAB-B4.spec.ts::chart-updated-after-save)*
- AC4: GIVEN the save call hits an offline conflict, WHEN the F10 modal mounts, THEN it does NOT show a lying CTA (D3 contract — see US-STAB-D3). *(test: cross-reference D3 honest-copy contract)*

#### US-STAB-B5 — Site-wide nav audit closes broken/orphan links (issuelog #6, P2)

**As a** user clicking around the app,
**I want** every visible nav link to land on its intended destination with no 404 / dead pages,
**So that** I trust the app's UI as the source of truth.

**Acceptance Criteria:**
- AC1: GIVEN the audit script `scripts/nav-audit.mjs` walks every `<a>` and `<Link>`, WHEN the script runs against HEAD, THEN it reports zero 404s, zero dead links, zero orphan-pages. *(test-planned: tests/integration/nav-audit.test.ts::no-404s-no-orphans)*
- AC2: GIVEN sidebar + topbar + footer + dashboard tile links, WHEN I traverse each via keyboard, THEN every link has a visible focus ring AND lands on the correct destination. *(test: extends existing axe + Playwright nav e2e suite)*
- AC3: GIVEN a deliberate 404 fixture (e.g. `/this-page-does-not-exist`), WHEN visited, THEN the 404 page renders the canonical Kalori 404 component (NOT a generic Next default). *(test-planned: tests/e2e/web/404.spec.ts::canonical-404-page)*

> **Note on functional coverage scope:** Functional coverage of route-level primary actions (onboarding "Save", logging "Confirm", dashboard quick-add buttons, etc.) is owned by Phase A verification report (`verification-report.md` per-feature × per-AC matrix). US-STAB-B5 specifically covers nav links, keyboard traversal, and 404 behavior — does NOT include button-level functional checks. Don't double-bill this work into B5.

#### US-STAB-B6 — Settings stub copy removed (issuelog #7, P1, patch-shaped per §11 Open Item 1)

**As a** user opening `/settings`,
**I want** the obsolete "Settings arrive with Task 2.2" copy removed,
**So that** I see the actual functional Settings page (which already renders ReduceMotionToggle, DataSubsection, AccountSubsection).

**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I navigate to `/settings`, WHEN the page renders, THEN the string "Settings arrive with Task 2.2" does NOT appear in the DOM. *(test-planned: tests/unit/settings/page.test.tsx::no-stub-body-copy)*
- AC2: GIVEN the same page, WHEN it renders, THEN the page has exactly one `<h1>` element with text "Settings" sourced from `lib/i18n/en.ts::settings.heading`, AND the stub copy at `lib/i18n/en.ts:769-770` (currently "Settings arrive with Task 2.2...") is deleted from the i18n bundle. *(test-planned: tests/unit/settings/page.test.tsx::single-h1-from-i18n-and-stub-deleted)*
- AC3: GIVEN the page, WHEN ReduceMotionToggle / DataSubsection / AccountSubsection render, THEN all three components remain mounted and functional (no regression). *(test: existing Settings spec extended)*

### Phase C stories

#### US-STAB-C1 — Micros + RDA on AI prompt and dashboard (issuelog #2, P1, Complex)

**As a** user logging food via text or photo,
**I want** the AI to extract micronutrients (vitamins + minerals) AND the dashboard to display them as `% of RDA`,
**So that** I see nutritional completeness, not just calories + macros.

**Acceptance Criteria:**
- AC1: GIVEN the Gemini AI prompt for `F2 Text Log` and `F3 Photo Log`, WHEN it returns, THEN the response contains a `micros` field with exactly the micronutrients listed in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (the canonical sprint-time micronutrient set, ~30 entries derived from FDA + WHO baseline: Vit A/B/C/D/E/K, Folate, B12, Niacin, Riboflavin, Thiamin, Pantothenic, Biotin, Iron, Calcium, Magnesium, Zinc, Selenium, Iodine, Potassium, Phosphorus, Copper, Manganese, Chromium, Molybdenum, Sodium, Chloride, Choline, plus Vit B6 — descriptive context only; the constant is the single source of truth). *(test-planned: tests/unit/ai/micros-extraction.test.ts::all-30-micros-present-in-response)*
- AC2: GIVEN the existing `tests/fixtures/ai-accuracy/critical.ts` 30-fixture suite, WHEN the AI prompt change ships, THEN the suite still passes 30/30 (no regression — Lesson #5 invariant). *(test: existing tests/unit/ai/vn-smoke.test.ts + critical.ts)*
- AC3: GIVEN the dashboard renders, WHEN today's entries are aggregated, THEN a "Micros" panel renders below the existing Macros panel showing each micronutrient in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` as a `% of RDA` chip with the corresponding code constant from `DEFAULT_MICROS_LIST` as the denominator (per-user RDA override DEFERRED per DT-5 / O-2). *(test-planned: tests/integration/dashboard-micros-panel.test.tsx::renders-thirty-micros-with-pct-rda)*
- AC4: GIVEN the dashboard reads RDA values from `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` code constants (per-user `profiles.micros_rda_override` column DEFERRED per DT-5 / O-2 — see `F-MICROS-RDA-OVERRIDE-COLUMN`), WHEN the dashboard computes `% of RDA`, THEN the default code constant is used for every micronutrient. *(test-planned: tests/unit/dashboard/micros-rda-resolver.test.ts::reads-default-constants)*
- AC5: GIVEN the RDA panel renders, WHEN the values are 0/null (sparse data), THEN the panel renders the empty-state described in `ui-design.md` (NOT a chart with 0% for all 30 micros). *(test-planned: tests/integration/dashboard-micros-panel.test.tsx::sparse-data-empty-state)*

#### US-STAB-C2 — Library CRUD UI (issuelog #5 + #10, P1, Complex)

**As a** Library page user,
**I want** to view, edit, delete, and re-log my own library items + my logged-foods history with full CRUD,
**So that** Library is a real management surface, not a read-only list.

**Acceptance Criteria:**
- AC1: GIVEN I am on `/library`, WHEN it renders, THEN I see two sections: "My Library" (`food_library_items`) AND "Recent Entries" (`food_entries`). *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::two-sections-visible)*
- AC2: GIVEN a library item, WHEN I click "Edit", THEN a detail/edit modal opens with all fields populated AND I can save changes via a single CTA. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::edit-modal-saves)*
- AC3: GIVEN a library item, WHEN I click "Delete" AND confirm, THEN the row is removed from the list AND from `food_library_items`. *(test-planned: tests/integration/library-crud.test.ts::delete-removes-row)*
- AC4: GIVEN a library item, WHEN I click "Log Now", THEN a new `food_entries` row is created for today AND I see it in the entries list. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::log-now-creates-entry)*
- AC5: GIVEN any CRUD action runs, WHEN the existing 32-assertion RLS harness runs after the migration, THEN every assertion passes (cross-user isolation preserved). *(test: existing RLS harness)*

#### US-STAB-C3 — RESERVED, EMPTY (per §11 Open Item 1)

US-STAB-B6 stays patch-shaped, so US-STAB-C3 slot is **EMPTY**. If verification surfaces a feature-shaped need, slot is reusable; otherwise the ID is officially unused.

#### US-STAB-C4..C? — TBD post-Phase-A from verification report

Story IDs minted at Phase A close. Each follows the same template: AS/WHEN/THEN + 1–5 ACs + test-planned markers. ACs are falsifiable per CTM.

### Phase D stories

#### US-STAB-D1 — Dashboard a11y violations resolved (F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS, P1)

**As a** user with assistive technology (screen reader, high-contrast mode, keyboard-only),
**I want** the dashboard to render without axe violations,
**So that** the app meets WCAG 2.1 AA per `ui-design.md`.

**Acceptance Criteria:**
- AC1: GIVEN the dashboard is rendered, WHEN axe-core runs against it, THEN zero violations are reported across the page. *(test-planned: tests/integration/dashboard-a11y.test.tsx::axe-zero-violations + tests/e2e/web/dashboard-a11y.spec.ts::axe-zero-violations)*
- AC2: GIVEN every interactive element on the dashboard, WHEN traversed via Tab, THEN focus rings render with the IVORY 2px outline + 2px offset (NOT oxblood — per design-doc §FocusRing). *(test-planned: tests/visual/dashboard-focus-ring.test.ts::ivory-focus-ring)*
- AC3: GIVEN a screen reader reads the dashboard, WHEN any chart/gauge renders, THEN it has a textual alternative (aria-label or sibling visually-hidden text). *(test-planned: tests/integration/dashboard-a11y.test.tsx::charts-have-aria-labels)*

#### US-STAB-D2 — API 401 returned as JSON, never HTML redirect (F-API-401-VS-HTML-REDIRECT, P2)

**As a** SPA fetch consumer or PWA service worker,
**I want** unauthenticated API calls to return JSON 401 with `WWW-Authenticate: Bearer realm="kalori"`,
**So that** I can refresh the session via the interceptor without parsing HTML redirects.

**Acceptance Criteria:**
- AC1: GIVEN an unauthenticated fetch to any `/api/*` endpoint, WHEN the request runs, THEN the response is a 401 with `Content-Type: application/json` AND a body of `{ "error": "unauthenticated" }`. *(test-planned: tests/integration/api-401-shape.test.ts::api-returns-json-401)*
- AC2: GIVEN the same request, WHEN the response is inspected, THEN there is NO `Location:` header AND NO HTML body. *(test-planned: tests/integration/api-401-shape.test.ts::no-location-header)*
- AC3: GIVEN the refresh interceptor (`lib/auth/refresh-interceptor.ts`), WHEN it sees a 401 with the new shape, THEN it triggers a session refresh (R1 invariant preserved). *(test: existing refresh-interceptor.test.ts extended)*

#### US-STAB-D3 — F10 conflict modal honest-copy fix (F-OFFLINE-5.1.5-*, P2, honest-copy scope per §11 Open Item 2)

**As a** user resolving an offline goal-weight conflict,
**I want** the modal CTAs to do exactly what their labels say AND ESC to close non-destructively,
**So that** I never lose data via a button that lies about its action.

**Acceptance Criteria:**
- AC1: GIVEN the modal renders, WHEN I read both buttons, THEN one says "USE CURRENT VALUE" (which calls `actions.resolveConflict(client_id, 'use-current')`) AND the other says "CANCEL" (which closes the modal non-destructively). *(test: existing tests/unit/pwa/GoalWeightConflictModal.test.tsx — already passes per current code)*
- AC2: GIVEN the modal is open, WHEN I press ESC, THEN the modal closes AND `dismissedIds` records the `client_id` AND no `actions.resolveConflict` is called. *(test: existing test — already passes per current code)*
- AC3: GIVEN any future net-new conflict-related copy in `lib/i18n/en.ts`, WHEN it lands in this story, THEN it never includes the deprecated "USE OFFLINE VALUE" string OR any other label that does not match its handler. *(test-planned: tests/unit/i18n/en.test.ts::no-deprecated-conflict-copy)*
- AC4: Click handler binding regression guard — Cancel and primary CTA buttons each have distinct `onClick` handlers verified by integration test asserting they call different functions (no shared/swapped handler). Specifically: clicking Cancel invokes `handleCancel` (NOT `handleUseCurrent`), and clicking "USE CURRENT VALUE" invokes `handleUseCurrent` (NOT `handleCancel`). *(test-planned: tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx::label-handler-bound-correctly-and-distinct)*

> **Note (per §11 Open Item 2):** the modal already implements honest copy after Phase 5.1.5 Codex F2/F3. US-STAB-D3 is a verification-only story — it confirms the contract holds AND adds the regression-prevention copy guard (AC3) + the click-handler binding regression guard (AC4). Full client-wins-resubmit impl remains deferred under the **existing followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`** (do NOT mint a duplicate `-IMPL` ID); update its status note to: "D3 honest-copy-only scope-down verified in this sprint; full client-wins-resubmit impl remains DEFERRED to post-MVP cleanup."

#### US-STAB-D4 — Schema-drift CI guard (F-UI-3.7-SCHEMA-DRIFT-GUARD, P1)

**As a** Kalori test author,
**I want** every mock that returns DB columns to be checked against the live Supabase schema in CI,
**So that** the schema-drift class of failure (Lesson #2) cannot silently break tests against prod.

**Acceptance Criteria:**
- AC1: GIVEN a CI workflow `schema-drift-check.yml`, WHEN it runs against HEAD, THEN it audits BOTH test fixtures (under `tests/**`) AND application code paths in `lib/**` and `app/api/**` that use `.from('<table>').select(...)` or `.insert({...})` (or any other Supabase client builder that names columns); the guard parses literal table/column references and compares them against the actual live schema via either Supabase generated types OR live DB introspection in CI. *(test-planned: tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::audits-both-fixtures-and-app-code)*
- AC2: GIVEN a fixture OR a `lib/**` / `app/api/**` file that references a column not in the live schema, WHEN the guard runs, THEN it reports the drift in CI annotations AND fails the workflow (after 1-day report-only mode per FF #G mitigation). *(test-planned: tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::fails-on-drift-in-fixtures-or-app-code)*
- AC3: GIVEN the guard runs in PR mode, WHEN a PR adds a fixture OR app-code reference, THEN the new reference is included in the audit AND any drift in IT alone fails the PR. *(test: workflow integration — manual PR fixture + app-code drift cases added to test branch)*
- AC4: GIVEN Supabase generated types (`supabase gen types typescript`), WHEN any migration applies to dev, THEN the generated types are regenerated (in the migration's same task or a follow-up CI job) AND committed to the repo at a canonical path (e.g., `lib/database.types.ts`); CI fails if generated types are stale relative to applied migrations (drift between `supabase/migrations/*.sql` last-modified timestamp vs the types file's last-regen marker). *(test-planned: tests/integration/schema-drift/generated-types-fresh.test.ts::types-not-stale-vs-migrations)*

#### US-STAB-D5 — Node 24 GitHub Actions runtime migration (F-DEP-1, P2, forced cut-over 2026-06-02 / hard-stop 2026-09-16)

**As a** project,
**I want** CI on Node 24 GitHub Actions runtime,
**So that** the 2026-06-02 forced cut-over (2026-09-16 hard-stop) for Node 20 deprecation doesn't break us — Node 22 alone is insufficient because GitHub Actions itself is moving javascript-action runtime to Node 24.

**Acceptance Criteria:**
- AC1: GIVEN all GitHub Actions workflow `uses:` declarations across `.github/workflows/*.yml`, WHEN audited, THEN every action version supports the Node 24 javascript-action runtime — specifically `actions/checkout@v4+`, `actions/setup-node@v4+`, `pnpm/action-setup@v3+`, `actions/upload-artifact@v4+`; any action declaration on a major-version known to require Node 20 is flagged and bumped. *(test-planned: tests/integration/ci/action-versions-support-node24.test.ts::all-uses-on-node24-compatible-majors)*
- AC2: GIVEN the bumped workflows, WHEN run against HEAD, THEN every workflow passes successfully on the Node 24 action runtime — validated via either a test PR with the env flag `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` set on the runner OR after the action major-version bumps are merged AND a dry-run CI cycle reports GREEN (full matrix: Vitest, Playwright, axe, Lighthouse, lint, typecheck). *(manual: PR CI run after merge with explicit Node 24 force-flag verification)*
- AC3 (optional sub-task, NOT part of D5 minimum): App runtime Node version may be bumped to Node 22 (separate from action runtime) under a separate scoped task; this is opt-in and tracked as `F-DEP-NODE22-APP-RUNTIME` if not done in D5. The minimum D5 scope is action-runtime Node 24 readiness only. *(manual: scope decision recorded in `migration-plan.md` Phase D section)*

#### US-STAB-D6 — F-LIB-DEDUP partial unique index migration (P2, migration 0018)

**As a** Kalori operator,
**I want** a partial unique index on `food_library_items (user_id, lower(name))` to prevent duplicate inserts at the DB level,
**So that** RACE conditions on library-create can't produce dupes.

**Acceptance Criteria:**
- AC1: GIVEN migration `0018_food_library_items_dedup_partial_unique.sql`, WHEN applied to kalori-dev, THEN a partial unique index exists on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` (using `normalized_name` if present in the schema; otherwise `lower(unaccent(name))`). *(test-planned: tests/integration/db/0018-migration.test.ts::index-exists-with-soft-delete-predicate)*
- AC2: GIVEN a duplicate active-row insert (same user, same `normalized_name`, both with `deleted_at IS NULL`), WHEN attempted, THEN it fails with a 23505 unique violation. *(test-planned: tests/integration/library-create.test.ts::dedup-blocks-duplicate-active-insert)*
- AC3: GIVEN existing duplicates exist on dev pre-migration (FF #C), WHEN the migration's pre-cleanup transaction runs, THEN within ONE transaction it (a) identifies dupes by `(user_id, normalized_name) WHERE deleted_at IS NULL`, (b) keeps the most-recently-`updated_at` row per group, (c) soft-deletes the rest, (d) ASSERTs zero remaining active dupes, (e) creates the partial unique index. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::transactional-dedup-then-index AND manual migration runbook in `migration-plan.md`)*
- AC4: GIVEN soft-deleted duplicates exist after the cleanup pass (or any post-migration soft-delete), WHEN the same `(user_id, normalized_name)` is re-inserted as a NEW active row (`deleted_at IS NULL`), THEN the insert SUCCEEDS — soft-deleted rows DO NOT block re-insert (active-row uniqueness only, partial-index predicate enforces this). *(test-planned: tests/integration/library-create.test.ts::soft-deleted-does-not-block-reinsert)*
- AC5: GIVEN any CRUD action runs after the migration applies, WHEN the existing 32-assertion RLS harness runs, THEN every assertion still passes (cross-user isolation preserved by partial-index addition). *(test: existing RLS harness)*
- AC6: GIVEN the migration runs, WHEN the SQL is inspected, THEN cleanup AND index creation execute inside a SINGLE transaction that begins with `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE` and ends with `COMMIT`; the lock is held continuously from cleanup through index creation so a concurrent insert cannot create a new duplicate between the post-cleanup assert and the `CREATE UNIQUE INDEX`. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::single-transaction-with-access-exclusive-lock)*
- AC7: GIVEN the migration script, WHEN run, THEN it executes under `SECURITY DEFINER` via the service-role key (per `scripts/apply-prod-migrations.mjs` execution context) — required because cross-`user_id` soft-deletes during cleanup would be blocked by RLS under `auth.uid() = user_id`. Runtime RLS for `food_library_items` is unchanged after the migration. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::executes-as-service-role-and-rls-unchanged)*

### Phase E stories

#### US-STAB-E1 — Phase E manual smoke + prod cutover

**As a** sprint orchestrator,
**I want** a structured Phase E walkthrough that re-checks every issuelog entry against the live HEAD AND batch-applies new migrations to kalori-prod,
**So that** the sprint closes against verifiable evidence and prod state matches the dev cutover.

**Acceptance Criteria:**
- AC1: GIVEN the 11 issuelog entries, WHEN Phase E runs, THEN each entry has post-fix screenshot evidence AND a diff vs the verification-report.md pre-fix evidence. *(manual: `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-issuelog-recheck.md`)*
- AC2: GIVEN sprint-introduced migration 0018 (0019 deferred per DT-5; no 0020), WHEN `scripts/apply-prod-migrations.mjs` runs against kalori-prod, THEN 0018 applies successfully AND the migration table reflects it AND the partial unique index exists with `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` predicate. *(manual: `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-prod-migration.md`)*
- AC3: GIVEN the FINAL-US task runs, WHEN every sprint user story E2E runs against the final build, THEN they all pass (2 fix rounds capped). *(test: full sprint E2E suite under `tests/e2e/web/user-stories/US-STAB-*.spec.ts`)*

---

## 5. Testing Strategy

### Per-task TDD — Canonical TDD Mandate (CTM)

Verbatim reference per `~/.claude/rules/testing.md`:

> "Write a failing test BEFORE writing any production code. Verify the test fails for the correct reason. Write minimal code to make it pass. Verify all tests pass. Refactor only after green."

Applied to every implementation task EXCEPT pure `[infrastructure]` / `[design]` tasks that may declare `TESTS: N/A` with explicit one-line written justification per D7. Every other task MUST commit a RED test BEFORE its GREEN implementation, traceable in git history (`git log --grep "RED:" --grep "GREEN:"`).

### Per-phase Testing Sweep

Closes every phase. Runs:
- Vitest full suite (`pnpm test`)
- Playwright full suite (`pnpm test:e2e`)
- axe sweep (UI phases — A, B, C, D)
- Lighthouse mobile assertion (≥0.91 on every category — Phase D + E gates)
- AI accuracy fixture suite (`tests/fixtures/ai-accuracy/critical.ts` — Phase A, C, E gates)
- RLS 32-assertion harness (Phase A, C, D, E gates)
- Per-task acceptance evidence audit (every Complex task has `acceptance-evidence/task-<id>.md` with screenshots + axe + manual verification)

A single failing test, missing acceptance-evidence file, or RLS regression blocks phase close.

### Phase A AC-by-AC verification (Q4=A, Q6=B locked)

**Dispatch model (D5 confirmed — see §11 Open Item 4):**
- 6 sub-agents `general-purpose` type, `model: opus`
- ~3 of 19 PRD features per agent
- Single matrix output → `verification-report.md`
- Walkthroughs are happy-path AC-by-AC (Q6=B), NOT a full edge-case audit
- Estimated wall-clock: 6 hours (parallel) + 2 hours synthesis

**Output format — `verification-report.md` columns (D10 + §11 Open Item 3 confirmed):**
| Column | Type | Required |
|---|---|---|
| `Feature ID` | string (`F1`..`F19`) | YES |
| `AC ID` | string (per-feature `AC1`..`ACn`) | YES |
| `WHEN clause` | prose | YES |
| `THEN clause` | prose | YES |
| `Pass/Fail` | enum | YES |
| `Evidence Path` | path (screenshot/log/etc.) | YES |
| `Bug ID` | string (`F-VERIFY-NNN`) | required IF Fail |
| `Severity` | `P0`/`P1`/`P2`/`P3` | required IF Fail |
| `Area` | `auth`/`UI`/`AI`/`database`/`offline`/`infra` | required IF Fail |
| `Recommended Phase` | `B` / `C` / `D` / `defer` | required IF Fail |

Columns confirmed as proposed in `01-pre-design.md` Section 9 #6 — no modifications.

### FINAL-US end-of-project loop

Runs every sprint US-STAB-* user-story E2E test against the finalized build at Phase E close. 2 fix rounds capped. Failure modes per FF #J mitigation: every story authored in this design doc has a `test-planned:` marker pointing to an actual file; if FINAL-US discovers a story without a real RED test, the story is escalated to a P0 micro-fix.

### Acceptance evidence tiers (D4 locked)

| Tier | Applies to | Required artifacts |
|---|---|---|
| **Lean** | Small + non-UI Medium | Inline note in `progress.md` per task: 1-line outcome + RED→GREEN trace commit hashes |
| **Full** | Complex + any `[UI]` task | `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-<id>.md` with: AC-by-AC pass evidence, screenshots (UI), axe sweep result, manual verification trace, post-deploy smoke |

### E2E Functional Click-Through Mandate (project-level testing-strategy.md)

Enforced for every `[user-story-e2e]` task. Every interactive surface within the user story flow MUST be clicked/typed/inspected; NOT just reachable-by-URL. Cross-reference: project `Planning/testing-strategy.md` "Functional Click-Through Mandate" section.

---

## 6. UI / Visual Design

### Direction (LOCKED — no sprint-level mockup pipeline per Q8=A)

The Ledger:
- **Color:** oxblood `#8A2A1F` (primary action), ivory `#F4EBDC` (foreground/text), warm near-black `#0E0A08` (background)
- **Typography:** Newsreader serif (display + headings), Inter (sans body), JetBrains Mono (numerics)
- **Layout:** zero-radius (no rounded corners except square FAB exception), hairline rules, no shadows
- **Focus ring:** IVORY 2px outline + 2px offset (per ux-auditor WCAG correction; NOT oxblood — oxblood 2.28:1 fails WCAG 2.5.8)
- **Component architecture:** 9 primitives + 6 compound + 4 headless (per `Planning/ui-design.md` §13)
- **RSC/Client/Split:** 27 / 38 / 14 (per `Planning/ui-design.md`)

All other UI work fixes existing components in their existing visual treatment — NO redesign.

### Net-new UI elements specified

**1. Micros/RDA dashboard panel (US-STAB-C1)**

Layout decision: **follow the existing Macros panel structure** (the same panel pattern that renders Carbs / Protein / Fat is the closest existing analog for `% of RDA` chips). Per-micronutrient chip renders:
- Name (Inter, sans body, uppercase, letter-spacing 0.22em)
- `% of RDA` (JetBrains Mono numerics, tabular-nums, oxblood foreground when ≥90%, sand otherwise)
- Hairline rule between chips
- Empty-state per `ui-design.md` empty-state pattern when sparse data (AC5 of US-STAB-C1)

Mini-mockup deferred to per-task design at execution if layout iteration warrants. This design doc commits the panel structure but not the exact pixel rhythm.

**2. F10 conflict modal honest CTAs (US-STAB-D3)**

Already implemented per Phase 5.1.5 Codex F2/F3. UI is `components/pwa/GoalWeightConflictModal.tsx`:
- Cancel button on the left, "USE CURRENT VALUE" on the right
- ESC = Cancel = non-destructive close
- `aria-modal="true"`, `role="alertdialog"`, scrim-click-disabled
- Initial focus on Cancel

US-STAB-D3 is verification-only + adds an i18n regression guard (AC3). NO new UI elements.

### Sprint UI fragments folder

`Planning/features/2026-05-01-mvp-stabilization/ui-design-fragments/` holds per-component specs IF execution warrants. Empty at design time.

---

## 7. Migration Plan summary

### Sprint-introduced migrations

| Migration | Purpose | Phase | Story |
|---|---|---|---|
| `0018_food_library_items_dedup_partial_unique.sql` | Partial unique index on `food_library_items` keyed by `(user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` (active-row uniqueness, soft-delete-aware — see Pre-migration cleanup below) | D | US-STAB-D6 |
| `0019` (DEFERRED) | `profiles.micros_rda_override` column was originally proposed; deferred per DT-5 / O-2 over-engineering review pushback (single-user MVP doesn't need per-user override day-1). Tracked as followup `F-MICROS-RDA-OVERRIDE-COLUMN` for post-MVP. **Sprint migration count = 0018 only.** | (deferred) | (deferred) |
| `0020` (RESERVED, NOT USED) | Originally reserved for D3 client-wins-resubmit; D3 stays honest-copy-only per §11 Open Item 2. Slot tracked under `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` (existing followup; do NOT mint a duplicate `-IMPL` ID). | (deferred) | (deferred) |

### Pre-migration cleanup (single transaction, before 0018 unique index applies)

Required to mitigate FF #C (existing duplicate active rows) AND ensure soft-deleted rows do not block re-insert. Documented runbook in `migration-plan.md`:

**Race-safety contract (write-blocking):** The cleanup-and-index sequence MUST run as a SINGLE atomic transaction with `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE` acquired at the very start of the transaction and held for its full duration (through index creation). Without the table lock, a concurrent library insert could create a new duplicate row AFTER step 4's assert and BEFORE step 5's index creation, breaking the migration nondeterministically during Phase E prod cutover. ACCESS EXCLUSIVE is acceptable here because (a) Kalori is single-user MVP at soft-launch — concurrent library writes are rare in practice — and (b) the cleanup transaction is short (sub-second on the expected row count). If write-blocking proves too aggressive at prod cutover (e.g., on a future multi-user fleet), the alternative is an application-level write-pause window documented in §Phase E prod cutover steps; pick ACCESS EXCLUSIVE for this sprint.

**Executor role:** Migration executes via `SECURITY DEFINER` (Supabase service-role key) — required because the cleanup soft-deletes duplicate rows across multiple `user_id` values which RLS would otherwise block under the `auth.uid() = user_id` policy. Index creation similarly requires service-role to bypass RLS during the structural change. Runtime queries against `food_library_items` continue under RLS unchanged. Execution context matches `scripts/apply-prod-migrations.mjs` (service-role key from `apikeys.txt` / `devapikeys.txt`).

1. `BEGIN;` `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE;` (write-blocking lock for the entire transaction; see race-safety contract above).
2. Identify duplicate active rows by `(user_id, normalized_name) WHERE deleted_at IS NULL`.
3. Keep the most-recently-`updated_at` row per duplicate group.
4. Soft-delete (set `deleted_at = now()`) all other duplicates in the group.
5. ASSERT zero active duplicates remain via `SELECT count(*) ... GROUP BY user_id, normalized_name HAVING count(*) > 1` returning 0 rows.
6. `CREATE UNIQUE INDEX` with the partial predicate `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` — still inside the locked transaction.
7. `COMMIT;` (releases the lock atomically with the index becoming visible to other sessions).

The partial predicate ensures soft-deleted duplicates (step 4 leftovers OR future deletions) DO NOT block re-insertion of the same `normalized_name` for that user. Active-row uniqueness only.

**Note on `normalized_name`:** uses the existing `normalized_name` column if present in the schema; otherwise the index expression is `lower(name)` with a `unaccent` wrapper for VN-diacritic safety (see P-3 mitigation under Adversarial Reviewer perspective 1).

### Per-task to dev (Q7=A)

Each migration ships in its task's RED→GREEN cycle:
- Migration file added in RED (alongside test that asserts schema state)
- Migration applied to `kalori-dev` via `DATABASE_URL_DIRECT` (port 5432) before GREEN
- Test passes against new schema
- Per-task Codex reviews migration SQL alongside code

### Batch to prod at Phase E (Q7=A)

`scripts/apply-prod-migrations.mjs` runs once at Phase E close against `kalori-prod`:
- Pre-flight: dev schema diff vs prod schema must match expected delta
- Apply 0018 → verify index exists with the partial predicate `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`
- Smoke against prod (read-only — RLS-bound, anon role, expect appropriate denials)

(Migration 0019 deferred per DT-5; sprint applies 0018 only.)

### F-LIB-DEDUP pre-flight (FF #C mitigation)

Before 0018 applies, `scripts/dedup-pre-flight.mjs` runs against the dev DB:
- Lists existing duplicate (user_id, lower(name)) tuples in `food_library_items`
- Halts with a manual-review prompt if any exist
- Documented runbook for resolution: keep the row with the most-recent `updated_at`, soft-delete the older(s) by setting `deleted_at = now()`

### Migration RLS contract

All sprint migrations preserve the existing RLS 32-assertion harness GREEN. New columns inherit existing per-user-isolation policies. New indexes do not change row visibility.

### Pointer

Detailed migration SQL + runbook lives in `Planning/features/2026-05-01-mvp-stabilization/migration-plan.md` (Step 6 sub-agent writes it). This design doc commits only the migration count + intent.

### Deferred D3 work spec — full client-wins-resubmit impl (post-MVP, tracked under `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`)

Out-of-scope for this sprint per DT-2. Captured here so future un-deferral has a starting brief; this is NOT a sprint task list.

Required components for future impl:
- **Server precondition-refresh API endpoint contract.** New `GET /api/weight-goal/precondition` (or equivalent) returning the current ETag and a fresh `version_id` for the row; clients call this BEFORE retrying a write that previously failed with 412 Precondition Failed.
- **Client retry queue with refreshed-precondition resubmit.** Client-side queue (probably in `lib/offline/conflict-resolver.ts` extension) that on receiving 412: fetches fresh precondition, optionally re-renders the modal with the latest server state, then resubmits the user's chosen value with the refreshed `If-Match` header.
- **412 → refresh → reflush integration test pattern.** New test fixture pattern under `tests/integration/offline/` exercising: stale-write → server returns 412 → client fetches precondition → client resubmits → server accepts. Asserts no data loss across the cycle.
- **ETag / If-Match header semantics.** Adopt RFC 7232 strong validators on the row: server hash = `"<row.id>:<row.updated_at_epoch>:<row.version_id>"` (no `W/` prefix — strong validator, byte-equivalence semantics). Client must send `If-Match` on every PUT. Server returns 412 with the current ETag in the response so the client can refresh without an extra round-trip when feasible.
- **Migration slot.** Originally allocated `0020_offline_conflict_state.sql` — kept reserved but unused for this sprint. Future impl may need a new migration to add `version_id` to weight-goal-bearing tables; revisit at un-defer time.

This subsection is informational only; no sprint task references it.

---

## 8. Codex Review Strategy

### Per-task Codex (D8 locked)

Required for every Medium + Complex task. Substitute `codex:rescue` sub-agent for the `/codex:adversarial-review` slash command per the locked decision in `01-pre-design.md` §8 last bullet.

Workflow per task:
1. Implementation complete + RED→GREEN trace committed
2. Invoke `codex:rescue` with task scope (file paths + diff)
3. Categorize findings: Critical / Improvement / Minor
4. Auto-fix Critical + Improvement via sub-agent, max 2 rounds
5. Surface Minor to user for decision
6. Round-cap: 2; if findings persist past round 2, escalate to user

### Per-phase Codex (D8 locked)

Mandatory at every phase close. Scope budget: ≤1MB diff per pass (Lesson #3). If a phase diff exceeds 1MB, split into per-area Codex passes (e.g., Phase D split into D-Audit, D-Contracts, D-Offline, D-Infra per §3 bundling).

### FINAL-US end-of-project Codex (D8 locked)

Runs alongside FINAL-US task at Phase E close. Reviews the entire sprint diff at the macro level — cross-cutting concerns (R1 firewall, I11 idempotency, RLS invariants, fixture non-regression). 2 rounds cap.

### `[project-sweep]` task — explicit audit

**Decision: NOT REQUIRED for this sprint.** Rationale:
- Sprint introduces NO new subsystem (every change is a fix on existing surfaces)
- Sprint includes NO 3+ Break-Risk-High API change
- Schema migration 0018 affects a single consumer (library form / dedup index); 0019 deferred per DT-5
- No new architectural pattern is introduced

This audit decision is recorded explicitly per `~/.claude/skills/brainstorm-tomi/SKILL.md` Step 6.2 thresholds. If the verification report surfaces 3+ break-risk-high issues, this decision is revisited at Phase A close.

### Codex invocation note

User-facing slash command `/codex:adversarial-review` is unavailable inside an agent loop. Substitute the `codex:rescue` sub-agent. It carries equivalent severity categorization (`Critical` / `Improvement` / `Minor`) and supports the same round-cap workflow.

---

## 9. Implementation Tactics

### Approach 3 Hybrid (LOCKED Q3=Approach 3)

| Phase | Sub-agent count | Strategy |
|---|---|---|
| A | 1 (P0 fixes) + 6 (verification dispatch) | P0 serial; verification parallel |
| B | 2–3 per wave (3 waves) | Parallel themed bundles (file-disjoint) |
| C | 1–2 | Larger features, fewer agents to keep cohesion |
| D | 2–3 per wave (2 waves) | Parallel themed bundles |
| E | 1 | Serial single agent — high coordination, requires checkpoints |

### Per-phase pre-execution briefing convention

Before each phase, the orchestrator writes a phase briefing to `Planning/.tmp/phase-<X>-briefing.md`:
- Tasks in the phase + complexity tier per task
- Sub-agent dispatch plan (which tasks parallelize, which serialize)
- Codex schedule (per-task + phase-level)
- Blocker escalation path
- Acceptance evidence tier per task (Lean / Full)
- Reference reads per task (which artifacts the sub-agent loads BEFORE starting)

Each sub-agent receives a per-task briefing at `Planning/.tmp/task-<id>-briefing.md` written by the orchestrator before sub-agent spawn. Briefing schema per `superpowers-exec-tomi/references/task-briefing.md`.

### File-disjoint enforcement (FF #E mitigation)

When 2+ sub-agents run in parallel, the orchestrator pre-checks the per-task `Files:` lists. If ANY two parallel tasks list the same file, they are reordered into different waves. This prevents the cache-tag set / shared module conflict failure mode.

### R1 firewall enforcement on every sprint mutation task

Every sprint task that introduces a new mutation route or client-side fetch path MUST go through `lib/auth/refresh-interceptor.ts`. Pre-task validation: grep for `fetch(` in the task's `Files:` and reject any direct `fetch(` not wrapped in the interceptor helper.

### I11 idempotency on sprint mutation routes

Every new mutation route MUST accept a `client_id` header AND store it on the row for idempotent retries. Cross-reference: project `Planning/architecture.md` "Idempotency Contract I11" section.

---

## 10. Failure-First Analysis

### Top 10 failure modes (sprint-specific, grounded in project state)

| # | Failure mode | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| **A** | Phase A verification surfaces >5 new P0/P1 bugs → 3-week budget blowout | High | Medium | Phase A close gate includes a "verification-found bug count" sanity check; if >5 P0/P1, raise to user with options (extend Phase B, defer some to soft-launch+1, descope from sprint). Mitigation owner: orchestrator at Phase A close. |
| **B** | Micros/RDA AI prompt change degrades AI accuracy below 30/30 fixture pass rate | High | Medium | Lesson #5 invariant. C1's RED test asserts critical.ts 30/30 still passes BEFORE prompt change is committed. If prompt changes break a fixture, EITHER reframe the prompt to preserve OR add a regression fixture for the new behavior + escalate to user (no silent fixture removal). |
| **C** | F-LIB-DEDUP partial unique index conflicts with existing duplicate rows in dev → migration 0018 fails | High | Medium | `scripts/dedup-pre-flight.mjs` runs BEFORE the migration; halts with manual-review prompt if dupes exist. Documented dedup runbook in `migration-plan.md` (keep most-recent `updated_at`, soft-delete older). |
| **D** | US-STAB-D3 client-wins-resubmit scope explodes if attempted as full impl | High | High (already realized via §11 Open Item 2) | **Already mitigated** by scoping D3 to honest-copy-only (verification + AC3 i18n guard + AC4 handler-binding guard). Full impl remains deferred under existing followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` (do NOT mint a duplicate `-IMPL` ID). |
| **E** | Phase B parallel sub-agents conflict on shared cache-tag invalidation set `['24h','D','7d','30d','90d','1y']` | Medium | Low | Pre-task `Files:` audit ensures file-disjoint across waves (per §9 File-disjoint enforcement). Cache-tag set is invariant — no sprint task adds/removes from it. |
| **F** | Codex review scope >1MB on Phase D combined hardening | Medium | Medium | Per-bundle Codex passes (D-Audit, D-Contracts, D-Offline, D-Infra) split D's review into 4 separate passes. Each <1MB. |
| **G** | Schema-drift CI guard (D4) flags every existing test on day 1 → CI red wave blocks merges | High | High (this is realistic) | D4 ships in 2 stages: stage 1 = `report-only` mode (annotation-only, never red), stage 2 = `block` mode after 1 day of triage and fixture cleanup. Stage 2 only enabled after report-only run is clean. |
| **H** | Node 24 action-runtime migration breaks a workflow whose `uses:` action major version is incompatible | Medium | Low–Medium | Pre-merge verification: dry-run CI cycle on a test PR with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env flag set. Audit script `tests/integration/ci/action-versions-support-node24.test.ts` enforces only Node-24-compatible action majors. App runtime Node bump (to Node 22 or beyond) tracked separately as opt-in. |
| **I** | Settings page completion (C3) hits unscoped server-side requirements | Medium | Low (mitigated by §11 Open Item 1) | **Already mitigated** by scoping US-STAB-B6 to patch-shaped (real settings already render behind stub). C3 slot is officially unused. If verification surfaces a true missing setting, story is minted as US-STAB-C4+ with explicit scope. |
| **J** | FINAL-US fails on a story authored without a proper RED test in plan-writing | High | Medium | Every story in §4 has at least one `test-planned:` marker pointing to a real file path. Plan-writing audit (Step 6 sub-agent) verifies every `test-planned:` path. If a story lands without a real test (RED→GREEN trace missing), it is escalated to a P0 micro-fix, NOT just marked complete. |

### Invariants — load-bearing project invariants the sprint MUST preserve

| Invariant | Source | Enforcement |
|---|---|---|
| **R1 firewall** | Project Lesson, `lib/auth/refresh-interceptor.ts` | Every sprint mutation task MUST go through the interceptor; no raw `fetch(` in new mutation paths. Per-task pre-flight grep check (§9). |
| **I11 client_id idempotency** | Project `architecture.md` | Every sprint mutation route accepts `client_id` header AND stores it on the row. C2 (library CRUD) extends this to library CRUD endpoints. |
| **Cache-tag set frozen** | Project `architecture.md` (`['24h','D','7d','30d','90d','1y']`) | No sprint task adds/removes a cache-tag. Pre-task `Files:` review catches violations. |
| **Weight bounds `[30, 350]` kg** | Project `PRD.md` F9 | US-STAB-B4 quick-add validates this (AC2). |
| **lbToKg constant `0.45359237`** | Project `architecture.md` weight-conversion module | US-STAB-B4 imports the existing constant; no redefinition. |
| **AI accuracy fixture set non-regressing** | `tests/fixtures/ai-accuracy/critical.ts` | US-STAB-C1 RED test asserts 30/30 still passes BEFORE prompt change. New micros fixtures additive only. |
| **Storage-FIRST cascade on account delete** | Project F14 | Sprint introduces no change to `/api/account-delete`. Existing test harness asserts cascade order remains Storage→DB. |
| **Fail-closed deletion fence on mutation routes** | Project `architecture.md` | Sprint introduces no change to deletion fence semantics. Library CRUD (C2) inherits existing fence. |
| **RLS 32-assertion harness GREEN at every phase close** | Project test harness | Phase A/C/D/E gates include RLS sweep. Any regression blocks phase close. |

### Adversarial reviewer perspective 1 — Paranoid Staff Engineer

**Concern P-1: Library CRUD (US-STAB-C2) "Log Now" creates a `food_entries` row from a library item — but the library item's macros/micros may have been edited since the original logging. Race condition between view-time read and log-time read could log stale data.**
- Mitigation: C2's "Log Now" handler MUST read the library item snapshot atomically at click-time (not from the cached list view). Per-task Codex assertion: snapshot freshness contract documented.

**Concern P-2: US-STAB-A3 (orphan-profile fence) — what if the orphan state is created mid-request? E.g., user is mid-fetch and another tab signs them out and another flow deletes the profile row. The fence must handle a TOCTOU (time-of-check-time-of-use) race.**
- Mitigation: Add a single-pass orphan-check in the dashboard route's first DB query — instead of separate "is profile present?" + "fetch aggregate" calls, use a single LEFT JOIN that returns the profile shape OR null in one round-trip. **AC5 of US-STAB-A3 (post-C4-rewrite) explicitly tests this TOCTOU-safe single-pass contract**, and AC1 tests the redirect-on-missing-profile path; AC4 verifies `auth.uid()` scoping on every aggregate query so a fenced-but-leaky variant can't pass.

**Concern P-3: 0018 partial unique index — `lower(name)` is locale-dependent in PostgreSQL. Vietnamese diacritics (e.g., "phở" vs "PHO") may be treated as distinct, leaking duplicates that look identical to a user.**
- Mitigation: Pre-flight script `dedup-pre-flight.mjs` MUST normalize using ICU collation (or a normalization function `unaccent`) before running the dupe scan. Migration 0018 SQL annotated with this nuance and a TODO followup `F-LIB-VN-DIACRITIC-DEDUP` if not addressed in this sprint.

**Concern P-4: D2 (API 401 contract) — service worker that pre-caches authenticated API responses might cache the new JSON 401 instead of the user's intended data, breaking offline UX.**
- Mitigation: Service worker policy must skip caching of 401 responses. Add a service worker fetch-handler test asserting `if (response.status === 401) { return; }` before cache.put. Reference `public/sw.js` audit at D2 close.

**Concern P-5: Phase E prod migration cutover — kalori-prod has 17 migrations applied; sprint adds 1 more (0018; 0019 deferred per DT-5). If kalori-prod has drifted (manually-applied data fix, bypassed migration), the apply script may fail mid-way.**
- Mitigation: Pre-flight check in `apply-prod-migrations.mjs`: run a schema diff between dev and prod BEFORE applying. If prod has unexpected schema state, halt with manual-review prompt. Document the runbook in `migration-plan.md` Phase E section.

### Adversarial reviewer perspective 2 — Over-Engineering Reviewer

**Concern O-1: US-STAB-D4 (schema-drift CI guard) is itself a substantial new infrastructure surface. Stage-1 / stage-2 split + integration test against live schema — risks becoming a second-order CI maintenance burden. Could the same lesson be addressed with a simpler integration test that just snapshots the schema?**
- Mitigation: Keep the scope deliberate: D4's only output is a CI annotation pointing to a drift. NO auto-fix, NO mock generation, NO new test framework. Acceptance evidence audit at Phase D close MUST confirm D4's footprint stays in `tests/integration/schema-drift/` only — no leakage into other test files.

**Concern O-2: Per-user RDA override (`profiles.micros_rda_override jsonb`) for ~30 micronutrients is speculative. The spec is "user with custom RDA" — but Phase 1 of soft-launch has 1 user (single-user MVP per project identity). Why ship the override field at all?**
- Mitigation: Defer the override column. Ship US-STAB-C1 with code constants only; remove migration 0019 from Phase C. If a future user requests overrides, mint a followup `F-MICROS-RDA-OVERRIDE` and land migration 0019 then. Update the design here: **C1 RDA logic uses code constants only; migration 0019 deferred unless verification surfaces an explicit need.** [DESIGN-TIME RESOLUTION: see updated §7.]

> **Design-time resolution applied:** Per the over-engineering reviewer, migration 0019 is **deferred** unless verification surfaces a need. C1 ships with code constants for ~30 micros. If user requests overrides post-soft-launch, F-MICROS-RDA-OVERRIDE-COLUMN is logged. **§7 updated.**

**Concern O-3: D5 (Node 24 action-runtime migration) — bumping every workflow's `uses:` major may be ceremonial for workflows that don't run javascript-actions (e.g., docs-only deploys, pure shell workflows). Avoid ceremonial bumps.**
- Mitigation: D5 scope: ONLY bump `uses:` major versions that ACTUALLY run javascript-actions on the runner. Workflows that only invoke external CLI binaries (Vercel, Sentry CLI etc.) without `actions/*` javascript-actions need no bump. Acceptance: `tests/integration/ci/action-versions-support-node24.test.ts` allows workflows without javascript-action `uses:` declarations to skip the audit.

**Concern O-4: US-STAB-B5 (site-wide nav audit) — the audit script is described as running on every sprint touchpoint, but the project already has a Playwright + axe sweep that walks the routes. Rolling a separate audit script may duplicate coverage.**
- Mitigation: B5's audit is a CI-time workflow that walks every defined route (programmatic) AND surfaces orphan-pages (routes that exist but are unlinked from the sidebar/topbar/footer). It is NOT a runtime test — it is a static analysis of routes vs nav links. This is value-add over the runtime axe sweep. AC1 explicitly distinguishes this.

**Concern O-5: 6 verification sub-agents on Day 1 of Phase A — each agent runs ~3 features × ~3 ACs = ~9 ACs per agent. For a 19-feature catalog with ~70 total ACs, this is ~10 ACs per agent. That's a heavy briefing per agent; sub-agent attention may degrade across all 9 ACs. Consider splitting smaller.**
- Mitigation: Empirical: D5 confirmed 6 sub-agents at design time. If verification reports start showing low-quality "Pass" annotations (e.g., screenshot mismatches AC's THEN clause), Phase A orchestrator pauses verification and re-dispatches with fewer features per agent (8–10 sub-agents). Build the option into the dispatch protocol.

### Adversarial reviewer perspective 3 — Under-Specification Reviewer

**Concern U-1: US-STAB-B4 AC1 says "RSC re-fetches without a hard reload." But the boundary between "RSC re-fetch" (router.refresh()) and "hard reload" (window.location.reload()) is implementation-specific. AC needs a more concrete falsification.**
- Mitigation: Update AC1 to: "WHEN I submit, THEN `router.refresh()` is called AND no `window.location.reload()` or full document navigation happens (assert via Playwright network: only `_rsc=` POST to current path)." [DESIGN-TIME EDIT — apply to AC1 of US-STAB-B4.]

**Concern U-2: US-STAB-C1 AC1 lists ~30 micronutrients as a baseline. The list is FDA + WHO baseline, but neither org publishes a single "30 micros" list. This is under-specified and risks the AI returning a different set than the dashboard expects.**
- Mitigation: Update AC1 to reference a concrete code constant `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` that is the authoritative list. The AI prompt and the dashboard both read from this constant. Migration 0019 (now deferred per O-2) was going to mirror this. C1's RED test asserts the AI response contains exactly this list. [DESIGN-TIME EDIT — replace "FDA + WHO baseline" with "the canonical list in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST`" in AC1.]

**Concern U-3: US-STAB-A2 AC1 — "displays my real Gmail address" — but what about when the email field is empty (Google OAuth optional scopes)? Or when the user's display name is set but not the email? The AC assumes happy-path Gmail.**
- Mitigation: Add AC4: "GIVEN I am logged in via Google OAuth AND my email scope was not granted, WHEN the sidebar renders, THEN the identity row falls back to the configured display-name OR the user's anonymized ID slug (NOT 'dev user'). test-planned: tests/unit/sidebar/identity-row.test.tsx::email-missing-falls-back-to-id-slug."

**Concern U-4: US-STAB-D3 (F10 modal honest-copy) — AC3's "no deprecated copy" is a static check on the i18n file, but the actual handler-to-label binding could drift in code without the i18n file changing. Need a runtime contract test too.**
- Mitigation: Add AC4 to US-STAB-D3: "GIVEN the modal renders with `useCurrentButton` AND `cancelButton` labels, WHEN any button is clicked, THEN the handler invoked matches the label (Cancel→handleCancel, USE CURRENT VALUE→handleUseCurrent). test-planned: tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx::label-handler-bound-correctly."

**Concern U-5: Phase E (US-STAB-E1) AC2 — "every migration applies successfully." But what does "successfully" mean? Returns 0? Logs no errors? Schema state matches expected? Need explicit success criteria.**
- Mitigation: Define migration success per migration: 0018 = "Partial unique index exists in `pg_indexes` on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`." 0019 = (DEFERRED — moot per O-2 / DT-5). Document each migration's post-condition in `migration-plan.md`.

---

## 11. Decision Summary

### Locked decisions from Q1–Q10 + Approach 3

| # | Decision | Rationale | Short-term path | Long-term path |
|---|---|---|---|---|
| **Q1** | Acceptance bar = B (Soft-launch ready) | Fix all 11 issuelog + 9 followups + verification + Codex deferrals. P3 polish DEFERRED. | 3-week sprint to soft-launch state. | Post-soft-launch P3 tracker addresses ~67 deferred items. |
| **Q2** | Sprint folder = A (Dated FA folder) | Canonical brownfield pattern; tasks in root `tasks.md` with `Folder:` metadata. | `Planning/features/2026-05-01-mvp-stabilization/` houses sprint artifacts. | Dated convention enables future FA sprints without conflict. |
| **Q3** | Brownfield engagement = A (Skip with override) | Project state already well-mapped via Phase 1–4 docs; full brownfield re-derivation would duplicate effort. Compensating: per-task Codex + Phase A verification + per-phase Codex. | Override reason recorded in `manifest.md`. | Not re-evaluated unless verification surfaces brownfield gaps. |
| **Q4** | Verification timing = A (Day-1 parallel) | Phase A productive while P0 fixes serialize. | 6 sub-agents dispatch on Day 1; report by Day 2. | Verification cadence applies to future stabilization sprints. |
| **Q5** | Phase structure = 5-phase split | Cleaner Codex scope per gate (≤1MB); per-phase user-story testing more granular. | A→B→C→D→E with per-phase gates. | 5-phase pattern reusable for future complex FA sprints. |
| **Q6** | Verification depth = B (Happy + AC-by-AC) | Sufficient for soft-launch; full edge-case audit deferred to post-MVP. | Per-feature × per-AC matrix in `verification-report.md`. | Post-soft-launch: full edge-case verification before public launch. |
| **Q7** | Migration policy = A (Per-task to dev, batch to prod at Phase E) | Continues existing project pattern (17 prior migrations followed this); minimizes prod cutover risk. | Per-task to dev (0018 only); batch to prod at Phase E (0018 only). Migration 0019 deferred per DT-5 / O-2 over-engineering review pushback. | Same pattern reused for all future migrations. |
| **Q8** | UI mockup treatment = A (Skip sprint-level mockups) | Direction (Ledger) locked; sprint touches existing components. | Per-task mini-mockups available ad-hoc. | New direction work would re-engage mockup pipeline. |
| **Q9** | Phase E manual smoke = B (Issuelog re-check + light walkthrough) | Pragmatic; verification-report.md is the authoritative diff target. | ~1 day Phase E budget. | Post-soft-launch: full pre-public-launch smoke suite. |
| **Q10** | 10 operational defaults | All locked verbatim per `01-pre-design.md` §4. | D1–D10 applied per-task. | Defaults reusable for future FA sprints. |
| **Approach 3** | Hybrid: P0 serial + P1+ parallel | Fastest reasonable approach; Codex scope budget intact; per-task Codex for Medium/Complex preserved. | Per-phase sub-agent dispatch shape per §3. | Pattern reusable for future stabilization sprints. |

### Design-time decisions resolved (during this Step 5 session)

| # | Decision | Rationale |
|---|---|---|
| **DT-1** | Settings page (US-STAB-B6) stays patch-shaped, NOT escalated to C3 | Code evidence at `app/(app)/settings/page.tsx`: real `ReduceMotionToggle`, `DataSubsection`, `AccountSubsection` already render below the stub copy at lines 67–71. The stub is purely literal copy left in `lib/i18n/en.ts:769-770`. Only fix needed: replace `t.settings.stubBody` and `t.settings.stubHeading` with real localized values. |
| **DT-2** | F10 modal (US-STAB-D3) stays honest-copy-only, NOT full client-wins-resubmit impl | Code evidence at `components/pwa/GoalWeightConflictModal.tsx` + `lib/offline/conflict-resolver.ts`: Phase 5.1.5 Codex F2/F3 already shipped honest copy + ESC=Cancel + role="alertdialog" + aria-modal=true + scrim-disabled + initial focus on Cancel. Full client-wins-resubmit would require server-side `If-Match` ETag + client retry queue redesign (>5 days budget). Story scope: verification + AC3 i18n regression guard + new AC4 click-handler binding regression guard. Full impl remains deferred under existing followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` (do NOT mint a duplicate `-IMPL` ID). |
| **DT-3** | Verification report column set CONFIRMED as proposed in `01-pre-design.md` §9 #6 | 10 columns: `Feature ID | AC ID | WHEN clause | THEN clause | Pass/Fail | Evidence Path | Bug ID (if fail) | Severity | Area | Recommended Phase`. No modifications. Sufficient for Phase B/C triage. |
| **DT-4** | Sub-agent dispatch model for verification CONFIRMED: 6 agents, `general-purpose`, `model: opus`, ~3 features each | Default works; if quality degrades empirically (see O-5 mitigation), Phase A orchestrator may re-dispatch with 8–10 agents. |
| **DT-5** | Migration 0019 (`profiles.micros_rda_override`) DEFERRED per O-2 | Single-user MVP doesn't need per-user override day-1. C1 ships with code constants only. F-MICROS-RDA-OVERRIDE-COLUMN logged for post-MVP. §7 updated. |
| **DT-6** | US-STAB-C3 slot officially EMPTY (per DT-1) | If verification surfaces a feature-shaped issue, slot is reusable; otherwise unused. |
| **DT-7** | US-STAB-B4 AC1 EDIT — explicit `router.refresh()` assertion | Per U-1: replace "RSC re-fetches without a hard reload" with "router.refresh() called, no window.location.reload(), Playwright network confirms only `_rsc=` POST to current path." |
| **DT-8** | US-STAB-C1 AC1 EDIT — concrete `DEFAULT_MICROS_LIST` constant | Per U-2: replace "FDA + WHO baseline" reference with a code constant `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST`. AI prompt and dashboard both read from this constant. |
| **DT-9** | US-STAB-A2 ADD AC4 — empty-email fallback | Per U-3: handle case where Google OAuth doesn't grant email scope; identity row falls back to display name or anonymized ID slug. |
| **DT-10** | US-STAB-D3 ADD AC4 — handler-binding regression guard | Per U-4: AC3 alone (i18n static check) is insufficient; add runtime test asserting label→handler binding stays correct. |

> **AC edits per DT-7..DT-10 are applied to the AC tables in §4. The DT-table is the canonical record of those edits.**

### Remaining unknowns

| Unknown | Resolution path |
|---|---|
| Verification-report-discovered bugs (Phase A output) | Triaged at Phase A close; stories minted as US-STAB-C4..C? |
| Implementation/story tasks | 19–23 (depends on verification-report bug count) |
| Total task cards including phase-mandatory + e2e | ~30–33 (counts in §3 phase table include phase-mandatory tasks — Phase Testing Sweep + Phase Codex Review per phase = +10 tasks — and per-phase user-story-e2e tasks, ~3 tasks; the §1 header value of "~22 implementation tasks" refers to the implementation/story count only) |
| Per-task acceptance evidence file naming convention details | `acceptance-evidence/task-<id>.md`; format defined in Step 6 testing-strategy.md |
| Whether Phase D split D-Audit/D-Contracts/D-Offline/D-Infra exceeds 1MB scope budget | Phase D entry: orchestrator measures diff size; if under 1MB, single Codex pass; else split per bundle |
| Per-user RDA override column re-introduction post-MVP | Tracked as deferred followup `F-MICROS-RDA-OVERRIDE-COLUMN` in `Planning/followups.md`; only un-defers if a real second-user / cohort emerges and explicitly requests overrides. |

### Follow-up questions (none required pre-execution)

All Q1–Q10 + Approach 3 + DT-1..DT-10 locked. No additional user input needed before plan-writing.

### Dependency mapping

```
Phase A (P0 + Verify)
  ├── US-STAB-A1 (library save) ──┐
  ├── US-STAB-A2 (sidebar identity)─┐ all 3 P0 must close before Phase B
  ├── US-STAB-A3 (orphan fence)──┐ │
  └── A-VERIFY (6 sub-agent dispatch) ──→ produces verification-report.md
                                          │
                                          ↓ (triages bugs into Phase B/C/D)

Phase B (P1 patches)               Phase C (P1 features)
  ├── B1 root redirect              ├── C1 micros/RDA  ── (depends on A1 + A3 — needs library + dashboard stable)
  ├── B2 form clear                 ├── C2 library CRUD ── (depends on A1 — needs library save working)
  ├── B3 sidebar header             ├── C3 (EMPTY)
  ├── B4 weight quick-add ── (depends on D2 contract for offline conflict path? No — independent.)
  ├── B5 nav audit                  └── C4..C? from verification
  └── B6 settings copy

Phase D (Hardening)
  ├── D1 dashboard a11y ── (depends on C1 — Micros panel must exist before it can be a11y-audited)
  ├── D2 API 401 contract
  ├── D3 F10 modal honest copy ── (depends on B4 partially — quick-add could trigger conflict modal)
  ├── D4 schema-drift guard
  ├── D5 Node 24 GitHub Actions runtime migration
  └── D6 F-LIB-DEDUP migration ── (depends on A1 + C2 — library entries + CRUD must exist before dedup matters)

Phase E (Closure)
  ├── E1 manual smoke + prod cutover ── (depends on ALL above)
  └── FINAL-US ── (depends on every US-STAB-* test existing)
```

---

## 12. Risks (R-STAB-1..N)

Beyond the 5 from Step 4 (R-STAB-1..5), formalize the Failure-First Top 10 as risks with severity, likelihood, mitigation, owner phase.

| Risk ID | Description | Severity | Likelihood | Mitigation | Owner phase |
|---|---|---|---|---|---|
| **R-STAB-1** | Verification surfaces >5 new P0/P1 → budget blowout | High | Medium | Sanity check at Phase A close; user choice if >5 | A |
| **R-STAB-2** | AI prompt micros change degrades fixture pass rate | High | Medium | RED test asserts 30/30 BEFORE prompt change; new fixtures additive only | C |
| **R-STAB-3** | Migration 0018 conflicts with existing dupes | High | Medium | `dedup-pre-flight.mjs` halts before migration; manual runbook | D |
| **R-STAB-4** | F10 client-wins-resubmit scope explodes | High | Mitigated | Scoped to honest-copy-only per DT-2 | D |
| **R-STAB-5** | Codex review scope >1MB on Phase D | Medium | Medium | Per-bundle splits (D-Audit, D-Contracts, D-Offline, D-Infra) | D |
| **R-STAB-6** | Phase B parallel sub-agent file conflict | Medium | Low | File-disjoint pre-flight per §9 | B |
| **R-STAB-7** | Schema-drift CI guard CI red wave | High | High | Stage-1 report-only mode; stage-2 block after triage | D |
| **R-STAB-8** | Node 24 action-runtime breaks an incompatible action `uses:` major | Medium | Low–Medium | Action-version audit + dry-run CI under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` | D |
| **R-STAB-9** | Settings page hits unscoped server-side requirements | Medium | Mitigated | Patch-shaped per DT-1; C3 slot empty | C |
| **R-STAB-10** | FINAL-US fails on missing RED test | High | Medium | Plan-writing audit verifies every `test-planned:` path | E |
| **R-STAB-11** | TOCTOU race on orphan profile fence | High | Low | Single-pass orphan check; AC1 of A3 explicitly tests | A |
| **R-STAB-12** | VN diacritic dedup collation issue | Medium | Medium | ICU collation in dedup-pre-flight; F-LIB-VN-DIACRITIC-DEDUP TODO | D |
| **R-STAB-13** | Service worker caches new 401 JSON shape | Medium | Low | SW fetch-handler skip-on-401 test added at D2 | D |
| **R-STAB-14** | Prod schema drift blocks Phase E cutover | High | Low | Pre-flight schema diff in `apply-prod-migrations.mjs` | E |
| **R-STAB-15** | Verification sub-agent attention degrades on 9 ACs each | Medium | Medium | Re-dispatch to 8–10 agents if quality empirically poor | A |

---

## 13. Closure Criteria

Phase E closes the sprint when ALL of the following are TRUE:

1. **All 11 issuelog entries** have post-fix screenshot evidence in `acceptance-evidence/phase-E-issuelog-recheck.md` with diff against `verification-report.md` pre-fix evidence (every Pass/Fail flips to Pass).
2. **All 9 in-scope followups** are marked `Status: RESOLVED-2026-05-XX (commit hash)` in `Planning/followups.md`.
3. **All verification-found bugs** triaged at Phase A close are closed (or explicitly deferred with logged followup).
4. **All sprint-introduced migrations** (0018 only — 0019 deferred per DT-5 / O-2; tracked as `F-MICROS-RDA-OVERRIDE-COLUMN`) applied to kalori-prod via `scripts/apply-prod-migrations.mjs` AND verified via post-cutover schema check (partial-unique-index existence with `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` predicate).
5. **Sprint Phase E Codex Review** returns OK (or 2-round auto-fix passes).
6. **FINAL-US** runs every `tests/e2e/web/user-stories/US-STAB-*.spec.ts` against the finalized build, GREEN (2 fix rounds capped).
7. **Sprint Phase E Testing Sweep** returns FULL GREEN: Vitest + Playwright + axe + Lighthouse mobile ≥0.91 + AI accuracy 30/30 + RLS 32-assertion harness.
8. **Per-task acceptance evidence** audited; every Complex task has its `acceptance-evidence/task-<id>.md`.
9. **All sprint task entries in `Planning/tasks.md`** marked `✅ Completed` with `Completed:` timestamp + `Files changed:` + `Tests added:` + `Codex review outcome:` per the post-task update protocol.
10. **`Planning/progress.md` Phase 5 closes** simultaneously with sprint Phase E (per Q2=A — sprint Phase E closes parent project Phase 5.4 + Phase 5).
11. **Sprint `brainstorm-state.md` `state` = `complete`**, `Current Position: complete`.
12. **Deferred 67 items** all marked `Status: DEFERRED-soft-launch (revisit post-MVP)` in `Planning/followups.md`.

If ANY closure criterion fails, the sprint stays open and the orchestrator surfaces the gap to the user with a fix-or-defer choice.

---

## 14. Per-task Complexity / Type-tag / Reads-field Mapping

**Type-tag canonicality citation:** Type tags drawn from canonical 15-tag set defined in `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md` (mirrored in `~/.claude/skills/brainstorm-tomi/artifacts.md`). Tags: `[UI]`, `[backend]`, `[API]`, `[database]`, `[design]`, `[testing]`, `[infrastructure]`, `[integration]`, `[review]`, `[e2e]`, `[user-story-e2e]`, `[user-story-verification]`, `[FA]`, `[brownfield]`, `[project-sweep]`. Do NOT substitute conventional-commits-style tags (FEAT, FIX, REFACTOR, TEST, DOCS, CONFIG, PERF, SEC, MIGRATE, SEED, INFRA, CHORE, REVIEW, VALIDATE, SPIKE) — those are commit-message verbs, not task-card type tags, and would fail validation check C8 in `~/.claude/skills/superpowers-exec-tomi/references/validation.md`.

Per §11 Open Item 7: every story has an entry below. Type tags are drawn from the canonical 15-tag set in `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md`.

### Mapping table

| Story | Phase | Complexity | Type tags | Reads (pre-execution) |
|---|---|---|---|---|
| **US-STAB-A1** | A | Medium | `[backend][database][FA][brownfield]` | sprint design-doc, sprint manifest, sprint impact-analysis (own row), `Planning/architecture.md` (food_library_items + RLS), `Planning/PRD.md` (F4 Library Log) |
| **US-STAB-A2** | A | Medium | `[UI][backend][FA]` | sprint design-doc, `Planning/architecture.md` (auth + sidebar component), `Planning/ui-design.md` (sidebar identity row), `Planning/PRD.md` (F1 onboarding identity) |
| **US-STAB-A3** | A | Medium | `[backend][database][FA][brownfield]` | sprint design-doc, sprint impact-analysis, `Planning/architecture.md` (RLS + dashboard route), `Planning/architecture.md` (orphan-profile constraints), `Planning/testing-strategy.md` (RLS 32-assertion harness) |
| **US-STAB-A-VERIFY** | A | — | `[testing][user-story-verification]` | sprint design-doc, `Planning/PRD.md` (full feature catalog), `Planning/testing-strategy.md` |
| **US-STAB-B1** | B | Small | `[UI][backend][FA]` | sprint design-doc, `Planning/architecture.md` (route map + middleware), `Planning/PRD.md` (F1) |
| **US-STAB-B2** | B | Small | `[UI][FA]` | sprint design-doc, `Planning/ui-design.md` (Library new-item form), `Planning/architecture.md` (Library form component) |
| **US-STAB-B3** | B | Small | `[UI][FA]` | sprint design-doc, `Planning/ui-design.md` (sidebar nav-header), `Planning/architecture.md` (sidebar component) |
| **US-STAB-B4** | B | Medium | `[UI][backend][FA]` | sprint design-doc, `Planning/PRD.md` (F9 Weight Log), `Planning/architecture.md` (weight_log RLS + RSC pattern), `Planning/ui-design.md` (Progress page weight quick-add) |
| **US-STAB-B5** | B | Medium | `[testing][infrastructure][FA]` | sprint design-doc, `Planning/architecture.md` (route map), `Planning/testing-strategy.md` (e2e nav coverage), `Planning/ui-design.md` (sidebar/topbar/footer) |
| **US-STAB-B6** | B | Small | `[UI][FA]` | sprint design-doc, `Planning/ui-design.md` (Settings page), `lib/i18n/en.ts` (settings keys) |
| **US-STAB-B-USER-STORY-E2E** | B | — | `[testing][e2e][user-story-e2e]` | sprint design-doc, sprint testing-strategy, `Planning/testing-strategy.md` (E2E click-through mandate) |
| **US-STAB-C1** | C | Complex | `[UI][backend][FA]` | sprint design-doc, `Planning/PRD.md` (F2 Text Log + F3 Photo Log + F6 Dashboard), `Planning/architecture.md` (AI prompt structure + profiles + dashboard component), `Planning/ui-design.md` (Macros panel pattern + empty-state) |
| **US-STAB-C2** | C | Complex | `[UI][backend][database][FA]` | sprint design-doc, `Planning/PRD.md` (F4 Library Log + F19 Food Detail + Edit + Log-Now), `Planning/architecture.md` (food_library_items + food_entries + RLS), `Planning/ui-design.md` (Library page list + detail) |
| **US-STAB-C-USER-STORY-E2E** | C | — | `[testing][e2e][user-story-e2e]` | sprint design-doc, sprint testing-strategy, `Planning/testing-strategy.md` (E2E click-through mandate) |
| **US-STAB-D1** | D | Medium | `[UI][testing][FA]` | sprint design-doc, `Planning/ui-design.md` (focus ring + dashboard a11y), `Planning/testing-strategy.md` (axe sweep), `Planning/architecture.md` (dashboard component) |
| **US-STAB-D2** | D | Medium | `[backend][API][FA]` | sprint design-doc, `Planning/architecture.md` (auth middleware + API route conventions), `lib/auth/refresh-interceptor.ts` (existing) |
| **US-STAB-D3** | D | Small | `[UI][FA]` | sprint design-doc, `components/pwa/GoalWeightConflictModal.tsx` (existing), `lib/offline/conflict-resolver.ts` (existing), `lib/i18n/en.ts` (conflict keys) |
| **US-STAB-D4** | D | Medium | `[testing][infrastructure][FA]` | sprint design-doc, `Planning/architecture.md` (DDL), `Planning/testing-strategy.md` (mock fixture conventions) |
| **US-STAB-D5** | D | Small | `[infrastructure][FA]` | sprint design-doc, `.github/workflows/*.yml` (audit) |
| **US-STAB-D6** | D | Medium | `[database][backend][FA]` | sprint design-doc, sprint migration-plan, `Planning/architecture.md` (food_library_items DDL + RLS) |
| **US-STAB-D-USER-STORY-E2E** | D | — | `[testing][e2e][user-story-e2e]` | sprint design-doc, sprint testing-strategy, `Planning/testing-strategy.md` |
| **US-STAB-E1** | E | Medium | `[testing][infrastructure][FA]` | sprint design-doc, sprint testing-strategy, `Planning/features/2026-05-01-mvp-stabilization/verification-report.md`, `bugs/issuelog.txt`, `scripts/apply-prod-migrations.mjs` |
| **FINAL-US** | E | — | `[testing][user-story-verification]` | sprint design-doc (Phase Deliverables & User Stories), `Planning/tasks.md` (sprint US-STAB-* entries), `Planning/testing-strategy.md` |

**Per-phase sweep tasks (Codex review + Testing sweep):** Type tags `[review]` or `[testing]` per `task-schema.md` §Special Variants. Complexity = `—`. Reads = sprint tasks.md + `~/.claude/skills/brainstorm-tomi/codex-safety.md` for review; sprint testing-strategy + `Planning/testing-strategy.md` for sweep.

### Reads-field convention

For sprint tasks, the `Reads:` field uses the brownfield-folder-prefixed convention per `task-schema.md` §Valid Reads Entries:
- Sprint artifacts: `features/2026-05-01-mvp-stabilization/<artifact>.md`
- Project artifacts: bare path (e.g., `architecture.md`, `PRD.md`)

Each `Reads:` is a tactical extraction list — sub-agents read targeted sections, NOT full files. Per the Context Window Management policy in `~/.claude/CLAUDE.md`.

### Type-tag verification

Every type tag listed above is in the canonical 15-tag enum set:
`[UI]`, `[backend]`, `[API]`, `[database]`, `[design]`, `[testing]`, `[infrastructure]`, `[integration]`, `[review]`, `[e2e]`, `[user-story-e2e]`, `[user-story-verification]`, `[FA]`, `[brownfield]`, `[project-sweep]`.

`[project-sweep]` NOT used in this sprint per §8 audit decision.

---

## End of design doc

This document is the authoritative tiebreaker for all sprint artifacts. When `impact-analysis.md`, `migration-plan.md`, `failure-analysis.md`, `testing-strategy.md`, `tasks.md`, or `verification-report.md` disagree with this design doc, this design doc wins. When this design doc disagrees with project-level docs (`Planning/design-doc.md`, `Planning/architecture.md`, etc.), the project-level doc wins (THE original tiebreaker).

Sprint design committed. Step 5 complete.
