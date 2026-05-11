# Bug #4 — onboarding-completion.spec.ts (6/6 failing)

## Classification
- **Type:** Test infra / fixture timing
- **Severity:** High (blocks 6 E2E tests)
- **TDD needed:** No (test file IS the spec; no production logic touched)
- **Codex round needed:** Skip (test-only, no logic surface)
- **Single root cause:** YES — all 6 failures collapse to one bug

## Root cause

`app/(app)/onboarding/page.tsx` lines 49–53 call `supabase.auth.getUser()`
server-side. That fetch executes inside Node (RSC), bypassing Playwright's
`context.route()` interception which only catches BROWSER-originated network
calls. Real Supabase rejects the forged `e2e-fake-access-token`, the RSC's
`error || !user` branch fires, and the page issues `redirect('/login?...')`.

Why the spec's skip guard at lines 96/112/140/161 doesn't catch it:
With `app/(app)/loading.tsx` (commit 6807da7) now serving as a route-group
loading boundary, `page.goto('/onboarding')` resolves as soon as the
**skeleton** paints — BEFORE the RSC body finishes. `page.url()` reads
`/onboarding`, the skip-check passes, control enters `fillWizard()`, and
THEN the RSC's `redirect()` arrives, dumping the browser on `/login`. The
`locator.check()` for the radio waits 30s/60s on a page that no longer
hosts those controls.

Test #2 (axe) hits the same redirect but trips a different symptom:
`AxeBuilder.analyze()` injects script into the page, navigation is mid-
flight → `Execution context was destroyed`.

## Why all 6 share this cause

Every test in the file follows the same `seedAuthSession → goto('/onboarding')
→ skip-if-login → interact` pattern. The pre-existing skip-guard exists
specifically because the spec authors knew RSC `getUser()` would reject the
forged token (see lines 4–13 docstring). The guard worked before commit
6807da7 because `goto()` resolved AFTER the RSC redirect; the loading
skeleton turned that into a race.

## Proposed fix (test-only)

Replace the early `page.url()` skip-check with a wait for the page to settle
on either terminal URL, THEN skip if it's `/login`. Specifically:

```ts
// After page.goto('/onboarding')
await page.waitForURL(/\/(onboarding|login)/, { timeout: 10_000 });
if (page.url().includes('/login')) {
  test.skip(true, 'RSC guard rejected forged cookie; wizard not rendered');
}
// Wait for wizard to actually render (not just the loading skeleton)
await expect(page.getByRole('radio', { name: t.onboarding.bioSexMale }))
  .toBeVisible({ timeout: 10_000 });
```

Apply to all 4 test bodies (lines ~90, ~110, ~138, ~159). Extract to a
helper `waitForOnboardingReady(page)` to avoid duplication.

**Outcome under real Supabase rejection:** all 6 tests now SKIP cleanly
(green tests, marked skipped). When F-TEST-4 lands a real test-user fixture
the RSC will accept the session and the tests will run end-to-end.

## Files affected
- `tests/e2e/onboarding-completion.spec.ts` (only)

## Regression risk
Low — test-only change. Strengthens existing intentional skip behavior.
No production code touched.

## Cross-bug interaction
Independent of Bugs #1–#3 and #5. Same fixture (`seedAuthSession`) but
different surface (onboarding RSC vs. middleware-fenced routes).

## Stop-the-world?
NO — single root cause, single fix.
