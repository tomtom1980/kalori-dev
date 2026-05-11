# Codex Round 3 (Verification) — Categorized Findings

**Run scope:** working-tree diff (~47 KB after noise exclusion — well under 500 KB safe budget)
**Verdict:** `needs-attention`
**Auto-retry signals:** none detected. Review is complete and trustworthy.

## Status of Round 2's fixes per Codex

| Round 2 finding | Round 3 verdict |
|---|---|
| **C2** (stale `loggedOn` prop) | **VERIFIED CLEAN.** Codex states: "No production-critical C2 code defect found." `userTzToday(timezone)` is correctly called at tap time inside `handleLogWater`; `timezone: string` is drilled cleanly through `app/(app)/layout.tsx → NavShell` with UTC fallback; the new vitest case uses `vi.setSystemTime` + `vi.useFakeTimers` to exercise the date-boundary path. No stale closure / useState / useRef regression. |
| **I3** (e2e fixture migration) | **PARTIALLY VERIFIED.** The water-FAB block migration is correct and exercises the real-Supabase `authedPage` fixture. BUT the file-level migration claim is overstated — see NEW Improvement below. |

## NEW Critical findings

**ZERO.** No round-3 Critical findings.

## NEW Improvement findings (2)

### NEW-IMP-1 — I3 cleanup is incomplete; nav-responsive still uses forged auth helper and skipped tests

**Verbatim title:** "I3 cleanup is incomplete because nav-responsive still uses the forged auth helper and skipped tests (tests/e2e/nav-responsive.spec.ts:89-130)"

**Codex evidence:** The migrated water-FAB block uses `authedPage`, but the same spec still imports `seedAuthSession` (line 89), calls it in `beforeEach` (lines 122-128), and leaves the primary responsive/a11y/visual cases as `test.skip` (lines 130, 162, 202, 222). The round-3 claim that "skip annotations were fully removed from `tests/e2e/nav-responsive.spec.ts`" is incorrect — only the water-FAB block was migrated.

**Impact:** CI can still pass while the nav shell's authenticated responsive + axe coverage remains disabled under the same forged-session gap I3 was meant to close. Does NOT invalidate the new water-FAB smoke path; does mean the file-level migration was incomplete.

**Recommendation per Codex:** Either migrate the remaining per-viewport cases to `authedPage`, OR explicitly narrow the I3 claim and carry a live followup for the remaining skipped nav-responsive coverage.

### NEW-IMP-2 — Real-browser water test does not prove the timezone path because the auth fixture forces UTC

**Verbatim title:** "Real-browser water test does not prove the timezone path because the auth fixture forces UTC (tests/e2e/nav-responsive.spec.ts:266-269)"

**Codex evidence:** The new e2e test asserts only `expect(body.logged_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)`. The `authedPage` fixture seeds `profiles.timezone = 'UTC'` (verified at `tests/e2e/fixtures/auth.ts:192`). A regression that ignores the profile timezone and always computes `new Date().toISOString().slice(0,10)` would still pass.

**Impact:** Layout → NavShell timezone path is covered only by source/unit mocks (the new `nav-shell.test.tsx` setSystemTime case + `tests/unit/app/layout-timezone-derivation.test.ts`), not by the real-Supabase browser path that I3 was supposed to restore.

**Recommendation per Codex:** Add a real-browser case with a non-UTC seeded profile timezone and assert the exact expected `logged_on` across a controlled date boundary, OR extend the fixture to allow per-test timezone override for this spec.

## NEW Minor findings

**ZERO.** No round-3 Minor findings.

## Decision per post-cap protocol

- NEW Critical = **0**
- NEW Improvement = **2**
- NEW Minor = 0

→ `codex_round_3: completed_with_residual_improvement`

Both Improvement findings are e2e-coverage-completeness gaps, not production-code defects. Codex itself states: "Treat these as improvement-level verification gaps unless the release gate requires the I3 migration claim to be literally true. Do not start a round 4 for production code."

The two findings will be appended to `pending_minor_findings` for user disposition at Phase 8 (lessons + commit). Both surface naturally as new followups (the I3 migration narrowing AND the timezone-override e2e gap).

**Advance to Phase 6 (security review).**
