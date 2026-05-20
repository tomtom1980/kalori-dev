# Phase 7 Playwright Failure Diagnosis

Batch: `2026-05-18-1328-calorie-tracker-fixes`
Diagnostic timestamp: 2026-05-18

## Reproduction Commands

Smallest subset attempted:

```powershell
pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/weight-log.spec.ts --reporter=line
```

Result: PASS - 13 tests selected, 9 passed, 4 skipped.

Exact final-validation command attempted:

```powershell
pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line
```

Result: PASS - 32 tests selected, 21 passed, 11 skipped.

I could not reproduce the 7 final-validation failures in the current working tree after Playwright launched its own dev server. No source or test code changes were made during diagnosis.

## Saved Failure Evidence

The final-validation artifact recorded this failing run:

- Command: same exact Phase 7 command above.
- Result: FAIL - 32 executed, 14 passed, 11 skipped, 7 failed.

The saved failure families were:

1. `tests/e2e/web/smoke/golden-path.spec.ts`
   - Failure: `POST /api/entries/save must succeed`
   - Expected: `200`
   - Received: `404`
   - Page showed the confirmation modal still open with alert text: `404: Not Found`.

2. `tests/e2e/web/user-stories/US-STAB-C5.spec.ts`
   - AC2: expected `log-flow-modal` to be hidden after save; modal remained visible.
   - AC3: direct browser `fetch('/api/entries/save')` expected `400 logged_at_too_old`; received `404`.
   - AC4: direct browser `fetch('/api/entries/save')` expected `200`; received `404`.
   - AC2 page snapshot also showed alert text: `404: Not Found`.

3. `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts`
   - AC3 and CRUD chain both timed out waiting for `page-library-detail`.
   - Saved page snapshot was the app 404 screen: heading `Error 404` and copy `This page is not in the ledger...`.

4. `tests/e2e/weight-log.spec.ts`
   - Failure: expected an `output` containing `Weight saved.`.
   - Page snapshot showed failure state instead:
     - `Weight not saved. Restored to 70 kilograms. Undo available.`
     - Toast: `Couldn't save your weight. We've restored 70 kg.`

No `trace.zip` files were available for the saved local run. The Playwright config uses `trace: 'on-first-retry'`, and local retries are `0`, so error-context markdown and screenshots were the available artifacts.

## Prior Passing State Comparison

`e2e-results.md` documents two important earlier states:

- Initial browser E2E was blocked because `localhost:3000` was already occupied by a repo `next dev` process. The existing server log showed `.env.local`, so reusing it would bypass `.env.test.local`.
- After stopping the existing server and applying the E2E repair, the exact Phase 7 sweep passed with `21 passed, 11 skipped`.

The current diagnostic rerun matches that repaired passing state: the exact same Phase 7 command passed with `21 passed, 11 skipped`.

## Root Cause Hypothesis

Most likely root cause: stale or inconsistent Next dev server state during the failed final-validation run, not product-code behavior.

Evidence:

- The failing HTTP status for `/api/entries/save` was `404`, including direct browser `fetch('/api/entries/save')` calls in C5 AC3/AC4. That route exists at `app/api/entries/save/route.ts` and currently responds correctly under the same Playwright command. A DB/schema/business-rule issue would produce route-specific `400`, `401`, `500`, or app error output, not a Next-level 404 for an existing route.
- The weight-log failure also looked like a mutation route miss or non-OK response. The UI entered the optimistic saving state, then rolled back to `Weight not saved...`. The route exists at `app/api/weight/log/route.ts`, and the same spec now reaches the success `Weight saved.` output.
- The library-detail failures navigated to an app 404 page after clicking seeded library cards. The dynamic route exists at `app/(app)/library/[id]/page.tsx`, and the same seeded-card flow now renders `page-library-detail`.
- All affected failures cluster around server route resolution / server-side reads. They do not share a client selector rename, data assertion, or one component-level regression.
- The previous Phase 7 notes already identify server lifecycle risk: an existing `next dev` process on port 3000 had blocked Playwright ownership, and using an already-running server could run with `.env.local` or stale route manifests instead of the test-local environment.
- Fresh diagnostic runs with Playwright owning the server passed the subset and the exact final command.

Secondary possibility: transient `.next/dev` route-manifest/cache corruption after earlier edits or server reuse. This has the same remediation path: force a clean Playwright-owned dev server and regenerate `.next/dev`.

I do not see evidence for a product-code fix. The routes and selectors required by the failing specs are present and passed in the current run.

## Proposed Minimal Fix

Fix type: test harness / validation procedure only.

Minimal remediation:

1. Before final Phase 7 Playwright validation, assert port 3000 is free or stop only the repo-owned `next dev` process.
2. Ensure `.env.test.local` exists so `playwright.config.ts` keeps `reuseExistingServer: false` and injects test Supabase env into the web server.
3. If the same route-level 404 family recurs, delete only generated Next dev cache (`.next/dev`, or `.next` if needed) and rerun the exact Phase 7 command so Next regenerates the route manifest.
4. Treat a lone final-validation failure followed by an immediate exact-command pass as non-reproducible server-state flake unless fresh artifacts show route-specific application errors.

No product-code change is proposed from this diagnostic pass.
