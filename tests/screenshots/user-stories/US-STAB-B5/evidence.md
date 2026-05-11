# US-STAB-B5 — Acceptance Evidence (Screenshots)

Task B.5: Site-wide nav audit + canonical 404 page.

## AC3 — Canonical Kalori 404 page renders for unknown routes

### Action chain

1. Authed visitor (real-user fixture) navigates to a deliberately-bad URL
   `/this-route-does-not-exist-xyz-{Date.now()}`. The timestamp suffix
   defeats Vercel-edge / Service Worker / browser caches that may have
   200-cached a previously-rendered known-bad URL.
2. The Next.js App Router resolves no matching segment and returns HTTP
   404, rendering `app/not-found.tsx` (the canonical Kalori 404 page).
3. AC3-01 screenshot captured immediately after navigation completes.
4. axe-core scans the rendered 404 page for serious/critical violations.
5. The user clicks the recovery CTA "RETURN TO THE LEDGER" (a
   `<Link href="/">`).
6. The browser navigates to `/`. The marketing route RSC server-redirects
   the authed user to `/dashboard`.
7. AC3-02 screenshot captured after the redirect settles on the landing
   surface.

### Observable changes

- BEFORE click: `data-testid="canonical-404"` is visible. H1 reads "404".
  Body copy reads "This page is not in the ledger. The archive holds no
  record of the address you visited." (matches `t.notFound.body`). CTA
  link "RETURN TO THE LEDGER" is visible.
- AFTER click: `data-testid="canonical-404"` is no longer in the DOM.
  URL is on the recovery surface (dashboard / onboarding / marketing
  landing depending on auth flow).

### Assertions that confirmed THEN

- `expect(response!.status()).toBe(404)` — the route returned the correct
  HTTP status. The HTTP 404 IS the feature; the canonical-404 testid
  proves the Kalori component (not a Next.js default) rendered.
- `expect(getByTestId('canonical-404')).toBeVisible()` — binary
  discriminator. `app/not-found.tsx` is the only surface in the
  codebase carrying this testid.
- `expect(getByRole('heading', { level: 1, name: /404/i })).toBeVisible()` —
  H1 rendered with "404" content.
- `expect(getByText(/not in the ledger|page not found|archive holds/i)).toBeVisible()` —
  editorial body copy from the UX fragment.
- `expect(getByRole('link', { name: /return to the ledger/i })).toBeVisible()` —
  CTA visible per UX fragment label.
- `axeResults.violations.filter(v => v.impact === 'serious' || 'critical')
).toEqual([])` — zero serious/critical a11y violations on the 404 page.
- After click: `expect(getByTestId('canonical-404')).toHaveCount(0)` —
  proves the CTA navigated away from the 404 page (CTA is wired, not
  decorative).

### Screenshots

- `ac3-01-initial.png` — the rendered 404 page after `goto()` resolves
  but before the CTA click. Shows the canonical Kalori component:
  KALORI wordmark, "§ THE LEDGER · ARCHIVE" kicker, oxblood "404"
  glyph, hairline rule, editorial italic body copy, "RETURN TO THE
  LEDGER" CTA.
- `ac3-02-result.png` — the post-click state. Browser has navigated
  away from the 404 page to the recovery surface; canonical-404
  testid no longer present.

### Click-Through Mandate compliance

- WHEN — `goto(badUrl)` + later `cta.click()` are both real user actions.
- THEN — every assertion is on rendered DOM (`expect(locator).toBeVisible()`,
  `toHaveCount`, role/text/testid queries). NO URL-only or title-only
  assertions are used as primary discriminators.
- 2-screenshot rule satisfied — `ac3-01-initial.png` (Given state after
  goto) and `ac3-02-result.png` (Then state after click).
