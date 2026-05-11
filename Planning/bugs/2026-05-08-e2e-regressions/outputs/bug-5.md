# Bug #5 Output — `tests/e2e/reduced-motion.spec.ts` AC7 + AC6 alignment

## Status
PASS — both target tests GREEN, all 6 tests in the file pass.

## Files changed
- `tests/e2e/reduced-motion.spec.ts` (test-only)

## Edits applied (3 surgical replacements)

### 1. Header comment block (lines 12–15)
Replaced "Surfaces under test" landing entry with the post-B.1 reality:
- Anon `/` renders the real `MarketingLanding` (h1 wordmark + SIGN IN CTA);
  authed `/` redirects to `/dashboard`.
- Asserts wordmark visibility + entry animation collapses to ≤1ms.
- Cited commit `bd33ce7` so the next reader can backtrack the contract change.

### 2. Line 30 test (AC7 landing)
- Renamed test title from `redirects to /login` → `renders marketing landing`.
- Updated inline comment block to cite Task B.1 commit `bd33ce7` and remove the
  "no longer renderable wordmark surface" claim.
- Dropped `await page.waitForURL(/\/login(?:$|\?|#)/)`.
- Replaced `getByLabel(t.auth.emailLabel)` post-redirect assertion with
  `getByTestId('landing-wordmark')` toBeVisible (confirmed at
  `MarketingLanding.tsx:100`).
- Kept `prefersReduce` evaluation + `≤1ms` animation-duration loop +
  both screenshot calls untouched (those are the actual axe-relevant
  contract assertions).

### 3. Line 189 test (AC6 axe on `/`)
- Renamed test title from `(post-redirect login)` → `(marketing landing)`.
- Updated inline comment to reference B.1 commit `bd33ce7` and the inline
  `MarketingLanding` rendering (no redirect anymore).
- Dropped `await page.waitForURL(/\/login(?:$|\?|#)/)`.
- Replaced tail `getByLabel(t.auth.emailLabel)` with
  `getByTestId('landing-wordmark')` toBeVisible.
- Kept `body` click + `injectAxeAndAudit` + serious/critical assertion
  unchanged (the actual a11y gate).

## Test results
```
pnpm exec playwright test tests/e2e/reduced-motion.spec.ts --project=chromium --reporter=line
6 passed (7.1s)
```

Both targeted tests:
- `AC7 · `/` renders marketing landing under reduced-motion and settles without animation` — PASS
- `AC6 · / (marketing landing) · zero serious/critical axe violations` — PASS

The 4 untouched sibling tests (`/offline`, `/login` AC7, `/offline` AC6,
`/login` AC6) all still pass — no collateral.

## Hard rules adhered
- No commit performed.
- No production code touched (`MarketingLanding.tsx`, `(marketing)/page.tsx`,
  `globals.css` all untouched).
- R1 firewall not approached (`refresh-interceptor`, `cross-tab-signout`,
  `authFetch`, `ConfirmationScreen` — none touched).
- Surgical: single file, only the 3 blocks the proposal targeted.
- 1 attempt — passed first run.

## Notes for orchestrator
The 21 modified PNGs in `tests/screenshots/reduced-motion/...` (from
`git status`) are stale baselines from the pre-B.1 contract; Playwright
overwrote `ac7-01-landing-initial.png` + `ac7-02-landing-result.png` on
this passing run. The remaining `offline`/`login` PNG drift is unrelated
to this bug and was not in scope per the proposal.
