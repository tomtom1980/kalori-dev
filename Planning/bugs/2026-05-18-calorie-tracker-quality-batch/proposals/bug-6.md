# Bug 6: Redo progress date buttons

## Classification
known_fix

## Root Cause
The progress range model is still the original `D | W | M` URL contract: `ProgressRangeToolbar` renders `day.`, `week.`, `month.`, `ProgressPage` normalizes only `?range=D|W|M`, and `computeWindow()` only knows daily/hourly, rolling 7-day, and rolling 30-day presets. The agreed UX is different: a segmented control with `Last 7 days`, `Last 30 days`, and `Custom`, where custom dates are validated and all rolling presets end today. There is no current URL/data model for `start_on` / `end_on`, max 365 days, no-future end dates, or invalid-range correction.

## Proposed Change (Diff Outline)
- Replace the range model:
  - Introduce a `ProgressRangeSelection` type such as `{ mode: "last_7" | "last_30" } | { mode: "custom"; startOn: string; endOn: string }`.
  - Keep URL state authoritative:
    - `?range=last_7`
    - `?range=last_30`
    - `?range=custom&start=YYYY-MM-DD&end=YYYY-MM-DD`
  - Preserve a compatibility redirect/normalization from old `D/W/M` values: `W -> last_7`, `M -> last_30`, and `D -> last_7` or a product-decided fallback.
- Add server-side validation in `app/(app)/progress/page.tsx`:
  - `start <= end`;
  - `end <= today` in the user's timezone;
  - inclusive range length `<= 365`;
  - invalid custom params normalize to a safe URL, preferably `last_7`, instead of producing broken charts.
- Update aggregation windowing:
  - Change `computeWindow()` to accept either a preset selection or explicit `startOn/endOn`.
  - For `last_7`, produce seven user-timezone day buckets ending today.
  - For `last_30`, produce thirty user-timezone day buckets ending today.
  - For `custom`, produce one day bucket per inclusive day between start/end, with the same timezone-safe midnight math already used by W/M.
  - Remove or isolate the old D-hourly path if the UI no longer exposes it. If other callers still need daily/hourly, keep it as an internal range, but do not render it in the progress toolbar.
- Redesign `ProgressRangeToolbar`:
  - Render a segmented control with exactly three segments: `Last 7 days`, `Last 30 days`, `Custom`.
  - Use the current Ledger styling: hairlines, zero/low-radius project tokens, existing focus ring, no new animation library.
  - For Custom, render compact labeled date fields (`type="date"`) or a lightweight calendar popover using existing primitives. Given no existing datepicker library, compact date fields are the lower-risk implementation.
  - Date fields should have labels, `max=today`, validation error text, and should only commit a custom URL when valid.
  - Keyboard support: segment arrow navigation or native radio/segmented semantics; date fields tab normally.
- Update progress summary/labels:
  - `computeWindowLabel()` should show `WINDOW · LAST 7 DAYS · ENDING YYYY-MM-DD`, `WINDOW · LAST 30 DAYS · ENDING YYYY-MM-DD`, or `WINDOW · CUSTOM · YYYY-MM-DD - YYYY-MM-DD`.
  - `computeEditorSubtitle()` should name the selected range without saying "weekly" for custom/30-day.
  - Update `lib/i18n/en.ts` labels and aria descriptions.
- Cache/data considerations:
  - Update `rangeToTag()` / progress cache key handling so custom ranges do not collapse into `7d` or `30d`.
  - Since `TAGS.userProgress` currently allows only fixed values, either avoid cross-request custom cache tags until Cache Components migration or add a bounded custom tag format such as `custom:${start}:${end}` only if the typed tag union and lint rule can support it.
  - Existing mutation routes already invalidate the broad canonical progress set; custom ranges will still be fresh while `/progress` remains dynamic/react-cache-only. Document this so future Cache Components work does not accidentally cache custom windows under the wrong tag.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\page.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\ProgressRangeToolbar.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weekly-review-island.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\progress.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\progress-fetch.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\progress.test.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewIsland.period.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\progress.spec.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\progress-render.spec.ts`

## TDD Required
yes - this changes URL parsing, validation, aggregation window boundaries, keyboard behavior, and rendered UI.

## Test Approach
- Add/modify pure aggregation tests:
  - `last_7` returns exactly seven day buckets ending on the user-timezone today;
  - `last_30` returns exactly thirty day buckets ending today;
  - custom `2026-04-01..2026-04-10` returns ten buckets and excludes outside entries;
  - custom range honors non-integer timezone offsets and DST-safe midnight math;
  - custom range length over 365 is rejected by parser/normalizer before aggregation.
- Update `ProgressRangeToolbar` component tests:
  - renders `Last 7 days`, `Last 30 days`, `Custom`;
  - active segment has correct aria/current selected state;
  - click/keyboard changes call `router.replace(..., { scroll: false })`;
  - Custom reveals labeled start/end date fields;
  - invalid `start > end`, future `end`, and >365-day range show validation and do not navigate;
  - valid custom commits `range=custom&start=...&end=...`;
  - axe has zero violations.
- Add page normalizer tests if a pattern exists for route-level parsing:
  - old `?range=W` normalizes to last 7;
  - invalid custom params redirect or render last 7 consistently;
  - future end date clamps/rejects in user timezone.
- Update visual/E2E coverage:
  - screenshot progress toolbar at desktop/tablet/mobile with default and Custom-open states;
  - E2E route smoke for `?range=last_7`, `?range=last_30`, and valid custom.
- Run targeted suites:
  - `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/WeeklyReviewIsland.period.test.tsx`
  - `pnpm exec playwright test tests/visual/progress.spec.ts` after implementation if visual baselines are intentionally updated.

## Risk Assessment
medium - the UI change is contained, but the range type is shared across all progress charts and the AI progress summary. The main risk is breaking existing D/W/M tests or silently mis-bucketing custom dates around timezone boundaries.

## Regression Sweep Needed
- All five progress chart components.
- Progress AI/editor summary copy and cache keys.
- Weight trajectory section on `/progress`, which currently has its own fixed 30-day weight window and may need to remain independent unless the product decision says it follows the selected range.
- Existing progress visual baselines.
- Cache tag tests for `TAGS.userProgress` and `revalidateAllProgressRanges` if custom tags are introduced.

## UI Touching
true - `ProgressRangeToolbar` and progress masthead/window labeling. Web UI guidance: this is a dashboard control; use a compact segmented control and native date fields, avoid new animation dependencies, preserve 44px touch targets and visible focus. The web guide's Quick-Pick table recommends AutoAnimate for dynamic tabs/lists, but this interaction does not need it because native field reveal can be a simple CSS opacity/display transition.

## Open Questions
- Should old `D` daily/hourly charts disappear entirely, or should there be a hidden compatibility route for existing bookmarked `?range=D` URLs?
- Should the weight trajectory chart follow the selected custom range or keep the current independent 30-day window?
- For invalid custom params, should the app redirect to a canonical safe URL or render inline validation while leaving the URL untouched?
- Stop flag: proposed source touch count is greater than 5 files if aggregation, labels, progress summary, and tests are updated together.
