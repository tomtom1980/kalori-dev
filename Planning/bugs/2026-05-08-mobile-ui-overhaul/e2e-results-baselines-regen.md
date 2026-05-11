# Visual Baseline Regeneration — Phase 7 Followup

## Baselines updated

1. `tests/visual/__screenshots__/visual/dashboard.spec.ts/dashboard-visual-baseline-chromium-mobile.png` — **123,845B** (prior 95,832B; +29% — consistent with Bug #1's 0.49 ratio geometry reflow)
2. `tests/visual/__screenshots__/visual/library.spec.ts/library-visual-baseline-chromium-mobile.png` — **32,993B** (prior 28,077B; +18% — consistent with Bug #2 nav labels + Bug #4 mobile wheel-picker trigger)
3. `tests/visual/__screenshots__/visual/progress.spec.ts/progress-visual-baseline-chromium-mobile.png` — **189,614B** (prior 160,958B; +18% — consistent with Bug #1 + Bug #5 dual-FAB)
4. `tests/visual/__screenshots__/visual/log-confirmation.spec.ts/log-confirmation-visual-baseline-chromium-mobile.png` — **17,564B** (prior 15,580B; +13% — consistent with Bug #4 ConfirmationScreen mobile wheel-sheet)
5. `tests/visual/__screenshots__/visual/weight.spec.ts/weight-visual-baseline-chromium-mobile.png` — **42,212B** (prior 34,874B; +21% — consistent with Bug #5 dual-FAB on weight page)

## File-size sanity check

- All 5 baselines: **reasonable** — every PNG is in the 17KB–190KB range, none are <5KB (no blank / white-out screenshots), none exceed 2MB
- **Notes:**
  - Dashboard's 0.49-ratio diff translated to a +29% size increase (not the larger jump one might fear). The previous baseline was 95KB; the new is 124KB — sensible for a mobile reflow that elongated the page from 1746px to 3017px image height per Phase 7 e2e-results.
  - All 5 new baselines are LARGER than their predecessors — consistent with mobile content being reflowed to vertical stacks (more visible content per fullPage screenshot) rather than horizontal compression.
  - No anomalies detected; all sizes track the bug-fix theme of "more vertical content on narrower viewports."

## Re-run after update

- **`visual-baseline-chromium-mobile` suite (full project):** **23 passed, 1 skipped** (the 1 skipped is `sidebar-identity.spec.ts`, intentionally skipped at the chromium-mobile project per commit `71514c8` — pre-existing). All 5 regenerated baselines now match cleanly. No pixel diffs remain. **Visual regression = green.**
- **Affected E2E suites (`chromium` project — tests/e2e/library + reduced-motion + nav-responsive):** **16 passed, 12 skipped, 1 failed, 3 did not run.** The 12 skipped are the pre-existing `nav-responsive.spec.ts` test-user-seeding skip pattern (Task 2.1 C1-B comment, unchanged since April). The 1 failure is `tests/e2e/library/library-visual.spec.ts → snapshots at sm-390` against baseline path `tests/e2e/library/library-visual.spec.ts-snapshots/empty-state-sm-390-chromium-win32.png`. **This baseline was NOT modified by this regen** (git status is clean on `tests/e2e/library/`, file timestamp Apr 23). The failure is a pre-existing visual drift on a *different* baseline path (the `tests/e2e/library/library-visual.spec.ts-snapshots/...` family lives in the default `chromium` desktop project with per-test viewport overrides, NOT in the `visual-baseline-chromium-mobile` project I was scoped to update). The `sm-390` viewport drift is the same root cause as the visual-baseline mobile diff (Bug #4 wheel-picker + Bug #2 nav labels) but at a different baseline location that was outside the user's auto-accept decision scope.

## Other baselines NOT modified

- All non-mobile `visual-baseline-chromium*` baselines (desktop 1280×800 + tablet 768×1024) — unchanged, scope was narrow.
- All `visual-firefox` + `visual-safari` cross-browser baselines — unchanged.
- All `tests/e2e/library/library-visual.spec.ts-snapshots/*` baselines — unchanged (pre-existing modification noise in `tests/screenshots/` from prior sessions, but `tests/e2e/library/` is git-clean).
- Pre-existing modifications in `tests/screenshots/reduced-motion/` and `tests/screenshots/user-stories/` are leftover state from earlier task work, NOT touched by this regen run.

## Verdict

- **All 5 baselines updated cleanly:** **YES.** Sizes are reasonable, well-distributed, and proportional to the geometric changes from Bugs #1/#2/#3/#4/#5.
- **Visual regression now green:** **YES** for the `visual-baseline-chromium-mobile` project (23/23 tests pass, 1 intentional skip).
- **One pre-existing chromium-project visual failure surfaced** (`library-visual.spec.ts → empty-state-sm-390`) but it is **outside the scope of this regen** — the user's auto-accept decision covered only the 5 specific baselines listed in `e2e-results.md` §"Visual regression". The sm-390 e2e/library baseline is a separate path that requires its own surface-and-approve cycle.
- **Recommendation to main agent:** **PROCEED to Phase 8.** The 5 user-approved baselines are regenerated and green. The sm-390 chromium-project drift in `tests/e2e/library/library-visual.spec.ts-snapshots/empty-state-sm-390-chromium-win32.png` should be queued as a follow-up baseline-approval gate (same Bug #2 + #4 root cause, but a different baseline file the user did not auto-accept). Phase 8 can either (a) include it in a final "all visual approvals" sweep, or (b) defer to a follow-up bugfix-tomi item as a deferred Codex-residual-style pass.
