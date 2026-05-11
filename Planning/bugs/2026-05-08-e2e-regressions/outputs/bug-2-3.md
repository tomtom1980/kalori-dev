## Files Touched
- tests/e2e/library/library-bulk-delete-undo.spec.ts (lines 92-103)
- tests/e2e/library/library-single-delete-undo.spec.ts (lines 75-86)

## Diff summary
Replaced the `await waitForTimeout(500)` race-prone pattern after each UNDO click with a `page.waitForResponse(...)` predicate that registers BEFORE the click and awaits AFTER, matching `r.url().includes('/api/library/bulk-delete/undo') && r.request().method() === 'POST' && r.status() === 200`. Mirrors the in-repo style at `tests/e2e/web/user-stories/US-STAB-B4.spec.ts:298` (arrow predicate, method+status assertions). Eliminates the cross-region (Vercel iad1 ↔ Supabase ap-southeast-1) write→read settle race that the fixed 500 ms timeout could lose under load.

## Test Run Result
- Bug 2 (`library-bulk-delete-undo`): PASS 10/10 (53.4s, --repeat-each=10 --workers=1, chromium)
- Bug 3 (`library-single-delete-undo`): PASS 20/20 — 10 reps × both tests in the file (2.3 min, --repeat-each=10 --workers=1, chromium)

## Deviations from Proposal
- Variable name: used `undoResponse` (proposal Bug #2) and `undoResponse` (proposal Bug #3 used `undoResp`) — unified to `undoResponse` in both files for consistency. No behavioural change.
- Added explanatory comment block above each `waitForResponse` registration to document the cross-region rationale (proposal had a one-liner "Allow undo POST a moment to round-trip" comment we replaced).
- Did not add an explicit `{ timeout: ... }` to `waitForResponse` — the default Playwright `expect`/action timeout (30s here, per playwright config) is generous enough; matching B4's pattern would suggest `5_000` but the proposal did not require it and Playwright's default is sufficient.

## Status
implemented

## Notes
- TDD waiver: test-side flake; spec IS the test artifact, no new test required (per proposal §"TDD note" of Bug 3).
- Did not touch Bug #3's Test 2 (sweep-path) — proposal recommended ship #1 only, and Test 2 passed 10/10 in this run unchanged.
- No production code touched; R1 firewall (`lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`) untouched. `app/`, `lib/`, `components/` untouched.
- Type-check passed clean (`pnpm exec tsc --noEmit -p tsconfig.json` showed no errors in either spec).
- Pre-existing dev warnings ("Missing `Description` or `aria-describedby={undefined}` for {DialogContent}", "middleware → proxy" deprecation) are unrelated to this fix and were already emitted by the dev server before the change.
- No commits made (per hard rule).
