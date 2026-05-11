# Codex Round 1 — Categorized Findings

**Source:** `planning/.tmp/bugfix-2026-05-08-e2e-regressions/codex/round-1.md`
**Verdict (verbatim):** `needs-attention`
**Auto-retry signals:** none detected
**Total findings:** 2

---

## Critical (1)

### C1 — Transient onboarding profile lookup errors force-sign-out valid users
**Severity (Codex):** high
**Bug source:** Bug 1
**File:** `app/(app)/onboarding/page.tsx:75-90`

**Verbatim Codex finding:**
> After `getUser()` has already succeeded, any `profiles.maybeSingle()` error is treated as a suspect auth context: the page captures it, calls `supabase.auth.signOut()`, and redirects to `/login`. The code comments explicitly include "a real DB blip" in this branch, so a PostgREST outage, RLS deploy mistake, or transient network failure can invalidate a legitimate user's session and kick them out of onboarding instead of preserving the session and failing closed on the wizard. Other app pages now throw `ProfileLookupError` for non-PGRST116 lookup errors; onboarding is more destructive than that contract.

**Recommendation (verbatim):**
> Keep the fail-closed behavior for the wizard, but only sign out on `getUser()` auth failure. For post-auth profile lookup errors, surface a retry/error boundary or throw a typed lookup error without invalidating the session.

**Why Critical (categorization rationale):**
- Directly contradicts the "fail-closed without breaking valid users" intent of Bug 1.
- Inconsistent with the contract restored elsewhere in the same batch (`orphan-profile-fence.ts` throws `ProfileLookupError` for non-PGRST116 — onboarding is now strictly more destructive).
- Real-world failure mode: any transient PostgREST blip during onboarding wipes the user's session, forcing re-login mid-wizard.
- This is exactly the unintended consequence Phase 4 was asked to challenge.

---

## Improvement (1)

### I1 — Onboarding happy-path E2E can skip the entire production flow under forged fixture
**Severity (Codex):** medium
**Bug source:** Bug 4
**File:** `tests/e2e/onboarding-completion.spec.ts:139-205`

**Verbatim Codex finding:**
> All four onboarding E2E paths now call `waitForOnboardingReady()` and skip when the forged session lands on `/login`. The helper comment says this is expected under the current forged fixture until a real test user exists, so in the current environment the happy path, axe scan, visual baseline, and reduced-motion completion can all report as skipped rather than exercising the wizard. That masks exactly the cross-bug interaction under review: auth guard changes can make onboarding unreachable while the suite still exits cleanly.

**Recommendation (verbatim):**
> Do not make `/login` an acceptable terminal state for the onboarding happy-path specs. Keep forged-cookie redirect coverage in the dedicated auth spec, and run these onboarding specs with a real authenticated fixture or equivalent server-side-valid session before shipping.

**Why Improvement (categorization rationale):**
- Codex's framing is correct: skipping under forged session is the documented disposition until F-TEST-4 lands a real test user, but it does mean the onboarding wizard is currently un-asserted in CI.
- This is the "skip-on-forged masks production behavior" risk explicitly flagged in the Phase 4 prompt.
- Not Critical because: (a) the disposition is acknowledged and tracked (F-TEST-4), (b) the auth-forged-cookie spec retains explicit redirect coverage of the current contract, (c) the test files were already broken before this batch — the skip is a controlled regression-mode disposition, not a freshly-introduced gap.
- Concrete impact: until a real test fixture lands, four onboarding specs (happy path, a11y, visual baseline, reduced-motion) report green-on-skip. Codex is right that this masks exactly the cross-bug interaction (Bug 1 + Bug 4) under review.
- Action options for Phase 5: (a) accept the disposition with a sharper guard (e.g., expect skip count == 4 rather than allow 0..N skips), (b) escalate F-TEST-4 priority and unskip after, (c) split forged-fixture redirect coverage out and require wizard-visible state for the four reachability-sensitive specs.

---

## Minor (0)

None.

---

## Cross-bug interaction note (Codex confirmed risk)

The Phase 4 prompt explicitly asked:
> "Cross-bug interactions — Bug 1 restores throw-on-non-PGRST116, Bug 4 onboarding tests skip under forged session. Could the combination mask a real auth bug?"

Codex's I1 finding answers: **yes**. With Bug 1's stricter onboarding-page contract (sign-out on profileError) AND Bug 4's skip-on-/login disposition, an auth-guard regression that makes onboarding unreachable for a real user would:
- Trigger Bug 1's signOut + redirect path.
- Cause the four E2E specs to skip cleanly instead of failing.
- Exit the suite green.

This is the canonical "two safe-looking changes combine into a blind spot" pattern. C1 fix removes the signOut from the profileError branch, which mitigates the cross-bug risk by making the production behavior less destructive even if the E2E suite under-asserts.

---

## Summary

- **Critical:** 1 (C1 — onboarding profileError signOut)
- **Improvement:** 1 (I1 — onboarding skip-on-forged)
- **Minor:** 0
- **Auto-retry signals:** none

**Recommended next step:** `proceed_to_phase_5_round_2` — Phase 5 should auto-fix C1 (mandatory) and consider I1 (improvement). Two-round cap means Phase 5's fixes get one re-review pass.
