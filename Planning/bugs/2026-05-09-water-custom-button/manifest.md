# Manifest — Batch 2026-05-09-water-custom-button

**Branch:** main
**Started:** 2026-05-09T04:42:32Z
**Completed:** 2026-05-09 (Phase 8)
**HEAD before batch:** ffdb600

## Bugs

### Bug 1 — Daily water cap (0–5000ml) + over-cap toast
- **Classification:** known_fix
- **Status:** implemented + Codex-reviewed (R1+R2) + security-cleared
- **Files:**
  - `app/api/water/log/route.ts` (route — RPC dispatch + 409 mapping)
  - `supabase/migrations/0018_water_log_atomic_cap.sql` (NEW — `log_water_with_cap` RPC + advisory lock)
  - `scripts/apply-migration-0018.mjs` (NEW — pg-driver runner; applied to kalori-dev)
  - `lib/dashboard/types.ts` (NEW `MAX_DAILY_WATER_ML = 5000` constant)
  - `components/dashboard/WaterTracker.tsx` (chip 409 handler + cap toast)
  - `components/nav/nav-shell.tsx` (FAB 409 handler + `router.refresh()`)
  - `lib/i18n/en.ts` (cap-reached toast keys)
- **Tests added:**
  - `tests/unit/api/water-log.test.ts` (8 new — cap 409 contract + payload + idempotency on cap path)
  - `tests/unit/components/dashboard/WaterTracker.test.tsx` (5 new chip 409 tests)
  - `tests/components/nav/nav-shell.test.tsx` (3 new FAB 409 tests)
- **Codex findings touching this bug:** R1 C1 (fail-open totals SELECT), R1 C2 (SUM-then-insert race), R1 I1 (FAB 409 contract) — all auto-fixed in Round 1.
- **R2 outcome:** Pass for this bug's surface. CR2-1 (pre-existing RLS direct-write bypass) is parallel pre-existing risk on `water_log` — force-committed.

### Bug 2 — EDIT button (desktop popover + mobile wheel sheet)
- **Classification:** known_fix
- **Status:** implemented + Codex-reviewed + security-cleared
- **Files:**
  - `components/dashboard/WaterTracker.tsx` (EDIT button wiring + popover/sheet platform selection + `hasUserInteracted` Save gate)
  - `components/primitives/PopoverInline.tsx` (NEW — wraps `@radix-ui/react-popover`, ~70 LoC)
  - `components/primitives/MobileWheelSheet.tsx` (added `doneDisabled?:boolean` prop)
  - `lib/i18n/en.ts` (EDIT button + dialog strings)
  - `package.json` + `pnpm-lock.yaml` (NEW dep `@radix-ui/react-popover`)
  - **Reused unchanged:** `MobileWheelPicker.tsx`, `useIsMobile`, `lib/motion/defaults`
- **Tests added:**
  - `tests/unit/components/dashboard/WaterTracker.test.tsx` (10 new EDIT-surface tests — Save gate, hasUserInteracted state machine, range bounds, clamp-to-step-50, popover/sheet platform selection)
  - 6 new schema tests covering response shape + EDIT-input validation
  - `tests/e2e/water-edit-button.spec.ts` (NEW — 3 e2e cases; desktop Save + Cancel GREEN; mobile wheel deferred)
- **Codex findings touching this bug:** R1 I2 (EDIT silent off-step write — wheel onChange clamping) — auto-fixed in Round 1.
- **R2 outcome:** Pass.

## Codex round-by-round
- **R1:** 2C / 2I / 0M (route.ts: C1, C2; nav-shell: I1; WaterTracker: I2)
  - **R1 auto-fix:** 3 file-scoped sub-agents — all GREEN post-fix
- **R2:** 1C (CR2-1 — pre-existing RLS gap on `water_log`, present since migration 0003) — force-committed
- **Cumulative tests added:** 32 batch-direct + 5 round-1 fix tests = 37 net new

## Security review
0 Critical / 0 High / 0 Medium / 4 Informational (verification-grade only)

Findings:
- **Info-1:** RPC uses `SECURITY INVOKER` — correct (RLS still applies; no privilege elevation)
- **Info-2:** Per-user-day advisory lock prevents concurrent SUM races
- **Info-3:** No PII in error response payloads
- **Info-4:** XSS surface unchanged (no new HTML interpolation)

Verdict: **PROCEED-CLEAN**.

## Phase 7 results
- **Unit/integration:** 2047/2051 pass
  - 2 batch-caused regressions fixed in this phase (mock-fixture updates in `tests/integration/dashboard-cache-tag.test.ts` + `tests/integration/water-log-refresh.test.ts`)
  - 1 pre-existing unrelated failure (`app-shell-provider-mount` mock gap) — see followup tracking
- **Migration:** `0018_water_log_atomic_cap.sql` applied to kalori-dev via `scripts/apply-migration-0018.mjs`
- **E2E:** `nav-responsive.spec.ts` water FAB GREEN; new `tests/e2e/water-edit-button.spec.ts` 2/3 GREEN (desktop Save + Cancel); mobile wheel scroll-snap deferred to followup `F-WATER-EDIT-WHEEL-E2E-2026-05-09`

## Pending follow-ups
- `F-WATER-RLS-DIRECT-WRITE-2026-05-09` — pre-existing Critical RLS gap on `water_log`; force all writes through `log_water_with_cap` RPC + migrate test harness. Separate hardening batch.
- `F-WATER-EDIT-WHEEL-E2E-2026-05-09` — Playwright headless can't trigger CSS scroll-snap wheel onChange via click. Future spike: synthetic wheel events OR keyboard-arrow fallback.
- `F-WATER-EDIT-DECREMENT-2026-05-09` — EDIT-up only (Bug 2 Option A). Decrement path requires `set-total` route or negative-delta endpoint; deferred.

## Pre-deploy DB migration
**CRITICAL:** `supabase/migrations/0018_water_log_atomic_cap.sql` MUST be applied to kalori-prod (DB ref `dryysypycsexvlbabtwq`) BEFORE the Vercel deploy for the route to function.
- kalori-dev: applied via `scripts/apply-migration-0018.mjs` (Phase 7 sweep).
- kalori-prod: PENDING — apply via the same script with prod credentials substituted.

## Audit-trail folder contents
- `proposals/bug-1.md`, `proposals/bug-2.md` (Phase 1 investigation outputs)
- `outputs/bug-1.md`, `outputs/bug-2.md` (Phase 3 implementation outputs)
- `codex/round-1.md`, `codex/round-1-categorized.md`, `codex/fixes-r1-{route-ts,nav-shell,water-tracker}.md`
- `codex/round-2.md`, `codex/round-2-categorized.md`
- `security-review.md` (Phase 6 verdict + findings)
- `e2e-results.md` (Phase 7 sweep + e2e outcomes)
- `project-context.md` (Phase 0 priming)
- `lessons-relevant.md` (Phase 0 lessons load-in)
