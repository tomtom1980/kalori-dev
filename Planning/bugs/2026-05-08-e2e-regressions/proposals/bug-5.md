# Bug #5 — `tests/e2e/reduced-motion.spec.ts` (lines 30, 189) failures

## Classification
**Stale test contract.** Both failures share ONE root cause; treat as a single fix.

## Root cause
Task B.1 (`bd33ce7`) replaced the anon → `/login` server redirect at `/` with a real
`MarketingLanding` page. `app/(marketing)/page.tsx:50-57` now renders the marketing
component for anon visitors and only redirects authed visitors to `/dashboard`.

Both failing tests still encode the pre-B.1 contract:
- Header comment cites `Post-d2e287c` (the redirect commit) — superseded by B.1.
- Line 30 (AC7) calls `page.waitForURL(/\/login(?:$|\?|#)/)` and asserts
  `getByLabel(t.auth.emailLabel)` is visible. There is no redirect now and no
  email input on the landing — the wait times out, then the assertion fails.
- Line 189 (AC6 axe) does the same `waitForURL(/\/login/)` + `emailLabel`
  assertion before / after axe scan — same timeout path.

The 21 modified PNGs in `tests/screenshots/reduced-motion/...` (git status `M`)
are stale baselines from when the spec last passed against the redirect contract;
they are **artifacts of the failure, not the cause**, and will refresh once the
spec writes new screenshots after the fix.

Suspect 1 (`app/not-found.tsx`/`app/globals.css` B.SWEEP changes): NOT involved —
the failing routes are `/` and `/offline`, neither hits the 404 page.
Suspect 2 (`app/(app)/loading.tsx` `aria-busy`): NOT involved — `/` is now a
public route rendering inline; the loading boundary is for `(app)` only.
R1 firewall (`refresh-interceptor`, `cross-tab-signout`, `authFetch`,
`ConfirmationScreen`): NOT touched.

## Proposed fix (single edit, `tests/e2e/reduced-motion.spec.ts`)
Update both tests to match the post-B.1 reality:

1. **Header comment** (lines 12-15): replace the "no longer renderable wordmark
   surface" note with B.1 contract — anon `/` renders MarketingLanding
   (h1 wordmark + SIGN IN CTA), authed `/` redirects to `/dashboard`.

2. **Line 30 test** (AC7 redirect):
   - Drop `await page.waitForURL(/\/login.../)`.
   - Replace post-redirect assertion `getByLabel(t.auth.emailLabel)` with
     a landing DOM assertion: `page.getByTestId('landing-wordmark')`
     (h1 with `data-testid="landing-wordmark"`) **OR**
     `page.getByTestId('landing-signin-cta')` toBeVisible.
   - Keep `prefersReduce` evaluation + animation-duration ≤1ms loop
     unchanged — that contract still applies on the landing surface.
   - Rename test title from "redirects to /login" to "renders marketing
     landing under reduced-motion" to match new behavior.

3. **Line 189 test** (AC6 axe):
   - Drop the `waitForURL(/\/login/)`.
   - Run axe on the landing surface as-is (still public, still in scope).
   - Replace tail DOM assertion with `getByTestId('landing-wordmark')` or
     CTA toBeVisible — pure cosmetic substitute for `emailLabel`.

4. **Stale PNG baselines** (`ac7-01-landing-initial.png`,
   `ac7-02-landing-result.png`): these will be regenerated on the next
   pass since the spec already calls `page.screenshot()` after the user
   action. Do NOT manually delete; let Playwright write fresh files.
   The other 19 modified PNGs (offline + login) are unrelated to this fix.

## Files affected
- `tests/e2e/reduced-motion.spec.ts` (single file, ~10 line edit across
  header comment + lines 30-58 + lines 189-201).

## TDD applicability
Test-only change — no production logic touched. TDD waiver appropriate
(the spec IS the test; running it after the edit is the verification).
Run `pnpm exec playwright test tests/e2e/reduced-motion.spec.ts
--project=chromium --reporter=line` post-fix to confirm green.

## Regression risk
**Low.** Test-only edit. No change to `(marketing)/page.tsx`,
`MarketingLanding`, globals.css, or any production code. The other 4
tests in the file (`/offline`, `/login`, AC6 axe on `/offline` and
`/login`) are unaffected. The only risk vector is choosing a wrong
testid selector — both `landing-wordmark` and `landing-signin-cta` are
confirmed present in `MarketingLanding.tsx:100,139`.
