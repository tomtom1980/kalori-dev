# Fix R1 — components/nav/nav-shell.tsx

## Findings addressed
- **I1** (Improvement): post-POST staleness on dashboard tracker chip
  (`components/nav/nav-shell.tsx:151-169`). After a successful water POST,
  the FAB toast confirms `250 ml logged` while the visible dashboard
  bullets and ml total remain unchanged until the next navigation,
  enabling duplicate taps and user confusion.

## Path chosen
**cheap (router.refresh)**

## Rationale
Investigation results that drove the choice:

1. **`useWaterTrackerStore` does not exist** — `Grep useWaterTrackerStore`
   returned zero matches anywhere in the repo. The "heavier path"
   (Codex's option b: route the FAB write through a shared optimistic
   store) would require designing and shipping a new Zustand store,
   migrating `<WaterTracker />` off `useOptimistic` into the store, and
   wiring cross-tab broadcast. That is a feature, not a fix.
2. **`<WaterTracker />` already owns optimistic UX locally** — it uses
   `useOptimistic` with a `resetKey` rollback path (lines 47–106 of
   `components/dashboard/WaterTracker.tsx`). It is a self-contained
   client island that re-renders cleanly when its parent RSC supplies a
   new `initial.consumedMl` prop.
3. **The dashboard page is `force-dynamic`** —
   `app/(app)/dashboard/page.tsx:47` declares `export const dynamic =
   'force-dynamic'`, and the water totals come from `await
   fetchDaySnapshot(...)` (line 76). `router.refresh()` re-runs the
   server component, re-fetches the snapshot, and threads the fresh
   `consumedMl` into `<WaterTracker initial={...} />` (line 163-170).
   Net result: the chip updates without a duplicate optimistic state
   path, and `<WaterTracker />`'s own internal state (`useOptimistic`
   reducer + `committedConsumedMl` setter) remains the local source of
   truth for users interacting with its chips.
4. **No contraindications** — on non-dashboard routes, `router.refresh()`
   refreshes the current segment's RSCs (cheap; no observable UX
   change), so the FAB call site does not need branching. On the
   dashboard route specifically, the chip updates in place. On a slow
   network, the refresh races the toast TTL (2 s) but does not block
   the toast from rendering — Next dispatches `refresh()` async.

## Changes
- `components/nav/nav-shell.tsx`:
  - Added `useRouter` to the existing `next/navigation` import line.
  - Inside `NavShell`, captured `const router = useRouter();` next to
    the existing `pathname` derivation, with an inline rationale comment
    pointing at I1.
  - In `handleLogWater`'s success branch, added `router.refresh();`
    after `announcePolite(...)` and before the `catch`/`finally`. Did
    NOT add it to the `catch` branch — refreshing on failure would mask
    the error and trigger a wasteful RSC re-fetch.
  - No optimistic state introduced into `nav-shell.tsx`. The handler
    remains the canonical "fire-and-forget POST + toast" shape; the
    `<WaterTracker />` island continues to own its own optimistic UX.
- `tests/components/nav/nav-shell.test.tsx`:
  - Hoisted a `routerRefreshMock` next to the existing `routerPushMock`
    so per-test assertions can see invocation counts.
  - Wired the mock into the existing `useRouter` mock (`refresh: () =>
    routerRefreshMock()`).
  - Added `routerRefreshMock.mockReset()` to the `beforeEach` cleanup.
  - Added two new tests inside the `Bug-1 — water FAB direct POST + toast`
    describe block:
    1. `'after successful POST, calls router.refresh() to invalidate
       dashboard cache'` — RED first, GREEN after fix.
    2. `'on POST failure, does NOT call router.refresh()'` — passes
       both before and after the fix; serves as a regression guard
       against accidentally adding `refresh()` to the catch branch.

## Tests added/modified
- `tests/components/nav/nav-shell.test.tsx`:
  - NEW: `> Bug-1 — water FAB direct POST + toast (no navigation) > after successful POST, calls router.refresh() to invalidate dashboard cache`
  - NEW: `> Bug-1 — water FAB direct POST + toast (no navigation) > on POST failure, does NOT call router.refresh() (nothing fresh to fetch)`

## Verification
- `npx vitest run tests/components/nav/nav-shell.test.tsx` →
  **15 passed (15)** in 1.34 s. The previously-RED test
  `after successful POST, calls router.refresh()` is now GREEN.
- `npx vitest run tests/components/nav/` (full nav suite regression
  sweep) → **52 passed (52)** across 7 files in 1.37 s. No prior nav
  test broke.
- `npx tsc --noEmit` → no output (clean exit). The `useRouter` import
  + `router.refresh()` call type-check.

## False-positive flag
<false_positive: false>

I1 is a real UX defect. Codex's recommendation matches the diagnosis,
and the cheap fix is implementation-ready without speculative
infrastructure (no shared store needed for a single FAB call site).
