# Project Briefing: Kalori (calorie tracker webapp)

_Cached 2026-05-02 ~10:05 GMT+7 by `prime` skill — re-prime if stale > 2h._

## Architecture

- **Stack:** Next.js 16.2.4 (App Router, Turbopack, React Compiler v1) + React 19.2.5 + TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + Tailwind v4 (zero-config) + shadcn/Radix + Supabase (`@supabase/ssr` 0.10.2 cookie-bound) + Gemini `gemini-flash-latest` (custom REST client) + Vercel `iad1` + Sentry errors-only + Serwist PWA.
- **Route groups:** `app/(app)/` authed (dashboard, library, log, onboarding, progress, settings, weight) · `app/(auth)/login` · `app/(marketing)/` landing redirect-only · `app/api/**` route handlers · `app/auth/callback/` OAuth · `app/offline/` PWA fallback.
- **Supabase clients (3, by purpose):** `lib/supabase/server.ts` `getServerSupabase` for RSC + route handlers (cookie-bound) · `lib/supabase/client.ts` browser · `lib/supabase/admin.ts` service-role (lint-fenced from `app/**` via `kalori/no-admin-in-app`).
- **Auth invariants:** middleware = cheap cookie `getSession()`; pages MUST re-validate via `getUser()`. R1 contract: `lib/auth/refresh-interceptor.ts#authFetch` is the ONLY F12 401-refresh-retry channel; `lib/offline/**` lint-fenced from raw `fetch`. Recently added: `lib/auth/orphan-profile-fence.ts` (page 307 + API 401 + 503 transient).
- **Per-page:** `dynamic = 'force-dynamic'` + `runtime = 'nodejs'`; `cacheComponents` migration explicitly deferred — uses React `cache()` + `TAGS.*` invalidation.
- **Custom ESLint rules (4):** `no-gemini-leak`, `no-admin-in-app`, `no-inline-cache-tags`, `no-inline-user-strings`.

## Current Status

- **Brainstorm state:** root project Complex tier, `execution_in_progress`. Greenfield 26-task plan COMPLETE through Phase 5.3; **Active Feature Addition sprint** `mvp-stabilization` (Complex FA, brownfield-skip Q3=A) layered on top to close Task 5.4 + Phase 5 + soft-launch.
- **Sprint status:** Phase A 3 of 7 done — A.1 (library save cache invalidation, `97c0daa`), A.2 (sidebar identity, `9a25a75`), A.3 (orphan-profile fence, `f5ef9d0..0638e17`). Branch `main`, all pushed.
- **Next planned (paused for this session):** **A.VERIFY** — 6-agent parallel verification dispatch over PRD features × ACs producing `verification-report.md` (10-column matrix). P0/P1 verification-found bugs mint US-STAB-Cx stories.
- **Continuation file:** FRESH (last_written 2026-05-02 00:43, ~9.5h old < 24h) → fast-resume eligible.
- **Infra:** all configured (Supabase prod `dryysypycsexvlbabtwq` + dev `aaiohznsqlqchsoxaqkz` SG, Vercel `iad1` ~150–200ms cross-region RTT, Sentry, Google OAuth, GitHub Actions). Migrations 0001–0017 applied to BOTH envs. ⏳ `NEXT_PUBLIC_KALORI_ENV` pending.

## Recent Activity

- **Last 4 commits (2026-05-02):** A.3 orphan-profile fallback (page 307 + API 401 + TOCTOU-safe LEFT-JOIN-then-two-step) — initial impl + Codex Round 1 + Codex Round 2 + CHANGELOG/continuation backfill.
- **Earlier (2026-05-01):** A.2 sidebar identity, A.1 library save cache invalidation, MVP Stabilization sprint plan complete via brainstorm-tomi (35 tasks across phases A–E), CI redness fix bundle, production readiness audit (17 migrations to prod), Phase 5 Codex Round 1+2.
- **Hot zones:** `lib/auth/*` (3 new modules), `app/api/**/route.ts` (16 routes touched by A.3), `app/(app)/**/page.tsx` (6 page handlers), `tests/integration/**` heavy fence coverage, Planning state files churn.
- **Open Codex residuals (10):** 6 from A.3 (incl Critical `F-A1-PROD-RUNTIME-TRACE`), 1 from A.2, 3 from A.1.
- **Open AC deviations (user-decision):** AC1 wording 302→307 (Next 16 SC redirect default); AC5 wording "single LEFT JOIN" → two-step impl reality.

## Code Health

- **Tests:** Vitest 91 unit + 103 integration + 57 components + 7 RLS files; Playwright 26 E2E + 12 visual + axe + lighthouse. Coverage 70/75/75/75 v8 thresholds (branches AT-the-line at 70.85%).
- **TODOs:** 2 noted (`app/offline/retry-button.tsx:33`; `lib/auth/orphan-profile-fence.ts:44`). No FIXME/HACK/XXX markers.
- **Working tree:** 2 SW artifacts (`public/sw.js[.map]`) + 13 PNG screenshot baselines under `tests/screenshots/{reduced-motion,user-stories/US-5.2}/` regenerated; 7 untracked dirs (`bugs/`, `Planning/.prime/`, `supabase/.temp/`, `tests/_helpers/`, `tests/screenshots/audit-2026-{04-25,05-02}/`, `kalori-project-report.pdf`). Per continuation.md these predate A.* tasks — do NOT touch unless explicit cleanup.
- **Known bugs (`bugs/issuelog.txt`):** 11 user-reported manual-smoke bugs mapped to sprint US-STAB-A1..D6 (3 P0, 7 P1, 1 P2). Closed: #4 lib save (A.1), #1 root redirect, #9 sidebar identity (A.2). Remaining 8 await Phase B/C/D.
- **R1 firewall** active for all downstream tasks (no local refresh shims).

## Ready For

- **Current request: troubleshoot dashboard "add from library shows empty" bug.** Hot suspect zones: `app/(app)/library/page.tsx` (works) vs `app/(app)/dashboard/page.tsx` + dashboard add-from-library component vs `/api/library/[id]` and library list endpoints (recently fenced by A.3). May involve Supabase server vs browser client mismatch, missing fence/auth context, or a deletion-filter discrepancy. **This is likely Bug #5 or #10 from `bugs/issuelog.txt`** — confirm during troubleshoot.
- Verification dispatches (A.VERIFY) — paused
- Phase B/C/D unblocker tasks per sprint plan
- Codex residual cleanup
