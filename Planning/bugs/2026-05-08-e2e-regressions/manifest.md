# Bug Bundle Manifest — 2026-05-08-e2e-regressions

**Batch ID:** `2026-05-08-e2e-regressions`
**Started:** 2026-05-08 15:51 GMT+7
**Closed:** 2026-05-08 17:06 GMT+7 (Phase 8 docs complete; awaiting commit in Phase 8.3)
**Project:** Kalori (Calorie Tracker webapp)
**Starting HEAD SHA:** `71514c85ffe59ba1501e22ace42ce6fef656f317` (commit `6807da7` — `[Minor] (app)/loading.tsx: instant-feel nav skeleton + changelog`)
**Workflow:** bugfix-tomi (8-phase sub-agent-driven workflow with parallel investigation, batched implementation, two-round Codex review, security review, conditional E2E gating)

## Trigger

Task B.SWEEP (commit `600eddf`) deferred 5 E2E regressions to `Planning/followups.md` per user authorization to keep Phase B closure unblocked. This bundle resolves all 5 deferred items in a single batched flow.

## Per-bug summary

### Bug #1 — auth-forged-cookie regression (C1-B contract restoration)

- **Description:** `tests/e2e/auth-forged-cookie.spec.ts:118,133` — `expect(page.url()).toContain('/login')` failed because B.SWEEP commit `600eddf` changed the `orphan-profile-fence` `lookup_error` branch from throw to redirect, masking forged cookies as orphans (forged cookies redirected to `/onboarding` instead of `/login`).
- **Classification:** Real bug (production contract regression).
- **Risk:** Medium (affects security-relevant auth-guard contract).
- **TDD required:** Yes (logic-touching).

**Files touched:**
- `lib/auth/orphan-profile-fence.ts` (lines ~254-274) — Reverted `lookup_error` branch from broad redirect to `throw ProfileLookupError`, with narrow PGRST116 carveout for the genuine missing-row case (defense-in-depth).
- `app/(app)/onboarding/page.tsx` (lines ~75-91) — Mirror change: `profileError` branch now throws `ProfileLookupError` (Next error boundary) instead of `signOut + redirect('/login?reason=session_expired&redirect_to=%2Fonboarding')` (which destroyed valid sessions on transient blips per Codex Round 1 C1).
- `tests/integration/onboarding-page-profile-lookup.test.ts` (lines ~1-17, ~92-110) — Re-aligned first test case (`code: '42501'`) from "no redirect, renders wizard" to fail-closed throw contract.
- `tests/integration/dashboard-orphan-profile.test.ts` — Re-aligned by prior sub-agent (verified passing this session).
- `tests/integration/dashboard-page-onboarding-guard.test.ts` — Re-aligned by prior sub-agent (line 196 expects `'profile lookup failed'` throw; verified passing).
- `tests/integration/progress-page-profile-lookup-guard.test.ts` — Re-aligned by prior sub-agent (verified passing).
- `tests/integration/weight-page-profile-lookup-guard.test.ts` — Re-aligned by prior sub-agent (verified passing).
- `tests/e2e/auth-forged-cookie.spec.ts` (lines ~117-150) — Replaced sync `expect(page.url()).toContain('/login')` with `await page.waitForURL(/\/login\?.*redirect_to=/, { timeout: 5000 })` on both tests. Production-side redirect contract is correct; the failure was a Next 16 RSC-redirect timing quirk where `page.goto()` resolved before the client-side router committed the `/login` URL.

**Tests modified:** 5 integration test files re-aligned to throw-contract; 1 E2E spec converted from sync `page.url()` to `waitForURL` race-handling. No new test files added.

**Codex Round 1 finding:** C1 (Critical) — onboarding `profileError` branch's `signOut + redirect` was too destructive (transient PostgREST blip → forced re-login). Auto-fixed by replacing `signOut + redirect` with `throw ProfileLookupError` so Next's error boundary catches it.

**Codex Round 2 finding:** I2 (Improvement) — `ProfileLookupError` throws fall through to Next's bare 500 page because no `app/error.tsx` exists. Force-committed; deferred as `F-CODEX-R2-MISSING-ERROR-BOUNDARY`.

**Security review:** Clean. Auth/authz contract narrowed (positive direction — forged cookies still caught upstream by `unauthenticated` branch, transient lookup errors no longer destroy sessions). PII handling clean (`user_id_hash` only in Sentry tags). No new injection vectors. `ProfileLookupError.cause` does not leak to user (Next 16 default boundary suppresses it in production).

**Status:** implemented.

### Bug #2 — library-bulk-delete-undo cross-region race

- **Description:** `tests/e2e/library/library-bulk-delete-undo.spec.ts:18` — `toBeNull()` failure when checking restored row after UNDO POST. `waitForTimeout(500)` after fire-and-forget UNDO request flaked under `iad1` ↔ `ap-southeast-1` (~150-200ms RTT) latency.
- **Classification:** Test flake (pure timing race; production contract correct).
- **Risk:** Low (test-side only, no production code touched).
- **TDD required:** No (test is the artifact).

**Files touched:**
- `tests/e2e/library/library-bulk-delete-undo.spec.ts` (lines 92-103) — Replaced `await waitForTimeout(500)` with `page.waitForResponse(r => r.url().includes('/api/library/bulk-delete/undo') && r.request().method() === 'POST' && r.status() === 200)`. Predicate registered BEFORE the click and awaited AFTER, mirroring the in-repo style at `tests/e2e/web/user-stories/US-STAB-B4.spec.ts:298`.

**Tests modified:** 1 E2E spec. No new tests.

**Codex review:** No specific Round 1/2 findings on this bug surface (Codex categorized findings around Bug #1 + Bug #4).

**Security review:** Clean (no production surface; `waitForResponse` is a Playwright primitive with no security impact).

**Status:** implemented. Verified PASS 10/10 (53.4s, `--repeat-each=10 --workers=1`, chromium).

### Bug #3 — library-single-delete-undo same race

- **Description:** `tests/e2e/library/library-single-delete-undo.spec.ts` — Same race as Bug #2; same root cause; same fix shape.
- **Classification:** Test flake (sibling of Bug #2).
- **Risk:** Low.
- **TDD required:** No.

**Files touched:**
- `tests/e2e/library/library-single-delete-undo.spec.ts` (lines 75-86) — Identical pattern fix to Bug #2.

**Tests modified:** 1 E2E spec. No new tests.

**Codex review:** No specific findings.

**Security review:** Clean (same as Bug #2).

**Status:** implemented. Verified PASS 20/20 (10 reps × both tests in the file, 2.3 min, `--repeat-each=10 --workers=1`, chromium).

### Bug #4 — onboarding-completion locator-timeout cascade

- **Description:** `tests/e2e/onboarding-completion.spec.ts` — 6+ failing tests with `locator.check` timeouts and `page.evaluate` execution-context-destroyed errors. The Phase B `app/(app)/loading.tsx` skeleton paint resolved `page.goto()` BEFORE the SSR redirect committed, defeating the existing `page.url().includes('/login')` skip-guard.
- **Classification:** Test infrastructure (timing race introduced by Phase B skeleton paint; production contract correct).
- **Risk:** Low (test-only).
- **TDD required:** No.

**Files touched:**
- `tests/e2e/onboarding-completion.spec.ts` — Added `waitForOnboardingReady(page)` helper (race between Step 1 radio visibility and `/login` redirect). Replaced brittle `page.url().includes('/login')` skip-check in all 4 test bodies (happy path, axe, 3-breakpoint visual loop, reduced-motion) with `if (!(await waitForOnboardingReady(page))) test.skip(...)`.

**Tests modified:** 1 E2E spec. No new tests.

**Phase 5 Round 1 I1 mitigation (Codex Round 1 Improvement):** Added 3-layer hardening:
1. **Auth-guard smoke test** — never-skipping anonymous redirect assertion (proves `/onboarding` → `/login` for unauthenticated users).
2. **`SKIP_REASON_FORGED_SESSION` constant** — names F-TEST-4 dependency explicitly so future readers see why skips happen.
3. **`afterAll` warn-on-all-skip hook** — `console.warn` if 100% of wizard tests skipped (visibility signal, non-CI-failing).

**Codex Round 1 finding:** I1 (Improvement) — onboarding skip-on-forged disposition masks fail-closed auth-guard regressions. Phase 5 Round 1 fix added 3-layer mitigation above.

**Codex Round 2 finding:** C2 (Critical) — auth-guard smoke only proves anonymous-blocked, NOT authed-can-reach-wizard. The Round 1 I1 mitigation closed the unauthenticated axis but left the authenticated-reachability axis uncovered. Force-committed; deferred as `F-CODEX-R2-AUTH-GUARD-SMOKE-INCOMPLETE` (resolution requires F-TEST-4 real Supabase test fixture).

**Security review:** Clean. Skip behavior is honest (forged cookies + real Supabase = expected skip until F-TEST-4). `afterAll` warn-on-all-skip hook is a defense-in-depth signal so future regressions don't silently green the suite. No production surface.

**Status:** implemented. 6 tests skip cleanly under forged-session fixture (intended until F-TEST-4 lands real test user).

### Bug #5 — reduced-motion stale pre-B.1 contract

- **Description:** `tests/e2e/reduced-motion.spec.ts:30,189` — 2 failing tests asserting against the old anon `/` → `/login` redirect contract. Task B.1 commit `bd33ce7` replaced the redirect with a real `MarketingLanding` component. Spec was stale.
- **Classification:** Stale contract (test-side, post-B.1 ContractDriver miss).
- **Risk:** Low (test-only).
- **TDD required:** No.

**Files touched:**
- `tests/e2e/reduced-motion.spec.ts` (3 surgical replacements) —
  1. Header comment block (lines 12-15) — Updated "Surfaces under test" landing entry to post-B.1 reality (anon `/` renders `MarketingLanding` h1 wordmark + SIGN IN CTA; authed `/` redirects to `/dashboard`); cited commit `bd33ce7`.
  2. Line 30 test (AC7 landing) — Renamed test title from "redirects to /login" to "renders marketing landing"; dropped `waitForURL(/\/login.../)`; replaced `getByLabel(t.auth.emailLabel)` with `getByTestId('landing-wordmark')` `toBeVisible`.
  3. Line 189 test (AC6 axe on `/`) — Renamed test title from "(post-redirect login)" to "(marketing landing)"; dropped `waitForURL`; replaced tail `getByLabel(t.auth.emailLabel)` with `getByTestId('landing-wordmark')`.

**Tests modified:** 1 E2E spec. No new tests. 21 modified PNGs in `tests/screenshots/reduced-motion/...` are stale baselines from the pre-B.1 contract; Playwright overwrote `ac7-01-landing-initial.png` + `ac7-02-landing-result.png` on the passing run.

**Codex review:** No specific findings.

**Security review:** Clean (visual-regression baseline updates only; no production surface).

**Status:** implemented. Both target tests GREEN; all 6 tests in the file pass (7.1s).

## Bugs dropped

None — all 5 confirmed real and fixed.

## Codex summary

### Round 1 (2 findings)

| Severity | ID | Bug | File | Disposition |
|----------|-----|-----|------|-------------|
| Critical | C1 | Bug 1 | `app/(app)/onboarding/page.tsx:75-90` | **Auto-fixed** in Phase 5 Round 1 (replaced `signOut + redirect` with `throw ProfileLookupError`) |
| Improvement | I1 | Bug 4 | `tests/e2e/onboarding-completion.spec.ts:139-205` | **Auto-fixed** in Phase 5 Round 1 (added 3-layer mitigation: auth-guard smoke + named skip constant + afterAll warn) |

### Round 2 (2 findings)

| Severity | ID | Bug | File | Disposition |
|----------|-----|-----|------|-------------|
| Critical | C2 | Bug 4 | `tests/e2e/onboarding-completion.spec.ts:270-277` | **Force-committed** per user decision; deferred as `F-CODEX-R2-AUTH-GUARD-SMOKE-INCOMPLETE` (F-TEST-4 dependency) |
| Improvement | I2 | Bug 1 | `app/(app)/onboarding/page.tsx:90-93` | **Force-committed** per user decision; deferred as `F-CODEX-R2-MISSING-ERROR-BOUNDARY` (post-MVP polish) |

**Two-round cap reached** per `~/.claude/rules/codex-review.md`. No Round 3 auto-fix loop permitted. User explicitly authorized force-commit at the Round 2 escalation gate.

## Security review summary

**Verdict:** clean.

**Findings:**
- Critical: none
- High: none
- Medium: none
- Informational: 3 (function naming hygiene `requireProfileOrJson401` — pre-existing; forged-cookie spec regex doesn't pin redirect target — acceptable; `SKIP_REASON_FORGED_SESSION` rationale documented inline — positive defensive testing)

**Cross-cutting checks (all PASS):**
- Input validation weakened? No (lookup_error branch narrowed, not widened).
- AuthN/Z change? Yes (narrowed `/onboarding` redirect to PGRST116-only; strictly tighter than before).
- New PII in logs? No (only `user_id_hash`, route, op, source in Sentry tags).
- New injection vectors? No.
- Secret leakage? No (redirect URLs static literals; `ProfileLookupError.cause` doesn't render in Next 16 default boundary).
- XSS / CSRF? No (Server Components + Server Actions retained).
- Race conditions (security-relevant)? No (test-side timing fixes only).
- Error message disclosure? `ProfileLookupError` message is generic ('profile lookup failed'); no user IDs / emails / DB internals.

**Full review:** `Planning/bugs/2026-05-08-e2e-regressions/security-review.md`.

## R1 firewall preservation

Throughout all 5 bug fixes, the Phase 5 Round 1 fix sub-agent, and Codex auto-fix passes, the R1 firewall files were untouched:
- `lib/auth/refresh-interceptor.ts`
- `lib/auth/cross-tab-signout.ts`
- `lib/auth/authFetch.ts`
- `app/(app)/log/_components/ConfirmationScreen.tsx`

This is the R1 mitigation contract per `Planning/progress.md` "R1 — Task 2.1 is a dense critical-path bottleneck" — Phase 3/4 mutation tasks are FORBIDDEN from implementing local refresh shims.

## Test verification (post-implementation)

| Suite | Result | Duration |
|-------|--------|----------|
| E2E `auth-forged-cookie.spec.ts` (chromium) | 2/2 PASS | 6.1s |
| Vitest re-aligned integration tests (5 files) | 36/36 PASS | 4.30s |
| Vitest unit suite (98 files) | 801/801 PASS | 74.51s |
| `library-bulk-delete-undo` (`--repeat-each=10`) | 10/10 PASS | 53.4s |
| `library-single-delete-undo` (`--repeat-each=10`, both tests) | 20/20 PASS | 2.3 min |
| `onboarding-completion` | 6 SKIP (intended) | — |
| `reduced-motion` | 6/6 PASS | 7.1s |
| Typecheck (`pnpm typecheck` → `tsc --noEmit`) | clean | — |

**Baseline preserved.** 801/801 unit tests still GREEN.

## Pending follow-ups

| ID | Severity | Status | Owner |
|----|----------|--------|-------|
| `F-CODEX-R2-AUTH-GUARD-SMOKE-INCOMPLETE` | Critical | Open (force-committed) | F-TEST-4 (real Supabase test fixture) |
| `F-CODEX-R2-MISSING-ERROR-BOUNDARY` | Improvement | Open (force-committed) | Post-MVP polish |

Both entries logged in `Planning/followups.md` under "2026-05-08 — bugfix-tomi batch 2026-05-08-e2e-regressions" section.

## Artifacts (this batch)

```
Planning/bugs/2026-05-08-e2e-regressions/
├── manifest.md (this file)
├── state.md (final batch state — phase=8, status=complete)
├── project-context.md (priming context loaded at Phase 0)
├── lessons-relevant.md (lessons-learned curation for this batch)
├── security-review.md (Phase 6 read-only security audit)
├── proposals/
│   ├── bug-1.md
│   ├── bug-2.md
│   ├── bug-3.md
│   ├── bug-4.md
│   └── bug-5.md
├── outputs/
│   ├── bug-1.md
│   ├── bug-2-3.md
│   ├── bug-4.md
│   └── bug-5.md
└── codex/
    ├── round-1.md (verbatim Codex transcript)
    ├── round-1-categorized.md (categorized Critical/Improvement/Minor)
    ├── round-2.md (verbatim)
    ├── round-2-categorized.md
    ├── fixes-r1-onboarding-page.md (Phase 5 Round 1 fix output for C1)
    └── fixes-r1-onboarding-spec.md (Phase 5 Round 1 fix output for I1)
```

## Workflow audit trail

| Phase | Status | Notes |
|-------|--------|-------|
| -1 — Pre-flight | complete | Folders + state.md initialized; baseline SHA `71514c85` recorded |
| 0 — Priming | complete | Project context + lessons-relevant loaded |
| 1 — Investigation (parallel) | complete | 5 proposal files written |
| 2 — User approval gate | complete | Batch approved; no bugs dropped |
| 3 — Implementation (parallel) | complete | 4 output files (bugs 2+3 merged into single output per identical pattern) |
| 4 — Codex Round 1 | completed_with_fixes | 1 Critical + 1 Improvement; both auto-fixed |
| 5 — Round 1 fix re-review | complete | Phase 5 Round 1 fix sub-agent applied C1 + I1 fixes |
| 6 — Security review | completed_clean | 0 Critical/High/Medium; 3 Informational |
| 6.5 — Codex Round 2 | escalated_force_commit | 1 Critical + 1 Improvement; user authorized force-commit (no Round 3 auto-fix per 2-round cap) |
| 7 — E2E gate | not_required | No UI bugs in this batch (test-side fixes + production auth-contract revert + 5 integration test re-alignments) |
| 8 — Docs + manifest | complete | This manifest + CHANGELOG entry + 2 followups appended |
| 8.3 — Commit (pending) | — | Awaiting Phase 8.3 commit step |

## References

- **Trigger:** `Planning/CHANGELOG.md` "2026-05-08 — Task B.SWEEP" entry (commit `600eddf`); `Planning/followups.md` 5 deferred E2E regression entries.
- **Bugfix-tomi skill spec:** `~/.claude/skills/bugfix-tomi/SKILL.md`.
- **R1 firewall contract:** `Planning/progress.md` "R1 — Task 2.1 is a dense critical-path bottleneck (ACCEPTED)".
- **Codex policy:** `~/.claude/rules/codex-review.md` (two-round cap; user-only `/codex:adversarial-review` slash command vs. model-driven companion script).
- **Testing policy:** `~/.claude/rules/testing.md` (TDD on logic-touching changes; waiver on test-side flakes).
