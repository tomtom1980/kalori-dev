# Bug 1 — Implementation Output

## Store-API decision

**Added `dismiss(clientId: string): void` to `useUndoQueueStore`.**

Investigation of `lib/stores/useUndoQueueStore.ts` showed:
- `dismissTop()` only targets the newest non-dismissed entry, leaves it in the stack with its commit timer still ticking — wrong primitive for "retract THIS specific optimistic toast".
- No `updateToast(clientId, partial)` exists.
- LIFO/FIFO eviction would not naturally retract a 2 s success toast on a synchronous failure path.

`dismiss(clientId)` removes the entry by `clientId`, clears the entry's `setTimeout` (so no commit fires for a never-persisted optimistic state), and is a no-op when no entry matches (returns the same state object — reference-equal — so subscribers don't re-render). It is **tab-local only** (no cross-tab broadcast), matching the existing scope contract for `dismissTop` and `clearOnNav` (only `pushToast` is broadcast). One file touched, fully backward-compatible — zero existing callers needed changes.

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (production: `handleLogWater` restructured fire-and-forget; JSX `onClick` simplified)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useUndoQueueStore.ts` (production: added `dismiss(clientId)` to public API + implementation)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx` (4 new RED→GREEN tests under new `describe('Bug-1 — water FAB toast fires synchronously (instant feedback)')`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\stores\useUndoQueueStore.test.ts` (3 new tests under `describe('Bug-1 — dismiss(clientId)')`)

## Tests Added/Modified

**`tests/components/nav/nav-shell.test.tsx`** (4 new tests, appended at end of `<NavShell />` describe):
1. `'pushes the success toast SYNCHRONOUSLY in the click handler before awaiting POST'` — never-resolving `authPost`; assert stack length 1 with NO awaits after `fireEvent.click`.
2. `'on POST failure, dismisses the success toast and pushes an error toast (swap, not stack)'` — verifies success → dismiss → error toast swap, asserts only 1 entry in stack post-failure (proving `dismiss` was invoked, not just superseded).
3. `'on POST success, leaves the success toast in the queue (no spurious dismiss)'` — asserts identical `toastId` before and after `await`s; no replacement toast.
4. `'rapid double-tap still produces one POST + one success toast (ref-latch holds)'` — verifies ref-latch position relative to the synchronous toast push.

**`tests/unit/lib/stores/useUndoQueueStore.test.ts`** (3 new tests):
1. `'removes the entry whose clientId matches and clears its commit timer'` — proves timer is cleared (commit does NOT fire after 10 s).
2. `'targets a SPECIFIC entry (not the newest like dismissTop)'` — proves clientId targeting (older entry, not newest).
3. `'is a no-op when no entry matches (does not throw, does not mutate)'` — proves reference-equal state for non-matching clientId.

## RED Verification

Ran the 4 new nav-shell tests against the OLD `handleLogWater` (toast push AFTER `await`); all 4 failed for the right reason:

```
× pushes the success toast SYNCHRONOUSLY in the click handler before awaiting POST
× on POST failure, dismisses the success toast and pushes an error toast (swap, not stack)
× on POST success, leaves the success toast in the queue (no spurious dismiss)
× rapid double-tap still produces one POST + one success toast (ref-latch holds)

AssertionError: expected [] to have a length of 1 but got +0
```

Stack was empty on synchronous inspection because the toast was pushed AFTER `await authPost(...)` — exactly the latency bug the test was designed to catch. Not a "module not found" or "matcher" failure; the failures pinpoint the latency contract.

## GREEN Verification

Post-fix run on `tests/components/nav/nav-shell.test.tsx`:
- **20 tests / 20 passed** (4 new + all 16 prior nav-shell tests still pass — including the I1 router.refresh, C2 tap-time tz, ref-latch, payload shape, no-navigate, error-toast cases).

## Regression Sweep

Broader sweep on every consumer of the store I touched plus the cross-tab integration suite:

```
tests/unit/lib/stores/useUndoQueueStore.test.ts       (16 + 3 new = 19 tests)
tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts (10 tests)
tests/components/nav/nav-shell.test.tsx               (16 + 4 new = 20 tests)
                                                     ----- 46/46 passed

# Plus all toast/log-flow/dashboard meal-entry consumers of the store:
tests/unit/components/toast/UndoToast.test.tsx
tests/components/log-flow/* (8 files)
tests/integration/log-flow-clears-draft-after-save.test.tsx
tests/integration/library-page.test.tsx
tests/components/log-page-deep-link.test.tsx
tests/unit/components/dashboard/MealEntryContextTrigger.test.tsx
                                                     ----- 93/93 passed
```

Cross-tab broadcast unchanged: `dismiss` does NOT broadcast (matching `dismissTop`/`clearOnNav` scope), so the existing 10-test cross-tab suite passes unchanged.

## TS / Lint

- `npx tsc --noEmit` — **clean** for all 4 files I touched (filtered to `nav-shell` + `useUndoQueueStore`: zero errors).
- `npx eslint <my files>` — clean.
- (Note: project-wide `tsc --noEmit` shows pre-existing errors in `tests/unit/components/dashboard/WaterTracker.test.tsx` — those belong to Bug 2's surface, not Bug 1.)

## UI Library Prescription Check

**Citation:** `~/.claude/skills/ui-design/web-ui-guide.md` Quick-Pick Decision Table (Section 1) covers animation libraries; this bug is an **invocation-order** fix on the kalori-canonical UndoToast surface, not a new animation pick. The pattern citations:

- **kalori-canonical UndoToast** (project-context line 14): `useUndoQueueStore.pushToast({ kind:'delete-failed', description, ttlMs:2000 })` — reused verbatim. `kind:'delete-failed'` keeps the toast non-undoable, correct since water-log is non-undoable.
- **Optimistic UI / instant feedback** (web-ui-guide.md Section 1, fire-and-forget pattern): UI feedback fires on click tick; reconciliation lives in the catch branch. The toast IS the only visible feedback (no chip/counter on the FAB itself), so the toast layer is the right surface — not a separate `useOptimistic` reducer.
- **Synchronous re-entrancy gate** (lessons-relevant line 12): `useRef<boolean>` ref-latch retained — orthogonal to the toast change; protects the network even when the user spams.
- **`dismiss(clientId)` extension** parallels the prior batch's `ttlMs?` extension: backward-compatible, single-file, single-test, no caller audit needed.

## Deviations from Proposal

1. **Handler signature changed `async function` → `function` returning `void`.** The proposal phrased the change as "push toast pre-await", which works either way; making the handler synchronous + firing `void (async () => { ... })()` is the cleanest expression of fire-and-forget — the JSX `onClick` no longer needs `void handleLogWater()` and it's structurally impossible for any awaiter to block on the network. Net code is shorter and the contract (no awaitable network result for the click handler) is enforced by the type system. Approved per "minimal-cost option" and "surgical changes" rules.
2. **No E2E added** — the proposal mentions `tests/e2e/nav-responsive.spec.ts` as Phase 7 work; that's the conditional E2E phase under the bugfix-tomi skill, not Phase 3. Left for Phase 7 sub-agent.

## Status
implemented
