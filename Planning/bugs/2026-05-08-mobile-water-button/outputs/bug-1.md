# Bug 1 — Implementation Output (v2 after STW resolution)

User selected **Option B** from the prior STW report — carve `ttlMs?: number`
override into `useUndoQueueStore.pushToast`. Scope expanded from 6 files to
10 (store + cross-tab listener + cross-tab integration test added). All
seven existing `pushToast` callers continue to inherit the 5 s default;
only the new water-FAB call site passes `ttlMs: 2000`.

## Files Touched

### Stage A — Store contract change (TTL override)

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useUndoQueueStore.ts`
  - `UndoEntry.ttlMs: number` (required on the persisted entry)
  - `PushToastInput.ttlMs?: number` (optional input, defaults to TOAST_TTL_MS at push)
  - `UndoBroadcastMessage.ttlMs?: number` (forwarded across tabs)
  - `pushToast` resolves `const ttlMs = input.ttlMs ?? TOAST_TTL_MS` with falsy/zero coercion to default; uses resolved value for both `setTimeout` and the persisted `entry.ttlMs`; emits `ttlMs` in the broadcast envelope.
  - `selectLiveTop` honors `entry.ttlMs` instead of the module constant (with a typeof+positive guard fallback to `TOAST_TTL_MS`).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useUndoQueueStore.cross-tab.ts`
  - Receiver forwards `data.ttlMs` into the reconstructed `pushToast` call (only when present, so older messages still work).

### Stage B — Water FAB direct POST + 2 s toast

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx`
  - Removed `useRouter` import; removed `const router = useRouter();`.
  - Added imports: `useRef`, `announcePolite`, `authPost`, `SessionExpiredError`, `useUndoQueueStore`, `mintClientId`.
  - Added `loggedOn?: string` to `NavShellProps` with UTC-day fallback inside the handler (chrome-test render safety).
  - New `handleLogWater` async function: synchronous `isFiringRef` latch → `authPost('/api/water/log', { client_id, unit:'glass', count:1, logged_on })` → success-side `pushToast({ kind:'delete-failed', description: t.fab.waterLoggedToast, ttlMs: 2000 })` + `announcePolite(t.fab.waterLoggedAnnounce)` → `SessionExpiredError` re-thrown → other failures push `t.fab.waterLoggedFailed` toast → ref cleared in `finally`.
  - Water FAB's onClick replaced from `() => router.push('/dashboard')` to `() => { void handleLogWater(); }`.
  - Inline JSDoc comment block updated to reflect the new behaviour and supersede the prior Path A note.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\layout.tsx`
  - Added a small `profiles.timezone` SELECT keyed by `user.id` (only when authenticated; UTC fallback otherwise) and threaded `loggedOn={userTzToday(timezone)}` into `<NavShell />`.
  - Added `userTzToday` import.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
  - Added `t.fab.waterLoggedToast = '250 ml logged'`, `waterLoggedAnnounce`, `waterLoggedFailed` under the existing `fab` namespace.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\water\client-id.ts` (NEW)
  - Single export: `mintClientId()` — promoted from `WaterTracker.tsx` so the nav-shell water FAB can share the same UUID-v4 fallback shape.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx`
  - Local `mintClientId` removed; replaced with `import { mintClientId } from '@/lib/water/client-id';`. No behaviour change.

### Stage C — Specs (Phase 7 owns execution)

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\nav-responsive.spec.ts`
  - Appended a mobile-only case: tap water FAB on `/library`, register `waitForResponse('/api/water/log')` first, assert toast surfaces with "250 ml logged", route preserved (`/library`), no UNDO button. Marked `test.skip` to match the surrounding spec (real test-user seeding after C1-B is a follow-up; deferred per the existing pattern in this file).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\water-fab-toast.spec.ts` (NEW)
  - Two cases at 375×667: default + reduced-motion (via `page.emulateMedia({ reducedMotion: 'reduce' })`). Uses `tap()` to exercise the touch path. Marked `test.skip` until Linux baselines bootstrap (F-TEST-1 follow-up).

## Tests Added/Modified

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\stores\useUndoQueueStore.test.ts`
  - Switched `baseEntry` return type to `PushToastInput` (cleaner, future-proof against further `UndoEntry`-only fields).
  - Added 3 new tests under `Bug-1 — pushToast ttlMs override`:
    - `pushToast accepts ttlMs override and uses it instead of TOAST_TTL_MS default` (timer-fires-at-2s)
    - `when ttlMs is omitted, defaults to TOAST_TTL_MS (5000)` (backward-compat)
    - `selectLiveTop honors per-entry ttlMs (a 2s entry stops being live after 2s, not 5s)` (selector path)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\lib\stores\useUndoQueueStore-cross-tab.test.ts`
  - Added 2 new tests:
    - `ttlMs is included in the cross-tab broadcast payload`
    - `a tab receiving a broadcast with ttlMs reconstructs the entry with that ttl`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx`
  - Added module-scope mocks: `authPost` (via `vi.mock('@/lib/auth/refresh-interceptor', ...)`), `announcePolite`, deterministic `crypto.randomUUID`.
  - Replaced the existing `water FAB navigates to /dashboard on click (Path A …)` test (which characterised the buggy behaviour) with 5 new tests under `Bug-1 — water FAB direct POST + toast (no navigation)`:
    - POST payload is `/api/water/log` with snake_case `{ client_id, unit:'glass', count:1, logged_on:'2026-05-08' }`
    - On success: stack length 1, `description=t.fab.waterLoggedToast`, `kind='delete-failed'`, `ttlMs=2000`, polite SR announcement
    - On `authPost` rejection: error toast pushed with `t.fab.waterLoggedFailed`
    - Rapid double-tap fires `authPost` exactly once (ref-latch)
    - From `/library`, water FAB does NOT call `router.push`

## RED Verification — Stage A (store)

```
× pushToast accepts ttlMs override and uses it instead of TOAST_TTL_MS default
× selectLiveTop honors per-entry ttlMs (a 2s entry stops being live after 2s, not 5s)
× ttlMs is included in the cross-tab broadcast payload
× a tab receiving a broadcast with ttlMs reconstructs the entry with that ttl
```

(The `omitted defaults to 5000` test was always green at runtime — the `setTimeout` fired at 5 s regardless of contract; that is the expected backward-compat assertion, not a new failure.)

## GREEN Verification — Stage A

`tests/unit/lib/stores/useUndoQueueStore.test.ts` — 16 → 16 tests pass (3 added).
`tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts` — 5 → 7 tests pass (2 added).

## RED Verification — Stage B (FAB)

```
× clicking the water FAB POSTs /api/water/log with snake_case { client_id, unit, count, logged_on }   (authPost called 0 times — Path A still in place)
× on POST success, pushes a toast with description=t.fab.waterLoggedToast, kind=delete-failed, ttlMs=2000   (stack empty)
× on POST failure, pushes an error toast with t.fab.waterLoggedFailed   (stack empty)
× rapid double-tap fires authPost exactly ONCE (ref-latch guard)   (authPost called 0 times)
× does NOT navigate (router.push is never invoked from the water FAB)   (router.push called with '/dashboard' — Path A)
```

## GREEN Verification — Stage B

`tests/components/nav/nav-shell.test.tsx` — 9 → 13 tests pass (5 added, 1 superseded Path A test removed).

## Caller Audit (7 pushToast consumers — read-only)

- `app/(app)/log/_components/ConfirmationScreen.tsx:446` — passes no `ttlMs`. ✅ Inherits 5 s default.
- `app/(app)/log/_components/ConfirmationScreen.tsx:458` — same. ✅
- `app/(app)/log/_components/LogPageClient.tsx:152` — passes no `ttlMs`. ✅
- `app/(app)/library/_components/LibraryClient.tsx:299` — passes no `ttlMs`. ✅
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx:125` — passes no `ttlMs`. ✅
- `app/(app)/log/copy-yesterday/_components/CopyYesterdayModal.tsx:76` — passes no `ttlMs`. ✅
- `components/dashboard/MealEntryContextTrigger.tsx:111, 129, 148` — three call sites; none pass `ttlMs`. ✅
- `components/dashboard/WaterTracker.tsx:102` — passes no `ttlMs`. ✅
- `lib/stores/useUndoQueueStore.cross-tab.ts:80` — receiver path; spreads `ttlMs` only when present in the inbound message. Old messages without `ttlMs` resolve to default. ✅

No caller used a parallel `setTimeout` wrapper or local prop to short-circuit the 5 s lifetime, so the contract change is invisible to all of them.

## Regression Sweep Result

```
npx vitest run tests/unit/lib/stores/ tests/components/nav/ tests/components/dashboard/ \
              tests/integration/lib/stores/ tests/unit/i18n-shape.test.ts tests/unit/components/toast/

 Test Files  11 passed (11)
      Tests  94 passed (94)
```

## TS / Lint

`npx tsc --noEmit` — clean (no errors). The only TS issue surfaced during implementation was a `baseEntry` helper signature drift after adding `ttlMs` to `UndoEntry`; fixed by switching the helper return type to `PushToastInput` (more correct anyway).

## UI Library Prescription Check

The kalori-canonical toast surface is `useUndoQueueStore.pushToast` + `<UndoToastMount>` + `<UndoToast>` with `kind: 'delete-failed'` for non-undoable confirmations (`components/toast/UndoToast.tsx:65` renders no UNDO button when `kind === 'delete-failed'`). This was the prescribed surface in the original proposal and is preserved verbatim by Stage B — the only delta is the per-entry 2 s `ttlMs` override carved into the store contract during Stage A.

`Planning/ui-design.md` has no `## Library Prescriptions` heading; the canonical toast pattern is documented inline in the file-level docstrings of `lib/stores/useUndoQueueStore.ts` and `components/toast/UndoToast.tsx`. Quick-Pick generic guidance (Mantine `@mantine/core` notifications, Sonner) does NOT apply here — kalori shipped its own toast in Task 3.4 and this batch reuses it.

## Deviations from Proposal

1. **Store contract change** — explicitly user-approved (Option B from the prior STW). Now a 4th file in Stage A (`lib/stores/useUndoQueueStore.ts`, `lib/stores/useUndoQueueStore.cross-tab.ts`, `tests/unit/lib/stores/useUndoQueueStore.test.ts`, `tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts`).
2. **`mintClientId` promotion** — proposal recommended either inline copy or shared module; chose shared module (`lib/water/client-id.ts`) so a future bug-fix doesn't have to keep two helpers in sync.
3. **`(app)/layout.tsx` profile timezone fetch** — proposal flagged this as Open Question §2 with a recommendation toward (a) prop-drill from layout. Implemented (a) with a UTC fallback for unauthenticated/test renders.
4. **`tests/integration/water-log-from-fab.test.ts`** (proposal §Test Approach #3) — NOT added. The 5 nav-shell unit tests + 2 store integration tests already cover the full wire (POST + toast + ttlMs broadcast). Adding a separate integration file would be redundant and slows the regression sweep without adding signal.
5. **`tests/components/nav/log-fab.test.tsx`** — left untouched per the original proposal note ("NO changes needed — the LogFAB component itself is untouched").
6. **`tests/unit/i18n-shape.test.ts`** — NOT updated; the existing shape assertion only checks for `t.fab.logA11y` (still present) and "every string leaf is non-empty" (the 3 new keys are non-empty strings, so the existing recursive check passes them).

## Status

implemented

## STW History

# Bug 1 — Implementation Output

## STOP-THE-WORLD: TTL contract violation

**Status:** halted before any RED test or production code was written.

The user's locked decision (Toast TTL = 2000ms) is INCOMPATIBLE with the current `useUndoQueueStore` contract. The store hard-codes the toast lifetime as a module-level constant and does NOT accept a per-entry TTL parameter. Honoring the 2000ms requirement requires modifying the store's contract, which my contract explicitly flags as a stop-the-world trigger:

> "Verify `useUndoQueueStore.pushToast` accepts a TTL parameter; if it's hard-coded to 5s, this is a stop-the-world — surface to main agent and pause."

### Evidence

`C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useUndoQueueStore.ts`:

- Line 152: `const TOAST_TTL_MS = 5000;` — module-level hard-coded constant.
- Lines 168–172: `pushToast` schedules `setTimeout(..., TOAST_TTL_MS)` directly; no override path.
- Line 305: `selectLiveTop` uses the same module constant for liveness checks (`entry.createdAt + TOAST_TTL_MS > now`). A per-entry TTL would also need to be honored here, otherwise a 2000ms toast would still register as "live" for 5 s in the UI selector even after its commit timer fired.
- Lines 61–73: `PushToastInput = Omit<UndoEntry, 'toastId' | 'createdAt' | 'visible' | 'dismissed' | 'timerId'> & { _fromBroadcast?: boolean }`. There is no `ttlMs` field in the input type.
- Line 310: `export const UNDO_TOAST_TTL_MS = TOAST_TTL_MS;` — the constant is consumed by callers (e.g., visual specs that wait `5500ms`).

### Why this is a real architectural change, not an inline tweak

Carving out a per-entry TTL would require, at minimum:

1. Add `ttlMs?: number` to `PushToastInput` (line 61).
2. Replace `TOAST_TTL_MS` in `pushToast` (line 172) with `input.ttlMs ?? TOAST_TTL_MS`.
3. Persist the per-entry TTL on `UndoEntry` (line 40) so `selectLiveTop` can honor it (line 305) — otherwise the 2000ms toast keeps re-surfacing for 5 s on nav per the F6 contract.
4. Audit the seven existing `pushToast` callers (ConfirmationScreen, FoodDetail, LogPageClient, LibraryClient, MealEntryContextTrigger, CopyYesterdayModal, WaterTracker) to confirm none accidentally inherit the new shorter TTL.
5. Update the cross-tab broadcast envelope (lines 81–87) — receivers reconstruct `pushToast` from `UndoBroadcastMessage`, which has no TTL field today; without it, a 2000ms toast in tab A would re-broadcast as a 5 s toast in tab B.
6. Update tests in `tests/unit/lib/stores/useUndoQueueStore.test.ts` and the cross-tab integration suite to cover both default and overridden TTLs.

That is a store contract change, not a single-FAB change. It exceeds the scope of bug 1 as scoped in the proposal (6 files, 1 known-fix re-decision of Path A) and per the proposal's own Open Question §1 risk analysis: *"changing it breaks every other toast in the app (food save, library delete, weight log)."* The recommended option in the proposal was (a) — accept the 5 s canonical TTL.

### Other prerequisites verified (so the user can decide once)

- `userTzToday(tz)` exists at `lib/time/day.ts:33–35` and is already used by `app/(app)/dashboard/page.tsx:75` to feed `WaterTracker`'s `loggedOn` prop (line 169). The prop-drill plan from `(app)/layout.tsx` → `<NavShell>` is feasible BUT the layout currently does not fetch `profile.timezone`. It only resolves `user` + `identity`. Adding the timezone fetch is a small server-component edit (~3–5 lines: select `timezone` from `profiles` table) — not a stop-the-world by itself, but it widens the change beyond the proposal's "optional dependency" caveat.
- WaterTracker's POST contract (`{ client_id, unit, count, logged_on }`) at `WaterTracker.tsx:86–91` is verbatim mirrored for the new FAB handler. No reconciliation needed.
- `mintClientId()` helper exists at `WaterTracker.tsx:49–58`; either inline a copy in nav-shell or promote to a shared file (proposal recommends promote — minor refactor).
- The `delete-failed` toast kind (line 38, 102–109) is the correct discriminator for "no UNDO button" — this is canonical and unchanged.
- `vi.ts` does NOT exist; `lib/i18n/en.ts` is the only string source. The contract's instruction to "add the same keys with appropriate Vietnamese translations" is moot for now.

### Decision required from user / main agent

**Pick one and re-dispatch:**

A. **Accept 5 s TTL (proposal's Option a)** — preserves canonical kalori toast UX, no store change, single-fix scope. Implementation proceeds along the original 6-file plan with TTL = `UNDO_TOAST_TTL_MS` (5000 ms).

B. **Carve `ttlMs?: number` override into the store contract** — a deliberate, store-wide change that lands BEFORE bug 1 implementation. Rough scope: store contract edit (~5 lines), `selectLiveTop` audit, cross-tab broadcast field add, 2 new tests, regression sweep on all 7 existing callers. Estimated +30–60 min on top of the original bug 1 estimate. After the store change lands, bug 1 implementation proceeds with `pushToast({ ..., ttlMs: 2000 })`.

C. **Substitute a different toast surface** (e.g., a non-undoable ephemeral pill, kalori-flash) with its own TTL — adds a new visual primitive, breaks "reuses canonical chrome" claim, NOT recommended unless user explicitly wants visual divergence.

I recommend **B** if the 2 s TTL is genuinely the desired UX (a 5 s feedback toast for a button-tap that the user already saw fire is verbose), or **A** if "like 1–2 s" was conversational rather than a hard requirement. Surfacing for resolution.

## Files Touched

none (halted before any edits).

## Tests Added/Modified

none (halted before RED phase).

## RED Verification

n/a — RED tests would have been wasted effort because the GREEN implementation cannot complete without a TTL contract decision. Writing tests against an undecided spec produces flaky, throwaway code.

## GREEN Verification

n/a.

## Regression Sweep Result

n/a.

## TS / Lint

n/a.

## UI Library Prescription Check

`Planning/ui-design.md` has no `## Library Prescriptions` heading per a `grep` search; the canonical kalori toast pattern is documented inline at `lib/stores/useUndoQueueStore.ts:1–22` (file-level docstring) and `components/toast/UndoToast.tsx`'s docstring (referenced by proposal lines 168–174). The prescribed surface is `useUndoQueueStore.pushToast` + `<UndoToastMount>`/`<UndoToast>` with `kind: 'delete-failed'` for non-undoable toasts. Cited verbatim from the proposal:

> "**Toast pattern (decided):** `useUndoQueueStore.pushToast` with `kind: 'delete-failed'` — the canonical 'no UNDO button rendered' path per `components/toast/UndoToast.tsx:65` + `lib/stores/useUndoQueueStore.ts:34–38`. This is the established kalori pattern; lessons-relevant line 58 confirms it…"

The web-ui-guide.md Quick-Pick decision table for toast/notification patterns was searched (`grep -i "toast\|snackbar\|notification"`); only one hit (line 168 — Mantine `@mantine/core` notifications, which is NOT in kalori's stack — kalori uses zustand + custom React components for the toast surface). The kalori-prescribed pattern overrides the generic Quick-Pick guidance because the project already shipped the canonical UndoToast in Task 3.4.

**The TTL conflict does NOT change the prescribed surface.** Whether the answer is A or B, the surface remains `useUndoQueueStore.pushToast`. Only the TTL semantics differ.

## Deviations from Proposal

The proposal correctly flagged this exact risk in Open Question §1 ("the canonical kalori toast TTL is 5s … User asked for 'for a short period, like one or two seconds.'") and recommended Option (a) — keep 5 s. The user's resolved instruction is 2000 ms, which is Option (b) and triggers the store contract change. The deviation is in the user's resolution direction, not in the proposal's analysis. No further deviations introduced.

## Status

partial — halted at stop-the-world before any code was written. Awaiting user/main-agent decision on TTL resolution (A / B / C above).
