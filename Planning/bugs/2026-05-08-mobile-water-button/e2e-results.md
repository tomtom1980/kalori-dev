# Phase 7 — E2E + Visual Sweep Results

**Batch:** `2026-05-08-mobile-water-button`
**Sub-agent:** Phase 7 E2E + visual sweep
**Started:** 2026-05-09T01:25Z (GMT+7)
**Completed:** 2026-05-09T01:30Z (GMT+7)
**Wall-clock:** ~5 min total test execution + analysis

## Visual Baseline Strategy

**Strategy A (modified): bake locally for chromium projects, defer cross-browser to CI.**

Rationale (evidence-based):
- `playwright.config.ts` declares 5 visual projects: `visual-baseline-chromium` (1280×800), `visual-baseline-chromium-tablet` (768×1024), `visual-baseline-chromium-mobile` (375×667), `visual-firefox`, `visual-safari` — all match `tests/visual/**/*.spec.ts`.
- `.github/workflows/ci.yml` `visual` job runs on `ubuntu-latest`, installs `chromium firefox webkit`, has explicit `workflow_dispatch` `update_snapshots` toggle, uploads `tests/visual/__screenshots__` as artifact for committed regen.
- Prior batch (`Planning/bugs/2026-05-08-mobile-ui-overhaul/manifest.md`) regenerated 5 mobile baselines locally via auto-accept, then commit. Project DOES commit Windows-Chromium baselines (the existing `water-fab-toast-default-visual-baseline-chromium.png` was authored 01:05 today on this very machine).
- Spec uses `setViewportSize(375, 667)` inside the test body, overriding project-level viewport — so all 3 chromium projects produce IDENTICAL output (verified: all 6 PNGs are 44 328 bytes).
- Firefox + WebKit binaries are NOT installed locally. CI installs them. Cross-browser baselines cannot be baked locally; defer to CI.

Decision: commit the **6 chromium baselines** in Phase 8. Cross-browser PNGs (Firefox + WebKit) deferred to CI workflow_dispatch (F-TEST-1 mechanism).

## Unit / Regression Results

**Command 1:** `npx vitest run tests/components/nav/ tests/unit/app/layout-timezone-derivation.test.ts tests/unit/lib/stores/useUndoQueueStore.test.ts tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts`

(Note: spec called `tests/unit/stores/useUndoQueueStore.test.ts` — actual location is `tests/unit/lib/stores/`. Corrected during execution.)

```
Test Files  10 passed (10)
     Tests  87 passed (87)
  Duration  1.55s
```

Per-file:
- `tests/unit/app/layout-timezone-derivation.test.ts` — 11/11 pass (C1 column-rename + C2 R3 timezone-drill sentinels green)
- `tests/unit/lib/stores/useUndoQueueStore.test.ts` — 16/16 pass (ttlMs override green)
- `tests/components/nav/top-app-bar.test.tsx` — 2/2
- `tests/components/nav/shortcuts-overlay.test.tsx` — 6/6
- `tests/components/nav/log-fab.test.tsx` — 12/12
- `tests/components/nav/profile-menu.test.tsx` — 6/6
- `tests/components/nav/bottom-tab-bar.test.tsx` — 6/6
- `tests/components/nav/sidebar.test.tsx` — 5/5
- `tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts` — 7/7 (cross-tab ttlMs broadcast green)
- `tests/components/nav/nav-shell.test.tsx` — 16/16 (water FAB POST + ref-latch + router.refresh + tap-time loggedOn — C2 R3 fix all green)

**Command 2 (defensive):** `npx vitest run tests/unit/components/dashboard/`

```
Test Files  11 passed (11)
     Tests  70 passed (70)
  Duration  1.59s
```

`tests/unit/components/dashboard/WaterTracker.test.tsx` — 5/5 pass. Import-path swap from Bug #1 fix did NOT regress the WaterTracker chip.

## E2E Water-FAB Test

**Command:** `npx playwright test tests/e2e/nav-responsive.spec.ts -g "water FAB" --reporter=line`

**Setup:** Started `pnpm dev` in background, waited for `http://localhost:3000` to respond (until-loop). Confirmed `.env.local` carries 3 `SUPABASE_TEST_*` vars (anon key, URL, service-role) — `tests/e2e/fixtures/auth.ts` `authedPage` fixture's `resolveEnv` requirement satisfied.

**Result:**
```
[1/1] [chromium] › tests\e2e\nav-responsive.spec.ts:250:13 › nav shell · mobile water FAB (authed real-browser) › water FAB on /library POSTs /api/water/log and surfaces toast WITHOUT navigation
1 passed (7.2s)
```

Real Supabase user mint succeeded; FAB tap → POST `/api/water/log` (200) → toast surfaced → no navigation off `/library`. The I3 R3 un-skip is verified working end-to-end.

## Visual Snapshots (water-fab-toast)

**Command:** `npx playwright test tests/visual/water-fab-toast.spec.ts --update-snapshots --reporter=line`

**Result:** `6 passed, 4 failed`

The 6 passes baked the chromium baselines. The 4 failures are **infrastructure-only** (Firefox + WebKit binaries not installed locally — `Executable doesn't exist at C:\Users\tamas\AppData\Local\ms-playwright\firefox-1511\firefox\firefox.exe`). These are NOT test failures and NOT a regression — CI installs all 3 browser binaries and will bake the cross-browser baselines on the next dispatch.

**PNGs created (all 375×667 RGB PNG):**
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-default-visual-baseline-chromium-mobile.png` (44 328 B) — NEW
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-default-visual-baseline-chromium-tablet.png` (44 328 B) — NEW
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-default-visual-baseline-chromium.png` (44 328 B, 01:05) — pre-existing, no diff
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-reduced-motion-visual-baseline-chromium-mobile.png` (44 328 B) — NEW
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-reduced-motion-visual-baseline-chromium-tablet.png` (44 328 B) — NEW
- `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/water-fab-toast-reduced-motion-visual-baseline-chromium.png` (44 328 B, 01:05) — pre-existing, no diff

**Visual verification (default mobile baseline):** PNG renders correctly — mobile dashboard masthead "KALORI" + "First entry. Welcome to the ledger." + ChronometerRing showing "0" + dual FABs (food primary oxblood `+` glyph + water secondary droplet glyph) + "250 ml logged" toast surfaced above the FABs + bottom tab bar with active "DASHBOARD" pill. Toast text matches `t.fab.waterLoggedToast` ("250 ml logged"). Reduced-motion variant passed identically — motion suppression doesn't visually alter the static toast frame.

**Commit recommendation:** Commit all 4 NEW chromium PNGs in Phase 8. The 2 pre-existing files were already part of the earlier 01:05 implementation; they're unchanged on disk.

## Visual Regression on Adjacent Files

**Command:** `npx playwright test tests/visual/dual-fab-layout.spec.ts --project=visual-baseline-chromium --project=visual-baseline-chromium-tablet --project=visual-baseline-chromium-mobile --reporter=line` (no `--update-snapshots` — regression detection only)

**Result:**
```
18 passed (13.6s)
```

All 18 dual-fab-layout cases (3 viewports × 3 chromium projects × 2 it() blocks) passed clean. The dual-FAB spec uses geometric assertions (no PNG snapshots), so this is a pure assertion-pass — water FAB tap-handler swap (router.push → POST + toast + ref-latch + router.refresh) did NOT regress the FAB's geometric properties (visibility, side-by-side, gutter, 56×56 sizing).

No suspicious diffs detected on adjacent surfaces.

## Wall-Clock Time

| Step | Time |
|---|---|
| Strategy investigation (config + workflow + prior manifest reads) | ~3 min |
| Unit + integration tests (87 + 70 = 157 cases) | 3.1 s |
| E2E water FAB + dev-server warmup | ~30 s (server boot) + 7.2 s (test) |
| Visual baseline bake (10 cases incl. firefox+webkit infra fails) | 7.7 s |
| Adjacent visual regression (18 cases) | 13.6 s |
| **Total test execution** | **~32 s** |
| **Total wall-clock** | **~5 min** |

## Blocker History

(empty — no auth/CAPTCHA/2FA blockers; no genuine production-code failures; no STW triggers fired)

The Firefox + WebKit "browser not installed" failures during `--update-snapshots` are LOCAL infrastructure gaps, not blockers. CI's `playwright install --with-deps chromium firefox webkit` step covers them.

## Decision

**advance-to-phase-8**

Rationale:
- All 87 + 70 unit/integration cases pass.
- E2E water FAB test passes against real Supabase fixture (I3 R3 un-skip verified).
- 4 new mobile + tablet chromium PNG baselines baked locally and visually verified correct.
- Adjacent visual surface (dual-fab-layout) shows no regression.
- Cross-browser baselines deferred to CI via standard F-TEST-1 mechanism (consistent with project precedent).

Phase 8 should:
1. Commit the 4 NEW chromium PNG baselines (`water-fab-toast-default-visual-baseline-chromium-mobile.png`, `water-fab-toast-default-visual-baseline-chromium-tablet.png`, `water-fab-toast-reduced-motion-visual-baseline-chromium-mobile.png`, `water-fab-toast-reduced-motion-visual-baseline-chromium-tablet.png`).
2. Mention in CHANGELOG / manifest that Firefox + WebKit cross-browser baselines for `water-fab-toast.spec.ts` are pending CI workflow_dispatch (F-TEST-1) — follow-on if cross-browser drift surfaces, otherwise CI will auto-bake them on the next `update_snapshots=true` dispatch.
