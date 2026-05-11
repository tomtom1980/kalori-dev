# Fix R1 — e2e + visual coverage

## Findings addressed
- **I2 (Improvement):** real-browser coverage gap on water-FAB tap path (`tests/e2e/nav-responsive.spec.ts:225` mobile-only `water FAB on /library POSTs ...` block + `tests/visual/water-fab-toast.spec.ts` default + reduced-motion cases)

## Investigation summary

The investigation produced overwhelming evidence that un-skipping is **architecturally infeasible right now**, and the surrounding `.skip` rationale is genuine — not a hold-the-author defaulted-cautiously case.

### Hard architectural blocker confirmed
- `tests/e2e/helpers/auth-session.ts:220-240` (verbatim): "`context.route()` intercepts network calls made by the browser context — client-side fetches issued by JS running in the page bundle. It does NOT intercept server-side fetches made from the Next.js Node process during SSR / route handlers. That's a hard limitation of Playwright's proxy model."
- Task 2.1 Codex C1-B fix added `supabase.auth.getUser()` validation to authed RSC pages, including `app/(app)/dashboard/page.tsx`, `app/(app)/onboarding/page.tsx`, and `app/(app)/layout.tsx`. Server-side `getUser()` calls real Supabase `/auth/v1/user`; the existing forged-cookie helper produces an `e2e-fake-access-token` that real Supabase 401s.
- Result: any spec that triggers a full document navigation to a server-validated authed route (which `/library` and `/dashboard` both are) gets redirected to `/login` — and that's exactly what the new water-FAB E2E + visual tests do.

### F-TEST-4 #1 is the canonical gate
- `Planning/followups.md` `F-TEST-4 #1` is **OPEN** ("`tests/e2e/weight-log.spec.ts` E2E auth fixture gap + 9 nav-responsive interactive cases, parent: real Supabase Admin API test-user seeding").
- 33 `test.skip` occurrences across 7 e2e files (`nav-responsive.spec.ts`, `onboarding-completion.spec.ts`, `progress-render.spec.ts`, `web/user-stories/US-STAB-A-bundled.spec.ts`, `US-STAB-B-bundled.spec.ts`, `US-STAB-B4.spec.ts`, plus the helper itself) — all blocked on the same gate. No project-wide `storageState` fixture exists; grep returned zero matches for `storageState`.
- Task 5.1.8 (F-TEST-1 closure) explicitly noted: "The `nav-responsive` `test.skip` markers are still in place because that follow-up depends on F-TEST-4 (real-test-user seeding) — out of 5.1.8 scope."
- The existing `tests/e2e/auth-forged-cookie.spec.ts` is a deliberate regression GUARD: it asserts that forged cookies ARE rejected, which proves C1-B works. Un-skipping our tests would tunnel against that exact assertion.

### Existing skip annotations already reference C1-B
The new water-FAB cases were already authored with `(pending real test-user seeding after C1-B)` in their `test.skip(...)` titles by the Phase 3 implementation sub-agent. The annotations are correct; they just lacked a same-batch followups entry to track the I2 deferral as Codex requested.

## Outcome chosen

**B (keep `.skip` + followups entry).** Un-skipping is architecturally infeasible right now without F-TEST-4 #1 landing first. The `.skip` annotations were already author-correct; the gap was the missing followups tracking entry, which is now in place.

## Changes

- **Edited** `tests/e2e/nav-responsive.spec.ts` — augmented the inline comment ABOVE the mobile-only water-FAB `test.skip` block with explicit Codex Round 1 I2 attribution, the architectural-limit cross-reference (`helpers/auth-session.ts:220-240`), and the new followups ID. Skip title updated to include the followups ID for grep traceability.
- **Edited** `tests/visual/water-fab-toast.spec.ts` — augmented the file-level docblock with the same Codex Round 1 I2 attribution + F-TEST-4 #1 dependency + followups ID. Both `test.skip` titles already include `(pending real test-user seeding after C1-B)` from Phase 3.
- **Appended** to `Planning/followups.md` — new `## High Priority — Bug Bundle 2026-05-08-mobile-water-button (2026-05-09)` block with entry `F-WATER-FAB-E2E-COVERAGE-GAP-2026-05-08`. Entry pins the deferral to F-TEST-4 #1 as parent, lists exact files + skip blocks to flip, prescribes the regression-pin (non-UTC timezone case asserting `logged_on`) Codex called out verbatim, and flags un-skip + verify as the FIRST validation step after F-TEST-4 #1 lands.

## Tests run

No new tests run for this finding — the work product is documentation + skip-comment enrichment, not code. Per the auto-fix brief Outcome B path: "KEEP .skip on both new tests." The Phase 7 E2E sweep handles aggregate skip-count expectations; this batch contributed two new entries to the existing 33 `.skip` baseline, all blocked on the same gate, all tracked.

For audit completeness:
- `npx playwright test tests/e2e/nav-responsive.spec.ts -g "water FAB"` — would currently fail because `seedAuthSession()` cookie is rejected by real Supabase server-side `getUser()`. Confirmed via the verbatim architectural-limit comment in `helpers/auth-session.ts` and the parallel pattern of all 9 nav-responsive interactive cases failing under the same conditions.
- `npx playwright test tests/visual/water-fab-toast.spec.ts` — same blocker; the spec uses the `tests/e2e/fixtures/auth` fixture which wraps `seedAuthSession`.

## Followups entry

(Verbatim copy in `Planning/followups.md` lines just below the format-reminder comment, top of file under the new `## High Priority — Bug Bundle 2026-05-08-mobile-water-button (2026-05-09)` heading. Full text:)

```markdown
### F-WATER-FAB-E2E-COVERAGE-GAP-2026-05-08 — e2e + visual real-browser coverage gap on water-FAB tap path

- **Status:** Open (High Priority — Codex Round 1 I2; deferred per F-TEST-4 #1 architectural blocker).
- **Severity:** Improvement (medium-high — coverage/process; schema-drift + auth-cookie-handling bugs can land silently without it).
- **Source task:** bugfix-tomi batch `2026-05-08-mobile-water-button` (Bug #1 — water FAB on mobile non-functional). Codex Round 1 I2 verbatim transcript: `Planning/.tmp/bugfix-2026-05-08-mobile-water-button/codex/round-1-categorized.md` §I2.
- **Files:** `tests/e2e/nav-responsive.spec.ts` mobile-only water-FAB block + `tests/visual/water-fab-toast.spec.ts` (both `test.skip`).
- **Root cause (why deferred):** New tests depend on `seedAuthSession()` forged cookies; Task 2.1 C1-B added server-side `getUser()` validation that real Supabase 401s. `context.route()` cannot intercept server-side fetches (see `tests/e2e/helpers/auth-session.ts:220-240`).
- **Recommended fix:** Once F-TEST-4 #1 ships the real Supabase Admin API test-user seeding helper, un-skip + verify + add a non-UTC timezone case asserting the posted `logged_on` matches local date (Codex's verbatim Round 1 I2 recommendation; this becomes the canonical regression test for C1).
- **Owner:** F-TEST-4 #1 (parent dependency).
- **Estimate:** 30 min (un-skip + run + verify) once F-TEST-4 #1 is in place.
```

## False-positive flag

<false_positive: false>
