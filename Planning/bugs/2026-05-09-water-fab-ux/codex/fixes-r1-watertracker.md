# Fix R1 — components/dashboard/WaterTracker.tsx

## Findings addressed

- **C1 (Critical)** — Baseline refresh + in-flight chip POST → durable double-count. The chip's success-path `setCommittedConsumedMl((c) => c + ml)` was unguarded by the `issuedResetKey` discriminator that Bug 2 added to the optimistic reducer. Race scenario per Codex round 1:
  1. Tap chip → optimistic +250 → POST in flight
  2. While in flight, baseline shifts (e.g., `router.refresh()` after another path persisted the increment server-side) → prop-sync block bumps `resetKey`; the in-flight optimistic action is correctly discarded by the reducer guard
  3. Original POST resolves → `setCommittedConsumedMl((c) => c + 250)` runs → adds 250 to NEW baseline (`750`) that ALREADY includes the server-absorbed +250 → durable chip overstatement of 1000

## Changes

- **`components/dashboard/WaterTracker.tsx`**:
  - Added `useEffect` + `useRef` imports (the closed-over `resetKey` in the `startTransition` async callback is the issue-time value and cannot detect a mid-flight baseline shift; a ref is the standard React workaround for "live-read inside an async closure").
  - Added `resetKeyRef = useRef(resetKey)` + a `useEffect(() => { resetKeyRef.current = resetKey }, [resetKey])` that mirrors the live `resetKey` into the ref. (`useEffect` is required by the repo's `react-hooks/refs` lint rule — refs cannot be updated during render.)
  - Guarded the success-path commit with `if (resetKeyRef.current === issuedResetKey)`. If the keys differ (baseline shifted mid-flight), the commit is skipped — the new baseline absorbed the write server-side and is authoritative.
  - Updated the `issuedResetKey` capture comment to enumerate both consumers (reducer guard from Bug 2, success-path commit from C1).

- **`tests/unit/components/dashboard/WaterTracker.test.tsx`**:
  - Added one new regression test in the `prop-sync after RSC re-render (Bug-2 regression guard)` describe block: `'when baseline updates mid-flight, success-path commit is skipped (no double-count)'`.

## Tests added

- **Path**: `tests/unit/components/dashboard/WaterTracker.test.tsx:241-289`
- **Name**: `'when baseline updates mid-flight, success-path commit is skipped (no double-count)'`
- **Assertions**:
  1. Initial render with `consumedMl: 500` → readout shows `500`
  2. Click `+ GLASS` → optimistic readout shows `750`, POST held pending
  3. Re-render with `consumedMl: 750` (simulating `router.refresh()` after another path persisted the same +250) → readout still shows `750`
  4. Resolve the in-flight POST OK → readout MUST stay at `750` (commit skipped)
  5. Negative assertion: readout does NOT contain `1000` (the pre-fix double-count value)

## Verification

### RED (pre-fix run, captured before applying GREEN)

```
× when baseline updates mid-flight, success-path commit is skipped (no double-count) 85ms
AssertionError: expected '1000' to contain '750'
Expected: "750"
Received: "1000"
```

Failure for the predicted reason — `750 + 250 = 1000` durable double-count, exactly the C1 bug class.

### GREEN (post-fix runs)

- `npx vitest run tests/unit/components/dashboard/WaterTracker.test.tsx` → **9 of 9 tests passing** (5 pre-existing + 3 Bug-2 + 1 new C1).
- `npx vitest run tests/unit/components/dashboard/` → **74 of 74 tests passing across 11 files** (no regressions in MacroBars, Masthead, MealsBulletin, MicronutrientPanel, TargetUpdatedNudge, WaterTracker, WeightQuickAdd, etc.).
- `npx vitest run tests/unit/components/dashboard/WaterTracker.test.tsx tests/components/nav/nav-shell.test.tsx` → **30 of 30 passing** (no contamination of nav-shell C2 contract).

### TS / Lint

- `npx tsc --noEmit` (full project) — **clean** (no output).
- `npx eslint components/dashboard/WaterTracker.tsx tests/unit/components/dashboard/WaterTracker.test.tsx` — **clean** (initial attempt with ref-update during render hit `react-hooks/refs`; switched to `useEffect`-based ref sync, lint clean).

## False-positive flag

`false_positive: false` — Codex caught a real race. The pre-fix branch genuinely produced a durable readout of `1000` after a 750-baseline mid-flight refresh + chip success, exactly per the C1 narrative. The fix surface is contained to `WaterTracker.tsx` (no API change, no new prop, no caller updates). Mirrors the discriminator pattern Bug 2 already established for the reducer; the only new piece is the ref + effect to make `resetKey` readable inside the async success closure.

## Notes / deviations

- **Ref + effect instead of inline closure capture**: The proposal hint suggested `if (resetKey === issuedResetKey)` directly inside the success callback. This would never trigger because the closed-over `resetKey` is the issue-time value, identical to `issuedResetKey`. A ref read is the standard React idiom for "live-read of state inside a closure that outlives the render that created it." Verified: `useEffect` flushes before `userEvent`-driven async resolution lands in the test environment, so the ref is always up-to-date by the time the success callback runs.
- **No reducer action shape change**: The `useOptimistic` reducer's action signature already carries `issuedResetKey` (Bug 2's payload). The C1 fix needs no further reducer surface — only the success-path commit gains the same guard via the ref.
- **No prop API change**: Component signature unchanged.
