# Bug 4: Daily dashboard Editor's Note shows weekly sparse-data copy
## Classification
known_fix

## Root Cause
The daily dashboard renders `components/dashboard/WeeklyInsightCard.tsx`, which reads the current `weekly_reviews` row and delegates to `WeeklyReviewCore variant="compact"`. When no current weekly row exists, that path intentionally renders the progress-page sparse weekly text: "Too little logged this week for a full review." That is correct for the progress weekly review, but wrong for the daily dashboard because it is not scoped to `viewedDay`, does not use the already-fetched `DashboardSnapshot`, and cannot summarize newly added entries until an unrelated weekly row is generated.

This is a broken existing dashboard feature rather than a deep unknown: the dashboard already has all daily facts in `snapshot` from `fetchDaySnapshot()`, but the note surface is wired to the weekly-review primitive. UI prescription check: `Planning/ui-design.md` section 7.1.7 currently prescribes the weekly insight card as a compact `WeeklyReviewCore`; the user's current requirement supersedes that for the dashboard daily note. The web UI Quick-Pick table does not require a new animation/library here; this is a static dashboard note/card using existing Ledger tokens and the existing page `FadeUpCard`.

## Proposed Change (Diff Outline)
- `lib/dashboard/daily-editors-note.ts` - add a pure helper that accepts `DashboardSnapshot` plus `viewedDay` and returns `{ body, bullets }` for the daily note. Keep it deterministic and cheap: no Gemini call, no cache row, no new API route. Suggested logic:
  - If there are zero food entries, body says nothing is logged for the selected day and a log is needed before the editor can review the day; bullets can stay empty.
  - If entries exist, body is one smart sentence summarizing calories vs target, entry count, and standout issue.
  - Bullets cover what is good, what needs attention, and one recommendation, derived from chronometer status, macro statuses, water target, and visible micronutrient statuses.
- `components/dashboard/DailyEditorsNote.tsx` - add a small RSC/presentational component using the existing `EditorsNote` visual language or the same Ledger tokens: bg-quote/card field, oxblood left rule, Newsreader italic body, Inter tracked kicker, accessible `article` or `role="note"`, and `data-testid="daily-editors-note"`.
- `app/(app)/dashboard/page.tsx` - replace the `WeeklyInsightCard` import/render with `DailyEditorsNote snapshot={snapshot} viewedDay={viewedDay}` near the existing bottom position. Remove the weekly-review Suspense wrapper for this daily note because it is not async; the surrounding `FadeUpCard` can remain.
- `lib/i18n/en.ts` - add dashboard daily editor-note copy keys if the component should avoid hard-coded strings. At minimum add the kicker and empty-state text.
- `tests/unit/components/dashboard/DailyEditorsNote.test.tsx` or extend an existing dashboard component test file - cover empty day and populated day render behavior.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\daily-editors-note.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\DailyEditorsNote.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\dashboard\page.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\DailyEditorsNote.test.tsx`

## TDD Required
yes - this is logic-touching. The derived note must be tested against empty, under-target, on-target, over-target, low-water, and macro/micro attention cases so future copy changes do not accidentally reintroduce weekly wording or stale period logic.

## Test Approach
- Add RED unit tests for `buildDailyEditorsNote()`:
  - Empty `DashboardSnapshot` returns no weekly wording and clearly says no food is logged for the selected day.
  - Populated day uses the day-scoped entry count and calories from `snapshot.chronometer`.
  - Over-target calories produces a recommendation to ease the next meal / balance the rest of the day.
  - Low water or low fiber/micronutrients can appear as the "needs attention" bullet when present.
- Add component tests for `DailyEditorsNote`:
  - Renders `data-testid="daily-editors-note"`.
  - Does not render "week", "weekly", or "full review" on the dashboard note.
  - Renders accessible note/article text with the Ledger editor-note kicker.
- Update the composed dashboard a11y integration fixture later in implementation if it currently expects `WeeklyInsightSkeleton`; it should assert the daily note renders with no axe violations.

## Risk Assessment
medium - the code change is small, but it intentionally changes the dashboard bottom insight from weekly cached AI content to daily snapshot-derived editorial content. The main risk is product expectation: if "AI-generated" must literally mean Gemini-generated daily copy, that becomes a larger API/cache/cost feature and should not be hidden inside this bug fix.

## Regression Sweep Needed
- Dashboard render and a11y composition.
- Log save / library log-now flows that call `router.refresh()` after successful entry creation.
- Progress weekly review island, to confirm `WeeklyReviewCore` and `/api/ai/weekly-review` remain unchanged for the progress page.
- i18n dashboard copy shape test.

## UI Touching
true - dashboard bottom insight/editor-note component. It should keep the Ledger visual language from `EditorsNote` / compact weekly card: dark `bg-quote` or `bg-1`, oxblood accent rule, Newsreader italic editor voice, Inter tracked kicker, no rounded-card drift beyond existing token usage.

## Open Questions
Assumption for implementation: use deterministic snapshot-derived editorial copy, not a new Gemini daily-summary endpoint. This satisfies "refresh every dashboard load or new item added" because `app/api/entries/save/route.ts` revalidates `TAGS.userEntries(...)` and `ConfirmationScreen`/library log paths call `router.refresh()` after successful saves. If the user requires literal AI generation on every dashboard load/item add, escalate this bug to a feature because it needs a new daily cache key, cost logging, prompt contract, sparse-data policy, and stale/retry UX.
