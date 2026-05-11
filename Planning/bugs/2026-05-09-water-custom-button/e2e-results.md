# E2E + UI Testing — Batch 2026-05-09-water-custom-button

## Pre-discovery

- **Playwright config:** `playwright.config.ts` — testDir `./tests`, chromium project for E2E + axe (`tests/e2e/**/*.spec.ts`), 5 visual-regression projects (chromium baseline at 3 breakpoints + Firefox/Safari advisory), `globalSetup` hydrates `.env.local` so SUPABASE_TEST_* vars resolve. Web server `pnpm dev` auto-starts locally.
- **Existing water E2E:** `tests/e2e/nav-responsive.spec.ts:249` — authed water FAB on /library, uses `authedPage` fixture (real Supabase user against `kalori-dev`). No prior `dashboard*` or `water-edit*` spec.
- **Skip-gate state:** Most nav-responsive cases use `seedAuthSession()` forge — `test.skip`'d after C1-B server-side validation. The authed water-FAB block is the canonical real-browser regression net.
- **Migration prerequisite (CRITICAL):** Migration `0018_water_log_atomic_cap.sql` was NOT applied to dev when the phase started. The route now calls `supabase.rpc('log_water_with_cap', ...)`; an unmigrated DB returns 500. Confirmed broken: pre-apply the existing FAB E2E timed out (`waitForResponse` for status 200 never resolved). **Applied 0018 to kalori-dev** via `scripts/apply-migration-0018.mjs` (mirrors apply-0017 pattern, Management API `database/query`). status 201 — clean.

## Unit + integration sweep

- **Command:** `pnpm test` (vitest run, full suite, threads/maxWorkers=1)
- **Initial run:** 4 failed / 2047 passed of 2051 tests. Stash-based pre-batch baseline showed 1 of those 4 was pre-existing (`app-shell-provider-mount.test.tsx` — layout's `from('profiles')` call has no matching mock; predates this batch).
- **Regressions identified + fixed (2):** `tests/integration/dashboard-cache-tag.test.ts` and `tests/integration/water-log-refresh.test.ts` — both mocked `getServerSupabase` without an `rpc()` method. Added `rpc('log_water_with_cap', ...)` mocks mirroring fresh-insert success path.
- **Migration-prerequisite resolved:** `tests/integration/water-log-schema.test.ts` (real-PostgREST) failed pre-apply, passed post-apply.
- **Final integration tier:** 2 failed / 598 passed. Remaining 2 = the pre-existing app-shell mock gap + same gap is rerun in test 2 (single file). Bug-related sweep clean.
- **Batch unit tests:** 81/81 pass (water-log + WaterTracker + nav-shell).

## E2E that ran cleanly

- `tests/e2e/nav-responsive.spec.ts:249` (authed water FAB) — **passed** post-migration-apply (was timing-out pre-apply).
- `tests/e2e/water-edit-button.spec.ts` (NEW, 3 cases): 2/3 passed — Save POSTs ml delta + readout updates; Cancel closes without POST. 1 mobile case failed on wheel scroll-snap interaction.

## Visual regression

- No new screenshot baselines generated this phase. The 30+ modified screenshots in `git status` predate this batch (carry-over from prior batches' working tree). No intentional or unintentional diffs from this batch's changes.

## Wheel-scroll-event-in-E2E gap (Minor follow-up)

- **Symptom:** Mobile EDIT case (`water-edit-button.spec.ts:110`) cannot reach the DONE-enabled state because `MobileWheelPicker.onChange` fires only on `scroll` events when `scrollTop ≈ N * itemHeight`. Playwright's `option.click()` does not synthesize the momentum-based scroll-snap that real iOS/Chromium produce.
- **Coverage already in place:** `tests/unit/components/dashboard/WaterTracker.test.tsx` covers wheel onChange + onCommit + `hasUserInteracted` gate (Codex round 1 I2) — 10 mobile-branch tests.
- **Recommendation:** Accept the gap. Either (a) future spike on dispatching synthetic `scrollTop` mutations + `scroll` events directly via `page.evaluate()`, OR (b) keyboard fallback (`Tab` to wheel + `ArrowDown` + `Enter`) — wheel exposes Enter→onCommit at line 254. (b) is the cleaner path since it exercises the same a11y surface unit tests pin. Track as `F-WATER-EDIT-WHEEL-E2E-2026-05-09` (Minor — coverage gap, not defect).

## Migration apply requirement (deploy gate)

- **Dev:** Already applied this phase. All real-PostgREST and authed-E2E paths now green.
- **Prod:** **MUST be applied to kalori-prod before deploy.** Without it, the route returns 500 on every water log POST. Phase 8 commit step owns this — do not deploy production builds before the migration lands on `kalori-prod` (ref `dryysypycsexvlbabtwq`).

## Status

**passed-with-gaps** — All batch-introduced regressions fixed; existing FAB E2E green; new EDIT-button desktop coverage green; mobile wheel-scroll E2E gap deferred to followup; pre-existing app-shell mock failure unrelated to batch; prod migration apply is a deploy gate.

## Files touched in this phase

- `tests/integration/dashboard-cache-tag.test.ts` — added `rpc('log_water_with_cap')` mock
- `tests/integration/water-log-refresh.test.ts` — added `rpc('log_water_with_cap')` mock
- `tests/e2e/water-edit-button.spec.ts` — NEW E2E spec (3 cases, 2 passing)
- `scripts/apply-migration-0018.mjs` — NEW Management-API apply script (mirrors 0017 pattern)
- `supabase/migrations/0018_water_log_atomic_cap.sql` — applied to kalori-dev (no file change)
