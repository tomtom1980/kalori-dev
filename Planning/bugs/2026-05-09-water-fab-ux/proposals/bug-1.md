# Bug 1: Toast latency — confirmation appears after the POST resolves, not on tap

## Classification
known_fix

## Root Cause

`components/nav/nav-shell.tsx:165-222` — `handleLogWater` awaits `authPost('/api/water/log', ...)` BEFORE calling `useUndoQueueStore.getState().pushToast(...)`. The toast pushes inside the `try` block AFTER the network round trip returns. Cross-region latency (Vercel `iad1` ↔ Supabase `ap-southeast-1` ≈ 150–200 ms one-way + server processing + DB insert) means the user sees no acknowledgement for ~500 ms–2 s on real mobile networks. With no immediate visible / haptic feedback the user perceives the FAB as dead and re-taps, multiplying the request volume (the synchronous `isFiringRef` ref-latch already prevents same-tick double-fire, but it does NOT prevent a second tap 800 ms later, which is the exact UX gap).

This is the canonical mobile fire-and-forget feedback gap: the ref-latch protects the network from duplicate writes; the missing optimistic toast leaves the human without a "your tap was received" signal.

## Proposed Change (Diff Outline)

`components/nav/nav-shell.tsx`:
- In `handleLogWater`, push the success toast IMMEDIATELY at the top of the `try` block — BEFORE `await authPost(...)`. Same toast surface (`useUndoQueueStore.getState().pushToast({ kind:'delete-failed', description: t.fab.waterLoggedToast, ttlMs:2000, ... })`), same announcement (`announcePolite(t.fab.waterLoggedAnnounce)`), but synchronous on the click event tick.
- After the POST resolves successfully, do nothing further on the toast (it's already on screen) — keep `router.refresh()` for Bug 2's RSC invalidation contract.
- On the `catch` branch (non-`SessionExpiredError`): the optimistic toast is already showing the success copy, so the catch must REPLACE it with an error toast. Two options:
  1. **Update-in-place:** call `useUndoQueueStore.getState().updateToast(clientId, { description: t.fab.waterLoggedFailed })` if such a primitive exists.
  2. **Remove + push error:** `useUndoQueueStore.getState().dismiss(clientId)` then `pushToast({ kind:'delete-failed', description: t.fab.waterLoggedFailed, ttlMs: 2000 })`.

   Inspect `lib/stores/useUndoQueueStore.ts` API surface during implementation; pick the lighter primitive that already exists. If neither exists, push a SECOND toast with the error copy (the success toast will TTL out at 2 s; the error toast displaces it with a fresh ttl). Sub-agent must verify the queue's "live top" selector (per project-context line 14: `selectLiveTop`) shows the error after the swap rather than re-showing the optimistic success.
- Update inline comment block at lines 144–222 to reference Bug-1 (this batch) and explain WHY the toast is pushed pre-await (instant feedback contract).
- Keep `isFiringRef` synchronous gate, `userTzToday(timezone)` tap-time recompute, `router.refresh()` call (Bug 2 owns whether that stays).

`tests/components/nav/nav-shell.test.tsx`:
- Add a TDD test: arrange a never-resolving `authPost`, click the water FAB, assert the toast appears in the queue SYNCHRONOUSLY (within the same microtask tick as the click — no `waitFor`). Use `useUndoQueueStore.getState().stack` direct inspection.
- Add a second TDD test: `authPost.mockRejectedValueOnce(new Error('500'))`, click, await the rejection, then assert the toast description equals `t.fab.waterLoggedFailed` (success-then-failure swap path).

`tests/e2e/nav-responsive.spec.ts`:
- Add a Playwright assertion that registers `page.waitForResponse('/api/water/log')` BEFORE the click, then asserts the toast text is visible BEFORE the response resolves. Pattern matches lessons-relevant line 30 (`waitForResponse` registered before action). Mobile viewport (375×812).

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (production)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx` (TDD)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\nav-responsive.spec.ts` (E2E — Phase 7)

Total: 3 files. Within budget.

## TDD Required
yes — toast push order vs the `await authPost` boundary is exactly the kind of state/effect contract that mocked TDD must lock in. A passing implementation MUST emit the toast synchronously on click (before the network promise resolves); without an explicit test for the never-resolving-POST case, a future refactor that re-adds the `await` boundary would silently regress.

## Test Approach

1. **Unit (Vitest, in `nav-shell.test.tsx`):**
   - **Sync-emission test (RED-first):** mock `authPost` with `new Promise(() => {})` (never resolves). Click water FAB. Read `useUndoQueueStore.getState().stack` — assert `stack.length === 1` and `stack[0].description === t.fab.waterLoggedToast` IMMEDIATELY (no `await`, no `waitFor`). Current implementation pushes the toast inside the `try` AFTER `await authPost`, so the never-resolving promise leaves `stack.length === 0` — test FAILS RED. After the fix, the toast is pushed pre-await → test PASSES GREEN.
   - **Failure-swap test:** mock `authPost.mockRejectedValueOnce(new Error('500'))`. Click. Initial assertion: success toast is in stack. After `await` cycle, assert the live-visible toast (top of stack) carries `t.fab.waterLoggedFailed` description. Verifies the catch branch swaps the toast.
   - **No double-toast on success:** `authPost.mockResolvedValue({ row: { id: 'w-1' } })`. Click. After resolve, assert `stack.length === 1` (only the optimistic toast — no duplicate post-success push).
   - **`SessionExpiredError` rethrow preserved:** assert no toast is pushed for SessionExpiredError + the error rethrows (existing test should continue to pass — regression guard).

2. **E2E (Playwright, mobile viewport):**
   - `page.setViewportSize({ width: 375, height: 812 })`.
   - Register `const waterPost = page.waitForResponse(r => r.url().endsWith('/api/water/log') && r.request().method() === 'POST')` BEFORE the tap.
   - Tap the water FAB (`data-testid="log-fab-water"` or per existing convention).
   - **Within 100 ms** (use `page.waitForSelector(toastSelector, { timeout: 100 })`), the success toast must be visible. Assert visibility BEFORE awaiting `waterPost`.
   - Then `await waterPost; expect(...).toHaveStatus(200);` to confirm the network request completed normally.
   - Behavior assertion (not presence-only): toast text matches `t.fab.waterLoggedToast` exactly.

## Risk Assessment

low — single function rewrite; toast queue API is the canonical UndoToast surface already used here. The catch-branch toast-swap is the only nuance; if the queue lacks an in-place update primitive, the "remove + push" fallback is mechanically simple and uses primitives the store already exposes (`pushToast` is the only one referenced in the current code; `dismiss` / `updateToast` need verification).

The one substantive risk: if `selectLiveTop` (project-context line 14) re-displays the success toast after the error toast TTLs out (LIFO queue ordering with stale entries still in the stack), the user sees `waterLoggedFailed` for 2 s then SUCCESS again. Implementation must ensure the success toast is REMOVED — not just superseded — on the failure branch.

## Regression Sweep Needed

- `tests/components/nav/nav-shell.test.tsx` (existing tests pass — payload shape, ref-latch, `userTzToday` tap-time recompute)
- `tests/visual/water-fab-toast.spec.ts` (visual regression — fire on tap, ensure baseline screenshots still match; toast TTL=2000 contract preserved)
- `tests/e2e/nav-responsive.spec.ts` (the I2 E2E that was deferred — if unskipped, must continue to pass with the new sync emission)
- `lib/stores/useUndoQueueStore.ts` consumer surfaces (no API change expected; if `updateToast` / `dismiss` is added, run consumer tests)

## UI Touching
true — the user-visible surface is the toast. Pattern matches the canonical `UndoToast` mount (`components/toast/UndoToastMount.tsx`) — same component, same store, same ttlMs=2000 contract. No new UI primitive is introduced; the change is in the INVOCATION ORDER inside the click handler.

## Library / Pattern Prescriptions Used

- **kalori-canonical UndoToast** (project-context line 14): `useUndoQueueStore.pushToast({ kind:'delete-failed', description, ttlMs:2000 })` — reused verbatim. `kind:'delete-failed'` keeps the toast non-undoable, which is correct since water-log is non-undoable in this batch.
- **`waitForResponse` before click** (lessons-relevant line 30): E2E pattern for asserting toast appears BEFORE the network completes — registers the response listener pre-action so the test cannot race on cross-region RTT.
- **Optimistic UI for instant feedback** (web-ui-guide.md / general React 19 mobile-form pattern): fire UI feedback synchronously on user action; reconcile with server reality in the catch branch. Maps to the `useOptimistic` philosophy but applied at the toast layer rather than a state reducer because the toast IS the only visible feedback (no chip/counter on the FAB itself).
- **Synchronous re-entrancy gate** (lessons-relevant line 12): `useRef<boolean>` latch retained — orthogonal to the toast change; protects the network even when the user spams.

## Open Questions

1. **Toast swap primitive availability** — does `useUndoQueueStore` expose `updateToast(clientId, partial)` or `dismiss(clientId)`? If neither exists, do we add one (small API change, single consumer) or use the "push error toast on top of success toast" pattern (relies on selector ordering)? Lean toward `dismiss` if absent — simpler contract, and the success toast SHOULD vanish on failure not just be visually layered.
