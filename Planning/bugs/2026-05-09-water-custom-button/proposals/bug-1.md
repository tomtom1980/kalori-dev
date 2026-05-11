# Bug 1: Daily water intake cap enforcement (0–5000ml) with toast feedback

## Classification
known_fix

## Root Cause
No daily-cap enforcement exists today on either the server route (`app/api/water/log/route.ts`) or the client surfaces (`components/dashboard/WaterTracker.tsx` glass/bottle/correct chips, `components/nav/nav-shell.tsx` mobile water FAB). The only constraint in place is the per-row Zod sanity cap `count: z.number().int().positive().max(200)` (line 39 of `route.ts`) — that bounds a SINGLE write but not the SUM-over-day. A user could tap the mobile FAB or dashboard chips indefinitely and accumulate well past any reasonable hydration ceiling, with no UI feedback. The route already computes the post-write `totalMl = SUM(mlFromWaterRow(...))` for `(user_id, date)` (`computeDayTotalMl`, lines 151–171); the cap fix piggy-backs on that aggregation read by computing the PRE-write total instead and rejecting if `pre + delta > 5000`.

## Current State (what exists)
- `app/api/water/log/route.ts` — `POST /api/water/log`. Idempotent insert keyed on `(user_id, client_id)`. Returns `{ row, totalMl, replayed? }`. Server-authoritative `totalMl` already implemented (R3-C2-prime, 2026-05-09-water-fab-ux). NO cap check.
- `components/dashboard/WaterTracker.tsx` — dashboard chip surface. Three chips: GLASS (250ml), BOTTLE (500ml), CORRECT (stub no-op). Optimistic `useOptimistic` + server-authoritative commit on response. NO cap check; `addWater` always issues the POST.
- `components/nav/nav-shell.tsx` `handleLogWater` — mobile water FAB. Fires-and-forgets `authPost('/api/water/log', { unit:'glass', count:1 })` after pushing optimistic toast. NO cap check; toast pushes synchronously regardless of current daily total.
- `lib/dashboard/types.ts` — `ML_PER_UNIT = { glass: 250, bottle: 500, ml: 1 }`, `mlFromWaterRow(...)`. The natural home for a `MAX_DAILY_WATER_ML = 5000` constant.
- `lib/water/client-id.ts` — only existing `lib/water/*` module (no `constants.ts` yet). New constant lives in `lib/dashboard/types.ts` next to `ML_PER_UNIT` to keep the same source-of-truth file.
- `lib/i18n/en.ts` — water + fab strings exist in `t.dashboard.water.*` and `t.fab.*`. Cap-reached messages need to be added (`t.dashboard.water.capReachedToast`, `t.fab.capReached`, polite SR variants).
- `lib/stores/useUndoQueueStore.ts` — `pushToast` is the canonical toast surface; `kind: 'delete-failed'` renders without an UNDO button (right shape for an info/warning toast). `ttlMs: 2000` matches the existing FAB toast cadence.
- Daily-window semantics — `userTzToday(timezone)` (`lib/time/day.ts:33`) defines "today" as the user-TZ calendar day. Same semantics already used by both write paths. No ambiguity to resolve — the cap is per user-TZ calendar day, the same window the route already aggregates on.

## Proposed Change (Diff Outline — NOT actual code)
- **file: `lib/dashboard/types.ts`** — export new constant `MAX_DAILY_WATER_ML = 5000` next to `ML_PER_UNIT`. Single source of truth used by route + both client surfaces.
- **file: `app/api/water/log/route.ts`** —
  - Add a pre-insert PRE-write SUM read (factor a small helper or call `computeDayTotalMl` BEFORE the insert path; rename existing helper to `computeDayTotalMl` reused for both pre- and post-write).
  - Compute `incomingMl = body.count * ML_PER_UNIT[body.unit]`.
  - If `(currentTotalMl + incomingMl) > MAX_DAILY_WATER_ML`, return `409 Conflict` with `{ error: 'OVER_DAILY_LIMIT', code: 'OVER_DAILY_LIMIT', currentTotalMl, limitMl: 5000 }` BEFORE inserting. Idempotent replay must STILL succeed (the row was already persisted under the cap-allowed window — a replay is a duplicate, not a new write that exceeds the cap).
  - Add `min: 1` floor on `count` (already enforced by `.positive()`) — no change needed; document negative-amount discussion in Bug #2 coordination section.
- **file: `components/dashboard/WaterTracker.tsx`** —
  - Pre-emptive client guard inside `addWater`: read `committedConsumedMl` (current truth from latest server-authoritative response or initial), compute `(committed + ml) > 5000`. If true, push a `capReachedToast` via `useUndoQueueStore.getState().pushToast(...)` with `kind: 'delete-failed'` + `ttlMs: 2000`, announce polite SR message, return early — no POST issued. Use a `useRef<number>(0)` to dedupe consecutive cap toasts within a 1.5s window (prevents 10 toasts on button-mash).
  - On server response handling: if response shape has `error: 'OVER_DAILY_LIMIT'` (status 409), retract the optimistic delta (bump `resetKey` so reducer drops it), set `committedConsumedMl(response.currentTotalMl)`, push the `capReachedToast`, return — no error toast. This keeps server authoritative for the rare race where two tabs both pass the client guard.
- **file: `components/nav/nav-shell.tsx`** `handleLogWater` —
  - Pre-emptive client guard: needs access to current daily total. Today the FAB has NO knowledge of `consumedMl` — it's persistent chrome that never reads daily state. Two options:
    - **(a) Drill it via prop.** `(app)/layout.tsx` already runs server-side and could fetch `consumedMl`; threading it down to `<NavShell>` adds a prop and a re-render coupling. Stale on long-lived sessions (chip writes don't refresh chrome).
    - **(b) Skip pre-emptive client guard on the FAB; rely solely on server-side enforcement + 409 handling.** When the POST returns 409 OVER_DAILY_LIMIT, retract the optimistic toast (`dismiss(clientId)`) and replace with `capReachedToast`. SR announces the cap message instead of "logged."
  - **Recommendation: option (b)** — the FAB is decoupled chrome; drilling daily total into `NavShell` adds coupling that the next phase will have to undo. Server enforcement is the source of truth; one extra round-trip on cap-reached is acceptable. Optimistic toast retraction is the same pattern as the existing SessionExpired error branch (already implemented at lines 232–263). The 200ms latency before retraction is fine — the cap-reached case is rare and mid-tap user expectation is "tap → toast", and the toast still appears, just with cap-reached copy.
  - Add toast dedupe ref so a button-mash at the cap doesn't push 10 retraction toasts.
- **file: `lib/i18n/en.ts`** —
  - Under `dashboard.water.*`: add `capReachedToast: 'Daily water limit reached (5 L)'`, `capReachedAnnounce: 'Daily water limit of 5 litres reached. Cannot add more today.'`.
  - Under `fab.*`: add `waterCapReached: 'Daily water limit reached (5 L)'` and `waterCapReachedAnnounce` string. Reuse where reasonable; separate keys so future copy can diverge.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\types.ts` — add `MAX_DAILY_WATER_ML` constant
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\water\log\route.ts` — server cap enforcement (pre-write SUM + 409 response shape)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` — client guard + 409 handling on chips
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` — 409 handling on FAB (optimistic toast retraction + cap toast)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` — cap-reached strings

5 files. Within the bugfix-tomi 5-file budget.

## TDD Required
yes — the cap is logic-shifting on a write path, on a chip surface, and on the FAB surface. All three routes need failing-first tests: (1) route-level unit test that asserts 409 + OVER_DAILY_LIMIT when SUM+delta > 5000, (2) chip-level test that asserts pre-emptive guard short-circuits + dedupes toasts, (3) FAB-level test that asserts 409 retracts optimistic toast and pushes cap toast.

## Test Approach
- **Unit (route)** — extend `tests/unit/api/water-log.test.ts` (existing test file) with: 
  - "rejects with 409 OVER_DAILY_LIMIT when current total + incoming would exceed 5000ml" (mocks `totalsRows` to return e.g. `[{count:9, unit:'bottle'}]` = 4500ml + incoming bottle 500ml + bottle 500ml → 5500ml total → 409).
  - "allows write that lands exactly at 5000ml" (boundary case — `≤` semantics).
  - "rejects when current is already at cap and incoming is 250ml glass" (no-op tap at cap).
  - "idempotent replay returns 200 even if current total is at cap" (existing row + replay path; cap doesn't apply to replay because no NEW ml is added).
- **Unit (chip)** — extend `tests/unit/components/dashboard/WaterTracker.test.tsx` with: 
  - "GLASS chip at 4750ml issues POST that succeeds (boundary OK)".
  - "GLASS chip at 5000ml does NOT issue POST and shows cap toast".
  - "BOTTLE chip at 4600ml does NOT issue POST and shows cap toast".
  - "Mashing GLASS at 5000ml shows ONE toast within 1.5s window (dedupe)".
  - "Server returns 409 → optimistic delta retracted, committedConsumedMl set to server total, cap toast shown".
- **Integration / E2E** — visual baseline regression on dashboard chip surface (one screenshot at 5000ml showing the cap toast). Skip Playwright E2E for the FAB cap path — covered by unit + integration; the latency-sensitive iad1↔SG path is already exercised in `tests/visual/water-fab-toast.spec.ts`.

## Risk Assessment
medium — touches the canonical water write path (server route + both client surfaces). Lessons-relevant emphasizes server-authoritative response shape and the `useOptimistic` reducer's resetKey discriminator for replay coordination; the 409 retraction must NOT reintroduce the symmetric undercount/double-count failure modes (lessons line 8). Mitigation: have the 409 response include `currentTotalMl` so the chip's commit becomes "trust the server" identical to the success path — no client-side prediction reconciliation needed; setResetKey bump discards the in-flight optimistic delta.

## Regression Sweep Needed
- Existing chip/FAB happy-path tests — must still pass when the cap is far away (3500ml + 250ml = 3750ml).
- Idempotent replay tests in `tests/unit/api/water-log.test.ts` — `replayed: true` path must NOT invoke the cap check (replay = same row, same ml, already counted).
- 23505 race re-SELECT path — same as replay; cap doesn't re-evaluate.
- Cross-tab broadcast — the canonical undo-queue cross-tab bridge replays toasts. The cap toast is `kind: 'delete-failed'` so it inherits non-undoable rendering; sibling tabs receive the same TTL=2000ms message. Already covered by `useCrossTabUndoQueue` integration; verify no regression by running the cross-tab test suite once.
- `userTzToday` long-session sessions — cap is per user-TZ day; a session crossing local midnight should let the user write 250ml again because `today` rolls over → the cap re-evaluates against a fresh empty SUM. Already covered by C2 lesson (line 9 of lessons-relevant).
- Existing UndoToast TTL behavior — no change.

## UI Touching
true — toast surface (cap-reached message), polite SR announcement. Affected components: `WaterTracker.tsx` chips (toast + announce), `nav-shell.tsx` FAB (toast + announce). New i18n strings. NO new visual primitives, NO design-doc edits — the toast surface and SR-announce surface already exist and are reused as-is. Per project-context, this stays inside the canonical `useUndoQueueStore` + `announcePolite` chrome; no new toast lib introduced.

## Open Questions
1. **Toast dedupe window** — proposed 1.5s. Should it be 2.0s (matching the toast TTL) so back-to-back taps after a toast just expired don't show TWO consecutive cap toasts? Recommend 1.5s default; surface to user gate for confirmation.
2. **Cap-reached copy wording** — proposed `'Daily water limit reached (5 L)'`. User originally wrote "daily limit reached." User confirmation on the L vs ml unit (the chip displays both, but the toast is dense; "5 L" is shorter and consistent with `t.dashboard.water.goalFormat` which uses `L`).
3. **Should CORRECT chip (currently a stub) be cap-aware?** The CORRECT chip is described in WaterTracker.tsx line 388 as a "3.5 scope: CORRECT wiring is a stub. Announce and no-op state." It does not POST. No cap concern. Once it's wired (out of this batch's scope), it will REMOVE ml — which is below-cap by definition; cap doesn't apply to deletions.

## Coordination With Bug #2
Bug #2 introduces a custom-amount input (desktop popover + mobile wheel sheet) that lets the user enter a free-form ml amount. Bug #2 must:
1. **Pre-emptively cap the wheel/input client-side range to `0` and `MAX_DAILY_WATER_ML - currentConsumedMl`** so the picker UI cannot let the user select an amount that would exceed the cap. This is a client-side UX optimization — the server still enforces (defense in depth + multi-tab race guard).
2. **Use `MAX_DAILY_WATER_ML` from `lib/dashboard/types.ts`** — single source of truth, no duplicate constant.
3. **The `count: z.number().int().positive()` floor on the API** already prevents zero/negative values from being persisted; Bug #2's input should clamp `min: 1` (no zero-ml entry); if the cap leaves zero remaining headroom (`5000 - 5000 = 0`), the custom button should be disabled/show cap toast on tap rather than open the input. Bug #1's pre-emptive client guard (in `addWater`) handles the chip case the same way; Bug #2 handles the custom-button case symmetrically.
4. The 409 OVER_DAILY_LIMIT response shape from the server (this proposal) is the canonical handling Bug #2 inherits — its custom-amount POST goes through the same route, gets the same 409, and shows the same cap toast.
