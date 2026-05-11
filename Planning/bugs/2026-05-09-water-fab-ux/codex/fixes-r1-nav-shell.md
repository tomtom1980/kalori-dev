# Fix R1 — components/nav/nav-shell.tsx

## Findings addressed

- **C2 (Critical)**: SessionExpiredError branch in `handleLogWater` returned without dismissing the optimistic success toast, leaving "250 ml logged" + a polite SR announcement on screen for a write that 401'd and never persisted. Violated the batch's truthful-feedback contract.

## Investigation

**Rethrow load-bearing? NO.**

`authFetch` (in `lib/auth/refresh-interceptor.ts`) is the SOLE thrower of `SessionExpiredError`. Before throwing, `authFetch` already calls `forceSignOut()` which (a) calls `supabase.auth.signOut()` and (b) sets `window.location.href = '/login?reason=session_expired'`. The redirect is the load-bearing side effect; the throw is purely informational.

In `nav-shell.tsx`, `handleLogWater` consumes the rejection inside a `void (async () => { ... })()` IIFE. There is no upstream consumer that could act on a rethrown `SessionExpiredError` — a rethrow would become an `unhandledrejection`, served by no one. The previous `return` (rather than rethrow) was the correct flow-control choice for a void IIFE; the bug was that `return` skipped the toast retraction.

Other callers in the codebase (`WaterTracker.addWater`, `MealEntryContextTrigger`) do `if (err instanceof SessionExpiredError) throw err;` because they run inside `startTransition`, which has its own error consumer. That pattern is NOT applicable to the FAB's bare void IIFE.

**Verdict per Codex implementation hint Option (a):** Treat `SessionExpiredError` like generic errors for the dismiss step. Drop the special-case branch entirely.

## Changes

- `components/nav/nav-shell.tsx`:
  - Removed `if (err instanceof SessionExpiredError) { return; }` early-exit branch (lines 232-238 in pre-fix file).
  - Both error paths now flow through the same dismiss-and-swap: `dismiss(clientId)` + `pushToast(waterLoggedFailed, kind:'delete-failed', ttlMs:2000)`.
  - Replaced inline `(err)` catch binding with bare `catch {}` since the error value is no longer inspected.
  - Dropped the now-unused `SessionExpiredError` import.
  - Added inline comment explaining why the special case was removed (truthful-feedback contract; redirect can be slow on mobile; rethrow has no consumer in a void IIFE).

## Tests added

- `tests/components/nav/nav-shell.test.tsx` (in the existing `Bug-1 — water FAB toast fires synchronously (instant feedback)` describe block):
  - **`'on SessionExpiredError, dismisses success toast and pushes error toast (truthful feedback for non-persisting writes)'`**
  - Mocks `authPost` to reject with `new SessionExpiredError()`.
  - Captures the success toastId synchronously, then drains microtasks.
  - Asserts: stack length is 1 after the catch runs; the remaining toast's `toastId` is DIFFERENT from the success toastId (proves the success toast was actually dismissed, not coincidentally replaced); `description === t.fab.waterLoggedFailed`; `kind === 'delete-failed'`; `ttlMs === 2000`.
  - Imports `SessionExpiredError` from `@/lib/auth/refresh-interceptor` (the existing `vi.mock(...importOriginal)` pattern preserves the real class export through `...actual`).

## Verification

```
Test Files  1 passed (1)
     Tests  21 passed (21)
  Duration  1.44s
```

All 21 tests in `tests/components/nav/nav-shell.test.tsx` GREEN, including the new C2 regression. RED was first confirmed against the pre-fix code (the new test failed with `expected 0 elements at stack[0]` — no error toast pushed because the `return` skipped the swap).

`npx tsc --noEmit` — clean (no output).

## False-positive flag

false_positive: false
