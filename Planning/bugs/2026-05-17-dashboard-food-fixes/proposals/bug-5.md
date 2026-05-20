# Bug 5: Progress Editor's Note ignores selected range

## Classification
known_fix

## Root Cause
The `/progress` page reads `?range=D|W|M` for the toolbar and the five chart sections, but the Editor's Note is still the older weekly-review island. `WeeklyReviewIsland` always computes the current ISO Monday, reads `weekly_reviews` by `(user_id, week_start_on)`, calls `/api/ai/weekly-review` with `week_start_on`, and renders copy from `t.progress.weeklyReview.*` that says "week" / "past seven" regardless of the selected range. This is mismatched with the Progress page's range-aware charts and with `planning/ui-design.md`'s shared `WeeklyReviewCore` prescription; no `## Library Prescriptions` section exists, and the relevant UI-guide Quick-Pick row is "Dashboard charts & KPIs", but the repo already has bespoke chart/note primitives so the fix should align to those rather than add Tremor for a bug fix.

## Proposed Change (Diff Outline)
- `app/(app)/progress/page.tsx`
  - Pass the selected `range`, current profile target slice, and existing `nowIso` into the bottom note island.
  - Update the section subtitle from weekly-only language to selected-window language.
- `app/(app)/progress/_components/weekly-review-island.tsx`
  - Keep the existing W-range Gemini weekly-review path so current weekly review/cache behavior is preserved.
  - For `range === 'D'` and `range === 'M'`, render a period-aware Editor's Note from `fetchProgressSnapshot(...)` using the same request-scoped React cache as the chart sections.
  - Use the existing aggregate fields (`logging.totalMealsInRange`, `calorie.sparse.daysLogged`, `trend.commentary`, calorie totals vs target) to produce one smart sentence and a zero-log fallback.
- `components/charts/WeeklyReviewCore.tsx`
  - Add optional period/display props or a small sibling period-note branch so sparse/empty copy can say "today", "this week", or "this 30-day window" instead of hardcoded "this week" / "past seven".
  - Preserve the full-variant drop-cap invariant: the 82px drop cap remains only on the full fresh weekly review path, not on compact dashboard cards or sparse/period fallback notes.
- `lib/i18n/en.ts`
  - Add period-aware labels/copy for D/W/M and no-log fallback text.
- Tests
  - Update old sparse copy tests that intentionally assert weekly-only copy.
  - Add coverage proving D and M render period-aware note text and do not call the weekly review API path.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\page.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weekly-review-island.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\WeeklyReviewCore.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewCore.test.tsx`
- likely add one focused component/unit test under `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\`

## TDD Required
yes — this changes UI state selection, data-path branching, and user-visible copy. The existing tests currently pin weekly-only sparse copy, so they should be changed red-first before implementation.

## Test Approach
- Add/modify a `WeeklyReviewCore` test to assert sparse/period copy can render:
  - D: no logs -> "No logs recorded today..." style copy, not "past seven".
  - M: sparse/insufficient logs -> "this 30-day window" style copy, not "this week".
  - W: existing weekly review/drop-cap/sparse invariants remain intact.
- Add a focused RSC/unit test around the progress note island if practical:
  - with `range='M'`, mock `fetchProgressSnapshot` and assert it renders a period note from aggregate data.
  - assert the same-origin `/api/ai/weekly-review` fetch is not called for D/M.
  - with `range='W'`, assert the existing weekly-review fetch/cached-row behavior still uses `week_start_on`.
- Keep existing `ProgressRangeToolbar` tests unchanged unless the aria/window copy changes.
- Run targeted suites:
  - `pnpm vitest tests/components/progress/WeeklyReviewCore.test.tsx`
  - new focused progress note test
  - `pnpm vitest tests/unit/lib/aggregations/progress.test.ts` if helper logic is added to the aggregator.

## Risk Assessment
medium — the visual change is small, but it touches an RSC Suspense island, the weekly review cache path, and copy that existing tests intentionally pinned.

## Regression Sweep Needed
- `/progress?range=D`, `/progress?range=W`, `/progress?range=M` rendered note content.
- Dashboard `WeeklyInsightCard` compact variant, to ensure the shared `WeeklyReviewCore` change does not alter dashboard copy/drop-cap behavior unexpectedly.
- Weekly-review API integration tests, especially sparse-data and cache-hit branches, to ensure W-range behavior remains untouched.
- Visual/a11y smoke on Progress bottom section because the note text length changes across ranges.

## UI Touching
true — `/progress` bottom "From the editor" / `WeeklyReviewIsland` / `WeeklyReviewCore` card.

## Open Questions
Should D and M notes be deterministic from the existing progress aggregate for this bug fix, or must they make a Gemini call too? I recommend deterministic period notes in this batch because the existing AI route and `weekly_reviews` table are explicitly weekly; true AI for arbitrary D/M periods would need a new API/table/cache contract and should be treated as a separate feature.
