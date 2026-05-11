# Codex Round 1 — Categorized Findings

**Batch:** 2026-05-09-water-fab-ux
**Source:** `Planning/.tmp/bugfix-2026-05-09-water-fab-ux/codex/round-1.md` (verbatim Codex output)
**Categorization rationale below.** Counts: **Critical = 2 | Improvement = 1 | Minor = 0**

---

## Critical (auto-fix via sub-agent — ship-blocker)

### C1 — WaterTracker baseline refresh + in-flight success → double-count
- **File / line:** `components/dashboard/WaterTracker.tsx:157-167` (success-path increment in `addWater()`)
- **Codex severity:** high
- **Why Critical (not Improvement):** This is the exact bug class Bug 2 was supposed to close. The `issuedResetKey` reducer guard correctly drops stale OPTIMISTIC actions, but the async success path still calls `setCommittedConsumedMl((current) => current + ml)` unconditionally. When `router.refresh()` lands during an in-flight POST and the new `initial.consumedMl` already absorbs that same server row, the committed total ends up `serverTotal + ml` — durable overstatement of the chip count until the next baseline refresh that doesn't race. This is the same class of stale/double-count failure mode the batch is built to eliminate, so it's ship-blocking by the batch's own contract.
- **Recommendation (Codex):** Gate the success-side committed increment with the same issued-baseline discriminator, or reconcile by `client_id` / server response so a write already absorbed by a refreshed baseline is not added a second time.
- **Implementation hint:** Capture `issuedResetKey` at the issue site (same place we capture for the optimistic reducer); compare against current `resetKey` inside the success callback before applying `setCommittedConsumedMl((c) => c + ml)`. If unequal → drop (server already absorbed it via baseline). Mirrors the discriminator pattern Bug 2 already established for the reducer; keeps the surface within `WaterTracker.tsx`. Add regression test using the same race fixture (in-flight POST + interleaved baseline update + success resolves).

### C2 — `SessionExpiredError` branch leaves false success toast
- **File / line:** `components/nav/nav-shell.tsx:231-238` (catch branch where `SessionExpiredError` is rethrown / returned without dismiss)
- **Codex severity:** medium (but Critical per batch premise)
- **Why Critical (not Improvement):** The batch's stated UX premise is *"toast is instant for the COMMON case (success), but error path must still produce truthful feedback."* When a 401 → unrecoverable session-expired path fires, the water write does NOT persist, but the optimistic success toast (and its `ariaLive=polite` announcement) remains visible. On mobile the redirect/sign-out may not displace it immediately. User believes the log persisted; it didn't. This violates the truthful-feedback contract head-on. Bug 1's ENTIRE post-conditions section explicitly says "on POST failure, dismisses the success toast and pushes an error toast (swap, not stack)" — the catch handler currently does this for generic errors but the `SessionExpiredError` re-throw path bypasses the dismiss.
- **Recommendation (Codex):** On `SessionExpiredError`, remove the optimistic success toast before returning AND surface either a session-expired-specific state or no success announcement/toast for that failed write.
- **Implementation hint:** In `handleLogWater`'s catch block, extend the existing `dismiss(clientId) + pushToast(error)` swap to cover the `SessionExpiredError` path, not just generic errors. Either (a) treat `SessionExpiredError` like other errors for the dismiss step (rethrow only AFTER the dismiss runs), or (b) push a dedicated session-expired toast (`kind: 'delete-failed', description: 'Session expired — sign in again'`). Option (a) is simplest and preserves the existing redirect side-effect chain. Add a unit test that mocks `authPost` to throw `SessionExpiredError` and asserts (i) the success toast is dismissed AND (ii) an error/expired toast or no-toast state results.

---

## Improvement (auto-fix via sub-agent — real defect, smaller blast radius)

### I1 — Cross-tab optimistic success broadcast without retraction broadcast
- **File / line:** `lib/stores/useUndoQueueStore.ts:251-266` (`pushToast` broadcasts; `dismiss(clientId)` tab-local)
- **Codex severity:** medium
- **Why Improvement (not Critical):** Real bug — sibling tabs receive a `pushToast(250 ml logged)` for a request that may then fail in the originating tab; the local `dismiss(clientId)` does NOT broadcast, so other tabs continue to display the false success indefinitely (until natural TTL expiry). The error-toast push DOES broadcast, but it does NOT replace the prior success in sibling tabs (it stacks). The `SessionExpiredError` path (see C2) doesn't push any error toast at all in remote tabs.
- **Why not Critical:** Single-user MVP; the realistic blast radius is one user with multiple tabs open simultaneously logging water — uncommon vs. the single-tab common case. Doesn't corrupt server state, doesn't durably overstate the chip count (TTL expiry self-heals after 2s). Lower-priority than C1/C2, but the dispatcher explicitly asked us to challenge cross-tab implications, so flagging.
- **Recommendation (Codex):** EITHER (a) don't broadcast pre-await success toasts at all (cheapest — deviates from current contract that all `pushToast` calls broadcast), OR (b) add a broadcasted `dismiss` primitive so every tab receives both the optimistic success AND its authoritative resolution.
- **Implementation hint:** Option (a) is surgical — add an opt-out flag to `pushToast` (e.g., `optimistic?: boolean`) and skip the broadcast write when set; FAB passes `optimistic: true`. Option (b) is more correct architecturally but requires a new BroadcastChannel message kind + reducer for the receive side, which is out of scope for a fix patch. Recommend option (a) for round 2: backward-compatible new field, single-call-site flag, no cross-tab plumbing change. Add a regression test asserting the optimistic toast is NOT broadcast (mock BroadcastChannel.postMessage and assert it wasn't called for the success push).

---

## Minor (none)

No findings categorized as Minor in this round.

---

## Summary

| Severity | Count | Action |
|---|---|---|
| **Critical** | 2 (C1, C2) | Auto-fix via single sub-agent (parallel-safe — different files: `WaterTracker.tsx` vs `nav-shell.tsx`) |
| **Improvement** | 1 (I1) | Auto-fix via same/separate sub-agent (`useUndoQueueStore.ts` + nav-shell call site) |
| **Minor** | 0 | n/a |

**Decision:** main agent dispatches fix sub-agent(s) for C1 + C2 + I1. After auto-fix, re-run Codex round 2 (one round only — round 2 is the cap; if findings remain after round 2, hand off to user).

**Files touched by fixes (anticipated):**
- `components/dashboard/WaterTracker.tsx` (C1)
- `components/nav/nav-shell.tsx` (C2)
- `lib/stores/useUndoQueueStore.ts` (I1)
- `tests/unit/components/dashboard/WaterTracker.test.tsx` (C1 regression test)
- `tests/components/nav/nav-shell.test.tsx` (C2 regression test)
- `tests/unit/lib/stores/useUndoQueueStore.test.ts` (I1 broadcast-skip test)
