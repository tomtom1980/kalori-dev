# Kalori — Infrastructure Setup State

> **Purpose:** Track the state of every external service / account / credential required for Kalori. Future Claude sessions read this file at startup to know what's configured vs what still needs setup.
>
> **Format:** Status (✅ configured / ⏳ in progress / ❌ not started) + key values + ownership + date.
>
> **Security note:** This file tracks configuration STATE, not secrets. Actual secret values live in `apikeys.txt` + `devapikeys.txt` (both gitignored). This file IS safe to commit and future-session-readable.

---

## Summary Table

| Service | Purpose | PROD | DEV | Blocker for |
|---|---|---|---|---|
| **Supabase** | Postgres + Auth + Storage | ✅ | ✅ | — |
| **Gemini** | AI (text parse + vision + weekly review) | ✅ | ✅ | — |
| **GitHub** | Code repo + Actions CI | ✅ | — (shared) | — |
| **Vercel** | Hosting + preview URLs + env var storage | ✅ | ✅ | — |
| **Sentry** | Error tracking (errors-only) | ✅ | ✅ | — |
| **Google OAuth** | "Sign in with Google" provider | ✅ | ✅ | — |
| **GitHub Actions secrets** | CI env for test runs | ✅ | N/A | — |

---

## 1. Supabase — ✅ Configured (both projects)

### Production (`kalori-prod`)
- **Project Ref:** `dryysypycsexvlbabtwq`
- **URL:** `https://dryysypycsexvlbabtwq.supabase.co`
- **Region:** `ap-southeast-1` (Singapore)
- **Publishable key:** stored in `apikeys.txt` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key:** stored in `apikeys.txt` as `SUPABASE_SECRET_KEY`
- **DB password:** stored in `apikeys.txt` as `SUPABASE_DB_PASSWORD`
- **Transaction pooler (6543):** stored as `DATABASE_URL`
- **Direct connection (5432):** stored as `DATABASE_URL_DIRECT`

### Development (`kalori-dev`)
- **Project Ref:** `aaiohznsqlqchsoxaqkz`
- **URL:** `https://aaiohznsqlqchsoxaqkz.supabase.co`
- **Region:** `ap-southeast-1` (Singapore)
- **Publishable key:** stored in `devapikeys.txt` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key:** stored in `devapikeys.txt` as `SUPABASE_SECRET_KEY`
- **DB password:** stored in `devapikeys.txt` as `SUPABASE_DB_PASSWORD`
- **Transaction pooler (6543):** stored as `DATABASE_URL`
- **Direct connection (5432):** stored as `DATABASE_URL_DIRECT`

### Supabase Management (shared)
- **PAT:** stored in both files as `SUPABASE_PAT`. Grants API access for project management + Auth config via Management API.

### Key format
Using **NEW format** (`sb_publishable_*` / `sb_secret_*`) per Supabase 2026 recommendation for fresh projects. Not legacy JWT-based `anon` + `service_role`.

### Migration application status (per-environment)
- [x] **`0001_init.sql` (extensions)** — applied to **kalori-dev** via Supabase Management API at Task 1.2 (commit `230032e`). NOT applied to kalori-prod yet.
- [x] **`0002_profiles.sql` (profiles + 4-verb RLS + auto-create trigger)** — applied to **kalori-dev** at Task 2.1 (commit `9731d2f`). NOT applied to kalori-prod yet.
- [x] **`0003_food_schema.sql` (7 new tables: food_entries, food_library_items, weight_log, water_log, weekly_reviews, ai_response_cache, ai_call_log + 20 user-facing RLS policies + service-role posture for the 2 ai tables + 7 indexes)** — applied to **kalori-dev** at Task 3.1, 2026-04-21, via Supabase Management API. NOT applied to kalori-prod yet. Migration was modified in-place during Codex R1 fix (`1fb8fe4`) to add `ai_response_cache_user_created_idx (user_id, created_at desc)` (A2); re-applied via drop-tables-then-recreate cycle (kalori-dev only).
- [x] **`0004_storage_buckets.sql` (`food-thumbnails` private Storage bucket + 4 verb-specific path-based RLS policies on `storage.objects`)** — applied to **kalori-dev** at Task 3.1, 2026-04-21, via Supabase Management API. NOT applied to kalori-prod yet. Migration was modified in-place during Codex R1 fix (`1fb8fe4`) to guard `split_part(name, '/', 1)::uuid` with strict `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` regex BEFORE the cast (A3); re-applied via drop-policies-then-recreate cycle (kalori-dev only; bucket retained — `storage.protect_delete()` trigger blocks direct bucket delete).
- [x] **`0005_ai_call_log_idempotency.sql` (adds `client_id uuid` column to `ai_call_log` + partial unique index `(user_id, client_id) WHERE client_id IS NOT NULL`)** — applied to **kalori-dev** at Task 3.7 Phase Testing Sweep, 2026-04-22, via Supabase Management API (`/v1/projects/{ref}/database/query`). NOT applied to kalori-prod yet. Verification: `ai_call_log.client_id uuid NULL` column + `ai_call_log_user_client_unique_idx` partial unique index both present. Integration tests (`tests/integration/ai-client-id-idempotency.test.ts`) now unblocked against kalori-dev.
- [x] **`0006_backfill_orphaned_profiles.sql` (idempotent backfill: INSERT missing `profiles` rows for any `auth.users` rows lacking a profile, using `handle_new_user`-trigger-equivalent defaults)** — applied to **kalori-dev** at troubleshoot session 2026-04-23, via session pooler (`aws-1-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.aaiohznsqlqchsoxaqkz`). **0 orphaned rows** found at apply time (INSERT 0 0); migration acts as a preventive safety net rather than remediating a current-cause. NOT applied to kalori-prod yet. Safe to reapply (idempotent — uses `WHERE NOT EXISTS` guard). Pairs with the route-handler self-heal in `/api/profile/save` (non-finalize branch) shipped in the same session.
- [x] **`0007_library_tombstone.sql` (adds `deleted_at timestamptz NULL` tombstone column to `food_library_items` + partial index `(user_id, deleted_at) WHERE deleted_at IS NULL` for live-row reads)** — applied to **kalori-dev** at Task 4.1 sub-step 1 (2026-04-23, commit `35b1619`), via Supabase Management API. NOT applied to kalori-prod yet. Enables the 5s undo window on library bulk-delete + lazy tombstone sweep on `/library` page load.
- [x] **`0008_library_merge_rpc.sql` (PL/pgSQL `SECURITY INVOKER` RPC `library_merge_duplicates(winner_id uuid, loser_id uuid)` with `pg_advisory_xact_lock` over `(user_id, least/greatest(winner_id, loser_id))` to serialize same-user merges; FK-repoints `food_entries.library_item_id` from loser→winner then hard-deletes loser row; raises `P0002` on row-not-found or RLS-hidden counterpart)** — applied to **kalori-dev** at Task 4.1 sub-step 2 (2026-04-23, commit `c013687`), via Supabase Management API. NOT applied to kalori-prod yet. `food_entries` confirmed as the only FK-referencing table via schema audit. Called by `/api/library/merge` route wrapped through the R1 refresh-interceptor.
- [x] **`0009_library_merge_self_guard.sql` (adds `IF winner_id = loser_id THEN RAISE EXCEPTION 'self-merge not allowed' USING ERRCODE = 'P0002'` guard at the top of `library_merge_duplicates` RPC body)** — applied to **kalori-dev** at Task 4.1 Codex R1 fix (2026-04-24, commit `976cc6f`), via Supabase Management API. NOT applied to kalori-prod yet. Closes the CF-1 self-merge data-loss path (loser === winner would hard-delete both entries atomically). Layer 3 of a 3-layer defense alongside Zod refine (client schema) + UI pre-submit check.
- [x] **`0010_weight_recalc_columns.sql` (additive columns on `profiles`: `recalc_threshold_pct numeric(4,3) DEFAULT 0.020 NOT NULL`, `last_target_recalc_at timestamptz`, `last_dashboard_visit_at timestamptz` — idempotent with 0002 dev state via `ADD COLUMN IF NOT EXISTS`)** — applied to **kalori-dev** at Task 4.3b (2026-04-24, commit `c0b49c8`), via Supabase Management API. NOT applied to kalori-prod yet. Powers the auto-recalc pipeline (`POST /api/weight/log` → Mifflin → TDEE → target update when delta ≥ threshold) and the `TargetUpdatedNudge` dashboard card.
- [x] **`0011_library_merge_hardening.sql` (renames the previously-staged 0010 follow-up: tombstone guard rejecting any `winner_id` or `loser_id` whose row has `deleted_at` IS NOT NULL; advisory lock keyed `(user_id_int, hashtext(min_pair || '|' || max_pair))` for true per-pair serialization; P0003 error mapping for tombstoned-row hits)** — applied to **kalori-dev** at Task 4.5 R2 (2026-04-25, commit `037aa14`), via Supabase Management API. NOT applied to kalori-prod yet. Filename was version-bumped from `0010_*` via `git mv` to resolve a deploy-blocker version collision with `0010_weight_recalc_columns.sql` (Codex R2 C1). RPC hardened state verified intact in kalori-dev via `pg_get_functiondef`.
- [x] **`0012_food_entries_manual_source.sql` (extends `food_entries.source` CHECK constraint to include `'manual'`: drops + re-adds `food_entries_source_check` with values `('text','photo','library','manual')`)** — applied to **kalori-dev** at Task 4.7.2 (2026-04-25), via Supabase Management API. NOT applied to kalori-prod yet. Constraint name `food_entries_source_check` verified intact post-apply. Unblocks the manual-entry fallback path through `<ManualEntryFallback>` (Task 3.3) so manual saves no longer fall back to `'text'`. Pairs with the dedup-check route's tombstone filter (`.is('deleted_at', null)`) shipped in the same task to prevent dedup hits against soft-deleted library rows.

### What's NOT done yet (handled during execution)
- [x] **Production migration cutover — DONE 2026-05-01.** All migrations `0001..0017` applied to **kalori-prod** via new `scripts/apply-prod-migrations.mjs` (commit `1ba09cd`) during the Production Readiness Audit. Production DB was previously empty (0 of 17 applied) and root cause of "logo on black" symptom report. Verified via Playwright on https://kalori-one.vercel.app.
- [ ] Auth redirect URL allowlist (Vercel URLs) — handled at Task 2.1 (already configured per Google OAuth setup; verify before prod cut)

### Operational notes — CLI-driven migrations on this network
- **Only the session pooler is reachable for CLI-driven migrations.** Host: `aws-1-ap-southeast-1.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`, password = the project DB password stored in `apikeys.txt` / `devapikeys.txt` as `SUPABASE_DB_PASSWORD`.
- **Direct host (`db.<ref>.supabase.co`) is IPv6-only on Hobby tier** and this network lacks IPv6 egress → any direct-connection attempt (port 5432 at `db.<ref>.supabase.co`) will fail name resolution or connect.
- **Transaction pooler (port 6543) is incompatible with the `psql` / `supabase` CLI prepared-statement path** — do NOT use 6543 for CLI migrations even though it works for runtime pooled connections from the Next.js server.
- **Use session pooler (port 5432 on the pooler host, not the direct host) for every future CLI-driven migration from this environment.** The Supabase Management API SQL endpoint (`POST /v1/projects/{ref}/database/query`) is an equally valid alternative that bypasses network constraints entirely.

---

## 2. Gemini — ✅ Configured

- **Provider:** Google AI Studio (https://aistudio.google.com/apikey)
- **Model pinned:** `gemini-flash-latest` (per blueprint §8 + architecture.md §16)
- **Key:** stored in BOTH `apikeys.txt` and `devapikeys.txt` as `GEMINI_API_KEY` + `GEMINI_TEST_API_KEY` (same key for MVP; split post-MVP if quota issue)

---

## 3. GitHub — ✅ Configured

- **Repo URL:** https://github.com/tomtom1980/kalori
- **Visibility:** Private
- **Owner:** `tomtom1980`
- **Default branch:** `main`
- **Pushed:** 2026-04-18 (18 planning commits)
- **Local git remote:** `origin` → `https://github.com/tomtom1980/kalori.git`
- **Branch strategy:** single repo; `main` → prod deploy; PR branches → preview deploys

### Local `gh` CLI auth (on user machine)
- Authed as `tomtom1980` via keyring (token scopes: `repo`, `workflow`, `read:org`, `gist`)
- Claude can execute `gh` commands autonomously in this directory

---

## 4. Vercel — ✅ Configured (2026-04-18)

### Project
- **Project ID:** `prj_MUe9UgXliFJzK6rjNusHcZjNJvQp`
- **Project Name:** `kalori`
- **Team ID:** `team_7xZlBcHpQM1CPDplsXJaBQLR`
- **Team Slug:** `tamasszalay-2846` (Hobby tier, personal)
- **GitHub Integration:** `tomtom1980/kalori` auto-linked
- **Production Branch:** `main` (auto-deploy on push)
- **PR Branches:** auto-preview deploys
- **Framework:** nextjs
- **Function Region:** `iad1` (US East — Hobby tier only offers this; cross-region latency to Supabase SG ~150-200ms/RTT; accepted for MVP)

### URLs
- **Production:** `https://kalori-one.vercel.app` (`-one` suffix because `kalori.vercel.app` was taken)
- **Preview URLs:** auto-generated per PR, pattern `https://kalori-<hash>-tamasszalay-2846.vercel.app`

### Env vars populated (20 total across 3 scopes)
**Production scope (10 vars):**
- GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, SUPABASE_REGION, DATABASE_URL, DATABASE_URL_DIRECT, KALORI_ENV=production

**Preview + Development scope (10 vars, same names, dev values):**
- Same list with dev Supabase values, KALORI_ENV=development

### Required for CI→Vercel gate (Option A — `vercel.json` `ignoreCommand`)
- **`GITHUB_CHECK_TOKEN`** — ✅ ACTIVE (2026-04-22). Set via Vercel REST API (env id `Hf79rrwMPZl0dsRv`, target `production`, type `encrypted`) from the user's local `gh` CLI token (scopes: `repo`, `workflow`, `read:org`, `gist`). Consumed by `scripts/vercel-ignore-red-ci.sh` to poll GitHub Check Runs API before a production build. Gate activates on next push to `main`. Without it the gate fails open (logs a warning, proceeds with build). Only `production` scope is required — previews are unaffected by the gate. Gate is active on branch `main` only.
  - **Tradeoff accepted:** `gh` CLI token is over-scoped for gate use (read-only `actions:read` + `contents:read` + `metadata:read` would suffice). Acceptable for solo-dev Hobby project per user decision.
  - **TODO (optional rotation):** Generate a fine-grained GitHub PAT scoped to `tomtom1980/kalori` only with read-only `Actions` + `Contents` + `Metadata` permissions, then PATCH the existing Vercel env entry id `Hf79rrwMPZl0dsRv` with the new token value via `PATCH https://api.vercel.com/v10/projects/prj_MUe9UgXliFJzK6rjNusHcZjNJvQp/env/Hf79rrwMPZl0dsRv?teamId=team_7xZlBcHpQM1CPDplsXJaBQLR`.

### Secret type assignment
- `NEXT_PUBLIC_*` vars → `plain` (baked into client bundle at build)
- All others → `encrypted` (server-only)

### Deployment Protection
- **SSO Protection: ENABLED** for all preview URLs by default (Hobby tier)
- Playwright E2E tests against preview URLs will require a bypass token
- Task 1.1 AC will configure `VERCEL_AUTOMATION_BYPASS_SECRET` for CI

### Not yet done (deferred to Task 1.1)
- [ ] Add Vercel production URL to Supabase Auth redirect allowlist (Claude autonomous via Management API)
- [ ] Configure Deployment Protection bypass token for CI
- [ ] First actual Next.js deploy (requires Task 1.1 scaffold)

### Claude autonomous operations available
- Update env vars: `POST/DELETE /v10/projects/{id}/env`
- Trigger deploys: `POST /v13/deployments`
- List deployments: `GET /v6/deployments`
- Manage domains: `GET/POST /v9/projects/{id}/domains`

Token + IDs stored in `apikeys.txt` under "Vercel (management / CI — shared across environments)" section.

---

## 5. Sentry — ✅ Configured (2026-04-18)

### Organization
- **Org slug:** `kalori`
- **Team slug:** `kalori` (default, single team)
- **Plan:** Developer (free tier after 14-day trial expires; trial active at setup)
- **Dashboard:** https://kalori.sentry.io

### Projects
- **`kalori-prod`** — platform `javascript-nextjs`
  - DSN: stored in `apikeys.txt` as `NEXT_PUBLIC_SENTRY_DSN`
  - Project ID: 4511247177351168
- **`kalori-dev`** — platform `javascript-nextjs`
  - DSN: stored in `devapikeys.txt` as `NEXT_PUBLIC_SENTRY_DSN`
  - Project ID: 4511247177482240

### Auth
- `SENTRY_AUTH_TOKEN` (personal token, prefix `sntryu_`) stored in both apikeys files
- Token scopes (rotated 2026-04-22): `event:admin`, `event:read`, `event:write`, `org:read`, `project:admin`, `project:read`, `project:write` — includes `event:admin` required for issue resolution via API
- Used by Claude for autonomous project management + release tagging + CI uploads + issue triage

### Vercel env vars populated
- Production scope: `NEXT_PUBLIC_SENTRY_DSN` = prod DSN
- Preview + Development scopes: `NEXT_PUBLIC_SENTRY_DSN` = dev DSN
- **`SENTRY_AUTH_TOKEN` — added to Vercel production+preview scopes on 2026-05-01** during Production Readiness Audit (was missing from build env, blocking sourcemap upload during prod deploys). Issue surfaced when audit confirmed prod build env did not have token; added via Vercel API.

### `NEXT_PUBLIC_KALORI_ENV` — ⏳ pending user action (added 2026-04-23 troubleshoot session 2)
- **What:** Public env var that drives the Sentry `environment:` tag on the client bundle. Server + edge configs also consult it first, falling back to `KALORI_ENV` → `NEXT_PUBLIC_VERCEL_ENV` → `VERCEL_ENV` → `'development'`.
- **Why needed:** Client bundle cannot read non-public env vars; before this fix the dev client defaulted to `process.env.NODE_ENV` resolution which Vercel sets to `'production'` even for dev deployments — polluting prod Sentry dashboards with dev events.
- **Required values per Vercel scope:**
  - Production → `NEXT_PUBLIC_KALORI_ENV=production`
  - Preview → `NEXT_PUBLIC_KALORI_ENV=preview`
  - Development → `NEXT_PUBLIC_KALORI_ENV=development`
- **Local:** `.env.example` has `NEXT_PUBLIC_KALORI_ENV=development`. User must mirror to `.env.local` for local dev to tag correctly.
- **Status:** NOT yet set in any Vercel scope; NOT yet set in `.env.local`. Sentry env tagging will remain incorrect in each environment until the user populates it there.
- **Related CHANGELOG:** `Planning/CHANGELOG.md` → "2026-04-23 — Troubleshoot: dashboard refresh + delete-toast honesty + onboarding hydration + Sentry env tag" (Fix 4).

### SDK scope (per design-doc §19 + blueprint §8)
- **Errors-only** — NO perf monitoring, NO session replay (MVP)
- `sampleRate: 1.0` errors; `tracesSampleRate: 0` performance
- PII scrubbing enabled (never send user emails or food-content in error messages)
- Release tagging: `NEXT_PUBLIC_SENTRY_RELEASE = VERCEL_GIT_COMMIT_SHA` (auto-injected by Vercel)

### Not yet done (deferred to Task 1.1)
- [ ] Install `@sentry/nextjs` SDK in Next.js scaffold
- [ ] Create `sentry.client.config.ts` + `sentry.server.config.ts` + `sentry.edge.config.ts`
- [ ] Wire `SENTRY_AUTH_TOKEN` into `next.config.js` sourcemap upload
- [ ] Verify error flows to both projects via test event

### Claude autonomous operations available
- Create/update projects: `POST /api/0/teams/{org}/{team}/projects/`
- Read DSNs: `GET /api/0/projects/{org}/{project}/keys/`
- Release tagging: `POST /api/0/organizations/{org}/releases/`
- Upload sourcemaps: via `@sentry/cli` or sentry-cli action in CI

---

## 6. Google Cloud OAuth 2.0 Client — ✅ Configured (2026-04-18)

### Google Cloud
- **Project name:** Kalori
- **OAuth consent screen:** Testing mode (External), user-type External
- **Scopes:** default (openid, email, profile — auto-included)
- **Test users:** `tamas.szalay@gmail.com`
- **OAuth Client:** `Kalori Web` (Web application type)
- **Authorized JavaScript origins:**
  - `https://dryysypycsexvlbabtwq.supabase.co`
  - `https://aaiohznsqlqchsoxaqkz.supabase.co`
  - `https://kalori-one.vercel.app`
- **Authorized redirect URIs:**
  - `https://dryysypycsexvlbabtwq.supabase.co/auth/v1/callback`
  - `https://aaiohznsqlqchsoxaqkz.supabase.co/auth/v1/callback`

### Credentials (shared between prod + dev environments)
- **Client ID:** stored in both apikeys.txt files as `GOOGLE_OAUTH_CLIENT_ID`
- **Client Secret:** stored in both files as `GOOGLE_OAUTH_CLIENT_SECRET`

### Supabase Auth config applied via Management API
Both projects configured with:
- `external_google_enabled: true`
- `external_google_client_id` + `external_google_secret`
- Site URLs + redirect allowlists:

**kalori-prod (production):**
- `site_url: https://kalori-one.vercel.app`
- `uri_allow_list: https://kalori-one.vercel.app, https://kalori-one.vercel.app/**`

**kalori-dev (dev + preview):**
- `site_url: http://localhost:3000`
- `uri_allow_list: http://localhost:3000/**, https://kalori-*-tamasszalay-2846.vercel.app/**, https://kalori-git-*-tamasszalay-2846.vercel.app/**`

### Vercel env vars populated
Google credentials pushed to all 3 scopes (Production + Preview + Development):
- `GOOGLE_OAUTH_CLIENT_ID` (encrypted)
- `GOOGLE_OAUTH_CLIENT_SECRET` (encrypted)

### Not yet done (app-level)
- [ ] UI for "Sign in with Google" button — **Task 2.1** (Supabase client handles the rest)

### Testing mode note
App is in Google's "Testing" mode — only test users (`tamas.szalay@gmail.com`) can sign in. For single-user MVP this is correct. Publish only if opening to other users.

---

## 7. GitHub Actions Secrets — ✅ Configured (2026-04-18)

Set via `gh secret set ... --repo tomtom1980/kalori` autonomously.

### Secrets set (6 total)
- `SUPABASE_TEST_URL` — dev Supabase URL
- `SUPABASE_TEST_ANON_KEY` — dev publishable key (sb_publishable_*)
- `SUPABASE_TEST_SERVICE_ROLE_KEY` — dev secret key (sb_secret_*)
- `GEMINI_TEST_API_KEY` — Gemini key (same as prod for MVP)
- `SENTRY_AUTH_TOKEN` — Sentry personal token (for sourcemap uploads in CI); **rotated 2026-04-22** with broader scopes (added `event:admin` + `project:admin`)
- `VERCEL_TOKEN` — Vercel management token (for any CI-driven deploys / env var sync)

### Optional secrets NOT set (add later if needed)
- `LHCI_GITHUB_APP_TOKEN` — Lighthouse CI advisory reports
- `PREVIEW_URL_OVERRIDE` — pin E2E to a specific preview URL

### Added during Production Readiness Audit (2026-05-01)
- **`VERCEL_AUTOMATION_BYPASS_SECRET`** — added to GitHub repo secrets so CI workflows (Lighthouse, E2E) can bypass Vercel SSO protection on preview URLs. Sourced from Vercel project deployment-protection bypass token configuration.

### F-TEST-4 real-user Playwright auth fixture (added 2026-04-23, Task 4.1 sub-step 0)
- **File:** `tests/e2e/fixtures/auth.ts` — exports `test` with an `authedPage` fixture
- **Approach:** per-test admin-created user + service-role profile patch + `signInWithPassword` + cookie write. Teardown deletes the auth.users row; `profiles` cascades via FK. Mirrors `tests/rls/_harness.ts` pattern.
- **Env vars consumed:** `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` + `SUPABASE_TEST_SERVICE_ROLE_KEY` (CI) OR `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` (local). All three already exist in GitHub Actions secrets — **no new secrets required.**
- **No `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` env vars** — the fixture generates a unique timestamped email per test + uses a built-in password constant (`KaloriE2ETest!2026`). Parallelism-safe; self-cleaning on crash.
- **Side effect:** Each fixture run creates + deletes one row in `kalori-dev` `auth.users` (+ cascade `profiles`). Bounded — worst case 1 orphan per killed test iteration.
- **Smoke spec:** `tests/e2e/fixtures-auth.spec.ts` verifies the fixture signs in a real user and `/dashboard` renders without redirect.
- **Playwright `globalSetup`:** `tests/e2e/fixtures/global-setup.ts` loads `.env.local` into `process.env` before any spec runs (parity with Vitest `tests/setup.ts`).

### Verification
`gh secret list --repo tomtom1980/kalori` confirms all 6 secrets present.

### CI YAML lands in Task 1.1
These secrets become active once `.github/workflows/ci.yml` exists (Task 1.1 AC). Until then they sit unused. Per testing-strategy.md §11 skeleton.

---

## 8. Visual Regression Baselines — ✅ Frozen + Rebaselined

- **2026-04-23 (Task 5.1.8 commit `daf34e5`):** 18 chromium baselines + 12 cross-browser (Firefox/WebKit) advisory baselines frozen on Linux Chromium via Docker `mcr.microsoft.com/playwright:v1.59.1-jammy`. Snapshot path template: `tests/visual/__screenshots__/visual/{spec}.spec.ts/{snapshot}-{projectName}.png`. `maxDiffPixelRatio: 0.001` for chromium projects, `0.005` for advisory cross-browser.
- **2026-04-30 (commit `c437ae0`):** Rebaselined 11 PNGs across 5 specs × 3 projects after sub-pixel anti-aliasing drift surfaced in CI run `25171798765` (ratios 0.01–0.04). Specs: `dashboard.spec.ts × {tablet, mobile}`, `library.spec.ts × {tablet, mobile}`, `log-confirmation.spec.ts × {chromium, tablet, mobile}`, `progress.spec.ts × {chromium, tablet, mobile}`, `weight.spec.ts × {mobile}`. Source: CI's `visual-report` artifact (`*-actual.png`) — local Docker on Windows host produced subtly different pixels than GitHub Actions Linux runner, so CI-actual screenshots were authoritative. Verified green in CI run `25176637514`.

**Lesson:** For visual rebaselining, prefer CI-actual screenshots from the failing run's `visual-report` artifact over local Docker re-capture. Local Docker (Windows host, Docker Desktop) diverges sub-pixel from GHA Linux runner even with identical Playwright Docker image. The 5.1.8 D3 pnpm-symlink workaround (scratch `/tmp/runner` + fresh `pnpm install --frozen-lockfile`, isolated `node_modules` and `.next` Docker volumes) DOES work for capture, but the captured pixels are platform-different.

---

## Setup Sequence (recommended order)

```
1. ✅ Supabase prod + dev     [done 2026-04-18]
2. ✅ Gemini API key          [done 2026-04-18]
3. ✅ GitHub repo             [done 2026-04-18]
4. ✅ Vercel project + token  [done 2026-04-18]
5. ✅ Sentry prod + dev       [done 2026-04-18]
6. ✅ Google OAuth credentials [done 2026-04-18]
7. ✅ GitHub Actions secrets  [done 2026-04-18]
```

**All 7 setup items done ✅ — 100% READY TO START TASKS.**

Say `start tasks` to begin Phase 1 Task 1.1.

---

## How to resume this context in a new session

In a fresh Claude session, say: **"prime the code"** or **"continue setup"**.

Claude will read:
1. `Planning/setup-state.md` (this file) — knows what's configured
2. `Planning/apikeys.txt` + `Planning/devapikeys.txt` — gets current credentials
3. `Planning/brainstorm-state.md` — knows brainstorm-tomi is `artifacts_complete`
4. `Planning/tasks.md` — knows which task to start (1.1 if nothing has executed yet)

Then resumes from wherever the last session left off.

---

## Update rules

- **Any time a service changes state** (created, deleted, token rotated): update the relevant section + Summary Table
- **Any time a credential is added to `apikeys.txt` / `devapikeys.txt`:** note it here by env var name (NOT the value)
- **Commit this file** with every state change so git history tracks setup progression
