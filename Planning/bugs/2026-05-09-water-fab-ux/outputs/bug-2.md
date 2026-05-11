# Bug 2 + chip-loggedOn followup — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` (production — Fix A useState-during-render sync + Fix B timezone prop drill + reducer resetKey-discard guard)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\dashboard\page.tsx` (production — pass `timezone={tz}` instead of `loggedOn={today}`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WaterTracker.test.tsx` (tests — added `userTzToday` mock, switched all renders to `timezone="UTC"`, added 3 new tests for Bug-2 + followup)

## Tests Added/Modified

**Added (3 new tests):**
1. `prop-sync after RSC re-render (Bug-2 regression guard) > updates committed consumedMl when initial prop changes (e.g., after router.refresh from FAB)` — pins re-render-with-fresh-prop sync.
2. `prop-sync after RSC re-render (Bug-2 regression guard) > preserves optimistic increments across initial-prop updates (resetKey discards in-flight optimistic delta)` — pins resetKey-discard contract during in-flight optimistic delta.
3. `logged_on derivation at tap time (F-WATER-CHIP-STALE-LOGGEDON-2026-05-09) > computes loggedOn at tap time using current timezone (does not capture render-time stale value)` — pins tap-time `userTzToday(timezone)` recompute, mirrors C2 nav-shell pattern.

**Modified (5 existing tests):** all 5 existing renders updated from `loggedOn="2026-04-22"` to `timezone="UTC"`. The `fires authPost with...` test still asserts `logged_on: '2026-04-22'` because the new test mock sets `userTzTodayMock.mockReturnValue('2026-04-22')` in `beforeEach`. Behavior contract preserved.

## Fix A — useState-during-render sync (Bug-2)

**Pattern chosen:** "Adjusting state while rendering" via a previous-prop discriminator (React docs "You Might Not Need an Effect" canonical pattern), NOT `useEffect(() => setState(...), [prop])`.

**Reason:** The repo's React 19 lint config (`react-hooks/set-state-in-effect`) flags the `useEffect` form as an antipattern. The during-render form is rule-clean, runs at most once per prop change (guarded by `prevInitialConsumedMl !== initial.consumedMl`), and avoids the cascading-render concern.

**State variables synced:**
- `committedConsumedMl` ← `initial.consumedMl` (the load-bearing fix for Bug 2)
- `resetKey` bumped (defense-in-depth for the in-flight-optimistic-delta race)
- `prevInitialConsumedMl` updated (the discriminator)

**Reducer hardening:** the `useOptimistic` reducer was extended to take an `issuedResetKey` field on each action. Captured at `addWater` issue time, compared in the reducer; if `delta.issuedResetKey !== state.resetKey`, the action is dropped (state passed through). This makes the resetKey bump semantically meaningful — without it, React 19's `useOptimistic` replays pending actions through the reducer on every base-state change, re-applying the delta against the new baseline and producing the double-count the proposal warned about.

## Fix B — timezone prop drill (F-WATER-CHIP-STALE-LOGGEDON-2026-05-09)

**Prop API change:** `WaterTrackerProps.loggedOn: string` → `WaterTrackerProps.timezone: string`. The `loggedOn` prop is dropped entirely (component is the sole consumer; no orphan callers).

**Tap-time recompute:** `addWater()` now calls `const loggedOn = userTzToday(timezone);` immediately before constructing the POST body. Mirrors `nav-shell.tsx:176` (`handleLogWater`). Imports `userTzToday` from `@/lib/time/day`.

**Usage sites updated:**
- `app/(app)/dashboard/page.tsx:163-179` — `<WaterTracker initial={...} timezone={tz} />`. The page already had `tz = profile.timezone` available from the `fetchProfile` path, so no new RSC fetch was needed.
- No other callers of `<WaterTracker>` exist in the codebase (verified via Grep).

## RED Verification

Before applying GREEN, ran tests; 4 of 8 failed:

```
× fires authPost with { client_id, unit: "glass", count: 1, logged_on }
  → expected { …(4) } to match object { unit: 'bottle', count: 1, logged_on: '2026-04-22' }
  → received logged_on: undefined
× prop-sync after RSC re-render > updates committed consumedMl when initial prop changes
  → expected '500' to contain '750'
  → received '500' (stale useState init)
× prop-sync after RSC re-render > preserves optimistic increments across initial-prop updates
  → expected '250' to contain '500'
  → received '250' (baseState never re-synced)
× logged_on derivation at tap time > computes loggedOn at tap time using current timezone
  → expected { …(4) } to match object { logged_on: '2026-05-09' }
  → received logged_on: undefined (production code still reads loggedOn prop)
```

All 4 fail for the proposal-predicted reasons.

## GREEN Verification

After GREEN production changes:

- `tests/unit/components/dashboard/WaterTracker.test.tsx` — **8 of 8 tests passing** (5 existing + 3 new).

## Regression Sweep

- `npx vitest run tests/unit/components/dashboard/` — **73 of 73 tests passing across 11 files**.
- `npx vitest run tests/integration/dashboard-page-onboarding-guard.test.ts tests/integration/dashboard-orphan-profile.test.ts` — **31 of 31 passing**.
- `npx vitest run tests/unit/app/layout-timezone-derivation.test.ts tests/components/nav/nav-shell.test.tsx` — **31 of 31 passing** (no contamination of nav-shell C2 contract).

Combined regression sweep: **104 of 104 tests passing across 13 test files**.

## TS / Lint

- `npx tsc --noEmit` (full project) — **clean**.
- `npx eslint components/dashboard/WaterTracker.tsx app/(app)/dashboard/page.tsx tests/unit/components/dashboard/WaterTracker.test.tsx` — **clean** (initial attempt with `useEffect`-form sync triggered `react-hooks/set-state-in-effect`; switched to during-render pattern, lint clean).

## UI Library Prescription Check

Cited principle (per dispatcher's instruction): **"always re-sync local state when its source-of-truth prop changes; don't shadow."** No direct UI-library Quick-Pick match (this is a React anti-pattern fix, not a component-library choice). The cleaner React 19 idiom — guarded `setState` during render via a previous-prop discriminator — is what `react-hooks/set-state-in-effect` is designed to steer toward. The React docs page "You Might Not Need an Effect" lists this exact "reset state when prop changes" pattern with the same shape.

The reducer-side `issuedResetKey` discriminator is a `useOptimistic` discipline applied to a known React 19 quirk: pending actions replay against new base state, so an `issuedResetKey` field on the action payload + a guard in the reducer is the documented workaround when you need a hard reset (rather than a generation-number on the base state alone).

## Followup F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 closure

The followup is now closed by this batch. The Phase 8 closure should remove the entry from `Planning/followups.md` lines 12-31 (verbatim):

```
### F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — WaterTracker dashboard chip has the same stale `loggedOn` bug as the FAB (pre-existing, surfaced by Codex Round 2 C2)

- **Status:** Open (High Priority — pre-existing parallel bug; surfaced by Codex round 2 C2 that called out FAB-only fix scope).
- **Severity:** Critical (durable wrong-day write, same failure mode as FAB C2 just fixed).
- **Source:** Codex Round 3 dispatch (bugfix-tomi batch `2026-05-08-mobile-water-button`); the C2 finding was scoped FAB-only and the chip's identical bug was carved out as this entry per dispatch instruction.
- **Discovered:** 2026-05-09 (during C2 fix application; the chip pattern is identical to the FAB pattern that was just fixed).
- **File:** `components/dashboard/WaterTracker.tsx:54` — receives `loggedOn: string` as a prop and reads it inside `addWater()` (`logged_on: loggedOn` at line ~84). The dashboard RSC (`app/(app)/dashboard/page.tsx`) computes the value once via `userTzToday(profile.timezone)` and drills it; the chip then captures it as a stale value.
- **Symptom:** A long-lived dashboard render (user leaves the tab open across local midnight) that subsequently logs water via the +Glass / +Bottle chips writes `logged_on` to YESTERDAY's date. Same root cause as the C2 FAB bug just fixed in this batch.
- **Recommended fix:** Apply the same `timezone` drill pattern used for the FAB:
  1. Change `WaterTrackerProps` to receive `timezone: string` instead of `loggedOn: string`.
  2. Inside `addWater()`, call `userTzToday(timezone)` immediately before constructing the POST body.
  3. Update `app/(app)/dashboard/page.tsx` to drill `timezone` (already fetched via the profile query) instead of `loggedOn`.
  4. **Alternative**: move the `logged_on` derivation server-side into `app/api/water/log/route.ts` so neither the chip nor the FAB has to compute it. This is a larger refactor but eliminates the entire class of stale-prop bugs at the wire boundary. Consider before applying patch #1 if the API route can be modified safely.
  5. Update unit tests `tests/components/dashboard/WaterTracker.test.tsx` (or wherever the chip is unit-tested) to mock `userTzToday` and verify tap-time recomputation, mirroring the C2 nav-shell test added in this batch.
- **Why deferred:** Dispatch instructions for the round 3 auto-fix sub-agent explicitly scoped C2 to FAB-only ("DO NOT fix the chip"). The chip's bug pre-exists the FAB work and was not within the original Bug-1 scope.
- **Production impact:** Identical to the FAB C2 bug — durable wrong-day water entries for users who keep the dashboard open across midnight. Limited blast radius (single-user MVP, single tab is the common case), but observable.
- **Estimate:** 30-60 min (apply same pattern, update WaterTracker tests, single dashboard page edit).
- **Owner:** TBD — could be picked up as a Minor-mode close-out next session, OR rolled into a broader server-side `logged_on` derivation refactor (alternative #4 above).
- **Related task:** bugfix-tomi batch `2026-05-08-mobile-water-button` (Bug #1 → C2 nav-shell fix; this is the parallel chip bug not in C2 scope).
- **References:** Codex round 3 dispatch instructions (this batch). C2 nav-shell fix: `components/nav/nav-shell.tsx:152-170` (`handleLogWater` calls `userTzToday(timezone)` at tap time). Pattern source: `lib/time/day.ts:33` (`userTzToday`).

---
```

(The `## High Priority — Bug Bundle 2026-05-08-mobile-water-button (2026-05-09)` heading at line 10 should also be removed if no other entries remain under it; verify after deletion.)

Replacement note for `Planning/CHANGELOG.md` (Phase 8 will write this; sample wording):

> **F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 closure** — applied the C2 timezone-drill pattern to the WaterTracker chip in this batch (Bug-2 fix touched the same component and same line surface). Chip now receives `timezone: string` and computes `userTzToday(timezone)` at tap time. Followup entry removed from `Planning/followups.md`.

## Deviations from Proposal

1. **`useEffect` → during-render setState.** The proposal prescribed a `useEffect(() => { setCommittedConsumedMl(...); setResetKey((k) => k + 1) }, [initial.consumedMl])`. The repo's `react-hooks/set-state-in-effect` lint rule flags that form. Switched to the React docs "Adjusting state while rendering" pattern (`if (prev !== curr) { setPrev(curr); setOther(...) }`) which is rule-clean and behaviorally equivalent. Tests pass identically.
2. **Reducer hardened with `issuedResetKey`.** The proposal noted in Open Questions #1 that the resetKey bump might be a no-op in React 19 (it was — pending actions replay through the reducer regardless of base-state identity). Rather than dropping the resetKey bump and accepting the corner-case double-count (the proposal's fallback), I extended the action payload with `issuedResetKey` captured at issue time and made the reducer guard against stale actions. This makes the resetKey contract semantically real: the test `preserves optimistic increments across initial-prop updates` now passes deterministically. This is a small additional surface but stays within `WaterTracker.tsx`. No external API change.
3. **No E2E test added.** The proposal mentioned a Phase 7 E2E spec update; that's owned by a later phase (the dispatcher's contract was Phase 3 implementation only).

## Status

implemented
