# Nav Full-Suite Isolation Debug

## Scope

Targeted test-only isolation for `tests/components/nav/nav-shell.test.tsx`. No app source was changed.

## Diagnosis

The nav failures were consistent with test harness leakage, not a `NavShell` source regression:

- `nav-shell.test.tsx` passed in isolation before edits, so the component behavior was not directly broken.
- Full-suite failures appeared only in water-FAB mock/toast tests and showed stale success toasts, polluted mock counts, and missing cap-toast descriptions.
- The nav test reset `useUndoQueueStore` by replacing `stack: []`, but that did not clear each toast entry's `timerId`.
- The water-FAB tests intentionally reuse deterministic `client_id`/toast ids via mocked `crypto.randomUUID`; stale timers from prior tests could therefore mutate later tests that reused the same ids.
- Prior full-suite output also showed leftover Radix/remove-scroll globals (`body data-scroll-locked="1"` and focus guards), so the nav test now clears those before and after itself.

## Changes

Changed:

- `tests/components/nav/nav-shell.test.tsx`

Test-only changes:

- Wrapped the local `authFetchMock` implementation in `installAuthFetchMock()` so `beforeEach` can reset and reinstall it deterministically.
- Reset `authFetchMock` alongside `authPostMock`.
- Added `resetUndoQueueForNavTest()` to clear existing toast timers before wiping the undo queue.
- Added `cleanupModalGlobalsForNavTest()` to remove body scroll-lock attributes/styles and Radix portal/focus-guard leftovers.
- Made `afterEach` drain two microtasks, clear toast timers/store state, reset water/dashboard transition stores, restore spies, and clean modal globals.

## Verification

Passed:

```text
pnpm vitest run tests/components/nav/nav-shell.test.tsx --pool threads --maxWorkers 1 --reporter verbose
```

Result: `1` file passed, `30` tests passed.

Passed grouped nav-after-polluters check:

```text
pnpm vitest run tests/components/library/FoodDetail-LogNow.test.tsx tests/unit/components/log-flow/DiscardDraftAlertDialog.test.tsx tests/components/nav/nav-shell.test.tsx --pool threads --maxWorkers 1 --reporter verbose
```

Result: `3` files passed, `44` tests passed. The nav suite contributed `30/30` passing tests.

Additional grouped probe:

```text
pnpm vitest run tests/components/library/LibraryClient.quick-actions.test.tsx tests/components/library/FoodDetail-LogNow.test.tsx tests/unit/components/log-flow/DiscardDraftAlertDialog.test.tsx tests/components/nav/nav-shell.test.tsx --pool threads --maxWorkers 1 --reporter verbose
```

Result: nav still passed `30/30`, but the command failed on an unrelated existing blocker in `LibraryClient.quick-actions.test.tsx`: Add Item expected `openModal('type', { mode: 'library-only' })`, while the component hit an unmocked `/api/library/quota` `authFetch` path and returned `undefined`.

## Residual Risk

This worker did not run the full `pnpm test` suite. The targeted nav isolation failure is addressed and verified against isolated and grouped commands, but the wider batch still has at least the separate `LibraryClient.quick-actions.test.tsx` quota mock/test issue noted above.
