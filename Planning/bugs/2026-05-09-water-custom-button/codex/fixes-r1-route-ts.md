# Round 1 fixes — app/api/water/log/route.ts

## C1 — fail-closed on totals/cap-eval DB error
- Change: removed the `await computeDayTotalMl(...) ?? 0` fail-open
  coercion entirely. The cap evaluation now happens INSIDE the
  `log_water_with_cap` RPC (migration 0018) so any read failure
  during the SUM raises out of the RPC and the route's existing
  `if (rpcError) return 500` path catches it. The route also returns
  500 with `{ error: 'empty_rpc_result' }` if the RPC returns null
  data without error (defensive). The dead `computeDayTotalMl` helper
  (and its `mlFromWaterRow` import) was removed.
- Test added: `tests/unit/api/water-log.test.ts::Codex R1 C1 — fail closed on totals/cap-eval DB error > RPC returns a non-cap DB error → route returns 500 (no fail-open with total=0)`
  + companion test for null-data defensiveness.
- Test result: pass after fix. (The pre-fix test would have asserted
  `200 + total=0` per the old behavior — replaced by the failing test
  for the new contract.)

## C2 — atomicity
- Option chosen: A — Postgres RPC via `supabase.rpc(...)`.
- Migration file: `supabase/migrations/0018_water_log_atomic_cap.sql`.
- RPC name: `public.log_water_with_cap(p_client_id uuid, p_date date,
  p_count integer, p_unit text)`. SECURITY INVOKER. REVOKE FROM PUBLIC
  + GRANT EXECUTE TO authenticated, mirroring migration 0008. Per-
  (user, date) `pg_advisory_xact_lock` serializes concurrent posts;
  inside the lock the function (1) checks I11 idempotency, (2) SUMs
  the day, (3) cap-checks at 5000 ml (raises P0010 'over_daily_limit'
  with `detail` = current total), (4) INSERTs (catches 23505 →
  re-SELECT racing row), (5) returns jsonb {row, replayed, total_ml}.
- Route changes: replaced the SUM-then-insert + 23505 handler block
  with a single `supabase.rpc('log_water_with_cap', ...)` call. P0010
  → 409 with `{ error: 'OVER_DAILY_LIMIT', currentTotalMl, limitMl }`
  (currentTotalMl parsed from `error.details`). Any other rpcError
  → 500 with `{ error: 'db_error' }`.
- Test added (unit-layer):
  - `tests/unit/api/water-log.test.ts::Codex R1 C2 — atomic RPC replaces SUM-then-insert > every successful POST goes through the log_water_with_cap RPC (no direct water_log access)` — uses a `from('water_log')` mock that **throws** as a regression guard against any future re-introduction of JS-side SUM-then-insert.
  - `cap reject also routes through the RPC (no fallback to JS-side SUM-then-insert)`.
- Test result: both pass. End-to-end concurrency proof (two parallel
  POSTs → exactly one 200 + one 409, total never > 5000) requires a
  live Postgres + pg_advisory_xact_lock and is documented as a
  Followup for the integration suite (Postgres advisory locks cannot
  be simulated meaningfully in JS-side mocks).
- Followup: deferred to integration tier (kalori-dev migration apply +
  concurrent-POST integration test).

## Re-run results
- `npx vitest run tests/unit/api/water-log.test.ts` → 25 passed (25 total)
- `npx vitest run -t WaterTracker` → 32 passed, 2019 skipped (no
  matching WaterTracker file currently — no regressions surfaced)
- TypeScript: clean for app/api/water/log + tests/unit/api/water-log +
  migrations/0018 (verified via `npx tsc --noEmit` filtered grep). No
  errors introduced; the 3 errors flagged on first compile (`Object
  is possibly 'undefined'` on `calls.rpcCalls[0]`) were fixed by
  binding to `const rpcCall` with an early throw.
- ESLint: clean for the two changed files (`npx eslint
  app/api/water/log/route.ts tests/unit/api/water-log.test.ts` →
  empty output).

## False positives
None. C1 and C2 were both real and were fixed atomically by moving
the cap evaluation + INSERT into a single RPC.

## Stop-the-world
None. Existing migration infra (`supabase/migrations/`) was already
configured with 17 prior migrations and a clear naming pattern
(`NNNN_<slug>.sql`), and the project already exposes RPC calls
through `supabase.rpc(...)` (e.g., `library_merge_atomic` in
`/api/library/merge`), so Option A was a clean fit. Scope stayed
within the prescribed 2-file target (route + 1 migration), plus the
test rewrite.

## Files changed (final)
- `supabase/migrations/0018_water_log_atomic_cap.sql` (new)
- `app/api/water/log/route.ts` (replaced cap+insert block; removed
  `computeDayTotalMl` helper + unused `mlFromWaterRow` import)
- `tests/unit/api/water-log.test.ts` (rewrote mocks to drive the
  RPC contract; added C1 fail-closed test, C2 regression-guard
  tests; preserved all Bug-1, Bug-2, R3-C2-prime, I11-replay,
  23505-race, and Zod-validation coverage)
