# Fix R1 — lib/stores/useUndoQueueStore.ts (cross-tab dismiss)

## Findings addressed
- I1 (Improvement): cross-tab dismiss propagation. Optimistic success was broadcast cross-tab via `pushToast` but retraction in `dismiss(clientId)` was tab-local, so sibling tabs continued showing the false success toast for the full TTL window (2 s for water-FAB).

## Envelope extension
`UndoBroadcastMessage` converted from a single shape to a discriminated union over `type`: `UndoBroadcastPushMessage` (existing `'push'` payload, unchanged) | `UndoBroadcastDismissMessage` (new `'dismiss'` payload — `{ type: 'dismiss', clientId, originTabId }`). No breaking change for older builds — receiver narrows on `data.type` and silently drops unknown variants.

## Changes
- `lib/stores/useUndoQueueStore.ts`
  - Split `UndoBroadcastMessage` into a discriminated union (`UndoBroadcastPushMessage` + `UndoBroadcastDismissMessage`).
  - Added optional `options?: { _fromBroadcast?: boolean }` second argument to `dismiss(clientId, options)` (mirrors `pushToast`'s loop-guard pattern).
  - In `dismiss`: after a successful local removal, emit `{ type: 'dismiss', clientId, originTabId: getTabId() }` via the existing `getUndoBroadcastChannel()` singleton. Skip emit when nothing was removed locally (no-op for unknown id) OR when `_fromBroadcast=true` (loop guard). Channel errors swallowed silently — local removal already succeeded.
  - Updated JSDoc on `dismiss` action to document new cross-tab behavior + `_fromBroadcast` flag rationale.
- `lib/stores/useUndoQueueStore.cross-tab.ts`
  - Receiver handler gates on `data.type` (instead of an early-return on `!== 'push'`), keeping echo-suppression on `originTabId === ownTabId` shared across both variants.
  - On `'push'`: existing behavior unchanged.
  - On `'dismiss'`: routes to `useUndoQueueStore.getState().dismiss(data.clientId, { _fromBroadcast: true })`. Safe by-design: store's `dismiss` is no-op for unknown ids, so older originator builds that didn't echo the originating push still produce no error here.

## Tests added
`tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts` — new `describe('I1 — dismiss(clientId) cross-tab propagation', ...)` block with 4 tests:
1. `'dismiss(clientId) emits a dismiss broadcast on TOPICS.undo'` — pushes via `pushToast`, then calls `dismiss`, asserts a `{ type: 'dismiss', clientId, originTabId: <string> }` message is observed on the `'kalori-undo'` channel.
2. `'sibling tab receiving a dismiss broadcast removes the matching entry'` — sender broadcasts `'push'` then `'dismiss'`; receiver-tab stack first contains then loses the entry.
3. `'dismiss broadcast for unknown clientId is a no-op (resilient)'` — receiver gets a `'dismiss'` for an id that was never pushed; pre-existing unrelated entry is untouched, no error.
4. `'echo-suppression: a tab does NOT remove its own entry on receiving its own dismiss broadcast'` — guards against a same-tab loop where the receiver hook would re-process the originator's own broadcast.

## Verification
```
npx vitest run tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts tests/unit/lib/stores/useUndoQueueStore.test.ts
 Test Files  2 passed (2)
      Tests  30 passed (30)
   Duration  1.30s

npx tsc --noEmit
(clean — no errors)
```

Pre-existing 2 RED on the new tests confirmed before fix; both turned GREEN after implementation. All 26 prior tests in those two files continued passing (no regression).

## False-positive flag
false_positive: false
