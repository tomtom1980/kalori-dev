# Fix R3 — components/dashboard/WaterTracker.tsx

## Findings addressed
- C1-prime (Critical): passive-effect timing hole — `useEffect`-mirrored `resetKeyRef` runs at the passive layer (after paint), but a resolved Promise's `.then()` continuation runs as a microtask which fires BEFORE passive effects flush. In that window the ref still holds the stale `issuedResetKey`, the guard passes, and `setCommittedConsumedMl(c => c + ml)` double-adds against a server baseline that already absorbed the write.

## Change
`useEffect → useLayoutEffect` on the `resetKeyRef` mirror block (one-line semantic change + import swap).

- `import { ..., useEffect, ... } from 'react'` → `import { ..., useLayoutEffect, ... } from 'react'`
- `useEffect(() => { resetKeyRef.current = resetKey; }, [resetKey])` → `useLayoutEffect(() => { resetKeyRef.current = resetKey; }, [resetKey])`

The callback body is unchanged — single ref assignment, no other side effects.

Comment block expanded to document the C1-prime rationale and SSR-safety reasoning so a future reader does not "fix the SSR warning" by reverting.

## Test added
`tests/unit/components/dashboard/WaterTracker.test.tsx`

Added 2 sibling tests inside the existing "prop-sync after RSC re-render (Bug-2 regression guard)" describe block:

1. **`'C1-prime: resetKeyRef mirror uses useLayoutEffect (not passive useEffect)'`** — code-level assertion that parses `WaterTracker.tsx` source and pins:
   - The resetKeyRef mirror block uses `useLayoutEffect` (NOT `useEffect`)
   - The component starts with the `'use client'` directive (SSR-safety contract for `useLayoutEffect`)
   - The `useLayoutEffect` symbol is present in the React import statement

2. **`'C1-prime: success-path commit skipped after baseline shifts (layout-effect form)'`** — behavioural pin: pre-resolves the in-flight POST BEFORE the rerender, so the `.then()` microtask is queued ahead of the rerender's commit + effect flush. Asserts the readout stays at 750 (not 1000) after the chained sequence.

### Why a code-level assertion in addition to a behavioural one

The directive's "microtask-resolving promise + manual scheduler control" pattern works in production timing but is collapsed inside React's `act()` (used implicitly by RTL's `render`/`rerender` and explicitly by `await act(...)` blocks). `act` flushes microtasks AND passive effects atomically before returning, so the production race window is invisible inside any act-wrapped test. The simplest manual scheduler control is the code-level pin — it catches a regression where someone reverts to `useEffect` (e.g., chasing an SSR warning) without realising they reopen the C1-prime race. The behavioural test continues to exercise the realistic flow under layout-effect timing as a redundant safety net.

The production-timing race itself is covered by the existing E2E sweep in Phase 7 (`tests/e2e/nav-responsive.spec.ts`) which runs without `act` wrappers.

## RED Verification

Initial run with `useEffect` (pre-fix):

```
× C1-prime: resetKeyRef mirror uses useLayoutEffect (not passive useEffect)
   AssertionError: expected 'useEffect' to be 'useLayoutEffect' // Object.is equality
   Expected: "useLayoutEffect"
   Received: "useEffect"
   at tests/unit/components/dashboard/WaterTracker.test.tsx:364:34

✓ C1-prime: success-path commit skipped after baseline shifts (layout-effect form)

Tests  1 failed | 1 passed
```

The code-level test fails RED as expected; the behavioural test passes both before and after the fix (because act-collapsed timing already covers the layout-effect ordering).

## GREEN Verification

After applying the fix:

```
✓ C1-prime: resetKeyRef mirror uses useLayoutEffect (not passive useEffect)  1ms
✓ C1-prime: success-path commit skipped after baseline shifts (layout-effect form)  62ms

Tests  11 passed (11)
Test Files  1 passed (1)
```

All 11 WaterTracker tests pass. No regressions in the existing 9 tests (the C1 round-1 behavioural test still passes; the Bug-2 prop-sync tests still pass; the F-WATER-CHIP-STALE-LOGGEDON test still passes).

## Regression Sweep

Broader dashboard suite (`tests/unit/components/dashboard/`):

```
Test Files  11 passed (11)
Tests       76 passed (76)
Duration    1.77s
```

All dashboard component tests green. No flakes; no new warnings beyond pre-existing test-mocked error logs from `TargetUpdatedNudgeWrapper`'s deliberate-failure scenarios (those are intentional — those tests assert an error path).

TypeScript:

```
$ npx tsc --noEmit
(no output)
```

Clean — no type errors.

## SSR safety check

`'use client'` directive confirmed: **yes**. Line 1 of `components/dashboard/WaterTracker.tsx` is `'use client';`. The component is rendered inside the dashboard RSC tree but as a client island (per Task 3.5's island architecture), so it never executes on the server. `useLayoutEffect` therefore cannot emit its SSR warning here. The CODE-LEVEL test pins this contract so a future refactor cannot break it silently.

The pattern in this codebase has precedent: `components/offline/OfflineBar.tsx` uses `useLayoutEffect` directly in a client component, and `components/pwa/sw-register.tsx` also uses it. Both run client-only without SSR warnings.

## False-positive flag
`false_positive: false`

C1-prime is a real concurrency hazard. While `act`-wrapped tests can't observe the production race directly (act collapses microtask + passive-effect timing), the underlying React 19 scheduler does have this ordering in production and concurrent rendering can widen the window further. The fix is the canonical React pattern for "ref must be live before next microtask" (mirror via `useLayoutEffect`, sync with commit phase).
