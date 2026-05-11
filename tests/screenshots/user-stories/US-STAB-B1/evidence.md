# US-STAB-B1 — root `/` redirect contract · evidence

> Task B.1 (US-STAB-B1) AC1 + AC2 evidence captured by `tests/e2e/web/user-stories/US-STAB-B1.spec.ts`.
> Click-through Mandate compliance (Phase B Codex Round 1, finding F-PB-R1-3): every AC body has ≥1 user-action API call (real `page.click()`) plus ≥1 post-action `expect(locator).toBeVisible()` against rendered DOM that did NOT exist before the action. `page.goto` is NOT used as the user action — it only seeds the canonical-404 launchpad. URL-only / title-only assertions DO NOT count toward the rendered-DOM requirement.

## AC1 — Authed user reaches `/` and lands on `/dashboard`

**User action sequence (WHEN):**

1. Real-user `authedPage` fixture provisions a fresh Supabase user, flips the profile to onboarding-complete, and writes the `sb-<ref>-auth-token` cookie before the test body runs.
2. `authedPage.goto('/this-page-does-not-exist-us-stab-b1')` parks the browser on the canonical 404 page (`app/not-found.tsx`). The canonical 404 carries a real `<Link href="/" data-testid="canonical-404-cta">` — a genuine in-DOM, user-clickable affordance. **This `goto` is the GIVEN scaffold, NOT the user action.**
3. **User action:** `await cta.click()` on `canonical-404-cta`. This is a real `page.click()` on a real anchor — exactly how a real user reaches `/` after hitting a 404. The browser navigates to `/`; Next.js evaluates `app/(marketing)/page.tsx`; `getServerSupabase().auth.getUser()` succeeds; `redirect('/dashboard')` fires.

**Observable change (THEN):**

- URL settles at `/dashboard` (regex `/\/dashboard(\?|$)/`).
- `dashboard-masthead` testid (the editorial broadsheet header rendered exclusively by `/dashboard`) becomes visible within 10s.
- `dashboard-masthead` did NOT exist on the canonical 404 page that hosted the click — its post-click visibility proves the destination route actually rendered.

**Assertions confirming the AC's THEN clause:**

- `expect(authedPage).toHaveURL(/\/dashboard(\?|$)/)` — URL anchor (supplemental, not the rendered-DOM assertion).
- `expect(authedPage.getByTestId('dashboard-masthead')).toBeVisible()` — the rendered-DOM assertion the click-through mandate requires.

## AC2 — Anon user reaches `/` and sees the public landing, then proceeds to `/login`

**Why this AC cannot reuse AC1's canonical-404 launchpad (Codex Round 2 finding F-PB-R2-1):**

Round 1 routed AC2 through the same `goto('/this-page-does-not-exist-*')` → click `canonical-404-cta` flow as AC1, but `middleware.ts` redirects ANY unauthenticated request to a non-public route (incl. arbitrary nonexistent paths) to `/login` BEFORE Next.js gets to render `app/not-found.tsx`. That middleware bounce is the right product behaviour but it means an anon visitor never reaches the canonical 404 — the AC2 click-through never executed and the AC was vacuously "passing" by failing at `goto`. Per Round 2 verdict, AC2 now navigates to `/` directly (PUBLIC route per `lib/auth/public-routes.ts`, middleware passes through) and uses the landing's own `landing-signin-cta` as the click-through launchpad.

**User action sequence (WHEN):**

1. Plain `@playwright/test` `page` fixture starts a clean browser context with no auth cookie.
2. `page.goto('/')` — `/` IS a public route (allowlisted in `lib/auth/public-routes.ts`); middleware passes through; `app/(marketing)/page.tsx` evaluates `getServerSupabase().auth.getUser()`; for the unauthenticated browser this returns `{ user: null }`; the page renders `<MarketingLanding deleted={false} />` inline (no `redirect()` call). **GIVEN setup, NOT the user action.** The Given assertions on `landing-root` / `landing-wordmark` / `landing-signin-cta` confirm the landing actually rendered — this IS the literal THEN clause of AC2 ("I see the public landing page (no auth gate, no redirect to dashboard)").
3. **User action:** `await signinCta.click()` on `landing-signin-cta`. Real click on the landing's `<a href="/login">` anchor — proves the landing is a fully interactive surface (not a phantom DOM snapshot) and proves the landing → login wiring is reachable end-to-end. This satisfies the click-through mandate's user-action requirement.

**Observable change (THEN):**

GIVEN-stage assertions (confirm AC2's literal THEN clause "I see the public landing page"):

- URL stays at `/` (regex `/\/$/`) — no bounce to `/login`, no bounce to `/dashboard`.
- `landing-root` `<main>` landmark visible.
- `landing-wordmark` h1 visible with text matching `/KALORI/`.
- `landing-signin-cta` `<a>` visible with `href="/login"`.

Post-action assertions (after `signinCta.click()`):

- URL settles at `/login` (regex `/\/login(\?|$)/`).
- `#login-email` input rendered exclusively by `/login`'s `<LoginForm />` becomes visible — did NOT exist on the landing page that hosted the click. Its post-click visibility satisfies the click-through mandate's rendered-DOM post-action assertion requirement.

**Assertions confirming the AC's THEN clause:**

- `expect(landingRoot).toBeVisible()`, `expect(wordmark).toBeVisible() + toHaveText(/KALORI/)`, `expect(signinCta).toBeVisible()` — three rendered-DOM assertions on the landing surface (these directly verify the AC's "I see the public landing page" THEN clause; rendered as part of the GIVEN setup since `goto('/')` IS reaching `/` exactly as the AC describes).
- `expect(loginEmail).toBeVisible()` — rendered-DOM assertion on the login surface after the click-through, satisfies the click-through mandate.
- URL assertions are supplemental, not the rendered-DOM evidence.

## Sequenced screenshots

| File                 | When captured                                                                                 | What it shows                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ac1-01-initial.png` | After `goto('/this-page-does-not-exist-us-stab-b1')`, BEFORE `cta.click()`                    | Given state — browser parked on canonical 404 with the `<Link href="/">` CTA visible and ready to click. Pre-user-action frame.                                                                                                                                               |
| `ac1-02-result.png`  | After `cta.click()` AND after `dashboard-masthead` is asserted visible green                  | Then state — `/dashboard` rendered with the masthead landmark visible (proven, not assumed). Post-click, post-assertion frame.                                                                                                                                                |
| `ac2-01-initial.png` | After anon `goto('/')` AND landing testids asserted visible green, BEFORE `signinCta.click()` | Given state — anon browser landed on `/`; marketing landing rendered with `landing-root` / `landing-wordmark` / `landing-signin-cta` visible. This frame literally shows the AC's THEN clause ("I see the public landing page"). Pre-user-action frame for the click-through. |
| `ac2-02-result.png`  | After `signinCta.click()` AND after `#login-email` is asserted visible green                  | Then state — `/login` rendered with the email input visible (proven, not assumed). Post-click, post-assertion frame proving the landing → login wiring is interactive.                                                                                                        |

## Failure-mode mapping (diagnosis-on-RED)

If this spec fails:

- **AC1 stays on canonical 404 after click** → `<Link href="/">` not wired or Next.js client navigation broken; check `canonical-404-cta` `href` attribute.
- **AC1 lands on `/login`** → Server is treating the authed visitor as anon — `getUser()` errored or middleware intercepted; check Supabase `kalori-dev` env vars.
- **AC1 dashboard testid missing** → `/dashboard` itself is broken (regression in dashboard surface, not B.1) OR the redirect went somewhere else; check `app/(marketing)/page.tsx`.
- **AC2 `goto('/')` redirects to `/login`** → `/` was inadvertently dropped from `lib/auth/public-routes.ts` `PUBLIC_ROUTES`, OR `(marketing)/page.tsx` reverted to `redirect('/login')` on the anon branch. This is the exact failure mode F-PB-R2-1 highlighted on the previous Round 1 launchpad — the new GIVEN now asserts URL stays at `/` so this regression surfaces immediately.
- **AC2 `goto('/')` redirects to `/dashboard`** → Landing's auth check is treating anon as authed; `getUser()` is leaking a session cookie OR test isolation is broken.
- **AC2 landing testid missing on `/`** → `MarketingLanding` rendered but without `data-testid="landing-root"`; check `components/marketing/MarketingLanding.tsx`.
- **AC2 wordmark missing or wrong** → h1 didn't render or testid mismatch (`landing-wordmark`, NOT `marketing-wordmark`).
- **AC2 signin CTA href wrong** → `<a href>` not `/login`; design fragment §4 fixes the destination.
- **AC2 `#login-email` not visible after click** → login form not mounting; either the `/login` route is broken or `LoginForm` failed to render.

## Click-through Mandate compliance check (F-PB-R1-3 + F-PB-R2-1 audit)

Per Codex Round 1 finding F-PB-R1-3, this spec previously used `page.goto('/')` as the only user action — forbidden. Round 1's rewrite added `page.click()` on the canonical-404 CTA as the launchpad for both ACs. Round 2 finding F-PB-R2-1 then surfaced that the AC2 launchpad was unreachable for anon visitors (middleware redirected `/this-page-does-not-exist-*` to `/login` before `app/not-found.tsx` could render). The Round 2 fix routes AC2 directly through `/` (a public route) and uses `landing-signin-cta` as the click-through launchpad. Both ACs now satisfy:

- ≥1 user-action API call from the allowed set: `click / fill / press / tap / hover / drag / keyboard.type` — both ACs use `click()`.
- ≥1 post-action `expect(locator).toBeVisible() / toHaveText() / toHaveAttribute()` against rendered DOM that did NOT exist before the action — AC1 asserts `dashboard-masthead` (unique to `/dashboard`); AC2 asserts `#login-email` (unique to `/login`).
- Sequenced screenshots `ac<N>-01-initial.png` (Given) + `ac<N>-02-result.png` (Then, AFTER assertions resolve green) — captured per AC.

AC2 additionally proves the AC's literal THEN clause ("I see the public landing page") via three rendered-DOM assertions (`landing-root` / `landing-wordmark` / `landing-signin-cta`) on the GIVEN-stage page; the click-through to `/login` is the user-action that satisfies the mandate without invalidating the unauthenticated-`/`-shows-landing contract.
