# Impact Analysis — MVP Stabilization Sprint

**Purpose:** Per-bug code/module/test impact map. Critical for execution-time per-task `Reads:` field grounding. This artifact captures sprint-level cross-cutting impacts; per-task narrow impact is captured at execution time inside each `superpowers-exec-tomi` task briefing.
**Who reads this:** Implementation sub-agents at task-spawn time; Phase Codex reviewer at phase close; FINAL-US authors.
**Authoritative source:** `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §4 (story ACs), §10 (failure-first analysis), §12 (risks), §14 (per-task type-tag + Reads mapping). Project artifacts: `Planning/architecture.md`, `Planning/PRD.md`. When this doc disagrees with design-doc, design-doc wins.

---

## Methodology note — brownfield engagement skipped

Per manifest + design-doc Q3 = A: **Phase 0f Brownfield Engagement was SKIPPED with explicit user override.** Project state is already well-mapped via 7 Complex-tier planning artifacts and 5 phases of execution-time progress tracking. Re-running formal Phase 0f sub-agents would re-derive ~90% already-known context.

**Compensating controls** (per manifest):
- Per-task Codex review for Medium + Complex tasks (D8 locked)
- Phase A verification report's per-feature × per-AC matrix surfaces unknown cross-cutting impacts
- Per-phase Codex Adversarial Review at every phase close
- Per-task `Reads:` field briefs each execution sub-agent on relevant project artifacts

**This artifact's coverage:** sprint-level impact map only — by user story, by cross-cutting concern. Fine-grained per-task impact (specific function-level changes, specific test-file additions) is captured at execution time inside the `Planning/.tmp/task-<id>-briefing.md` and inside each `Reads:` field per design-doc §14.

---

## Per-story impact map

Each story below is grouped by phase. Bundled bugs (e.g., issuelog #5 + #10 → US-STAB-C2) appear once at the story level.

### Phase A — P0 fixes

#### US-STAB-A1 — Library save on new-item creation (issuelog #4, P0)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Library new-item form submit handler; route handler that persists to `food_library_items`; library list-page server component that re-fetches after navigation |
| **Downstream consumers** | Library list page, dashboard "today's food" aggregate (if it pulls library-derived names), any future library-detail/edit code path |
| **Preserved behaviors** | RLS on `food_library_items` (auth.uid() = user_id), I11 client_id idempotency, R1 firewall (no raw fetch outside refresh-interceptor) |
| **Changed behaviors** | New rows actually persist (root cause is a save-call short-circuit or wrong supabase client; fixed at execution time via TDD RED reproducer) |
| **RLS implications** | YES — `food_library_items` per-user isolation. RLS 32-assertion harness must stay GREEN at Phase A close |
| **Test surfaces (existing GREEN)** | RLS 32-assertion harness, existing library-list integration tests |
| **New tests required** | `tests/integration/library-create.test.ts::persists-to-food-library-items` (AC1); `tests/e2e/web/user-stories/US-STAB-A1.spec.ts::library-create-visible-after-nav` (AC2); RLS harness extended for `library_items_user_isolation` case (AC3) |

#### US-STAB-A2 — Sidebar identity shows real Gmail (issuelog #9, P0)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Sidebar identity row component (`components/SidebarIdentity.tsx` or equivalent); auth-context provider that hydrates `auth.users.email` |
| **Downstream consumers** | Every page that mounts the sidebar (~all authed pages) |
| **Preserved behaviors** | Anonymous placeholder display (per ui-design.md), HTML escaping of email |
| **Changed behaviors** | Replace any "dev user" hardcoded string with the real `auth.users.email` value; fall back to `auth.users.user_metadata.full_name` then literal `"Account"` if email scope absent (DT-9 / AC4) |
| **RLS implications** | NO (read-only access to `auth.users` via session) |
| **Test surfaces (existing GREEN)** | Existing sidebar mount tests, existing auth-context tests |
| **New tests required** | `tests/e2e/web/user-stories/US-STAB-A2.spec.ts::sidebar-shows-gmail-not-devuser` (AC1); `tests/unit/sidebar/identity-row.test.tsx::escapes-email-html` (AC2); `tests/unit/sidebar/identity-row.test.tsx::anon-shows-placeholder` (AC3); `tests/unit/sidebar/identity-row.test.tsx::email-missing-falls-back-to-fullname-or-account-literal` (AC4) |

#### US-STAB-A3 — Orphan-profile dashboard read fence (F-SEC-2026-04-25-*, P0)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Page route handlers for `/dashboard`, `/log`, `/library`, `/progress`, `/weight`, `/settings`; aggregate API endpoints under `/api/dashboard/*`, `/api/log/*`, `/api/library/*`, `/api/progress/*`, `/api/weight/*`, `/api/settings/*` |
| **Downstream consumers** | All UI surfaces that read aggregates; Sentry breadcrumb stream |
| **Preserved behaviors** | RLS on every table queried via `auth.uid()` scoping; existing 401 contract on already-401 endpoints; non-orphan happy-path response shape |
| **Changed behaviors** | Page handlers redirect 302 to `/onboarding` when profile lookup fails (AC1); API endpoints return JSON 401 with `{ "error": "profile_lookup_failed" }` (AC2); single-pass LEFT JOIN profile-and-aggregate to avoid TOCTOU (AC5); optional fallback-create-profile branch must use atomic `INSERT ... ON CONFLICT DO NOTHING` with no client fields, then redirect (AC6); Sentry breadcrumb on orphan detection with hashed user_id (AC3); auth.uid() scoping enforced on every aggregate (AC4) |
| **RLS implications** | YES — single-pass profile-and-aggregate query needs RLS-compatible JOIN; cross-user data must NEVER appear in fallback or empty-state |
| **Test surfaces (existing GREEN)** | Existing dashboard happy-path integration tests, existing /onboarding redirect tests |
| **New tests required** | All 6 ACs at `tests/integration/dashboard-orphan-profile.test.ts` (separate test cases per AC) |
| **Special concern** | TOCTOU race (P-2 / R-STAB-11): AC5 must explicitly assert single-pass LEFT JOIN OR transaction containment between profile lookup and aggregate fetch |

#### US-STAB-A-VERIFY — Verification dispatch meta-task

| Aspect | Impact |
|---|---|
| **Code paths affected** | None (test-only meta-task) |
| **Downstream consumers** | Phase B/C/D scope (verification report bugs fold into US-STAB-C4..C? minted at Phase A close) |
| **Preserved behaviors** | All 19 PRD features remain documented in `Planning/PRD.md` |
| **Changed behaviors** | New artifact `verification-report.md` with per-feature × per-AC matrix |
| **RLS implications** | NO |
| **Test surfaces** | Manual verification of verification-report.md completeness via `scripts/verify-report-completeness.mjs` |
| **New tests required** | None — this task DOES the testing (6 sub-agents run AC-by-AC walkthroughs) |

### Phase B — P1 single-file patches

#### US-STAB-B1 — Authed users redirect from `/` to `/dashboard` (issuelog #1, P1)

| Aspect | Impact |
|---|---|
| **Code paths affected** | `app/(marketing)/page.tsx` (root marketing/landing page) + middleware (auth gate detection) |
| **Downstream consumers** | Landing-page Lighthouse / visual baselines (already updated in commit 7032730 per Troubleshoot session) |
| **Preserved behaviors** | Anon visitor sees landing page (AC2); cold-response LCP delta within +50ms vs landing baseline (AC3) |
| **Changed behaviors** | Authed user → server-side 302 redirect to `/dashboard` (AC1) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Landing visual baselines (post-7032730), Lighthouse landing baseline |
| **New tests required** | `tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-redirects-authed-to-dashboard` (AC1); `tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-shows-landing-anon` (AC2); manual Lighthouse delta (AC3) |

#### US-STAB-B2 — New-item form clears after save (issuelog #3, P2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Library new-item form component (form state reset hook + focus management) |
| **Downstream consumers** | Library new-item flow, AC1 of US-STAB-A1 (a successful save must trigger the clear) |
| **Preserved behaviors** | On error: inputs preserved (AC2); shape of submit handler |
| **Changed behaviors** | On 2xx success: every input resets to empty/default (AC1); first input refocused at offset 0 (AC3) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing library-form unit tests |
| **New tests required** | `tests/unit/library-form/clears-after-save.test.tsx::clears-on-success`, `::preserves-on-error`, `::focus-first-input-after-clear` |

#### US-STAB-B3 — Sidebar "Navigation" header non-interactive (issuelog #8, P3)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Sidebar shell component (the "Navigation" label element) |
| **Downstream consumers** | Tab order across all authed pages; axe sidebar audit |
| **Preserved behaviors** | Sidebar nav-link targets, sidebar visual structure |
| **Changed behaviors** | "Navigation" element becomes `<h2>` with no `href`, no `onClick`, no `tabindex=0` (AC1); skipped in tab order (AC2); axe-clean (AC3) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing sidebar render tests, existing axe sweep |
| **New tests required** | `tests/unit/sidebar/nav-header-non-interactive.test.tsx::no-interactive-attrs`, `::not-in-tab-order`; existing axe sweep extended to cover sidebar `<nav>` block |

#### US-STAB-B4 — Progress page weight quick-add + RSC refresh (issuelog #11 + F-WEIGHT-QUICK-ADD-RSC-REFRESH, P1)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Progress page weight quick-add component; weight-log mutation route; RSC route handler revalidation |
| **Downstream consumers** | Progress chart, dashboard weight-card if any, F10 conflict modal (cross-link to D3) |
| **Preserved behaviors** | Weight bounds `[30, 350]` kg (AC2); lbToKg constant `0.45359237` reused (AC2); F10 modal honesty contract (AC4 cross-references D3) |
| **Changed behaviors** | Save → `router.refresh()` only (AC1); NO `window.location.reload()`, NO full-document navigation; Playwright network confirms `_rsc=` POST to current path; chart reflects new datapoint within 1.5s (AC3) |
| **RLS implications** | YES — weight_log RLS unchanged but mutation goes through R1 firewall |
| **Test surfaces (existing GREEN)** | Existing weight-log mutation integration test, existing R1 firewall test |
| **New tests required** | `tests/e2e/web/user-stories/US-STAB-B4.spec.ts::quick-add-router-refresh-no-hard-reload`, `::chart-updated-after-save`; `tests/unit/progress/weight-quick-add.test.tsx::bounds-validation` |

#### US-STAB-B5 — Site-wide nav audit (issuelog #6, P2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | New `scripts/nav-audit.mjs` (static analysis tool); canonical 404 page component (verify renders) |
| **Downstream consumers** | CI workflow (nav-audit job), all sidebar/topbar/footer/dashboard tile links |
| **Preserved behaviors** | Existing route map in `Planning/architecture.md`; existing axe + Playwright nav e2e suite |
| **Changed behaviors** | New CI-time static analysis: scans every `<a>` and `<Link>` reference, reports zero 404s/dead/orphans (AC1); 404 fixture renders canonical Kalori 404 (AC3); keyboard-traversal landing on every sidebar/topbar/footer link (AC2) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing axe + Playwright nav e2e suite |
| **New tests required** | `tests/integration/nav-audit.test.ts::no-404s-no-orphans`; `tests/e2e/web/404.spec.ts::canonical-404-page` |
| **Note** | Functional coverage of route-level primary actions belongs to A-VERIFY per design-doc §4 note — do not double-bill |

#### US-STAB-B6 — Settings stub copy removed (issuelog #7, P1, patch-shaped per DT-1)

| Aspect | Impact |
|---|---|
| **Code paths affected** | `app/(app)/settings/page.tsx` (lines that render stub copy); `lib/i18n/en.ts:769-770` (delete the stub keys) |
| **Downstream consumers** | Settings page render |
| **Preserved behaviors** | `ReduceMotionToggle`, `DataSubsection`, `AccountSubsection` mounted (AC3) |
| **Changed behaviors** | "Settings arrive with Task 2.2" string does NOT appear in DOM (AC1); single `<h1>` "Settings" sourced from `lib/i18n/en.ts::settings.heading` (AC2); stub keys at lines 769–770 deleted (AC2) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing Settings spec |
| **New tests required** | `tests/unit/settings/page.test.tsx::no-stub-body-copy`, `::single-h1-from-i18n-and-stub-deleted` |

### Phase C — P1 features

#### US-STAB-C1 — Micros + RDA panel (issuelog #2, P1, Complex)

| Aspect | Impact |
|---|---|
| **Code paths affected** | New constant `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (~30 entries); Gemini AI prompt for F2 Text Log + F3 Photo Log (extends prompt to require `micros` field); dashboard layout (new `DashboardMicrosPanel.tsx`); RDA resolver (`lib/nutrition/micros-rda.ts::resolveRDA`) |
| **Downstream consumers** | Dashboard render, AI accuracy fixture suite (existing 30/30 must remain GREEN — Lesson #5 invariant), entry persistence (entries must store `micros` JSON if present) |
| **Preserved behaviors** | AI accuracy 30/30 critical.ts fixtures (AC2); existing macros panel; cache-tag set frozen `['24h','D','7d','30d','90d','1y']` |
| **Changed behaviors** | AI prompt returns `micros` field with all 30 entries from `DEFAULT_MICROS_LIST` (AC1); dashboard renders Micros panel below Macros panel showing each as `% of RDA` (AC3); RDA values read from code constant only — per-user override DEFERRED per DT-5 (AC4); empty-state for sparse data (AC5) |
| **RLS implications** | NO new tables; if `food_entries` schema gets a `micros` column (additive), the existing per-user RLS applies unchanged |
| **Test surfaces (existing GREEN)** | `tests/fixtures/ai-accuracy/critical.ts` (30 fixtures) — must stay GREEN |
| **New tests required** | `tests/unit/ai/micros-extraction.test.ts::all-30-micros-present-in-response` (AC1); `tests/integration/dashboard-micros-panel.test.tsx::renders-thirty-micros-with-pct-rda` (AC3); `tests/unit/dashboard/micros-rda-resolver.test.ts::reads-default-constants` (AC4); `tests/integration/dashboard-micros-panel.test.tsx::sparse-data-empty-state` (AC5); existing `tests/unit/ai/vn-smoke.test.ts` re-run for AC2 |
| **Fixture additions (additive)** | `tests/fixtures/ai-accuracy/critical.ts` extended with micros assertions for the 5 VN dishes; new entries do NOT regress existing 30 |

#### US-STAB-C2 — Library CRUD UI (issuelog #5 + #10, P1, Complex)

| Aspect | Impact |
|---|---|
| **Code paths affected** | `app/(app)/library/page.tsx` (two-section layout); `components/library/Library*.tsx` (list, detail modal, edit form, delete confirmation, "Log Now" CTA); `app/api/library/[id]/route.ts` (PATCH, DELETE); `app/api/library/[id]/log/route.ts` (POST → `food_entries`); R1 firewall paths for new mutations |
| **Downstream consumers** | `food_entries` (Log Now creates a new entry); RLS 32-assertion harness; refresh-interceptor (R1) |
| **Preserved behaviors** | RLS on `food_library_items` AND `food_entries` (AC5); R1 firewall (every new mutation goes through `lib/auth/refresh-interceptor.ts`); I11 idempotency (every new mutation accepts `client_id` header) |
| **Changed behaviors** | Library page renders TWO sections — "My Library" + "Recent Entries" (AC1); per-row Edit modal saves via single CTA (AC2); Delete confirms + removes from DB (AC3); Log Now creates `food_entries` row for today (AC4) |
| **RLS implications** | YES — RLS 32-assertion harness MUST remain GREEN after C2 (AC5); new mutation routes inherit existing RLS policies |
| **Test surfaces (existing GREEN)** | Existing library list test, existing food_entries integration tests |
| **New tests required** | `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::two-sections-visible` (AC1), `::edit-modal-saves` (AC2), `::log-now-creates-entry` (AC4); `tests/integration/library-crud.test.ts::delete-removes-row` (AC3); existing RLS harness re-runs (AC5) |
| **Cross-cutting concern** | "Log Now" handler MUST snapshot library item atomically at click-time (per design-doc §10 P-1 mitigation); per-task Codex assertion at task close |

#### US-STAB-C4..C? — TBD post-Phase-A from verification report

Story IDs minted at Phase A close. Each follows AC template. Impact map written into this artifact OR per-task briefing at minting time. Sprint orchestrator updates this artifact when minting if cross-cutting impact is non-obvious.

### Phase D — Hardening

#### US-STAB-D1 — Dashboard a11y violations resolved (F-A11Y-DASHBOARD-MULTIPLE-VIOLATIONS, P1)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Dashboard component(s); focus-ring CSS; chart aria-labels |
| **Downstream consumers** | Lighthouse a11y score; axe sweep |
| **Preserved behaviors** | Dashboard layout, "The Ledger" direction (oxblood/ivory/warm-near-black, zero-radius, no shadows) |
| **Changed behaviors** | Zero axe violations on dashboard (AC1); IVORY 2px + 2px focus ring (AC2 — per project ux-auditor WCAG 2.5.8 correction); chart aria-labels or visually-hidden text (AC3) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing axe sweep (will gain coverage post-D1) |
| **New tests required** | `tests/integration/dashboard-a11y.test.tsx::axe-zero-violations`, `::charts-have-aria-labels`; `tests/e2e/web/dashboard-a11y.spec.ts::axe-zero-violations`; `tests/visual/dashboard-focus-ring.test.ts::ivory-focus-ring` |
| **Dependency** | DEPENDS ON C1 — Micros panel must exist first to be a11y-audited |

#### US-STAB-D2 — API JSON 401 contract (F-API-401-VS-HTML-REDIRECT, P2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | Auth middleware for `/api/*`; refresh-interceptor (`lib/auth/refresh-interceptor.ts`) |
| **Downstream consumers** | Service worker fetch handler (must skip caching 401 — per design-doc §10 P-4 mitigation); SPA fetch consumers; refresh-interceptor (R1 invariant preserved) |
| **Preserved behaviors** | Auth middleware shape on page routes (302 to /login still ok there); R1 firewall; service worker offline behavior for non-401 responses |
| **Changed behaviors** | Unauthenticated `/api/*` → 401 JSON `{ "error": "unauthenticated" }` with `Content-Type: application/json` (AC1); NO `Location:` header, NO HTML body (AC2); refresh-interceptor handles new shape (AC3); service worker skips caching of 401 responses |
| **RLS implications** | NO direct change (all mutation routes still go through RLS) |
| **Test surfaces (existing GREEN)** | Existing refresh-interceptor.test.ts, existing service worker tests |
| **New tests required** | `tests/integration/api-401-shape.test.ts::api-returns-json-401`, `::no-location-header`; existing refresh-interceptor.test.ts extended (AC3); SW fetch-handler skip-on-401 test |

#### US-STAB-D3 — F10 conflict modal honest copy verify + AC4 (P2, honest-copy scope per DT-2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | `components/pwa/GoalWeightConflictModal.tsx` (verification only); `lib/i18n/en.ts` (AC3 assertion test); existing tests get a binding-regression test added (AC4) |
| **Downstream consumers** | Existing modal consumers (`lib/offline/conflict-resolver.ts`) |
| **Preserved behaviors** | Modal already correct: Cancel button left, USE CURRENT VALUE right, ESC=Cancel non-destructive, role="alertdialog", aria-modal=true, scrim-disabled, initial focus on Cancel |
| **Changed behaviors** | None to existing code; ADD AC3 (i18n regression — no deprecated "USE OFFLINE VALUE" string anywhere in en.ts); ADD AC4 (handler-binding regression — Cancel→handleCancel, USE CURRENT VALUE→handleUseCurrent, distinct functions) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing `tests/unit/pwa/GoalWeightConflictModal.test.tsx` |
| **New tests required** | `tests/unit/i18n/en.test.ts::no-deprecated-conflict-copy` (AC3); `tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx::label-handler-bound-correctly-and-distinct` (AC4) |
| **Followup update** | Update existing `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` status note: "D3 honest-copy-only scope-down verified in this sprint; full client-wins-resubmit impl remains DEFERRED to post-MVP cleanup." Do NOT mint duplicate `-IMPL` ID. |

#### US-STAB-D4 — Schema-drift CI guard (F-UI-3.7-SCHEMA-DRIFT-GUARD, P1)

| Aspect | Impact |
|---|---|
| **Code paths affected** | New CI workflow `schema-drift-check.yml`; new test files; existing fixtures + `lib/**` + `app/api/**` table/column references audited |
| **Downstream consumers** | CI test report; PR merge gate (after stage 2); generated types `lib/database.types.ts` (must stay fresh) |
| **Preserved behaviors** | Existing CI workflows; existing test suites; existing fixtures |
| **Changed behaviors** | New audit job parses literal table/column references, compares against live schema; stage 1 = report-only mode for 1 day (AC2); stage 2 = block mode (AC2); generated types stay fresh vs migrations (AC4) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Existing test fixtures (will be audited but should pass without modification) |
| **New tests required** | `tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::audits-both-fixtures-and-app-code` (AC1), `::fails-on-drift-in-fixtures-or-app-code` (AC2); workflow integration manual PR test (AC3); `tests/integration/schema-drift/generated-types-fresh.test.ts::types-not-stale-vs-migrations` (AC4) |
| **Risk** | FF #G + R-STAB-7: stage-1 report-only first to avoid CI red wave |

#### US-STAB-D5 — Node 24 GH Actions runtime migration (F-DEP-1, P2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | All `.github/workflows/*.yml` `uses:` declarations |
| **Downstream consumers** | CI runner (Node 24 javascript-action runtime); pnpm/setup-node/checkout/upload-artifact action versions |
| **Preserved behaviors** | Existing workflow steps (only `uses:` versions change); existing test matrix (Vitest, Playwright, axe, Lighthouse, lint, typecheck) GREEN under Node 24 |
| **Changed behaviors** | Every workflow's `uses:` action declarations bumped to majors that support Node 24 javascript-action runtime: `actions/checkout@v4+`, `actions/setup-node@v4+`, `pnpm/action-setup@v3+`, `actions/upload-artifact@v4+` (AC1); validated under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` (AC2) |
| **RLS implications** | NO |
| **Test surfaces (existing GREEN)** | Full CI matrix |
| **New tests required** | `tests/integration/ci/action-versions-support-node24.test.ts::all-uses-on-node24-compatible-majors` (AC1); manual PR CI run (AC2) |
| **Note** | App-runtime Node version bump (to Node 22) is a separate opt-in tracked as `F-DEP-NODE22-APP-RUNTIME`; D5 minimum is action-runtime only (AC3) |

#### US-STAB-D6 — F-LIB-DEDUP migration 0018 (P2)

| Aspect | Impact |
|---|---|
| **Code paths affected** | New `supabase/migrations/0018_food_library_dedup_index.sql`; existing library-create code path inherits new constraint |
| **Downstream consumers** | Library create/edit/log workflows; RLS 32-assertion harness; `apply-prod-migrations.mjs` |
| **Preserved behaviors** | RLS 32-assertion harness GREEN (AC5); soft-deleted rows do NOT block re-insert (AC4); existing library data shape |
| **Changed behaviors** | Partial unique index on `(user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` (AC1); duplicate active-row insert fails with `23505` (AC2); pre-cleanup transaction handles existing dupes via 7-step transactional sequence with ACCESS EXCLUSIVE LOCK + SECURITY DEFINER (AC3, AC6, AC7) |
| **RLS implications** | YES — runtime RLS unchanged; cleanup uses SECURITY DEFINER (service-role) for cross-user_id soft-deletes (AC7); new index does not change row visibility |
| **Test surfaces (existing GREEN)** | Existing library-create.test.ts, RLS 32-assertion harness |
| **New tests required** | `tests/integration/db/0018-migration.test.ts::index-exists-with-soft-delete-predicate` (AC1); `tests/integration/library-create.test.ts::dedup-blocks-duplicate-active-insert` (AC2), `::soft-deleted-does-not-block-reinsert` (AC4); `tests/integration/db/0018-pre-cleanup.test.ts::transactional-dedup-then-index` (AC3), `::single-transaction-with-access-exclusive-lock` (AC6), `::executes-as-service-role-and-rls-unchanged` (AC7) |
| **Dependency** | DEPENDS ON A1 + C2 — library entries + CRUD must exist before dedup matters |

### Phase E — Closure

#### US-STAB-E1 — Phase E manual smoke + prod cutover

| Aspect | Impact |
|---|---|
| **Code paths affected** | None (closure paperwork + prod cutover invocation) |
| **Downstream consumers** | kalori-prod schema (gains migration 0018); `Planning/progress.md` (Phase 5 closes); `Planning/followups.md` (resolved + deferred markers); sprint state (`brainstorm-state.md` → complete) |
| **Preserved behaviors** | All sprint US-STAB-* stories already GREEN at this point; full test suite green |
| **Changed behaviors** | All 11 issuelog entries get post-fix screenshot evidence (AC1); migration 0018 applies to kalori-prod via `scripts/apply-prod-migrations.mjs` (AC2); FINAL-US runs every sprint user-story E2E (AC3) |
| **RLS implications** | YES — post-cutover RLS 32-assertion harness must remain GREEN |
| **Test surfaces (existing GREEN)** | Full sprint E2E suite under `tests/e2e/web/user-stories/US-STAB-*.spec.ts` |
| **New tests required** | `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-issuelog-recheck.md` (manual evidence); `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-prod-migration.md` (manual evidence) |

---

## Cross-cutting impacts (sprint-wide)

### R1 firewall preservation

`lib/auth/refresh-interceptor.ts` is the project's load-bearing R1 contract: every fetch from a client component goes through this interceptor for session refresh. Sprint introduces no new mutation routes that bypass it.

**Tasks affected:** US-STAB-A1, B4, C2, D2 — anything that introduces a new fetch path. Per-task pre-flight grep ensures no raw `fetch(` outside the interceptor (per design-doc §9). Per-task Codex (M+C) reviews this contract.

### I11 client_id idempotency

Every new mutation route accepts a `client_id` header AND stores it on the row for idempotent retries (per design-doc §9 + project `Planning/architecture.md` "Idempotency Contract I11").

**Tasks affected:** US-STAB-A1 (library create), US-STAB-C2 (library CRUD endpoints), US-STAB-B4 (weight quick-add — already idempotent, verify shape preserved). Per-task Codex assertion.

### Cache-tag set frozen `['24h','D','7d','30d','90d','1y']`

Per design-doc §10 invariants. No sprint task adds or removes from the set. Pre-task `Files:` review catches violations.

### RLS 32-assertion harness GREEN at every phase close

Per design-doc §10 invariants + design-doc §13 closure criterion #7. Phase A, C, D, E gates run the harness. Any regression blocks phase close.

### AI accuracy fixture set non-regressing

Per Lesson #5 invariant + design-doc §10 invariants. C1's RED test asserts critical.ts 30/30 stays GREEN BEFORE prompt change is committed. New micros fixtures additive only — no removal/modification of existing 5 VN smoke entries.

### Storage-FIRST cascade on account delete

Per project F14 + design-doc §10 invariants. Sprint introduces NO change to `/api/account-delete`. Existing test harness asserts cascade order remains Storage→DB.

### Fail-closed deletion fence on mutation routes

Per project `architecture.md` + design-doc §10 invariants. Sprint introduces NO change to deletion fence semantics. Library CRUD (C2) inherits existing fence — verified at C2's per-task Codex.

---

## Trigger check for `[project-sweep]` task emission

Per Step 6.7a contract in `~/.claude/skills/brainstorm-tomi/SKILL.md`:

| Trigger | Sprint state | Decision |
|---|---|---|
| (a) New subsystem? | NO — every sprint change fixes existing surface | Not triggered |
| (b) 3+ Break-Risk-High API changes? | NO — only F-LIB-DEDUP single index touches existing API surface (D6); D2 changes API 401 shape but is single-route contract; D5 is CI-action-version bump (no app API impact) | Not triggered |
| (c) DB schema migration affecting multiple consumers? | NO — 0018 affects single consumer (`food_library_items`); 0019 deferred per DT-5; 0020 reserved-not-used per DT-2 | Not triggered |

**Decision: `[project-sweep]` task NOT EMITTED.** Recorded in `Planning/tasks.md` sprint section header per Step 6.7a contract. If verification report at Phase A close surfaces 3+ break-risk-high issues, this decision is revisited at Phase A close.

---

## Risk register cross-reference

Sprint-level risk register lives in design-doc §12 (R-STAB-1..R-STAB-15). Key risks per phase:

| Phase | Active risks | Mitigation owner |
|---|---|---|
| A | R-STAB-1 (verification overflow), R-STAB-11 (TOCTOU on orphan fence), R-STAB-15 (sub-agent attention) | A-VERIFY orchestrator |
| B | R-STAB-6 (parallel sub-agent file conflict) | Orchestrator file-disjoint check |
| C | R-STAB-2 (AI fixture regression) | C1 RED test asserts 30/30 BEFORE prompt change |
| D | R-STAB-3 (migration dedup conflict), R-STAB-5 (Codex >1MB), R-STAB-7 (CI red wave), R-STAB-8 (Node 24 break), R-STAB-12 (VN diacritic dedup), R-STAB-13 (SW caches 401) | D-bundle leads + Phase D Codex |
| E | R-STAB-10 (FINAL-US missing test), R-STAB-14 (prod schema drift) | E1 owner + Phase E Codex |
| Cross | R-STAB-4 (D3 scope explode — already mitigated), R-STAB-9 (B6 unscoped — already mitigated) | Locked at design |

Full register with severity/likelihood/mitigation/owner-phase columns lives in design-doc §12.

---

End of impact analysis.
