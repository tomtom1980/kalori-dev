# Round 2 Codex Findings — Categorized

**Source:** `planning/.tmp/bugfix-2026-05-08-e2e-regressions/codex/round-2.md`
**Codex verdict:** `needs-attention`
**Auto-retry signals scanned:** none detected
**Pre-flight in-scope diff size:** 34,527 bytes (well under 500 KB safe budget)

---

## Severity mapping (Codex → bugfix-tomi protocol)

| Codex tag | Protocol category |
|---|---|
| `[high]` | Critical |
| `[medium]` | Improvement |
| `[low]` | Minor |

---

## Critical (count: 1)

### C2 — Auth-guard smoke test only proves anonymous users are blocked
**Location:** `tests/e2e/onboarding-completion.spec.ts:270-277`
**Verbatim verdict (Codex):**
> The never-skipping smoke test clears cookies and expects /onboarding to redirect to /login, so it can pass entirely through the unauthenticated middleware path without proving that any authenticated user can reach the wizard. The real wizard tests still record skip-login-redirect and call test.skip when the forged session is rejected. A regression that makes every authenticated /onboarding request redirect to /login or fail before rendering would leave the wizard tests skipped, the smoke test passing, and only a stderr warning from afterAll. That does not close the Round 1 gap for fail-closed auth-guard regressions.

**Why this is Critical:** Round 1's I1 finding was that skip-cleanly + forged-session masks fail-closed auth-guard regressions. The I1 fix added a never-skipping anonymous-user smoke test, but that test only exercises the *unauthenticated* middleware redirect path. The original Codex concern — "an authenticated user can no longer reach the wizard" — remains uncovered: every wizard test would still call `test.skip()`, the new smoke test would still pass (since anonymous redirect still works), and the only signal would be an `afterAll` stderr warning. CI would stay green on a real auth regression.

**Recommendation (Codex verbatim):** Add a non-skipping positive reachability assertion using a real Supabase test user, or fail CI when this suite records zero wizard-render passes until that fixture exists.

**Auto-fix posture:** Per protocol, Critical findings normally trigger auto-fix. **HOWEVER** — Phase 5 protocol explicitly says: "Critical>0 → escalate_to_user with verbatim findings + diff path." Round 2 is the hard cap; no round 3 auto-fix loop. The actionable mitigation (non-skipping CI failure when all wizard tests skip) is a one-line change to the `afterAll` hook (turn `console.warn` into a thrown error gated on `process.env.CI`). The fully correct fix (real Supabase test fixture, F-TEST-4) is itself the deferred work the I1 mitigation was meant to bridge to.

---

## Improvement (count: 1)

### I2 — Profile lookup errors surface as the default Next error page
**Location:** `app/(app)/onboarding/page.tsx:90-93`
**Verbatim verdict (Codex):**
> The C1 branch now preserves the session by throwing ProfileLookupError, but this repository has no app/error.tsx or global-error.tsx, so the throw falls through to Next's default bare server-error surface rather than a domain-specific recoverable onboarding error. That means a valid user who hits a transient profiles lookup failure keeps their session, but sees a generic 500-style page with no app-level retry/recovery affordance. The comments and tests assert an error boundary handles it, but they only prove a throw, not a visible recoverable UX.

**Repo state confirmed:** `find app -name "error.tsx"` returns only `not-found.tsx` files. There is no `app/error.tsx`, no `app/global-error.tsx`, and no segment-level `app/(app)/onboarding/error.tsx`. The `throw new ProfileLookupError(...)` propagates to Next's *built-in* default error UI (bare 500) — not a Kalori-themed recoverable surface.

**Severity rationale (why Improvement, not Critical):** The C1 *primary* contract — preserve session on transient profile lookup failure — IS satisfied. The user is no longer signed out; they retain auth state. But the UX gotcha (bare 500 vs themed retry page) is a real, code-visible defect that Codex flagged the JSDoc/tests for over-claiming. This is exactly the "Improvement" tier per protocol.

**Recommendation (Codex verbatim):** Add an app-level or onboarding-level error boundary that renders a retryable authenticated error state for ProfileLookupError, and cover that rendered state rather than only asserting the throw.

**Auto-fix posture:** Per protocol, "Critical>0 → escalate_to_user." When the recommended next step is `escalate_to_user_critical`, Improvement findings ride along with the escalation; user decides whether to bundle the fix into round 2 auto-fix pass, defer to followups.md, or accept residual.

---

## Minor (count: 0)

(none)

---

## Cross-bug interaction check

Codex did not surface any new cross-bug interactions in round 2. Bug 1 (orphan-profile fence) and Bug 4 (skip-detection visibility) findings are isolated:

- **Bug 1 surface (C1 fix):** purely about the `profileError` branch error contract. Codex confirms the session-preservation goal is met; the residual is the missing UX surface (I2).
- **Bug 4 surface (I1 fix):** purely about the smoke-test scope. Codex confirms the never-skip mechanism works for anonymous; the residual is the missing authenticated-reachability assertion (C2).

No combination risk between the two surfaces was identified.

---

## Round 1 contract restoration check

Round 1 introduced the C1-B forged-cookie regression guard in `tests/e2e/auth-forged-cookie.spec.ts`. That file is unchanged from round 1. Codex did not re-flag it in round 2, indicating the guard remains in place. Bug 1 + C1 fix correctly restored the guard.

---

## Recommended next step

**escalate_to_user_critical**

**Rationale:**
- Round 2 is the hard cap (no round 3 auto-fix per `~/.claude/rules/codex-review.md` two-round cap and `bugfix-tomi` Phase 5 contract).
- C2 is high-severity and not trivially auto-fixable in a single self-contained pass: the fully correct fix requires F-TEST-4 (deferred Supabase test fixture work), and the bridge mitigation (CI-failing afterAll instead of warn-only) materially changes test gating policy and warrants user sign-off.
- I2 is Improvement-tier and could be addressed by adding an `app/(app)/onboarding/error.tsx` (or app-level `app/error.tsx`) — also a policy-level UX choice the user should ratify.
- Both findings preserve the round-1 fixes' core contracts; neither is a regression of round-1 work.

**Diff path:** working tree (uncommitted), in-scope files listed in round 2 invocation prompt.
