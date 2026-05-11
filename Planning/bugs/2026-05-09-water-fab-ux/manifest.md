# Bug Bundle Manifest — 2026-05-09-water-fab-ux

**Started:** 2026-05-08T19:03:07Z
**Committed:** 2026-05-09 (~09:17 GMT+7)
**Starting HEAD:** `ca8e4fe02924dee93aecf5031d2f598f3a6f8119`
**Branch:** main
**Codex rounds:** 3 (user-authorized HARD-RULE 4 two-round-cap override) + R3-informal (no round 4) for Option B
**Status:** completed (ready to ship)

**User decisions:**
- Phase 2 approval gate: 2 bugs approved as `known_fix` (toast latency + dashboard staleness); chip-loggedOn followup bundled into Bug 2's surface per user directive (same component, same line)
- Phase 5 STW (Codex R2 cap): user authorized HARD-RULE 4 override → run round 3 to verify the C1-prime fix (useLayoutEffect) holds against the original timing concern
- Phase 5.5 STW (Codex R3 cycle-broken): user authorized **Option B** (server-authoritative `totalMl` in POST response) and waived round-4 verification (R3-informal — no Codex re-review on the Option B fix). Relied on rigorous TDD + integration test against real `kalori-dev` PostgREST + careful sub-agent review.
- Phase 7 sweep: dirty-tree carry-over established as convention from prior batch (no fresh stash needed)

## Per-bug detail

### Bug #1 — Water FAB toast latency (mobile)

- **Status:** implemented
- **Classification:** known_fix
- **Description:** Water FAB toast appeared AFTER POST resolved (~500ms-2s on real mobile networks), making the FAB feel unresponsive. User re-tapped expecting feedback. The original implementation was `async function handleLogWater() { await authPost(...); pushToast(...); }` — toast push was guarded behind the network round-trip.
- **Root cause:** Toast push order was wrong relative to the network call. The kalori-canonical UndoToast surface supports synchronous fire-and-forget but the original implementation captured pushes inside an async path.
- **Files touched:**
  - **Production:**
    - `components/nav/nav-shell.tsx` — `handleLogWater` restructured: synchronous `function` returning `void`, push success toast pre-await, fire-and-forget `void (async () => { ... })()` wraps the `authPost`; on failure: `dismiss(clientId) + pushToast(error)` swap; on `SessionExpiredError` (Codex R1 C2 fix): same dismiss + error-toast swap before rethrow.
    - `lib/stores/useUndoQueueStore.ts` — NEW `dismiss(clientId: string): void` primitive: removes entry by `clientId`, clears `setTimeout`, no-op when no match (reference-equal state). Cross-tab broadcast envelope extended with `dismiss` message kind (Codex R1 I1 fix).
    - `lib/stores/useUndoQueueStore.cross-tab.ts` — receiver handles `'dismiss'` envelope kind with type-guarded clientId payload + originTabId echo-suppression.
  - **Tests:**
    - `tests/components/nav/nav-shell.test.tsx` — 4 new tests in `Bug-1 — water FAB toast fires synchronously (instant feedback)` describe block.
    - `tests/unit/lib/stores/useUndoQueueStore.test.ts` — 3 new tests in `Bug-1 — dismiss(clientId)` describe block.
    - `tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts` — 2 new tests for cross-tab dismiss broadcast (R1 I1 fix).
- **Tests added (9 new):**
  - 4× `nav-shell.test.tsx` — synchronous toast push, on-failure dismiss+error swap, no spurious dismiss on success, ref-latch holds with double-tap
  - 3× `useUndoQueueStore.test.ts` — `dismiss(clientId)` removes by clientId + clears timer, targets specific entry not newest, no-op when no match
  - 2× `useUndoQueueStore-cross-tab.test.ts` — cross-tab dismiss propagation envelope + reconstruction
- **Codex findings:** C2 (Critical — `SessionExpiredError` left false success toast) + I1 (Improvement — cross-tab optimistic broadcast without retraction broadcast). Both auto-fixed Round 1.
- **Risk:** low

### Bug #2 — Dashboard chip stale after FAB tap

- **Status:** implemented
- **Classification:** known_fix
- **Description:** WaterTracker chip's `useState(initial.consumedMl)` shadowed the fresh prop after FAB tap → `router.refresh()` → RSC re-render. The chip's local state was initialized from the prop once and never re-synced when the prop changed, so the FAB's successful POST + invalidation chain was visible to the server but invisible to the chip.
- **Root cause:** Local React 19 `useState` shadows source-of-truth prop. The "Adjusting state while rendering" pattern (React docs canonical) was needed because `react-hooks/set-state-in-effect` lint rule blocks the `useEffect` form.
- **Files touched:**
  - **Production:**
    - `components/dashboard/WaterTracker.tsx` — Fix A: `prevInitialConsumedMl` discriminator + during-render `setCommittedConsumedMl(initial.consumedMl)` re-sync when prop changes. Fix B: `WaterTrackerProps.loggedOn: string` → `WaterTrackerProps.timezone: string`; `addWater()` now calls `userTzToday(timezone)` at tap time. Reducer hardened with `issuedResetKey` action-payload field + reducer-side guard so stale optimistic actions are dropped on baseline shift. R3 Option B: success path commits `setCommittedConsumedMl(response.totalMl)` from server-authoritative response (always-trust-server) when `typeof response?.totalMl === 'number'`.
    - `app/(app)/dashboard/page.tsx` — `<WaterTracker initial={...} timezone={tz} />` (was `loggedOn={today}`).
    - `app/api/water/log/route.ts` — `computeDayTotalMl(supabase, userId, date)` helper added; route returns `{ row, totalMl }` (server-authoritative aggregation). On SUM failure returns `null` and client falls back to local prediction (TODO: Sentry hook — security M3 followup).
  - **Tests:**
    - `tests/unit/components/dashboard/WaterTracker.test.tsx` — 3 new tests + 5 existing tests modified (`loggedOn="2026-04-22"` → `timezone="UTC"` + `userTzTodayMock`); 2 additional C1-prime tests for round-3 source-pin (useLayoutEffect import + behavioural commit-skip pin).
    - `tests/unit/api/water-log.test.ts` — new tests for `totalMl` field in response shape.
    - `tests/integration/water-log-refresh.test.ts` — integration coverage for the chip re-render pathway (real PostgREST against `kalori-dev`).
    - `tests/integration/water-log-schema.test.ts` — schema-level pin for the `totalMl` field.
- **Tests added (8+ new):**
  - 3× `WaterTracker.test.tsx` — prop-sync re-render, optimistic preservation across initial-prop updates (resetKey discards in-flight delta), tap-time `loggedOn` derivation (followup F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 closure)
  - 5× `WaterTracker.test.tsx` — modified existing tests to switch from `loggedOn` prop to `timezone` prop with `userTzTodayMock`
  - 2× `WaterTracker.test.tsx` — C1-prime round-3 tests: useLayoutEffect source-pin + behavioural commit-skip when baseline shifts mid-flight
  - Multiple new tests across `tests/unit/api/water-log.test.ts`, `tests/integration/water-log-refresh.test.ts`, `tests/integration/water-log-schema.test.ts` for the Option B server-authoritative totalMl
- **Codex findings:** C1 (Critical — baseline refresh + in-flight success → double-count); R2 surfaced C1-prime (Critical — passive `useEffect` ref mirror misses microtask race under React 19 concurrent scheduling); R3 surfaced C2-prime (Critical — resetKey discriminator drops successful writes when baseline shift is unrelated to in-flight write — silent undercount → user re-taps → duplicate logging). R1 + R2 auto-fixed; R3 user-authorized Option B + skipped round 4 verification.
- **Risk:** medium (Option B without Codex verification — mitigated via rigorous TDD + integration test against real PostgREST)

### Bonus closure — F-WATER-CHIP-STALE-LOGGEDON-2026-05-09

The followup tracked from the prior batch (`bugfix-tomi 2026-05-08-mobile-water-button` Codex Round 2 C2) is closed by Bug 2's Fix B. The C2 timezone-prop-drill pattern that the FAB received is now applied to the chip — `WaterTrackerProps.timezone: string` + tap-time `userTzToday(timezone)` recompute mirrors `nav-shell.tsx:152-170`. User explicitly directed bundling per dispatch instruction at Phase 1 ("same component, same line surface — fold in").

## Codex Round Summary

- **R1:** 2 Critical (C1 WaterTracker resetKey guard, C2 nav-shell SessionExpiredError truthful feedback) + 1 Improvement (I1 cross-tab dismiss propagation). All 3 auto-fixed via parallel-safe sub-agent dispatch (3 different files).
- **R2:** 1 Critical (C1-prime — passive `useEffect` ref-mirror misses microtask race under React 19 passive-effect scheduling). User authorized round 3 to verify the recommended `useLayoutEffect` fix.
- **R3 (override):** R3 confirmed C1-prime fix (useLayoutEffect) closes the within-key microtask race, BUT surfaced C2-prime (Critical — orthogonal: resetKey-discriminator drops successful writes when baseline shift is unrelated to in-flight write). **Cycle BROKEN per HARD-RULE 4.** User chose **Option B** (server-authoritative `totalMl` from POST response) and waived round 4. R3-informal mitigation: rigorous TDD + integration test against real `kalori-dev` PostgREST.

## Security Review

0 Critical / 0 High / 3 Medium / 5 Informational. Recommendation: **PROCEED-CLEAN**.

- **M1 — `authPost` no timeout/abort; permanent FAB latch lockout under stalled network** (PRE-EXISTING, AMPLIFIED). Optimistic toast + ref-latch combination amplifies user-visible cost: success toast self-heals at 2s while latch holds indefinitely → user re-taps → silently swallowed. Tracked as `F-AUTHPOST-ABORTSIGNAL-2026-05-09`.
- **M2 — Rate limiting absent on `/api/water/log` while optimistic UI hides spam-tap** (PRE-EXISTING, RE-FLAGGED with raised priority). Tracked as `F-WATER-LOG-RATE-LIMIT-2026-05-09`.
- **M3 — `computeDayTotalMl` failure swallowed without Sentry; chip falls back to local prediction silently** (NEW observability gap, this batch). Tracked as `F-COMPUTE-DAY-TOTAL-SENTRY-2026-05-09`.
- **I1-info — SUM query parameterized via `.eq()` — SQL-injection-immune.** RLS defense-in-depth.
- **I2-info — `totalMl` rendered via React `{}` — XSS-safe.**
- **I3-info — `typeof response?.totalMl === 'number'` accepts NaN/Infinity** — defense-in-depth `Number.isFinite` guard recommended; not exploitable under TLS + RLS.
- **I4-info — `UndoBroadcastChannel` envelope unsigned** — same-origin trust boundary correct (browser-enforced).
- **I5-info — `client_id` UUID + `loggedOn` date carry low PII risk** in error paths.

## E2E Phase 7

- **Strategy:** A modified — chromium baselines committed locally; Firefox + WebKit baked on CI (`F-TEST-1` mechanism), per project precedent.
- **Unit + integration:** 12 files / **105/105 pass** in 4.72s. Files: `nav-shell.test.tsx`, `WaterTracker.test.tsx`, `useUndoQueueStore.test.ts`, `useUndoQueueStore-cross-tab.test.ts`, `water-log.test.ts`, `water-log-refresh.test.ts`, `water-log-schema.test.ts`.
- **E2E water-FAB (real Supabase `authedPage`):** passed 2/3 runs (cold-start flake on first run — non-blocking; `Run 1` 10s timeout on `getByTestId('log-fab-water')` returned global 404 — `reuseExistingServer:true` middleware/cookie acceptance hiccup; runs 2 + 3 PASS in 6.9s + 7.2s).
- **Visual baselines (water-fab-toast):** 6/6 chromium PASS — all regenerated. +392 B uniform delta across mobile/tablet/default × default/reduced-motion. Content stable (sub-1% rendering tweak). Firefox + WebKit deferred to CI.
- **Adjacent visual regression:** `dual-fab-layout.spec.ts` 18/18 PASS across 3 chromium projects — no scope creep into FAB rendering.
- **Coverage gaps tracked as followups:**
  - No e2e for /dashboard water chip tap (C2-prime fix unit-only) → `F-CHIP-E2E-COVERAGE-2026-05-09`
  - No e2e timing assertion for optimistic toast (Bug 1 fix unit-only) → `F-OPTIMISTIC-TOAST-E2E-TIMING-2026-05-09`
  - First-run cold-start flake on authed water-FAB e2e → `F-NAV-RESPONSIVE-COLDSTART-FLAKE-2026-05-09`
- **Blockers encountered:** 0.

## Pending follow-ups (deferred — for user disposition)

- **`F-AUTHPOST-ABORTSIGNAL-2026-05-09`** (medium, security M1) — `authPost` no timeout/abort; optimistic toast + ref-latch amplifies user-visible cost.
- **`F-WATER-LOG-RATE-LIMIT-2026-05-09`** (medium, security M2 — RE-FLAGGED with raised priority from prior batch) — optimistic UI hides per-tap latency, encouraging spam-tap that doesn't visually backpressure.
- **`F-COMPUTE-DAY-TOTAL-SENTRY-2026-05-09`** (medium, security M3 — NEW this batch) — SUM SELECT failure swallowed without Sentry hook; chip falls back to local prediction silently → potential regression-masking when chip's fallback path drops the resetKey discriminator.
- **`F-CHIP-E2E-COVERAGE-2026-05-09`** (improvement, Phase 7 coverage gap) — no e2e for /dashboard chip tap; C2-prime Option B fix has only unit + integration coverage.
- **`F-OPTIMISTIC-TOAST-E2E-TIMING-2026-05-09`** (improvement, Phase 7 coverage gap) — no e2e timing assertion for optimistic toast; Bug 1 fix exercised only at unit level.
- **`F-NAV-RESPONSIVE-COLDSTART-FLAKE-2026-05-09`** (informational, Phase 7 cold-start observation) — first-run timeout on authed water-FAB e2e; passed on retries; if recurring, consider `reuseExistingServer` warmup widening or pre-test `goto('/dashboard')` warmup.
- **5 Informational findings from security review** — see `security-review.md` in this folder for I1–I5 details.
- **Firefox + WebKit visual baselines** for `water-fab-toast.spec.ts` — re-bake on next CI `update_snapshots=true` workflow_dispatch (F-TEST-1 mechanism).

## Deviations from initial proposal

- **Store contract widened with `dismiss(clientId)` primitive** (Bug 1) — proposal phrased as "push toast pre-await" only; sub-agent identified that the on-failure swap required a primitive that can target a specific entry by clientId (existing `dismissTop` only targets newest). Backward-compatible single-method addition.
- **Store contract extended with cross-tab dismiss broadcast envelope** (Codex R1 I1 fix) — proposal didn't address cross-tab implications; Codex R1 surfaced that uncommitted optimistic broadcast must have a corresponding retraction broadcast. New `'dismiss'` message kind + reducer + receiver type-guard.
- **API route extended with `totalMl` response field + `computeDayTotalMl` helper** (R3 informal Option B fix) — proposal scoped Bug 2 to client-side only; Codex R3 cycle-broken state forced server-authoritative reconciliation. User explicitly authorized this scope expansion + waived round-4 Codex verification.
- **React 19 during-render setState pattern instead of `useEffect`** (Bug 2 fix) — proposal prescribed `useEffect(() => { setCommittedConsumedMl(...); setResetKey((k) => k + 1) }, [initial.consumedMl])`; the repo's `react-hooks/set-state-in-effect` lint rule flags that form. Switched to React docs "Adjusting state while rendering" pattern with `prevInitialConsumedMl` discriminator. Behaviourally equivalent, lint-clean.
- **Reducer hardened with `issuedResetKey` action-payload + reducer-side guard** (Bug 2 fix) — proposal flagged the resetKey bump might be a no-op in React 19 (it was — pending actions replay through the reducer regardless of base-state identity). Sub-agent extended action payload with `issuedResetKey` captured at issue time + reducer guard. Makes resetKey contract semantically real.
- **Handler signature changed `async function` → `function` returning `void` + `void (async () => { ... })()`** (Bug 1) — proposal phrased pre-await push; sub-agent chose the cleaner fire-and-forget shape. JSX `onClick` no longer needs `void handleLogWater()`; structurally impossible for any awaiter to block on the network. Approved per "minimal-cost option" + "surgical changes" rules.
- **No E2E added in Phase 3** — proposal mentioned `tests/e2e/nav-responsive.spec.ts` updates; that's owned by Phase 7 sub-agent under bugfix-tomi skill. Left for Phase 7. Phase 7 ran the existing test (no production-code changes needed there).

## R1 firewall preserved throughout

No edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, or `lib/auth/authFetch.ts`. The `authPost` call site change in `nav-shell.tsx` is invocation-shape only (sync vs async), not contract.

## Sub-artifacts (this folder)

- `proposals/bug-1.md`, `proposals/bug-2.md` — Phase 1 investigation proposals
- `outputs/bug-1.md`, `outputs/bug-2.md` — Phase 3 implementation outputs (incl. STW history + RED→GREEN sequences)
- `codex/round-{1,2,3}.md` — verbatim Codex review outputs
- `codex/round-{1,2,3}-categorized.md` — categorized severity findings
- `codex/fixes-r1-{nav-shell,store,watertracker}.md` — Round 1 fix sub-agent outputs
- `codex/fixes-r3-watertracker.md` — Round 3 layout-effect fix sub-agent output
- `codex/fixes-r3-c2-prime-option-b.md` — Round 3 informal Option B fix sub-agent output (server-authoritative totalMl)
- `security-review.md` — Phase 6 security review (PROCEED-CLEAN)
- `e2e-results.md` — Phase 7 E2E + visual sweep results
- `project-context.md` — Phase 0 priming output
- `lessons-relevant.md` — Phase 0.5 lessons-learned curated context
