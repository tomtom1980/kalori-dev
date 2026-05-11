# Codex Adversarial Review — Round 1

**Batch:** 2026-05-09-water-fab-ux
**Date:** 2026-05-09T00:55:42Z (UTC); local 2026-05-09
**Scope:** working-tree diff vs HEAD (HEAD = ca8e4fe; no intervening commits)
**In-scope files (7):**
- app/(app)/dashboard/page.tsx
- components/dashboard/WaterTracker.tsx
- components/nav/nav-shell.tsx
- lib/stores/useUndoQueueStore.ts
- tests/components/nav/nav-shell.test.tsx
- tests/unit/components/dashboard/WaterTracker.test.tsx
- tests/unit/lib/stores/useUndoQueueStore.test.ts

**Diff size:** ~35 KB (well under 500 KB safe threshold; no split needed)
**Pre-flight:** codex-companion ready (codex-cli 0.125.0; advanced runtime available; ChatGPT auth active)
**Invocation:** `adversarial-review --wait` (foreground/blocking, no `--base` flag — working-tree review per dispatcher instruction)
**Auto-retry signals scanned:** none of `Input exceeded 1MB`, `Retrying with tighter scope`, `production files only`, `spec context trimmed` appear in output. Review is complete.

---

## Codex output (verbatim)

```
# Codex Adversarial Review

Target: working tree diff
Verdict: needs-attention

No-ship: the diff improves the happy-path tap latency, but it still has defensible stale/false-success races in the exact failure and concurrency paths this batch is supposed to harden.

Findings:
- [high] Baseline refresh can still double-count an in-flight chip write after it succeeds (components/dashboard/WaterTracker.tsx:157-167)
  The resetKey guard only drops stale optimistic reducer actions. The async success path still unconditionally runs `setCommittedConsumedMl((current) => current + ml)` for the original tap. If a `router.refresh()` or other RSC re-render lands while that chip POST is in flight and the fresh `initial.consumedMl` already includes the same server row, the render-time sync sets the committed baseline to the server total, then the original success callback adds the same `ml` again. That makes the chip permanently overstate water until a later refresh, which is exactly the class of stale/double-counting bug this change is meant to close.
  Recommendation: Gate the success-side committed increment with the same issued-baseline discriminator, or reconcile by client_id/server response so a write already absorbed by a refreshed baseline is not added a second time.
- [medium] Expired-session failures leave a success toast for a write that did not persist (components/nav/nav-shell.tsx:231-238)
  The FAB now pushes and announces `250 ml logged` before the POST starts, but the `SessionExpiredError` branch returns without retracting that optimistic toast or replacing it with truthful feedback. `authPost` throws this error after unrecoverable 401 handling and redirect setup, so the water write has not succeeded; nevertheless the visible toast and polite announcement say it did. This violates the batch premise that error paths must produce truthful feedback, especially on mobile where redirect/sign-out may not visually displace the toast immediately.
  Recommendation: On `SessionExpiredError`, remove the optimistic success toast before returning and surface either a session-expired-specific state or no success announcement/toast for that failed write.
- [medium] Uncommitted optimistic success is broadcast cross-tab, but retraction is tab-local (lib/stores/useUndoQueueStore.ts:251-266)
  `pushToast` broadcasts every local toast, and the FAB now calls it before the network write is durable. `dismiss(clientId)` is explicitly tab-local, so sibling tabs can receive and display `250 ml logged` for an uncommitted request that later fails or times out. The later error toast may also be broadcast for generic failures, but it does not prevent other tabs from briefly seeing a false persisted-success state, and the session-expired branch sends no error replacement at all.
  Recommendation: Do not broadcast pre-await success toasts, or add a broadcasted state-transition/dismiss primitive so every tab that receives an optimistic success also receives the authoritative failure/success resolution.

Next steps:
- Add regression coverage for success-after-baseline-refresh on WaterTracker.
- Add failure-path tests for `SessionExpiredError` and cross-tab optimistic success retraction semantics.
```

---

## Auto-retry verification

Searched output verbatim for:
- `Input exceeded 1MB` — NOT present
- `Retrying with tighter scope` — NOT present
- `production files only` — NOT present
- `spec context trimmed` — NOT present

Review is COMPLETE. No re-scope needed.
