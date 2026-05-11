# Bug 6: Water-logging vertical slice (Task 3.5 folded into bugfix-tomi)

## STOP-THE-WORLD — Phase 1 trigger

**Phase 0 priming was wrong.** Water-logging is NOT "ZERO code shipped." Task 3.5 (Phase 3) is already **completed and merged**. Evidence:

- `supabase/migrations/0003_food_schema.sql` — applied, contains `water_log` table + 4 RLS policies (verified via grep on `water_log` in mig 0003 + 0005 column-rename mig per progress.md L1428).
- `app/api/water/log/route.ts` — POST route exists (Zod-strict `{ client_id, unit, count, logged_on }`, I11 idempotency, 23505 race re-SELECT, I12 `revalidateTag` — header confirmed).
- `components/dashboard/WaterTracker.tsx` — client island with `useOptimistic`, `+glass` / `+bottle` chips (header confirmed), Codex R1 fix I1 already applied for optimistic rollback (progress.md L1341).
- Tests exist: `tests/unit/components/dashboard/WaterTracker.test.tsx` (referenced L1341), `tests/integration/water-log-refresh.test.ts` per testing-strategy.md L250, RLS coverage in `tests/rls/food-schema.spec.ts` L305.
- progress.md confirms Phase 3 closed at 813 passing tests; CHANGELOG entries `b529290`, `0321f01`, `c706d50` shipped this surface (L1435).
- ui-design.md §7.1.5 (Water Tracker) and §8.7 (UndoToast) consume this component — already wired into the dashboard, MealsBulletin, weekly insight composition.

**The user's actual request, re-read:** *"we should also have another plus button for logging water. So we should log food and water."* In context of bugfix-tomi batch `2026-05-08-mobile-ui-overhaul` (Bug #5 = a FAB for new log entries), the request is about **the FAB entry-point only** — adding a second plus button (or a multi-action FAB) so that the FAB on the dashboard launches *both* food-log and water-log flows. The water vertical slice itself is already done.

**Recommended re-classification:** This bug should be **merged into Bug #5** (FAB) — the FAB needs two affordances: "log food" → existing `/log` route, "log water" → existing `WaterTracker` quick-add (or a new `/log/water` deep-link if the dashboard's optimistic chip is not the desired entry point on every surface).

## Classification
**unclear** — Phase 0 frame was incorrect; user gate required before Phase 2.

## Root Cause
Phase 0 priming sub-agent misread `tasks.md` Task 3.5 status as "Not Started" when in fact Phase 3 is closed. The user's "log food and water" request is about FAB action UX, not a missing data layer.

## Architecture Plan (CONDITIONAL — pending user gate)

### Path A — request is FAB-only (most likely)
Fold into Bug #5. Bug #5's FAB grows a 2-action menu (or two adjacent buttons): primary = food (`/log`), secondary = water (opens a water quick-add sheet OR scrolls/links to `<WaterTracker>`). Bug #6 closes as duplicate.

### Path B — request is for a dedicated `/log/water` page (still possible)
- Existing `WaterTracker` is dashboard-only (single-row optimistic chip set). User may want a dedicated page (mirror food `/log`) for: hourly history, day backfill, larger touch targets on mobile, integration with mobile FAB.
- New: `app/(app)/log/water/page.tsx` server component → reuse `WaterTracker` (or a wider variant) + history list (read `water_log` for last 7 days).
- New: `app/(app)/log/water/_components/WaterHistory.tsx` — RSC reads `water_log` via `lib/dashboard/aggregate.ts`-style helper.
- No DB changes. No API changes. No new types beyond `WaterLogRow` already in `lib/dashboard/types.ts`.
- Tests: 1 component (history list), 1 E2E (FAB → /log/water → +glass → see in totals), reuse existing RLS coverage.

### Path C — request goes deeper (e.g., per-meal water tracking, hydration goals on Progress)
Out of scope for bugfix-tomi. Escalate to brainstorm-tomi FA.

## Proposed Change (Diff Outline) — Path B if user gates that way
- 1 new route: `app/(app)/log/water/page.tsx`
- 1 new component: `app/(app)/log/water/_components/WaterHistory.tsx`
- 1 modified component: `components/dashboard/WaterTracker.tsx` — add `variant="page"` prop for wider layout (or factor `WaterQuickAdd` already-internal client into reusable form — the file's docstring shows `<WaterQuickAdd>` is already split out internally)
- 1 new test: `tests/unit/components/log/water/page.test.tsx` (or component test for variant)
- 1 new E2E: `tests/e2e/water-log-from-fab.spec.ts` (depends on Bug #5 FAB)

## Files Affected (Path B, conditional)
- New: `app/(app)/log/water/page.tsx`, `app/(app)/log/water/_components/WaterHistory.tsx`
- Modified: `components/dashboard/WaterTracker.tsx` (variant prop only)
- New tests: 1 unit/component, 1 E2E

## TDD Required
yes (logic-touching) — for Path B, write component test for variant rendering before implementation; reuse existing API/route tests unchanged.

## Test Approach
Path A: re-tested via Bug #5's FAB tests.
Path B: 1 new component test (variant prop renders history list) + 1 E2E (FAB → page → quick-add → returns to dashboard with updated total). RLS, route, optimistic rollback all already covered by Phase 3 sweep.

## Risk Assessment
**low (Path A) / low-medium (Path B)** — original "high" framing was based on incorrect Phase 0 assumption. No DB migration, no new RLS, no new auth surface, no new Gemini calls.

## Regression Sweep Needed
- Existing dashboard `WaterTracker` (must not regress)
- Bug #5 FAB integration on dashboard
- Mobile-responsive coverage from Bug #1

## UI Touching
true (small)

## Quick-Pick Citation
ui-design.md §7.1.5 (lines 917–953) — water tracker spec: 8-bullet grid, slate fill, 44×44 chips, `aria-live="polite"` announces total. ui-design.md §2.4 (line 22) — circle exception for water bullet. Quick-Pick `web-ui-guide.md` not loaded in this session — for FAB entry-point patterns the relevant section is "icon-only buttons" + `aria-label` (ui-design.md §10 a11y line 2880 lists "FAB ('New log entry')" as the canonical icon-only label pattern).

## Design-Doc Edits Required (revised)
- **NONE for Task 3.5** — already marked Completed. Do NOT re-mark via this batch.
- If Path B ships: tiny CHANGELOG entry under Phase 3 follow-on / mobile-UI-overhaul Phase 8.
- If Path A: subsumed under Bug #5's CHANGELOG line.

## Cross-bug Dependencies
- **Bug #5** (FAB) — primary owner of the entry-point UX. Bug #6 either folds into Bug #5 (Path A) or ships a target route Bug #5 links to (Path B).
- **Bug #1** (mobile responsive) — applies to any new page in Path B.

## Open Questions (USER GATE — Phase 2 must answer before Phase 3 begins)
1. **Did you mean a FAB-with-two-actions, or a dedicated /log/water page, or both?** Phase 0 framed this as "build the whole vertical slice" but that's already done. Please confirm which scope you actually want.
2. If FAB-only (Path A): close Bug #6 as duplicate of Bug #5 and have Bug #5's spec require two affordances.
3. If dedicated page (Path B): confirm what the page contains beyond the existing `WaterTracker` chip — e.g., per-entry history list with delete (deletes already supported via existing API + undo toast)?
4. **Default daily target:** already `2000ml` (8 × 250ml glasses) per WaterTracker docstring — keep or change?
5. **Migration tooling concern:** N/A — no migrations needed for either path.

## STOP-THE-WORLD recommendation
Do NOT proceed to Phase 2 implementation planning until user clarifies scope. Phase 0 instruction to "fold all of Task 3.5 into this batch" is based on a false premise (Task 3.5 is done). Re-running Task 3.5 would produce duplicate migrations, duplicate routes, and duplicate components — a regression, not a fix.
