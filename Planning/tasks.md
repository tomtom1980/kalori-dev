# Kalori — Implementation Plan (`tasks.md`)

> **Project:** Kalori — AI-first calorie/nutrition tracker (single-user MVP)
> **Complexity tier:** Complex (7 downstream artifacts)
> **Phasing:** 5 linear phases. **First-usable milestone at end of Phase 3** — user can sign in, complete onboarding, log a meal, and see the dashboard reflect their entries.
> **Total tasks:** 26 (16 implementation + 10 mandatory phase-gate tasks)
> **Source authorities:**
> - `CLAUDE.md` (project root) — session-start project map, pre-execution delta, credential file pointers
> - `Planning/setup-state.md` — infrastructure setup state (read BEFORE Task 1.1 to avoid re-provisioning)
> - `Planning/design-doc.md` — design decisions (sections referenced inline as `design-doc.md §N`)
> - `Planning/brainstorm-context/02-pre-plan.md` — Step 6 handoff
> - `Planning/kalori-project-blueprint.md` — product spec, anti-scope
> - `Planning/architecture.md` — full Supabase DDL, route map, folder structure
> - `Planning/ui-design.md` — The Ledger component specs, responsive nav, motion (two-pass synthesis)
> - `Planning/testing-strategy.md` — full test matrix, fixtures, CI config
> - `Planning/progress.md` — execution-time tracking
> - `Planning/CHANGELOG.md` — execution-time change log
> - `Planning/apikeys.txt` + `Planning/devapikeys.txt` — **gitignored** credential files; execution sub-agents read env var names + values from here

---

## Task counts per phase

| Phase | Name | Impl tasks | Mandatory tasks | Phase total |
|---|---|---|---|---|
| 1 | Foundation | 3 | 2 | 5 |
| 2 | Auth + Onboarding | 2 | 2 | 4 |
| 3 | Dashboard + Log (FIRST USABLE) | 5 | 2 | 7 |
| 4 | Library + Progress | 4 | 2 | 6 |
| 5 | Polish + PWA | 2 | 2 | 4 |
| **Total** | | **16** | **10** | **26** |

---

## Canonical TDD Mandate (applies to every implementation task)

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

## Legend

- **Complexity** — `Simple` (1 file, <30min) · `Medium` (1–4 files, 30–90min, real logic) · `Complex` (4+ files, >90min, cross-cutting) · `Review` (mandatory phase gate).
- **Codex review** — `Per-task required` triggers `/codex:adversarial-review` after the task. `Per-phase covers` defers to the phase-end review task.
- **Type tags** — pick from `[UI]`, `[backend]`, `[API]`, `[database]`, `[design]`, `[testing]`, `[infrastructure]`, `[integration]`, `[review]`.
- **Reads** — artifacts the execution sub-agent loads BEFORE starting. Always includes the task's own `tasks.md` entry.
- **Acceptance criteria** — concrete, testable. Includes invariant references (I1–I12) and failure-mode mitigations (F1–F12) where applicable.
- **Steps** — ordered. Step 1 is always the first failing test name (TDD).

---

## Invariant coverage matrix (I1–I12)

| Invariant | Enforced in task(s) |
|---|---|
| I1 RLS on every user-owned table | 1.2 (harness), 2.1 (profiles), 3.1 (5 tables + Storage bucket policy), 4.5 (none new — re-uses), 5.2 (none new) |
| I2 Every AI lookup writes ai_call_log | 3.2 |
| I3 Gemini key server-only | 1.1 (CI lint), 3.2 |
| I4 Photo originals deleted; thumbnails <50kb | 3.3 |
| I5 Mifflin-St Jeor pure functions w/ unit tests | 2.1 |
| I6 Auth required except `/`, `/login`, `/auth/callback` | 2.1 (middleware) |
| I7 AI failure never blocks logging | 3.3 (fallback path) |
| I8 Undo toast 5s LIFO + cleared on route nav | 3.4 (initial), 5.2 (cross-tab extension via BroadcastChannel) |
| I9 Account deletion: Storage → DB → auth.users | 5.2 |
| I10 AI responses Zod-validated | 3.2 |
| I11 client_id UUID + UNIQUE + 200 no-op replay | 3.1 (schema), 3.4 (log-save mutations), 4.3b (weight log), 5.1 (offline outbox replay — full contract owner) |
| I12 ESLint rule forbids inline cacheTag literals | 1.3 |

## Failure-mode coverage matrix (F1–F12)

| Failure mode | Mitigated in task(s) |
|---|---|
| F1 RLS gap on new table | 1.2 (harness), 3.1 (5 tables + Storage bucket), 4.5 (none new) |
| F2 Gemini timeout / rate-limit | 3.2 (8s/30s boundaries), 3.3 (fallback) |
| F3 Optimistic update lies | 3.4 (undo rollback test), 5.1 (hardening) |
| F4 Stale weekly review on week rollover | 4.3a (weekly_reviews TTL test) |
| F5 Timezone day-boundary bug | 2.1 (TZ stored), 3.5 (aggregation in user TZ) |
| F6 Undo expires before persist across nav | 3.4 (Zustand persist + cleared-on-nav-timer-continues), 5.2 (cross-tab undo via BroadcastChannel) |
| F7 Photo upload silently drops | 3.3 (timeout + retry) |
| F8 Gemini cache poisoning across users | 3.2 (cache key includes user_id) |
| F9 Auto-recalc surprise | 4.3b (nudge card + manual override) |
| F10 Offline outbox sync conflicts | 5.1 (LWW + goal-weight confirm) |
| F11 Prompt injection | 3.2 (role-separated parts + sanitization + Zod) |
| F12 Auth session expired mid-mutation | 2.1 (refresh-and-retry interceptor — primary owner); reinforcement tests in 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b (forced-401 integration coverage); 5.2 (cross-tab sign-out via BroadcastChannel) |

---

## Known Residual Risks (Codex Round 2 — accepted, not fixed)

### R1 — Task 2.1 is a dense critical-path bottleneck

Codex Round 2 flagged that Task 2.1 now owns: auth flows, profiles, RLS policies, middleware, Mifflin/TDEE/target calc modules, AND (after Round 1) the F12 refresh-and-retry interceptor. Nearly every Phase 3/4 mutation task depends on it. If Task 2.1 slips or lands partially, downstream work stalls.

**Accepted rationale:** Splitting Task 2.1 into 2.1a/2.1b introduces its own coordination overhead (two sub-tasks to track, two Codex/testing gates, dependency fan-out). For a single-owner project, the coordination cost exceeds the critical-path cost.

**Mitigation stance:**
1. Treat Task 2.1 as the longest Phase 2 task; allocate buffer accordingly.
2. **Phase 3/4 mutation tasks are EXPLICITLY FORBIDDEN from implementing local refresh behavior.** If `lib/auth/refresh-interceptor.ts` is not ready when a Phase 3 task is unblocked, that Phase 3 task WAITS. Do not duplicate the refresh logic.
3. During execution, if Task 2.1 is trending to miss its time-box, pause Phase 3 kick-off and reassess — do NOT let downstream tasks create a local refresh shim as a workaround.
4. Revisit this decision before Phase 3 starts: if Task 2.1 proved too large, split the interceptor into a separate Task 2.1.5 as a reactive mitigation.

**Codex Round 2 recommendation (not followed):** split Task 2.1 into 2.1a (auth + F12 interceptor + profiles) and 2.1b (MSJ + target calc + middleware integration). Recorded here so reviewers know the decision was deliberate.

---

# Phase 1 — Foundation

Scope: Repo scaffold, CI, Supabase project, Sentry, design tokens, responsive nav shell, i18n, cache-tag constants, ESLint rules, RLS test harness, test infrastructure, seed script. **No user-facing features ship from this phase.**

---

### Task 1.1: Scaffold Next.js 16 + Tailwind v4 + shadcn + CI + Sentry

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [infrastructure] [design]
**Files:**
- `package.json`, `pnpm-lock.yaml`
- `next.config.ts`, `tsconfig.json` (strict mode), `tailwind.config.ts`, `postcss.config.js`
- `app/layout.tsx`, `app/(marketing)/page.tsx` (placeholder masthead), `app/globals.css`
- `components/ui/` (shadcn-generated primitives — button, input, dialog, sheet, toast, tabs)
- `.github/workflows/ci.yml` — TS + ESLint + Vitest + Playwright + RLS lint
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `.env.example` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (server-only), `SENTRY_DSN`, `KALORI_ENV`
- `.eslintrc.json` — includes rule forbidding `process.env.GEMINI_API_KEY` references in any file under `app/(app)/`, `app/(marketing)/`, `app/(auth)/`, `components/`

**Reads:**
- `tasks.md` (this entry)
- `design-doc.md` §4 (Architecture Overview), §17 (Phasing & Delivery)
- `kalori-project-blueprint.md` §8 (Technical Preferences)

**Goal:** Provision a buildable, type-checked, lint-clean Next.js 16 app shell deployed to Vercel, with Sentry wired and CI green.

**Acceptance criteria:**
- [ ] `pnpm build` succeeds with `next` 16.x, React 19, TypeScript strict mode, Tailwind v4 configured for `bg-0` `#0E0A08` body background
- [ ] `pnpm lint` runs with zero violations
- [ ] CI workflow runs on push and PR — TypeScript, ESLint, Vitest, Playwright (RLS placeholder), `gemini-key-leak-guard` lint job
- [ ] Vercel preview deploy renders an empty masthead at `/` (Newsreader font loaded, oxblood dot present) — visual regression baseline established
- [ ] Sentry captures a test error in dev (`/api/sentry-test` route) and stops capturing it in production (filtered)
- [ ] **I3 enforced:** ESLint rule fails the build if any file under `app/(app|marketing|auth)/`, `components/`, or client-bundled `lib/` imports `GEMINI_API_KEY` directly; only `lib/ai/**` (server-only) may reference it
- [ ] Tests:
  - Unit: `tests/unit/eslint-no-gemini-leak.test.ts` proves the rule fires on a fixture file
  - Integration: `tests/integration/sentry-init.test.ts` asserts Sentry initializes with `KALORI_ENV` scope tag
  - E2E: `tests/e2e/landing-renders.spec.ts` (Playwright) asserts masthead text is visible at `/`

**Steps:**
1. **TDD first:** Write `tests/unit/eslint-no-gemini-leak.test.ts` asserting the custom ESLint rule blocks `GEMINI_API_KEY` references outside `lib/ai/**`. Verify it fails (rule not yet defined).
2. Run `pnpm create next-app@latest` (Next.js 16, App Router, TS, Tailwind v4) and prune defaults to match Ledger palette.
3. Initialize shadcn (`pnpm dlx shadcn@latest init`) with zero-radius theme and Newsreader/Inter/JetBrains Mono fonts in `app/layout.tsx` via `next/font/google`.
4. Configure Tailwind v4 CSS-vars from Ledger palette (`design-doc.md §8`) — defer full `tokens.css` to Task 1.2; this task only sets up the build pipeline + body bg.
5. Write the custom ESLint rule (`eslint-rules/no-gemini-leak.js`) and register it in `.eslintrc.json`. Verify the unit test passes.
6. Create `.github/workflows/ci.yml` running TS + ESLint + Vitest + Playwright (placeholder spec) on Ubuntu Node 22.
7. Wire Sentry via `@sentry/nextjs` SDK with `beforeSend` PII strip per `design-doc.md §16` and write the integration test.
8. Write the landing E2E and verify it passes against the dev server.
9. Push branch, confirm Vercel preview builds and the placeholder masthead renders.

**Dependencies:** None (this is the entry point).

---

### Task 1.2: Supabase init + auth middleware shell + RLS test harness + Ledger design tokens + responsive nav shell

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [infrastructure] [database] [design] [UI] [testing]
**Files:**
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts` (server-only, used only by `tests/`)
- `middleware.ts` — auth shell (passes through; full enforcement in Task 2.1)
- `supabase/migrations/0001_init.sql` — extensions (`uuid-ossp`, `pgcrypto`), `auth.users` reference, no user-owned tables yet
- `app/globals.css` — full Ledger token set (palette, typography sizes, hairlines, motion easing)
- `components/nav/sidebar.tsx`, `components/nav/bottom-tab-bar.tsx`, `components/nav/log-fab.tsx`, `components/nav/top-app-bar.tsx`, `components/nav/profile-menu.tsx`, `components/nav/shortcuts-overlay.tsx` — empty/placeholder shells with correct responsive behavior, oxblood active state, 44×44 tap targets, focus rings
- `app/(app)/layout.tsx` — wraps `(app)` group with the responsive nav shell
- `tests/rls/_harness.ts` — 2-user fixture: creates user A + user B via Supabase admin, returns scoped clients, tears down on test end
- `tests/rls/_harness.test.ts` — sanity test: harness creates 2 users, both can read their own profile (after Task 2.1 the harness extends; this task ships the foundation)

**Reads:**
- `tasks.md` (this entry, Task 1.1)
- `design-doc.md` §8 (UX/UI Direction), §9 (Navigation System with ASCII sketches), §13 (Testing — RLS row), §18.2 (Invariants I1)

**Goal:** Stand up the Supabase project, install the design-token CSS, render the responsive nav at all 3 breakpoints (placeholder routes), and ship a 2-user RLS test harness ready for every subsequent table.

**Acceptance criteria:**
- [ ] Supabase project provisioned (dev environment); local migrations apply via `supabase db push`
- [ ] `lib/supabase/server.ts` and `lib/supabase/client.ts` use `@supabase/ssr` cookie pattern; `lib/supabase/admin.ts` exists ONLY in test paths (lint rule enforces)
- [ ] All Ledger CSS custom properties from `design-doc.md §8` are present in `app/globals.css`; visual regression baseline of nav shell at 375 / 768 / 1280 breakpoints captured
- [ ] Mobile (375): bottom tab bar 56px + center FAB at `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)`, 44×44 tap targets verified by Playwright
- [ ] Tablet (768): collapsible icon rail 56px, hover expansion to 240px
- [ ] Desktop (1280+): persistent sidebar 240px with oxblood active state (3px left border + ivory text + bg-2 fill)
- [ ] **I1 enforced (foundational):** RLS test harness creates 2 distinct auth users with isolated tokens; teardown is idempotent
- [ ] Keyboard shortcuts wired: `?` opens shortcuts overlay (placeholder content for now)
- [ ] CI lint check forbids importing `lib/supabase/admin.ts` from anywhere under `app/`
- [ ] Tests:
  - Unit: `tokens.test.ts` asserts every Ledger color variable is defined and parses as a valid hex
  - Component: `sidebar.test.tsx`, `bottom-tab-bar.test.tsx`, `log-fab.test.tsx` — snapshot + active-state + tap-target tests
  - Integration: `rls-harness.test.ts` proves both users can independently authenticate
  - E2E: `tests/e2e/nav-responsive.spec.ts` × 3 breakpoints + axe-core accessibility scan

**Steps:**
1. **TDD first:** Write `tests/rls/_harness.test.ts` asserting the harness creates 2 users with distinct UIDs and returns scoped Supabase clients. Verify it fails (harness not yet built).
2. Provision Supabase dev project; persist URL + anon key + service-role key in `.env` and Vercel env vars (service-role only as a CI/test secret).
3. Implement `lib/supabase/{client,server,admin}.ts` per `@supabase/ssr` quickstart + add the lint rule preventing `admin.ts` import outside `tests/`.
4. Build the RLS test harness using `lib/supabase/admin.ts` for setup/teardown; verify the harness sanity test passes.
5. Translate Ledger palette + typography from `design-doc.md §8` into `app/globals.css` CSS variables. Write `tokens.test.ts` and verify it passes.
6. Build all six nav components per `design-doc.md §9` ASCII sketches with placeholder route stubs (`/dashboard`, `/log`, `/library`, `/progress`).
7. Write component + E2E tests; capture visual baselines at the three breakpoints.
8. Push to PR; confirm Vercel preview shows the nav shell at every breakpoint.

**Dependencies:** Task 1.1.

---

### Task 1.3: Test harness, MSW, axe-core, i18n typed constants, cache-tag constants + ESLint rule, seed script

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [testing] [infrastructure]
**Files:**
- `vitest.config.ts`, `playwright.config.ts` — multi-project (RLS + e2e + visual)
- `tests/mocks/handlers.ts`, `tests/mocks/server.ts` — MSW setup for Gemini endpoints
- `tests/setup.ts` — global Vitest setup (loads MSW server, axe-core helpers)
- `tests/axe/setup.ts` — `@axe-core/playwright` injection helper used by every E2E
- `lib/i18n/en.ts` — typed-constants `t = { nav, dashboard, log, library, progress, settings, errors, ... }` per `design-doc.md §12`
- `eslint-rules/no-inline-user-strings.js` — forbids string literals in JSX content where `t.*.*` should be used
- `lib/cache/tags.ts` — typed constants per `design-doc.md §4` (`TAGS.userEntries`, `TAGS.userLibrary`, `TAGS.userProgress`, `TAGS.profile`, `TAGS.weeklyReview`)
- `eslint-rules/no-inline-cache-tags.js` — forbids string-literal arguments to `cacheTag()` and `updateTag()` (I12)
- `scripts/seed.ts` — pnpm script consuming `fixtures/seed-14-days.json`; clears + reloads dev user data via Supabase admin client (gated to dev environment)
- `fixtures/seed-14-days.json` — 14 days × 3–6 entries/day mixed VN + Western foods, library items, weight history (per `design-doc.md §13`)

**Reads:**
- `tasks.md` (this entry, Tasks 1.1–1.2)
- `design-doc.md` §4 (`lib/cache/tags.ts` example), §12 (i18n shape), §13 (test matrix), §17 (seed data)
- `kalori-project-blueprint.md` §8 (Testing)

**Goal:** Lock in the testing stack (Vitest + Playwright + MSW + axe-core), guarantee i18n + cache-tag invariants from day 1, and provide one-command dev seeding.

**Acceptance criteria:**
- [ ] `pnpm test` runs Vitest (unit + component + integration) green on the placeholder suites
- [ ] `pnpm test:e2e` runs Playwright with axe-core injected on every spec
- [ ] MSW intercepts all `/api/ai/**` calls in tests; integration tests can stub Gemini deterministically
- [ ] `lib/i18n/en.ts` exports a typed `t` object covering nav, dashboard, log, library, progress, settings, errors, weight, water, onboarding, masthead, and 8 onboarding step labels
- [ ] **I12 enforced:** `eslint-rules/no-inline-cache-tags.js` fails the build if any file calls `cacheTag('literal')` or `updateTag('literal')`; tests prove the rule fires on a fixture
- [ ] `eslint-rules/no-inline-user-strings.js` flags hard-coded user-visible JSX strings in components/pages (allowlist for kickers in Server Components verified by snapshot review)
- [ ] `pnpm seed` succeeds against dev Supabase, populating 14 days of fixture data for the dev user; idempotent (rerun clears + reloads)
- [ ] Tests:
  - Unit: `tests/unit/eslint-no-inline-cache-tags.test.ts`, `tests/unit/eslint-no-inline-user-strings.test.ts`, `tests/unit/i18n-shape.test.ts` (asserts `t` is an object with no string-only leaves missing required keys)
  - Integration: `tests/integration/msw-gemini.test.ts` proves a mocked `/api/ai/text-parse` request returns the stub
  - E2E: `tests/e2e/axe-baseline.spec.ts` runs axe on the landing page and asserts zero serious/critical violations

**Steps:**
1. **TDD first:** Write `tests/unit/eslint-no-inline-cache-tags.test.ts` asserting the rule fires on `cacheTag('user:abc:entries:today')`. Verify failure.
2. Configure Vitest projects (unit, component, integration) and Playwright projects (e2e, visual, rls).
3. Author the two custom ESLint rules and register them; verify both unit tests pass.
4. Build `lib/cache/tags.ts` with the typed-constant shape from `design-doc.md §4`.
5. Build `lib/i18n/en.ts` covering every user-facing string anticipated by Phases 2–5 (use `design-doc.md §12` shape; expand keys per screen inventory in §10).
6. Set up MSW handlers for all three AI endpoints + auth endpoints; wire to Vitest setup and Playwright global setup.
7. Wire `@axe-core/playwright` injection helper used by every E2E.
8. Write `scripts/seed.ts` using the test admin client; build the 14-day fixture JSON.
9. Run `pnpm test` and `pnpm seed` to verify all green.

**Dependencies:** Tasks 1.1, 1.2.

---

### Task 1.4: Codex Adversarial Review — Foundation

**Complexity:** Review
**Codex review:** Per-phase (this IS the phase gate)
**Type tags:** [review]
**Files:** (diff-scoped — no files created; reviews changes from Tasks 1.1–1.3)
**Reads:**
- `tasks.md` (Tasks 1.1–1.3)
- `design-doc.md` §18 (Failure modes F1–F12), §19.1 (Invariants I1–I12)

**Goal:** Run the Standard Codex Gate Sequence on all changes from Phase 1 (scaffold, Supabase init, design tokens, nav shell, RLS harness, test infra, i18n, cache-tag constants).

**Steps:**
1. Pre-flight size check: ensure diff + changed-files scope is < 1MB; split the review across logical chunks if larger.
2. Run `/codex:adversarial-review` foreground, blocking, verbatim. Do not paraphrase the output.
3. Post-review verification: every flagged file path resolves; every quoted code snippet matches HEAD.
4. Categorize findings as **Critical** / **Suggestion** / **Minor**.
5. Auto-fix Critical + Suggestion via opus sub-agent. Re-run `/codex:adversarial-review` on the fix diff.
6. Present Minor findings to the user for accept/defer decision.
7. Cap: 2 review rounds for this phase gate. If unresolved Critical findings remain after 2 rounds, escalate.
8. Log outcome (counts, fix status, remaining Minor) in `progress.md` Notes.

**Dependencies:** Tasks 1.1, 1.2, 1.3.

---

### Task 1.5: Phase Testing Sweep — Foundation

**Complexity:** Review
**Codex review:** N/A
**Type tags:** [testing]
**Files:** (no files created; runs the full test suite shipped in Phase 1)
**Reads:**
- `tasks.md` (Tasks 1.1–1.3)
- `testing-strategy.md` (pending Step 6.7)

**Goal:** Run the full applicable test suite for Phase 1. Block phase completion on any failures.

**Steps:**
1. Unit tests (Vitest) — ESLint rule fixtures, i18n shape, token validity, cache-tag constant shape.
2. Component tests — sidebar, bottom-tab-bar, log-fab (snapshot, active-state, tap target).
3. Integration tests (MSW) — Sentry init, MSW Gemini stub, RLS harness sanity.
4. RLS tests — 2-user fixture creation + teardown (no tables yet to assert against; checked again Phase 2).
5. E2E — landing page renders + nav-responsive at 375/768/1280 + axe baseline.
6. Visual regression — capture/lock baselines for nav at three breakpoints.
7. `@axe-core/playwright` accessibility — zero serious/critical on landing + every nav breakpoint.
8. Lighthouse mobile ≥90 on `/` (advisory, log score).
9. Coverage report — Unit branch coverage ≥70%.
10. Block phase completion if any Blocking-tier test fails. Log advisory results in `progress.md`.

**Dependencies:** Task 1.4.

---

# Phase 2 — Auth + Onboarding

Scope: Magic-link + Google OAuth via Supabase, `profiles` table + RLS, Mifflin-St Jeor pure functions + target calc, 8-step onboarding wizard with "How we calculated this" transparency panel.

---

### Task 2.1: Auth flows + profiles table + RLS + middleware + Mifflin-St Jeor + target calc

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [backend] [API] [database] [UI] [integration]
**Files:**
- `app/(auth)/login/page.tsx` — magic-link input + Google OAuth button (Inter, zero-radius, 44×44)
- `app/auth/callback/route.ts` — Supabase OAuth callback handler
- `app/api/auth/sign-out/route.ts`
- `middleware.ts` — replace placeholder; enforces auth on every route except `/`, `/login`, `/auth/callback`, `/api/auth/*`, static assets
- `supabase/migrations/0002_profiles.sql` — `profiles` table + RLS policies (4 verbs, all `auth.uid()`-scoped) + `created_at` default + trigger that inserts a row when `auth.users` row is created
- `lib/nutrition/mifflin-st-jeor.ts` — pure: `calcBMR(bioSex, weightKg, heightCm, ageYears)`
- `lib/nutrition/tdee.ts` — pure: `calcTDEE(bmr, activityLevel)`
- `lib/nutrition/target.ts` — pure: `calcCalorieTarget(tdee, goalDeltaKg, paceWeeks)`
- `lib/nutrition/__tests__/mifflin.test.ts`, `tdee.test.ts`, `target.test.ts` — exhaustive table-driven cases incl. edge bio-sex / activity / extreme inputs
- `lib/auth/refresh-interceptor.ts` — pure function + type-safe fetch wrapper: on first 401 calls `@supabase/ssr` `refreshSession()` and retries the original request once; on second 401 (or refresh failure) surfaces sign-out and redirects to `/login`. Pulled forward so every Phase 2+ mutation route inherits F12 recovery.
- `tests/rls/profiles.spec.ts` — 4-verb assertions for User A vs User B
- `tests/integration/auth-refresh-retry.test.ts` — F12 contract: profile/save → forced 401 → `refreshSession()` → retry succeeds AND profile/save → forced 401 → refresh fails → sign-out + redirect to `/login`
- `tests/e2e/auth-magic-link.spec.ts`, `tests/e2e/auth-google-oauth.spec.ts` (mocked OAuth provider)

**Reads:**
- `tasks.md` (this entry, Phase 1)
- `design-doc.md` §6 (Authentication & Authorization), §7 (Mifflin-St Jeor implied via §10.3), §10.3 (Onboarding wizard inputs), §18.1 F12, §18.2 I1/I5/I6
- `kalori-project-blueprint.md` §4 (Auth)
- `architecture.md` (pending Step 6.7) — full DDL for `profiles`

**Goal:** Ship a working sign-in flow that lands the user on `/onboarding` (when no `profiles` row exists with completed flag) or `/dashboard` (when complete). Provide tested-pure nutrition math for the wizard.

**Acceptance criteria:**
- [ ] User can sign in via magic link OR Google OAuth; session cookie set via `@supabase/ssr`
- [ ] `profiles` row is auto-created on `auth.users` insert via Postgres trigger; row has `user_id = auth.uid()` (verified by RLS test)
- [ ] **I1 enforced:** `tests/rls/profiles.spec.ts` asserts User B cannot select / insert (mismatched user_id) / update / delete User A's profile — 4 verbs
- [ ] **I6 enforced:** Middleware redirects unauthed access to any non-public route to `/login`; integration test covers all protected paths
- [ ] **I5 enforced:** Mifflin-St Jeor functions are pure (no IO, deterministic). Unit tests cover ≥10 fixture cases per function (male/female/edge ages/heights/weights/activity multipliers/pace bands)
- [ ] **F12 mitigated (auth session expiry — primary owner):** `lib/auth/refresh-interceptor.ts` wraps every mutation fetch; on a 401 response it calls `@supabase/ssr` `refreshSession()` once and retries the original request. On a second 401 (or refresh failure) it signs the user out and redirects to `/login`. Integration tests in `tests/integration/auth-refresh-retry.test.ts` exercise BOTH paths against `profile/save` (happy-refresh and refresh-fails-to-sign-out). **Every Phase 2+ mutation route handler MUST wrap its fetch via this interceptor** — enforcement for Phase 3+ surfaces is reasserted in Tasks 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b with their own forced-401 integration coverage.
- [ ] Target-calculation transitions tested: `auto → manual` copies current target into `manual_override_value`; `manual → auto` recalcs from current weight (per `design-doc.md §10.9` binding rule)
- [ ] Tests:
  - Unit: 30+ table-driven cases across the three nutrition modules
  - Component: `<LoginForm />` test for magic-link submit + Google button click
  - Integration: middleware redirect + auth callback round-trip with mocked Supabase
  - RLS: 4 verbs × profiles
  - E2E: magic-link happy path (mailbox stub) + Google OAuth happy path (mocked provider) + `prefers-reduced-motion` on the auth slide-in

**Steps:**
1. **TDD first:** Write `mifflin.test.ts` with the canonical Mifflin-St Jeor formulas as fixtures. Verify failure (no implementation).
2. Implement `lib/nutrition/{mifflin-st-jeor,tdee,target}.ts` until all unit tests pass.
3. Write `tests/rls/profiles.spec.ts` (4 verbs × 2 users) — verify it fails.
4. Author `supabase/migrations/0002_profiles.sql` with full schema, RLS policies, and the auto-insert trigger. Apply migration; verify RLS spec passes.
5. Build `app/(auth)/login/page.tsx` and `app/auth/callback/route.ts`; replace `middleware.ts` placeholder with full enforcement.
6. Wire post-sign-in redirect logic: if `profiles.onboarding_completed_at` is null → `/onboarding`; else `/dashboard`.
7. **TDD first (F12 interceptor):** Write `tests/integration/auth-refresh-retry.test.ts` covering BOTH the refresh-succeeds-retry-succeeds path AND the refresh-fails-sign-out path against `profile/save`. Verify failure. Then implement `lib/auth/refresh-interceptor.ts` with the 401 → `refreshSession()` → retry-once contract; on second 401 or refresh failure call sign-out and redirect. Verify both branches pass. **Contract note:** every Phase 2+ mutation route handler MUST wrap its fetch via this interceptor — Tasks 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b each reassert this with a forced-401 integration test.
8. Write E2E tests covering magic link + Google OAuth (mocked provider) + middleware redirect.
9. Run `pnpm test`, `pnpm test:e2e`, `pnpm test:rls`. All green.

**Dependencies:** Tasks 1.1, 1.2, 1.3.

---

### Task 2.2: 8-step onboarding wizard with transparency panel

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [integration]
**Files:**
- `app/(app)/onboarding/page.tsx` — wizard shell with step routing
- `app/(app)/onboarding/_components/StepBioSex.tsx`, `StepAge.tsx`, `StepHeight.tsx`, `StepWeight.tsx`, `StepGoalWeight.tsx`, `StepPace.tsx`, `StepActivity.tsx`, `StepResults.tsx`
- `app/(app)/onboarding/_components/HowWeCalculated.tsx` — collapsible transparency panel rendering BMR + TDEE + target with the actual Mifflin-St Jeor formula (Newsreader pull-quote treatment per `design-doc.md §8`)
- `lib/stores/useOnboardingStore.ts` — Zustand step state + draft profile
- `app/api/profile/save/route.ts` — server action saving step deltas; on Step 8 sets `onboarding_completed_at`
- `tests/e2e/onboarding-completion.spec.ts` — full happy path covering all 8 steps (one of the 4 blueprint flows)
- `tests/component/HowWeCalculated.test.tsx`, `tests/component/StepGoalWeight.test.tsx` (real-time delta), `tests/component/StepPace.test.tsx` (calculated target dates)

**Reads:**
- `tasks.md` (this entry, Tasks 1.3, 2.1)
- `design-doc.md` §10.3 (Onboarding wizard), §8 (Ledger typography for the results screen)
- `ui-design.md` (pending Step 6.7) — wizard components

**Goal:** A new user completes the 8-step wizard, sees their calculated calorie target with the transparency panel, and lands on the empty dashboard with a populated `profiles` row.

**Acceptance criteria:**
- [ ] All 8 steps render at 375 / 768 / 1280 with Ledger styling (oxblood progress bar fill on bg-2 track, Newsreader 32px step titles)
- [ ] Step-state persistence: refresh mid-wizard preserves prior steps via `sessionStorage`-backed Zustand store (cleared on completion or explicit cancel)
- [ ] Goal-weight step shows live delta vs current weight; pace step shows calculated target date per option
- [ ] Step 8 results screen displays BMR + TDEE + target with the expandable "How we calculated this" panel exposing the actual numbers used by `lib/nutrition/*`
- [ ] Unit toggle on height/weight (metric default per `kalori-project-blueprint.md §4`); imperial → metric conversion verified by unit test
- [ ] Pressing "Start tracking" sets `profiles.onboarding_completed_at = now()` and redirects to `/dashboard`
- [ ] Tests:
  - Unit: imperial↔metric conversion (already covered in 2.1 nutrition lib; verify wizard wiring)
  - Component: each step renders + Back/Next button enable/disable rules + transparency panel toggle
  - E2E: full 8-step happy path with axe injection + visual baseline of the results screen at 3 breakpoints

**Steps:**
1. **TDD first:** Write `tests/e2e/onboarding-completion.spec.ts` end-to-end happy path. Verify failure (no wizard yet).
2. Build the Zustand store with `sessionStorage` persistence (per `design-doc.md §11`).
3. Build each step component in order; render the progress bar (oxblood fill) + step title + body + Back/Next.
4. Build `HowWeCalculated.tsx` rendering the actual formula + computed values from `lib/nutrition/*`.
5. Wire `app/api/profile/save/route.ts` per-step delta save (so a refresh can restore from server too); set `onboarding_completed_at` on Step 8.
6. Confirm CSS + responsive behavior at 3 breakpoints; capture visual baseline of results screen.
7. Run E2E + component tests. All green.

**Dependencies:** Task 2.1.

---

### Task 2.3: Codex Adversarial Review — Auth + Onboarding

**Complexity:** Review
**Codex review:** Per-phase (this IS the phase gate)
**Type tags:** [review]
**Files:** (diff-scoped, no files created)
**Reads:**
- `tasks.md` (Tasks 2.1, 2.2)
- `design-doc.md` §18 (failure modes), §19.1 (invariants)

**Goal:** Run Standard Codex Gate Sequence on all changes from Phase 2.

**Steps:**
1. Pre-flight size check (split if > 1MB).
2. Run `/codex:adversarial-review` foreground, blocking, verbatim.
3. Post-review verification.
4. Categorize Critical / Suggestion / Minor.
5. Auto-fix Critical + Suggestion via opus sub-agent.
6. Present Minor findings to user.
7. Cap: 2 rounds.
8. Log in `progress.md` Notes.

**Dependencies:** Tasks 2.1, 2.2.

---

### Task 2.4: Phase Testing Sweep — Auth + Onboarding

**Complexity:** Review
**Codex review:** N/A
**Type tags:** [testing]
**Files:** (no files created)
**Reads:**
- `tasks.md` (Tasks 2.1, 2.2)
- `testing-strategy.md` (pending Step 6.7)

**Goal:** Run the full applicable test suite for Phase 2. Block phase completion on any failures.

**Steps:**
1. Unit tests (Vitest) — Mifflin-St Jeor, TDEE, target, imperial conversion.
2. Component tests — login form, each onboarding step, transparency panel.
3. Integration tests (MSW) — middleware redirect, auth callback, profile-save route.
4. RLS tests — `profiles` 4-verb assertions.
5. E2E — magic link, Google OAuth (mocked), full onboarding completion + `prefers-reduced-motion` variant.
6. Visual regression — login page + onboarding results screen × 3 breakpoints.
7. `@axe-core/playwright` accessibility — zero serious/critical on login + onboarding.
8. Lighthouse mobile ≥90 on `/login` (advisory).
9. Coverage report — Unit branch coverage ≥70%.
10. Block phase completion if any Blocking-tier test fails.

**Dependencies:** Task 2.3.

---

# Phase 3 — Dashboard + Log Flow (FIRST-USABLE MILESTONE)

Scope: Food schema (`food_entries`, `food_library_items`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`) with `client_id` idempotency (I11) + RLS; Gemini Route Handlers + Zod + cache + cost log + F11 prompt-injection mitigation; 3-tab log flow modal with image compression + I7 graceful fallback; confirmation screen + dedup prompt + undo toast (LIFO 5s) + copy-yesterday; dashboard rendering. **End-of-phase: user can log a meal and see it on the dashboard.**

---

### Task 3.1: Food + AI cache schema with client_id idempotency + RLS

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [database] [backend] [testing]
**Files:**
- `supabase/migrations/0003_food_schema.sql` — `food_entries`, `food_library_items`, `weight_log`, `water_log`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`
- Each user-owned table: `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`, RLS enabled with 4-verb `auth.uid() = user_id` policies, `client_id uuid NOT NULL UNIQUE` per-table on the user-write tables (food_entries, food_library_items, weight_log, water_log)
- `food_entries.library_item_id REFERENCES food_library_items(id) ON DELETE SET NULL` (entry history survives library pruning per `design-doc.md §6`)
- `food_library_items.normalized_name` indexed; `(user_id, created_at DESC)` index on `ai_call_log`; `expires_at` index on `ai_response_cache`
- `supabase/migrations/0004_storage_buckets.sql` — Storage bucket DDL (kept separate from table-policy DDL for readability): creates `food-thumbnails` bucket (NOT public) + `storage.objects` RLS policies using path-based ownership (`split_part(name, '/', 1)::uuid = auth.uid()`)
- `tests/rls/food-schema.spec.ts` — 4 verbs × 7 user-owned tables = **28 RLS assertions**
- `tests/rls/storage-bucket.spec.ts` — User A cannot read / upload / delete under `food-thumbnails/{user_B_id}/*` (uses the 2-user RLS fixture from Task 1.2)
- `tests/integration/client-id-idempotency.test.ts` — duplicate POST with same `client_id` returns 200 no-op without creating a new row (per I11)

**Reads:**
- `tasks.md` (this entry, Tasks 1.2, 2.1)
- `design-doc.md` §5 (Data Model), §6 (Account Deletion FK rules), §18.2 I1/I11
- `architecture.md` (pending Step 6.7) — full DDL with column types and indexes

**Goal:** Land all five remaining user-owned tables with correct RLS, FK direction, and `client_id` UNIQUE constraint, ready for the AI + log routes in Task 3.2.

**Acceptance criteria:**
- [ ] Migration applies cleanly to dev Supabase
- [ ] **I1 enforced:** All 7 tables (`food_entries`, `food_library_items`, `weight_log`, `water_log`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`) have RLS enabled with 4-verb policies; the RLS spec asserts 28 cross-user assertions (User B cannot select/insert-with-mismatch/update/delete User A's rows)
- [ ] **I11 enforced:** Inserting two rows with the same `client_id` on `food_entries` raises a unique-violation; the integration test for the (future) write Route Handler returns 200 + the existing row instead of creating a duplicate
- [ ] FK direction matches `design-doc.md §6`: cascade on `user_id`, SET NULL on `food_entries.library_item_id`
- [ ] **Storage bucket + RLS:** Supabase Storage bucket `food-thumbnails` created (NOT public) with RLS policy on `storage.objects`: only authenticated users can upload to `food-thumbnails/{user_id}/*` where `{user_id} = auth.uid()`; only the owning user can read/delete. Signed URLs (10-min TTL) used for dashboard/library thumbnail display. Bucket DDL lives in a migration separate from the table-policy DDL (`0004_storage_buckets.sql`) for readability.
- [ ] **I4 becomes testable here:** with the bucket in place, Task 3.3's integration test can assert "no non-thumbnail object exists under `food-thumbnails/{user_id}/`" (this task lands the bucket; 3.3 lands the enforcement path).
- [ ] **Storage RLS assertion:** `tests/rls/storage-bucket.spec.ts` proves User A cannot read/write/delete under `food-thumbnails/{user_B_id}/*` (reuses the 2-user RLS fixture from Task 1.2).
- [ ] Tests:
  - RLS: 28 assertions (4 verbs × 7 tables) all green
  - Storage RLS: cross-user path isolation (read/upload/delete all blocked for non-owner)
  - Integration: duplicate-`client_id` insert raises unique violation; round-trip via the future Route Handler harness returns the existing row

**Steps:**
1. **TDD first:** Write `tests/rls/food-schema.spec.ts` with all 28 assertions. Verify failure (no schema).
2. Author `supabase/migrations/0003_food_schema.sql` with all 7 tables + RLS policies + indexes + FKs.
3. Apply migration to dev; verify RLS spec passes.
4. Author `supabase/migrations/0004_storage_buckets.sql`: `insert into storage.buckets (id, name, public) values ('food-thumbnails', 'food-thumbnails', false);` + `storage.objects` RLS policies (4 verbs) with path-based ownership check (`split_part(name, '/', 1)::uuid = auth.uid()`).
5. Write `tests/rls/storage-bucket.spec.ts` (2-user fixture from Task 1.2); verify it passes against the applied Storage policies.
6. Write `tests/integration/client-id-idempotency.test.ts` (DB-level only at this stage; Route Handler integration is in Task 3.4). Verify it passes.

**Dependencies:** Task 2.1 (auth.users exists + profiles trigger pattern proven).

---

### Task 3.2: Gemini Route Handlers + prompts + Zod schemas + cache + cost log + F11 prompt-injection mitigation

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [API] [backend] [integration]
**Files:**
- `lib/ai/client.ts` — `@google/genai` wrapper; server-only; explicit `runtime = 'nodejs'`
- `lib/ai/prompts.ts` — single source of truth for `textParseSystem`, `visionSystem`, `weeklyReviewSystem`; takes region + dietary_prefs + allergens injected as parts (NOT concatenated into the system message — F11)
- `lib/ai/schemas.ts` — Zod schemas: `ParsedItem`, `ParseResult` (with `reasoning.length <= 500` cap + control-char strip per F11)
- `lib/ai/cache.ts` — `ai_response_cache` read-through wrapper; key = `{call_type, hash, user_id}` per F8; 30-day TTL
- `lib/ai/cost-log.ts` — failure-tolerant insert into `ai_call_log` (Sentry on error, never blocks response) per I2
- `lib/ai/sanitize.ts` — strips role-control tokens (`<|system|>`, `SYSTEM:`, `IGNORE PRIOR`, etc.) before dispatch; logs stripped tokens as Sentry breadcrumbs per F11
- `app/api/ai/text-parse/route.ts`, `app/api/ai/vision/route.ts`, `app/api/ai/weekly-review/route.ts` — each enforces 8s first-byte / 30s total timeout (F2/F7), validates response via Zod, logs cost, returns sanitized payload
- `tests/integration/ai-text-parse.test.ts`, `ai-vision.test.ts`, `ai-weekly-review.test.ts` — MSW-backed
- `tests/integration/ai-text-parse-refresh.test.ts` — F12 reinforcement: text-parse call under forced 401 triggers `refresh-interceptor.ts` retry, succeeds on retry, writes exactly one `ai_call_log` row
- `tests/integration/ai-vision-refresh.test.ts` — F12 reinforcement: forced-401 on `/api/ai/vision` → `refresh-interceptor.ts` retry succeeds, writes exactly one `ai_call_log` row
- `tests/integration/ai-weekly-review-refresh.test.ts` — F12 reinforcement: forced-401 on `/api/ai/weekly-review` → `refresh-interceptor.ts` retry succeeds, writes exactly one `ai_call_log` row
- `tests/unit/ai-cache-key.test.ts` — asserts cache key includes `user_id` (F8); `tests/unit/ai-sanitize.test.ts` — asserts injection token stripping
- `tests/integration/ai-fallback.test.ts` — Gemini error → route returns structured `{ fallback: true, originalInput }` payload (consumed by Task 3.3)
- `tests/fixtures/ai-accuracy/vn-smoke/*.json` — 5 VN text-prompt fixtures (bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) with expected kcal/macros + ±15% tolerance
- `tests/unit/ai/vn-smoke.test.ts` — Vitest snapshot test: drives the 5 VN prompts through the parse pipeline (against MSW-stubbed Gemini responses calibrated to the expected nutrition), asserts parsed kcal/macros within ±15%

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract consumed by all three routes), Task 3.1)
- `design-doc.md` §7 (AI Integration), §16 (Gemini Cost Logging), §18.1 F2/F7/F8/F11/F12, §18.2 I2/I3/I10
- `architecture.md` (pending Step 6.7) — Route Handler patterns

**Goal:** A typed, cached, cost-logged, prompt-injection-resistant Gemini layer the log flow can call without ever leaking the API key or blocking on AI failures.

**Acceptance criteria:**
- [ ] **I2 enforced:** Every call to any of the three routes (cache hit OR miss OR error) writes exactly one `ai_call_log` row before returning. Integration test wraps each route and asserts the row count.
- [ ] **I3 enforced:** `GEMINI_API_KEY` referenced only in `lib/ai/**`; ESLint rule from Task 1.1 already covers this (re-asserted by integration boot test that imports the route module under client bundling and fails)
- [ ] **I10 enforced:** Every successful Gemini response is parsed by the Zod schema before returning to the caller. Schema-failure → fallback payload returned + Sentry alert.
- [ ] **F2 mitigated:** 8s first-byte and 30s total timeout boundaries on text-parse + vision; on either timeout the route returns the fallback payload.
- [ ] **F8 mitigated:** Cache-key generator unit test asserts `user_id` is part of the key; cache-hit serving the wrong user's payload is impossible by construction.
- [ ] **F11 mitigated:** `sanitize.ts` strips role-control tokens and logs as Sentry breadcrumbs; user input is sent as a parts-array entry (NOT concatenated into the system prompt); Zod schema enforces `reasoning.length <= 500` and strips control characters from every string field.
- [ ] **F12 mitigated (reinforcement) — all three AI callers tested:** forced-401 integration tests for `/api/ai/text-parse`, `/api/ai/vision`, and `/api/ai/weekly-review` each assert refresh-then-retry-succeed via `lib/auth/refresh-interceptor.ts` from Task 2.1, and each asserts `ai_call_log` is written exactly once per logical call (cost-log not double-charged on retry). Named files: `ai-text-parse-refresh.test.ts`, `ai-vision-refresh.test.ts`, `ai-weekly-review-refresh.test.ts`.
- [ ] **Vietnamese accuracy smoke suite — MERGE-BLOCKING for the Phase 3 first-usable gate AND on every PR:** 5 VN fixture text prompts (bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) with expected kcal/macros ±15%. CI runs on every PR. Any failing fixture **BLOCKS Phase 3 completion AND blocks PR merge**. Failures require one of: (a) fixture update (only when ground-truth nutrition changes — must be justified in PR description), (b) prompt adjustment, or (c) model-version rollback before merge. Fixtures stored in `tests/fixtures/ai-accuracy/vn-smoke/` and registered in the `tests/fixtures/ai-accuracy/critical.ts` named critical-fixture list that Task 5.4 treats as merge-blocking at the final-gate sweep. Full AI accuracy regression (10 VN + 10 Western + 5 photo fixtures per `design-doc.md §13`) is shipped in Task 5.1 with the tiered gate policy defined in Task 5.4 (blocking for the named critical-fixture list; advisory-with-named-sign-off for the remainder).
- [ ] Tests:
  - Unit: cache-key includes user_id, sanitize strips known injection tokens, Zod schema rejects oversized reasoning + missing nutrient fields, VN smoke pipeline (5 prompts, ±15% tolerance, text-only — photo fixtures live in Task 5.1)
  - Integration: each of the 3 routes — happy path + cache hit returns same payload + Gemini failure returns fallback + ai_call_log row written exactly once per call
  - E2E: deferred to Task 3.3 (log flow consumes these routes)

**Steps:**
1. **TDD first:** Write `tests/unit/ai-cache-key.test.ts` and `tests/unit/ai-sanitize.test.ts`. Verify failures.
2. Build `lib/ai/sanitize.ts` and `lib/ai/cache.ts`; verify unit tests pass.
3. Author `lib/ai/schemas.ts` with the Zod shape from `design-doc.md §7`.
4. Build `lib/ai/client.ts` and `lib/ai/cost-log.ts`; verify cost-log is failure-tolerant.
5. Build `lib/ai/prompts.ts` with the literary-editor tone directive + region/dietary/allergen injection as parts.
6. Implement the three Route Handlers; wire timeouts + Zod parse + cost log + sanitize.
7. Write integration tests with MSW stubs for Gemini; verify each route's invariants hold.
8. Write `tests/integration/ai-text-parse-refresh.test.ts` — F12 reinforcement under forced 401 + `lib/auth/refresh-interceptor.ts` (from Task 2.1) retry; assert one `ai_call_log` row per logical call.
9. Write `ai-vision-refresh.test.ts` + `ai-weekly-review-refresh.test.ts` alongside `ai-text-parse-refresh.test.ts`; each forces a 401 from the respective endpoint and asserts the interceptor wrapper retries after `refreshSession()` succeeds, writing exactly one `ai_call_log` row per logical call.
10. Build the 5 VN-smoke fixture files (`tests/fixtures/ai-accuracy/vn-smoke/*.json`: bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) with expected kcal/macros, then write `tests/unit/ai/vn-smoke.test.ts` driving the text-parse pipeline against MSW-stubbed Gemini responses and asserting ±15% tolerance. Expose the fixture-loader utility so Task 5.1's full regression suite can extend it. **CI wires the smoke run as a MERGE-BLOCKING step (Phase 3 first-usable gate + every PR).** Register the 5 VN fixtures in `tests/fixtures/ai-accuracy/critical.ts` (created here; extended by Task 5.1 with 3 Western staples). On failure, document the decision-tree in the PR description: fixture update (justified), prompt adjustment, or model-version rollback — no silent merges.

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed), Task 3.1.

---

### Task 3.3: 3-tab log flow modal (Type / Snap / Library) with image compression and AI fallback

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [integration]
**Files:**
- `app/(app)/log/page.tsx` — modal/sheet host (side-sheet desktop, full-sheet mobile per `design-doc.md §10.5`)
- `app/(app)/log/_components/TypeTab.tsx`, `SnapTab.tsx`, `LibraryTab.tsx`
- `app/(app)/log/_components/ManualEntryFallback.tsx` — pre-filled with original user input on AI failure (I7)
- `lib/stores/useLogFlowStore.ts` — Zustand: tab state, draft entry, parsed items, `sessionStorage` persistence (throttled 500ms, 30-min restore window) per `design-doc.md §11`
- `lib/image/compress.ts` — `browser-image-compression` wrapper to <500kb / 1600px max
- `app/api/storage/thumbnail/route.ts` — server-side regen of <50kb thumbnail from received base64 + upload to Supabase Storage `food-thumbnails/{user_id}/{client_id}.webp` (bucket + RLS policy from Task 3.1); returns a signed URL (10-min TTL) for dashboard/library display — bucket is NOT public
- `tests/component/TypeTab.test.tsx` (debounced AI chip preview), `SnapTab.test.tsx` (compression invocation), `LibraryTab.test.tsx` (sort toggle, multi-select, frequency-first ordering)
- `tests/integration/log-flow-fallback.test.ts` — Gemini failure surfaces `<ManualEntryFallback />` with original input pre-filled
- `tests/integration/log-flow-refresh.test.ts` — F12 reinforcement: thumbnail-upload POST under forced 401 triggers `refresh-interceptor.ts` retry, succeeds on retry, draft state preserved
- `tests/integration/log-flow-text-parse-refresh.test.ts` — F12 reinforcement: forced-401 on the log-flow dispatch to `/api/ai/text-parse` → `refresh-interceptor.ts` retry succeeds, draft state preserved
- `tests/integration/log-flow-vision-refresh.test.ts` — F12 reinforcement: forced-401 on the log-flow dispatch to `/api/ai/vision` → `refresh-interceptor.ts` retry succeeds, draft state preserved
- `tests/e2e/text-log.spec.ts`, `tests/e2e/photo-log.spec.ts` — two of the four blueprint flows

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract — wraps all log-flow mutations), Tasks 3.1, 3.2)
- `design-doc.md` §7 (Image Handling), §10.5 (Log Food), §11 (state — useLogFlowStore), §18.1 F2/F7/F12, §18.2 I4/I7
- `ui-design.md` (pending Step 6.7) — log modal component specs

**Goal:** User can open the log flow from any of FAB / `n` shortcut / sub-route, choose a tab, submit input, and either see parsed items OR fall back to the manual form on AI failure — without losing draft state.

**Acceptance criteria:**
- [ ] FAB on mobile / `n` shortcut on tablet+desktop opens the log modal at all 3 breakpoints
- [ ] **Tab 1 (Type):** debounced AI chip preview after 600ms idle; submit dispatches POST to `/api/ai/text-parse`
- [ ] **Tab 2 (Snap):** desktop drag-drop + Browse; mobile camera + gallery; client compression via `lib/image/compress.ts` to <500kb / 1600px; shimmer during analysis; result rendered as detected-item cards
- [ ] **Tab 3 (Library):** search (`/` shortcut focuses), sort toggle (Frequent / Recent / Highest-protein), frequency-first grid, multi-select with inline quantity stepper, batch-add → confirmation
- [ ] **I4 enforced:** `app/api/storage/thumbnail/route.ts` writes ONLY the regenerated thumbnail (<50kb) to Storage (`food-thumbnails/{user_id}/{client_id}.webp`, bucket + RLS from Task 3.1); original base64 is discarded immediately. Thumbnails served via signed URLs (10-min TTL) — no public access. Integration test asserts no non-thumbnail object exists under `food-thumbnails/{user_id}/` after a vision call.
- [ ] **I7 enforced:** On any Gemini failure (network, timeout, rate-limit, Zod-fail), the fallback form opens with the original input pre-filled; user can complete the log manually. E2E covers this path.
- [ ] **F2 / F7 mitigated:** Visible "still analyzing" state with timeout boundary; retry once with exponential backoff before fallback
- [ ] **F12 mitigated (reinforcement) — all three log-flow dispatches tested:** forced-401 integration tests for thumbnail upload (`log-flow-refresh.test.ts`), text-parse dispatch (`log-flow-text-parse-refresh.test.ts`), and vision dispatch (`log-flow-vision-refresh.test.ts`) each assert refresh-then-retry-succeed via `lib/auth/refresh-interceptor.ts` from Task 2.1 without losing the draft. Each named test references the specific `lib/auth/refresh-interceptor.ts` from Task 2.1.
- [ ] Draft persistence: tab state + entered text + parsed items survive `sessionStorage` round-trip; image blobs intentionally excluded (re-upload acceptable per `design-doc.md §11`)
- [ ] Tests:
  - Unit: compression wrapper produces <500kb output for fixture image, throttled persist writes within 500ms
  - Component: each tab's interaction surface, fallback form pre-fill
  - Integration: AI failure → fallback path; thumbnail-only Storage policy
  - E2E: full text-log flow + full photo-log flow (mocked Gemini) at mobile + desktop, with axe injection

**Steps:**
1. **TDD first:** Write `tests/integration/log-flow-fallback.test.ts` asserting AI failure shows the fallback form with pre-filled input. Verify failure.
2. Build `useLogFlowStore` with `sessionStorage` persistence; cover with unit tests.
3. Build `lib/image/compress.ts`; cover with unit test using a fixture image.
4. Build the three tab components + `ManualEntryFallback`.
5. Build `app/api/storage/thumbnail/route.ts` with the I4 invariant.
6. Wire the modal host + open paths (FAB / `n` shortcut / sub-route preserve).
7. Write `log-flow-text-parse-refresh.test.ts` + `log-flow-vision-refresh.test.ts` alongside `log-flow-refresh.test.ts` (thumbnail); all three must pass before integration is considered complete.
8. Write E2E text-log + photo-log specs at mobile + desktop with axe injection.

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed by thumbnail-upload + log-flow dispatches), Tasks 3.1, 3.2.

---

### Task 3.4: Confirmation screen with editable items + dedup prompt + save-to-library + undo toast (LIFO 5s) + copy-yesterday + client_id mutations

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [API] [backend] [integration]
**Files:**
- `app/(app)/log/_components/ConfirmationScreen.tsx` — editable item list (portion / unit / kcal / macros / micros), meal-category selector, time editor, "Save to library" toggle (default on), normalized-name dedup prompt, Confirm CTA
- `app/(app)/log/_components/WhyTheseNumbers.tsx` — expandable panel rendering `ai_reasoning` (sand text on bg-2 inset)
- `app/api/entries/save/route.ts` — accepts `client_id`; UNIQUE-violation → 200 + existing row (I11); calls `updateTag(TAGS.userEntries(uid, day))` + `updateTag(TAGS.userLibrary(uid))` (uses constants from Task 1.3 — I12)
- `app/api/library/dedup-check/route.ts` — checks normalized-name equality against existing library items (per `design-doc.md §5` + §18.3 fuzzy decision: exact normalized equality only, no fuzzy MVP)
- `app/api/entries/copy-yesterday/route.ts` — multi-select copy with new `client_id`s + `logged_at = now()` per `design-doc.md §10.4`
- `lib/stores/useUndoQueueStore.ts` — Zustand undo queue: 5s timer per item, LIFO reveal order, cleared on route nav, restore on server error (F3)
- `components/ui/UndoToast.tsx` — single visible toast at a time, item from queue head; "Undo" reinserts via API
- `lib/text/normalize.ts` — `normalizedName(input)` = lowercase + strip punctuation + sort tokens + trim
- `tests/unit/normalize-name.test.ts` — table-driven cases incl. "two eggs" vs "2 eggs" (no fuzzy, must produce different normalizations per design decision §18.3)
- `tests/integration/entries-save-idempotency.test.ts` — 2 POSTs with same `client_id` → 1 row, 200 returned both times
- `tests/integration/entries-save-refresh.test.ts` — F12 reinforcement: entries/save under forced 401 triggers `refresh-interceptor.ts`, retry succeeds with original `client_id`, row count = 1, `updateTag` fires exactly once
- `tests/integration/cache-tag-roundtrip.test.ts` — mutation calls `updateTag`; subsequent dashboard read returns fresh data (covers I12 + cache invariant from §18.3)
- `tests/component/UndoToast.test.tsx` — 5s timer, LIFO order, cleared-on-nav, optimistic-rollback on server error
- `tests/e2e/undo-toast.spec.ts` — delete entry, navigate to a different route within 5s, click Undo, assert restoration into the original day's bucket (covers F6 3 AM scenario)
- `tests/e2e/copy-yesterday.spec.ts`

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract — wraps entries/save, dedup-check, copy-yesterday), Tasks 3.1, 3.2, 3.3)
- `design-doc.md` §7 (Zod shape), §10.4 (Copy-yesterday binding), §10.5 (Confirmation screen + dedup), §11 (Undo queue spec), §18.1 F3/F6/F12, §18.2 I8/I11/I12
- `ui-design.md` (pending Step 6.7) — confirmation + undo toast specs

**Goal:** User confirms parsed items (or library batch), saves them, sees them appear via cache invalidation, can undo via toast, and can copy yesterday's entries to today.

**Acceptance criteria:**
- [ ] Confirmation screen renders editable items + per-item kcal/macros/micros table; "Why these numbers?" panel toggles
- [ ] "Save to library" toggle default-on creates a `food_library_items` row OR shows the dedup prompt if a normalized-name match already exists; user chooses keep-existing / merge-into-existing / create-new
- [ ] Confirm CTA POSTs to `/api/entries/save` with a client-generated `client_id` UUID
- [ ] **I11 enforced:** Replay of the same Confirm with same `client_id` returns 200 + existing row, no duplicate created. Test asserts row count = 1 after 2 POSTs.
- [ ] **I12 enforced:** `updateTag(TAGS.userEntries(uid, day))` and `updateTag(TAGS.userLibrary(uid))` called in the Route Handler — using the constants module from Task 1.3 (no inline literals; ESLint rule blocks)
- [ ] **I8 enforced:** Undo toast lasts exactly 5s; toasts reveal in LIFO order; queue cleared on route navigation BUT the 5s timer continues until expiry (so user can undo from the new route too — F6)
- [ ] **F3 mitigated:** Server-rejected delete reinserts the entry + shows "Couldn't delete — restored" toast; integration test covers this path
- [ ] **F12 mitigated (reinforcement):** `/api/entries/save`, `/api/library/dedup-check`, `/api/entries/copy-yesterday` client callers wrap their fetch via `lib/auth/refresh-interceptor.ts` from Task 2.1. Integration test `tests/integration/entries-save-refresh.test.ts` exercises entries/save under a forced 401, asserts refresh-and-retry succeeds with `client_id` preserved (no duplicate row), and that `updateTag` fires on the retry response.
- [ ] **Copy-yesterday:** confirm modal lists yesterday's entries with multi-select; selected entries are copied with new `client_id`s + `logged_at = now()` per entry; `meal_category` preserved
- [ ] Tests:
  - Unit: normalized-name produces strict equality matches; "two eggs" vs "2 eggs" produces DIFFERENT normalized strings (no fuzzy)
  - Component: undo toast 5s timer + LIFO reveal + cleared-on-nav-but-timer-continues + optimistic-rollback
  - Integration: idempotent save (1 row from 2 POSTs), cache-tag round-trip (mutation → updateTag → fresh read), copy-yesterday creates N new rows with correct `meal_category`
  - E2E: undo-after-navigate (F6 scenario), copy-yesterday happy path, dedup prompt path

**Steps:**
1. **TDD first:** Write `tests/integration/entries-save-idempotency.test.ts`. Verify failure.
2. Build `lib/text/normalize.ts` + unit test.
3. Build `app/api/entries/save/route.ts` with `client_id` UNIQUE handling + `updateTag` calls; verify idempotency test passes.
4. Build `app/api/library/dedup-check/route.ts` and `app/api/entries/copy-yesterday/route.ts`.
5. Build `useUndoQueueStore` + `<UndoToast />`; cover with component tests for LIFO + 5s timer + cleared-on-nav-timer-continues + rollback-on-error.
6. Build `<ConfirmationScreen />` + `<WhyTheseNumbers />`; wire dedup prompt UX.
7. Write E2E for undo-after-navigate (F6) + copy-yesterday + dedup-prompt path.

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed by entries/save, dedup-check, copy-yesterday), Tasks 3.1, 3.2, 3.3.

---

### Task 3.5: Dashboard — masthead, chronometer ring, macros, meals bulletin, water, micronutrient panel

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [backend] [design]
**Files:**
- `app/(app)/dashboard/page.tsx` — Cache Components + PPR; static shell + dynamic islands
- `components/dashboard/Masthead.tsx` — wordmark + edition line (per `design-doc.md §8` masthead spec; `edition_number = days since profiles.created_at` computed server-side in user TZ)
- `components/charts/ChronometerRing.tsx` — inline SVG, Roman numerals, dual-arc (oxblood consumed + dashed ember projection), 82px serif center value, 600ms draw-once on load, `prefers-reduced-motion` → fade only
- `components/dashboard/MacroBars.tsx` — 3 thin horizontal bars with mono % in tracking
- `components/dashboard/MealsBulletin.tsx` — 5-column ruled grid (Breakfast / Lunch / Dinner / Snacks / Drinks) per `design-doc.md §10.4`; mobile collapses to single-column stack
- `components/dashboard/WaterTracker.tsx` — water bullet + `+glass` / `+bottle` optimistic add (water/weight quick-add category per `design-doc.md` §6 — one of 3 optimistic-allowlist categories)
- `components/dashboard/MicronutrientPanel.tsx` — union of last-7-days micros, sorted protein > iron > vitamin D > vitamin C > calcium > fiber > rest alphabetical, max 10 visible (per `design-doc.md §10.4`)
- `lib/nutrition/display-micros.ts` — explicit priority constant
- `lib/dashboard/aggregate.ts` — server-side aggregation of today's entries in user TZ (F5)
- `app/api/water/log/route.ts` — accepts `client_id` (I11) + optimistic-friendly response shape; calls `updateTag(TAGS.userEntries(uid, day))`
- `tests/unit/edition-number.test.ts` — boundary tests at user-TZ midnight
- `tests/unit/aggregate-day-tz.test.ts` — F5 timezone day-boundary tests at UTC+7, UTC-12, UTC+13, DST transitions
- `tests/component/ChronometerRing.test.tsx`, `MealsBulletin.test.tsx`, `WaterTracker.test.tsx` (optimistic + rollback)
- `tests/integration/dashboard-cache-tag.test.ts` — log mutation invalidates dashboard cache; next read returns fresh data
- `tests/integration/water-log-refresh.test.ts` — F12 reinforcement: water quick-add under forced 401 triggers `refresh-interceptor.ts` retry, succeeds with original `client_id`, no rollback-flash
- `tests/e2e/dashboard-first-paint.spec.ts` — covers critical flow #3 (dashboard first paint)

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract — wraps water/log), Tasks 3.1, 3.4)
- `design-doc.md` §3 (critical flows), §4 (Cache Components shape), §8 (Ledger components — chronometer, masthead, edition number), §10.4 (Dashboard composition), §11 (state map), §18.1 F5/F12, §18.2 I12
- `ui-design.md` (pending Step 6.7) — chronometer + masthead + meal-bulletin specs

**Goal:** A logged-in user with seed data sees the full dashboard at all 3 breakpoints — masthead with correct edition number, chronometer drawing once on load, macros, meals bulletin, water tracker (with optimistic +glass), and the micronutrient panel.

**Acceptance criteria:**
- [ ] Dashboard renders at 375 / 768 / 1280; PPR static shell paints first; dynamic islands hydrate without layout shift
- [ ] **Edition number correct:** `No. {n} · {weekday}, {day} {month} {year}` where `n = (today_in_user_tz - profiles.created_at_in_user_tz)`; rolls over at user-TZ midnight; unit tests cover the boundary
- [ ] Chronometer ring draws once in 600ms; `prefers-reduced-motion` shows fade-only
- [ ] Macro bars render correct fill percentages; mono % suffix
- [ ] Meals bulletin: 5 columns desktop / 5-column rail tablet / single column mobile; entries shown as italic serif name + mono timestamp + oxblood kcal
- [ ] Water tracker: tapping `+glass` increments optimistically (water/weight quick-add category per `design-doc.md` §6); on server error, rollback + toast
- [ ] Micronutrient panel: union of last-7-days micros, sorted by `lib/nutrition/display-micros.ts` priority, max 10 visible
- [ ] **F5 mitigated:** aggregation queries use `(logged_at AT TIME ZONE profiles.timezone)::date`; unit tests cover UTC+7 (Da Nang), UTC-12, UTC+13, DST
- [ ] **I12 enforced:** all `cacheTag` and `updateTag` calls reference `lib/cache/tags.ts` constants
- [ ] **F12 mitigated (reinforcement):** `/api/water/log` client caller wraps its fetch via `lib/auth/refresh-interceptor.ts` from Task 2.1. Integration test `tests/integration/water-log-refresh.test.ts` forces a 401 on the water quick-add POST, asserts refresh-and-retry succeeds with the original `client_id` preserved (I11 holds under retry), and that the optimistic-rollback UX is not triggered by the intermediate 401 (user sees successful increment, not rollback flash).
- [ ] Tests:
  - Unit: edition-number boundary, day-boundary aggregation across 4 TZs, display-micros sort order, water optimistic-rollback
  - Component: chronometer arc lengths, masthead format, meals bulletin renders entries by category, water tracker optimistic-rollback on server error
  - Integration: cache-tag invalidation round-trip after log mutation
  - E2E: dashboard-first-paint (PPR shell visible <1.5s on 4G throttle in Lighthouse profile), `+glass` rollback path, axe injection
  - Visual regression: dashboard × 3 breakpoints

**Steps:**
1. **TDD first:** Write `tests/unit/edition-number.test.ts` with boundary cases. Verify failure.
2. Build `Masthead.tsx` with edition logic; verify unit test passes.
3. Build `ChronometerRing.tsx` (inline SVG) with arc-length unit tests.
4. Build `lib/dashboard/aggregate.ts` with TZ-aware day boundary; verify with 4 TZ unit tests.
5. Build `MacroBars`, `MealsBulletin`, `MicronutrientPanel`, `WaterTracker` (with optimistic + rollback).
6. Build `app/api/water/log/route.ts` accepting `client_id` and calling `updateTag`.
7. Compose `app/(app)/dashboard/page.tsx` with PPR + Cache Components.
8. Write E2E + visual baselines; capture Lighthouse profile (advisory).

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed by water/log), Tasks 3.1, 3.2, 3.4.

---

### Task 3.6: Codex Adversarial Review — Dashboard + Log

**Complexity:** Review
**Codex review:** Per-phase (this IS the phase gate)
**Type tags:** [review]
**Files:** (diff-scoped, no files created)
**Reads:**
- `tasks.md` (Tasks 3.1–3.5)
- `design-doc.md` §18 (failure modes), §19.1 (invariants)

**Goal:** Run Standard Codex Gate Sequence on all changes from Phase 3.

**Steps:**
1. Pre-flight size check (split if > 1MB).
2. Run `/codex:adversarial-review` foreground, blocking, verbatim.
3. Post-review verification.
4. Categorize Critical / Suggestion / Minor.
5. Auto-fix Critical + Suggestion via opus sub-agent.
6. Present Minor findings to user.
7. Cap: 2 rounds.
8. Log in `progress.md` Notes.

**Dependencies:** Tasks 3.1, 3.2, 3.3, 3.4, 3.5.

---

### Task 3.7: Phase Testing Sweep — Dashboard + Log (FIRST-USABLE GATE)

**Complexity:** Review
**Codex review:** N/A
**Type tags:** [testing]
**Files:** (no files created)
**Reads:**
- `tasks.md` (Tasks 3.1–3.5)
- `testing-strategy.md` (pending Step 6.7)

**Goal:** Run the full applicable test suite for Phase 3. Block phase completion on any failures. **This sweep is also the first-usable gate — manual smoke pass against the dev seed data is required.**

**Steps:**
1. Unit tests (Vitest) — normalize-name, edition-number, day-TZ aggregation, display-micros sort, image-compression wrapper, AI cache key, AI sanitize.
2. Component tests — chronometer, meals bulletin, water tracker (optimistic+rollback), undo toast (LIFO+5s+nav), each log tab, confirmation screen.
3. Integration tests (MSW) — text-parse / vision / weekly-review routes, idempotent save (I11), cache-tag round-trip (I12), AI fallback path, copy-yesterday.
4. RLS tests — 28 assertions (4 verbs × 7 tables) confirmed green.
5. E2E — text-log, photo-log, undo-after-navigate (F6), copy-yesterday, dashboard-first-paint, water +glass, dedup prompt.
6. Visual regression — dashboard + log confirmation × 3 breakpoints.
7. `@axe-core/playwright` accessibility — zero serious/critical on dashboard + log + confirmation.
8. Lighthouse mobile ≥90 on dashboard (advisory).
9. Coverage report — Unit branch coverage ≥70%.
10. **Manual first-usable smoke:** with dev seed loaded, verify the owner can sign in, log a meal via Type / Snap / Library, see it appear on the dashboard, and undo a delete. Block phase completion if smoke fails.

**Dependencies:** Task 3.6.

---

# Phase 4 — Library + Progress

Scope: Library grid + search + sort + bulk delete + merge duplicates UI; food detail page + edit; Progress D/W/M with all 5 chart sections + weekly AI review PPR Suspense island with sparse-data fallback; weight log + auto-recalc target + nudge card + manual override transitions.

---

### Task 4.1: Library grid + search + filter + sort + bulk delete + merge duplicates

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [API] [backend]
**Files:**
- `app/(app)/library/page.tsx` — Cache Components + PPR with `cacheTag(TAGS.userLibrary(uid))`
- `components/library/LibraryGrid.tsx` — ruled 4-col desktop / 3-col tablet / 2-col mobile, drawn column/row lines (per `design-doc.md §10.6`)
- `components/library/SearchBar.tsx` — `/` shortcut focus
- `components/library/FilterPills.tsx` — All / Most frequent / Recent / Highest protein
- `components/library/SortDropdown.tsx` — Frequency / Last used / Alphabetical
- `components/library/BulkActionsBar.tsx` — Delete / Merge
- `components/library/MergeDuplicatesDialog.tsx` — side-by-side per-field picker (per `design-doc.md §10.6` binding spec); confirm dialog (no undo); FK repoint via Route Handler
- `components/library/ThumbnailLetterMark.tsx` — first letter of `display_name` in Newsreader 300, 48px, dust on bg-2 (per `design-doc.md §10.6` thumbnail placeholder)
- `app/api/library/merge/route.ts` — accepts `winnerId`, `loserId`, per-field choices; in a transaction: UPDATE `food_entries.library_item_id` = winnerId WHERE library_item_id = loserId, UPDATE winner row with picked fields, DELETE loser; logs Sentry breadcrumb for audit
- `app/api/library/bulk-delete/route.ts` — accepts list of `library_item_id`s
- `tests/component/LibraryGrid.test.tsx` (renders + ThumbnailLetterMark for null thumbnail), `MergeDuplicatesDialog.test.tsx` (per-field pick)
- `tests/integration/library-merge.test.ts` — FK repoint correctness (food_entries old → new), loser deleted, winner has picked field values
- `tests/integration/library-merge-refresh.test.ts` — F12 reinforcement: merge POST under forced 401 triggers `refresh-interceptor.ts`, retry succeeds with exactly-once transaction commit (no partial FK repoint)
- `tests/integration/library-bulk-delete-refresh.test.ts` — F12 reinforcement: forced-401 on `/api/library/bulk-delete` → `refresh-interceptor.ts` retry succeeds; deleted row set matches the requested IDs exactly once (no partial deletion)
- `tests/e2e/library-edit.spec.ts` — search + filter + sort + bulk delete + merge happy path

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract — wraps library/merge + library/bulk-delete), Tasks 3.1, 3.4)
- `design-doc.md` §10.6 (Food Library + merge binding spec + thumbnail placeholder), §18.1 F12
- `ui-design.md` (pending Step 6.7) — library grid + merge dialog specs

**Goal:** User can browse, search, filter, sort their library; bulk-delete selected items; merge two items with a per-field picker that repoints all entries.

**Acceptance criteria:**
- [ ] Library grid renders at 4 / 3 / 2 columns per breakpoint with drawn column/row hairlines
- [ ] Items with `thumbnail_url IS NULL` render the letter-mark placeholder per spec
- [ ] Search filters live; `/` shortcut focuses search
- [ ] Filter + sort combinations are testable and stable (frequency-first by default)
- [ ] Bulk delete: 2-step confirm; deleted items disappear from grid via `updateTag(TAGS.userLibrary(uid))`
- [ ] Merge: side-by-side compare; user picks per-field values; transaction repoints `food_entries.library_item_id` (cascade-safe per the FK direction in Task 3.1) and deletes the loser; integration test asserts row count delta = -1 and entry FKs all point to winner
- [ ] **I12 enforced:** all cacheTag/updateTag calls use constants
- [ ] **F12 mitigated (reinforcement) — both library mutation endpoints tested:** forced-401 integration tests for `/api/library/merge` (`library-merge-refresh.test.ts`) and `/api/library/bulk-delete` (`library-bulk-delete-refresh.test.ts`); each asserts refresh-then-retry-succeed through the shared `lib/auth/refresh-interceptor.ts` from Task 2.1. The merge test asserts transaction commits exactly once (no partial FK repoint); the bulk-delete test asserts the deleted row set matches the requested IDs exactly once (no partial deletion).
- [ ] Tests:
  - Unit: filter+sort permutations (table-driven)
  - Component: grid renders, letter-mark placeholder, merge dialog per-field selection
  - Integration: merge route — entries repointed correctly, loser deleted, winner has picked field values, in a single transaction (one rolled-back on error test); merge under forced 401 retries via interceptor with exactly-once commit
  - E2E: full library-edit happy path with axe injection

**Steps:**
1. **TDD first:** Write `tests/integration/library-merge.test.ts` asserting FK repoint + loser deletion + winner field values. Verify failure.
2. Build `app/api/library/merge/route.ts` with the transaction; verify integration test passes.
3. Build `app/api/library/bulk-delete/route.ts`.
4. Build the grid + search + filter + sort + bulk-actions UI.
5. Build the merge dialog with per-field picker.
6. Build `ThumbnailLetterMark` and verify rendering for null-thumbnail items.
7. Write `library-bulk-delete-refresh.test.ts` alongside `library-merge-refresh.test.ts`; both must pass — each forces a 401 on its respective endpoint and asserts the shared interceptor retries after `refreshSession()` succeeds.
8. Write E2E + visual baselines; verify axe.

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed by library/merge + library/bulk-delete), Tasks 3.1, 3.4.

---

### Task 4.2: Food detail page + edit + log-now + delete

**Complexity:** Medium
**Codex review:** Per-task required
**Type tags:** [UI] [API] [backend]
**Files:**
- `app/(app)/library/[id]/page.tsx` — desktop right-side overlay panel on dashboard/library; mobile full-screen with back chevron
- `components/library/FoodDetail.tsx` — hero thumbnail (or letter-mark), editable name (italic serif), default portion + unit, full nutrition table (kcal + macros + all micros), "Logged X times" + mini-sparkline, Log now CTA, Edit / Delete actions
- `app/api/library/[id]/update/route.ts` — accepts `client_id` for idempotent edits
- `app/api/library/[id]/delete/route.ts` — soft-delete? No — hard delete; entries' FK is SET NULL per Task 3.1
- `tests/component/FoodDetail.test.tsx` (renders + edit submits + log-now opens log flow with library tab + delete confirm)
- `tests/integration/library-update-refresh.test.ts` — F12 reinforcement: library item edit POST under forced 401 triggers `refresh-interceptor.ts`, retry succeeds with original `client_id`, row count = 1
- `tests/integration/library-delete-refresh.test.ts` — F12 reinforcement: forced-401 on `/api/library/[id]/delete` → `refresh-interceptor.ts` retry succeeds; library row deleted exactly once, `food_entries.library_item_id` set to NULL exactly once (no duplicate side-effects)
- `tests/e2e/library-detail-edit.spec.ts`

**Reads:**
- `tasks.md` (this entry, Task 2.1 (refresh-interceptor contract — wraps library/[id]/update + library/[id]/delete), Tasks 3.4, 4.1)
- `design-doc.md` §10.7 (Food Detail), §6 (FK direction for `food_entries.library_item_id`), §18.1 F12
- `ui-design.md` (pending Step 6.7) — food detail panel specs

**Goal:** User can view a library item's full nutrition, edit fields, log it now (opens log flow on Library tab pre-selected), or delete it.

**Acceptance criteria:**
- [ ] Detail page renders at desktop (overlay) and mobile (full-screen with back chevron); `<TopAppBar />` highlights `LIBRARY` tab as active
- [ ] Edit submits to `/api/library/[id]/update` with `client_id`; idempotency-tested
- [ ] Log now opens the log modal pre-selected to Library tab with the item pre-added to the multi-select list
- [ ] Delete shows confirm dialog; on confirm, `food_entries.library_item_id` for affected rows becomes NULL (verified by integration test); cache invalidated for `userLibrary` tag
- [ ] **F12 mitigated (reinforcement) — both food-detail mutation endpoints tested:** forced-401 integration tests for `/api/library/[id]/update` (`library-update-refresh.test.ts`) and `/api/library/[id]/delete` (`library-delete-refresh.test.ts`); each asserts refresh-then-retry-succeed via `lib/auth/refresh-interceptor.ts` from Task 2.1. The update test asserts `client_id` is preserved across retry (I11 holds, row count = 1). The delete test asserts the row is deleted exactly once and `food_entries.library_item_id` is set to NULL exactly once (no duplicate side-effects).
- [ ] Tests:
  - Component: rendering, edit submit, log-now dispatch, delete confirm flow
  - Integration: SET NULL on entries after library item delete (verifies the FK direction from Task 3.1); edit under forced 401 retries via interceptor with `client_id` preserved
  - E2E: edit + log-now + delete happy paths with axe injection

**Steps:**
1. **TDD first:** Write component test asserting log-now opens the log modal on the Library tab. Verify failure.
2. Build `<FoodDetail />` with all sections.
3. Build the update + delete Route Handlers.
4. Wire log-now to dispatch the existing log modal with library-tab + pre-selected item.
5. Write `library-delete-refresh.test.ts` alongside `library-update-refresh.test.ts`; both must pass — each forces a 401 on its respective endpoint and asserts the shared interceptor retries after `refreshSession()` succeeds.
6. Write E2E + visual baseline.

**Dependencies:** Task 2.1 (F12 refresh-interceptor consumed by library/[id]/update + library/[id]/delete), Tasks 3.4, 4.1.

---

### Task 4.3a: Progress D/W/M view (5 chart sections) + weekly AI review PPR island + sparse-data fallback

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [UI] [backend] [integration]
**Files:**
- `app/(app)/progress/page.tsx` — Cache Components + PPR keyed by `(user, range)` per `design-doc.md §11`
- `components/charts/CalorieAdherenceBar.tsx`, `MacroDistributionStackedArea.tsx`, `MicronutrientHeatmap.tsx` (signature view, 7 nutrients × 30 days, oxblood→ochre→moss ramp, drawn column rules), `TrendSummary.tsx` (calorie / macro / micro trend summary rendered under the charts), `LoggingConsistencyCalendar.tsx`
- `app/(app)/progress/_components/weekly-review-island.tsx` — server-rendered PPR Suspense island fetching the weekly review; cached via `lib/cache/tags.ts` constants per I12 with 7-day staleness; renders italic serif body with oxblood drop cap; sparse-data fallback per `design-doc.md §7` (logged days < 3 in past 7 → static "§ THE EDITOR'S NOTE · Too little logged this week for a full review." + bulleted one-liner per logged day)
- `components/dashboard/WeeklyInsightCard.tsx` — dashboard-surfaced variant that reuses the same cached weekly review (no duplicate Gemini call)
- `app/api/ai/weekly-review/route.ts` — extends Task 3.2 route to handle the sparse-data short-circuit (no Gemini call, returns the static template)
- `lib/aggregations/progress.ts` — server-side aggregation per range (D / W / M) in user TZ
- `lib/cache/tags.ts` — **extend** with `TAGS.weeklyReview(uid, weekStartOn)` + `TAGS.userProgress(uid, range)` cache-tag constants (I12)
- `supabase/migrations/00NN_progress_views.sql` — optional SQL materialized view(s) if aggregation cost justifies it (decision deferred to implementer based on seed-data perf run)
- `tests/unit/sparse-data-fallback.test.ts` — < 3 days → static template, ≥ 3 days → Gemini call (sparse threshold matches `design-doc.md §7` + spec hand-off; treat "sparse" uniformly across dashboard + progress island)
- `tests/integration/weekly-review-tz-rollover.test.ts` — F4 mitigation: clock forward → new review generated
- `tests/integration/weekly-review-cache-reuse.test.ts` — dashboard + progress read the same cache row (no double-spend)
- `tests/component/MicronutrientHeatmap.test.tsx`, `WeeklyInsightCard.test.tsx`, `WeeklyReviewIsland.test.tsx`
- `tests/e2e/progress-render.spec.ts`

**Reads:**
- `tasks.md` (this entry, Tasks 3.2, 3.5)
- `design-doc.md` §10 (Progress view), §13 (testing matrix), §7 (cache strategy + sparse-data fallback), §11 (cache shape), §18.1 F4, §18.2 I8/I12
- `ui-design.md` (pending Step 6.7) — chart specs + heatmap signature spec

**Goal:** User can switch D/W/M on Progress, see all 5 chart sections including the signature heatmap; weekly AI review renders in its own PPR Suspense island (server-rendered, cached by `TAGS.weeklyReview` with 7-day staleness) without blocking dashboard first paint and falls back gracefully on sparse data.

**Acceptance criteria:**
- [ ] Progress renders D/W/M segmented control with all 5 sections (calorie adherence, macro distribution, micronutrient heatmap signature view, trend summary, AI weekly review) at 3 breakpoints
- [ ] Micronutrient heatmap renders 7 nutrients × 30 days with oxblood→ochre→moss ramp + drawn column rules; cells fade in row-by-row on first view (suppressed by `prefers-reduced-motion`)
- [ ] Weekly insight: server-rendered PPR Suspense island (`weekly-review-island.tsx`); dashboard first paint never blocks on the Gemini call; integration test verifies (mocked Gemini latency 2s; first paint < 1.5s)
- [ ] **Sparse-data fallback:** logged days < 3 in past 7 → no Gemini call, static "§ THE EDITOR'S NOTE" + bulleted day list; ≥ 3 days → real Gemini call. Unit test covers both branches.
- [ ] **F4 mitigated:** Week rollover (Mon morning) triggers a new review if no row exists for the new `week_start_on`; integration test fast-forwards clock and asserts new generation
- [ ] **I12 enforced:** weekly-review cache-tag + userProgress cache-tag are added to `lib/cache/tags.ts` and referenced via constants (no inline literals); ESLint rule from Task 1.3 blocks regressions
- [ ] **Cache reuse:** dashboard `<WeeklyInsightCard />` and progress `<WeeklyReviewIsland />` share the same cached row keyed by `TAGS.weeklyReview(uid, weekStartOn)` — integration test asserts exactly one Gemini call per (user, week)
- [ ] **TDD test first:** `tests/unit/sparse-data-fallback.test.ts` is the first artifact written and fails before the route short-circuit is implemented
- [ ] Tests:
  - Unit: sparse-data fallback branch (both ≥3 and <3 day cases), cache-tag constant shape for weeklyReview + userProgress
  - Component: each chart, weekly insight card (sparse + full variants), weekly review island server-fetch stub
  - Integration: weekly-review TZ rollover (F4), weekly-review cache reuse (one fetch across dashboard + progress)
  - E2E: progress-render at all 3 breakpoints + axe + visual baseline of heatmap

**Steps:**
1. **TDD first:** Write `tests/unit/sparse-data-fallback.test.ts` with both <3-day and ≥3-day cases. Verify failure.
2. Extend `lib/cache/tags.ts` with `TAGS.weeklyReview(uid, weekStartOn)` + `TAGS.userProgress(uid, range)` constants (I12).
3. Extend `app/api/ai/weekly-review/route.ts` with the sparse-data short-circuit; verify unit test passes.
4. Build `app/(app)/progress/_components/weekly-review-island.tsx` as a server-rendered Suspense island with 7-day cache staleness; verify dashboard first-paint integration test (mocked Gemini 2s, first paint <1.5s).
5. Build `components/dashboard/WeeklyInsightCard.tsx` that reuses the same cache row; integration test asserts single Gemini call per (user, week) shared across dashboard + progress.
6. Build the 5 progress chart components; build `lib/aggregations/progress.ts` with TZ-aware D/W/M aggregation.
7. Write the F4 rollover integration test; write E2E for progress render at 3 breakpoints with axe injection.

**Dependencies:** Task 3.2 (AI cache conventions + cost logging + sparse-data short-circuit surface), Task 3.5 (dashboard cache-tag patterns).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

### Task 4.3b: Weight log + auto-recalc pipeline + nudge card

**Complexity:** Medium
**Codex review:** Per-task required
**Type tags:** [UI] [backend] [database] [integration]
**Files:**
- `app/(app)/weight/page.tsx` — quick-entry form (number input unit-aware, date picker today-default with 30-day backfill block, optional note) + history list
- `app/(app)/progress/_components/weight-quick-add.tsx` — Progress-surfaced quick-add with optimistic UX (water/weight quick-add category per `design-doc.md` §6 — weight variant; water variant shipped in Task 3.5)
- `lib/stores/useWeightQuickAddStore.ts` — Zustand for the optimistic quick-add (display increments immediately; rollback + toast on server error — F3)
- `components/charts/WeightTrajectoryLine.tsx` — weight trajectory computation + render; embedded on Progress + dashboard
- `app/api/weight/log/route.ts` — accepts `client_id` (I11 — reuses the pattern established in Task 3.1); on insert triggers auto-recalc if `profiles.target_mode = 'auto'` AND the weight change from `profiles.current_weight_kg` meets the threshold stored on `profiles.recalc_threshold_pct`; calls `updateTag(TAGS.profile(uid))` + `updateTag(TAGS.userProgress(uid, range))` (I12 — constants from Task 4.3a); emits a "target-updated" event consumed by the dashboard nudge card on next render
- `lib/nutrition/recalc.ts` — **pure function:** `recalcTargetIfNeeded({ profile, newWeightKg, thresholdPct })` → `{ didRecalc, newBmr, newTdee, newTarget }` using `calcBMR` / `calcTDEE` / `calcCalorieTarget` from Task 2.1; returns `didRecalc: false` when change < threshold
- `components/dashboard/TargetUpdatedNudge.tsx` — dashboard nudge card appearing when `profiles.last_target_recalc_at > profiles.last_dashboard_visit_at` OR when target drifts from the calculated baseline by the threshold; oxblood text "Target updated to {kcal} kcal · see why"; two actions — "Recalculate now" (calls the recalc API) and "Dismiss" (sets `last_dashboard_visit_at = now()`); tapping "see why" opens `<HowWeCalculated />` panel from Task 2.2
- `supabase/migrations/00NN_weight_recalc_columns.sql` — additive columns on `profiles`: `recalc_threshold_pct numeric DEFAULT 2.0`, `last_target_recalc_at timestamptz`, `last_dashboard_visit_at timestamptz` (if not already present from 2.1); `weight_log` table itself is already provisioned in Task 3.1 with `client_id` UNIQUE — this task does NOT re-define the table
- `tests/unit/recalc-threshold.test.ts` — threshold-boundary cases (just below / just above / zero / negative delta / first-ever entry)
- `tests/unit/auto-recalc-trigger.test.ts` — auto mode + above-threshold → recalc; auto mode + below-threshold → no recalc; manual mode → no recalc regardless
- `tests/integration/weight-log-recalc.test.ts` — weight POST → target recalc → `profiles.last_target_recalc_at` updated + `TAGS.profile(uid)` invalidated + nudge flag visible on next dashboard render
- `tests/integration/weight-log-idempotency.test.ts` — duplicate POST with same `client_id` returns 200 + existing row (reasserts I11 for the weight-log path)
- `tests/integration/weight-log-refresh.test.ts` — F12 reinforcement: weight POST under forced 401 triggers `refresh-interceptor.ts`, retry succeeds with original `client_id`, auto-recalc fires exactly once
- `tests/integration/weight-quick-add-rollback.test.ts` — optimistic increment + server 500 → rollback + toast (F3)
- `tests/rls/weight-log.spec.ts` — reuses the 2-user fixture from Task 1.2 to reassert that `weight_log` RLS from Task 3.1 still holds after the new API routes ship (no new table — just reconfirms no regression)
- `tests/component/WeightQuickAdd.test.tsx`, `TargetUpdatedNudge.test.tsx`, `WeightTrajectoryLine.test.tsx`
- `tests/e2e/weight-log.spec.ts` — full happy path: enter weight → see nudge on dashboard → tap "see why"

**Reads:**
- `tasks.md` (this entry, Task 2.1 for the MSJ pure functions + refresh-interceptor contract (wraps weight/log), Task 3.1 for `client_id` idempotency pattern + `weight_log` schema, Task 4.3a for the Progress shell)
- `design-doc.md` §10 (weight + recalc + nudge card), §6 (3 optimistic categories — water/weight shared), §18.1 F3/F9/F12, §18.2 I8/I11/I12
- Task 2.1 (MSJ / TDEE / target pure functions + `lib/auth/refresh-interceptor.ts` — both consumed, no re-implementation)
- Task 3.1 (client_id idempotency pattern + weight_log schema + RLS)

**Goal:** User can log weight via quick-add (optimistic) or full form, see the auto-recalc fire when the weight change crosses the threshold, and confirm/dismiss the resulting dashboard nudge card.

**Acceptance criteria:**
- [ ] Weight log: `client_id`-idempotent POST (reuses Task 3.1's pattern); 30-day backfill blocked client + server (per blueprint backfill rule)
- [ ] Auto-recalc: `lib/nutrition/recalc.ts` is a **pure function** (no IO; unit-tested with ≥6 threshold-boundary cases); fires only when `profiles.target_mode = 'auto'` AND weight change from `profiles.current_weight_kg` ≥ `profiles.recalc_threshold_pct`; persists new BMR/TDEE/target to `profiles.current_*` columns + sets `last_target_recalc_at`
- [ ] Manual mode: never auto-recalcs; integration test asserts zero writes to `profiles.current_*` when `target_mode = 'manual'`
- [ ] **F3 mitigated (water/weight quick-add category — weight variant):** weight quick-add increments display immediately; on server error, rollback to previous value + surface undo-style toast with original value
- [ ] **F9 mitigated:** nudge card surfaces after recalc with actionable "Recalculate now" / "Dismiss" (never silent); tapping "see why" reuses `<HowWeCalculated />` from Task 2.2
- [ ] **I11 enforced (weight path):** duplicate POST with same `client_id` returns 200 + existing row; integration test asserts row count = 1 after 2 POSTs
- [ ] **I12 enforced:** all `updateTag` calls use constants from `lib/cache/tags.ts` (`TAGS.profile`, `TAGS.userProgress`, `TAGS.userEntries` as applicable); ESLint rule blocks inline literals
- [ ] **F12 mitigated (reinforcement):** `/api/weight/log` client caller wraps its fetch via `lib/auth/refresh-interceptor.ts` from Task 2.1. Integration test `tests/integration/weight-log-refresh.test.ts` forces a 401 on the weight POST, asserts refresh-and-retry succeeds with the original `client_id` preserved (I11 holds), and that auto-recalc only fires once on the retry response (no double-recalc across the original + retry).
- [ ] **RLS regression check:** `tests/rls/weight-log.spec.ts` reconfirms `weight_log` isolation (no new table introduced here — just protects against regression when the API routes wire up)
- [ ] **TDD test first:** `tests/integration/weight-log-recalc.test.ts` is the first artifact written and fails before the recalc pipeline exists
- [ ] Tests:
  - Unit: recalc-threshold boundaries (≥6 cases), auto-recalc-trigger (auto+above / auto+below / manual), recalc pure-function IO-absence
  - Component: weight quick-add optimistic + rollback, nudge card render + CTAs, weight trajectory line renders
  - Integration: weight POST → recalc → nudge flag set (auto mode); weight POST → no recalc (manual mode); idempotent `client_id` replay; optimistic rollback on server 500
  - RLS: reassertion on `weight_log` (no new table — regression check)
  - E2E: weight-log happy path + dashboard nudge visible + "see why" opens transparency panel + axe injection

**Steps:**
1. **TDD first:** Write `tests/integration/weight-log-recalc.test.ts` asserting auto-mode recalc pipeline. Verify failure.
2. Write `tests/unit/recalc-threshold.test.ts` + `tests/unit/auto-recalc-trigger.test.ts`. Verify failures.
3. Build `lib/nutrition/recalc.ts` as a pure function composing the Task 2.1 modules; verify unit tests pass.
4. Author the additive profiles migration (`recalc_threshold_pct`, `last_target_recalc_at`, `last_dashboard_visit_at`) if not already present from 2.1.
5. Build `app/api/weight/log/route.ts` with `client_id` idempotency + optional recalc call + cache-tag invalidation.
6. Build `useWeightQuickAddStore` + `app/(app)/progress/_components/weight-quick-add.tsx` (optimistic + rollback on server error — F3).
7. Build `components/dashboard/TargetUpdatedNudge.tsx` with both actions wired.
8. Build `components/charts/WeightTrajectoryLine.tsx`; embed on Progress (4.3a shell) + dashboard.
9. Build `app/(app)/weight/page.tsx` (full form + history list) with the 30-day backfill block enforced client + server.
10. Reassert `tests/rls/weight-log.spec.ts` passes (regression check — no new table).
11. Write E2E for weight-log happy path including nudge confirmation + "see why" flow with axe injection.

**Dependencies:** Task 2.1 (Mifflin-St Jeor / TDEE / target pure functions + F12 refresh-interceptor consumed by weight/log), Task 3.1 (client_id idempotency pattern + `weight_log` schema + RLS), Task 4.3a (Progress shell + weekly-review cache-tag constants).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

### Task 4.5: Codex Adversarial Review — Library + Progress

**Complexity:** Review
**Codex review:** Per-phase (this IS the phase gate)
**Type tags:** [review]
**Files:** (diff-scoped, no files created)
**Reads:**
- `tasks.md` (Tasks 4.1, 4.2, 4.3a, 4.3b)
- `design-doc.md` §18, §19.1

**Goal:** Run Standard Codex Gate Sequence on all changes from Phase 4 (Tasks 4.1 + 4.2 + 4.3a + 4.3b).

**Steps:**
1. Pre-flight size check (split if > 1MB).
2. Run `/codex:adversarial-review` foreground, blocking, verbatim.
3. Post-review verification.
4. Categorize Critical / Suggestion / Minor.
5. Auto-fix Critical + Suggestion via opus sub-agent.
6. Present Minor findings to user.
7. Cap: 2 rounds.
8. Log in `progress.md` Notes.

**Dependencies:** Tasks 4.1, 4.2, 4.3a, 4.3b.

---

### Task 4.6: Phase Testing Sweep — Library + Progress

**Complexity:** Review
**Codex review:** N/A
**Type tags:** [testing]
**Files:** (no files created)
**Reads:**
- `tasks.md` (Tasks 4.1, 4.2, 4.3a, 4.3b)
- `testing-strategy.md` (pending Step 6.7)

**Goal:** Run the full applicable test suite for Phase 4. Block phase completion on any failures.

**Steps:**
1. Unit tests (Vitest) — sparse-data fallback (<3 / ≥3 day branches), recalc-threshold boundaries, auto-recalc trigger (auto+above / auto+below / manual), filter/sort permutations.
2. Component tests — library grid + merge dialog + thumbnail letter-mark, food detail, all 5 progress charts, weekly review island (sparse + full variants), weekly insight card (dashboard variant), weight quick-add optimistic + rollback, nudge card, weight trajectory line.
3. Integration tests (MSW) — library merge transaction, library item delete sets entry FK to NULL, weight log → recalc → nudge (auto mode), weight log → no recalc (manual mode), weight idempotent `client_id` replay, weekly-review TZ rollover (F4), weekly-review cache reuse (one Gemini call shared dashboard + progress).
4. RLS tests — re-run all 28 assertions + Storage bucket + `weight_log` regression (no new tables — verifies no regression from the new API routes).
5. E2E — library edit, library detail edit, weight log + dashboard nudge + "see why", progress render at 3 breakpoints, weekly review.
6. Visual regression — library + progress + heatmap × 3 breakpoints.
7. `@axe-core/playwright` accessibility — zero serious/critical on library + progress + weight + detail.
8. Lighthouse mobile ≥90 on library + progress (advisory per `design-doc.md §13`).
9. Coverage report — Unit branch coverage ≥70%.
10. Block phase completion if any Blocking-tier test fails.

**Dependencies:** Task 4.5.

---

### Task 4.7: Pre-Phase 5 Audit + Fixes

**Complexity:** Complex
**Codex review:** Per-task required (will run on aggregate fix diff)
**Type tags:** [audit][review][testing][backend][UI][database]
**Files:** (audit phase — no source changes; remediation phase scope pending user decision)
**Reads:**
- `bugs/codexfindings.txt`
- `Planning/followups.md`
- `Planning/PRD.md`
- `Planning/architecture.md`
- `Planning/task-4.7-audit-report.md`

**Goal:** Run a comprehensive pre-Phase 5 audit (Codex findings triage + PRD-vs-code review + followups review + test sweep + E2E) and remediate the must-fix items before Phase 5 entry.

**Acceptance criteria:**
- [x] **AC1:** Audit report at `Planning/task-4.7-audit-report.md` exists (already done)
- [ ] **AC2:** All 6 Codex must-fix items addressed (B1, B2, C1, B5, D1, TC1) — TDD-first
- [ ] **AC3:** Codex re-review on aggregate fix diff returns no new Critical findings (2-round cap)
- [ ] **AC4:** Test sweep stays green (1247+ tests pass)
- [ ] **AC5:** `tests/integration/library-merge-cache-error-surfacing.test.ts` and `tests/integration/weight-page-imperial-conversion.test.tsx` pass `tsc --noEmit`
- [ ] **AC6:** `followups.md` backfilled with 4 items currently only in continuation

**Status note:** Audit complete (2026-04-25). Fix scope approved by user (2026-04-25): all 6 Codex must-fixes + F-UI-3.6-A-4 Path B + cheap wins bundle. Sub-tasks 4.7.1–4.7.7 below own remediation.

**Dependencies:** Tasks 4.1, 4.2, 4.3a, 4.3b, 4.5, 4.6.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

### Task 4.7.1: TC1 typecheck fixes

**Complexity:** Small
**Codex review:** Per-task
**Type tags:** [testing][backend]
**Files:**
- `tests/integration/library-merge-cache-error-surfacing.test.ts`
- `tests/integration/weight-page-imperial-conversion.test.tsx`

**Reads:**
- test files only (self-contained — no production-code references needed)

**Goal:** Restore `tsc --noEmit` green on main by fixing the 2 typecheck errors Codex flagged.

**Acceptance criteria:**
- [ ] **AC1:** `tsc --noEmit` passes (or equivalent typecheck command)
- [ ] **AC2:** Both test files run successfully without runtime regression
- [ ] **AC3:** No production-code changes — only test files

**Dependencies:** None (independent, restores CI baseline).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests. All tests must pass before reporting task complete.

---

### Task 4.7.2: B1 + B5 schema cluster

**Complexity:** Small
**Codex review:** Per-task
**Type tags:** [database][backend][API]
**Files:**
- `supabase/migrations/0012_food_entries_manual_source.sql` (new)
- `app/api/library/dedup-check/route.ts`

**Reads:**
- `Planning/architecture.md` (DDL section)
- existing migration `supabase/migrations/0003_food_schema.sql` for CHECK constraint syntax
- dedup-check route current implementation

**Goal:** Add `'manual'` to `food_entries.source` CHECK constraint via migration 0012; patch dedup-check route to filter tombstones (`.is('deleted_at', null)`).

**Acceptance criteria:**
- [ ] **AC1:** Migration 0012 applies cleanly to kalori-dev
- [ ] **AC2:** Failing test asserting manual-source insert succeeds → passes
- [ ] **AC3:** Failing test asserting dedup-check excludes tombstoned items → passes
- [ ] **AC4:** All existing source enum tests still pass

**Dependencies:** Task 4.7.1 (CI clean baseline).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration tests, RLS tests. All tests must pass before reporting task complete.

---

### Task 4.7.3: B2 save-to-library server fix

**Complexity:** Small
**Codex review:** Per-task
**Type tags:** [backend][API]
**Files:**
- `app/api/entries/save/route.ts`
- `app/(app)/log/_components/ConfirmationScreen.tsx`

**Reads:**
- save route implementation
- ConfirmationScreen save() handler
- `library_items` schema (architecture.md DDL)

**Goal:** Server computes `normalized_name` from `items[0].name` when `save_to_library=true`; persist full nutrition row (not just kcal) on the library row insert.

**Acceptance criteria:**
- [ ] **AC1:** Failing integration test asserting save-to-library creates library row → passes
- [ ] **AC2:** Library row includes full nutrition data (kcal, protein, carbs, fat, fiber, etc.)
- [ ] **AC3:** ConfirmationScreen toggle still triggers correctly
- [ ] **AC4:** No regression in non-library save path

**Dependencies:** Task 4.7.2 (schema baseline).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration tests. All tests must pass before reporting task complete.

---

### Task 4.7.4: C1 library tab wiring

**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [UI][frontend][API]
**Files:**
- `app/(app)/log/_components/LogFlowTabs.tsx`
- `app/(app)/log/_components/LibraryTab.tsx`
- `app/(app)/log/_components/LogPageClient.tsx`
- FoodDetail "Log this now" button (in `components/library/FoodDetail.tsx`)

**Reads:**
- `Planning/ui-design.md` (log flow section)
- `Planning/architecture.md` (`library_items` shape)
- existing LibraryTab + LogFlowTabs implementation

**Goal:** Hydrate `<LibraryTab />` with library items from server; add "Continue" / "Log Selected" CTA that converts selection to `ParsedItemT[]` and enters confirmation screen with `source: 'library'`. For deep-link path `/log?tab=library&item=<id>`, fetch the item and skip directly to confirmation. Likely auto-closes F-UI-3.6-B-1-LIBRARY-CTA.

**Acceptance criteria:**
- [ ] **AC1:** Failing E2E test asserting library tab shows items → passes
- [ ] **AC2:** Failing E2E test asserting Continue CTA opens confirmation → passes
- [ ] **AC3:** Failing E2E test asserting deep-link `?item=<id>` opens confirmation directly → passes
- [ ] **AC4:** "Log this now" from FoodDetail opens populated library tab (not empty)
- [ ] **AC5:** F-UI-3.6-B-1-LIBRARY-CTA auto-closed (or explicitly addressed)

**Dependencies:** Task 4.7.3 (server-side library row writes are correct).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: component tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

### Task 4.7.5: D1 thumbnail dual-output

**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [backend][frontend][API]
**Files:**
- `app/(app)/log/_components/SnapTab.tsx`
- `lib/image/compress.ts`
- `app/api/storage/thumbnail/route.ts`

**Reads:**
- `Planning/architecture.md` (storage bucket section)
- existing `lib/image/compress.ts`
- `app/api/storage/thumbnail/route.ts`
- vision route for size limits

**Goal:** Split client-side compression into two outputs: vision blob ≤500 KB / 1600 px (for AI parsing) + thumbnail blob ≤50 KB / 320 px WebP (for storage). Post each to its respective route. Surface failure if thumbnail upload fails (don't swallow).

**Acceptance criteria:**
- [ ] **AC1:** Failing unit test asserting `compress()` returns dual outputs → passes
- [ ] **AC2:** Failing integration test asserting thumbnail blob ≤50 KB → passes
- [ ] **AC3:** Thumbnail route accepts the new blob successfully
- [ ] **AC4:** Vision flow still works with the larger blob
- [ ] **AC5:** Thumbnail upload failure surfaces to user (not silent)

**Dependencies:** None (independent file paths from log-flow fixes).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests. All tests must pass before reporting task complete.

---

### Task 4.7.6: F-UI-3.6-A-4 vn-smoke runtime fallback (Path B)

**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [backend][API]
**Files:**
- likely `lib/i18n/` or `lib/ai/` — to be discovered (vn-smoke fallback chain owner)

**Reads:**
- `Planning/architecture.md` invariants section (I7)
- follow-up `F-UI-3.6-A-4` entry in `Planning/followups.md`
- vn-smoke implementation

**Goal:** Implement the runtime fallback chain that the doc claims exists but is currently doc-only. Make I7 invariant truthful at runtime.

**Acceptance criteria:**
- [ ] **AC1:** Failing test asserting fallback chain triggers when primary path fails → passes
- [ ] **AC2:** Failing test asserting fallback returns expected vn-smoke shape → passes
- [ ] **AC3:** I7 invariant doc is now truthful (no doc reword needed)
- [ ] **AC4:** No regression in primary path

**Dependencies:** None.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests. All tests must pass before reporting task complete.

---

### Task 4.7.7: Cheap wins bundle

**Complexity:** Small
**Codex review:** Per-phase only (trivial, single-file changes)
**Type tags:** [infrastructure][testing][docs]
**Files:**
- `app/icon.tsx` OR `app/favicon.ico` (new)
- `tests/e2e/weight-log.spec.ts`
- `Planning/vercel-env-setup.md` (new — instructions only)

**Reads:**
- existing `tests/e2e/fixtures-auth.spec.ts` for the `authedTest` import pattern
- `Planning/setup-state.md` for current Vercel env scope

**Goal:**
1. Add favicon (`app/icon.tsx` is preferred per Next.js 16 conventions — generate a simple oxblood-on-warm-black "K" glyph SVG, or use Newsreader-styled letterform)
2. Switch `tests/e2e/weight-log.spec.ts` to import `authedTest` from `tests/e2e/fixtures-auth.spec.ts` (one-line fixture change)
3. Write `Planning/vercel-env-setup.md` with the exact `vercel env add NEXT_PUBLIC_KALORI_ENV ...` command sequence for production / preview / development scopes (user runs separately)

**Acceptance criteria:**
- [ ] **AC1:** Favicon 404 silenced on all routes
- [ ] **AC2:** `weight-log.spec.ts` runs through fixture (not bare `test()`); previously-failing weight-log E2E now executes (may or may not pass — verify it at least loads `/weight` instead of `/login`)
- [ ] **AC3:** Vercel env command sequence documented and ready for user

**Dependencies:** None.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

# Phase 5 — Polish + PWA

Scope: Offline outbox replay with I11 `client_id` preservation (owned by 5.1) + undo queue cross-tab hardening (BroadcastChannel for F6 cross-tab undo + F12 cross-tab sign-out — owned by 5.2) + reduced-motion audit + AI accuracy regression fixtures; @serwist/next PWA + manifest + service worker + IDB offline shell + Lighthouse hardening; data export (CSV+JSON ZIP); account deletion cascade (I9 Storage-first); visual regression baseline freeze. Note: F12 401→refresh-and-retry interceptor lives in Task 2.1 (pulled forward so Phase 2–4 mutations inherit the contract); Phase 5 only handles the cross-tab sign-out half of F12.

---

### Task 5.1: PWA + offline IDB + service worker + reduced-motion audit + Lighthouse hardening + AI accuracy regression fixtures + visual regression baseline freeze

**Complexity:** Complex (parent — split into 5.1.1–5.1.10)
**Codex review:** Per-task at sub-task level + aggregate review at parent close (5.1.10)
**Type tags:** [infrastructure] [UI] [testing]
**Files:** (split across sub-tasks — see sub-task cards)
**Reads:**
- `Planning/.tmp/task-5.1-briefing.md`
- `Planning/.tmp/task-5.1-ui-{design-lead,architecture,react-perf,ux-auditor,ux-specialist}.md`
- `tasks.md` (this entry + sub-tasks 5.1.1–5.1.10, Phases 1–4, Task 5.4 tiered AI-accuracy gate policy)
- `design-doc.md` §13 (AI accuracy regression spec, visual regression scope), §14 (PWA + offline), §15 (performance + accessibility), §18.1 F10, §18.2 I11 (replay-idempotency — owned here for the offline path)
- `kalori-project-blueprint.md` §3 (PWA must-have)

**Goal:** Ship the PWA shell with offline-read + library-based log queueing, lock visual baselines, audit reduced-motion across the app, and run the AI accuracy regression suite to baseline Vietnamese-food parsing.

**Acceptance criteria (allocated across sub-tasks 5.1.1–5.1.10):**
- [ ] **AC1:** App is installable on iOS / Android / desktop Chromium; manifest validates; SW registers and serves the offline shell *(owned by 5.1.2 + 5.1.4)*
- [ ] **AC2:** Offline read — dashboard renders from IDB cache when offline; library-based log queues to outbox + flushes on reconnect (per `design-doc.md §14` table) *(owned by 5.1.1 + 5.1.3)*
- [ ] **AC3 (I11 owner):** Replayed outbox writes preserve the **original** `client_id` (never regenerated on flush or retry); server returns 200 + existing row for duplicate `client_id` POST. Integration test asserts outbox flush with N unique `client_id`s + K duplicates produces row count = N (zero duplicate rows). **Task 5.2 no longer owns this.** *(owned by 5.1.1)*
- [ ] **AC4 (I11 partial-flush hardening):** Mid-flush network drop, tab refresh during flush, app backgrounded during flush — none regenerate `client_id`s on retry; resume produces zero duplicate rows *(owned by 5.1.1 + 5.1.3)*
- [ ] **AC5 (F10 mitigated):** Outbox replay uses LWW for library; goal-weight changes prompt the user to resolve *(owned by 5.1.5)*
- [ ] **AC6 (IDB unavailable):** Safari private mode (and equivalents) skips offline caching, surfaces the one-time toast "Offline support unavailable in this browser.", app still works online *(owned by 5.1.1 + 5.1.4)*
- [ ] **AC7 (Reduced-motion audit):** Every `motion.*` element has a `prefers-reduced-motion` variant verified by the audit test (AST scan) *(owned by 5.1.6)*
- [ ] **AC8 (Lighthouse mobile ≥90):** Perf, a11y, best-practices, SEO on dashboard + log + library + progress (CI advisory) *(owned by 5.1.9)*
- [ ] **AC9 (AI accuracy regression):** 10 photos + 10 prompts produce parsed item names matching dictionary + kcal within ±15%. Shares fixture tree at `tests/fixtures/ai-accuracy/` from Task 3.2; loader is single source of truth. Critical-tier registry at `tests/fixtures/ai-accuracy/critical.ts` enforced merge-blocking in Task 5.4 *(owned by 5.1.7)*
- [ ] **AC10 (Visual regression):** 6 screens × 3 breakpoints = 18 baselines locked git-tracked (advisory) *(owned by 5.1.8)*

**Sub-tasks (execute in order; see individual cards below):**
- **5.1.1** — IDB schema + outbox manager + R1-wired flush *(I11 owner; foundation)*
- **5.1.2** — Service worker + manifest + offline page + SW registration
- **5.1.3** — Network state provider + useOutbox hook + replay state machine
- **5.1.4** — PWA install affordance + offline indicator UI
- **5.1.5** — Replay status badge + drawer + F10 conflict modal
- **5.1.6** — Reduced-motion audit + a11y standardization + axe-core
- **5.1.7** — AI accuracy regression fixtures (10 VN + 10 Western + 5 photo)
- **5.1.8** — Visual regression baseline freeze (18 baselines)
- **5.1.9** — Lighthouse CI hardening (mobile thresholds)
- **5.1.10** — Per-task Codex aggregate + C9 + parent closure

**Dependencies:** Tasks 1.1–4.6 (depends on every fetch path being stable and final UI being settled — placement deliberate per pre-plan).

**Scope note:** This task is the canonical owner of I11 offline-outbox replay-idempotency + F10 conflict resolution. Task 5.2 handles cross-tab undo + F12 cross-tab sign-out + export + account deletion only. Do NOT defer any offline mutation flush behind a later task.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit, integration, E2E, axe-core a11y, visual regression, Lighthouse CI. All tests must pass before reporting parent task complete (5.1.10).

---

### Task 5.1.1: IDB schema + outbox manager + R1-wired flush

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [infrastructure]
**Files:**
- `lib/offline/idb.ts` (new) — `idb-keyval` wrapper for keys `library`, `entries:${day}`, `profile`, `weekly-review:${week}` (per `design-doc.md §14`)
- `lib/offline/outbox.ts` (new) — append-only FIFO queue; flush on `online`/`visibilitychange→online` events; **I11 replay-idempotency contract owner** (preserves original `client_id` across all retry/resume paths)
- `lib/offline/availability.ts` (new) — IDB availability detection (Safari private-mode fallback)
- `tests/integration/offline-outbox-replay-idempotency.test.ts` (new) — **I11 full contract**: N+K dedup, partial-flush drop + resume, client_id preservation across refresh + reconnect
- `tests/integration/idb-unavailable-fallback.test.ts` (new) — Safari-private-mode simulation
- `tests/unit/offline/outbox.test.ts` (new) — (de)serialize + FIFO + flush idempotency unit coverage

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§4 R1 contract, §5a I11 server contract, §5b outbox replay flow)
- `Planning/.tmp/task-5.1-ui-architecture.md` (IDB schema + outbox queue interaction with refresh-interceptor)
- `Planning/.tmp/task-5.1-ui-react-perf.md` (SW lifecycle + hydration safety)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/architecture.md` §1.5 (offline outbox flow), §8.4 (idempotency), §11 (refresh-interceptor consumer chain)
- `lib/auth/refresh-interceptor.ts` (R1 8th consumer entrypoint — wrap, do NOT shim)

**Goal:** Land the offline IDB foundation + outbox manager with the I11 idempotency contract enforced at the integration-test level, wired through `lib/auth/refresh-interceptor.ts`.

**Acceptance criteria:**
- [ ] **AC1:** IDB wrapper exposes typed get/set/delete for the 4 canonical keys; integration test asserts roundtrip preservation
- [ ] **AC2:** Outbox flush preserves the original `client_id` across all retry/resume paths (NEVER regenerated)
- [ ] **AC3 (I11 N+K):** Outbox flush with N unique `client_id`s + K duplicates → row count = N (zero duplicates); test passes
- [ ] **AC4 (I11 partial-flush):** Mid-flush network drop + resume → zero duplicate rows; test passes
- [ ] **AC5 (I11 cross-refresh):** `client_id` preservation across tab refresh + reconnect; test passes
- [ ] **AC6:** Outbox flush routes ALL writes through `authPost`/`authFetch` (zero raw `fetch(` in new offline code — grep guard)
- [ ] **AC7:** IDB-unavailable fallback (Safari private mode sim): `availability.ts` returns false; outbox short-circuits; test passes

**Steps:**
1. **TDD RED:** Write `tests/integration/offline-outbox-replay-idempotency.test.ts` covering (a) N+K dedup, (b) partial-flush drop + resume, (c) cross-refresh client_id preservation. Verify failure for the right reason.
2. **TDD RED:** Write `tests/integration/idb-unavailable-fallback.test.ts` simulating Safari private mode. Verify failure.
3. Build `lib/offline/idb.ts` (idb-keyval wrapper) + `lib/offline/availability.ts` (private-mode detection).
4. Build `lib/offline/outbox.ts` — FIFO queue + flush handler wrapping `authPost`/`authFetch` (R1 contract). Preserve `client_id` end-to-end.
5. Verify all 3 integration tests + unit suite pass; grep for raw `fetch(` in new code (must be zero).
6. Codex per-task review; auto-fix Critical/Improvement; defer Suggestions to followups.
7. Commit with `task 5.1.1: <verb> <what>` message.

**Dependencies:** None (foundation; TDD-RED first).

**Owner contract:** Owns I11 client_id idempotency contract (full owner) + R1 8th consumer of `lib/auth/refresh-interceptor.ts` (zero local refresh shims).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit, integration. All tests must pass before reporting task complete.

---

### Task 5.1.2: Service worker + manifest + offline page + SW registration

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [infrastructure][UI]
**Files:**
- `next.config.ts` (modify) — `@serwist/next` integration with build-hash cache busting
- `app/sw.ts` (new) — service worker: network-first for `/api/*`, stale-while-revalidate for static, cache-first for thumbnails (`food-thumbnails/*`); cache-bust on Next 16 build hash
- `public/manifest.json` (new) — name "Kalori", short_name "Kalori", `theme_color #0E0A08`, `background_color #0E0A08`, `display: standalone`, `orientation: portrait`, icons 192/512/maskable
- `public/icons/` (new) — 192/512 standard + maskable variants (oxblood-on-warm-black "K" glyph reusing Task 4.7.7 favicon vocabulary)
- `app/offline/page.tsx` (new) — offline shell page rendered when SW serves cached fallback; wires `useOutbox` state from 5.1.3 (forward dependency stub OK)
- `app/_components/SWRegistration.tsx` (new) — client-only SW registration with hydration safety (`useEffect`, no SSR)
- `tests/e2e/pwa-install.spec.ts` (new) — manifest validity + SW registration + install prompt observable
- `tests/integration/sw-cache-strategies.test.ts` (new) — assert cache strategy per route family (network-first / stale-while-revalidate / cache-first)

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5d F11 SW scope, §5e §14 PWA section)
- `Planning/.tmp/task-5.1-ui-architecture.md` (SW registration interaction with refresh-interceptor)
- `Planning/.tmp/task-5.1-ui-react-perf.md` (SW lifecycle + dynamic import + no render-blocking)
- `Planning/.tmp/task-5.1-ui-design-lead.md` (manifest icon/theme tokens)
- `Planning/.tmp/session-context.md` (if exists)

**Goal:** Wire @serwist/next, ship manifest + maskable icons, build the SW with three cache strategies + build-hash cache-busting, and register SW with hydration safety.

**Acceptance criteria:**
- [ ] **AC1:** `@serwist/next` integrated in `next.config.ts`; build hash threaded into SW version string
- [ ] **AC2:** `public/manifest.json` validates against W3C manifest spec; theme/background `#0E0A08`; icons 192/512/maskable resolve
- [ ] **AC3:** SW serves three cache strategies correctly (network-first `/api/*` / stale-while-revalidate static / cache-first thumbnails); integration test passes
- [ ] **AC4:** App is installable on Chromium desktop + Android; iOS adds-to-home-screen path verified
- [ ] **AC5:** Cache busts on deploy (build-hash version mismatch invalidates old caches); test passes
- [ ] **AC6:** `app/offline/page.tsx` renders without SSR errors; consumes `useOutbox` from 5.1.3
- [ ] **AC7:** SW registration is hydration-safe (no SSR; `useEffect`-gated client mount)

**Steps:**
1. **TDD RED:** Write `tests/e2e/pwa-install.spec.ts` + `tests/integration/sw-cache-strategies.test.ts`. Verify failure.
2. Add `@serwist/next` dependency; wire `next.config.ts` with build-hash threading.
3. Build `app/sw.ts` with three cache strategies + version string from build hash.
4. Build `public/manifest.json` + 192/512/maskable icon assets.
5. Build `app/offline/page.tsx` (consumes 5.1.3 `useOutbox` stub).
6. Build `app/_components/SWRegistration.tsx`; mount in root layout client-only.
7. Verify E2E + integration tests pass.
8. Codex per-task review; auto-fix Critical/Improvement.

**Dependencies:** 5.1.1 (offline page references outbox state).

**Owner contract:** Owns F11 SW scope + manifest.json + offline page route. SW lifecycle MUST NOT block first paint (per react-perf fragment).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration, E2E. All tests must pass before reporting task complete.

---

### Task 5.1.3: Network state provider + useOutbox hook + replay state machine

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [UI]
**Files:**
- `lib/offline/network-state.tsx` (new) — `OfflineQueueProvider` + `useOfflineQueue` (single store; consumers: masthead chip, water-tracker badge, offline bar, replay badge)
- `lib/offline/use-outbox.ts` (new) — `useOutbox` hook exposing queue depth, last flush attempt, replay status (`idle | replaying | conflict | error`)
- `lib/offline/replay-state-machine.ts` (new) — pure state-machine (idle → replaying → success | error → idle; conflict branch routes to 5.1.5 modal)
- `tests/unit/offline/replay-state-machine.test.ts` (new) — exhaustive transition table coverage
- `tests/integration/network-state-provider.test.tsx` (new) — provider mounts, hydration-safe, exposes correct snapshots
- `tests/integration/use-outbox.test.tsx` (new) — depth + status reactivity to outbox events

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5f navigation + offline indicator design)
- `Planning/.tmp/task-5.1-ui-react-perf.md` (React 19 hydration safety, `useTransition` reduced-motion guard)
- `Planning/.tmp/task-5.1-ui-architecture.md` (provider + hook contract)
- `Planning/.tmp/task-5.1-ui-ux-specialist.md` (4-state cluster: loading/empty/error/offline)
- `Planning/.tmp/session-context.md` (if exists)

**Goal:** Build the React 19 hydration-safe network/outbox state layer that all UI consumers (5.1.4 install + offline bar, 5.1.5 replay badge + drawer) depend on.

**Acceptance criteria:**
- [ ] **AC1:** `OfflineQueueProvider` mounts client-only (no SSR network access); hydration-safe
- [ ] **AC2:** `useOfflineQueue` returns `{ online, queueDepth, lastFlushAt, replayStatus }`; reactive to outbox events
- [ ] **AC3:** `useOutbox` hook is the single consumer entry-point (no direct IDB reads from components)
- [ ] **AC4:** Replay state machine: idle ↔ replaying → success | conflict | error → idle; full transition coverage in unit tests
- [ ] **AC5:** `useTransition` wraps replay status updates with reduced-motion guard (per react-perf fragment)
- [ ] **AC6:** Network online/offline events surface within 100ms of `window` event (no manual polling)

**Steps:**
1. **TDD RED:** Write replay-state-machine unit tests + provider/hook integration tests. Verify failure.
2. Build `replay-state-machine.ts` (pure function machine).
3. Build `network-state.tsx` provider with hydration-safe mount + window event listeners.
4. Build `use-outbox.ts` hook consuming provider + outbox manager from 5.1.1.
5. Verify all tests pass.
6. Codex per-task review.

**Dependencies:** 5.1.1 (consumes outbox manager), 5.1.2 (consumes SW registration status).

**Owner contract:** Owns the React 19 hydration-safe network/outbox layer. NO direct IDB reads from components — all access funnels through `useOutbox`.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit, integration. All tests must pass before reporting task complete.

---

### Task 5.1.4: PWA install affordance + offline indicator UI

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [UI]
**Files:**
- `lib/pwa/use-pwa-install.ts` (new) — `usePWAInstall` hook capturing `beforeinstallprompt` event, exposing `{ installable, install(), dismissed }`
- `components/pwa/PWAInstallPrompt.tsx` (new) — folded-letter modal (tear-line + typewriter indent + ribbon-tab) per `ui-design.md §7.9`; copy: "Add Kalori to your home screen for offline-ready ledger access."; `localStorage` dismissal persistence (`kalori.pwa-prompt.dismissed=1`)
- `components/ui/OfflineBar.tsx` (new) — persistent top-of-viewport bar `bg-2`, 1px rule-strong bottom, ember-toned text "OFFLINE · showing cached data from {HH:mm}"; CLS=0 (reserved space)
- `components/ui/OfflineIndicatorToast.tsx` (new) — single info toast for IDB-unavailable browsers ("Offline support unavailable in this browser.")
- `app/layout.tsx` (modify) — wire `<PWAInstallPrompt/>` (dynamic-imported) + `<OfflineBar/>` conditional on `useOfflineQueue` + `<OfflineIndicatorToast/>` conditional on `availability.ts`
- `tests/e2e/pwa-install-affordance.spec.ts` (new) — install prompt fires + dismissal persists + does-not-fire-when-installed
- `tests/integration/offline-bar.test.tsx` (new) — bar visibility tracks `online` state; copy includes cache timestamp; CLS=0 verified
- `tests/integration/offline-indicator-toast.test.tsx` (new) — toast surfaces once on IDB-unavailable; suppressed on subsequent loads

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5e §14 PWA, §5f navigation indicator design)
- `Planning/.tmp/task-5.1-ui-design-lead.md` (PWA install modal folded-letter metaphor + offline indicator bar)
- `Planning/.tmp/task-5.1-ui-ux-specialist.md` (install affordance copy, offline empty-states, 4-state cluster)
- `Planning/.tmp/task-5.1-ui-react-perf.md` (`PWAInstallPrompt` dynamic-imported)
- `Planning/.tmp/session-context.md` (if exists)

**Goal:** Land the user-visible PWA install affordance + offline indicator UI consuming the 5.1.3 hooks; all components dynamic-imported where appropriate to avoid first-paint blocking.

**Acceptance criteria:**
- [ ] **AC1:** `usePWAInstall` hook captures `beforeinstallprompt`; install() resolves promise; dismissal persists in localStorage
- [ ] **AC2:** PWA install modal renders folded-letter metaphor (tear-line + typewriter indent + ribbon-tab); copy verbatim per spec
- [ ] **AC3:** OfflineBar shows on offline, hides on online; cache timestamp interpolated correctly; CLS=0 verified
- [ ] **AC4:** OfflineIndicatorToast surfaces once per browser session on IDB-unavailable; localStorage-suppressed on subsequent loads
- [ ] **AC5:** `PWAInstallPrompt` is dynamic-imported (lazy bundle); does NOT contribute to first-paint bundle (bundle-analyze guard)
- [ ] **AC6:** All E2E + integration tests pass

**Steps:**
1. **TDD RED:** Write E2E + integration tests. Verify failure.
2. Build `usePWAInstall` hook.
3. Build `PWAInstallPrompt`, `OfflineBar`, `OfflineIndicatorToast` components.
4. Wire into `app/layout.tsx` with `dynamic()` import for the install prompt.
5. Verify all tests + bundle-analyze guard.
6. Codex per-task review.

**Dependencies:** 5.1.3 (UI components consume `useOfflineQueue` + `useOutbox`).

**Owner contract:** Owns `usePWAInstall` hook, install modal (folded-letter metaphor), offline bar (CLS=0).

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration, E2E. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

---

### Task 5.1.5: Replay status badge + drawer + F10 conflict modal

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [UI]
**Files:**
- `components/pwa/ReplayStatusBadge.tsx` (new) — merges into 5.1.4 OfflineBar when queue depth > 0; shows replay state (idle/replaying/conflict/error) + count
- `components/pwa/ReplayDrawer.tsx` (new) — Radix Drawer / sheet revealing per-row outbox queue with retry / discard actions
- `components/pwa/GoalWeightConflictModal.tsx` (new) — Radix `<AlertDialog>` (focus trap + ESC + first-focus-on-cancel) prompting user to resolve goal-weight stale-replay (F10 exception path)
- `lib/offline/conflict-resolver.ts` (new) — table-driven LWW for library; goal-weight branches to user prompt; per-table policy
- `tests/unit/offline/conflict-resolver.test.ts` (new) — table-driven LWW + goal-weight prompt branch coverage
- `tests/integration/replay-status-badge.test.tsx` (new) — badge surfaces replay state; reactive to outbox events
- `tests/integration/replay-drawer.test.tsx` (new) — drawer lists queued rows; retry / discard actions wire to outbox manager
- `tests/integration/outbox-conflict-resolution.test.ts` (new) — F10 LWW for library; goal-weight conflict opens modal; user resolves; outcome persisted

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5c F10 LWW, §5f UI fragments — replay-status microcopy)
- `Planning/.tmp/task-5.1-ui-design-lead.md` (replay-status badge composition)
- `Planning/.tmp/task-5.1-ui-ux-specialist.md` (replay-status microcopy, conflict-resolution copy)
- `Planning/.tmp/task-5.1-ui-ux-auditor.md` (alertdialog focus trap + a11y)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/design-doc.md` §14 F10 conflict-resolution table

**Goal:** Land the user-visible replay surface (badge + drawer) + F10 goal-weight conflict modal; library replays are LWW-silent, goal-weight stale-replay prompts the user.

**Acceptance criteria:**
- [ ] **AC1:** ReplayStatusBadge composes into OfflineBar when `queueDepth > 0`; reactive to replay state machine (5.1.3)
- [ ] **AC2:** ReplayDrawer lists per-row queued mutations with retry/discard actions wired to outbox manager
- [ ] **AC3 (F10):** Library outbox replay uses LWW silently (no user prompt); per-table conflict matrix coverage in unit tests
- [ ] **AC4 (F10 goal-weight):** Goal-weight stale-replay opens AlertDialog with focus trap + ESC + first-focus-on-cancel; user resolution persists to profile
- [ ] **AC5:** Modal closes on resolution; outbox row dequeued; replay state machine returns to idle
- [ ] **AC6:** axe-core: zero serious/critical violations on badge + drawer + modal

**Steps:**
1. **TDD RED:** Write unit + integration + conflict-resolution tests. Verify failure.
2. Build `lib/offline/conflict-resolver.ts` (table-driven).
3. Build `ReplayStatusBadge`, `ReplayDrawer`, `GoalWeightConflictModal` components.
4. Wire conflict modal into replay state machine (5.1.3) for goal-weight branch.
5. Verify all tests + axe pass.
6. Codex per-task review.

**Dependencies:** 5.1.3 (consumes replay state machine), 5.1.4 (badge merges into OfflineBar).

**Owner contract:** Owns F10 LWW (library) + goal-weight prompt branch + AlertDialog focus trap.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit, integration, axe-core a11y. All tests must pass before reporting task complete.

---

### Task 5.1.6: Reduced-motion audit + a11y standardization + axe-core

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [UI][testing]
**Files:**
- `lib/motion/reduced-motion-audit.ts` (new) — central helper enumerating `motion.*` imports + asserting `prefers-reduced-motion` variants
- `tests/integration/reduced-motion-audit.test.ts` (new) — AST-scan over `motion.*` imports; fails if any element lacks reduced-motion variant
- `tests/axe/setup.ts` (new) — `@axe-core/playwright` injection harness
- `tests/e2e/reduced-motion.spec.ts` (new) — Playwright `{ reducedMotion: 'reduce' }` matrix on offline bar + install modal + replay drawer + conflict modal + Settings toggle; assert animations ≤1ms
- Modifications across existing components per a11y red flags from ux-auditor:
  - **Focus ring color standardization:** all interactive surfaces use `ivory` 2px outline + 2px offset (NOT oxblood — closes ux-auditor red flag #1)
  - **`width` → `scaleX` refactor:** progress/replay bars + ember-pulse + chronometer ring (Safari reduced-motion regression — closes ux-auditor red flag #2)
  - **Replay success badge contrast fix:** AAA contrast on ivory background (closes ux-auditor red flag #3)
- `app/(app)/settings/_components/ReduceMotionToggle.tsx` (new) — Settings panel toggle (mirrors OS pref, additive override)

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5f ux-auditor enrichment, motion tokens)
- `Planning/.tmp/task-5.1-ui-ux-auditor.md` (3 a11y red flags, M6.1 close)
- `Planning/.tmp/task-5.1-ui-design-lead.md` (Settings Reduce Motion toggle spec)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/ui-design.md` §6 (motion tokens + reduced-motion fallback contract)

**Goal:** Audit every `motion.*` element for reduced-motion compliance; standardize a11y red flags from ux-auditor; wire axe-core matrix.

**Acceptance criteria:**
- [ ] **AC1:** AST-scan asserts every `motion.*` import has a `prefers-reduced-motion` variant; test passes
- [ ] **AC2:** Focus ring color: `ivory` 2px + 2px offset across all interactive surfaces (per ux-auditor #1)
- [ ] **AC3:** `width`-based animations refactored to `scaleX` for Safari reduced-motion safety (per ux-auditor #2)
- [ ] **AC4:** Replay success badge has AAA contrast on ivory bg (per ux-auditor #3)
- [ ] **AC5:** Settings Reduce Motion toggle mirrors OS pref + persists override in localStorage
- [ ] **AC6:** axe-core E2E matrix: zero serious/critical violations across new PWA surfaces (offline bar, install modal, replay drawer, conflict modal, settings toggle)
- [ ] **AC7:** Playwright reduced-motion matrix asserts animations ≤1ms when `{ reducedMotion: 'reduce' }`

**Steps:**
1. **TDD RED:** Write reduced-motion audit + axe-core spec + reduced-motion E2E. Verify failure.
2. Build `lib/motion/reduced-motion-audit.ts` AST scanner.
3. Apply 3 a11y red-flag fixes (focus ring / width→scaleX / badge contrast) — surgical, only files affected.
4. Build Settings Reduce Motion toggle.
5. Verify all tests pass; axe zero serious/critical.
6. Codex per-task review.

**Dependencies:** 5.1.4 (offline bar / install modal exist), 5.1.5 (replay badge / drawer / modal exist).

**Owner contract:** Owns reduced-motion audit + 3 a11y red-flag remediations from ux-auditor + axe-core CI integration.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration, E2E, axe-core a11y. All tests must pass before reporting task complete.

---

### Task 5.1.7: AI accuracy regression fixtures (10 VN + 10 Western + 5 photo)

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [testing]
**Files:**
- `tests/fixtures/ai-accuracy/vn-smoke/` (extend) — keep 5 VN from Task 3.2; verify loader API
- `tests/fixtures/ai-accuracy/western-smoke/` (new) — 3 Western critical-tier fixtures (will be added to `critical.ts`)
- `tests/fixtures/ai-accuracy/advisory/` (new) — 7 Western advisory + ≥15 supplemental advisory text prompts
- `tests/fixtures/ai-accuracy/photos/` (new) — 5 photo fixtures with byte-precision metadata
- `tests/fixtures/ai-accuracy/critical.ts` (modify) — extend Task 3.2's registry from 5 VN to 5 VN + 3 Western (8 critical-tier fixtures total)
- `tests/fixtures/ai-accuracy/loader.ts` (modify if needed) — confirm `loadCriticalFixtures()`, `loadAdvisoryFixtures()`, `loadFixtureByName()`, `loadAllFixtures()` API stable (single source of truth shared with Task 3.2 + 5.4)
- `tests/integration/ai-accuracy-regression.test.ts` (new) — Vitest snapshot tests against MSW-stubbed Gemini; assert critical-tier ±15% kcal / ±20% macro tolerance; advisory-tier ±20% kcal / ±30% macro
- `tests/integration/ai-accuracy-idempotency.test.ts` (new) — same fixture twice → identical snapshot (catches non-deterministic Gemini drift)

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5g testing matrices — AI accuracy fixtures)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/testing-strategy.md` §AI-accuracy fixtures + tolerance bands
- `tests/fixtures/ai-accuracy/critical.ts` (Task 3.2 origin)
- `tests/fixtures/ai-accuracy/loader.ts` (existing API)

**Goal:** Extend the AI accuracy fixture matrix from Task 3.2's 5 VN smoke to the full 10 VN + 10 Western + 5 photo regression suite; populate the critical-tier registry; ship the snapshot test runner.

**Acceptance criteria:**
- [ ] **AC1:** Fixture tree exists at `tests/fixtures/ai-accuracy/{vn-smoke,western-smoke,advisory,photos}/`; loader API unchanged
- [ ] **AC2:** `critical.ts` lists 5 VN (from 3.2) + 3 Western staples (named, justified)
- [ ] **AC3:** AI accuracy regression snapshot test passes for all 25 fixtures (5 VN + 10 Western + 5 photo + 5 advisory text); critical-tier ±15% kcal / ±20% macro; advisory-tier ±20% / ±30%
- [ ] **AC4:** Idempotency test: same fixture twice → identical snapshot (Gemini stub deterministic)
- [ ] **AC5:** Test fixture loader is sole source of truth (no duplicate fixture loading paths in 3.2 or 5.4)

**Steps:**
1. **TDD RED:** Write `tests/integration/ai-accuracy-regression.test.ts` + `ai-accuracy-idempotency.test.ts` covering full matrix. Verify failure.
2. Populate fixture tree (5 VN extend, 10 Western new, 5 photo new, ≥15 advisory text new).
3. Extend `critical.ts` with 3 Western staples (justify selection in fixture comments).
4. Verify loader API unchanged; snapshot tests pass.
5. Codex per-task review.

**Dependencies:** None (independent test infrastructure; can run in parallel with 5.1.1–5.1.6).

**Owner contract:** Owns critical.ts extension (5 VN + 3 Western) + loader as single source of truth shared with 3.2 / 5.4.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: integration. All tests must pass before reporting task complete.

---

### Task 5.1.8: Visual regression baseline freeze (18 baselines)

**Folder:** root canonical
**Complexity:** Small
**Codex review:** Per-phase only (visual baselines — Codex would review Phase 5 review at 5.3)
**Type tags:** [testing][UI]
**Files:**
- `tests/visual/__screenshots__/` (new) — 18 baselines captured: 6 screens × 3 breakpoints (375 / 768 / 1280)
- `tests/visual/landing.spec.ts` (extend or new)
- `tests/visual/dashboard.spec.ts` (new)
- `tests/visual/log-confirmation.spec.ts` (new)
- `tests/visual/library.spec.ts` (new)
- `tests/visual/progress.spec.ts` (new)
- `tests/visual/weight-log.spec.ts` (new — or onboarding-step-8 transparency panel as substitute, implementer pick)
- New baselines for offline-affected surfaces: offline bar / replay drawer / install modal / conflict modal / offline page / reduced-motion variants

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5g visual regression matrix)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/testing-strategy.md` §visual regression spec
- `tests/visual/__screenshots__/` (existing 24 baselines from Tasks 4.1–4.3)

**Goal:** Lock the final 18 visual regression baselines for the 6 canonical screens × 3 breakpoints, capturing post-5.1.4/5/6 state on Linux Chromium first-green-CI.

**Acceptance criteria:**
- [ ] **AC1:** 18 baseline screenshots committed under `tests/visual/__screenshots__/` (6 screens × 3 breakpoints)
- [ ] **AC2:** Cross-browser drift (Firefox + Safari) ≤0.5%
- [ ] **AC3:** Capture executed on Linux Chromium first-green CI (Mac/Windows captures rejected)
- [ ] **AC4:** Visual specs run advisory in CI; drift ≤0.5% does not block; >0.5% surfaces report
- [ ] **AC5:** F-TEST-1 (visual baselines bootstrap) closed by AC10 visual baseline freeze

**Steps:**
1. Capture baselines on Linux Chromium first-green CI (target `KALORI_VISUAL_UPDATE=1` or Playwright `--update-snapshots=missing`).
2. Cross-browser sanity drift check (Firefox + Safari).
3. Commit baselines git-tracked.
4. Mark F-TEST-1 RESOLVED in `followups.md`.
5. (No Codex per-task — phase-level only.)

**Dependencies:** 5.1.4 (final UI surfaces), 5.1.5 (replay drawer/modal exist), 5.1.6 (a11y standardizations applied).

**Owner contract:** Closes F-TEST-1 (visual baselines bootstrap deferral from Task 1.5).

> **MANDATORY**: Follow TDD — visual regression baselines are not TDD-RED-driven; this task is a baseline-capture task. Capture must be on Linux Chromium first-green CI; drift verification on Firefox + Safari.

---

### Task 5.1.9: Lighthouse CI hardening (mobile thresholds)

**Folder:** root canonical
**Complexity:** Medium
**Codex review:** Per-task
**Type tags:** [infrastructure][testing]
**Files:**
- `.github/workflows/lighthouse.yml` (new or modify) — Lighthouse CI workflow on PR + main
- `lighthouserc.json` (new) — `@lhci/cli` config: mobile preset, thresholds (PWA≥90, Perf≥90, A11y≥95, BP≥95, SEO≥90), URLs (`/dashboard`, `/log`, `/library`, `/progress`)
- Performance tuning (only if any metric falls sub-threshold) — likely candidates: bundle-split offline modal/drawer further; lazy-load chart libs on /progress; preload SW assets
- `tests/lighthouse/thresholds.test.ts` (new) — assertion-style guard that latest Lighthouse run meets thresholds (advisory CI)

**Reads:**
- `Planning/.tmp/task-5.1-briefing.md` (§5g Lighthouse spec)
- `Planning/.tmp/task-5.1-ui-react-perf.md` (perf guidance)
- `Planning/.tmp/session-context.md` (if exists)
- `Planning/testing-strategy.md` §Lighthouse mobile thresholds + advisory policy
- F-TEST-4 followup status (real-authed-page measurement gated; this task uses login-redirect proxy or seeded test user if 5.1 closes F-TEST-4 opportunistically)

**Goal:** Wire Lighthouse CI against the deployed Vercel preview with mobile thresholds; tune any sub-90 metric; PWA `installable` audit passes.

**Acceptance criteria:**
- [ ] **AC1:** `lighthouserc.json` configured with mobile preset + 5 URLs + 5 thresholds (PWA≥90, Perf≥90, A11y≥95, BP≥95, SEO≥90)
- [ ] **AC2:** Lighthouse CI workflow runs on PR + main (advisory)
- [ ] **AC3:** PWA `installable` audit passes (manifest valid + SW registers + offline fallback)
- [ ] **AC4:** All 5 thresholds met on `/dashboard`, `/log`, `/library`, `/progress` (real authed page if F-TEST-4 closed; login-redirect proxy otherwise — surface caveat)
- [ ] **AC5:** Any sub-threshold metric tuned via documented surgical change (no speculative optimization)

**Steps:**
1. **TDD RED:** Write `tests/lighthouse/thresholds.test.ts` + workflow YAML lint. Verify failure.
2. Add `@lhci/cli` dependency; build `lighthouserc.json`.
3. Build `.github/workflows/lighthouse.yml`.
4. Run Lighthouse against dev preview; observe metrics.
5. If any sub-threshold: tune surgically (one fix per failing metric).
6. Verify all 5 thresholds met; PWA `installable` passes.
7. Codex per-task review.

**Dependencies:** 5.1.2 (Lighthouse needs SW + manifest live for PWA `installable`).

**Owner contract:** Owns Lighthouse CI mobile threshold enforcement (advisory) + PWA `installable` audit gate.

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: infrastructure (CI workflow), advisory CI test. All tests must pass before reporting task complete.

---

### Task 5.1.10: Per-task Codex aggregate + C9 + parent closure

**Folder:** root canonical
**Complexity:** Small
**Codex review:** Per-phase only (closure task; sub-tasks 5.1.1–5.1.9 already had per-task Codex)
**Type tags:** [review]
**Files:**
- `Planning/progress.md` (modify) — close Task 5.1 parent + sub-task rows; populate Codex aggregate, files changed, tests added
- `Planning/CHANGELOG.md` (modify) — Phase 5 close-out entry
- `Planning/followups.md` (modify) — F-TEST-4 cleanup (verify already shipped at Task 4.1 commit `aea1a66` — fold misdirected entries); close F-TEST-1 (closed by 5.1.8); close any 5.1.x deferred Suggestions if low-risk
- `Planning/brainstorm-state.md` (modify) — bump `next_executable_task` → `Phase 5 Task 5.2`; log Task 5.1 close

**Reads:**
- All sub-task closure data from 5.1.1–5.1.9 (commit hashes, test counts, Codex outcomes)
- `Planning/.tmp/task-5.1-briefing.md` §11 (verification commands list)
- `Planning/followups.md` (F-TEST-4 + F-TEST-1 cleanup queue)

**Goal:** Run final aggregate Codex review across the full Task 5.1 series (5.1.1–5.1.9 commits) + verify C9 runtime acceptance criteria + close parent + propagate state.

**Acceptance criteria:**
- [ ] **AC1:** Aggregate Codex review on full 5.1.x diff returns 0 new Critical findings (2-round cap)
- [ ] **AC2:** All 10 parent ACs (AC1–AC10) verified runtime-green via verification commands (briefing §11)
- [ ] **AC3:** Test sweep stays green (1296 + ~80 new tests across 5.1.x)
- [ ] **AC4:** F-TEST-4 misdirected followup entries cleaned (already shipped at 4.1 `aea1a66`)
- [ ] **AC5:** F-TEST-1 closed by 5.1.8
- [ ] **AC6:** `progress.md` parent + sub-task rows populated with closure data
- [ ] **AC7:** `CHANGELOG.md` Phase 5 close-out entry added
- [ ] **AC8:** `brainstorm-state.md` `next_executable_task` → `Phase 5 Task 5.2`

**Steps:**
1. Run verification commands (briefing §11) — bun install, typecheck, full test suite, visual, e2e, lighthouse, git status.
2. Run aggregate Codex review across full 5.1.x diff. Auto-fix Critical/Improvement; defer Suggestions.
3. Update `progress.md` parent + sub-task rows.
4. Update `CHANGELOG.md` with Phase 5 close-out entry.
5. Clean `followups.md` (F-TEST-4 cleanup, F-TEST-1 close, 5.1.x deferred Suggestions).
6. Update `brainstorm-state.md` next_executable_task.
7. Commit + push.

**Dependencies:** 5.1.1–5.1.9 (closure step).

**Owner contract:** Owns Task 5.1 parent closure, F-TEST-1 closure, F-TEST-4 cleanup, Phase 5 entry-readiness.

> **MANDATORY**: Aggregate Codex review must return 0 new Critical findings before parent closes. All 10 parent ACs must be runtime-verified, not just sub-task-checkmarked.

---

### Task 5.2: Cross-tab undo (F6) + cross-tab sign-out (F12 cross-tab half) + data export ZIP + account deletion cascade (I9)

**Complexity:** Complex
**Codex review:** Per-task required
**Type tags:** [backend] [API] [UI] [integration]
**Files:**
- `lib/stores/useUndoQueueStore.ts` — extend Task 3.4 store: cross-tab via `BroadcastChannel('kalori-undo')` so a delete in tab A reveals an undo toast in tab B (F6 cross-tab half — the within-tab 5s timer + cleared-on-nav behavior is already shipped by Task 3.4)
- `lib/auth/cross-tab-signout.ts` — `BroadcastChannel('kalori-auth')`; sign-out in any tab triggers sign-out in all per F12's cross-tab half. (The F12 401→refresh-and-retry interceptor lives in Task 2.1 and is consumed by every Phase 2+ mutation route — NOT owned here.)
- `app/api/export/csv/route.ts` — flat food_entries + weight_log + water_log; ISO 8601 UTC + user TZ column per `design-doc.md §10.9`
- `app/api/export/json/route.ts` — nested profile + library + entries + logs with `schema_version: "v1"`
- `app/api/export/zip/route.ts` — packages CSV + JSON into `kalori-export-{userId}-{date}.zip`
- `app/api/account/delete/route.ts` — Storage objects first → DB rows in transaction (FK cascades) → `auth.users` last, then sign out (per `design-doc.md §6` + I9)
- `tests/integration/undo-cross-tab.test.ts` — BroadcastChannel reveals toast in tab B
- `tests/integration/cross-tab-signout.test.ts` — F12 multi-tab: sign-out in tab A propagates to tabs B/C via BroadcastChannel
- `tests/integration/account-delete-cascade.test.ts` — I9: zero objects under `{userId}/` AND zero rows in all 7 user-owned tables AND auth.users row absent (in that order — Storage first)
- `tests/integration/export-zip.test.ts` — round-trip: seed user data → export → unzip → verify columns
- `tests/e2e/account-delete.spec.ts` — full account-deletion flow with double-confirm

**Reads:**
- `tasks.md` (this entry, Tasks 2.1 (refresh-interceptor contract — consumed, not owned), 3.1, 3.4, 5.1)
- `design-doc.md` §6 (Account Deletion ordering), §10.9 (Export schema), §11 (undo queue spec), §18.1 F3/F12 (cross-tab half only), §18.2 I8/I9

**Goal:** Close the data lifecycle — cross-tab undo, cross-tab sign-out propagation, full data export, and verified-clean account deletion. Scope narrowed: the 401→refresh-and-retry half of F12 lives in Task 2.1 so every Phase 2+ mutation inherits it; I11 offline-outbox replay-idempotency lives in Task 5.1. This task handles only the cross-tab behaviors + export + deletion.

**Acceptance criteria:**
- [ ] **F6 (cross-tab undo):** deleting an entry in tab A reveals the undo toast in tab B via `BroadcastChannel('kalori-undo')`; the within-tab 5s timer + cleared-on-nav behavior from Task 3.4 is unchanged
- [ ] **F12 cross-tab half:** sign-out in any tab propagates to all open tabs via `BroadcastChannel('kalori-auth')`; integration test covers 3-tab scenario. (The 401→refresh-and-retry half is consumed from Task 2.1's `lib/auth/refresh-interceptor.ts` and verified by Phase 2–4 reinforcement tests — not re-implemented here.)
- [ ] Export: ZIP contains both CSV + JSON; CSV has UTC + user-TZ columns; JSON has `schema_version: "v1"`; integration test round-trips
- [ ] **I9 enforced:** Account deletion deletes Storage objects FIRST (paginated under `{userId}/`), then DB rows in a single transaction (FK cascades), then `auth.users`; integration test asserts zero Storage objects + zero rows across all 7 user-owned tables; double-confirm dialog required in UI
- [ ] Tests:
  - Integration: undo cross-tab, cross-tab sign-out, account-delete cascade ordering, export round-trip
  - E2E: account-delete with double-confirm

**Steps:**
1. **TDD first:** Write `tests/integration/account-delete-cascade.test.ts` asserting ordering + zero residue. Verify failure.
2. Build `app/api/account/delete/route.ts` with Storage-first pagination + transactional DB delete + `auth.users` delete + sign-out; verify integration test passes.
3. Build the CSV / JSON / ZIP export routes; round-trip integration test.
4. Build `lib/auth/cross-tab-signout.ts` (BroadcastChannel('kalori-auth')); verify cross-tab sign-out integration test. Note: `lib/auth/refresh-interceptor.ts` is NOT built here — it already exists from Task 2.1 and is consumed by every Phase 2+ mutation.
5. Extend `useUndoQueueStore` with `BroadcastChannel('kalori-undo')` for cross-tab undo.
6. Write E2E for account deletion with double-confirm + axe injection.

**Dependencies:** Tasks 2.1 (refresh-interceptor consumed), 3.1, 3.4, 5.1 (offline outbox + I11 replay-idempotency already shipped there).

---

### Task 5.3: Codex Adversarial Review — Polish + PWA

**Complexity:** Review
**Codex review:** Per-phase (this IS the phase gate)
**Type tags:** [review]
**Files:** (diff-scoped, no files created)
**Reads:**
- `tasks.md` (Tasks 5.1, 5.2)
- `design-doc.md` §18, §19.1

**Goal:** Run Standard Codex Gate Sequence on all changes from Phase 5.

**Steps:**
1. Pre-flight size check (split if > 1MB).
2. Run `/codex:adversarial-review` foreground, blocking, verbatim.
3. Post-review verification.
4. Categorize Critical / Suggestion / Minor.
5. Auto-fix Critical + Suggestion via opus sub-agent.
6. Present Minor findings to user.
7. Cap: 2 rounds.
8. Log in `progress.md` Notes.

**Dependencies:** Tasks 5.1, 5.2.

---

### Task 5.4: Phase Testing Sweep — Polish + PWA (FINAL SHIPPABLE GATE)

**Complexity:** Review
**Codex review:** N/A
**Type tags:** [testing]
**Files:** (no files created)
**Reads:**
- `tasks.md` (Tasks 5.1, 5.2)
- `testing-strategy.md` (pending Step 6.7)

**Goal:** Run the full applicable test suite for Phase 5 + the cumulative regression suite for all prior phases. Block release on any failures. **This sweep is the final shippable gate — manual smoke pass against production-like build is required.**

**Steps:**
1. Unit tests (Vitest) — outbox conflict resolution; cumulative regression of all unit suites from Phases 1–4.
2. Component tests — offline badge, offline indicator toast; cumulative regression.
3. Integration tests (MSW) — offline outbox replay-idempotency + partial-flush resume (I11, owned by 5.1), IDB unavailable (5.1), reduced-motion audit (5.1), undo cross-tab (5.2), cross-tab sign-out (5.2), auth-refresh 401-retry (from Task 2.1 + reinforcement tests in 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b), export ZIP (5.2), account-delete cascade (5.2).
4. RLS tests — re-run all 28 assertions; verify no regression.
5. E2E — pwa-install, offline-shell, account-delete; cumulative regression of all 10 blueprint + secondary flows.
6. Visual regression — final 18 baselines locked.
7. `@axe-core/playwright` accessibility — zero serious/critical across every E2E.
8. Lighthouse mobile score ≥90 target (advisory per `design-doc.md §13`). Flag in PR comment if <90; do NOT block final gate on Lighthouse alone. Keep all other gates as-is (unit / integration / E2E / RLS / visual all remain blocking per `design-doc.md §13`).
9. **AI accuracy regression (tiered gate — blocking for critical, named sign-off for advisory):** Full regression suite from Task 5.1 runs (10 VN + 10 Western + 5 photo fixtures). **Critical tier (MERGE-BLOCKING on any ±15% tolerance breach):** the named list maintained in `tests/fixtures/ai-accuracy/critical.ts` — minimum the 5 VN smoke from Task 3.2 (bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) + 3 Western staples. A failing critical fixture blocks the final gate AND blocks release. **Advisory tier (named sign-off required before merge):** remaining 7 Western fixtures + 5 photo fixtures. On advisory-tier tolerance breach the PR MUST carry a named sign-off comment from the project lead recording the breach, the cause analysis, and the accept/defer decision; merge remains BLOCKED until the sign-off comment is recorded in the PR. Critical-tier failures never fall through to sign-off — they always require fixture update (justified), prompt adjustment, or model-version rollback.
10. Coverage report — Unit branch coverage ≥70%.
11. **Manual final smoke:** dev seed loaded, build production locally, run through all 4 critical flows + account deletion + export ZIP + offline library log. Block release if smoke fails.

> **Lighthouse drift guard:** If the team later decides to promote Lighthouse to blocking, update both `design-doc.md §13` and this task simultaneously — do not let them drift.

**Dependencies:** Task 5.3.

---

# Sprint: MVP Stabilization (2026-05-01)

**Sprint folder:** `Planning/features/2026-05-01-mvp-stabilization/`
**Sprint state:** `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md`
**Authoritative design:** `Planning/features/2026-05-01-mvp-stabilization/design-doc.md`
**Mode:** Feature Addition (Complex FA brownfield)
**Phase plan:** A (Unblockers + Verify) → B (P1 Patches) → C (P1 Features) → D (Hardening) → E (Closure)
**Implementation tactics:** Approach 3 Hybrid (P0 serial, P1+ parallel within phases)

## Type Tag Canonical Enum

Per `~/.claude/skills/superpowers-exec-tomi/references/task-schema.md`. Tags allowed in this sprint:
`[UI]`, `[backend]`, `[API]`, `[database]`, `[design]`, `[testing]`, `[infrastructure]`, `[integration]`, `[review]`, `[e2e]`, `[user-story-e2e]`, `[user-story-verification]`, `[FA]`, `[brownfield]`, `[project-sweep]`. Multiple per task allowed. **Do NOT substitute conventional-commits-style tags (FEAT/FIX/REFACTOR/TEST etc.) — those are NOT canonical here.**

## Canonical TDD Mandate (sprint-level reference)

This sprint inherits the project-level Canonical TDD Mandate (see top of this file at line 35–37). Verbatim:

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

## Project-Sweep Decision

Per design doc §8 audit: sprint introduces no new subsystem, no 3+ Break-Risk-High API change, schema migration 0018 affects single consumer (`food_library_items`). `[project-sweep]` task **NOT EMITTED**. Decision per Step 6.7a contract. Revisited at Phase A close if verification report surfaces 3+ break-risk-high issues.

---

## Sprint Phase A — Unblockers + Verification Dispatch

### Task A.1: US-STAB-A1 — Library save on new-item creation
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [backend][database][FA][brownfield]
**Files:**
- `app/(app)/library/_components/new-item-form.tsx` (or current form path)
- `app/api/library/route.ts` (POST handler — adds INSERT path)
- `lib/library/create-item.ts` (extract handler if not present)
- `tests/integration/library-create.test.ts` (NEW)
- `tests/e2e/web/user-stories/US-STAB-A1.spec.ts` (NEW)
- `tests/rls/library-isolation.test.ts` (extends 32-assertion harness)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-A1, §10 FF #C)
- features/2026-05-01-mvp-stabilization/manifest.md
- features/2026-05-01-mvp-stabilization/impact-analysis.md
- architecture.md (food_library_items DDL + RLS)
- PRD.md (F4 Library Log)
**Goal:** Persist newly-created Library items into `food_library_items` so the user can re-log them next time.
**User Story:** US-STAB-A1
**User Stories:**
- US-STAB-A1:
  AS: a logged-in user logging a new food via the Library entry form
  WHEN: I create a new food item via the Library new-item form
  THEN: a row is persisted in food_library_items with my user_id and visible on next library reload
  ACs covered: AC1, AC2, AC3
**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I have 0 entries with name `'kale-A1-test'` in `food_library_items`, WHEN I create a new item via the Library new-item form, THEN a row appears in `food_library_items` with my `user_id` AND the item is visible in the library list on next reload. *(test-planned: tests/integration/library-create.test.ts::persists-to-food-library-items)*
- AC2: GIVEN I am logged in AND I have just created a new library item, WHEN I navigate to `/library`, THEN the new item is visible in my library list within 1 second of navigation completion. *(test-planned: tests/e2e/web/user-stories/US-STAB-A1.spec.ts::library-create-visible-after-nav)*
- AC3: GIVEN I am logged in AND another user (RLS test fixture) has 0 entries, WHEN I create a new library item, THEN the other user's library list is unchanged. *(test: existing RLS 32-assertion harness extended; library_items_user_isolation case)*

**Steps:**
1. **TDD RED:** Write `tests/integration/library-create.test.ts::persists-to-food-library-items` asserting the INSERT writes a row tied to `auth.uid()`. Verify RED for the right reason (no INSERT path or wrong table).
2. Trace existing form submit handler; identify why save is dropped (no API call, missing handler, RLS deny, etc.). Pre-fix evidence captured in `acceptance-evidence/task-A.1.md`.
3. Wire the form's submit handler through `lib/auth/refresh-interceptor.ts` (R1 firewall) with `client_id` header (I11). NO direct `fetch(`.
4. Implement `app/api/library/route.ts` POST handler (or extend) that performs the INSERT under the user's session.
5. Verify integration test GREEN. Add `tests/e2e/web/user-stories/US-STAB-A1.spec.ts::library-create-visible-after-nav` and confirm pass.
6. Extend RLS harness with `library_items_user_isolation` case; run full 32-assertion sweep — must stay GREEN.
7. Per-task Codex review via `codex:rescue` sub-agent; auto-fix Critical/Improvement, surface Minor.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/rls/library-isolation.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- R1 firewall: form submit MUST go through `lib/auth/refresh-interceptor.ts`; pre-task grep ensures no raw `fetch(`.
- I11 idempotency: POST accepts `client_id` header; row stores it for replay-safe retries.

---

### Task A.2: US-STAB-A2 — Sidebar identity shows real Gmail login
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [UI][backend][FA][brownfield]
**Files:**
- `components/nav/sidebar.tsx` (identity row)
- `components/nav/identity-row.tsx` (extract if not present)
- `lib/auth/get-display-identity.ts` (NEW — resolver)
- `tests/unit/sidebar/identity-row.test.tsx` (NEW)
- `tests/e2e/web/user-stories/US-STAB-A2.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-A2, DT-9)
- features/2026-05-01-mvp-stabilization/manifest.md
- architecture.md (auth + sidebar component)
- ui-design.md (sidebar identity row + anonymous placeholder)
- PRD.md (F1 onboarding identity)
**Goal:** Replace hardcoded "dev user" sidebar text with real authenticated identity (email → full_name → "Account" literal).
**User Story:** US-STAB-A2
**User Stories:**
- US-STAB-A2:
  AS: a Google-OAuth-authenticated user in production
  WHEN: I render any page that includes the sidebar
  THEN: the sidebar identity row shows my real email (or fallback per AC4), never `dev user`
  ACs covered: AC1, AC2, AC3, AC4
**Acceptance Criteria:**
- AC1: GIVEN I am logged in via Google OAuth in production AND my Gmail is `tamas.szalay@gmail.com`, WHEN I render any page that includes the sidebar, THEN the sidebar identity row reads `tamas.szalay@gmail.com`, NOT `dev user`. *(test-planned: tests/e2e/web/user-stories/US-STAB-A2.spec.ts::sidebar-shows-gmail-not-devuser)*
- AC2: GIVEN I am logged in AND my email contains exotic characters (encode test fixture), WHEN the sidebar renders, THEN the email is HTML-escaped and not raw-injected. *(test-planned: tests/unit/sidebar/identity-row.test.tsx::escapes-email-html)*
- AC3: GIVEN I am NOT logged in (anon visit), WHEN the sidebar renders, THEN the identity row displays the configured anonymous placeholder per `ui-design.md` (NOT `dev user`). *(test-planned: tests/unit/sidebar/identity-row.test.tsx::anon-shows-placeholder)*
- AC4: GIVEN I am logged in via Google OAuth AND the email scope was not granted (empty `auth.users.email`), WHEN the sidebar renders, THEN the identity row falls back to `auth.users.user_metadata.full_name` if available, else the literal string `Account` — and NEVER displays `dev user` or any hardcoded test identifier. *(test-planned: tests/unit/sidebar/identity-row.test.tsx::email-missing-falls-back-to-fullname-or-account-literal)*

**Steps:**
1. **TDD RED:** Write `tests/unit/sidebar/identity-row.test.tsx::escapes-email-html` and `::anon-shows-placeholder` and `::email-missing-falls-back-to-fullname-or-account-literal`. Verify all RED.
2. Locate `dev user` literal in current sidebar; document call site in `acceptance-evidence/task-A.2.md`.
3. Implement `lib/auth/get-display-identity.ts` resolver: returns `email ?? user_metadata.full_name ?? "Account"` and HTML-escapes the chosen value.
4. Wire resolver into sidebar identity component; remove hardcoded `dev user` literal.
5. Verify all unit tests GREEN. Add E2E `tests/e2e/web/user-stories/US-STAB-A2.spec.ts::sidebar-shows-gmail-not-devuser` running against logged-in fixture user.
6. Per-task Codex review via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/unit/sidebar/identity-row.test.tsx

**Notes:**
- TDD: write a failing test for AC4 first (empty-email fallback), verify RED for the right reason, write minimal code to GREEN, refactor.
- Empty-email fallback chain: email → full_name → literal `Account` (NEVER `dev user` or test identifier).

---

### Task A.3: US-STAB-A3 — Orphan-profile redirect to /onboarding
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [backend][API][FA][brownfield]
**Files:**
- `app/(app)/dashboard/page.tsx` (and other affected route handlers: log, library, progress, weight, settings)
- `lib/auth/orphan-profile-fence.ts` (NEW — single-pass LEFT JOIN helper)
- `app/api/dashboard/aggregate/route.ts` (and sibling API endpoints — return JSON 401)
- `tests/integration/dashboard-orphan-profile.test.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-A3, §10 P-2 TOCTOU mitigation, C4 fix)
- features/2026-05-01-mvp-stabilization/impact-analysis.md
- architecture.md (RLS + dashboard route handlers)
- testing-strategy.md (RLS 32-assertion harness)
**Goal:** Replace orphan-profile read failure with a 302 redirect to `/onboarding` for page routes; APIs return JSON 401 (per US-STAB-D2 contract). TOCTOU-safe single-pass profile/aggregate fetch.
**User Story:** US-STAB-A3
**User Stories:**
- US-STAB-A3:
  AS: a user with a missing profile row (orphaned auth.users)
  WHEN: I hit any affected page route or API endpoint
  THEN: page routes 302 to /onboarding; APIs return JSON 401; no other user's data leaks
  ACs covered: AC1, AC2, AC3, AC4, AC5, AC6
**Acceptance Criteria:**
- AC1: GIVEN a logged-in user whose `profiles` row is missing (orphan-state fixture) AND who hits any of the affected route handlers (dashboard, log, library, progress, weight, settings), WHEN they request the page, THEN the response is a 302 server-side redirect to `/onboarding` (NOT a 401 JSON, NOT a graceful empty-state of dashboard, NOT another user's aggregates). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::redirects-302-to-onboarding)*
- AC2: GIVEN the same orphan state, WHEN the user calls any dashboard-aggregate API endpoint, THEN every endpoint returns a JSON 401 with `Content-Type: application/json` and body `{ "error": "profile_lookup_failed" }` (per US-STAB-D2 contract). API routes do NOT serve a 302 — only page route handlers do. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::all-aggregate-api-endpoints-401)*
- AC3: GIVEN the dashboard route handler logs a Sentry breadcrumb on orphan detection, WHEN orphan is detected, THEN Sentry receives a `dashboard.orphan-profile-fenced` breadcrumb with anonymized user_id (hash of `auth.uid()`, NOT the raw UUID). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::sentry-breadcrumb)*
- AC4: GIVEN the affected route handlers (dashboard, log, library, progress, weight, settings), WHEN any aggregate query runs, THEN every query is constrained to `auth.uid()` via either RLS enforcement OR an explicit `WHERE user_id = auth.uid()` predicate; no other user's profile or aggregate row is returned even when `profile_lookup_failed`. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::auth-uid-scoping-enforced-on-every-aggregate)*
- AC5: GIVEN a single request entering an affected route handler, WHEN profile lookup AND the page's primary aggregate fetch happen, THEN they are co-located in a single SQL operation (LEFT JOIN OR a single transaction) — no possibility of profile being valid for one query and missing for another in the same request (TOCTOU-safe per P-2). *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::single-pass-profile-aggregate-toctou-safe)*
- AC6: IF the implementation chooses the fallback-create-profile branch instead of redirect, THEN it creates ONLY `profiles.id = auth.uid()` in one atomic `INSERT INTO profiles (id) VALUES (auth.uid()) ON CONFLICT (id) DO NOTHING` server-side; no client-controlled fields are accepted; the insert is followed by the same redirect-to-onboarding so the user completes profile setup explicitly. *(test-planned: tests/integration/dashboard-orphan-profile.test.ts::fallback-insert-no-client-fields-then-redirect)*

**Steps:**
1. **TDD RED:** Write `tests/integration/dashboard-orphan-profile.test.ts::redirects-302-to-onboarding` and the 5 sibling cases. Verify all RED.
2. Implement `lib/auth/orphan-profile-fence.ts` exporting `requireProfileOrRedirect()` which performs the single-pass LEFT JOIN fetching profile + primary aggregate together (TOCTOU-safe).
3. Wire fence into all 6 affected page route handlers (dashboard, log, library, progress, weight, settings). On null profile → redirect 302 to `/onboarding`.
4. Update API endpoints to return JSON 401 with `{"error":"profile_lookup_failed"}` (matches D2 contract).
5. Add Sentry breadcrumb call (`dashboard.orphan-profile-fenced`, hashed user_id).
6. Verify all 6 ACs GREEN. RLS 32-assertion harness still GREEN.
7. Per-task Codex review via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract, Security Boundary]
  brownfield-phase: 4
  public-api: true
  characterization-tests: tests/integration/dashboard-orphan-profile.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Sentry breadcrumb: anonymize user_id via SHA-256 hash; never log raw UUID.

---

### Task A.VERIFY: US-STAB-A-VERIFY — 6-agent verification dispatch
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing][user-story-verification][FA]
**Files:**
- `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` (NEW — matrix output)
- `scripts/verify-report-completeness.mjs` (NEW — column-completeness audit)
- `Planning/.tmp/verify-agent-{1..6}-briefing.md` (per-agent dispatch briefings)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§5 verification dispatch model, DT-7)
- PRD.md (full 19-feature catalog)
- testing-strategy.md
**Goal:** Dispatch 6 parallel sub-agents (`general-purpose`, `model: opus`) to walk all 19 PRD features × per-AC matrix happy-path against live HEAD; produce single consolidated `verification-report.md`.
**User Story:** US-STAB-A-VERIFY (non-implementation meta task)
**Acceptance Criteria:**
- AC1: GIVEN 6 sub-agents are dispatched (`general-purpose`, `model: opus`) with ~3 features each, WHEN all sub-agents return, THEN `verification-report.md` exists with one row per `Feature ID × AC ID`. *(manual: artifact existence check + matrix completeness audit)*
- AC2: GIVEN a Pass/Fail column per row, WHEN rendered, THEN every Fail row has a populated `Bug ID`, `Severity`, `Area`, `Recommended Phase`, AND `Evidence Path`. *(manual: per-row column audit script `scripts/verify-report-completeness.mjs`)*
- AC3: GIVEN a verification-found bug at `Severity: P0` or `P1`, WHEN sprint orchestrator reads the report, THEN a story `US-STAB-C4..C?` is minted in `tasks.md` with `Folder:` metadata. *(manual: `tasks.md` diff after Phase A close)*

**Steps:**
1. Orchestrator writes 6 per-agent briefing files at `Planning/.tmp/verify-agent-{1..6}-briefing.md` — each lists ~3 PRD features and the 10-column row template.
2. Spawn 6 sub-agents (`general-purpose` type, `model: opus`) in PARALLEL, single message. Each agent walks its assigned features happy-path against the live HEAD build, fills its rows.
3. Sub-agents return matrix fragments to orchestrator.
4. Orchestrator concatenates fragments into single `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` with the 10-column header.
5. Run `scripts/verify-report-completeness.mjs` — audits every Fail row has Bug ID + Severity + Area + Recommended Phase + Evidence Path populated.
6. Triage P0/P1 verification-found bugs into stories `US-STAB-C4..C?` (or B/D depending on Recommended Phase). Append story cards to this Sprint section of `tasks.md`.
7. If quality empirically poor (e.g., screenshot mismatches THEN clause), re-dispatch with 8-10 agents per O-5 mitigation.

**Notes:**
- Dispatch model: 6 sub-agents, `general-purpose` type, `model: opus`, ~3 features each, single consolidated matrix output.
- 10-column header: `Feature ID | AC ID | WHEN clause | THEN clause | Pass/Fail | Evidence Path | Bug ID | Severity | Area | Recommended Phase`.
- This task is non-implementation; ACs are manual / artifact-existence checks.

---

### Task A.E2E: User Story E2E — Phase A (US-STAB-A1 + A2 + A3 bundled)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [e2e][user-story-e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-A-bundled.spec.ts` (NEW — bundled E2E covering A1+A2+A3 happy + edge paths)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-A1/A2/A3)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md (E2E click-through mandate)
**Goal:** End-to-end Playwright spec covering Phase A user stories US-STAB-A1, A2, A3 (3 P0 fixes; **bundled by design — all 3 share the post-login flow, single spec is auditable and efficient per Step 6.4a guidance**). Functional click-through verifying A1 library save + A2 sidebar identity + A3 orphan-profile redirect, end-to-end on a real authenticated fixture.

**Steps:**
1. New Playwright spec walks: log in (real OAuth fixture) → sidebar shows real email → create library item → reload → item visible → orphan-profile fixture user → 302 to /onboarding.
2. Every interactive surface within the flow MUST be clicked/typed/inspected (E2E Click-Through Mandate).
3. Run against dev build; assert all 3 stories' ACs traceable to assertions.

---

### Task A.SWEEP: Phase A Testing Sweep
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing]
**Reads:**
- tasks.md (Sprint Phase A tasks: A.1, A.2, A.3, A.VERIFY, A.E2E)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md
**Goal:** Run full applicable test suite for Phase A; audit acceptance evidence; block phase on any failure.

**Steps:**
1. Vitest full suite (`pnpm test`).
2. Playwright full suite (`pnpm test:e2e`) including new US-STAB-A1/A2 specs + orphan-profile integration test + A.E2E bundled spec.
3. RLS 32-assertion harness — every assertion GREEN.
4. AI accuracy fixture suite (`tests/fixtures/ai-accuracy/critical.ts`) — 30/30 unchanged.
5. Per-task acceptance-evidence audit: A.1, A.2, A.3 all have `acceptance-evidence/task-<id>.md` (Lean for non-UI Medium; Full for UI/Complex).
6. Verification report exists at `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` AND completeness script passes.
7. Block phase close if any test fails or evidence missing.

---

### Task A.CODEX: Codex Adversarial Review — Phase A
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** Phase-level
**Type tags:** [review]
**Reads:**
- tasks.md (Sprint Phase A tasks)
- ~/.claude/skills/brainstorm-tomi/codex-safety.md
**Goal:** Run Standard Codex Gate Sequence on all Phase A changes; auto-fix Critical/Improvement; 2-round cap.

**Steps:**
1. Pre-flight diff size check (split into per-task passes if >1MB).
2. Invoke `codex:rescue` sub-agent with Phase A scope (file paths + diff).
3. Categorize Critical / Improvement / Minor.
4. Auto-fix Critical + Improvement via opus sub-agent.
5. Surface Minor findings to user.
6. Round-cap: 2.
7. Log outcome in `progress.md` Notes.

---

## Sprint Phase B — P1 Single-File Patches

### Task B.1: US-STAB-B1 — Authed users redirected to /dashboard from /
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [UI][FA][brownfield]
**Files:**
- `app/(marketing)/page.tsx` OR `app/page.tsx` (root route — adds redirect path)
- `tests/e2e/web/user-stories/US-STAB-B1.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B1)
- architecture.md (route map + middleware)
- PRD.md (F1)
**Goal:** Server-side redirect authed users from `/` to `/dashboard`; anon users still see public landing.
**User Story:** US-STAB-B1
**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I navigate to `/`, WHEN the request resolves, THEN I land on `/dashboard` (HTTP 302 server-side OR client-side replace). *(test-planned: tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-redirects-authed-to-dashboard)*
- AC2: GIVEN I am NOT logged in AND I navigate to `/`, WHEN the request resolves, THEN I see the public landing page (no auth gate, no redirect to dashboard). *(test-planned: tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-shows-landing-anon)*
- AC3: GIVEN the redirect is server-side, WHEN measured at a cold response, THEN total LCP delta vs the landing baseline is within +50ms (no waterfall added). *(manual: lighthouse delta against `tests/lighthouse/landing.json`)*

**Steps:**
1. **TDD RED:** Write `tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-redirects-authed-to-dashboard` and `::root-shows-landing-anon`. Verify RED.
2. Add server-side auth check at root route (or middleware): if `auth.uid()`, redirect 302 to `/dashboard`.
3. Verify both ACs GREEN. Manual lighthouse delta check for AC3.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.

---

### Task B.2: US-STAB-B2 — New-item form clears after save
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [UI][FA][brownfield]
**Files:**
- `app/(app)/library/_components/new-item-form.tsx`
- `tests/unit/library-form/clears-after-save.test.tsx` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B2)
- ui-design.md (Library new-item form)
- architecture.md (Library form component)
**Goal:** Reset form fields on successful save; preserve on error; first input focused at offset 0.
**User Story:** US-STAB-B2
**Acceptance Criteria:**
- AC1: GIVEN the new-item form has any input value, WHEN I submit successfully (server returns 2xx), THEN every input resets to its initial empty/default state. *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::clears-on-success)*
- AC2: GIVEN the new-item form has input values, WHEN I submit and the server returns an error, THEN inputs are preserved (do not clear). *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::preserves-on-error)*
- AC3: GIVEN the form just cleared after save, WHEN I focus the first input, THEN it has focus AND the cursor is positioned at offset 0. *(test-planned: tests/unit/library-form/clears-after-save.test.tsx::focus-first-input-after-clear)*

**Steps:**
1. **TDD RED:** Write all 3 unit tests. Verify RED.
2. Add `form.reset()` on success path; preserve on error.
3. Wire `firstInputRef.current?.focus({ preventScroll: false })` after reset.
4. Verify all GREEN.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.

---

### Task B.3: US-STAB-B3 — Sidebar "Navigation" header is non-interactive
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [UI][FA][brownfield]
**Files:**
- `components/nav/sidebar.tsx` (Navigation header)
- `tests/unit/sidebar/nav-header-non-interactive.test.tsx` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B3)
- ui-design.md (sidebar nav-header)
- architecture.md (sidebar component)
**Goal:** Convert the sidebar "Navigation" label from a misleadingly-clickable element to a proper non-interactive `<h2>` heading.
**User Story:** US-STAB-B3
**Acceptance Criteria:**
- AC1: GIVEN the sidebar is rendered, WHEN I inspect the "Navigation" header, THEN it is a `<h2>` (or equivalent) with no `href`, no `onClick`, no `tabindex` 0. *(test-planned: tests/unit/sidebar/nav-header-non-interactive.test.tsx::no-interactive-attrs)*
- AC2: GIVEN the same element, WHEN keyboard-traversed via Tab, THEN it is NOT in the tab order (skipped). *(test-planned: tests/unit/sidebar/nav-header-non-interactive.test.tsx::not-in-tab-order)*
- AC3: GIVEN the same element, WHEN inspected via axe, THEN no a11y violation arises (proper heading semantics). *(test: existing axe sweep extended to cover sidebar `<nav>` block)*

**Steps:**
1. **TDD RED:** Write `::no-interactive-attrs` and `::not-in-tab-order`. Verify RED.
2. Convert element to `<h2>`; remove any `onClick`/`href`/`tabindex`.
3. Verify GREEN. Re-run axe sweep on sidebar block.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.

---

### Task B.4: US-STAB-B4 — Progress page weight quick-add + RSC refresh
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [UI][backend][FA][brownfield]
**Files:**
- `app/(app)/progress/_components/weight-quick-add.tsx` (NEW or extend)
- `tests/unit/progress/weight-quick-add.test.tsx` (NEW)
- `tests/e2e/web/user-stories/US-STAB-B4.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B4, DT-7)
- PRD.md (F9 Weight Log)
- architecture.md (weight_log RLS + RSC pattern)
- ui-design.md (Progress page weight quick-add)
**Goal:** Add inline weight quick-add control to Progress page that submits via interceptor, validates bounds, and refreshes via `router.refresh()` (no hard reload, no full document navigation).
**User Story:** US-STAB-B4
**Acceptance Criteria:**
- AC1: GIVEN I am on `/progress`, WHEN I click the weight quick-add affordance and submit a value, THEN the weight is saved AND the page state updates via `router.refresh()` only — NO `window.location.reload()` and NO full-document navigation; Playwright network confirms the refresh issues an `_rsc=` revalidation request to the current path, NOT a full HTML re-fetch. *(test-planned: tests/e2e/web/user-stories/US-STAB-B4.spec.ts::quick-add-router-refresh-no-hard-reload)*
- AC2: GIVEN the same flow, WHEN the value is outside `[30, 350]` kg or violates the lbToKg conversion (constant `0.45359237`), THEN an inline error renders AND no save occurs. *(test-planned: tests/unit/progress/weight-quick-add.test.tsx::bounds-validation)*
- AC3: GIVEN a successful save, WHEN I check the rendered chart, THEN the new datapoint appears within 1.5s of submit. *(test-planned: tests/e2e/web/user-stories/US-STAB-B4.spec.ts::chart-updated-after-save)*
- AC4: GIVEN the save call hits an offline conflict, WHEN the F10 modal mounts, THEN it does NOT show a lying CTA (D3 contract — see US-STAB-D3). *(test: cross-reference D3 honest-copy contract)*

**Steps:**
1. **TDD RED:** Write `::bounds-validation`, `::quick-add-router-refresh-no-hard-reload`, `::chart-updated-after-save`. Verify RED.
2. Build inline quick-add component; import existing `lbToKg = 0.45359237` constant; validate `[30, 350]` kg bounds.
3. Submit via `lib/auth/refresh-interceptor.ts` (R1 firewall) with `client_id` (I11).
4. On success: call `router.refresh()`. NO `window.location.reload()`.
5. Playwright network assertion: only `_rsc=` POST request, no full HTML re-fetch.
6. Verify all GREEN.
7. Per-task Codex review via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/unit/progress/weight-quick-add.test.tsx

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Reuse existing `lbToKg = 0.45359237` constant from `lib/units/weight.ts` (or equivalent); no redefinition.
- Acceptance Evidence tier: **Full** (UI Medium per Q10 D4) — `acceptance-evidence/task-B.4.md`.

---

### Task B.5: US-STAB-B5 — Site-wide nav audit
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [UI][testing][infrastructure][FA][brownfield]
**Files:**
- `scripts/nav-audit.mjs` (NEW — static analysis of routes vs nav links)
- `tests/integration/nav-audit.test.ts` (NEW)
- `tests/e2e/web/404.spec.ts` (NEW)
- `app/not-found.tsx` (Kalori canonical 404 page if not present)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B5, B5 cross-ref to verification-report.md)
- architecture.md (route map)
- testing-strategy.md (e2e nav coverage)
- ui-design.md (sidebar/topbar/footer)
**Goal:** Audit every visible nav link for 404s/dead/orphan links; ensure 404 fixture renders canonical Kalori 404 page.
**User Story:** US-STAB-B5
**Acceptance Criteria:**
- AC1: GIVEN the audit script `scripts/nav-audit.mjs` walks every `<a>` and `<Link>`, WHEN the script runs against HEAD, THEN it reports zero 404s, zero dead links, zero orphan-pages. *(test-planned: tests/integration/nav-audit.test.ts::no-404s-no-orphans)*
- AC2: GIVEN sidebar + topbar + footer + dashboard tile links, WHEN I traverse each via keyboard, THEN every link has a visible focus ring AND lands on the correct destination. *(test: extends existing axe + Playwright nav e2e suite)*
- AC3: GIVEN a deliberate 404 fixture (e.g. `/this-page-does-not-exist`), WHEN visited, THEN the 404 page renders the canonical Kalori 404 component (NOT a generic Next default). *(test-planned: tests/e2e/web/404.spec.ts::canonical-404-page)*

**Steps:**
1. **TDD RED:** Write `tests/integration/nav-audit.test.ts::no-404s-no-orphans` and `tests/e2e/web/404.spec.ts::canonical-404-page`. Verify RED.
2. Build `scripts/nav-audit.mjs`: static analysis — walks every `<Link>` / `<a>` in `app/**`, `components/**`; cross-references against route map; reports orphans + 404s.
3. Ensure `app/not-found.tsx` renders canonical Kalori 404 (Ledger styling).
4. Verify all GREEN. Cross-link to `verification-report.md` for functional button-level coverage (out-of-scope per design doc note).
5. Per-task Codex review via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/integration/nav-audit.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- B5 covers nav links + keyboard traversal + 404 only; functional coverage of route-level primary actions is owned by Phase A verification report.
- Acceptance Evidence tier: **Full** (UI Medium per Q10 D4) — `acceptance-evidence/task-B.5.md`.

---

### Task B.6: US-STAB-B6 — Settings stub copy removed (patch-shaped per DT-1)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [UI][FA][brownfield]
**Files:**
- `lib/i18n/en.ts` (delete `t.settings.stubBody` and `t.settings.stubHeading` at lines 769-770)
- `app/(app)/settings/page.tsx` (verify single h1 from i18n, remove stub copy reference)
- `tests/unit/settings/page.test.tsx` (NEW or extend)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B6, DT-1)
- ui-design.md (Settings page)
- `lib/i18n/en.ts` (settings keys)
**Goal:** Remove obsolete "Settings arrive with Task 2.2" copy at `lib/i18n/en.ts:769-770`; page already renders real components.
**User Story:** US-STAB-B6
**Acceptance Criteria:**
- AC1: GIVEN I am logged in AND I navigate to `/settings`, WHEN the page renders, THEN the string "Settings arrive with Task 2.2" does NOT appear in the DOM. *(test: tests/unit/settings/page.test.tsx::no-stub-body-copy)*
- AC2: GIVEN the same page, WHEN it renders, THEN the page has exactly one `<h1>` element with text "Settings" sourced from `lib/i18n/en.ts::settings.heading`, AND the stub copy at `lib/i18n/en.ts:769-770` (currently "Settings arrive with Task 2.2...") is deleted from the i18n bundle. *(test: tests/unit/settings/page.test.tsx::single-h1-from-i18n-and-stub-deleted)*
- AC3: GIVEN the page, WHEN ReduceMotionToggle / DataSubsection / AccountSubsection render, THEN all three components remain mounted and functional (no regression). *(test: tests/unit/settings/page.test.tsx::renders-real-settings-components)*

**Steps:**
1. **TDD RED:** Write `::no-stub-body-copy` and `::single-h1-from-i18n-and-stub-deleted`. Verify RED.
2. Delete `t.settings.stubBody` and `t.settings.stubHeading` from `lib/i18n/en.ts:769-770`.
3. Update `app/(app)/settings/page.tsx` to drop stub-copy block; ensure `<h1>` reads from `t.settings.heading`.
4. Verify all GREEN; existing components still render.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Patch-shaped per DT-1: real Settings components already render; only stub copy needs deletion.

---

### Task B.E2E: User Story E2E — Phase B (US-STAB-B1..B6 bundled)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [e2e][user-story-e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-B-bundled.spec.ts` (NEW — covers B1..B6 click-through)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-B1..B6)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md (E2E click-through mandate)
**Goal:** End-to-end Playwright spec covering Phase B user stories US-STAB-B1..B6 (**bundled by design — 6 single-file UI patches share dashboard-area flows, single spec is auditable and efficient per Step 6.4a guidance**). Functional click-through verifying B1 root redirect + B2 form clear + B3 sidebar header + B4 weight quick-add + B5 nav links + B6 settings copy delete.

**Steps:**
1. Single Playwright spec walks: log in → root → /dashboard (B1) → library new-item form clears (B2) → sidebar Navigation non-interactive (B3) → progress weight quick-add + router.refresh (B4) → nav audit walk (B5) → settings page no stub copy (B6).
2. Every interactive surface clicked/typed/inspected per E2E Click-Through Mandate.

---

### Task B.SWEEP: Phase B Testing Sweep
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing]
**Reads:**
- tasks.md (Sprint Phase B tasks: B.1 through B.6, B.E2E)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md
**Goal:** Run full applicable test suite for Phase B; audit acceptance evidence; block phase on any failure.

**Steps:**
1. Vitest full suite.
2. Playwright full suite including new B.1/B.4/B.5 specs and B.E2E bundled spec.
3. axe sweep (UI phase).
4. Per-task acceptance-evidence audit: B.1–B.6 all have `acceptance-evidence/task-<id>.md` (Lean for non-UI Small; Full for UI Medium B.4/B.5).
5. Cumulative regression of Phase A.

---

### Task B.CODEX: Codex Adversarial Review — Phase B
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** Phase-level
**Type tags:** [review]
**Reads:**
- tasks.md (Sprint Phase B tasks)
- ~/.claude/skills/brainstorm-tomi/codex-safety.md
**Goal:** Run Standard Codex Gate Sequence on all Phase B changes; auto-fix Critical/Improvement; 2-round cap.

**Steps:**
1. Pre-flight diff size check (split if >1MB).
2. Invoke `codex:rescue` with Phase B scope.
3. Categorize Critical / Improvement / Minor.
4. Auto-fix Critical + Improvement.
5. Surface Minor to user.
6. Round-cap: 2.
7. Log outcome in `progress.md`.

---

## Sprint Phase C — P1 Feature Completion

**Execution order (revised 2026-05-02):** C.4 → C.5 → C.6 → C.1 → C.2 → C.E2E.1 → C.E2E.2 → C.SWEEP → C.CODEX.

C.4 / C.5 / C.6 are verification-found P1 bug fixes (origin F-VERIFY-201 / 203 / 204 from `Planning/features/2026-05-01-mvp-stabilization/verification-report.md`) in pre-existing code (F4 Library, F5 Confirmation, F19 Food Detail). They run BEFORE C.1 (micros panel) and C.2 (Library CRUD UI) so the new feature work in C.1 / C.2 builds on stabilized surfaces — fixed grid → detail navigation (C.6), correct `food_library_items.log_count` / `last_used_at` maintenance across re-log + undo (C.4), and a Confirmation screen with the time-editor contract honored (C.5). Numbering preserved; execution order overrides ID order for Phase C.

### Task C.4: US-STAB-C4 — Library `log_count` / `last_used_at` bumped on re-log (and reversed on undo)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [database][API][backend][FA][brownfield]
**Files:**
- `app/api/entries/save/route.ts` (extend re-log branch — UPDATE `food_library_items` after INSERT; tombstone-tolerant, TOCTOU-safe)
- `app/api/entries/[id]/undo/route.ts` (extend undo path — reverse the bump; recompute `last_used_at` from remaining entries)
- `tests/integration/library-relog-bumps-counters.test.ts` (NEW)
- `tests/integration/library-undo-reverses-bump.test.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/verification-report.md (F-VERIFY-201, Owner Feature × AC: F4 AC5, P1, Phase B)
- PRD.md (§3.4 Library Log — frequency-sort contract; §3.11 Undo Toast 5s)
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C2 Library CRUD — sibling card)
- architecture.md (food_library_items schema + RLS + food_entries FK)
- `app/api/entries/save/route.ts` (current re-log branch — no UPDATE present)
- `lib/library/fetch.ts` (frequency-sort selector — orders by `last_used_at DESC NULLS LAST`)
**Goal:** Re-logging a library item must bump `food_library_items.log_count` and `last_used_at`, restoring the "frequency-sorted by default" Library tab contract; the F11 undo path must symmetrically reverse the bump so the counters never drift away from the true entry count.
**User Story:** US-STAB-C4
**User Stories:**
- US-STAB-C4:
  AS: a Library user re-logging a previously-saved item
  WHEN: I tap "log this again" (or undo a re-log within 5s)
  THEN: the library row's `log_count` + `last_used_at` are bumped on re-log AND reversed on undo, so my Library tab stays correctly frequency-sorted
  ACs covered: AC1, AC2, AC3, AC4, AC5
**Acceptance Criteria:**
- AC1: GIVEN a library item with `log_count = N` and `last_used_at = T0`, WHEN I re-log it via `POST /api/entries/save` with the linked `library_item_id`, THEN after the entry INSERT succeeds the corresponding `food_library_items` row has `log_count = N + 1` AND `last_used_at >= now() - 1 second`. *(test-planned: tests/integration/library-relog-bumps-counters.test.ts::bumps-on-relog)*
- AC2: GIVEN I just re-logged a library item AND I undo the entry within the 5s window via `POST /api/entries/[id]/undo`, WHEN the undo deletes the `food_entries` row, THEN the linked `food_library_items` row's `log_count` is decremented back AND `last_used_at` is recomputed from the remaining entries (or set to NULL if no entries remain). *(test-planned: tests/integration/library-undo-reverses-bump.test.ts::reverses-on-undo)*
- AC3: GIVEN a library item that was deleted between read and write (tombstone race per P-2 TOCTOU), WHEN the re-log handler attempts the UPDATE `food_library_items` after INSERT, THEN the UPDATE no-ops silently (`affected_rows = 0`) — no orphan-error returned to the client AND the entry INSERT is preserved. *(test-planned: tests/integration/library-relog-bumps-counters.test.ts::tombstone-tolerant-no-op)*
- AC4: GIVEN I am on `/library` and `lib/library/fetch.ts` orders by `last_used_at DESC NULLS LAST`, WHEN I re-log an item that was previously rotting at the bottom, THEN it moves to the top of the My Library frequency-sorted list on next render. *(test-planned: tests/integration/library-relog-bumps-counters.test.ts::frequency-sort-restored)*
- AC5: GIVEN the existing 32-assertion RLS harness runs after this change, WHEN cross-user re-log attempts run, THEN every assertion passes (no user can bump another user's `food_library_items.log_count` / `last_used_at`). *(test: existing RLS 32-assertion harness)*

**Steps:**
1. **TDD RED:** Write `::bumps-on-relog`, `::reverses-on-undo`, `::tombstone-tolerant-no-op`, `::frequency-sort-restored`. Verify RED.
2. Extend `app/api/entries/save/route.ts` re-log branch: after INSERT into `food_entries`, run `UPDATE food_library_items SET log_count = log_count + 1, last_used_at = now() WHERE id = $1 AND user_id = auth.uid()` — TOCTOU-safe via `WHERE` predicate; no-op if tombstoned.
3. Extend `app/api/entries/[id]/undo/route.ts`: before the existing entry DELETE, capture the linked `library_item_id`; after DELETE, decrement `log_count` and recompute `last_used_at` from `MAX(logged_at) FROM food_entries WHERE library_item_id = $1` (NULL if none).
4. Verify all GREEN.
5. Run RLS 32-assertion harness — must stay GREEN.
6. Per-task Codex review via `codex:rescue`.
7. Acceptance evidence: `acceptance-evidence/task-C.4.md` Standard tier (Medium + database/API).

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: true
  characterization-tests: tests/integration/library-relog-bumps-counters.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Origin: F-VERIFY-201 (Severity P1) from `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` — Owner Feature × AC: F4 AC5.
- TOCTOU + tombstone semantics per P-2 (verify FK at update time; no-op silently rather than orphan-error).
- Symmetric undo un-bump is mandatory — without it, repeated re-log/undo cycles drift the counters away from the real entry count.

---

### Task C.5: US-STAB-C5 — Confirmation screen Time editor + 30-day backfill
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [UI][backend][API][FA][brownfield]
**Files:**
- `app/(app)/log/_components/ConfirmationScreen.tsx` (refactor — replace inline `logged_at: new Date().toISOString()` with form-state value driven by new `Confirmation.TimeEditor` child)
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx` (NEW — compound API child; defaults to `now()`; allows backfill up to 30 days)
- `app/api/entries/save/route.ts` (extend Zod schema — refinement rejecting `logged_at < now() - 30 days`)
- `tests/unit/log/confirmation-time-editor.test.tsx` (NEW)
- `tests/integration/entries-save-30day-window.test.ts` (NEW)
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/verification-report.md (F-VERIFY-203, Owner Feature × AC: F5 AC4, P1, Phase B)
- PRD.md (§3.5 Confirmation Screen — "Time editor (defaults to now; backfill up to 30 days)" contract)
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C5 — Ledger token invariants for time-picker UI; sibling C.1/C.2)
- ui-design.md (Confirmation screen tokens + time-picker pattern + Ledger zero-radius/hairline rules)
- architecture.md (food_entries.logged_at column + future-skew guard)
- `app/(app)/log/_components/ConfirmationScreen.tsx:373` (`logged_at` hardcoded inline at save())
- `app/api/entries/save/route.ts:102-106` (no past-date guard — server only blocks future-skew)
**Goal:** Add `Confirmation.TimeEditor` child component to the public compound API so users can backfill meals up to 30 days; enforce the 30-day window with a Zod refinement on the save route so the client and server agree on the contract from PRD §3.5.
**User Story:** US-STAB-C5
**User Stories:**
- US-STAB-C5:
  AS: a user logging a meal retroactively (e.g. forgot lunch yesterday)
  WHEN: I open the Confirmation screen and adjust the time
  THEN: I can pick any timestamp from the last 30 days (default `now()`); the server accepts it and rejects anything older than 30 days
  ACs covered: AC1, AC2, AC3, AC4, AC5
**Acceptance Criteria:**
- AC1: GIVEN the Confirmation screen renders with the new `Confirmation.TimeEditor` child, WHEN I open it without changing anything, THEN `logged_at` defaults to `now()` (within 1 second tolerance) AND the picker is visible as a child of the Confirmation compound API. *(test-planned: tests/unit/log/confirmation-time-editor.test.tsx::default-now-and-renders)*
- AC2: GIVEN the time editor is open, WHEN I select a timestamp 5 days in the past AND save, THEN `food_entries.logged_at` is persisted with that value (NOT `now()`). *(test-planned: tests/e2e/web/user-stories/US-STAB-C5.spec.ts::backfill-5-days-persisted)*
- AC3: GIVEN I attempt to save an entry with `logged_at = now() - 31 days`, WHEN the request hits `POST /api/entries/save`, THEN the Zod refinement rejects it with a 400 response AND the entry is NOT inserted. *(test-planned: tests/integration/entries-save-30day-window.test.ts::rejects-31-days-past)*
- AC4: GIVEN the boundary case `logged_at = now() - exactly 30 days`, WHEN the request hits the save route, THEN it is accepted AND inserted (the window is inclusive at 30 days). *(test-planned: tests/integration/entries-save-30day-window.test.ts::accepts-exactly-30-days)*
- AC5: GIVEN the time-editor UI renders, WHEN it is inspected against `ui-design.md` Ledger tokens, THEN it uses zero-radius + hairline rules + ivory/oxblood palette (no shadows, no rounded corners — design-doc invariant). *(test-planned: tests/unit/log/confirmation-time-editor.test.tsx::ledger-tokens-applied)*

**Steps:**
1. **TDD RED:** Write `::default-now-and-renders`, `::backfill-5-days-persisted`, `::rejects-31-days-past`, `::accepts-exactly-30-days`, `::ledger-tokens-applied`. Verify RED.
2. Build `Confirmation.TimeEditor` child component — defaults to `now()`; controlled via form state; Ledger tokens.
3. Refactor `ConfirmationScreen.tsx:373` — replace hardcoded `logged_at: new Date().toISOString()` with form-state value driven by the new child.
4. Extend Zod schema in `app/api/entries/save/route.ts` — `.refine(d => d.logged_at >= now() - 30d, { message: 'logged_at must be within last 30 days' })`. Keep the existing future-skew guard.
5. Verify all GREEN.
6. Per-task Codex review via `codex:rescue`.
7. Acceptance evidence: `acceptance-evidence/task-C.5.md` Full tier (Medium + UI per Q10 D4).

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: true
  characterization-tests: tests/integration/entries-save-30day-window.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Origin: F-VERIFY-203 (Severity P1) from `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` — Owner Feature × AC: F5 AC4.
- Compound API: `Confirmation.TimeEditor` is exported as a child on the existing Confirmation compound (mirrors the C.2 detail-modal pattern).
- 30-day window is the contract from PRD §3.5; both client UI and server Zod refinement enforce it.

---

### Task C.6: US-STAB-C6 — Library grid → detail page navigation wired
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase (Phase C `C.CODEX`)
**Type tags:** [UI][FA][brownfield]
**Files:**
- `app/(app)/library/_components/LibraryClient.tsx` (replace `onActivate` no-op at lines 225-227 with `useRouter().push(\`/library/${id}\`)` — or equivalent `<Link>` wrapping)
- `app/(app)/library/_components/LibraryCard.tsx` (add `href` passthrough OR ensure Enter/Space key handler routes via the new activation path)
- `tests/integration/library-grid-navigation.test.tsx` (NEW)
- `tests/e2e/web/user-stories/US-STAB-C6.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/verification-report.md (F-VERIFY-204, Owner Feature × AC: F19 AC1, P1, Phase B)
- PRD.md (§3.4 Library Log — F19 Food Detail + Log-Now from detail; F19 AC4 cross-impact)
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C2 — sibling Library CRUD card; detail-page surface already wired)
- ui-design.md (Library grid + card activation + keyboard nav contract)
- `app/(app)/library/_components/LibraryClient.tsx:225-227` (current empty no-op)
- `app/(app)/library/_components/LibraryCard.tsx:66-69` (no href passthrough today)
**Goal:** Replace the `onActivate` no-op in the Library grid with a router push to `/library/[id]` so the canonical UX flow can reach the detail page (the detail surface already exists for direct URL navigation; this restores the click-through). Borderline P0 reclassified P1 because the back-end + detail surface are wired and the fix is one line.
**User Story:** US-STAB-C6
**User Stories:**
- US-STAB-C6:
  AS: a Library page user
  WHEN: I click (or keyboard-activate) a library card in the grid
  THEN: I am navigated to `/library/[id]` where the existing Food Detail surface renders
  ACs covered: AC1, AC2, AC3
**Acceptance Criteria:**
- AC1: GIVEN I am on `/library` AND a library item with id `X` is rendered in the grid, WHEN I click the card, THEN the router navigates to `/library/X` AND the existing Food Detail page renders. *(test-planned: tests/e2e/web/user-stories/US-STAB-C6.spec.ts::click-card-navigates-to-detail)*
- AC2: GIVEN keyboard-only navigation, WHEN I focus a library card AND press Enter OR Space, THEN the same `/library/[id]` navigation occurs (parity with the click path; required by the grid's activation contract — items must be activatable by keyboard, not mouse only). *(test-planned: tests/integration/library-grid-navigation.test.tsx::keyboard-enter-and-space-activate)*
- AC3: GIVEN the activation path is wired, WHEN F19-AC4 (Log-Now from detail) is exercised after navigation, THEN it remains functional — i.e. the C.6 fix does NOT regress the detail-page Log-Now affordance. *(test-planned: tests/e2e/web/user-stories/US-STAB-C6.spec.ts::log-now-from-detail-still-works)*

**Steps:**
1. **TDD RED:** Write `::click-card-navigates-to-detail`, `::keyboard-enter-and-space-activate`, `::log-now-from-detail-still-works`. Verify RED.
2. Replace the `useCallback(() => { /* no-op */ }, [])` in `LibraryClient.tsx:225-227` with `useRouter().push(\`/library/${id}\`)` (or wrap the card in `<Link href>`).
3. Ensure `LibraryCard.tsx` propagates Enter/Space key activation into the same path (role="button" + onKeyDown handler, or native `<a>` element).
4. Verify all GREEN.
5. Phase-level Codex via `C.CODEX` (no per-task Codex required for Small).
6. Acceptance evidence: `acceptance-evidence/task-C.6.md` Standard tier (Small + UI).

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/integration/library-grid-navigation.test.tsx

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Origin: F-VERIFY-204 (Severity P1) from `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` — Owner Feature × AC: F19 AC1.
- One-line fix per the bug's Suggested fix; the detail page already exists and works for direct URL navigation. Cross-impact: F19-AC4 (Log-Now from detail) becomes reachable from the canonical UX flow once this lands.

---

### Task C.1: US-STAB-C1 — Micros + RDA on AI prompt and dashboard
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Complex
**Codex review:** Per-task (required)
**Type tags:** [UI][backend][integration][FA]
**Files:**
- `lib/nutrition/micros-rda.ts` (NEW — `DEFAULT_MICROS_LIST` constant, ~30 entries)
- `lib/ai/prompt-builder.ts` (extend AI prompt for `micros` field)
- `lib/ai/zod-schema.ts` (extend Zod schema for `micros` field)
- `app/(app)/dashboard/_components/micros-panel.tsx` (NEW)
- `lib/dashboard/micros-rda-resolver.ts` (NEW)
- `tests/unit/ai/micros-extraction.test.ts` (NEW)
- `tests/integration/dashboard-micros-panel.test.tsx` (NEW)
- `tests/unit/dashboard/micros-rda-resolver.test.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C1, DT-5, DT-8, O-2)
- PRD.md (F2 Text Log + F3 Photo Log + F6 Dashboard)
- architecture.md (AI prompt structure + profiles + dashboard component)
- ui-design.md (Macros panel pattern + empty-state)
**Goal:** Extend Gemini AI prompt to extract `micros` field (~30 micronutrients per `DEFAULT_MICROS_LIST`); render dashboard "Micros" panel with `% of RDA` chips reading from code constants (per-user override DEFERRED per DT-5).
**User Story:** US-STAB-C1
**User Stories:**
- US-STAB-C1:
  AS: a user logging food via text or photo
  WHEN: AI extracts nutrition AND dashboard renders today's entries
  THEN: micros field present in response; Micros panel shows % of RDA per micronutrient
  ACs covered: AC1, AC2, AC3, AC4, AC5
**Acceptance Criteria:**
- AC1: GIVEN the Gemini AI prompt for `F2 Text Log` and `F3 Photo Log`, WHEN it returns, THEN the response contains a `micros` field with exactly the micronutrients listed in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (the canonical sprint-time micronutrient set, ~30 entries derived from FDA + WHO baseline: Vit A/B/C/D/E/K, Folate, B12, Niacin, Riboflavin, Thiamin, Pantothenic, Biotin, Iron, Calcium, Magnesium, Zinc, Selenium, Iodine, Potassium, Phosphorus, Copper, Manganese, Chromium, Molybdenum, Sodium, Chloride, Choline, plus Vit B6 — descriptive context only; the constant is the single source of truth). *(test-planned: tests/unit/ai/micros-extraction.test.ts::all-30-micros-present-in-response)*
- AC2: GIVEN the existing `tests/fixtures/ai-accuracy/critical.ts` 30-fixture suite, WHEN the AI prompt change ships, THEN the suite still passes 30/30 (no regression — Lesson #5 invariant). *(test: existing tests/unit/ai/vn-smoke.test.ts + critical.ts)*
- AC3: GIVEN the dashboard renders, WHEN today's entries are aggregated, THEN a "Micros" panel renders below the existing Macros panel showing each micronutrient in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` as a `% of RDA` chip with the corresponding code constant from `DEFAULT_MICROS_LIST` as the denominator (per-user RDA override DEFERRED per DT-5 / O-2). *(test-planned: tests/integration/dashboard-micros-panel.test.tsx::renders-thirty-micros-with-pct-rda)*
- AC4: GIVEN the dashboard reads RDA values from `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` code constants (per-user `profiles.micros_rda_override` column DEFERRED per DT-5 / O-2 — see `F-MICROS-RDA-OVERRIDE-COLUMN`), WHEN the dashboard computes `% of RDA`, THEN the default code constant is used for every micronutrient. *(test-planned: tests/unit/dashboard/micros-rda-resolver.test.ts::reads-default-constants)*
- AC5: GIVEN the RDA panel renders, WHEN the values are 0/null (sparse data), THEN the panel renders the empty-state described in `ui-design.md` (NOT a chart with 0% for all 30 micros). *(test-planned: tests/integration/dashboard-micros-panel.test.tsx::sparse-data-empty-state)*

**Steps:**
1. **TDD RED:** Write `::all-30-micros-present-in-response` first; verify RED.
2. Define `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` constant: ~30 entries, each `{ code, name, rda }` per FDA + WHO baseline.
3. Pre-flight: re-run `tests/fixtures/ai-accuracy/critical.ts` BEFORE prompt change; record baseline (must be 30/30).
4. Extend AI prompt in `lib/ai/prompt-builder.ts` to request `micros` field; extend Zod schema.
5. Re-run critical.ts — must still be 30/30 (invariant). If a fixture breaks, reframe prompt OR add additive regression fixture.
6. Verify `::all-30-micros-present-in-response` GREEN.
7. Build `MicrosPanel` component using existing Macros panel pattern; render `% of RDA` chip per micronutrient.
8. Build `lib/dashboard/micros-rda-resolver.ts` reading from `DEFAULT_MICROS_LIST` (per-user override DEFERRED per DT-5).
9. Add `::renders-thirty-micros-with-pct-rda`, `::reads-default-constants`, `::sparse-data-empty-state`.
10. Verify all GREEN. Per-task Codex via `codex:rescue`.
11. Acceptance evidence: `acceptance-evidence/task-C.1.md` Full tier (Complex + UI).

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract, AI Contract]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/unit/ai/micros-extraction.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- AI accuracy invariant (Lesson #5): 30/30 fixture pass rate MUST hold before AND after prompt change.
- Per-user RDA override DEFERRED per DT-5 / O-2; tracked as `F-MICROS-RDA-OVERRIDE-COLUMN`.

---

### Task C.2: US-STAB-C2 — Library CRUD UI
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Complex
**Codex review:** Per-task (required)
**Type tags:** [UI][backend][API][database][FA][brownfield]
**Files:**
- `app/(app)/library/page.tsx` (refactor — add 2 sections: "My Library" + "Recent Entries")
- `app/(app)/library/_components/library-detail-modal.tsx` (NEW — Edit modal)
- `app/(app)/library/_components/library-row-actions.tsx` (NEW — Edit/Delete/LogNow)
- `app/api/library/[id]/route.ts` (NEW — PUT/DELETE)
- `app/api/library/[id]/log-now/route.ts` (NEW — POST creates food_entries row)
- `tests/integration/library-crud.test.ts` (NEW)
- `tests/e2e/web/user-stories/US-STAB-C2.spec.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C2, P-1 Log-Now snapshot)
- PRD.md (F4 Library Log + F19 Food Detail + Edit + Log-Now)
- architecture.md (food_library_items + food_entries + RLS)
- ui-design.md (Library page list + detail)
**Goal:** Full Library CRUD UI: list (My Library + Recent Entries) / Edit modal / Delete confirm / Log-Now creates food_entries row. Atomic snapshot at click-time for Log-Now (P-1 race mitigation).
**User Story:** US-STAB-C2
**User Stories:**
- US-STAB-C2:
  AS: a Library page user
  WHEN: I view, edit, delete, or re-log my library items
  THEN: full CRUD operates on food_library_items + food_entries with RLS preserved
  ACs covered: AC1, AC2, AC3, AC4, AC5
**Acceptance Criteria:**
- AC1: GIVEN I am on `/library`, WHEN it renders, THEN I see two sections: "My Library" (`food_library_items`) AND "Recent Entries" (`food_entries`). *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::two-sections-visible)*
- AC2: GIVEN a library item, WHEN I click "Edit", THEN a detail/edit modal opens with all fields populated AND I can save changes via a single CTA. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::edit-modal-saves)*
- AC3: GIVEN a library item, WHEN I click "Delete" AND confirm, THEN the row is removed from the list AND from `food_library_items`. *(test-planned: tests/integration/library-crud.test.ts::delete-removes-row)*
- AC4: GIVEN a library item, WHEN I click "Log Now", THEN a new `food_entries` row is created for today AND I see it in the entries list. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::log-now-creates-entry)*
- AC5: GIVEN any CRUD action runs, WHEN the existing 32-assertion RLS harness runs after the migration, THEN every assertion passes (cross-user isolation preserved). *(test: existing RLS harness)*

**Steps:**
1. **TDD RED:** Write `::two-sections-visible`, `::edit-modal-saves`, `::delete-removes-row`, `::log-now-creates-entry`. Verify RED.
2. Refactor `app/(app)/library/page.tsx` to render two sections.
3. Build `LibraryDetailModal` (Edit) + row actions (Edit/Delete/Log-Now).
4. Implement API routes: `PUT /api/library/[id]`, `DELETE /api/library/[id]`, `POST /api/library/[id]/log-now`. All accept `client_id` (I11) and route through interceptor (R1).
5. Log-Now handler: read snapshot atomically at click-time (P-1 mitigation — NOT from cached list view).
6. Verify all GREEN.
7. Run RLS 32-assertion harness — must stay GREEN.
8. Per-task Codex via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: true
  characterization-tests: tests/integration/library-crud.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Log-Now P-1 race mitigation: snapshot read atomically at click-time; documented in per-task Codex.
- I11 idempotency: all mutation routes accept `client_id`. R1 firewall: all client fetches via interceptor.
- Acceptance Evidence tier: **Full** (Complex + UI per Q10 D4) — `acceptance-evidence/task-C.2.md`.

---

### Phase C Notes — Post-Verification Task Minting

Phase C task slots beyond C.1 and C.2 (e.g., C.3, C.4...) will be minted POST-PHASE-A based on `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` output. Newly minted Phase C tasks follow standard task-schema.md format with concrete Complexity / Codex review / Type tags / Files / Acceptance Criteria fields. Empty placeholder cards are NOT pre-minted (per Codex Round 2 N-C2 schema-compliance fix).

Triage rule per Task A.VERIFY AC3: a P0/P1 verification-found feature-shaped gap mints a `US-STAB-C3..C?` story with full ACs + test-planned markers + Folder metadata (or `US-STAB-B?` / `US-STAB-D?` per Recommended Phase). Patch-shaped findings route to Phase B; hardening-shaped findings route to Phase D. If no feature-shaped P0/P1 gaps surface, Phase C ships with C.1 + C.2 only.

---

### Task C.E2E.1: User Story E2E — US-STAB-C1 (micros/RDA)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [e2e][user-story-e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-C1.spec.ts` (NEW — micros/RDA dashboard panel E2E)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C1)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md (E2E click-through mandate)
**Goal:** Functional click-through E2E for US-STAB-C1: text-log a meal → micros panel renders below macros → % of RDA chips visible → empty-state on sparse data.

**Steps:**
1. Single Playwright spec walks: log in → text-log meal → wait for AI → dashboard → assert micros panel below macros panel → assert ≥1 % of RDA chip → empty-state path.
2. Every interactive surface clicked/typed/inspected.

---

### Task C.E2E.2: User Story E2E — US-STAB-C2 (library CRUD)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [e2e][user-story-e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts` (NEW — library CRUD E2E)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-C2)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md (E2E click-through mandate)
**Goal:** Functional click-through E2E for US-STAB-C2: list → Edit → Save → Delete → Confirm → Log-Now → entry appears.

**Steps:**
1. Single Playwright spec walks: log in → /library → assert two sections → click Edit on item → save → click Delete → confirm → click Log Now → assert food_entries row visible.
2. Every interactive surface clicked/typed/inspected.

---

### Task C.SWEEP: Phase C Testing Sweep
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing]
**Reads:**
- tasks.md (Sprint Phase C tasks: C.1, C.2, post-verification-minted C.3..C.? if any, C.E2E.1, C.E2E.2)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md
**Goal:** Run full applicable test suite for Phase C; audit acceptance evidence; block phase on any failure.

**Steps:**
1. Vitest full suite.
2. Playwright full suite including new C.1/C.2 specs and C.E2E.1/C.E2E.2 user-story specs.
3. AI accuracy fixture suite — must remain 30/30 (Lesson #5 invariant).
4. RLS 32-assertion harness GREEN (touched by C.2).
5. Per-task acceptance-evidence audit: C.1 + C.2 have Full-tier `acceptance-evidence/task-<id>.md`.
6. Cumulative regression of Phases A + B.

---

### Task C.CODEX: Codex Adversarial Review — Phase C
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** Phase-level
**Type tags:** [review]
**Reads:**
- tasks.md (Sprint Phase C tasks)
- ~/.claude/skills/brainstorm-tomi/codex-safety.md
**Goal:** Run Standard Codex Gate Sequence on all Phase C changes; auto-fix Critical/Improvement; 2-round cap.

**Steps:**
1. Pre-flight diff size check (split if >1MB).
2. Invoke `codex:rescue` with Phase C scope.
3. Categorize Critical / Improvement / Minor.
4. Auto-fix Critical + Improvement.
5. Surface Minor.
6. Round-cap: 2.

---

## Sprint Phase D — Hardening

### Task D.1: US-STAB-D1 — Dashboard a11y violations resolved
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [UI][testing][FA][brownfield]
**Files:**
- `app/(app)/dashboard/_components/*.tsx` (focus ring + aria-labels on charts/gauges)
- `tests/integration/dashboard-a11y.test.tsx` (NEW)
- `tests/e2e/web/dashboard-a11y.spec.ts` (NEW)
- `tests/visual/dashboard-focus-ring.test.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D1)
- ui-design.md (focus ring + dashboard a11y)
- testing-strategy.md (axe sweep)
- architecture.md (dashboard component)
**Goal:** Resolve all axe-core dashboard violations; ivory 2px focus ring; aria-labels on all charts/gauges.
**User Story:** US-STAB-D1
**Acceptance Criteria:**
- AC1: GIVEN the dashboard is rendered, WHEN axe-core runs against it, THEN zero violations are reported across the page. *(test-planned: tests/integration/dashboard-a11y.test.tsx::axe-zero-violations + tests/e2e/web/dashboard-a11y.spec.ts::axe-zero-violations)*
- AC2: GIVEN every interactive element on the dashboard, WHEN traversed via Tab, THEN focus rings render with the IVORY 2px outline + 2px offset (NOT oxblood — per design-doc §FocusRing). *(test-planned: tests/visual/dashboard-focus-ring.test.ts::ivory-focus-ring)*
- AC3: GIVEN a screen reader reads the dashboard, WHEN any chart/gauge renders, THEN it has a textual alternative (aria-label or sibling visually-hidden text). *(test-planned: tests/integration/dashboard-a11y.test.tsx::charts-have-aria-labels)*

**Steps:**
1. **TDD RED:** Write `::axe-zero-violations`, `::ivory-focus-ring`, `::charts-have-aria-labels`. Verify RED.
2. Run axe-core against current dashboard; collect violation list.
3. Fix focus ring (ivory 2px + 2px offset per design-doc §FocusRing).
4. Add aria-labels to all charts/gauges (or sibling visually-hidden text).
5. Verify all GREEN.
6. Per-task Codex review via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/integration/dashboard-a11y.test.tsx

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Acceptance Evidence tier: **Full** (UI Medium per Q10 D4) — `acceptance-evidence/task-D.1.md`.

---

### Task D.2: US-STAB-D2 — API 401 returned as JSON, never HTML redirect
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [backend][API][FA][brownfield]
**Files:**
- `middleware.ts` (or auth gate — return JSON 401 for /api/* paths)
- `lib/auth/api-401-response.ts` (NEW — canonical 401 builder)
- `tests/integration/api-401-shape.test.ts` (NEW)
- `lib/auth/refresh-interceptor.ts` (extend or verify it handles new 401 shape)
- `public/sw.js` (verify SW does NOT cache 401 — P-4 mitigation)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D2, §10 P-4 SW caching)
- architecture.md (auth middleware + API route conventions)
- `lib/auth/refresh-interceptor.ts` (existing)
**Goal:** Unauthenticated API calls to `/api/*` return JSON 401 with canonical body and `WWW-Authenticate: Bearer realm="kalori"`; NO HTML, NO Location header. Service worker skips caching 401s.
**User Story:** US-STAB-D2
**User Stories:**
- US-STAB-D2:
  AS: a SPA fetch consumer or PWA service worker
  WHEN: an unauthenticated call hits any /api/* endpoint
  THEN: response is JSON 401 (not HTML redirect), interceptor handles cleanly, SW skips cache
  ACs covered: AC1, AC2, AC3
**Acceptance Criteria:**
- AC1: GIVEN an unauthenticated fetch to any `/api/*` endpoint, WHEN the request runs, THEN the response is a 401 with `Content-Type: application/json` AND a body of `{ "error": "unauthenticated" }`. *(test-planned: tests/integration/api-401-shape.test.ts::api-returns-json-401)*
- AC2: GIVEN the same request, WHEN the response is inspected, THEN there is NO `Location:` header AND NO HTML body. *(test-planned: tests/integration/api-401-shape.test.ts::no-location-header)*
- AC3: GIVEN the refresh interceptor (`lib/auth/refresh-interceptor.ts`), WHEN it sees a 401 with the new shape, THEN it triggers a session refresh (R1 invariant preserved). *(test: existing refresh-interceptor.test.ts extended)*

**Steps:**
1. **TDD RED:** Write `::api-returns-json-401`, `::no-location-header`. Verify RED.
2. Update middleware (or auth gate) to detect `/api/*` path and return JSON 401 instead of HTML redirect.
3. Build `lib/auth/api-401-response.ts` canonical builder.
4. Extend `lib/auth/refresh-interceptor.ts` test to cover new 401 shape; verify R1 invariant preserved.
5. Audit `public/sw.js` to ensure SW does NOT cache 401 responses (P-4 mitigation); add SW fetch-handler test.
6. Verify all GREEN. Per-task Codex via `codex:rescue`.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract]
  brownfield-phase: 4
  public-api: true
  characterization-tests: tests/integration/api-401-shape.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- P-4 mitigation: SW skip-on-401 fetch-handler test required.

---

### Task D.3: US-STAB-D3 — F10 modal honest-copy verify + i18n + handler-binding guard
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [UI][testing][FA][brownfield]
**Files:**
- `components/pwa/GoalWeightConflictModal.tsx` (verify only — no impl change)
- `lib/i18n/en.ts` (audit — no deprecated copy)
- `tests/unit/i18n/en.test.ts` (NEW — deprecated-copy guard)
- `tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx` (NEW)
- Followup status update: `Planning/followups.md::F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` note "D3 honest-copy-only scope-down verified in this sprint; full client-wins-resubmit impl remains DEFERRED to post-MVP cleanup."
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D3, DT-2, DT-10, U-4)
- `components/pwa/GoalWeightConflictModal.tsx` (existing)
- `lib/offline/conflict-resolver.ts` (existing)
- `lib/i18n/en.ts` (conflict keys)
**Goal:** Verify the F10 modal's honest copy + ESC-cancel contract holds (already shipped in Phase 5.1.5 Codex F2/F3); add i18n regression guard (AC3) and handler-binding regression guard (AC4); log followup as deferred.
**User Story:** US-STAB-D3
**Acceptance Criteria:**
- AC1: GIVEN the modal renders, WHEN I read both buttons, THEN one says "USE CURRENT VALUE" (which calls `actions.resolveConflict(client_id, 'use-current')`) AND the other says "CANCEL" (which closes the modal non-destructively). *(test: existing tests/unit/pwa/GoalWeightConflictModal.test.tsx — already passes per current code)*
- AC2: GIVEN the modal is open, WHEN I press ESC, THEN the modal closes AND `dismissedIds` records the `client_id` AND no `actions.resolveConflict` is called. *(test: existing test — already passes per current code)*
- AC3: GIVEN any future net-new conflict-related copy in `lib/i18n/en.ts`, WHEN it lands in this story, THEN it never includes the deprecated "USE OFFLINE VALUE" string OR any other label that does not match its handler. *(test-planned: tests/unit/i18n/en.test.ts::no-deprecated-conflict-copy)*
- AC4: Click handler binding regression guard — Cancel and primary CTA buttons each have distinct `onClick` handlers verified by integration test asserting they call different functions (no shared/swapped handler). Specifically: clicking Cancel invokes `handleCancel` (NOT `handleUseCurrent`), and clicking "USE CURRENT VALUE" invokes `handleUseCurrent` (NOT `handleCancel`). *(test-planned: tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx::label-handler-bound-correctly-and-distinct)*

**Steps:**
1. **TDD RED:** Write `::no-deprecated-conflict-copy` and `::label-handler-bound-correctly-and-distinct`. Verify RED.
2. Run AC1 + AC2 existing tests; confirm GREEN (no impl change needed).
3. Add `tests/unit/i18n/en.test.ts::no-deprecated-conflict-copy` — fails on string "USE OFFLINE VALUE" or any label/handler mismatch.
4. Add `tests/unit/pwa/GoalWeightConflictModal.handler-binding.test.tsx::label-handler-bound-correctly-and-distinct` — fails if Cancel/UseCurrent handlers swapped or shared.
5. Update `Planning/followups.md::F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` note text to reflect D3 honest-copy-only scope-down + deferred full impl.
6. Verify all GREEN.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC3 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Verification-only story per DT-2; no impl change to modal.
- Full client-wins-resubmit deferred under EXISTING followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT`; do NOT mint duplicate `-IMPL` ID.

---

### Task D.4: US-STAB-D4 — Schema-drift CI guard
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [testing][infrastructure][FA]
**Files:**
- `.github/workflows/schema-drift-check.yml` (NEW)
- `scripts/schema-drift-check.mjs` (NEW)
- `tests/integration/schema-drift/check-fixtures-and-app-code.test.ts` (NEW)
- `tests/integration/schema-drift/generated-types-fresh.test.ts` (NEW)
- `lib/database.types.ts` (regeneration target — kept in repo)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D4, FF #G stage 1/2 split, O-1)
- architecture.md (DDL)
- testing-strategy.md (mock fixture conventions)
**Goal:** CI guard auditing test fixtures + lib/** + app/api/** column references against live Supabase schema. Stage 1 report-only for 1 day; stage 2 block. Generated types kept fresh.
**User Story:** US-STAB-D4
**User Stories:**
- US-STAB-D4:
  AS: a Kalori test author
  WHEN: a CI workflow runs against HEAD
  THEN: schema-drift between fixtures/app-code and live schema is detected and surfaced
  ACs covered: AC1, AC2, AC3, AC4
**Acceptance Criteria:**
- AC1: GIVEN a CI workflow `schema-drift-check.yml`, WHEN it runs against HEAD, THEN it audits BOTH test fixtures (under `tests/**`) AND application code paths in `lib/**` and `app/api/**` that use `.from('<table>').select(...)` or `.insert({...})` (or any other Supabase client builder that names columns); the guard parses literal table/column references and compares them against the actual live schema via either Supabase generated types OR live DB introspection in CI. *(test-planned: tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::audits-both-fixtures-and-app-code)*
- AC2: GIVEN a fixture OR a `lib/**` / `app/api/**` file that references a column not in the live schema, WHEN the guard runs, THEN it reports the drift in CI annotations AND fails the workflow (after 1-day report-only mode per FF #G mitigation). *(test-planned: tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::fails-on-drift-in-fixtures-or-app-code)*
- AC3: GIVEN the guard runs in PR mode, WHEN a PR adds a fixture OR app-code reference, THEN the new reference is included in the audit AND any drift in IT alone fails the PR. *(test: workflow integration — manual PR fixture + app-code drift cases added to test branch)*
- AC4: GIVEN Supabase generated types (`supabase gen types typescript`), WHEN any migration applies to dev, THEN the generated types are regenerated (in the migration's same task or a follow-up CI job) AND committed to the repo at a canonical path (e.g., `lib/database.types.ts`); CI fails if generated types are stale relative to applied migrations (drift between `supabase/migrations/*.sql` last-modified timestamp vs the types file's last-regen marker). *(test-planned: tests/integration/schema-drift/generated-types-fresh.test.ts::types-not-stale-vs-migrations)*

**Steps:**
1. **TDD RED:** Write all schema-drift tests. Verify RED.
2. Build `scripts/schema-drift-check.mjs`: AST parse, extract column refs, compare against generated types or live introspection.
3. Add workflow `.github/workflows/schema-drift-check.yml` — Stage 1 = report-only mode (annotation only).
4. Stage 2 cut-over after 1 day clean run: flip to block mode.
5. Add `lib/database.types.ts` regen job; add staleness test.
6. Verify all GREEN. Per-task Codex.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/integration/schema-drift/check-fixtures-and-app-code.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- Stage 1 report-only mode mandatory (FF #G mitigation) — prevents CI red wave.

---

### Task D.5: US-STAB-D5 — Node 24 GitHub Actions runtime migration
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Small
**Codex review:** Per-phase only
**Type tags:** [infrastructure][FA]
**Files:**
- `.github/workflows/*.yml` (bump `uses:` major versions for actions running javascript-actions)
- `tests/integration/ci/action-versions-support-node24.test.ts` (NEW)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D5, O-3)
- `.github/workflows/*.yml` (audit)
**Goal:** Bump every `uses:` major version that runs javascript-actions to a Node 24-compatible major (actions/checkout@v4+, actions/setup-node@v4+, pnpm/action-setup@v3+, actions/upload-artifact@v4+).
**User Story:** US-STAB-D5
**Acceptance Criteria:**
- AC1: GIVEN all GitHub Actions workflow `uses:` declarations across `.github/workflows/*.yml`, WHEN audited, THEN every action version supports the Node 24 javascript-action runtime — specifically `actions/checkout@v4+`, `actions/setup-node@v4+`, `pnpm/action-setup@v3+`, `actions/upload-artifact@v4+`; any action declaration on a major-version known to require Node 20 is flagged and bumped. *(test-planned: tests/integration/ci/action-versions-support-node24.test.ts::all-uses-on-node24-compatible-majors)*
- AC2: GIVEN the bumped workflows, WHEN run against HEAD, THEN every workflow passes successfully on the Node 24 action runtime — validated via either a test PR with the env flag `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` set on the runner OR after the action major-version bumps are merged AND a dry-run CI cycle reports GREEN (full matrix: Vitest, Playwright, axe, Lighthouse, lint, typecheck). *(manual: PR CI run after merge with explicit Node 24 force-flag verification)*
- AC3 (optional sub-task, NOT part of D5 minimum): App runtime Node version may be bumped to Node 22 (separate from action runtime) under a separate scoped task; this is opt-in and tracked as `F-DEP-NODE22-APP-RUNTIME` if not done in D5. The minimum D5 scope is action-runtime Node 24 readiness only. *(manual: scope decision recorded in `migration-plan.md` Phase D section)*

**Steps:**
1. **TDD RED:** Write `::all-uses-on-node24-compatible-majors`. Verify RED.
2. Audit every `.github/workflows/*.yml`; list every `uses:` declaration.
3. Skip ceremonial bumps (workflows that don't run javascript-actions per O-3).
4. Bump majors that need Node 24 (actions/checkout@v4+, etc.).
5. Dry-run CI under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` flag; verify full matrix GREEN.
6. Verify test GREEN.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours]
  brownfield-phase: 1
  public-api: false
  characterization-tests: []

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- O-3 mitigation: skip ceremonial bumps for workflows without javascript-actions.

---

### Task D.6: US-STAB-D6 — F-LIB-DEDUP partial unique index migration 0018
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [database][backend][testing][FA][brownfield]
**Files:**
- `supabase/migrations/0018_food_library_items_dedup_partial_unique.sql` (NEW)
- `scripts/dedup-pre-flight.mjs` (NEW)
- `tests/integration/db/0018-migration.test.ts` (NEW)
- `tests/integration/db/0018-pre-cleanup.test.ts` (NEW)
- `tests/integration/library-create.test.ts` (extend with dedup + soft-delete-reinsert cases)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D6, §7 Migration 0018, §10 P-3 VN diacritics, FF #C, C2 + N-C1 fixes)
- features/2026-05-01-mvp-stabilization/migration-plan.md
- architecture.md (food_library_items DDL + RLS)
**Goal:** Add partial unique index on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`. Single-transaction cleanup with `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`, executed via SECURITY DEFINER.
**User Story:** US-STAB-D6
**User Stories:**
- US-STAB-D6:
  AS: a Kalori operator
  WHEN: migration 0018 applies
  THEN: partial unique index exists, dupes deduplicated transactionally, soft-deleted rows can re-insert
  ACs covered: AC1, AC2, AC3, AC4, AC5, AC6, AC7
**Acceptance Criteria:**
- AC1: GIVEN migration `0018_food_library_items_dedup_partial_unique.sql`, WHEN applied to kalori-dev, THEN a partial unique index exists on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` (using `normalized_name` if present in the schema; otherwise `lower(unaccent(name))`). *(test-planned: tests/integration/db/0018-migration.test.ts::index-exists-with-soft-delete-predicate)*
- AC2: GIVEN a duplicate active-row insert (same user, same `normalized_name`, both with `deleted_at IS NULL`), WHEN attempted, THEN it fails with a 23505 unique violation. *(test-planned: tests/integration/library-create.test.ts::dedup-blocks-duplicate-active-insert)*
- AC3: GIVEN existing duplicates exist on dev pre-migration (FF #C), WHEN the migration's pre-cleanup transaction runs, THEN within ONE transaction it (a) identifies dupes by `(user_id, normalized_name) WHERE deleted_at IS NULL`, (b) keeps the most-recently-`updated_at` row per group, (c) soft-deletes the rest, (d) ASSERTs zero remaining active dupes, (e) creates the partial unique index. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::transactional-dedup-then-index AND manual migration runbook in `migration-plan.md`)*
- AC4: GIVEN soft-deleted duplicates exist after the cleanup pass (or any post-migration soft-delete), WHEN the same `(user_id, normalized_name)` is re-inserted as a NEW active row (`deleted_at IS NULL`), THEN the insert SUCCEEDS — soft-deleted rows DO NOT block re-insert (active-row uniqueness only, partial-index predicate enforces this). *(test-planned: tests/integration/library-create.test.ts::soft-deleted-does-not-block-reinsert)*
- AC5: GIVEN any CRUD action runs after the migration applies, WHEN the existing 32-assertion RLS harness runs, THEN every assertion still passes (cross-user isolation preserved by partial-index addition). *(test: existing RLS harness)*
- AC6: GIVEN the migration runs, WHEN the SQL is inspected, THEN cleanup AND index creation execute inside a SINGLE transaction that begins with `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE` and ends with `COMMIT`; the lock is held continuously from cleanup through index creation so a concurrent insert cannot create a new duplicate between the post-cleanup assert and the `CREATE UNIQUE INDEX`. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::single-transaction-with-access-exclusive-lock)*
- AC7: GIVEN the migration script, WHEN run, THEN it executes under `SECURITY DEFINER` via the service-role key (per `scripts/apply-prod-migrations.mjs` execution context) — required because cross-`user_id` soft-deletes during cleanup would be blocked by RLS under `auth.uid() = user_id`. Runtime RLS for `food_library_items` is unchanged after the migration. *(test-planned: tests/integration/db/0018-pre-cleanup.test.ts::executes-as-service-role-and-rls-unchanged)*

**Steps:**
1. **TDD RED:** Write all 0018 tests. Verify RED.
2. Build `scripts/dedup-pre-flight.mjs` (lists existing dupes; halts on dupe — FF #C mitigation; ICU-collation aware per P-3).
3. Author `supabase/migrations/0018_food_library_items_dedup_partial_unique.sql`:
   - `BEGIN;`
   - `LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE;`
   - Identify dupes; keep most-recently-`updated_at`; soft-delete rest.
   - ASSERT zero active dupes.
   - `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;`
   - `COMMIT;`
4. Apply to kalori-dev via `DATABASE_URL_DIRECT` (port 5432) or Supabase CLI as service-role.
5. Verify all 7 ACs GREEN. RLS harness GREEN.
6. Per-task Codex via `codex:rescue` reviews migration SQL + cleanup logic.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Public API Contract, Migration Contract]
  brownfield-phase: 4
  public-api: false
  characterization-tests: tests/integration/db/0018-pre-cleanup.test.ts

**Notes:**
- TDD: write a failing test for AC1 first, verify RED for the right reason, write minimal code to GREEN, refactor.
- ACCESS EXCLUSIVE lock held continuously through cleanup AND index creation (race-safety contract per N-C1).
- SECURITY DEFINER required for cross-user_id soft-deletes during cleanup (per N-I1).
- Prod cutover deferred to Phase E per Q7=A; do NOT apply to kalori-prod in D6.

---

### Task D.E2E: User Story E2E — Phase D (D1 axe + D2 + D6 backend integration)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [e2e][user-story-e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-D-bundled.spec.ts` (NEW — D1 dashboard axe + D2 API 401 contract + D6 dedup migration smoke)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-D1/D2/D6)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md (E2E click-through mandate)
**Goal:** End-to-end Playwright spec covering Phase D user stories US-STAB-D1, D2, D6 (**bundled by design — D1 a11y / D2 auth API 401 / D6 library dedup share post-login flow; D3/D4/D5 verified via integration/unit/CI not E2E per Step 6.4a guidance**). Bundled E2E covers: D1 (dashboard axe via @axe-core/playwright), D2 (API 401 JSON contract assertion via real fetch), D6 (post-migration library dedup smoke).

**Steps:**
1. Single Playwright spec walks: log in → dashboard → axe-core via @axe-core/playwright zero violations → unauth fetch /api/dashboard/aggregate → assert JSON 401 + no Location header → library create dupe → assert 23505.
2. Every interactive surface clicked/typed/inspected.

---

### Task D.SWEEP: Phase D Testing Sweep
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing]
**Reads:**
- tasks.md (Sprint Phase D tasks: D.1 through D.6, D.E2E)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md
**Goal:** Run full applicable test suite for Phase D; audit acceptance evidence; block phase on any failure.

**Steps:**
1. Vitest full suite.
2. Playwright full suite including D.E2E bundled spec.
3. axe sweep — Phase D dashboard a11y must pass.
4. Lighthouse mobile ≥0.91 every category.
5. RLS 32-assertion harness GREEN (post-0018).
6. Schema-drift check stage 1 GREEN.
7. Per-task acceptance-evidence audit: D.1, D.2, D.4, D.6 (Medium UI [D.1] = Full; non-UI Medium [D.2, D.4] = Lean; D.6 migration = Full).
8. Cumulative regression of Phases A + B + C.

---

### Task D.CODEX: Codex Adversarial Review — Phase D
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** Phase-level
**Type tags:** [review]
**Reads:**
- tasks.md (Sprint Phase D tasks)
- ~/.claude/skills/brainstorm-tomi/codex-safety.md
**Goal:** Run Standard Codex Gate Sequence on all Phase D changes; auto-fix Critical/Improvement; 2-round cap. Split into per-bundle passes (D-Audit, D-Contracts, D-Offline, D-Infra) if diff >1MB (Lesson #3 / FF #F).

**Steps:**
1. Pre-flight diff size check (split per bundle if >1MB).
2. Invoke `codex:rescue` with appropriate scope (single pass OR 4 per-bundle passes).
3. Categorize Critical / Improvement / Minor.
4. Auto-fix Critical + Improvement.
5. Surface Minor.
6. Round-cap: 2.

---

## Sprint Phase E — Closure

### Task E.1: US-STAB-E1 — Phase E manual smoke + prod migration cutover + sprint close
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** Medium
**Codex review:** Per-task (required)
**Type tags:** [review][infrastructure][FA]
**Files:**
- `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-issuelog-recheck.md` (NEW)
- `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-prod-migration.md` (NEW)
- `Planning/features/2026-05-01-mvp-stabilization/manifest.md` (Status flip → COMPLETE)
- `Planning/features/2026-05-01-mvp-stabilization/brainstorm-state.md` (state → complete)
- `Planning/followups.md` (mark 9 in-scope as RESOLVED, 67 as DEFERRED-soft-launch)
- `Planning/progress.md` (Sprint Phase E close + Phase 5 close)
- `bugs/issuelog.txt` (annotate each entry with post-fix commit hash)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 US-STAB-E1, §13 Closure Criteria)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- features/2026-05-01-mvp-stabilization/verification-report.md
- bugs/issuelog.txt
- scripts/apply-prod-migrations.mjs
**Goal:** Run Phase E manual smoke (re-check 11 issuelog entries with post-fix evidence), apply migration 0018 to kalori-prod, flip sprint to COMPLETE, close project Phase 5.
**User Story:** US-STAB-E1
**User Stories:**
- US-STAB-E1:
  AS: a sprint orchestrator
  WHEN: Phase E runs
  THEN: every issuelog entry has post-fix evidence; 0018 applied to prod; FINAL-US passes; sprint state = complete
  ACs covered: AC1, AC2, AC3
**Acceptance Criteria:**
- AC1: GIVEN the 11 issuelog entries, WHEN Phase E runs, THEN each entry has post-fix screenshot evidence AND a diff vs the verification-report.md pre-fix evidence. *(manual: `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-issuelog-recheck.md`)*
- AC2: GIVEN sprint-introduced migration 0018 (0019 deferred per DT-5; no 0020), WHEN `scripts/apply-prod-migrations.mjs` runs against kalori-prod, THEN 0018 applies successfully AND the migration table reflects it AND the partial unique index exists with `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` predicate. *(manual: `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-prod-migration.md`)*
- AC3: GIVEN the FINAL-US task runs, WHEN every sprint user story E2E runs against the final build, THEN they all pass (2 fix rounds capped). *(test: full sprint E2E suite under `tests/e2e/web/user-stories/US-STAB-*.spec.ts`)*

**Steps:**
1. **BEFORE other closure work — pre-cutover full test suite gate:** Run full applicable test suite as final pre-cutover verification — `pnpm test`, `pnpm test:e2e`, `pnpm test:axe`, `pnpm test:lh`, `pnpm test:visual`. All must be GREEN before proceeding to manual smoke. (Redundant with the post-cutover E.SWEEP card by design — E.1 verifies pre-cutover state on the final dev build; E.SWEEP verifies post-cutover state at the phase boundary.)
2. Re-verify all 11 issuelog entries against the live HEAD; capture post-fix screenshot per entry; diff against `verification-report.md` pre-fix evidence; write `acceptance-evidence/phase-E-issuelog-recheck.md`.
3. Pre-flight: `apply-prod-migrations.mjs` schema diff between dev + prod (P-5 mitigation). Halt if drift exists; resolve manually.
4. Run `scripts/apply-prod-migrations.mjs` against kalori-prod — applies 0018 ONLY (0019 deferred per DT-5).
5. Verify post-cutover schema: partial unique index exists in `pg_indexes` with `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` predicate.
6. Smoke against prod (read-only, RLS-bound, anon role expected denials).
7. Update `Planning/followups.md`: mark 9 in-scope as RESOLVED-2026-05-XX, 67 as DEFERRED-soft-launch.
8. Update `bugs/issuelog.txt`: annotate each of the 11 entries with the post-fix commit hash.
9. Flip `manifest.md` Status → COMPLETE; flip `brainstorm-state.md` state → complete, `Current Position: complete`.
10. Update `Planning/progress.md`: Sprint Phase E close + Project Phase 5 close (per Q2=A — sprint Phase E closes parent project Phase 5.4 + Phase 5).
11. Per-task Codex via `codex:rescue` reviews paperwork artifacts.
12. After E.1 completes, the next mandatory cards (E.SWEEP → FINAL-US → E.CODEX) close the project.

FA:
  folder: Planning/features/2026-05-01-mvp-stabilization
  impact-analysis-sections: [Preserved Behaviours, Migration Contract]
  brownfield-phase: 5
  public-api: false
  characterization-tests: scripts/apply-prod-migrations.mjs

**Notes:**
- TDD: AC3 (FINAL-US) acts as the failing-tests-must-pass gate; AC1 + AC2 are manual paperwork ACs.
- Prod cutover applies migration 0018 ONLY (0019 deferred per DT-5).
- P-5 mitigation: `apply-prod-migrations.mjs` schema-diff pre-flight halts if prod drift exists.
- After E.1 completes, the next mandatory cards (E.SWEEP → FINAL-US → E.CODEX) close the project. E.1 Step 1 is the pre-cutover suite-green gate; E.SWEEP is the post-cutover sweep.

---

### Task E.SWEEP: Phase E Testing Sweep (FINAL SHIPPABLE GATE)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [testing]
**Reads:**
- tasks.md (Sprint Phase E tasks: E.1, FINAL-US)
- features/2026-05-01-mvp-stabilization/testing-strategy.md
- testing-strategy.md
**Goal:** Run full applicable test suite for Phase E; audit acceptance evidence across the entire sprint; block sprint close on any failure.

**Steps:**
1. Vitest full suite.
2. Playwright full suite.
3. axe sweep across every UI route.
4. Lighthouse mobile ≥0.91 every category.
5. AI accuracy fixture suite — 30/30 unchanged.
6. RLS 32-assertion harness GREEN (post-prod 0018).
7. Per-task acceptance-evidence audit across A/B/C/D/E.
8. Cumulative regression of all prior phases.
9. Manual final smoke against prod build.

---

### Task FINAL-US: End-of-Project User Story Verification Pass
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** —
**Type tags:** [user-story-verification][e2e][testing]
**Files:**
- `tests/e2e/web/user-stories/US-STAB-*.spec.ts` (re-runs every sprint user-story E2E against finalized build)
**Reads:**
- features/2026-05-01-mvp-stabilization/design-doc.md (§4 Phase Deliverables & User Stories — all 20 stories)
- tasks.md (sprint US-STAB-* entries)
- testing-strategy.md
**Goal:** Execute every sprint user-story E2E against the finalized build; 2 fix rounds cap. Validates every US-STAB-A1..E1 ACs end-to-end.

**Steps:**
1. Run every spec under `tests/e2e/web/user-stories/US-STAB-*.spec.ts` against the finalized build (Phase E close build, post-prod 0018).
2. Categorize failures by story.
3. Auto-fix via opus sub-agent if any test fails (max 2 rounds per FF #J mitigation).
4. If a story has no real RED test (FF #J trigger), escalate to P0 micro-fix.
5. Log outcome in `progress.md`.

**Notes:**
- 20 stories × per-AC coverage.
- 2 rounds cap; if failures persist past round 2, escalate to user.
- Story-without-real-RED-test → P0 micro-fix per FF #J.

---

### Task E.CODEX: Codex Adversarial Review — Phase E (End-of-Project Codex)
**Folder:** Planning/features/2026-05-01-mvp-stabilization
**Complexity:** —
**Codex review:** Phase-level
**Type tags:** [review]
**Reads:**
- tasks.md (Sprint Phase E tasks: E.1, E.SWEEP, FINAL-US)
- ~/.claude/skills/brainstorm-tomi/codex-safety.md
**Goal:** Run Standard Codex Gate Sequence on all Phase E changes (paperwork + prod cutover) AND macro-level cross-cutting review (R1, I11, RLS invariants, fixture non-regression). Acts as the End-of-Project Codex review since this is the closure phase. 2-round cap.

**Steps:**
1. Pre-flight diff size check.
2. Invoke `codex:rescue` with Phase E scope (covers final E.1 paperwork + post-FINAL-US fix-up commits).
3. Categorize Critical / Improvement / Minor.
4. Auto-fix Critical + Improvement.
5. Surface Minor.
6. Round-cap: 2.
7. Log outcome in `progress.md`.

---

## End of `tasks.md`

> **Next steps (per `02-pre-plan.md`):**
> - **Step 6.5** — Codex adversarial review of this `tasks.md`
> - **Step 6.6** — Lessons write-back to `~/.claude/lessonlearned.md`
> - **Step 6.7** — Sequential creation of the remaining 6 Complex-tier artifacts in dependency order: `PRD.md` → `architecture.md` → `ui-design.md` → `testing-strategy.md` → `progress.md` → `CHANGELOG.md` (and finalization of this `tasks.md`)
