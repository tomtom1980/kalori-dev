# Bug 1: Water FAB on mobile is non-functional + missing default 250ml log + missing toast feedback

## Classification

known_fix

The bug has three coupled aspects (a) FAB does nothing on mobile, (b) missing default 250ml log behavior, (c) missing toast/floating-text confirmation. All three resolve under one cohesive change: replace the Path A "navigate to /dashboard" handler with a direct in-place +250ml log + canonical toast confirmation. No architectural reconciliation needed; the API contract (`POST /api/water/log` accepting `{ unit:'glass', count:1 }`) already supports the 250ml case verbatim because `ML_PER_UNIT.glass = 250` (`lib/dashboard/types.ts:82-86`). Path A's design is fundamentally incompatible with the user's stated intent — but Path A was the user's earlier decision in the prior batch, made BEFORE knowing the in-place log path was viable from nav-shell. This is a re-decision, not a feature, because the `/api/water/log` endpoint already exists and is wired through `authPost`. No brainstorm-tomi escalation warranted.

## Root Cause

`components/nav/nav-shell.tsx:192` wires the water FAB's onClick as `() => router.push('/dashboard')` (Path A). When the user taps the FAB while ALREADY on `/dashboard` — by far the most common state since `/dashboard` is the default authenticated landing page (`app/(app)/dashboard/page.tsx`) — `router.push('/dashboard')` is a same-route navigation that produces NO user-observable side effect: no scroll, no flash, no log entry, no toast. The button appears dead. Even on a non-dashboard route, the behavior (navigate away just to land on a chip the user must then tap a second time) does not match the user's stated "press and it logs 250ml" intent. Bug type per lessons learned line 22: a TDD-green test (`tests/components/nav/log-fab.test.tsx:116-121`) asserted PRESENCE of `onClick` firing but never the BEHAVIOR (the action's user-observable effect) — exactly the "false-green" pattern Codex's adversarial framing was supposed to catch in the prior batch but the wire was already considered "complete" since `router.push` *is* a real call.

## Proposed Change (Diff Outline)

### 1. `components/nav/nav-shell.tsx` (modify)

- Remove the `import { useRouter }` line; it becomes unused after this change (the food FAB doesn't use it either).
- Remove `const router = useRouter();` from the `NavShell` body.
- Replace the water FAB's onClick from `() => router.push('/dashboard')` to a new local handler `handleLogWater` defined inside `NavShell` that:
  - Generates a `client_id` via `crypto.randomUUID()` (mirror `WaterTracker.tsx:49-58` `mintClientId` helper — promote that helper to a shared file OR inline a local copy with the same UUID-v4 fallback shape).
  - Computes today-in-user-TZ as `'YYYY-MM-DD'` for the `logged_on` field. **Open question (see §Open Questions below)** — the cleanest path is to thread `loggedOn` down from `(app)/layout.tsx` as a new `NavShell` prop (`loggedOn: string`), derived server-side via `userTzToday(profile.timezone)` so the timezone source is the same one `WaterTracker` already uses. Inline `Intl.DateTimeFormat`-based fallback in pure client code is workable but duplicates logic and risks TZ drift if `profile.timezone` ever differs from the browser's resolved zone.
  - Calls `authPost('/api/water/log', { client_id, unit: 'glass', count: 1, logged_on })` (mirror `WaterTracker.tsx:86-91` exactly — same wire shape).
  - On success: `useUndoQueueStore.getState().pushToast({...})` with `kind: 'delete-failed'` (canonical "non-undoable" pattern per `UndoToast.tsx:65` which renders no UNDO button when `kind === 'delete-failed'`), `description` from a new i18n key `t.fab.waterLoggedToast` (e.g. "250ml logged"), `clientId` (the same UUID), `serverRowId: null`, `commit: async () => {}`, `revert: async () => {}`.
  - Calls `announcePolite(t.fab.waterLoggedAnnounce.replace('{ml}', '250'))` for screen-reader parity with `WaterTracker`'s `liveAddedFormat` pattern.
  - On failure: same error toast pattern as `WaterTracker.tsx:99-110` — no rollback to do (no optimistic UI in nav-shell), but push a `delete-failed` toast with `t.dashboard.water.errorToast` so the user knows the tap didn't take.
  - Use `inFlightRef` (a `useRef<boolean>`) checked + set BEFORE entering the async path, cleared in `finally`. **Reason:** lessons-relevant line 14 — "`startTransition` does NOT commit `setBusy(true)` synchronously — same-tick double-submit bypasses the React-state guard." A user can double-tap the FAB on mobile faster than React can commit a `useState(true)`. The ref-latch is the correct synchronous gate. (`startTransition` is NOT used here because the FAB has no optimistic UI to defer; just fire-and-forget the POST with a synchronous gate.)
- Update the JSX: `<LogFAB variant="water" onClick={handleLogWater} />`.

### 2. `lib/i18n/en.ts` (modify)

- Add to the `fab` namespace (around lines 1232-1242):
  - `waterLoggedToast: '250 ml logged'` (or per Open Question §1 — confirm copy)
  - `waterLoggedAnnounce: '{ml} millilitres of water logged'` (parity with `dashboard.water.liveAddedFormat`)
- Update `tests/unit/i18n-shape.test.ts` if it has a fab-namespace shape assertion (need to verify in implementation).

### 3. `tests/components/nav/log-fab.test.tsx` (no change needed)

The unit test continues to assert `onClick` fires when the button is pressed — this is correct per lessons-relevant line 22 because the actual BEHAVIOR (POST + toast) is exercised at the `nav-shell.test.tsx` integration level + e2e level.

### 4. `tests/components/nav/nav-shell.test.tsx` (modify — add behavior tests)

- Add a new `describe('water FAB behavior')` block:
  - Test 1: clicking `log-fab-water` fires `authPost` with payload `{ client_id: <UUID-v4>, unit: 'glass', count: 1, logged_on: <YYYY-MM-DD> }` (mock `authPost`, assert call shape).
  - Test 2: on `authPost` success, `useUndoQueueStore.pushToast` is called with the correct `description`, `kind: 'delete-failed'`, `serverRowId: null`.
  - Test 3: on `authPost` rejection (non-`SessionExpiredError`), the error toast is pushed with `t.dashboard.water.errorToast`.
  - Test 4: rapid double-tap fires `authPost` exactly ONCE (ref-latch guard).
  - Test 5: BEHAVIOR-not-PRESENCE follow-through — assert that after success, `useUndoQueueStore.getState().stack.length === 1` and the entry's `description === t.fab.waterLoggedToast`.

### 5. `tests/visual/water-fab-toast.spec.ts` (NEW)

- One Playwright spec at 375×667 (mobile) viewport:
  - Mount `/dashboard` (authedPage).
  - Click `log-fab-water`.
  - Wait for `data-testid="undo-toast"` to be visible.
  - Assert the toast text contains "250 ml logged".
  - Assert the UNDO button is NOT rendered (`page.getByTestId('undo-action')` does NOT exist) — this is the `kind: 'delete-failed'` discriminator working as intended.
  - Wait 5500ms, assert the toast has been removed (`undo-toast` no longer in DOM).
- ALSO test `prefers-reduced-motion: reduce` baseline (per kalori discipline — see lessons-relevant line 48).

### 6. `tests/e2e/nav-responsive.spec.ts` (modify)

- The existing block at line 180 currently iterates both food + water FAB testids for "is visible at mobile breakpoints" — keep that.
- Add a new test under the mobile describe: tap `log-fab-water` on `/library` (not `/dashboard`) and assert:
  - The user is STILL on `/library` (no navigation occurred).
  - A `data-testid="undo-toast"` appears with "250 ml logged".
- This test specifically catches the regression-from-Path-A: prior behavior would have navigated to `/dashboard`, leaving the user on a different route. The new behavior must work in-place.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (modify)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (modify, +2 keys)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx` (modify, +5 it() blocks)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\i18n-shape.test.ts` (modify if it asserts fab namespace shape — verify in impl)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\water-fab-toast.spec.ts` (NEW)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\nav-responsive.spec.ts` (modify, +1 test)

**Optional dependency:** `app/(app)/layout.tsx` (modify to drill `loggedOn` to `NavShell`) — see Open Question §2.

**File count:** 6 (5 prod/test modifications + 1 new test). Within the ≤5 budget if `i18n-shape.test.ts` and `(app)/layout.tsx` are not touched (depends on Open Question resolution). If both touched, it lands at 7 — surfacing for user awareness per the stop-the-world directive.

## TDD Required

yes — the change touches:
- A new tap handler with async POST behavior (logic-touching)
- A new toast entry pushed into a state store (logic-touching)
- A new i18n key with substitution semantics (logic-touching via `replace`)
- A re-entrancy gate (`inFlightRef`)

Per `~/.claude/rules/testing.md`: "Write a failing test BEFORE writing any production code." Tests will be RED-first per lessons-relevant line 25 ("characterization, not absence"): assert the SPECIFIC failure mode the current code exhibits — `expect(authPost).not.toHaveBeenCalled()` (current behavior — onClick navigates instead of POSTs) and the toast assertion fails because `useUndoQueueStore.stack` stays empty. After implementation, those assertions flip to the inverse.

## Test Approach

**Unit (Vitest, jsdom):**

1. `tests/components/nav/nav-shell.test.tsx`:
   - Mock `@/lib/auth/refresh-interceptor` (`authPost`) with a resolved promise.
   - Mock `usePathname` from `next/navigation` to return `'/dashboard'` for default render and `'/library'` for the route-preservation test.
   - Mock `crypto.randomUUID` deterministically for assertion.
   - Mock `Date` or pass loggedOn prop to assert a stable `logged_on` value.
   - **Test 1:** click water FAB → `authPost` called once with full payload contract `{ client_id: <stable>, unit: 'glass', count: 1, logged_on: '2026-05-08' }`.
   - **Test 2:** click water FAB → after `authPost` resolves, `useUndoQueueStore.getState().stack.length === 1` and `stack[0].description === '250 ml logged'` and `stack[0].kind === 'delete-failed'`.
   - **Test 3:** click water FAB with `authPost.mockRejectedValueOnce(new Error('5xx'))` → toast appears with `t.dashboard.water.errorToast`, `authPost` was attempted exactly once.
   - **Test 4:** rapid double-tap (`fireEvent.click(); fireEvent.click();`) before any await resolves → `authPost` called exactly ONCE (ref-latch).
   - **Test 5 (RED-first characterization):** PRE-implementation, assert that current code calls `router.push('/dashboard')` and does NOT call `authPost`. Flips to the inverse assertion at GREEN.

2. `tests/components/nav/log-fab.test.tsx`: NO changes needed — the LogFAB component itself is untouched; only its consumer (NavShell) changes.

**Integration:**

3. `tests/integration/water-log-from-fab.test.ts` (NEW): mount the real `NavShell` with a real `useUndoQueueStore` (no mock), spy on the store via subscription, fire the click, assert end-to-end that the toast entry lands and exits after 5s.

**E2E (Playwright):**

4. `tests/visual/water-fab-toast.spec.ts` (NEW):
   - Mobile 375×667 viewport.
   - Authed page → `/dashboard`.
   - `page.waitForResponse(r => r.url().includes('/api/water/log') && r.request().method() === 'POST' && r.status() === 200)` registered BEFORE the click (per lessons-relevant line 24 — never `waitForTimeout` for cross-region POSTs).
   - `await page.click('[data-testid="log-fab-water"]')`.
   - Assert undo-toast visible + text === '250 ml logged'.
   - Assert undo-action button is NOT in DOM.
   - Wait 5500ms, assert toast removed.
   - Repeat with `page.emulateMedia({ reducedMotion: 'reduce' })` and assert the same end-state (toast appears, disappears) but motion is suppressed (verified by absence of CSS-animation transitions on bullets — or by absence of motion via JS `getComputedStyle`).

5. `tests/e2e/nav-responsive.spec.ts`:
   - New test: mobile viewport, navigate to `/library`, tap water FAB, register `waitForResponse` for `/api/water/log`, assert `expect(page.url()).toContain('/library')` AFTER the toast appears (route preserved). Catches the regression-from-Path-A.

**Mobile-specific (touch-path):**

6. The Playwright tests run on `chromium-mobile` project (375×667) which uses real touch events; the visual spec file should explicitly use `page.tap('[data-testid="log-fab-water"]')` (touch event, not mouse click) for at least one assertion — exercises the touch handler path explicitly. **Note:** the `<button>` element handles `click` via touch automatically (HTML spec — synthetic click after tap), so `onClick` works for both. No `onTouchEnd` needed.

**Behavior-not-presence (per lessons line 22):**

Every test above goes beyond `getByTestId(...).toBeInTheDocument()` — every assertion includes a follow-up: a network call shape, a store-state value, a DOM-state-after-time, or a route-state-after-action.

## Risk Assessment

medium

Reasoning:
- **Cross-cutting risk:** The `LogFAB` component is shared between food and water variants. The food FAB's onClick (`() => useLogFlowStore.getState().openModal('type')`) is UNTOUCHED. The variant prop discriminates cleanly at the `LogFAB` boundary; nav-shell.tsx is the only consumer that supplies handlers per variant. Risk is contained.
- **API contract risk:** Zero. The `/api/water/log` endpoint accepts `{ unit: 'glass', count: 1 }` verbatim today — no backend changes.
- **State store risk:** `useUndoQueueStore.pushToast` already accepts `kind: 'delete-failed'` with no-op commit/revert — `WaterTracker.tsx:102-109` is the canonical precedent.
- **Toast UX divergence:** the toast TTL is 5s (canonical, hard-coded as `TOAST_TTL_MS` in `useUndoQueueStore.ts:152`). User asked for "1 or 2 seconds" — see Open Question §1.
- **Auth/refresh interaction:** `authPost` already routes through the F12 R1 mitigation (`refresh-interceptor.ts`) — no local refresh shim, no R1 violation per `CLAUDE.md` "Residual risks to enforce."
- **Idempotency:** `client_id` is freshly minted per tap; the API's I11 idempotency layer dedupes on race re-tries. Safe.
- **Mobile-specific:** the `<button onClick>` pattern works on iOS Safari + Android Chrome via the synthetic-click-after-tap browser behavior. No `onTouchStart` / `onTouchEnd` needed.
- **The `inFlightRef` guard:** small surface (a single ref + check); a bug here causes either no clicks to register OR double-fires. Unit Test #4 catches this directly.

## Regression Sweep Needed

- `nav-shell` (food FAB still opens log modal — assert in unit test that food FAB onClick path is unchanged)
- `dashboard` (WaterTracker chip still works — its own POST path is untouched, but verify by running the existing dashboard E2E spec)
- `food FAB sibling` (no contract change to LogFAB; visual layout of the dual-FAB at z-index 41 unchanged)
- `water-log API` (no change; existing integration tests still pass)
- `useUndoQueueStore` (no contract change; new toast type matches existing pattern)
- `i18n-shape` (new keys must be added consistently if a shape-test enforces it)

Run on completion: `pnpm test tests/components/nav/ tests/integration/water-log* tests/unit/i18n-shape*` plus the visual + e2e specs above.

## UI Touching

true

`components/nav/log-fab.tsx` (water variant — handler change in consumer, but the FAB component itself is structurally identical) plus a new toast surface that pipes through the existing `<UndoToastMount>` chrome — visually identical to existing food-save / library-delete toasts that users already see. No new visual primitive; reuses canonical chrome.

## Library / Pattern Prescriptions Used

- **Toast pattern (decided):** `useUndoQueueStore.pushToast` with `kind: 'delete-failed'` — the canonical "no UNDO button rendered" path per `components/toast/UndoToast.tsx:65` + `lib/stores/useUndoQueueStore.ts:34-38`. This is the established kalori pattern; lessons-relevant line 58 confirms it: "Single-item soft-delete reuses the bulk substrate — `useUndoQueueStore.pushToast` + `<UndoToast>`." Same chrome-mount, same a11y contract (role=status, aria-live=polite), same reduced-motion fallback (already shipped in `globals.css`).
- **POST contract:** `authPost('/api/water/log', { client_id, unit: 'glass', count: 1, logged_on })` — verbatim mirror of `WaterTracker.tsx:86-91`. Reuses the F12 R1 refresh-interceptor mandate (CLAUDE.md residual risk R1 — "Phase 3/4 mutation tasks are FORBIDDEN from implementing local refresh shims — wait for Task 2.1's `lib/auth/refresh-interceptor.ts`"). `authPost` is already the canonical client.
- **Re-entrancy guard:** `useRef<boolean>` synchronous latch checked AND set BEFORE entering async — per lessons-relevant line 14 "`useRef<boolean>` latch checked AND set BEFORE entering any transition (`if (inFlightRef.current) return; inFlightRef.current = true;`)". React state is for renders, refs are for synchronous gates.
- **TZ-day derivation:** use `userTzToday(profile.timezone)` from `lib/time/day.ts` — drilled via prop from `(app)/layout.tsx` (RSC). Avoids client-side `Intl.DateTimeFormat` divergence.
- **i18n:** new keys land in `lib/i18n/en.ts` `fab` namespace alongside existing `logFoodA11y` / `logWaterA11y` keys (lines 1240-1241).
- **A11y:** `announcePolite()` SR announcement parity with `WaterTracker`'s `liveAddedFormat` pattern (`announce.ts` already exists per `WaterTracker.tsx:23` import).
- **Reduced-motion:** the canonical `<UndoToast>` already honors `@media (prefers-reduced-motion: reduce)` per its docstring (`UndoToast.tsx:18-20`). No new motion to gate.

## Open Questions

1. **Toast TTL — 5s canonical vs user-stated "1-2s":** the canonical kalori toast TTL is 5s (`TOAST_TTL_MS` in `useUndoQueueStore.ts:152`). User asked for "for a short period, like one or two seconds." Two paths: (a) accept 5s TTL because changing it breaks every other toast in the app (food save, library delete, weight log) and the user said "like" rather than mandating; (b) carve a per-entry TTL override (`pushToast` accepts an optional `ttlMs` field, defaulting to 5000). Option (a) is the lighter choice and preserves consistency. Recommend (a) unless user explicitly insists on 1-2s — surface for user decision.
2. **`loggedOn` prop drilling vs client-side `Intl.DateTimeFormat`:** `WaterTracker` receives `loggedOn` from the dashboard RSC. NavShell currently lives in `(app)/layout.tsx` which doesn't fetch profile data. Two paths: (a) thread `loggedOn` from `(app)/layout.tsx` (which already hits Supabase for identity via `requireProfileOrRedirect`) — adds ~3 lines; (b) compute `loggedOn` client-side via `Intl.DateTimeFormat('en-CA', { timeZone: undefined, ... })` — the browser's resolved zone may diverge from `profile.timezone`, which is the canonical source. Option (a) is correct-by-construction. Recommend (a) — surface to confirm the 3-line layout edit is acceptable, otherwise (b) with a comment acknowledging the drift risk.
3. **Toast copy:** "250 ml logged" vs "Logged 250 ml of water" vs "+250 ml water" — user said "shows that the app register that we press the button and we drink 250ml of water." Recommend **"250 ml logged"** (terse, parallel to existing dashboard `liveAddedFormat`). Vietnamese-first: confirm `vi.ts` has the same key (or note as follow-up if vi.ts is shipped post-MVP).
4. **Haptic feedback:** the user did not request it. No-op recommendation; future polish if requested.

## Stop-the-world flags

**none.** The bug is a clean known-fix re-decision of Path A's nav-and-tap-again UX. The endpoint, store, toast, and i18n surfaces all exist; this proposal wires them together via a 6-file change. File count is at the ≤5-file budget (the `i18n-shape.test.ts` and `(app)/layout.tsx` touches depend on Open Questions §2 + §3 resolutions; if both required, count climbs to 7 — surfacing here for awareness).
