# Bug 2: Dashboard chip not updating after FAB tap — local state shadows fresh `initial` prop

## Classification
known_fix

## Root Cause

`components/dashboard/WaterTracker.tsx:54-67` — the chip seeds `useOptimistic`'s base state from `useState(initial.consumedMl)`. **`useState` initializers run ONCE at first mount**; React reuses the same component instance across re-renders triggered by `router.refresh()` and never re-runs the initializer when the `initial` prop changes. After a successful FAB POST → `router.refresh()` → dashboard RSC re-renders with FRESH `snapshot.water.consumedMl` from `fetchDaySnapshot` → `<WaterTracker initial={{ consumedMl: <fresh> }} />` re-renders the same instance → BUT `committedConsumedMl` (line 55) still holds the original mount-time value → `baseState.consumedMl` (line 58) shadows the fresh prop → the chip displays stale data despite the RSC having delivered fresh data.

This is the canonical "useState shadows props" anti-pattern. The Codex R1 I1 recommendation of "call `router.refresh()`" was correct as far as it went — it forces a fresh RSC read — but Codex did NOT inspect `WaterTracker`'s state reducer and so missed the consumer-side shadowing. The lessons-relevant line 48 (`useOptimistic` decay) hint applies directionally but NOT mechanically: the failure here is not optimistic decay (the optimistic state actually persists fine after the chip's OWN tap) — it's that the `initial` prop, after the FAB tap path, NEVER reaches the rendered tree because local state owns the value.

**Verification trail:**
- `app/(app)/dashboard/page.tsx:47` — `export const dynamic = 'force-dynamic'` ✓
- `app/(app)/dashboard/page.tsx:76` — `await fetchDaySnapshot(user.id, profile, today, tz, now)` ✓ called fresh on every RSC render
- `lib/dashboard/fetch.ts:15-21` — `unstable_cache` wrappers REMOVED; only React `cache()` for per-request dedupe ✓ no cross-request cache to invalidate
- `next.config.ts:22` — `cacheComponents` is intentionally NOT enabled; `revalidateTag` (api/water/log:81,113,120) is forward-compat no-op ✓ no cache layer between fetch and component
- `components/nav/nav-shell.tsx:202` — `router.refresh()` is called post-success ✓
- **`components/dashboard/WaterTracker.tsx:55`** — `useState(initial.consumedMl)` ← THE bug. `committedConsumedMl` never re-syncs.

The chip's OWN tap path (chips inside `WaterTracker`) works fine because `setCommittedConsumedMl((current) => current + ml)` (line 86) increments the local state on the same component's success branch. The FAB tap path BYPASSES the chip's reducer entirely — it goes through nav-shell.tsx's POST + `router.refresh()` → re-renders the dashboard with fresh `initial` props → those props get IGNORED by the chip's stuck `useState`.

## Proposed Change (Diff Outline)

`components/dashboard/WaterTracker.tsx`:
- Add `import { useEffect } from 'react'` (alongside existing `startTransition`, `useOptimistic`, `useState`).
- Add a `useEffect` after the `useState` declarations that syncs local committed state with the `initial.consumedMl` prop:
  ```
  useEffect(() => {
    setCommittedConsumedMl(initial.consumedMl);
    setResetKey((k) => k + 1);  // also bump resetKey so any in-flight optimistic add is discarded
  }, [initial.consumedMl]);
  ```
- The `setResetKey` bump is defense-in-depth: if a chip-tap optimistic add is mid-flight when fresh server data arrives via `router.refresh()`, the resetKey increment forces React to drop the optimistic state and replay against the fresh base. (Without this, the user could see consumed = serverTotal + chip-pending-delta until the chip's transition resolves.)
- Update the comment block (lines 1-20 + 47-68) to reference Bug-2 of this batch and explain the prop-sync contract.

NO change to `nav-shell.tsx` for this bug — its `router.refresh()` is the correct trigger; it just needs a working consumer.

NO change to `app/api/water/log/route.ts` — `revalidateTag` is already forward-compat for the eventual `cacheComponents:true` flip; `revalidatePath('/dashboard', 'page')` is NOT needed here because the dashboard is `force-dynamic` and `router.refresh()` from the client is the canonical invalidation primitive under the current regime.

NO change to `next.config.ts` — `cacheComponents:false` stays.

`tests/unit/components/dashboard/WaterTracker.test.tsx`:
- Add TDD test: render with `initial.consumedMl: 0`, verify `screen.getByTestId('water-consumed-ml').textContent` is `'0'`. Re-render same component instance with `initial.consumedMl: 250`. Assert the readout NOW shows `'250'`. CURRENT implementation: still shows `'0'` (stale `useState`) → test FAILS RED. After fix: shows `'250'` → test PASSES GREEN.
- Add a follow-up test: tap the GLASS chip (optimistic +250), assert readout shows `'500'` (250 base + 250 optimistic). Then re-render with `initial.consumedMl: 500` (server caught up via FAB-elsewhere path). Assert readout shows `'500'` (NOT `'750'` — the optimistic delta is dropped because `resetKey` bumped).

`tests/e2e/nav-responsive.spec.ts` (Phase 7):
- After tapping the water FAB, assert the dashboard `water-consumed-ml` testid increments by 250 ml without manual reload. Use `page.waitForResponse('/api/water/log')` before the tap, then assert the readout updates within 1 s of the response. Mobile viewport.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` (production)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WaterTracker.test.tsx` (TDD)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\nav-responsive.spec.ts` (E2E — Phase 7, may share with Bug 1's E2E)

Total: 3 files (the E2E spec is shared with Bug 1, so net new = 2 production-touching). Within budget.

## TDD Required
yes — the failure mode (local state shadowing fresh props) is exactly the kind of consumer-side defect that the lessons-relevant line 28 ("live wire, dead consumer") flags: the boundary write (`router.refresh()` re-renders with fresh prop) is fine, the consumer (chip's `useState`) ignores the wire. Tests must assert effective behavior — readout updates after prop change — not just presence.

## Test Approach

1. **Unit (Vitest, RED-first prop-sync test):**
   ```
   it('syncs committedConsumedMl when initial.consumedMl prop changes (FAB-elsewhere path)', () => {
     const { rerender } = render(
       <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} loggedOn="2026-05-09" />
     );
     expect(screen.getByTestId('water-consumed-ml').textContent).toContain('0');
     rerender(
       <WaterTracker initial={{ consumedMl: 250, targetMl: 2000, entries: [] }} loggedOn="2026-05-09" />
     );
     expect(screen.getByTestId('water-consumed-ml').textContent).toContain('250');
   });
   ```
   Current code: `useState(initial.consumedMl)` initializer runs once → reread shows '0' → FAILS. After fix (`useEffect` sync): reread shows '250' → PASSES.

2. **Unit (optimistic-discard-on-prop-sync):** verify in-flight optimistic state is dropped when `initial.consumedMl` changes. Render with `initial: 0`, click GLASS chip, mock `authPost` to return a never-resolving promise so the optimistic state stays. Verify readout shows `250`. Re-render with `initial: 500`. Assert readout shows `500` (not `750`). The `resetKey` bump in the `useEffect` should force React to discard the pending optimistic transition.

3. **E2E (mobile viewport):**
   - Start on `/dashboard`. Read `water-consumed-ml` baseline.
   - `const waterPost = page.waitForResponse('/api/water/log');`
   - Tap water FAB.
   - `await waterPost; expect(post status).toBe(200);`
   - Wait for the chip's readout to increment by 250 ml (poll up to 1.5 s).
   - Assert no manual reload was needed.

4. **Behavior-not-presence assertion:** the readout text must INCREMENT (mathematical comparison) — not just "exist with some non-empty content". Read baseline before tap, parse to Number, assert post-tap >= baseline + 250.

## Risk Assessment

low — adding a `useEffect` that syncs ONE state value with ONE prop is a textbook React pattern. The `resetKey` bump for optimistic-discard is the only subtle piece; verify by inspection that `useOptimistic`'s `baseState` reads `committedConsumedMl` and `resetKey` (lines 57-60) and that the React reducer (lines 61-67) treats `resetKey` as a regenerable identity (it does — it's not a key prop, just a discriminator passed to `useOptimistic`).

One nuance: changing `resetKey` while a transition is mid-flight may cause `useOptimistic` to re-derive the optimistic state from the new base. Verify the React docs / try a unit test to confirm React 19 behavior. Worst case: the user briefly sees `consumedMl = newServerTotal` (correct) and then `consumedMl = newServerTotal + chipOptimisticDelta` (also correct, just temporarily double-counted) — but this is a corner case (user taps chip THEN FAB-elsewhere within ~200 ms), and the resolution is automatic on the chip's `setCommittedConsumedMl` success branch.

## Regression Sweep Needed

- `tests/unit/components/dashboard/WaterTracker.test.tsx` (existing tests: optimistic +250, payload shape, 8-bullet grid render — all should remain green; the new effect adds a sync, doesn't change existing reducer behavior)
- `tests/e2e/dashboard-*.spec.ts` (any spec that exercises the chip's optimistic increment — unaltered)
- `components/dashboard/WaterTracker.tsx` consumers: only `app/(app)/dashboard/page.tsx` reads it (verified via Grep) — no other surface to sweep
- Followup `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09` (project-context line 18) — same component but different bug (stale `loggedOn` prop captured at render time). The `useEffect` sync we're adding for `consumedMl` does NOT incidentally fix the `loggedOn` bug; the followup remains open. Note in the proposal that this batch deliberately does NOT address F-WATER-CHIP-STALE-LOGGEDON.

## UI Touching
true — the visible bullets + ml readout in the dashboard chip update without manual reload after FAB tap. No new UI primitive — same component, same render tree. The fix changes data flow inside the existing `WaterTracker` only.

## Library / Pattern Prescriptions Used

- **`useEffect` to sync derived local state with props** (canonical React pattern; React docs "You Might Not Need an Effect" specifically lists this as a legitimate use of effects when local state must reset on prop change).
- **`router.refresh()` + `force-dynamic` + uncached fetch** (lessons-relevant line 48-56 + Next.js 16 App Router): the existing infra-level invalidation chain is correct. The consumer-side fix completes the chain.
- **`useOptimistic` reset-key pattern** (already in use lines 57-67): bump `resetKey` to force React to drop pending optimistic transitions when the underlying base changes — defensive against the "FAB-elsewhere fired during chip's optimistic window" race.

NOT applicable: `cacheComponents:true` migration, `revalidatePath('/dashboard', 'page')`, `useWaterTrackerStore` Zustand co-location. Lessons line 56 hypothesis (missing `revalidatePath`) is RIGHT directionally but does not apply because the route is `force-dynamic` + uncached — the cache layer Codex was thinking of doesn't exist on `/dashboard` under the current regime.

## Open Questions

1. **`useOptimistic` + `resetKey` interaction in React 19** — does React 19 reliably drop in-flight optimistic transitions when the `useOptimistic` base state's identity changes mid-transition? If not, the `setResetKey` bump in the effect is a no-op and the optimistic-discard test will fail. Implementation sub-agent must verify by writing the test FIRST and observing behavior. Fallback: drop the `setResetKey((k) => k + 1)` line and accept the corner-case temporary double-count (which the chip's own success path resolves within milliseconds).

2. **Followup `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09`** — should this batch ALSO drill `timezone` to `WaterTracker` and recompute `loggedOn` at chip-tap time (mirroring the C2 R3 nav-shell fix)? Pro: same root pattern, would close the followup in the same surgical area. Con: scope creep; user's report is specifically about FAB tap → dashboard freshness, not chip-tap → wrong-day. Recommend DEFER unless user opts in.
