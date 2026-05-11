# Fix R3-C2-prime (Option B) — server-authoritative totalMl

## Findings addressed
- **C2-prime (Critical, Codex round 3):** server now returns authoritative `totalMl` on `POST /api/water/log`; chip sets its committed baseline directly from the response, eliminating the resetKey-discriminator coupling that dropped successful chip writes when an unrelated baseline refresh fired mid-flight (and was previously responsible for round-1 C1's double-count failure mode too — both failure modes collapse into "trust the server").

## API change
- **File:** `app/api/water/log/route.ts`
- **New response field:** `totalMl: number | null` — added to all 200 success paths (fresh insert, I11 replay, 23505 race replay).
- **SUM query (helper `computeDayTotalMl`):**
  ```ts
  const { data, error } = await supabase
    .from('water_log')
    .select('count, unit')
    .eq('user_id', userId)
    .eq('date', date);
  // ...
  return data.reduce((acc, row) => acc + mlFromWaterRow(row), 0);
  ```
  Reuses the existing `mlFromWaterRow` derivation from `lib/dashboard/types.ts` (glass=250, bottle=500, ml=count). No new SQL aggregation primitives — pure-JS sum over a small (typically ≤ 12) per-user-day result set, indexed by the existing `(user_id, date)` composite.
- **New import:** `import { mlFromWaterRow } from '@/lib/dashboard/types';`
- **Error semantics:** aggregation read failure returns `totalMl: null` rather than throwing. The row IS already persisted at this point (write-side success), so a 5xx would mask user-visible success behind an unrelated read glitch. Chip detects `null`/missing and falls back to local prediction.
- **Verified live:** `tests/integration/water-log-schema.test.ts` exercises the new code path against real `kalori-dev` PostgREST and passed — confirms the query targets the correct table/columns/filters.

## Chip change
- **File:** `components/dashboard/WaterTracker.tsx`
- **Dropped:**
  - `useLayoutEffect` import (no longer used).
  - `useRef` import (no longer used).
  - `resetKeyRef = useRef(resetKey)` declaration.
  - `useLayoutEffect(() => { resetKeyRef.current = resetKey; }, [resetKey])` mirror.
  - `if (resetKeyRef.current === issuedResetKey) { ... }` C1 guard around the success-path commit.
- **Kept (intentionally — separate concerns):**
  - **Bug-2 prop-sync block** (`prevInitialConsumedMl` discriminator + `setCommittedConsumedMl(initial.consumedMl)` + `setResetKey(k => k + 1)` on prop change) — drives the initial.consumedMl→committedConsumedMl re-sync after `router.refresh()`.
  - **Bug-2 optimistic-reducer hardening** (`if (delta.issuedResetKey !== state.resetKey) return state;`) — prevents `useOptimistic` from replaying stale optimistic deltas across a baseline shift while a transition is still pending. The `issuedResetKey` payload + `setResetKey` bump on error remain to support this reducer guard. Server-authoritative totalMl makes the success-path post-commit invariant trivially correct regardless of resetKey shifts; the discriminator is now used ONLY to coordinate the optimistic-replay path inside `useOptimistic`.
- **Success path:** `if (typeof response?.totalMl === 'number') setCommittedConsumedMl(response.totalMl); else setCommittedConsumedMl((current) => current + ml);`
- **Fallback choice (judgment call documented in code):** the fallback path (when totalMl is missing/null) does NOT re-introduce the C1 resetKey guard. Rationale: the guard's failure mode (skipping a successful write under an orthogonal shift) is strictly worse than the rare double-count case under this fallback (which requires BOTH a baseline shift mid-flight AND a server-side aggregation glitch). Bias toward over-counting rather than dropping writes — the user's observable failure mode in the dropped-write case (re-tap → duplicate logging) is more harmful.

## Tests

### API tests (`tests/unit/api/water-log.test.ts`)
- **Mock framework extended:** `buildMocks` now branches on `select(columns)` to handle two distinct chains — the existing pre-insert idempotency `maybeSingle` chain AND the new post-write SUM aggregation chain (selects `count, unit`, no terminal `single`).
- **Added describe `R3-C2-prime — server-authoritative totalMl` (5 tests):**
  1. `fresh insert: response body includes totalMl reflecting SUM(ml) for user-day` — fixture: 1 glass + 1 bottle pre-existing → `totalMl: 750`.
  2. `I11 replay: response includes totalMl computed against current row set` — fixture: 1 glass + 1 bottle on the day → `totalMl: 750`.
  3. `23505 race replay: response includes totalMl from post-race aggregation` — fixture: 1 glass after race → `totalMl: 250`.
  4. `aggregation read error: response omits totalMl (null) — client fallback path stays valid` — `totalsError` set, response has `totalMl == null`, status still 200.
  5. `totalMl SUM uses ml-derivation: glass=250, bottle=500, ml=count` — fixture: 1 glass + 2 bottles + 100ml → `totalMl: 1350`.

### Component tests (`tests/unit/components/dashboard/WaterTracker.test.tsx`)
- **Default mock updated:** `authPost.mockResolvedValue({ row: { id: 'w-1' }, totalMl: 0 })` so server-authoritative semantics stay live in untouched tests.
- **Removed (no longer relevant under Option B):**
  - `'when baseline updates mid-flight, success-path commit is skipped (no double-count)'` — the C1 guard test; no guard exists anymore.
  - `'C1-prime: resetKeyRef mirror uses useLayoutEffect (not passive useEffect)'` — code-level pin against a useRef + useLayoutEffect block that no longer exists.
  - `'C1-prime: success-path commit skipped after baseline shifts (layout-effect form)'` — behavioural pin for the same removed guard.
- **Added (4 new tests):**
  1. `R3-C2-prime: success-path uses server totalMl directly (no double-count, no undercount)` — replaces the old C1 test. Same scenario (baseline absorbs +250 mid-flight) but resolution now sets state to server's `totalMl: 750` rather than computing `c + ml`. Covers R1 C1's failure mode.
  2. `R3-C2-prime: when baseline shift is UNRELATED to the in-flight write, success still commits (no undercount)` — the new round-3 scenario Codex surfaced. Other-tab logs +250 while our +250 is in flight; server resolves with `totalMl: 1000`. Pre-fix would stay at 750 (dropped write); post-fix shows 1000. Direct C2-prime regression guard.
  3. `R3-C2-prime fallback: when server omits totalMl, chip uses local prediction` — `authPost.mockResolvedValueOnce({ row: ... })` without totalMl; assert chip lands at `base + ml`.
  4. `R3-C2-prime fallback: explicit totalMl: null is treated as missing (uses local prediction)` — same as above with `totalMl: null` to pin the `typeof === 'number'` discriminator.
- **Untouched:** Bug-2 prop-sync regression tests, F-WATER-CHIP-STALE-LOGGEDON tap-time logged_on test, error-rollback test.

### Nav-shell tests (`tests/components/nav/nav-shell.test.tsx`)
- **Untouched.** The FAB's POST handler discards the response body (it triggers `router.refresh()` instead), so the response-shape change does not affect any nav-shell test mock or assertion.

## Verification
- **Vitest:**
  - `tests/unit/api/water-log.test.ts` → 14/14 passing (5 new R3-C2-prime + 9 prior).
  - `tests/unit/components/dashboard/WaterTracker.test.tsx` → 12/12 passing (4 new R3-C2-prime + 8 prior).
  - `tests/components/nav/nav-shell.test.tsx` → 22/22 passing (unchanged).
  - `tests/integration/water-log-refresh.test.ts` → 1/1 passing.
  - `tests/integration/water-log-schema.test.ts` → 2/2 passing (real PostgREST exercises the new SUM query).
  - **Combined sweep: 48/48 passing.**
- **TDD discipline:** all 4 component tests + all 5 API tests were authored BEFORE the implementation and verified to fail RED for the right reason (`totalMl: undefined` / chip stayed at undercount value 750 instead of 1000) before implementing the fix.
- **tsc:** `npx tsc --noEmit` — clean (no output).
- **Sanity check on SUM query:** `lib/dashboard/fetch.ts:71-75` uses identical predicate (`.from('water_log').select(...).eq('user_id', uid).eq('date', day)`) — the column names match migration 0003 / architecture §2.6. The `mlFromWaterRow` derivation is the canonical conversion (already used by `lib/dashboard/aggregate.ts`).

## Codex coverage gap
This fix shipped **WITHOUT** round-4 adversarial verification (user-authorized HARD-RULE 4 override per Phase 5 cap protocol). Risks:
- **Untested architectural change.** The chip's success-path commit semantics shifted from "client predicts new total" to "server returns authoritative total." The tests cover the happy paths and known failure modes (round-1 C1 double-count, round-3 C2-prime undercount), but a fourth-round Codex pass might surface a residual ordering bug in the new path that the test matrix doesn't cover.
- **Aggregation-read failure path is local-only tested.** The fallback path's behavior under high-concurrency (orthogonal shift + aggregation glitch simultaneously) is not exhaustively covered.
- **Mitigation:** Phase 7 E2E / visual sweep will exercise the chip end-to-end against real Supabase. The integration test (real PostgREST) already proved the new SUM query works against the live schema.

## False-positive flag
**false_positive: false** — Codex round-3 correctly identified C2-prime as a NEW Critical orthogonal to round-1's C1 fix. The C1 resetKey-discriminator model symmetrically over-corrected (preventing double-count by dropping successful writes), and the only architecturally clean way to close both failure modes simultaneously is server-authoritative state (Option B). Options A (force reconciliation) and C (per-action persistence flags) would have required either an extra round-trip or more state-machine complexity for the same result.
