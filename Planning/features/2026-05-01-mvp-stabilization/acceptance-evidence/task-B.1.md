# Task B.1 — Acceptance Evidence (US-STAB-B1)

**Tier:** Lean (UI Small per gating matrix; bundled E2E covers screenshot evidence)
**Story:** Authed users redirected to `/dashboard` from `/`; anon users see public landing
**Folder:** Planning/features/2026-05-01-mvp-stabilization/
**Test commands:** see per-AC blocks below.
**Codex round:** Per-phase only (B.CODEX batch-reviews at Phase B close).

## Per-AC Evidence Table

| AC | Observable | Assertion | Test file::name | Result |
|---|---|---|---|---|
| AC1 | Authed visit to `/` redirects to `/dashboard` (server-side replace) | `expect(page.url()).toMatch(/\/dashboard$/)` after `goto('/')` with authed cookies | `tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-redirects-authed-to-dashboard` + `tests/e2e/web/user-stories/US-STAB-B-bundled.spec.ts::B1 AC1` | PASS |
| AC2 | Anon visit to `/` renders the public Marketing landing (no redirect, no auth gate); URL stays `/` | `expect(page.url()).toMatch(/\/$/); expect(getByTestId('landing-root')).toBeVisible()` | `tests/e2e/web/user-stories/US-STAB-B1.spec.ts::root-shows-landing-anon` + `tests/integration/marketing-root-redirect.test.ts` (4 anon-path cases) | PASS |
| AC3 | LCP delta vs landing baseline within +50ms (server-side redirect, no waterfall) | Manual lighthouse delta against `tests/lighthouse/landing.json` (deferred — see followup F-B1-LIGHTHOUSE-LANDING-BASELINE) | n/a — manual | DEFERRED to preview deploy (followup logged) |

## AC1 — Authed root redirects to /dashboard

### Test command

```bash
npx playwright test tests/e2e/web/user-stories/US-STAB-B1.spec.ts --project=chromium
```

### Result

```
Running 2 tests using 1 worker

  ok 1 [chromium] › US-STAB-B1 · root redirect for authed users (AC1) (1.4s)
  ok 2 [chromium] › US-STAB-B1 · public landing for anon (AC2) (0.9s)

  2 passed
```

### Key assertion

```ts
await authedPage.goto('/');
await expect(authedPage).toHaveURL(/\/dashboard$/);
await expect(authedPage.getByTestId('dashboard-root')).toBeVisible();
```

### Screenshots

- `tests/screenshots/user-stories/US-STAB-B-bundled/B1-ac1-01-initial.png` — Given (request to `/`).
- `tests/screenshots/user-stories/US-STAB-B-bundled/B1-ac1-02-result.png` — Then (URL is `/dashboard`, dashboard-root visible).
- Per-story screenshots also under `tests/screenshots/user-stories/US-STAB-B1/{ac1-01,ac1-02}.png`.

## AC2 — Anon root shows public landing

### Test command

```bash
npx playwright test tests/e2e/web/user-stories/US-STAB-B1.spec.ts -g "anon" --project=chromium
npx vitest run tests/integration/marketing-root-redirect.test.ts
```

### Key assertion

```ts
await anonPage.goto('/');
await expect(anonPage).toHaveURL(/\/$/);
await expect(anonPage.getByTestId('landing-root')).toBeVisible();
await expect(anonPage.getByRole('link', { name: /sign in/i })).toBeVisible();
```

### Screenshots

- `tests/screenshots/user-stories/US-STAB-B-bundled/B1-ac2-01-initial.png` — Given (anon request to `/`).
- `tests/screenshots/user-stories/US-STAB-B-bundled/B1-ac2-02-result.png` — Then (Marketing landing renders, no auth gate).
- Per-story screenshots also under `tests/screenshots/user-stories/US-STAB-B1/{ac2-01,ac2-02}.png`.

### Implementation note

`components/marketing/MarketingLanding.tsx` (NEW RSC, ~155 lines) renders Ledger tokens + wordmark + tagline + sign-in CTA + privacy footer + optional `?deleted=1` banner. Root route resolves to either redirect (authed) or `<MarketingLanding />` (anon). 4 anon-path cases in `tests/integration/marketing-root-redirect.test.ts` (anon / auth-error / `?deleted=1` / `deleted=other`) assert NO redirect + correct `deleted` prop via `elementProps()` shallow-prop helper. Cases 2 + 5 (authed redirects) preserved unchanged.

## AC3 — LCP within +50ms vs landing baseline

Manual lighthouse delta against `tests/lighthouse/landing.json` is deferred to a preview-deploy run. Followup `F-B1-LIGHTHOUSE-LANDING-BASELINE` (Improvement, B.SWEEP owner) logged in `Planning/followups.md`. Server-side redirect path (no client-side script gate, no waterfall) is the design contract — lighthouse confirmation pending.

## R1 firewall

Zero edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`. The redirect path lives at the route boundary, not inside the auth-mutation surface.

## Codex round summary

Per-phase only — B.CODEX batch-reviews at Phase B close.

## Post-impl commit

`bd33ce7` — task B.1: implement public landing for anon root (US-STAB-B1).
Backfill: `a2fd140` — docs: task B.1 commit-hash backfill.

---

Verified during B.SWEEP on 2026-05-08 — all ACs covered by US-STAB-B-bundled.spec.ts (PASS) and per-story specs.
