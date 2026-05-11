# Project Context — bugfix-tomi batch 2026-05-08-e2e-regressions

## Stack
- Language: TypeScript (strict) — `typescript ^5.7.2`
- Framework: Next.js 16 (`next ^16.2.4`)
- Test runner: Vitest `^4.1.4` (unit/integration; `--pool threads --maxWorkers 1`), Playwright `@playwright/test ^1.59.1` (E2E + visual + axe)
- Auth/DB: Supabase (`@supabase/ssr ^0.10.2`, `@supabase/supabase-js ^2.103.3`)
- Package manager: pnpm
- Test scripts: `test:e2e` → `playwright test`; `test:a11y` → `playwright test --project=chromium tests/axe`

## Project slug
kalori

## Recent work direction (last 10 commits)
- `71514c8` fix(visual): skip sidebar-identity at chromium-mobile viewport
- `d76f0f9` ci: fix vitest ECONNREFUSED + regen visual baselines for Phase B sidebar
- `1c7cc87` docs: B.SWEEP commit-hash backfill + continuation handoff
- `600eddf` task B.SWEEP: Phase B testing sweep close + 6 fix sub-agents
- `6807da7` [Minor] (app)/loading.tsx: instant-feel nav skeleton + changelog
- `202368f` [Minor] sidebar: serif Navigation title in tinted band with hairline
- `bfc3c34` docs: B.E2E commit-hash backfill + continuation handoff
- `8a7414f` task B.E2E: bundled user-story E2E for Phase B (US-STAB-B1..B6)
- `add1c0c` docs: B.6 commit-hash backfill + continuation handoff
- `44cf361` task B.6: settings stub copy delete + i18n heading (US-STAB-B6)

## Recent CHANGELOG themes
- **Phase B Testing Sweep (B.SWEEP, 600eddf):** orphan-profile fence contract changed `throw → redirect('/onboarding')` on transient errors; 30 vitest integration regressions auto-fixed via new `tests/_helpers/fence-mock.ts`; 5 pre-existing E2E regressions deferred to followups
- **B.E2E (8a7414f):** bundled US-STAB-B1..B6 spec landed; 13 PASS / 6 SCOPE-SKIP; surfaced F-B2-AC1-LISTENER-MOUNT-LIFECYCLE
- **Vitest ECONNREFUSED fix + visual baseline regen (d76f0f9, 71514c8):** localhost:3000 URLs in middleware test ruled out; sidebar-identity baseline skipped at chromium-mobile

## Bugs in this batch context
The 5 E2E specs failing have been failing for ≥1 week per B.SWEEP investigation. They were deferred via F-BSWEEP-E2E-* entries to followups.md. Now the user wants them fixed.

Pre-existing follow-ups relevant to these E2Es (from F-BSWEEP-E2E-* + earlier F-A3-LEGACY-PROFILE-LOOKUP-TESTS):
- F-BSWEEP-E2E-FORGED-COOKIE-REDIRECT (likely Phase A.3 regression, related to fence)
- F-BSWEEP-E2E-LIBRARY-BULK-DELETE-UNDO
- F-BSWEEP-E2E-ONBOARDING-COMPLETION (cross-ref F-A3-LEGACY-PROFILE-LOOKUP-TESTS — likely fence-related)
- F-BSWEEP-E2E-REDUCED-MOTION
- F-A3-LEGACY-PROFILE-LOOKUP-TESTS — older OG-contract throw vs new redirect contract for orphan profile fence

## Critical: Recent code changes that MAY affect these E2Es
- `lib/auth/orphan-profile-fence.ts:254-265` (commit 600eddf, B.SWEEP) — `requireProfileOrRedirect` changed from `throw ProfileLookupError` to `redirect('/onboarding')` on transient errors. This change is implicated for ANY E2E that:
  - Mocked / forged a profile lookup error and expected a thrown error
  - Tested onboarding flow and depended on specific redirect behavior
  - Tested auth flow with an orphan profile state
- `app/(app)/loading.tsx` (NEW, commit 6807da7) — route-group loading skeleton may interact with E2E selectors during nav transitions; specs that wait for specific landmarks immediately after `<Link>` click may need an explicit `aria-busy="false"` settle step
- `app/not-found.tsx` + `globals.css` (B.SWEEP) — 404 page restyled; reduced-motion E2Es using 404 fixtures may need baseline regen (see also `tests/screenshots/reduced-motion/*` showing as M in git status)

## R1 firewall (DO NOT TOUCH in any fix)
- lib/auth/refresh-interceptor.ts
- lib/auth/cross-tab-signout.ts
- lib/auth/authFetch.ts
- app/(app)/log/_components/ConfirmationScreen.tsx
