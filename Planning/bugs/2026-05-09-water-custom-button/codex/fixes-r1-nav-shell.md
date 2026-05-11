# Round 1 fixes — components/nav/nav-shell.tsx

## I1 — 409 contract mirroring

- **Change:** The mobile water FAB's 409 OVER_DAILY_LIMIT branch now (a) parses
  the response body via `void res.json().catch(() => ({}))` for forward-
  compat / observability, and (b) calls `router.refresh()` after the
  cap-toast / dismiss work so the dashboard's `<WaterTracker />` RSC
  re-fetches `snapshot.water.consumedMl` and reconciles to the server's
  authoritative `currentTotalMl`. Without this, a user who taps the FAB
  at-cap (e.g., while the dashboard visibly shows 4750 ml because another
  tab pushed total to 5000) saw the cap toast but the dashboard bullets
  + ml total stayed stuck at the pre-cap value — the multi-tab race the
  contract is designed to handle.

  The body parse is fire-and-forget (`void`) rather than `await`-ed so
  the dismiss + cap-toast + refresh sequence runs in the same microtask
  as the 409 detection. This preserves the existing test tick semantics
  (3 `await Promise.resolve()` flushes are still sufficient) and matches
  the user requirement that visible UI updates not block on the body
  stream consumption that we are not actually using (the FAB does not
  consume `currentTotalMl` directly — the refresh path delivers truth
  via the RSC re-render).

- **Pattern copied from:** `components/dashboard/WaterTracker.tsx:292-307`
  (chip 409 handler — parses body, sets `committedConsumedMl =
  body.currentTotalMl`, bumps `resetKey`, shows cap toast). The FAB has
  no local water-total state, so `router.refresh()` substitutes for the
  chip's local state commit.
- **Test added:** `tests/components/nav/nav-shell.test.tsx::on 409
  OVER_DAILY_LIMIT, parses the body and calls router.refresh() so the
  dashboard reconciles to the server total (mirrors chip 409 contract)`.
  Replaces the prior anti-test that asserted `routerRefreshMock).not.
  toHaveBeenCalled()` — that prior contract was the bug Codex flagged.
- **Test results before/after:** RED → GREEN.

## Re-run results

- `npm test -- nav-shell` → **24 passed (24)**.
- `npm test -- WaterTracker` (regression) → **32 passed (32)**.
- TypeScript: **clean** (`npx tsc --noEmit`).
- ESLint: **clean** (`npx eslint components/nav/nav-shell.tsx tests/components/nav/nav-shell.test.tsx`).

## False positives

None.

## Stop-the-world

None.
