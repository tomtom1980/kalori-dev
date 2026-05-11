# Bug 1 — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\types.ts` (constant added)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\water\log\route.ts` (server cap enforcement)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` (chip pre-emptive guard + 409 handling, switched to `authFetch`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx` (FAB 409 handling, switched to `authFetch`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (cap-reached strings on chip + FAB)

5 production files. Within budget.

Test files modified (test scope):

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\water-log.test.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WaterTracker.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\nav-shell.test.tsx`

## Tests Added/Modified

### `tests/unit/api/water-log.test.ts` — added describe block "Bug-1 — daily water cap (5000 ml) server enforcement"

- "rejects with 409 OVER_DAILY_LIMIT when current total + incoming exceeds 5000 ml" — pre-write 4750 + 500 bottle → 409 with `{error:'OVER_DAILY_LIMIT', currentTotalMl:4750, limitMl:5000}`.
- "boundary: current=4750 + 250 glass exactly hits 5000 → 200 with totalMl=5000" — boundary write allowed.
- "at-cap: current=5000 + incoming glass → 409, total unchanged at 5000" — at-cap rejection, `calls.inserted === null`.
- "at-cap: incoming bottle (500) → 409, totalMl unchanged at 5000" — same for bottle.
- "idempotent replay returns 200 even at cap (no NEW ml added)" — replay short-circuits before cap check.
- "23505 race resolution path is reached AFTER cap check (cap evaluated against pre-our-row totals)" — race path remains 200 + replayed.
- "far-from-cap happy path: pre=3500 + glass(250) → 200 totalMl=3750 (regression guard)" — happy-path regression guard.
- "cap-reject response body shape matches contract { error, currentTotalMl, limitMl }" — strict response-shape verification at currentTotalMl=4800.
- Added `preWriteTotalsRows` to mock options to support distinct pre-/post-write totals.

### `tests/unit/components/dashboard/WaterTracker.test.tsx` — added describe block "Bug-1 — daily water cap (5000 ml) chip behavior"

- "GLASS chip at consumed=4750 issues POST that succeeds (boundary OK — 5000 is allowed)" — boundary write proceeds.
- "GLASS chip at consumed=5000 does NOT issue POST and shows cap-reached toast (pre-emptive guard)" — pre-emptive guard.
- "BOTTLE chip at consumed=4600 does NOT issue POST and shows cap toast (4600+500=5100 > 5000)" — pre-emptive guard.
- "toast dedupe: rapid double-tap at cap shows ONLY ONE cap toast within 1.5 s window" — dedupe verified across 3 taps.
- "on server 409 OVER_DAILY_LIMIT, chip retracts optimistic delta + commits server total + shows cap toast" — 409 server path.
- Switched the `authPost` mock to a thin `authFetch` wrapper so the chip's new `authFetch`-based call path works; existing test bodies untouched.

### `tests/components/nav/nav-shell.test.tsx` — added describe block "Bug-1 — daily water cap (5000 ml) FAB behavior (server-driven)"

- "on 409 OVER_DAILY_LIMIT, dismisses optimistic success toast and pushes cap toast" — server-driven retraction.
- "on 409 OVER_DAILY_LIMIT, does NOT call router.refresh() (no fresh server state to fetch — write rejected)" — refresh suppressed on 409.
- "rapid double-tap at cap (both 409): only ONE cap toast remains (dedupe within 1.5 s)" — dedupe + ref-latch combined.
- Switched the `authPost` mock to a thin `authFetch` wrapper so the FAB's new `authFetch`-based call path works.

## Test Run Results

- API route tests: **22 passed / 22 total** (`tests/unit/api/water-log.test.ts`)
- WaterTracker tests: **17 passed / 17 total** (`tests/unit/components/dashboard/WaterTracker.test.tsx`)
- nav-shell tests: **24 passed / 24 total** (`tests/components/nav/nav-shell.test.tsx`)
- Combined run: **63 passed / 63 total**
- Library-merge regression suite: **7 passed / 7** (regression sanity check)
- TypeScript typecheck: **clean** (`tsc --noEmit`)
- ESLint on all 5 production files + 3 test files: **clean**

Run commands:

```
npx vitest run tests/unit/api/water-log.test.ts
npx vitest run tests/unit/components/dashboard/WaterTracker.test.tsx
npx vitest run tests/components/nav/nav-shell.test.tsx
npx vitest run tests/unit/api/water-log.test.ts tests/unit/components/dashboard/WaterTracker.test.tsx tests/components/nav/nav-shell.test.tsx
npx tsc --noEmit
npx eslint <files>
```

## Cap Constant Path

`C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\types.ts`

Export name: `MAX_DAILY_WATER_ML` (value: `5000`)

Bug #2 imports as: `import { MAX_DAILY_WATER_ML } from '@/lib/dashboard/types';`

## Server Response Contract (for Bug #2)

**Endpoint:** `POST /api/water/log`

**Request body (Zod-strict):**

```json
{
  "client_id": "<UUID>",
  "unit": "glass" | "bottle" | "ml",
  "count": 1,                      // positive int, max 200 per row
  "logged_on": "YYYY-MM-DD"
}
```

**Success (200):**

```json
{
  "row": { "...": "..." },
  "totalMl": <number | null>,      // server-authoritative SUM(ml) post-write; null on agg read failure
  "replayed"?: true                // present iff I11 idempotency / 23505 race short-circuit fired
}
```

**Cap-reject (409 OVER_DAILY_LIMIT):**

```json
{
  "error": "OVER_DAILY_LIMIT",
  "currentTotalMl": <number>,      // unchanged pre-write SUM (no ml added)
  "limitMl": 5000
}
```

**Validation reject (400 ValidationError):** existing behaviour, structurally rejects negative or zero `count`. Body shape `{ error: 'ValidationError', issues: [...] }`.

**Auth reject (401):** existing behaviour — `requireProfileOrJson401` returns 401 if no auth.

**Account-deletion fence (423 / 503):** existing behaviour — `rejectIfDeletingOrUnavailable`.

**Server error (500):** existing behaviour — `{ error: 'db_error' }` on insert failure that isn't a 23505 race.

## Negative Delta Behavior

**Negative deltas are rejected at the Zod schema level with HTTP 400 ValidationError** (existing `count: z.number().int().positive().max(200)`). Per-row writes can ONLY add `count * ML_PER_UNIT[unit]` ml — there is no decrement path on this route.

For Bug #2's SET semantics where `entered < current` (i.e., user wants to LOWER the daily total), the route rejects with 400. **Bug #2 must NOT POST a negative delta to this route.** Two options for Bug #2:

1. **Cap the input field client-side** so the user cannot type a value below `current` (or below 0). Combined with `max = MAX_DAILY_WATER_ML - currentConsumedMl`, the input becomes a "remaining headroom" picker; SET semantics where `entered < current` is impossible by construction.
2. **Coordinate a separate decrement endpoint** (e.g., POST to a delete/correct route, or augment this route with a `min: 0` `int` schema and explicit decrement semantics). Out of scope for this batch.

Recommendation for Bug #2: **Option 1** — clamp the input range to `[0, MAX_DAILY_WATER_ML - currentConsumedMl]`. The "CORRECT" chip (out of scope) is the proper place to land decrement UX in a future batch.

## Toast Dedupe Implementation

**New per-component pattern added** — no existing dedupe pattern was reusable. `useUndoQueueStore.pushToast` does not dedupe by id/key; introducing a dedupe queue at the store level would have been >5 lines and out-of-scope.

Implementation: `useRef<number>(0)` in each consumer (chip + FAB) records the last cap-toast timestamp. The toast push is gated by `Date.now() - capToastLastShownRef.current < 1500`. Synchronous read at click time — `useState` would not commit before the next mash hits the handler.

## i18n Keys Added

**File:** `lib/i18n/en.ts`

Under `t.dashboard.water.*`:

- `capReachedToast: 'Daily water limit reached (5 L)'`
- `capReachedAnnounce: 'Daily water limit of 5 litres reached. Cannot add more today.'`

Under `t.fab.*`:

- `waterCapReached: 'Daily water limit reached (5 L)'`
- `waterCapReachedAnnounce: 'Daily water limit of 5 litres reached. Cannot add more today.'`

Bug #2 should reuse `t.dashboard.water.capReachedToast` + `t.dashboard.water.capReachedAnnounce` for consistency with the chip surface (the custom button lives in the dashboard chip row).

## Deviations from Proposal

1. **Switched chip + FAB from `authPost` to `authFetch`.** The proposal called for "if response shape has `error: 'OVER_DAILY_LIMIT'` (status 409), retract the optimistic delta..." — but `authPost` throws a generic `Error('authPost ... failed: <status>')` on non-2xx and does NOT expose the status code or body. The R1 firewall forbids editing `lib/auth/refresh-interceptor.ts` to enrich the error. The cleanest existing pattern for status-code-sensitive consumers is `authFetch` (already used by `ConfirmationScreen.tsx` for the same reason). This is an in-scope refinement of the proposal's diff outline (still inside the 5 affected files), not a scope expansion.

2. **Cap toast `kind` is `'delete-failed'` (matches existing FAB error toast).** The proposal cited `kind: 'delete-failed'` — implementation matches.

3. **Toast dedupe is per-consumer (chip + FAB hold separate refs) rather than a shared store-level dedupe.** Avoids touching `useUndoQueueStore` (out of scope, >5 LoC). Matches the "5 lines max" constraint in the stop-the-world triggers.

4. **The 23505-race-at-cap test was reframed.** Original test premise was "23505 race at cap returns 200." On reflection, the 23505 path only fires when the SAME `(user_id, client_id)` was concurrently inserted; if our pre-insert SELECT missed the duplicate, our cap check ran against pre-our-row totals (which by definition pass since the concurrent request also passed). Test reframed to verify exactly this invariant: 23505 reaches 200 because the cap check succeeded against the pre-our-row total.

5. **No `preWriteTotalsRows` was in the original mock options;** added to `BuildOptions` to support cap-check vs response-totalMl distinction in tests. Internal-only test scaffolding.

## Cross-Bug Notes for Bug #2

- **Endpoint:** `POST /api/water/log` (existing; Bug #2 does NOT introduce a new route).
- **Request body shape:** Bug #2's custom amount input must POST `{ client_id: <UUID>, unit: 'ml', count: <positive int 1..200>, logged_on: <YYYY-MM-DD> }`. For amounts > 200 ml (e.g., 350 ml from a custom amount), Bug #2 needs to either (a) clamp at 200 ml per row and split into multiple writes, or (b) raise the per-row cap. **Recommendation: raise the per-row Zod cap to 5000** (matches `MAX_DAILY_WATER_ML`) — single POST per custom amount is cleaner UX. **Surface as proposal-time decision for Bug #2.**
- **Constant import:** `import { MAX_DAILY_WATER_ML } from '@/lib/dashboard/types';` — cap input range to `[1, MAX_DAILY_WATER_ML - currentConsumedMl]` for client-side UX hinting.
- **Server enforcement is automatic:** the route's pre-write cap check applies to ALL POSTs (chip, FAB, custom). Bug #2 inherits 409 OVER_DAILY_LIMIT handling for free; reuse the same pattern.
- **Toast id/key for cap-reached:** Bug #2 should reuse `t.dashboard.water.capReachedToast` + `t.dashboard.water.capReachedAnnounce`.
- **Toast dedupe:** Bug #2 should add its own `useRef<number>(0)` dedupe gate following the chip pattern (1500 ms window) so a custom-amount cap-reject doesn't compete with a chip cap-reject.
- **Negative delta / SET semantics:** If Bug #2's wheel picker can produce values below `currentConsumedMl`, **either** clamp client-side to `[0, ...]` (recommended) **or** reject the SET with a UI error before POST. Do NOT POST `count: -N` — Zod will reject with 400.
- **Per-row max:** current `count.max(200)` allows 200 ml in a `'ml'` unit row. A custom 350 ml entry will fail Zod validation. **Bug #2 must either**:
    - Lift the per-row cap to ≥ 5000 (single POST per custom amount), OR
    - Split the POST into multiple writes (e.g., a 350 ml entry → 1×bottle 500ml? no, that's wrong; would need ml=200 + ml=150). Splitting risks I11 idempotency complications across the split.
    - **Recommendation: lift the Zod `count.max(200)` to `count.max(MAX_DAILY_WATER_ML)` for `unit:'ml'` writes specifically.** This is a 1-line schema change Bug #2 should make. The cap still enforces at the daily-total layer.

## Status

implemented
