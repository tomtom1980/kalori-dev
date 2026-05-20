# US-STAB-C6 — Evidence narrative

**Task:** C.6 — Library grid → `/library/[id]` detail page navigation wired
**Date:** 2026-05-14
**Tier:** Standard (Small + UI)

## Surface change

One-line fix in `app/(app)/library/_components/LibraryClient.tsx:247-252`. The
`onActivate` callback previously held a deferred-task TODO no-op. It now
imperatively calls `router.push(`/library/${item.id}`)`. All three call sites
(grid click, Enter, Space) were already plumbed through `LibraryCard.handleClick`
(`LibraryCard.tsx:55-79`), so a single callback body wires all of AC1+AC2+AC3.

No card-level changes. No grid-level changes. No router/auth/profile/RLS surface
touched — R1 firewall preserved.

## Per-AC proof

### AC1 — click-card-navigates-to-detail

- **Integration-level proof:** `tests/integration/library-grid-navigation.test.tsx`
  test `AC1 (unit-level): clicking a card calls router.push("/library/${id}")`.
  Renders `<LibraryClient>` with two seeded items, clicks
  `library-card-a`, asserts `routerPushMock` was called exactly once with
  `'/library/a'`. **PASS** (4/4 in the file).
- **E2E-level proof:** `tests/e2e/web/user-stories/US-STAB-C6.spec.ts`
  test `AC1: click-card-navigates-to-detail`. Seeds one library row via
  `seedLibraryItems`, navigates to `/library`, clicks the seeded card, asserts
  both `expect(authedPage).toHaveURL(/\/library\/${itemId}$/)` AND
  `expect(getByTestId('page-library-detail')).toBeVisible()` (DOM assertion,
  not URL-only — Click-through Mandate compliant). Two sequenced screenshots
  (`ac1-01-initial.png`, `ac1-02-result.png`).
- **E2E run status (local):** blocked at the shared `authedPage` fixture's
  `admin.createUser failed: Invalid API key` — pre-existing F-TEST-4 #1 gap
  affecting ALL E2E specs using `authedPage` (verified by running
  `US-STAB-C5.spec.ts` locally: same 5/5 failure mode). NOT a C.6 regression.
  Spec is structurally valid and will run green in CI once the shared infra
  unblock lands.

### AC2 — keyboard-enter-and-space-activate

- **Integration-level proof (authoritative):**
  `tests/integration/library-grid-navigation.test.tsx` tests:
  - `AC2 (keyboard-enter-and-space-activate): Enter on focused card routes to /library/${id}` — **PASS**
  - `AC2 (keyboard-enter-and-space-activate): Space on focused card routes to /library/${id}` — **PASS**
- Per the briefing §9-A and tasks.md, AC2 is integration-level by design: the
  card key handler (`LibraryCard.tsx:71-79`) maps `Enter` and `' '` (Space) to
  `handleClick()` synchronously, which calls `onActivate(item)`. The keyboard
  binding is a library-internal seam, not a runtime browser-specific
  behavior — RTL via happy-dom is the correct test scope.
- Regression-guarded by the select-mode test: pressing on a card while in
  select mode toggles selection and does NOT call `router.push`
  (`select-mode preserves toggle semantics`) — **PASS**.

### AC3 — log-now-from-detail-still-works

- **E2E-level proof:** `tests/e2e/web/user-stories/US-STAB-C6.spec.ts`
  test `AC3: log-now-from-detail-still-works`. Clicks through from `/library`
  to detail page, clicks the existing `food-detail-log-now` button
  (the F19 surface, unchanged), asserts navigation to
  `/log?tab=library&item=${itemId}` AND that `log-flow-modal` renders. Two
  sequenced screenshots (`ac3-01-initial.png`, `ac3-02-result.png`).
- E2E blocked locally on the same F-TEST-4 #1 fixture gap. Spec is structurally
  valid and serves as a regression-guard for F19-AC4 once CI runs.
- **Static regression-guard:** the C.6 fix touches only the `onActivate`
  callback inside `LibraryClient`. The detail page (`app/(app)/library/[id]/page.tsx`)
  is untouched. `FoodDetail.tsx` is untouched. `FoodDetailActions.tsx` is
  untouched. The Log-Now affordance code path is byte-identical before and
  after C.6.

## Screenshots

E2E run currently blocked at the auth fixture (see AC1 + AC3 sections above).
Screenshots are emitted by the Playwright spec at:

- `ac1-01-initial.png` — `/library` with seeded card visible (pre-click)
- `ac1-02-result.png` — `/library/[id]` detail page rendered (post-click)
- `ac3-01-initial.png` — detail page with `food-detail-log-now` visible
- `ac3-02-result.png` — `/log?tab=library&item=...` log flow modal rendered

These will populate when CI runs the spec after F-TEST-4 #1 unblock (or when a
local `.env.local` is configured with a valid `SUPABASE_SECRET_KEY` for the dev
project).

## Verification commands run (Phase 3 GREEN)

```bash
# Targeted integration — C.6's authoritative GREEN proof for AC1+AC2
npx vitest run tests/integration/library-grid-navigation.test.tsx --pool threads --maxWorkers 1
# Result: 4/4 PASS (1.30s)

# Regression — broader library client island
npx vitest run tests/integration/library-page.test.tsx --pool threads --maxWorkers 1
# Result: 11/11 PASS (2.70s)

# Type-check
npm run typecheck
# Result: clean

# Lint touched files
npx eslint app/(app)/library/_components/LibraryClient.tsx tests/integration/library-grid-navigation.test.tsx tests/e2e/web/user-stories/US-STAB-C6.spec.ts
# Result: clean

# Playwright E2E (blocked on F-TEST-4 #1 fixture infra — see AC sections above)
npx playwright test tests/e2e/web/user-stories/US-STAB-C6.spec.ts --project=chromium
# Result: 2/2 fail at provisionTestUser() with "Invalid API key" — identical
# failure mode as US-STAB-C5.spec.ts (already-shipped C.5). Pre-existing,
# NOT a C.6 regression.
```

## Decision log

1. **`router.push` over `<Link>`** — the card is a `<button>` with role-switching
   (button vs checkbox in select mode) and double-duty click handler. Nesting
   `<Link>` inside `<button>` would create nested interactive elements (a11y
   red flag). Imperative `router.push()` matches the existing pattern (same
   component uses `router.refresh()` in two places).
2. **Card-level untouched** — `LibraryCard.handleClick` and `handleKeyDown`
   already forward Enter, Space, and click through `onActivate(item)`. Once
   the callback body is non-empty, all three input modes navigate. No card
   change needed. tasks.md's "Files to touch" entry for `LibraryCard.tsx` is
   stale (briefing §15 flags this).
3. **AC2 covered at integration only** — the keyboard binding is structural,
   not a runtime browser behavior. RTL via happy-dom is sufficient and is the
   primary GREEN proof for AC2. E2E AC1 spec implicitly regression-guards the
   keyboard path via the same `onActivate` callback wire.
4. **Codex deferred to phase-level (C.CODEX)** — per the briefing §1, C.6 is
   Small complexity with per-phase Codex only.

## R1 firewall: ✅ preserved

The C.6 change is client-side `router.push` only. No auth, no profile, no RLS,
no refresh-interceptor surface touched. The destination route
(`app/(app)/library/[id]/page.tsx`) does its own `supabase.auth.getUser()`
check and redirects to `/login?reason=session_expired&redirect_to=...` on
missing user — that behavior is byte-identical before and after C.6.
