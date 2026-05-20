# Project context — bugfix-tomi mini-batch A cleanup

**Project:** Kalori (AI-first calorie/nutrition tracker, PWA, dark-only, single-user).

**Tech stack:** Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase (`kalori-prod` `dryysypycsexvlbabtwq`, `kalori-dev` `aaiohznsqlqchsoxaqkz`, `ap-southeast-1`) + Gemini (`gemini-flash-latest`) + Vercel + Sentry.

**Parent batch:** `2026-05-16-library-overhaul` (commit `8cf1c86`, prod-deployed, backfill `1d0d04f`). Tail-state: Codex R1 3C+1I → R2 1C+1I → R3 user-authorized override clean; security CLEAN; E2E CI-DEFERRED.

**Mini-batch A items (5 — followup IDs + descriptions):**

1. **F-LIBOVR-E2E-INFRA-DRIFT** (High, ~1-3h) — In-repo portion only: (a) strip embedded `\r\n` artifacts in `tests/e2e/fixtures/global-setup.ts` env-loader; (b) refuse fixture when `SUPABASE_TEST_URL` points at prod ref `dryysypycsexvlbabtwq`. Operator-side `.env.local` regen is OUT OF SCOPE — flagged for user.
2. **F-LIBOVR-SEC-M1-PNG-DECODE-CAP** (Medium, 30-60 min) — Bound PNG decode buffer in `lib/library/sketch-pipeline.ts:262-269` with `MAX_INPUT_BYTES` (~5 MB) check immediately after `Buffer.from(image.base64, 'base64')`; add `failOn: 'truncated'` to `sharp` constructor; new error code `sketch_last_error = 'gemini_oversize_response'`.
3. **F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE** (Medium, 15-30 min) — Prod-gate `KALORI_SKETCH_FIXTURE_BASE64` in `lib/ai/image-client.ts:82-85` so `process.env.NODE_ENV !== 'production'` is required for fixture bypass. Mirror shape of `lib/library/sketch-enqueue.ts:56-58` `KALORI_SKETCH_DISABLED` gate.
4. **F-LIBOVR-BUG7B-LOGMODAL-SORT** (Low, 1-2h) — Log-modal `LibraryTab`'s Zustand sort union doesn't include `'name-asc'`; Bug 7 only fixed the `/library` page `usePersistedSelection` fallback. Two options: (a) widen union + flip default, OR (b) document intentional divergence (logging context = frequency/recency). Option (b) needs user sign-off.
5. **Unused-var ESLint warnings** in `tests/unit/lib/library/sketch-pipeline.test.ts` — 3 warnings from parent batch, no functional impact. Either prefix with `_` or remove if truly unused.

**Notes:**
- Items #2 and #3 are security-medium deferrals from parent batch Phase 6.
- Item #1 is a Phase 7 blocker fix (the operator regen is out of scope; in-repo guards prevent recurrence).
- Items #4 + #5 are low-priority leftovers.
- Scope is small (≤5 items, all narrow surface) — fits the bugfix-tomi small-batch profile.
