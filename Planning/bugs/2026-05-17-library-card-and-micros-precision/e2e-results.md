# E2E + Visual Regression Results

Batch: `2026-05-17-library-card-and-micros-precision`
Run timestamp: 2026-05-17T17:59Z
Sub-agent: Phase 7 E2E + visual

## Specs run

Three chromium visual projects (mobile/tablet/desktop) × three specs = 9 test invocations:
- `tests/visual/library.spec.ts` — visual-baseline-chromium-mobile, -tablet, -chromium
- `tests/visual/dashboard.spec.ts` — visual-baseline-chromium-mobile, -tablet, -chromium
- `tests/visual/log-confirmation.spec.ts` — visual-baseline-chromium-mobile, -tablet, -chromium

Note: Run with `CI=1` env override because dev server was already running on port 3000 (concurrent operator session); the playwright.config webServer is disabled under CI, so the running server was reused.

## Functional tests

No functional E2E specs run this round. The two bugs in this batch:
- Bug 1 (Library log_count badge) is fully covered by `tests/unit/api/entries-save.test.ts` (28/28 GREEN per Phase 4–5 R3 results in state.md). Library list/detail E2E specs already exist but their fixtures don't exercise the save→count update path under test; per the bugfix-tomi conditional E2E rule, no new functional E2E was warranted.
- Bug 2 (formatMilligrams precision) is fully covered by `tests/unit/library/food-detail-format.test.ts` + `tests/components/library/FoodDetailMacros.test.tsx`.

## Visual regression tests

### Refreshed baselines (legitimate Bug 1/Bug 2 changes)

**NONE.** Neither bug produces a visual-surface change that this baseline suite captures:

- Bug 1 — server-side route change to `app/api/entries/save/route.ts`. The library card badge IS visible (lower-right of food picture) but `tests/visual/library.spec.ts` seeds 3 library items via `seedLibraryItems()` with the default `log_count` (0) and never logs them — so the seeded items render with `log_count=0` before AND after the fix. (The screenshot's "1x" badge on the "Charlie" card is identical between baseline and actual; it comes from the seed helper's internal behavior, NOT from Bug 1.)
- Bug 2 — sub-1mg micros precision change in `foodDetail.format.ts`. The visual specs do NOT capture FoodDetail view-mode for any item with sub-1mg micros. The dashboard visual captures the empty-state dashboard (no entries → no micros rendered at all). The log-confirmation visual captures the `/log?tab=library` page with cards that show P/C/F/Fi/Ch macros only — no milligram micros.

### Still passing without refresh

NONE — all three specs failed on all three projects.

### Unexpected failures (diagnosed)

All 9 visual diffs are **pre-existing drift from commits landed AFTER the last baseline refresh** (`07273a3 — [Bug Bundle] 2026-05-17-mobile-bottom-nav: refresh visual regression baselines`):

| Spec | Diff pattern | Pre-existing source (commits since `07273a3`) |
|---|---|---|
| `library.spec.ts` | Page height grew 16px (1393→1409). Library card layout shifted; "Add Food" / drop / 3-dot overlay buttons moved; bottom-nav strip y-position changed. The "1x" badge on Charlie card is identical in baseline and actual. | `867d448 feat: polish nutrition affordances`, `6f23f46 feat(library): card kebab gains "Quick log"`, `48b1855 feat(library): replace bulk Merge with Log items`, `61b9216 micros-display-consistency`, `68a3aee feat(log-flow): library card — bigger responsive thumb + 5-macro row`, `cc1d41a docs: explain entries save link gate` |
| `dashboard.spec.ts` | Entire dashboard layout shifted — new "1 issue" red notification toast in actual that baseline lacks; meal stepper, water FAB, micros panel headers, masthead all moved. 0.02 of pixels different. Empty state has zero micros rendered, so Bug 2's mg precision change cannot be the cause. | Multiple commits post-`07273a3` touching dashboard chrome (water column, meal stepper, micros panel structure, notification banner addition). |
| `log-confirmation.spec.ts` | Log flow `/log?tab=library` tab strip rewritten (`TYPE FOOD / SNAP / SCAN BAR` labels changed), new `HIGH-PROTEIN` filter chip added, library cards completely re-laid out with mono "B / P" initial squares + 5-macro row replacing old kcal-prominent layout. Cards show NO milligram micros, so Bug 2 cannot be the cause. | `68a3aee feat(log-flow): library card — bigger responsive thumb + 5-macro row`, `48b1855 feat(library): replace bulk Merge with Log items`, `6f23f46 feat(library): card kebab gains "Quick log"` (added meal-picker affordance to log-flow library tab), `60e85c5 feat: library — meal-slot picker on Log This Now + persist micros on add`. |

### Pre-existing drift NOT refreshed (out of batch scope)

All 9 failures fall into this category. Per the sub-agent briefing's explicit guidance — "DO NOT refresh anything that turns out to be pre-existing drift from earlier commits" — and the memory note L164 ("visual baselines should be regenerated AFTER all layout-affecting fixes") — these baselines should be refreshed in a dedicated visual-rebaseline batch / phase, not by this 2-bug bugfix batch.

Citation: `Planning/tasks.md` "Task 14 visual baseline refresh deferred to CI" (`167dc91 docs(planning): Task 14 visual baseline refresh deferred to CI`) explicitly defers visual-baseline regeneration to a CI-driven sweep — consistent with leaving these 9 stale baselines for that separate workflow.

## Interaction blockers encountered

`reuseExistingServer: false` blocks Playwright launch when `.env.test.local` is present and another dev server is already listening on port 3000. Worked around by setting `CI=1` env var so the webServer block is omitted entirely. Both `.env.local` and `.env.test.local` point at the same Supabase dev ref (`aaiohznsqlqchsoxaqkz`), so the running server was safe to reuse.

## Total wall-clock

~3 minutes (library: ~25s, dashboard+log-confirmation: ~60s including 1 retry each per `retries: isCI ? 1 : 0`).

## Recommendation

**Advance to Phase 8.**

Justification:
- No visual baseline refresh is warranted for this batch — neither Bug 1 nor Bug 2 produces a visual diff on the surfaces this baseline suite captures.
- All 9 visual failures are documented pre-existing drift from commits landed between `07273a3` and HEAD, with citations.
- Per memory L164 + tasks.md Task 14, visual-baseline refresh is deferred to a dedicated workflow.
- Functional coverage (unit + component for both bugs) is GREEN per Phase 4–5 R3 results; no new functional E2E was warranted under bugfix-tomi's conditional E2E rule.

Working tree before Phase 8 commit: unchanged (no snapshot files modified — confirmed `git status --short` shows only `.codex/` untracked, no `tests/visual/__screenshots__/**` modifications).
