# Kalori — Testing Strategy

> **Status:** Step 6.7 Artifact #5 (testing). Authoritative source for the test matrix, fixtures, CI gates, Playwright/Vitest configuration, and per-task test-level requirements.
> **Source authorities:**
> - `Planning/design-doc.md` §13 (testing matrix), §15 (a11y targets), §18 (failure modes), §19.1 (invariants)
> - `Planning/tasks.md` (every named test file across all 26 tasks — full inventory)
> - `Planning/architecture.md` §3 (RLS policies — 24 statements), §5 (`tests/` tree), §10 (ESLint rules), §11 (`client_id` enforcement pattern)
> - `Planning/ui-design.md` §5 (React 19 patterns), §10 (a11y rules — axe-core targets), §11 (Screen Inventory)
> - `Planning/PRD.md` (feature acceptance criteria)
> - `~/.claude/rules/testing.md` (TDD policy — applies to every implementation subagent)

---

## 1. Overview

### 1.1 Testing philosophy

Kalori's testing strategy is built on five non-negotiables:

1. **TDD is behavior-complete, not coverage-targeted.** Every implementation task in `tasks.md` follows the Canonical TDD Mandate: write a failing test for each behavior, verify it fails for the correct reason, write minimal code to pass, refactor only after green. Coverage % (≥70% branch) is a floor, not a goal — the real bar is **mutation evidence**: a test must fail when the code under test is transiently broken. If breaking a line of production code does not turn a test red, the test is a fiction.

2. **Tests are design pressure.** When a test is hard to write — especially around mocking, side-effect coupling, or "the function takes 12 arguments and a callback" — that pain is signal: the code under test is shaped wrong. Refactor the production code, not the test.

3. **Fail-for-the-right-reason gating.** A test that fails because of a typo in the assertion (a `expected.toBe(true)` when the function returns `'true'`) is worse than no test. Every TDD step verifies that the failure mode matches the missing behavior — never just "the test is red."

4. **Behavior over implementation.** Tests assert the user-observable contract, not the line of code that implements it. Renaming a private helper must not break tests; changing a request-body field MUST.

5. **Real DB > mocked DB.** Supabase Postgres is not mocked in integration tests. RLS is the load-bearing security boundary; mocking it removes the very thing that catches the next regression. Only Gemini and Supabase Storage signed-URL generation are mocked at the integration layer (via MSW).

### 1.2 Test pyramid (intentionally inverted-base — broader than canonical)

```
                       ┌──────────────────────┐
                       │  E2E + Visual + A11y │   thin tip — ~10 E2E flows
                       │      (Playwright)    │   18 visual baselines
                       └──────────────────────┘
                  ┌─────────────────────────────┐
                  │  Integration + RLS          │   ~38 integration tests
                  │  (Vitest + MSW + Playwright)│   58 RLS assertions
                  └─────────────────────────────┘
       ┌──────────────────────────────────────────────┐
       │  Unit + Component                            │   broad base — pure logic + 19 component
       │  (Vitest + React Testing Library)            │   modules + ESLint rule fixtures
       └──────────────────────────────────────────────┘
```

The base is **broader than typical** because Kalori's complexity lives in pure logic (Mifflin-St Jeor, TDEE, target calc, recalc-trigger, normalizers, edition-number, day-boundary timezone math, AI cache key, AI sanitization, micros priority). Pure functions are the cheapest tests in the suite — exhaustive table-driven coverage is mandatory. The integration band carries the contract-shaped tests (cache-tag round-trips, F12 forced-401 retries, `client_id` idempotency, account-delete cascade ordering). The tip is intentionally narrow: ~10 E2E flows, not 100. Each E2E flow is expensive and load-bearing; we run all of them every PR but resist the temptation to grow the count.

### 1.3 Coverage target (floor, not goal)

- **Branch coverage**: ≥70% (per `design-doc.md §13`)
- **Function coverage**: ≥75%
- **Line coverage**: ≥75%

Excluded from coverage measurement: `tests/fixtures/**`, `tests/mocks/**`, `tests/setup.ts`, `tests/axe/setup.ts`, `lib/**/*.types.ts`, `supabase/migrations/**`, `eslint-rules/**` (covered by their own fixture-based unit tests).

A coverage drop of >2 percentage points between PRs triggers a Codex review comment requesting justification. Coverage % is reported in CI summary; failure to meet the floor is **blocking** at the Phase Testing Sweep gate (Tasks 1.5, 2.4, 3.7, 4.6, 5.4) but **advisory** on per-task PRs (so a task that wires up new infrastructure without tests of its own can still merge if the infrastructure is exercised by downstream tests).

### 1.4 Mutation evidence principle

Coverage measures lines executed; mutation evidence measures lines that **matter**. Every Phase Testing Sweep includes a manual smoke check: pick three random files changed in the phase, mutate one line each (flip a boolean, add `+ 1` to a number, return a hardcoded value), re-run the relevant test, confirm the test fails. If the test passes despite the mutation, the test is fiction — fix it before closing the phase.

Automated mutation testing (Stryker or equivalent) is **deferred post-MVP**. The cost of integrating it into a 2-minute PR loop is not justified for a single-owner, single-user MVP. Manual mutation evidence at phase boundaries is the contract for now.

### 1.5 Per-phase Testing Sweep gating

Every phase ends with a mandatory Testing Sweep task (1.5, 2.4, 3.7, 4.6, 5.4). The sweep is **not a re-run of CI** — it is the canonical opportunity to:
- Verify all tests from the phase pass against a clean checkout
- Confirm mutation evidence on three random files
- Confirm visual regression baselines match (no unintentional drift)
- Confirm Lighthouse mobile ≥90 (advisory; logged regardless)
- Confirm coverage floor holds
- Run the manual smoke against dev seed data (Phase 3 = first-usable smoke; Phase 5 = final shippable smoke)

The sweep blocks phase completion if any blocking-tier test fails. See §4 for the gate definitions.

### 1.6 Per-task per-complexity gating

Per the `tasks.md` Legend, complexity drives the per-task test gate:

| Complexity | Per-task gate | What runs |
|---|---|---|
| **Simple** (1 file, <30min) | Phase-level only | No per-task gate; the Phase Testing Sweep covers it |
| **Medium** (1–4 files, 30–90min, real logic) | Per-task: unit + integration | Type tag determines which integration; UI tasks add component |
| **Complex** (4+ files, >90min, cross-cutting) | Per-task: unit + integration + level-per-type-tag | `[UI]` adds component+E2E+axe+visual; `[API]`/`[backend]` adds integration+RLS-regression; `[database]` adds RLS+migration-rollback; `[infrastructure]` adds CI-config validity |
| **Review** (mandatory phase gate) | Codex / Phase Sweep workflow per `tasks.md` | No file-level tests; the gate IS the test |

Tasks 1.4, 2.3, 3.6, 4.5, 5.3 are Codex Adversarial Reviews. Tasks 1.5, 2.4, 3.7, 4.6, 5.4 are Phase Testing Sweeps. None of these write code; all of them block phase completion.

---

## 2. Full Test Matrix

Expanded from `design-doc.md §13`. Ten test levels, each with explicit scope, key targets (cross-referenced to `tasks.md`), gating, and tooling.

### 2.1 Unit (Vitest)

**Tool:** Vitest 1.x with `@testing-library/jest-dom` matchers and `vitest --coverage` (V8 provider).

**Scope:** Pure-logic modules. No React. No Supabase. No fetch. No I/O. If the function under test takes inputs and returns outputs without side effects, it belongs here.

**Key targets:**

| Module | Source task | Notable cases |
|---|---|---|
| `lib/nutrition/mifflin-st-jeor.ts` | 2.1 | Male/female/edge ages (16, 18, 65+, 100), edge heights (140cm, 220cm), edge weights (40kg, 200kg), invalid inputs throw |
| `lib/nutrition/tdee.ts` | 2.1 | All 5 activity multipliers; BMR boundary (extreme ends) |
| `lib/nutrition/target.ts` | 2.1 | Goal delta ranges (+5kg, -10kg, 0); pace bands (8w, 12w, 16w, 24w); rounding to nearest 10 kcal |
| `lib/nutrition/recalc.ts` (`recalcTargetIfNeeded`) | 4.3b | Threshold-boundary cases (just below, just above, zero, negative delta, first-ever entry); IO absence assertion (mock fetch, expect 0 calls) |
| `lib/nutrition/display-micros.ts` (priority constant + sort) | 3.5 | Priority order matches spec; alphabetical fallback after first 6; max 10 visible |
| `lib/ai/prompts.ts` (template rendering) | 3.2 | Region/dietary/allergen injection produces parts-array (NOT concatenated); no missing parts |
| `lib/ai/schemas.ts` (Zod ParseResult) | 3.2 | Reasoning >500 chars rejected; control-char-bearing strings rejected; missing nutrient fields rejected; well-formed accepted |
| `lib/ai/cache.ts` cache-key generator | 3.2 | Key includes `user_id` (F8); cache key stable across input whitespace normalization; different users produce different keys |
| `lib/ai/sanitize.ts` | 3.2 | Strips `<\|system\|>`, `SYSTEM:`, `IGNORE PRIOR`, `### END USER`, role-control variants; preserves user input characters; logs stripped tokens count |
| `lib/cache/tags.ts` (TAGS factory functions) | 1.3 | `TAGS.userEntries(uid, day)` produces deterministic string; `TAGS.weeklyReview(uid, weekStartOn)` keys correctly; `TAGS.profile`, `TAGS.userLibrary`, `TAGS.userProgress` all stable |
| `lib/text/normalize.ts` (`normalizedName`) | 3.4 | "two eggs" vs "2 eggs" produce DIFFERENT normalized strings (no fuzzy MVP); punctuation stripped; tokens sorted; trim |
| `lib/dashboard/aggregate.ts` (TZ day-boundary) | 3.5 | UTC+7 (Da Nang), UTC-12, UTC+13, DST forward, DST back; logged-at exactly-at-midnight edge; cross-day entry crossing TZ midnight |
| `lib/aggregations/progress.ts` (D/W/M ranges) | 4.3a | Range boundaries; sparse-data threshold (3-day floor); week start on Monday in user TZ |
| `lib/dashboard/edition-number.ts` (or co-located in Masthead.tsx) | 3.5 | Edition rolls over at user-TZ midnight; epoch from `profiles.created_at` in user TZ; days-since calculation |
| `lib/offline/outbox.ts` serialize/deserialize | 5.1 | Outbox row preserves `client_id` across (de)serialize; queue ordering (FIFO); flush idempotency on partial failure |
| `lib/motion/dashboard-choreography.ts` (timing math) | 3.5 | Stagger delays compute correctly; `prefers-reduced-motion` returns 0ms; ease-curve sampling |
| `lib/image/compress.ts` (size targeting) | 3.3 | Wrapper invokes `browser-image-compression` with correct options (<500kb, 1600px max); fallback on compression failure |
| `eslint-rules/no-inline-cache-tags.js` | 1.3 | Rule fires on `cacheTag('user:abc:entries:today')`; allows `cacheTag(TAGS.userEntries(uid, day))` |
| `eslint-rules/no-inline-user-strings.js` | 1.3 | Flags hard-coded JSX strings; allowlist for `aria-label`, `aria-describedby`, `data-testid`, `className`, `id` |
| `eslint-rules/no-server-only-client-import.js` (I3) | 1.1 | Forbids importing `@/lib/ai/client` from `app/(app)/`, `components/`; allows from `app/api/` and `tests/` |
| `lib/i18n/en.ts` (typed shape) | 1.3 | `t` is an object with no string-only leaves missing required keys; nav/dashboard/log/library/progress/settings/errors/onboarding all present |

**Coverage target:** ≥70% branch on every `lib/` module.

**Gating:** Per-task for Medium/Complex tasks touching pure logic. Phase-level for Simple tasks.

### 2.2 Component (Vitest + React Testing Library)

**Tool:** Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.

**Scope:** Client components with state, interactions, optimistic UX, and rollback paths. Render shallow when possible; integration with real children when component composition is the contract under test.

**Key targets:**

| Component | Source task | Notable cases |
|---|---|---|
| `ChronometerRing` | 3.5 | Arc length math correct for kcal_consumed / kcal_target; Roman numerals render; 600ms draw triggers; reduced-motion → fade only; tabular numerals |
| `MacroBars` | 3.5 | Three bars render; correct fill % per macro; mono % suffix; over-target → oxblood + `!` glyph + "OVER" text |
| `MealsBulletin` row | 3.5 | Renders entries by category; mobile collapses to single column; click row → opens entry detail; ⋯ menu opens with `Menu`/`Shift+F10` |
| `WaterTracker` (optimistic + rollback) | 3.5 | `+glass` / `+bottle` increments display BEFORE network response; on server error → rollback + toast with original value |
| `LibraryItemCard` (states) | 4.1 | Default / hover / selected / overflow-menu states; null-thumbnail → `ThumbnailLetterMark` placeholder; oxblood TOP rule on letter-mark variant |
| `MergeDuplicatesDialog` (per-field picker) | 4.1 | Side-by-side compare; user picks per-field values; confirm submits with picked record; Cancel resets; non-undoable confirm dialog (no undo affordance) |
| `PortionPicker` stepper → flush-serif | 3.4 | ArrowUp/Down on focused value steps; `hitSlop` 16px; flush-serif numerals on commit |
| `UndoToast` (LIFO + 5s + cleared-on-nav) | 3.4 | Toasts reveal in LIFO order; 5s timer per item; clear queue on `router.push` BUT 5s timer continues per item until expiry (F6 cross-route undo); `useOptimistic` rollback on server failure |
| `MicronutrientHeatmap` (interaction + mobile transpose) | 4.3a | 7 nutrients × 30 days desktop; transpose to 7 days × N nutrients on mobile; cells fade row-by-row on first view; `prefers-reduced-motion` skips fade; tooltip on hover/keyboard with numeric value + % + aria-label |
| Chart tooltips (CalorieAdherenceBar, WeightTrajectoryLine, etc.) | 3.5/4.3a | Hover shows tooltip; keyboard nav cycles points; aria-live polite companion announces values |
| `WeightQuickAdd` (optimistic + rollback) | 4.3b | Display increments immediately; on 500 error → rollback + undo-style toast with original value |
| `TargetUpdatedNudge` | 4.3b | Renders only when `last_target_recalc_at > last_dashboard_visit_at`; "Recalculate now" CTA + "Dismiss" both wired; "see why" opens HowWeCalculated panel from Task 2.2 |
| `WeeklyInsightCard` (sparse + full variants) | 4.3a | Sparse: <3 logged days → static "§ THE EDITOR'S NOTE" template; Full: ≥3 days → fetched body with drop cap |
| `WeeklyReviewIsland` (server-fetch stub via MSW) | 4.3a | Renders inside Suspense; cache key matches dashboard variant (no double-fetch); regen button hidden on island |
| `HowWeCalculated` (transparency panel) | 2.2 | Renders BMR, TDEE, target with actual computed numbers from `lib/nutrition/*`; expand/collapse persists `aria-expanded` |
| `StepGoalWeight`, `StepPace` | 2.2 | Real-time delta vs current weight; pace step shows calculated target dates per option |
| `LoginForm` | 2.1 | Magic-link submit dispatches; Google OAuth button click; password reveal toggles `aria-pressed` |
| Each onboarding step (8 components) | 2.2 | Render; Back/Next enable/disable rules; transparency panel toggle on Step 8 |
| `TypeTab`, `SnapTab`, `LibraryTab` | 3.3 | Type: 600ms-debounced AI chip preview; Snap: compression invocation on drop; Library: sort toggle, multi-select, frequency-first ordering |
| `ManualEntryFallback` | 3.3 | Pre-filled with original input on mount; submit dispatches manual save |
| `ConfirmationScreen` | 3.4 | Editable items render; meal-category selector; time editor; Save-to-library toggle default ON; dedup prompt path |
| `Sidebar`, `BottomTabBar`, `LogFAB` | 1.2 | Active state via `aria-current="page"` + ivory text + bg-2 fill + 3px oxblood left border (sidebar variant); 44×44 tap target verified |
| `OfflineBadge`, `OfflineIndicatorToast` | 5.1 | Render conditionally on `lib/offline/availability.ts`; toast announces via `aria-live="polite"` |

**Primary a11y in component tests:** Every component test that involves state asserts the optimistic + rollback path (mock server failure, observe rollback). Every interactive component asserts focus management on mount (where applicable) and keyboard activation.

**Gating:** Per-task for Medium/Complex `[UI]`-tagged tasks. Phase-level for Simple `[UI]` tasks.

### 2.3 Integration (Vitest + MSW for external APIs; real Supabase for DB)

**Tool:** Vitest with MSW (Mock Service Worker) for Gemini API + Supabase Storage signed-URL stubs. **Real Supabase Postgres** (test DB; see §10 RLS Test Harness Setup) for all DB assertions.

**Scope:** Route Handlers end-to-end. A test exercises the full request → middleware → handler → DB → response cycle, asserting both the response shape and the DB side-effects.

**MSW mocks (the only things mocked):**
- All `/api/ai/*` external calls to Gemini (`@google/genai` is intercepted at the network layer)
- Supabase Storage `createSignedUrl(...)` for thumbnail tests (the bucket itself is real; the URL signing is stubbed to avoid CDN dependency)

**NOT mocked (by design):**
- Supabase Postgres — real test DB enforces RLS at the integration layer; this is the single most important architectural test bed
- Server Actions — exercised in-process via the test handler harness
- Cache tags (`cacheTag` / `updateTag`) — exercised against a Next.js test runtime that supports them

**Key test files** (extracted exhaustively from `tasks.md` and `architecture.md` §5):

#### F12 Auth-refresh integration tests (8 total: 1 core + 7 endpoint-specific)

The F12 contract (auth session expired mid-mutation → `lib/auth/refresh-interceptor.ts` retries once after `refreshSession()`) is the single most reinforced contract in the test suite. Per Codex Round 2 H1-R2, every endpoint that wraps the interceptor has its own forced-401 integration test.

| # | File | Endpoint under test | Assertions |
|---|---|---|---|
| Core | `tests/integration/auth-refresh-retry.test.ts` | `/api/profile/save` | Forced 401 → `refreshSession()` succeeds → retry succeeds (200); forced 401 → refresh FAILS → sign-out + redirect to `/login` |
| 1 | `tests/integration/ai-vision-refresh.test.ts` | `/api/ai/vision` | Forced 401 → interceptor retries; exactly one `ai_call_log` row written per logical call |
| 2 | `tests/integration/ai-weekly-review-refresh.test.ts` | `/api/ai/weekly-review` | Forced 401 → interceptor retries; exactly one `ai_call_log` row |
| 3 | `tests/integration/log-flow-text-parse-refresh.test.ts` | `/api/ai/text-parse` (via log flow) | Forced 401 → interceptor retries; draft state preserved (Zustand) |
| 4 | `tests/integration/log-flow-vision-refresh.test.ts` | `/api/ai/vision` (via log flow) | Forced 401 → interceptor retries; draft state preserved |
| 5 | `tests/integration/library-bulk-delete-refresh.test.ts` | `/api/library/bulk-delete` | Forced 401 → interceptor retries; deleted row set matches requested IDs exactly once (no partial deletion) |
| 6 | `tests/integration/library-delete-refresh.test.ts` | `/api/library/[id]/delete` | Forced 401 → interceptor retries; library row deleted exactly once + `food_entries.library_item_id` set to NULL exactly once |
| 7 | `tests/integration/ai-text-parse-refresh.test.ts` | `/api/ai/text-parse` (Task 3.2 layer, distinct from log-flow wrapper test) | Forced 401 → interceptor retries; one `ai_call_log` row per logical call |

**Per spec rollup:** "7 endpoint-specific + 1 core = 8 files total" — the core test (`auth-refresh-retry.test.ts`) covers the contract via `/api/profile/save`; the 7 endpoint-specific tests are: `ai-vision-refresh`, `ai-weekly-review-refresh`, `log-flow-text-parse-refresh`, `log-flow-vision-refresh`, `library-bulk-delete-refresh`, `library-delete-refresh`, plus `ai-text-parse-refresh` from Task 3.2 (the original endpoint test). Other refresh tests exist for `entries/save`, `library/merge`, `library/[id]/update`, `weight/log`, `water/log`, `log-flow` thumbnail upload — these are reinforcement coverage on the same interceptor; they are not part of the "7 endpoint" rollup but each enforces the F12 contract on its own surface.

#### Idempotency + cache-tag round-trip integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/client-id-idempotency.test.ts` | 3.1 | DB-level: duplicate insert with same `client_id` raises 23505; route handler treats 23505 as "replay" → re-SELECT + return 200 + existing row + `replayed: true` |
| `tests/integration/entries-save-idempotency.test.ts` | 3.4 | 2 POSTs to `/api/entries/save` with same `client_id` → 1 row, 200 returned both times |
| `tests/integration/water-log-idempotency.test.ts` | (implicit, exercised via `water-log-refresh`) | Same `client_id` replay returns 200 + existing row |
| `tests/integration/weight-log-idempotency.test.ts` | 4.3b | Duplicate POST with same `client_id` returns 200 + existing row (reasserts I11 for weight-log path) |
| `tests/integration/cache-tag-roundtrip.test.ts` | 3.4 | Mutation calls `updateTag(TAGS.userEntries(uid, day))`; subsequent `cacheTag`-bound dashboard read returns fresh data (covers I12 + cache invariant from §18.3) |
| `tests/integration/dashboard-cache-tag.test.ts` | 3.5 | Log mutation invalidates dashboard cache via `updateTag`; next read returns fresh data (no stale read) |

#### Library mutation integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/library-merge.test.ts` | 4.1 | FK repoint correctness: `food_entries.library_item_id` updates from loserId → winnerId; loser deleted; winner has picked field values; transaction rolled back on intermediate failure (single test asserts atomicity) |
| `tests/integration/library-merge-refresh.test.ts` | 4.1 | F12: merge POST under forced 401 → interceptor retries → exactly-once transaction commit (no partial FK repoint) |
| `tests/integration/library-update-refresh.test.ts` | 4.2 | F12: library item edit under forced 401 → interceptor retries → `client_id` preserved (row count = 1) |
| `tests/integration/library-bulk-delete.test.ts` (implicit via 4.1 AC + 5.2 export tests) | 4.1 | Tombstone created on delete; undo within 5s restores; outside 5s → permanent deletion via cascade |

#### AI route integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/ai-text-parse.test.ts` | 3.2 | MSW-stubbed Gemini → happy-path parse → cache-hit returns same payload → `ai_call_log` row written exactly once per call |
| `tests/integration/ai-vision.test.ts` | 3.2 | Same contract for vision endpoint; thumbnail-only Storage policy verified (no full-resolution objects under `food-thumbnails/{user_id}/`) |
| `tests/integration/ai-weekly-review.test.ts` | 3.2 | Same contract for weekly-review endpoint; sparse-data fallback path returns static template (no Gemini call); ≥3 days returns Gemini-fetched body |
| `tests/integration/ai-fallback.test.ts` | 3.2 | Gemini error (timeout, 500, Zod-fail, rate-limit) → route returns structured `{ fallback: true, originalInput }` payload (consumed by Task 3.3 ManualEntryFallback) |
| `tests/integration/ai-response-cache-ttl.test.ts` | 3.2 | 30-day TTL: cache row inserted; `expires_at` computed correctly; expired row miss → fresh Gemini call + new cache row |
| `tests/integration/ai-call-log-insertion.test.ts` | 3.2 | I2: every AI call (cache hit, miss, error) writes exactly one `ai_call_log` row before returning. Failure-tolerant: when `ai_call_log` insert itself fails, the route still returns the AI payload + Sentry breadcrumb |

#### Log flow integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/log-flow-fallback.test.ts` | 3.3 | Gemini failure → `<ManualEntryFallback />` opens with original input pre-filled (I7) |
| `tests/integration/log-flow-refresh.test.ts` | 3.3 | F12: thumbnail-upload POST under forced 401 → interceptor retries → draft state preserved |
| `tests/integration/msw-gemini.test.ts` | 1.3 | MSW handler intercepts `/api/ai/text-parse` and returns the configured stub (proves the test infrastructure works) |

#### Weight + recalc integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/weight-log-recalc.test.ts` | 4.3b | Auto mode: weight POST → `recalcTargetIfNeeded` fires → `profiles.last_target_recalc_at` updated → `TAGS.profile(uid)` invalidated → nudge flag visible on next dashboard render |
| `tests/integration/weight-log-refresh.test.ts` | 4.3b | F12: weight POST under forced 401 → interceptor retries → original `client_id` preserved → auto-recalc fires exactly ONCE on the retry response (no double-recalc) |
| `tests/integration/weight-quick-add-rollback.test.ts` | 4.3b | F3: optimistic increment + server 500 → rollback + toast |
| `tests/integration/water-log-refresh.test.ts` | 3.5 | F12: water quick-add under forced 401 → interceptor retries → `client_id` preserved; optimistic-rollback NOT triggered by intermediate 401 (no rollback flash visible to user) |

#### Weekly review + sparse data + cache reuse

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/weekly-review-tz-rollover.test.ts` | 4.3a | F4: clock forward to new `week_start_on` → no row exists → new review generated; integration test fast-forwards clock |
| `tests/integration/weekly-review-cache-reuse.test.ts` | 4.3a | Dashboard `<WeeklyInsightCard>` and progress `<WeeklyReviewIsland>` share the same `TAGS.weeklyReview(uid, weekStartOn)` cache row → exactly one Gemini call per (user, week) |

#### Cross-tab + offline + cleanup integration tests

| File | Source task | What it asserts |
|---|---|---|
| `tests/integration/undo-cross-tab.test.ts` | 5.2 | F6 cross-tab half: BroadcastChannel('kalori-undo') reveals the toast in tab B when delete happens in tab A |
| `tests/integration/cross-tab-signout.test.ts` | 5.2 | F12 cross-tab half: sign-out in tab A propagates to tabs B/C via BroadcastChannel('kalori-auth'); 3-tab scenario covered |
| `tests/integration/account-delete-cascade.test.ts` | 5.2 | I9: zero objects under `food-thumbnails/{userId}/` AND zero rows in all 6 user-owned tables AND `auth.users` row absent — IN THAT ORDER (Storage first; verified by sequencing markers in test) |
| `tests/integration/export-zip.test.ts` | 5.2 | Round-trip: seed user data → export ZIP → unzip → verify CSV has UTC + user-TZ columns + `schema_version: "v1"` in JSON |
| `tests/integration/export-csv.test.ts` (implicit via export-zip composition) | 5.2 | Flat `food_entries + weight_log + water_log` CSV; ISO 8601 UTC + user TZ column per `design-doc §10.9` |
| `tests/integration/export-json.test.ts` (implicit via export-zip composition) | 5.2 | Nested profile + library + entries + logs with `schema_version: "v1"` |
| `tests/integration/offline-outbox-replay-idempotency.test.ts` | 5.1 | I11 full contract: outbox flush with N unique `client_id`s + K duplicates → row count = N; partial-flush failure (network drop mid-flush) resumed produces zero duplicates; `client_id` preserved across tab refresh + reconnect |
| `tests/integration/outbox-conflict-resolution.test.ts` | 5.1 | F10: LWW for library; goal-weight conflict requires user confirmation; per-table conflict resolution table-driven |
| `tests/integration/idb-unavailable-fallback.test.ts` | 5.1 | Safari-private-mode simulation → `lib/offline/availability.ts` detects unavailability → online-only mode + one-time toast |
| `tests/integration/reduced-motion-audit.test.ts` | 5.1 | Every `motion.*` import in the codebase has a `prefers-reduced-motion` variant (CI test scans the AST) |
| `tests/integration/ai-accuracy-regression.test.ts` | 5.1 | Drives the `tests/fixtures/ai-accuracy/` tree against MSW-stubbed Gemini; CI marks deviations for manual review (advisory tier per Task 5.4) |
| `tests/integration/sentry-init.test.ts` | 1.1 | Sentry initializes with `KALORI_ENV` scope tag; test capture path works in dev; production filter strips PII |

**Gating:** Per-task for Medium/Complex tasks tagged `[API]`, `[backend]`, or `[integration]`. Phase-level for Simple tasks.

### 2.4 RLS (Playwright — black-box DB assertions via 2 auth tokens)

**Tool:** Playwright with the 2-user fixture from Task 1.2 (`tests/rls/_harness.ts`). RLS tests are intentionally **separate** from integration tests — they are black-box DB assertions using two real authenticated user sessions, not in-process route handler invocations.

**Scope:** Every 4-verb policy on every user-owned table, plus storage-bucket path-based ownership, plus service-role-only access denial.

**Why Playwright instead of Vitest:** RLS is enforced by Postgres against the JWT carried in the Authorization header. The cleanest way to assert "User B cannot read User A's row" is to issue an HTTP request to the Supabase REST API as User B and verify the response. Playwright's request fixture handles this beautifully and runs in an environment that mirrors production (real Supabase service, real RLS evaluation). No mocking surface exists between test and contract.

**Assertion count derivation:**

Per `architecture.md §3` (Verb Matrix):

- **6 user-owned tables** × **4 verbs** (SELECT/INSERT/UPDATE/DELETE) × **2 (own ✅ + other ❌)** = **48 assertions**
- **Storage bucket** (`food-thumbnails`): 4 verbs × 2 (own ✅ + other ❌) = **8 assertions**
- **Service-role-only tables** (`ai_response_cache`, `ai_call_log`): direct client access from User A → empty result (no rows leaked) = **2 assertions**

**Total: 58 RLS assertions.**

> **Reconciliation note:** `design-doc.md §13` quoted "32 assertions minimum" referencing 8 tables × 4 verbs (which double-counted both directions implicitly). `architecture.md §3.8` reflects the precise reconciled count: 6 user-owned tables (`profiles`, `food_entries`, `food_library_items`, `weight_log`, `water_log`, `weekly_reviews`) with user-facing policies = 24 policy statements, each tested in both `own` ✅ and `other` ❌ directions = 48 assertions for tables alone. Adding 8 storage and 2 service-role assertions yields the canonical **58 total**. The 24-policy/28-assertion language in older `tasks.md` AC entries (e.g., Task 3.1 "28 RLS assertions" referring to 4 verbs × 7 tables in original draft) refers to the per-task subset; the full Phase Testing Sweep (Task 3.7, 4.6, 5.4) runs all 58.

**Test files** (per `architecture.md §5` `tests/rls/`):

| File | Source task | Assertions |
|---|---|---|
| `tests/rls/_harness.ts` | 1.2 | (no assertions; fixture file) |
| `tests/rls/_harness.test.ts` | 1.2 | Sanity: harness creates 2 users with distinct UIDs; both can read their own profile; teardown idempotent |
| `tests/rls/profiles.spec.ts` | 2.1 | 4 verbs × 2 directions = 8 assertions on `profiles` |
| `tests/rls/food-schema.spec.ts` | 3.1 | 4 verbs × 5 user-owned tables (food_entries, food_library_items, weight_log, water_log, weekly_reviews) × 2 = 40 assertions; service-role-only check on ai_response_cache + ai_call_log = 2 assertions |
| `tests/rls/storage-bucket.spec.ts` | 3.1 | 4 verbs × 2 directions × 1 bucket = 8 assertions on `food-thumbnails` path-based ownership |
| `tests/rls/weight-log.spec.ts` | 4.3b | Regression check: 4 verbs × 2 directions = 8 assertions (no new table; reasserts isolation after Task 4.3b API routes ship) |

**Per-spec breakdown:**

```
profiles.spec.ts:           4 × 2 = 8
food-schema.spec.ts:
  food_entries:             4 × 2 = 8
  food_library_items:       4 × 2 = 8
  weight_log:               4 × 2 = 8
  water_log:                4 × 2 = 8
  weekly_reviews:           4 × 2 = 8
  ai_response_cache:        1 × 2 = 2  (service-role-only — User A direct access blocked)
  ai_call_log:              1 × 2 = 2  (service-role-only — User A direct access blocked)
storage-bucket.spec.ts:     4 × 2 = 8
weight-log.spec.ts:         4 × 2 = 8  (regression — overlaps food-schema's weight_log; both run)
─────────────────────────────────────────
Subtotal (table + storage):    66
                               ─── of which weight-log.spec is regression overlap (deliberate; runs separately to catch regressions when Task 4.3b API routes wire up)
Effective unique assertions:   58
```

**Gating:** Merge-blocking from Task 1.2 onward (every PR touching RLS or Storage). Phase Testing Sweep at 1.5, 2.4, 3.7, 4.6, 5.4 reruns the full RLS suite as a regression check.

### 2.5 E2E (Playwright)

**Tool:** Playwright 1.x with `@axe-core/playwright` injected on every test.

**Scope:** ~10 critical user flows. Each flow is end-to-end: real browser, real auth, real DB, mocked Gemini (deterministic via MSW handlers wired into Playwright's request interception).

**Browsers:**
- **Chromium** — primary; runs every E2E spec (logic + regression)
- **Firefox** — visual-regression-only project
- **Safari (WebKit)** — visual-regression-only project (also runs IDB-unavailable simulation in `idb-unavailable-fallback.test.ts`)

**The 10 critical flows:**

| # | Flow | Test file | Source task | Why critical |
|---|---|---|---|---|
| 1 | Auth sign-up + 8-step onboarding + first dashboard | `tests/e2e/onboarding-completion.spec.ts` | 2.2 | Cold-start path; first-impression UX; Mifflin-St Jeor → target → dashboard chain |
| 2 | Text log (Type tab) → confirmation → save → undo within 5s | `tests/e2e/text-log.spec.ts` + `undo-toast.spec.ts` | 3.3 + 3.4 | Most-frequent log path; F11 prompt-injection mitigation; F3 optimistic rollback; I8 undo |
| 3 | Photo log (Snap tab) → confirmation → save → dashboard update | `tests/e2e/photo-log.spec.ts` | 3.3 | Vision endpoint; I4 thumbnail-only; image compression; cache-tag round-trip |
| 4 | Library log → portion picker → save → undo | (covered as part of `library-edit.spec.ts` and `text-log.spec.ts` library-tab branch) | 3.3 + 3.4 | I7 fallback path; LIFO undo; library frequency-first ordering |
| 5 | Weight log → auto-recalc target (passes 5% threshold per recalc trigger) | `tests/e2e/weight-log.spec.ts` | 4.3b | F9 recalc surprise mitigation; nudge card; "see why" reuses HowWeCalculated |
| 6 | Library merge (non-undoable confirm dialog) | (covered in `library-edit.spec.ts`) | 4.1 | Tiebreaker #4: pessimistic NOT optimistic; ensures user sees no-undo affordance; FK repoint atomic |
| 7 | Library bulk-delete → undo within 5s (tombstone) | (covered in `library-edit.spec.ts`) | 4.1 | F8 tombstone pattern; cache invalidation |
| 8 | Account delete → cascade verification (zero-object DB sweep) | `tests/e2e/account-delete.spec.ts` | 5.2 | I9 ordering; double-confirm; zero-residue smoke |
| 9 | Weekly AI review generation + cache freshness (7d) | (covered in `progress-render.spec.ts` + integration `weekly-review-cache-reuse.test.ts`) | 4.3a | Sparse-data fallback; PPR Suspense island; cache reuse across dashboard + progress |
| 10 | Offline outbox: go offline → log entry → come online → verify replay with preserved client_id | `tests/e2e/offline-shell.spec.ts` (+ supporting `pwa-install.spec.ts`) | 5.1 | I11 replay-idempotency under realistic network state; F10 conflict resolution touchpoint |

**Additional supporting E2E specs** (not in the "10 critical" list but blocking):

| File | Source task | Purpose |
|---|---|---|
| `tests/e2e/landing-renders.spec.ts` | 1.1 | Smoke: masthead text visible at `/` |
| `tests/e2e/nav-responsive.spec.ts` | 1.2 | Nav shell at 375 / 768 / 1280; axe-core scan |
| `tests/e2e/axe-baseline.spec.ts` | 1.3 | axe on landing → zero serious/critical violations (validates the test wiring) |
| `tests/e2e/auth-magic-link.spec.ts` | 2.1 | Magic-link happy path with mailbox stub |
| `tests/e2e/auth-google-oauth.spec.ts` | 2.1 | Google OAuth happy path with mocked provider |
| `tests/e2e/dashboard-first-paint.spec.ts` | 3.5 | Critical flow #3 of the blueprint — PPR shell visible <1.5s on 4G throttle |
| `tests/e2e/copy-yesterday.spec.ts` | 3.4 | Multi-select copy-yesterday with new `client_id`s |
| `tests/e2e/library-edit.spec.ts` | 4.1 | Search + filter + sort + bulk delete + merge happy path |
| `tests/e2e/library-detail-edit.spec.ts` | 4.2 | Edit + log-now + delete from food detail page |
| `tests/e2e/progress-render.spec.ts` | 4.3a | Progress render at all 3 breakpoints + axe + visual baseline of heatmap |
| `tests/e2e/pwa-install.spec.ts` | 5.1 | Manifest + SW registration + install prompt |

**Parallelism + retries:**
- **Parallel workers:** 4 local / 2 CI (matches MVP hardware: single GitHub Actions runner with 2 vCPUs)
- **Retries:** 1 in CI (handles transient flake from Vercel preview cold starts), 0 local (every flake is a real failure to investigate)
- **Test timeout:** 30s default per test
- **Expect timeout:** 5s default for `expect(...)` polling

**Gating:**
- **Phase 1 (Foundation):** advisory — only `landing-renders` + `nav-responsive` + `axe-baseline` exist
- **Phase 2 (Auth + Onboarding):** blocking — auth flows + onboarding completion
- **Phase 3 (Dashboard + Log) onward:** **MERGE-BLOCKING** for every PR on `main`-targeting branches

### 2.6 Visual Regression (Playwright screenshots)

**Tool:** Playwright `expect(page).toHaveScreenshot(...)` snapshots, git-tracked under `tests/visual/__screenshots__/`.

**Scope:** 6 highest-signal screens × 3 breakpoints (375 / 768 / 1280) = **18 baseline screenshots**.

**Screens (per `design-doc.md §13` + `tasks.md` 5.1):**

| Screen | Variants captured | Source task |
|---|---|---|
| 1. Landing (`/` unauthed) | First-paint | 1.1 |
| 2. Dashboard (`/` authed) | First-time empty + normal seeded | 3.5 |
| 3. Log Modal | All 3 tabs (Type / Snap / Library) — captured separately | 3.3 |
| 4. Library | Default with grid + sample items | 4.1 |
| 5. Progress | Default with all 5 chart sections + heatmap | 4.3a |
| 6. Weekly Review (or Onboarding step 8 — choose one for the 6th screen) | Per-build choice; spec defaults to Weekly Review island full variant | 4.3a |

> **Screen #6 selection note:** The design-doc lists "Weight log" as the 6th screen; `tasks.md` 5.1 lists "Weight log". Both options are acceptable; the implementing team picks whichever is most visually load-bearing in the current build (default: Weight Log entry per the existing baseline). The spec's "Onboarding step 8" alternative captures the transparency panel and is also acceptable. Whichever is chosen, lock at Phase 5.1 baseline freeze.

**Baseline capture:** First green CI run on Linux (Chromium). Baselines are git-tracked. Updates require explicit commit with reviewer sign-off (no auto-update on flake).

**Tolerance:** <0.1% pixel diff per screenshot. Any higher → fails.

**Gating:**
- **Pre-Phase 3:** advisory (warns, does not block — prevents flake-blocked early-phase releases per `design-doc.md §13`)
- **Phase 3 onward:** blocking on every PR touching UI; baseline-update flow requires reviewer sign-off
- **Phase 5 (final shippable gate):** all 18 baselines locked; any drift blocks release

**Cross-browser visual regression:** Firefox + Safari run the same 18 baselines as a separate Playwright project (`visual-baseline`). Cross-browser drift is allowed up to 0.5% (font rendering differences across OS); >0.5% triggers investigation. Safari runs only the visual project, not the logic E2E project.

### 2.7 Accessibility (@axe-core/playwright)

**Tool:** `@axe-core/playwright` injected via `tests/axe/setup.ts` helper into every E2E spec.

**Scope:** Every E2E test runs an axe scan after the user reaches the asserted state. Not a separate suite — interleaved into E2E.

**Assertions:** **Zero `critical` or `serious` violations.** `moderate` and `minor` violations are logged (visible in CI summary) but do not fail the build.

**WCAG rules applied (WCAG 2.1 AA — per `ui-design.md §10` and ux-auditor's 21 clauses):**

1. **1.1.1** Non-text Content — every icon-only button has `aria-label`
2. **1.3.1** Info and Relationships — landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`), heading hierarchy, semantic structure per `ui-design.md §10.5`
3. **1.3.2** Meaningful Sequence — DOM order matches visual order (mobile reflow tested)
4. **1.4.3** Contrast (Minimum) — every color pair passes AA at its used text size; oxblood never as text; dust-2 never on bg-2
5. **1.4.4** Resize Text — body text scales to 200% without loss
6. **1.4.10** Reflow — no horizontal scroll at 320px viewport
7. **1.4.11** Non-text Contrast — 2px ivory focus ring (16.67:1 vs bg-0); UI elements ≥3:1
8. **1.4.13** Content on Hover or Focus — chart tooltips dismissible by Escape, persistent on focus
9. **2.1.1** Keyboard — every interactive element reachable; no keyboard trap
10. **2.1.2** No Keyboard Trap — modal focus trap escapable by Escape
11. **2.1.4** Character Key Shortcuts — `1/2/3/4` meal-slot jump is focus-scope guarded (only fires when ConfirmationScreen has focus)
12. **2.4.1** Bypass Blocks — skip link to `<main id="main-content" tabindex="-1">`
13. **2.4.3** Focus Order — tab order follows visual order
14. **2.4.6** Headings and Labels — descriptive headings; labels above inputs (not placeholder-only)
15. **2.4.7** Focus Visible — 2px ivory outline + 2px offset on every focusable element; never suppressed
16. **2.5.5** Target Size (AA) — 44×44px minimum on every interactive element; heatmap mobile cells 24×24 minimum (not the AAA 44×44 — accepted gap with documented rationale)
17. **3.1.1** Language of Page — `<html lang="en">` (i18n: vi locale post-MVP)
18. **3.2.2** On Input — no context change on input without warning
19. **3.3.1** Error Identification — `aria-invalid` + `aria-describedby` linking input to error
20. **3.3.2** Labels or Instructions — visible `<label for>` above every input
21. **4.1.2** Name, Role, Value — every custom widget has correct ARIA roles (per `ui-design.md §10.4`)

**Per-screen specific axe assertions:**

- **Dashboard:** keyboard navigation completeness (Tab cycles through chronometer → macros → meals → water → micros → weekly insight); `aria-current="page"` on active nav; chart `<details>` data-table drawer present
- **Log Flow:** WAI-ARIA tablist on tabs; ArrowLeft/Right between tabs; modal focus trap; first focus on tab content (not first tab pseudo-button)
- **Library:** grid role + cell roles; `/` shortcut focuses search; multi-select keyboard via Space; aria-pressed on selected cards
- **Progress:** range chips as tablist; heatmap as `role="grid"` with `aria-activedescendant`; tooltip aria-live polite
- **Onboarding:** focus first input on each step; `aria-describedby` on transparency panel toggle
- **Settings:** form-label association on every input; password reveal `aria-pressed` or `role="switch"`
- **Account Delete:** countdown announces via `aria-live="polite" aria-atomic="true"`; first focus on CANCEL (not DESTROY)

**Gating:** **Merge-blocking on every PR touching UI.** Zero serious or critical violations is the contract.

### 2.8 Lighthouse (advisory ≥90 mobile)

**Tool:** Lighthouse CI (`@lhci/cli`) against the deployed Vercel preview URL.

**Pages audited:** Dashboard, Log, Library, Progress, Login, Onboarding (results screen).

**Categories scored:**
- Performance ≥90 mobile
- Accessibility ≥90
- Best Practices ≥90
- SEO ≥90 (low-priority for authed app; tracked anyway)
- PWA — must pass `installable` audit (Phase 5 onward)

**Gating:**
- **Advisory only.** Failure reports but does not block merge (MVP stance per `design-doc.md §13`).
- Run: end-of-phase Testing Sweep + final Phase 5 validation sweep.
- If Lighthouse drops below 90 on any audited page, the Testing Sweep logs it as advisory; the Codex Adversarial Review (1.4 / 2.3 / 3.6 / 4.5 / 5.3) decides whether to escalate.

> **Drift guard** (per Task 5.4): if the team later promotes Lighthouse to blocking, update both `design-doc.md §13` and Task 5.4 simultaneously — do not let them drift.

### 2.9 AI Accuracy (Vitest snapshots via tiered gate)

**Tool:** Vitest snapshot tests against MSW-stubbed Gemini responses calibrated to expected nutrition; fixtures under `tests/fixtures/ai-accuracy/`.

**Tiered gate** (per Codex Round 1 M1 + Round 2 M1-R2):

#### 2.9.1 Critical tier — MERGE-BLOCKING per every PR touching `/api/ai/*`

**8 fixtures: 5 Vietnamese staples + 3 Western staples.**

| # | Tier | Fixture | Source |
|---|---|---|---|
| 1 | VN | phở bò (beef pho) | Task 3.2 vn-smoke |
| 2 | VN | bún chả (Hanoi grilled pork + rice noodles + dipping broth) — note: spec inherits from `tasks.md` "bún thịt nướng" (grilled pork rice noodles); use bún chả OR bún thịt nướng per fixture-author choice | Task 3.2 vn-smoke |
| 3 | VN | cơm tấm (broken rice with grilled pork) | Task 3.2 vn-smoke |
| 4 | VN | bánh mì (Vietnamese baguette with pâté + cold cuts) | Task 3.2 vn-smoke |
| 5 | VN | bún bò huế (Hue-style spicy beef noodle soup) | Task 3.2 vn-smoke |
| 6 | Western | 3 eggs on toast (with butter) | Task 5.1 western-smoke |
| 7 | Western | Large salad bowl (mixed greens + chicken + dressing) | Task 5.1 western-smoke |
| 8 | Western | Rotisserie chicken (1/4 bird with skin) | Task 5.1 western-smoke |

> **VN fixture #2 reconciliation:** `tasks.md` Task 3.2 names "bún thịt nướng" (grilled pork over rice noodles); the brainstorm spec for this artifact names "bún chả". Both are valid Hanoi noodle staples with similar nutrition profiles (grilled pork + rice noodles + nuoc cham). Implementer picks one; the canonical fixture file is `tests/fixtures/ai-accuracy/vn-smoke/bun-thit-nuong.json` per the architecture.md folder structure.

**Assertion thresholds (critical tier):**
- **kcal:** within ±15% of expected
- **macros (protein/carbs/fat):** within ±20% of expected
- **item count:** EXACT match (e.g., "2 items" must return 2 items, not 1 or 3)

**Fixture location:** `tests/fixtures/ai-accuracy/vn-smoke/` (5 files) and `tests/fixtures/ai-accuracy/western-smoke/` (3 files). Each fixture is a JSON file with shape:

```jsonc
// tests/fixtures/ai-accuracy/vn-smoke/pho.json
{
  "id": "vn-pho",
  "input": {
    "type": "text",
    "text": "phở bò tái nạm — bowl"
  },
  "expected": {
    "items": [{ "name": "phở bò tái nạm", "qty": 1, "unit": "bowl" }],
    "totals": {
      "kcal": 450,
      "protein_g": 28,
      "carbs_g": 60,
      "fat_g": 10
    },
    "tolerance": {
      "kcal_pct": 15,
      "macro_pct": 20
    }
  }
}
```

**Critical-tier registry:** `tests/fixtures/ai-accuracy/critical.ts` exports a typed array referencing the 8 fixtures. This is the **single source of truth for the tiered gate**. Task 3.2 creates the registry with the 5 VN fixtures; Task 5.1 extends it with the 3 Western staples. Task 5.4 enforces the gate.

**Run:** Every PR touching `/api/ai/*` runs `pnpm test tests/unit/ai/vn-smoke.test.ts` + `tests/integration/ai-accuracy-regression.test.ts --tier=critical`. Fail → no merge.

**Failure decision-tree** (must be documented in PR description):
1. **Fixture update** — only when ground-truth nutrition changes (e.g., new serving size, recipe correction). Justify in PR with source citation.
2. **Prompt adjustment** — modify `lib/ai/prompts.ts` to clarify intent.
3. **Model-version rollback** — revert `gemini-flash-latest` pin to a known-good prior version.

No silent merges. No "we'll fix it next PR." Critical tier failures block release.

#### 2.9.2 Advisory tier — named sign-off comment required in PR

**15+ fixtures.** Covers regional dishes, photo-specific edge cases, and ambiguous portions.

**Examples** (full list lives in `tests/fixtures/ai-accuracy/advisory/`):
- Regional VN: bún riêu (crab + tomato noodles), chả cá Lã Vọng, gỏi cuốn (fresh spring rolls), nem rán (fried spring rolls)
- Photo-specific: low-light photos of rice bowls, top-down vs angled shots, photos with utensils in frame
- Ambiguous portions: "a small amount of rice", "half a cup", "two slices"
- Edge cases: empty plate (zero-item), single ingredient (just an apple), meal with no clear category

**Assertion thresholds (advisory tier):**
- **kcal:** within ±20% of expected (looser than critical)
- **macros:** within ±30% of expected
- **item count:** fuzzy (±1 acceptable)

**Run:** Every PR touching `/api/ai/*` runs the advisory tier; on tolerance breach, PR MUST carry a named sign-off comment from the project lead recording:
- The breach (which fixture, observed values, expected values)
- Cause analysis (model drift, prompt regression, fixture quality)
- Accept/defer decision (merge with breach acknowledged, or block until prompt adjustment)

Single-owner project: sign-off is self-sign with a checklist comment in the PR. Format:

```
## AI accuracy advisory tier — sign-off

- [ ] Reviewed: [fixture-id] breached ±20% kcal tolerance (observed: 520 kcal; expected: 400 kcal; +30%)
- [ ] Cause: [model drift / prompt regression / fixture quality / other]
- [ ] Decision: [accept / block]
- [ ] Follow-up tracked at: [link to issue or note]
```

Merge remains BLOCKED until the comment is recorded.

#### 2.9.3 Drift detection (post-MVP visibility)

Each fixture run updates `ai_call_log` with the observed kcal/macros/item-count + the fixture id (added as a `notes` JSON field). A weekly report aggregates fixture-level drift (kcal/macros variance trend over the past 28 days). If drift > 10% over 4 weeks on any critical fixture, the team regenerates that fixture against the current Gemini production response (with manual ground-truth verification) and re-baselines.

**Implementation note:** the weekly drift report is a `pnpm script:ai-drift-report` command that queries `ai_call_log`; not automated alerting in MVP.

### 2.10 Offline / PWA Tests

**Tool:** Playwright (E2E) + Vitest (integration for outbox + IDB logic) + Lighthouse PWA audit subset.

**Scope:**

| Capability | Test | Source task |
|---|---|---|
| Service worker registration | `tests/e2e/pwa-install.spec.ts` | 5.1 |
| Manifest validity (name, theme_color, icons 192/512/maskable, display: standalone) | `tests/e2e/pwa-install.spec.ts` (Lighthouse PWA audit subset within E2E) | 5.1 |
| Installability (`beforeinstallprompt` flow) | `tests/e2e/pwa-install.spec.ts` | 5.1 |
| Offline outbox: mutations queue + replay preserves original `client_id` (I11 full contract) | `tests/integration/offline-outbox-replay-idempotency.test.ts` | 5.1 |
| Offline shell: dashboard renders from IDB cache | `tests/e2e/offline-shell.spec.ts` | 5.1 |
| Library-based log queues to outbox + flushes on reconnect | `tests/e2e/offline-shell.spec.ts` | 5.1 |
| IDB unavailable (Safari private mode) → online-only mode + toast | `tests/integration/idb-unavailable-fallback.test.ts` | 5.1 |
| Conflict resolution (LWW for library; goal-weight conflict) | `tests/integration/outbox-conflict-resolution.test.ts` | 5.1 |
| Reduced-motion audit (every `motion.*` honors `prefers-reduced-motion`) | `tests/integration/reduced-motion-audit.test.ts` | 5.1 |
| Cache-bust on deploy (build-hash in SW version string) | manual smoke at Phase 5 sweep | 5.4 |

**Gating:** Phase 5 merge-blocking. Pre-Phase 5: not run (no PWA shell yet).

---

## 3. Fixture Organization

### 3.1 Canonical tree

Per `architecture.md §5` (lines 907–925) — this IS the canonical layout, reconciled at Codex Round 2 M1-R2 to use `tests/fixtures/ai-accuracy/` (not `tests/ai-accuracy/fixtures/`):

```
tests/
├── fixtures/
│   ├── ai-accuracy/                        # Owned by Task 3.2; extended by Task 5.1
│   │   ├── critical.ts                     # SINGLE SOURCE OF TRUTH for tiered gate
│   │   ├── loader.ts                       # shared fixture loader utility (3.2 + 5.1)
│   │   ├── vn-smoke/                       # 5 VN critical fixtures (Task 3.2)
│   │   │   ├── pho.json
│   │   │   ├── bun-thit-nuong.json         # alias: bun-cha (per spec inheritance)
│   │   │   ├── com-tam.json
│   │   │   ├── banh-mi.json
│   │   │   └── bun-bo-hue.json
│   │   ├── western-smoke/                  # 3 Western critical fixtures (Task 5.1)
│   │   │   ├── eggs-on-toast.json
│   │   │   ├── large-salad.json
│   │   │   └── rotisserie-chicken.json
│   │   ├── advisory/                       # 15+ fixtures (Task 5.1)
│   │   │   ├── vn-bun-rieu.json
│   │   │   ├── vn-cha-ca-la-vong.json
│   │   │   ├── vn-goi-cuon.json
│   │   │   ├── vn-nem-ran.json
│   │   │   ├── western-pasta-carbonara.json
│   │   │   ├── ambiguous-small-rice.json
│   │   │   ├── ambiguous-half-cup.json
│   │   │   ├── edge-empty-plate.json
│   │   │   ├── edge-single-apple.json
│   │   │   └── [6+ additional fixtures]
│   │   └── photos/                         # photo fixtures (Task 5.1)
│   │       ├── vn-pho-bowl.jpg
│   │       ├── vn-com-tam-plate.jpg
│   │       ├── vn-banh-mi-wrapped.jpg
│   │       ├── western-eggs-toast-overhead.jpg
│   │       └── western-rotisserie-chicken-side.jpg
│   ├── rls/                                # 2-user fixture helpers (Task 1.2)
│   │   ├── two-user-setup.ts
│   │   └── service-role.ts                 # explicit service-role client for setup/teardown
│   └── seed/                               # local dev seeding only (NOT used in CI)
│       └── 14-day-dev-data.ts              # 14 days × 3-6 entries/day (Task 1.3)
├── unit/
│   ├── eslint-no-gemini-leak.test.ts
│   ├── eslint-no-inline-cache-tags.test.ts
│   ├── eslint-no-inline-user-strings.test.ts
│   ├── i18n-shape.test.ts
│   ├── tokens.test.ts
│   ├── edition-number.test.ts
│   ├── aggregate-day-tz.test.ts
│   ├── ai-cache-key.test.ts
│   ├── ai-sanitize.test.ts
│   ├── sparse-data-fallback.test.ts
│   ├── recalc-threshold.test.ts
│   ├── auto-recalc-trigger.test.ts
│   ├── normalize-name.test.ts
│   └── ai/
│       └── vn-smoke.test.ts                # Task 3.2 critical-tier driver
├── component/
│   └── (19 component test files per architecture.md §5 lines 819-838)
├── integration/
│   └── (38 integration test files per architecture.md §5 lines 839-877)
├── rls/
│   ├── _harness.ts
│   ├── _harness.test.ts
│   ├── profiles.spec.ts
│   ├── food-schema.spec.ts
│   ├── storage-bucket.spec.ts
│   └── weight-log.spec.ts
├── e2e/
│   └── (15 E2E spec files per architecture.md §5 lines 885-900)
├── visual/
│   └── __screenshots__/                    # 18 baselines (Task 5.1 freeze)
├── axe/
│   └── setup.ts                            # @axe-core/playwright injection helper
├── mocks/
│   ├── handlers.ts                         # MSW Gemini handlers (Task 1.3)
│   └── server.ts                           # MSW server bootstrap
└── setup.ts                                # global Vitest setup
```

### 3.2 Fixture loader utility (Task 3.2; shared across 3.2 smoke + 5.1 regression)

**File:** `tests/fixtures/ai-accuracy/loader.ts`

**Exports:**

```ts
export interface AccuracyFixture {
  id: string;
  tier: 'critical' | 'advisory';
  region: 'vn' | 'western';
  inputType: 'text' | 'photo';
  input: { type: 'text'; text: string } | { type: 'photo'; path: string };
  expected: {
    items: { name: string; qty: number; unit: string }[];
    totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    tolerance: { kcal_pct: number; macro_pct: number; itemCountFuzzy?: boolean };
  };
}

export function loadCriticalFixtures(): AccuracyFixture[];
export function loadAdvisoryFixtures(): AccuracyFixture[];
export function loadFixtureByName(name: string): AccuracyFixture;
export function loadAllFixtures(): AccuracyFixture[];
```

**Used by:**
- `tests/unit/ai/vn-smoke.test.ts` (Task 3.2 — drives critical-tier in CI gate)
- `tests/integration/ai-accuracy-regression.test.ts` (Task 5.1 — drives advisory-tier + photos)

**Codex Round 2 M1-R2 fix:** This loader is the canonical contract that prevents fixture path drift. If 3.2 and 5.1 ever diverge, the loader (single import path) catches it at compile time.

### 3.3 Fixture creation guidelines

When adding a new fixture to either tier:

1. **Source the ground truth.** For VN dishes, cross-reference at minimum two of: USDA FoodData Central, Vietnamese Ministry of Health nutrition tables, or a verified cookbook with weight-based portions.
2. **Capture the realistic input.** For text: the actual phrasing a user might type ("phở bò tái nạm — bowl", not "Vietnamese beef noodle soup with rare beef and brisket, one bowl"). For photos: the actual angle/lighting from a phone in an MVP user's hand.
3. **Set tolerance intentionally.** Critical tier defaults to ±15% kcal / ±20% macro. Advisory tier defaults to ±20% kcal / ±30% macro. If a fixture needs tighter tolerance (e.g., a single-ingredient apple), justify in the JSON's `notes` field.
4. **Register in `critical.ts` if critical-tier.** Failure to register = fixture is silently advisory. Code review must catch this.
5. **Include a `cause_analysis_notes` field** if the fixture is added to address a regression. Future drift detection cross-references this.

---

## 4. CI Gate Definitions (Blocking vs Advisory Matrix)

The single source of truth for what blocks merge vs what is advisory. Every PR is evaluated against this matrix; CI summary surfaces the result of every level.

| Level | Run on | Blocking from | Fail action | Owner task |
|---|---|---|---|---|
| **Lint (ESLint + tsc --noEmit)** | Every PR | Phase 1 | No merge | 1.1, 1.3 (rules), 2.1+ (typecheck) |
| **Unit + Component (Vitest)** | Every PR | Phase 1 | No merge | All tasks with logic |
| **Integration (Vitest + MSW)** | Every PR touching API/routes | Phase 2 (auth routes onward) | No merge | API/backend tasks |
| **RLS (Playwright black-box)** | Every PR touching DB or policies | Phase 1.2 (harness) onward | No merge | 1.2, 2.1, 3.1, 4.3b regression |
| **E2E (Playwright Chromium)** | Every PR on `main`-targeting branches | Phase 3 (first-usable) onward | No merge | Phase 3+ |
| **Visual Regression (Playwright)** | Every PR touching UI | Phase 3 onward | No merge + baseline-update flow | Phase 3+ |
| **Accessibility (axe-core in E2E)** | Every PR touching UI | Phase 1 onward (zero serious/critical) | No merge | Every UI task |
| **Lighthouse Mobile** | Per-phase Testing Sweep + final sweep | Never (advisory) | Report only | 5.4 (final sweep) |
| **AI Critical Tier** | Every PR touching `/api/ai/*` | Phase 3.2 onward (vn-smoke ships there) | No merge | 3.2 + 5.4 |
| **AI Advisory Tier** | Every PR touching `/api/ai/*` | Phase 5.1 onward | Named sign-off comment required | 5.1 + 5.4 |
| **Offline / PWA** | Every PR on `main` in Phase 5 | Phase 5 | No merge | 5.1 |
| **Coverage floor (≥70% branch)** | Every Phase Testing Sweep | Phase 1.5 onward | Block phase completion | All tasks |

### 4.1 Failure handling per level

- **Lint failure:** auto-fix via `pnpm lint --fix` if mechanical (formatting, simple rule). Behavior-bearing failures (e.g., I12 inline literal) require code change.
- **Unit/component failure:** investigate; fix the test if the production behavior changed intentionally; fix the code if the test caught a regression.
- **Integration failure:** check if MSW handler drift caused it (Gemini API stub out of sync); check if test DB schema migration is missing.
- **RLS failure:** **never bypass.** RLS regression is a security incident. Investigate the policy diff; fix the policy; re-run.
- **E2E failure:** check Vercel preview cold-start (single retry handles); check selectors stability; check seed data freshness.
- **Visual regression failure:** review the screenshot diff. If intentional, update baseline with reviewer sign-off. If unintentional, fix the CSS regression.
- **Accessibility failure:** the violation report names the rule + selector. Fix the violation; re-run. No suppression unless ux-auditor signs off on a documented gap.
- **Lighthouse failure:** advisory; log to PR comment. If mobile <90 on a high-traffic page (Dashboard, Log), file a polish task.
- **AI critical-tier failure:** apply the failure decision-tree (fixture update / prompt adjustment / model rollback) — see §2.9.1.
- **AI advisory-tier failure:** record sign-off comment per §2.9.2.

---

## 5. Playwright Configuration

Full starter `playwright.config.ts`:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = process.env.PREVIEW_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'e2e/**/*.spec.ts',
    'rls/**/*.spec.ts',
    'visual/**/*.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 4,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001, // 0.1% tolerance per design-doc §13
    },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['github'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    locale: 'en-US',
    timezoneId: 'Asia/Ho_Chi_Minh', // UTC+7 — matches MVP user TZ for day-boundary tests
    permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
  },
  projects: [
    // Default Chromium runs all E2E + RLS specs at desktop viewport
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ['e2e/**/*.spec.ts', 'rls/**/*.spec.ts'],
    },
    // Mobile + tablet variants for E2E that need responsive verification
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 375, height: 667 },
      },
      testMatch: ['e2e/dashboard-first-paint.spec.ts', 'e2e/text-log.spec.ts', 'e2e/photo-log.spec.ts', 'e2e/offline-shell.spec.ts', 'e2e/nav-responsive.spec.ts'],
    },
    {
      name: 'tablet-chromium',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
      },
      testMatch: ['e2e/nav-responsive.spec.ts', 'e2e/library-edit.spec.ts', 'e2e/progress-render.spec.ts'],
    },
    // Visual regression — Chromium primary baseline
    {
      name: 'visual-baseline-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['visual/**/*.spec.ts'],
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFilePath}/{arg}-1280-{projectName}{ext}',
    },
    {
      name: 'visual-baseline-chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      testMatch: ['visual/**/*.spec.ts'],
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFilePath}/{arg}-768-{projectName}{ext}',
    },
    {
      name: 'visual-baseline-chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } },
      testMatch: ['visual/**/*.spec.ts'],
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFilePath}/{arg}-375-{projectName}{ext}',
    },
    // Cross-browser visual regression (advisory drift up to 0.5%)
    {
      name: 'visual-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
      testMatch: ['visual/**/*.spec.ts'],
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
    },
    {
      name: 'visual-safari',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      testMatch: ['visual/**/*.spec.ts'],
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
    },
    // RLS project (separate to allow per-spec parallelism config)
    {
      name: 'rls',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['rls/**/*.spec.ts'],
      fullyParallel: false, // RLS tests share the 2-user fixture; serialize per spec
    },
  ],
  globalSetup: require.resolve('./tests/globalSetup.ts'),
  globalTeardown: require.resolve('./tests/globalTeardown.ts'),
  webServer: isCI ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

### 5.1 Global setup

**File:** `tests/globalSetup.ts`

Responsibilities:
- Reset Supabase test DB to clean state (drop + recreate user-owned tables; preserve `auth.users` schema; truncate `ai_response_cache` + `ai_call_log`)
- Provision the 2-user RLS fixture (`tests/fixtures/rls/two-user-setup.ts`) — creates user A + user B via Supabase admin API with confirmed emails; stores their JWTs in `process.env.RLS_USER_A_TOKEN` + `RLS_USER_B_TOKEN`
- Apply the dev seed data for the primary test user (`tests/fixtures/seed/14-day-dev-data.ts`) — only when running E2E (RLS tests use empty DB)
- Install MSW handlers via `tests/mocks/server.ts`

### 5.2 Global teardown

**File:** `tests/globalTeardown.ts`

Responsibilities:
- Drop user A + B from `auth.users` (cascade clears their RLS-isolated data)
- Truncate `ai_response_cache` + `ai_call_log`
- Stop MSW server

### 5.3 Snapshot path conventions

```
tests/visual/__screenshots__/<spec-name>/<test-name>-<breakpoint>-<project>.png
```

Example: `tests/visual/__screenshots__/dashboard.spec.ts/dashboard-first-paint-1280-visual-baseline-chromium.png`

Baselines are committed to git. Updates require explicit `pnpm test:visual --update-snapshots` followed by reviewer sign-off in PR.

---

## 6. MSW Handler Patterns

### 6.1 Handlers file

**File:** `tests/mocks/handlers.ts`

```ts
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import type { ParseResult } from '@/lib/ai/schemas';

export const handlers = [
  // /api/ai/text-parse — default success
  http.post('/api/ai/text-parse', async ({ request }) => {
    const body = await request.json() as { text: string; client_id?: string };
    // Test-controlled stub: tests override per-request
    return HttpResponse.json<ParseResult>({
      items: [{ name: 'phở bò', qty: 1, unit: 'bowl', kcal: 450, protein_g: 28, carbs_g: 60, fat_g: 10 }],
      totals: { kcal: 450, protein_g: 28, carbs_g: 60, fat_g: 10 },
      reasoning: 'Standard pho bowl estimate.',
    });
  }),
  // /api/ai/vision — default success
  http.post('/api/ai/vision', async ({ request }) => {
    return HttpResponse.json({
      items: [{ name: 'cơm tấm', qty: 1, unit: 'plate', kcal: 600, protein_g: 30, carbs_g: 80, fat_g: 18 }],
      totals: { kcal: 600, protein_g: 30, carbs_g: 80, fat_g: 18 },
      reasoning: 'Identified broken rice plate with grilled pork.',
    });
  }),
  // /api/ai/weekly-review — default success
  http.post('/api/ai/weekly-review', async ({ request }) => {
    return HttpResponse.json({
      summary: 'A week of consistent logging with strong protein coverage.',
      highlights: ['Hit calorie target 5/7 days', 'Vietnamese-leaning palette'],
    });
  }),
  // Supabase Storage signed-URL generation stub
  http.post('https://*.supabase.co/storage/v1/object/sign/food-thumbnails/*', async () => {
    return HttpResponse.json({ signedURL: '/test-stub/signed-url-placeholder' });
  }),
];
```

### 6.2 Per-test override patterns

Tests override default handlers using `server.use(...)` for failure modes:

```ts
// tests/integration/log-flow-fallback.test.ts
import { server } from '@/tests/mocks/server';
import { http, HttpResponse } from 'msw';

it('opens fallback form on Gemini timeout', async () => {
  server.use(
    http.post('/api/ai/text-parse', () => {
      return HttpResponse.error(); // simulates network failure
    })
  );
  // ... rest of test
});
```

For F12 forced-401 tests:

```ts
// tests/integration/ai-vision-refresh.test.ts
server.use(
  http.post('/api/ai/vision', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
);
// First request → 401; interceptor calls refreshSession() (mocked success) → retry
server.use(
  http.post('/api/ai/vision', () => HttpResponse.json(parseSuccess)),
); // 2nd handler wins on retry
```

### 6.3 Request-body assertions

MSW handlers can assert request shape inline. Critical assertions:

- **`client_id` header/body present on every mutation** (I11 enforcement at the test layer): every mutation handler asserts `body.client_id` is a UUID v4
- **`Authorization` header present on every protected route** (I6): handlers reject requests without bearer token
- **No `GEMINI_API_KEY` in any client request** (I3): handlers scan request headers + body for the key string and fail loudly if found

### 6.4 What NOT to mock

- **Supabase Postgres** — use the real test DB. RLS is the contract; mocking removes the very thing we're testing.
- **Supabase Auth (sign-in / sign-out)** — use the real test users (A + B from RLS harness). Mocking auth removes the JWT contract.
- **Server Actions** — exercised in-process via Next.js test handler harness; no MSW layer.
- **Local React state** — never. Use real React + Testing Library.

---

## 7. Coverage Targets + Reporting

### 7.1 Vitest coverage configuration

```ts
// vitest.config.ts (excerpt)
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx', 'components/**/*.tsx', 'eslint-rules/**/*.js'],
      exclude: [
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        'lib/**/*.types.ts',
        'lib/**/*.d.ts',
        'supabase/migrations/**',
        '**/index.ts', // re-export barrel files
        'next.config.ts',
        'tailwind.config.ts',
      ],
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
});
```

### 7.2 CI reporting

GitHub Actions uploads the coverage summary to the PR comment + Actions step summary:

```yaml
- name: Coverage report
  run: pnpm test --coverage
- name: Upload coverage artifact
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/
- name: Coverage summary in PR
  uses: davelosert/vitest-coverage-report-action@v2
  with:
    json-summary-path: coverage/coverage-summary.json
```

### 7.3 Coverage drop policy

A coverage drop of >2 percentage points between PRs (compared to base branch) triggers a Codex review comment requesting justification. Acceptable justifications:
- New scaffolding code that will be exercised by downstream tests (must reference downstream tasks)
- Type-only modules (no logic to test)
- Generated code (e.g., shadcn primitives that re-export shadcn defaults)

Unacceptable: "I'll add tests later." Ship the test with the code.

---

## 8. AI Accuracy Gate Tier Spec

(Cross-references §2.9 — this section is the canonical contract for the tiered gate per Tasks 3.2 and 5.4.)

### 8.1 Critical tier (merge-blocking)

- **8 fixtures:** 5 VN + 3 Western staples (enumerated in §2.9.1)
- **Run on:** every PR touching `/api/ai/*`
- **Thresholds:** kcal ±15%, macros ±20%, item count exact
- **Fail action:** no merge
- **Failure decision-tree (PR description must document):** fixture update (with source citation) / prompt adjustment / model-version rollback

### 8.2 Advisory tier (named sign-off)

- **15+ fixtures** covering regional + photo + edge cases
- **Run on:** every PR touching `/api/ai/*`
- **Thresholds:** kcal ±20%, macros ±30%, item count fuzzy (±1)
- **Fail action:** request "AI accuracy reviewed" sign-off comment from project lead (single-owner: self-sign with checklist)
- **Sign-off template:** see §2.9.2

### 8.3 Drift detection

- Each run updates `ai_call_log` with the observed values + fixture id
- Weekly report (`pnpm script:ai-drift-report`) aggregates fixture-level drift
- If any critical fixture drifts >10% over 4 weeks → regenerate against current Gemini production response with manual ground-truth verification + re-baseline

### 8.4 Tier promotion / demotion policy

A fixture can move between tiers:
- **Critical → Advisory:** if a critical fixture has drifted persistently and the underlying nutrition is genuinely ambiguous, the team can demote it after a documented analysis. Requires Codex review sign-off.
- **Advisory → Critical:** if an advisory fixture proves to be a high-frequency real-world dish AND has stable ground truth, it can be promoted. Requires updating `critical.ts` registry + commit explaining the promotion.

---

## 9. Mutation Evidence Principle

(Cross-references §1.4.)

### 9.1 The contract

Tests must fail when code is broken — not just pass when correct. Coverage measures lines run; mutation evidence measures lines that **matter**.

### 9.2 Phase-level enforcement

Each Phase Testing Sweep (Tasks 1.5, 2.4, 3.7, 4.6, 5.4) includes a manual mutation evidence step:

1. Pick three random files changed in the phase (from the phase's diff).
2. Mutate one line each:
   - Flip a boolean (`return true` → `return false`)
   - Add `+ 1` to a numeric return value
   - Hardcode a return value (`return computeTarget(...)` → `return 2000`)
3. Re-run the relevant test for each mutation.
4. Confirm the test fails. If the test passes despite the mutation, the test is fiction — fix it before closing the phase.
5. Revert the mutations.

### 9.3 Why manual (deferred Stryker)

Automated mutation testing (Stryker, mutmut equivalents for TS) takes 10-100× longer than the test suite to run. For a single-owner MVP with a 2-minute PR loop, the cost is not justified. Manual mutation evidence at phase boundaries is the contract for now.

Post-MVP, if the test suite grows to where manual mutation evidence becomes unreliable, integrate Stryker as a nightly job (not per-PR).

### 9.4 Mutation evidence anti-pattern detection

If a Phase Testing Sweep mutation finds that >2 of 3 random mutations don't break tests, the phase is in mutation-debt:
- Block phase completion
- File a "mutation-evidence-debt" task
- Either expand test coverage on the affected files OR remove the dead code that was supposedly tested

---

## 10. RLS Test Harness Setup

### 10.1 Module structure

`tests/rls/` directory:

```
tests/rls/
├── _harness.ts                  # 2-user setup + scoped clients (Task 1.2)
├── _harness.test.ts             # sanity test
├── helpers.ts                   # asUserA / asUserB wrappers
├── profiles.spec.ts             # 4 verbs × 2 directions
├── food-schema.spec.ts          # 4 verbs × 5 user-owned tables × 2 + service-role checks
├── storage-bucket.spec.ts       # food-thumbnails path-based ownership
└── weight-log.spec.ts           # regression check (Task 4.3b)
```

### 10.2 `_harness.ts` (fixture)

```ts
// tests/rls/_harness.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ADMIN_URL = process.env.SUPABASE_TEST_URL!;
const ADMIN_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY!;

export interface RlsHarness {
  admin: SupabaseClient;
  userA: { id: string; jwt: string; client: SupabaseClient };
  userB: { id: string; jwt: string; client: SupabaseClient };
  teardown: () => Promise<void>;
}

export async function setupRlsHarness(): Promise<RlsHarness> {
  const admin = createClient(ADMIN_URL, ADMIN_KEY, { auth: { persistSession: false } });

  // Create user A
  const { data: aData, error: aErr } = await admin.auth.admin.createUser({
    email: `test-user-a-${Date.now()}@kalori.test`,
    password: 'a-strong-password-for-rls-tests',
    email_confirm: true,
  });
  if (aErr || !aData.user) throw new Error(`Failed to create user A: ${aErr?.message}`);

  // Create user B
  const { data: bData, error: bErr } = await admin.auth.admin.createUser({
    email: `test-user-b-${Date.now()}@kalori.test`,
    password: 'b-strong-password-for-rls-tests',
    email_confirm: true,
  });
  if (bErr || !bData.user) throw new Error(`Failed to create user B: ${bErr?.message}`);

  // Sign in each to get JWTs
  const aSignIn = await admin.auth.signInWithPassword({
    email: aData.user.email!,
    password: 'a-strong-password-for-rls-tests',
  });
  const bSignIn = await admin.auth.signInWithPassword({
    email: bData.user.email!,
    password: 'b-strong-password-for-rls-tests',
  });

  // Build per-user clients carrying their JWT
  const userAClient = createClient(ADMIN_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${aSignIn.data.session!.access_token}` } },
  });
  const userBClient = createClient(ADMIN_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bSignIn.data.session!.access_token}` } },
  });

  return {
    admin,
    userA: { id: aData.user.id, jwt: aSignIn.data.session!.access_token, client: userAClient },
    userB: { id: bData.user.id, jwt: bSignIn.data.session!.access_token, client: userBClient },
    teardown: async () => {
      await admin.auth.admin.deleteUser(aData.user.id);
      await admin.auth.admin.deleteUser(bData.user.id);
    },
  };
}
```

### 10.3 `helpers.ts` (per-test wrappers)

```ts
// tests/rls/helpers.ts
import type { RlsHarness } from './_harness';

export async function expectUserCannotRead(harness: RlsHarness, table: string, otherUserId: string) {
  const { data, error } = await harness.userB.client.from(table).select('*').eq('user_id', otherUserId);
  expect(error).toBeNull(); // RLS returns empty, not error
  expect(data).toEqual([]); // user B sees nothing
}

export async function expectUserCannotInsert(harness: RlsHarness, table: string, mismatchedUserId: string, payload: Record<string, unknown>) {
  const { error } = await harness.userB.client.from(table).insert({ ...payload, user_id: mismatchedUserId });
  expect(error).toBeTruthy();
  expect(error?.code).toMatch(/^(42501|PGRST)/); // RLS denial codes
}

export async function expectUserCannotUpdate(harness: RlsHarness, table: string, otherRowId: string, patch: Record<string, unknown>) {
  const { data, error } = await harness.userB.client.from(table).update(patch).eq('id', otherRowId).select();
  expect(error).toBeNull(); // RLS returns 0 rows, not error
  expect(data).toEqual([]);
}

export async function expectUserCannotDelete(harness: RlsHarness, table: string, otherRowId: string) {
  const { data, error } = await harness.userB.client.from(table).delete().eq('id', otherRowId).select();
  expect(error).toBeNull();
  expect(data).toEqual([]);
}
```

### 10.4 Per-spec template

```ts
// tests/rls/profiles.spec.ts
import { test, expect } from '@playwright/test';
import { setupRlsHarness } from './_harness';
import { expectUserCannotRead, expectUserCannotInsert, expectUserCannotUpdate, expectUserCannotDelete } from './helpers';

test.describe('profiles RLS — 4 verbs × 2 directions = 8 assertions', () => {
  let harness: Awaited<ReturnType<typeof setupRlsHarness>>;
  test.beforeAll(async () => { harness = await setupRlsHarness(); });
  test.afterAll(async () => { await harness.teardown(); });

  test('user A can read own profile (own ✅)', async () => {
    const { data, error } = await harness.userA.client.from('profiles').select('*').eq('id', harness.userA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('user B cannot read user A profile (other ❌)', async () => {
    await expectUserCannotRead(harness, 'profiles', harness.userA.id);
  });

  // INSERT (own / other) — etc.
  // UPDATE (own / other) — etc.
  // DELETE (own / other) — etc.
});
```

### 10.5 Total assertion derivation

(Cross-references §2.4.)

```
profiles.spec.ts         8 (4 verbs × 2)
food-schema.spec.ts:
  food_entries:          8
  food_library_items:    8
  weight_log:            8
  water_log:             8
  weekly_reviews:        8
  ai_response_cache:     2 (service-role-only access denial)
  ai_call_log:           2
storage-bucket.spec.ts:  8
weight-log.spec.ts:      8 (regression overlap with food-schema's weight_log; both run separately to catch regression at Phase 4 API wire-up)
─────────────────────────
Total runs:             58 (+ 8 regression overlap)
Effective unique:       58
```

### 10.6 Teardown discipline

Every spec uses `beforeAll` + `afterAll` to provision and tear down its own 2-user harness. Tests do NOT share users across spec files. This trades a few seconds of setup time for total isolation — a flaky test in `food-schema.spec.ts` cannot pollute `weight-log.spec.ts`.

If tests need to run faster locally, a `pnpm test:rls --reuse-users` flag can opt into a single-fixture mode for dev iteration. CI always uses fresh users per spec.

---

## 11. GitHub Actions CI Skeleton

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm tsc --noEmit
      - name: Gemini key leak guard
        run: |
          if grep -rE 'process\.env\.GEMINI_API_KEY' app/\(app\)/ app/\(marketing\)/ app/\(auth\)/ components/ 2>/dev/null; then
            echo "I3 violation: GEMINI_API_KEY referenced from client/marketing/(app) code"
            exit 1
          fi

  unit-component:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --coverage
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }
      - name: Coverage summary
        uses: davelosert/vitest-coverage-report-action@v2
        with: { json-summary-path: coverage/coverage-summary.json }

  integration:
    runs-on: ubuntu-latest
    needs: lint
    env:
      SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
      SUPABASE_TEST_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
      GEMINI_TEST_API_KEY: ${{ secrets.GEMINI_TEST_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Reset test DB
        run: pnpm db:reset:test
      - run: pnpm test:integration

  rls:
    runs-on: ubuntu-latest
    needs: lint
    env:
      SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
      SUPABASE_TEST_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:rls

  e2e:
    runs-on: ubuntu-latest
    needs: [unit-component, integration]
    if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'
    env:
      PREVIEW_URL: ${{ secrets.PREVIEW_URL_OVERRIDE || 'http://localhost:3000' }}
      SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
      SUPABASE_TEST_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - name: Build
        run: pnpm build
      - name: E2E (Chromium)
        run: pnpm test:e2e --project=chromium --project=mobile-chromium --project=tablet-chromium
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report/ }

  visual:
    runs-on: ubuntu-latest
    needs: [unit-component]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm build
      - name: Visual regression (Chromium baseline)
        run: pnpm test:visual --project=visual-baseline-chromium --project=visual-baseline-chromium-tablet --project=visual-baseline-chromium-mobile
      - name: Visual regression (Firefox + Safari, advisory)
        continue-on-error: true
        run: pnpm test:visual --project=visual-firefox --project=visual-safari

  ai-critical:
    runs-on: ubuntu-latest
    needs: lint
    if: contains(github.event.pull_request.changed_files, 'app/api/ai/') || contains(github.event.pull_request.changed_files, 'lib/ai/')
    env:
      GEMINI_TEST_API_KEY: ${{ secrets.GEMINI_TEST_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test tests/unit/ai/vn-smoke.test.ts
      - run: pnpm test:integration tests/integration/ai-accuracy-regression.test.ts -- --tier=critical

  ai-advisory:
    runs-on: ubuntu-latest
    needs: lint
    if: contains(github.event.pull_request.changed_files, 'app/api/ai/') || contains(github.event.pull_request.changed_files, 'lib/ai/')
    continue-on-error: true # advisory; signed-off via PR comment
    env:
      GEMINI_TEST_API_KEY: ${{ secrets.GEMINI_TEST_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration tests/integration/ai-accuracy-regression.test.ts -- --tier=advisory
      - name: Post advisory results to PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            // Post comment with advisory tier results requesting sign-off
            // (script body omitted for brevity; renders fixture-by-fixture variance)

  lighthouse:
    runs-on: ubuntu-latest
    needs: e2e
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    continue-on-error: true # advisory
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Lighthouse CI
        run: pnpm exec lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

### 11.1 Required secrets

| Secret | Used by | Purpose |
|---|---|---|
| `SUPABASE_TEST_URL` | integration, RLS, E2E | Test project URL |
| `SUPABASE_TEST_ANON_KEY` | integration, RLS, E2E | Anon key for browser-equivalent test calls |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | integration, RLS, E2E | Admin key for harness setup/teardown only |
| `GEMINI_TEST_API_KEY` | ai-critical, ai-advisory | Gemini key with the test project's quota |
| `PREVIEW_URL_OVERRIDE` (optional) | E2E | Override for running E2E against a specific Vercel preview |
| `LHCI_GITHUB_APP_TOKEN` | lighthouse | Lighthouse CI app integration |

---

## 12. Per-Task Test Level Matrix (Tier 2)

Cross-references each `tasks.md` task to the test levels required at the per-task gate. Phase Testing Sweeps run all blocking levels regardless of per-task tagging.

Legend: ✓ = required; ~ = advisory; — = not applicable; § = covered by phase sweep only.

| Task | Complexity | Tags | Unit | Component | Integration | RLS | E2E | Visual | A11y | AI Critical | AI Advisory | Offline/PWA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 Scaffold | Complex | infra, design | ✓ (eslint-no-gemini-leak) | — | ✓ (sentry-init) | — | ✓ (landing-renders) | ~ | ~ | — | — | — |
| 1.2 Supabase init + RLS harness + nav | Complex | infra, db, design, UI, testing | ✓ (tokens) | ✓ (sidebar/bottom-tab/fab) | ✓ (rls-harness) | ✓ (sanity) | ✓ (nav-responsive ×3) | ✓ (3 nav baselines) | ✓ | — | — | — |
| 1.3 Test harness + MSW + cache-tags | Complex | testing, infra | ✓ (eslint, i18n, tags) | — | ✓ (msw-gemini) | — | ✓ (axe-baseline) | — | ✓ | — | — | — |
| 1.4 Codex Review (Foundation) | Review | review | § | § | § | § | § | § | § | — | — | — |
| 1.5 Phase Sweep (Foundation) | Review | testing | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | — | — | — |
| 2.1 Auth + profiles + RLS + Mifflin + F12 interceptor | Complex | backend, API, db, UI, integration | ✓ (mifflin/tdee/target/recalc) | ✓ (LoginForm) | ✓ (auth-refresh-retry, middleware) | ✓ (profiles ×8) | ✓ (auth-magic-link, auth-google) | ~ | ✓ | — | — | — |
| 2.2 Onboarding wizard | Complex | UI, integration | ✓ (imperial-metric) | ✓ (8 steps + HowWeCalculated) | ✓ (profile-save) | — | ✓ (onboarding-completion) | ✓ (results screen) | ✓ | — | — | — |
| 2.3 Codex Review (Auth+Onboarding) | Review | review | § | § | § | § | § | § | § | — | — | — |
| 2.4 Phase Sweep (Auth+Onboarding) | Review | testing | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | ✓ all | — | — | — |
| 3.1 Food schema + RLS + client_id | Complex | db, backend, testing | — | — | ✓ (client-id-idempotency) | ✓ (food-schema ×40 + storage ×8 + service-role ×2) | — | — | — | — | — | — |
| 3.2 Gemini routes + Zod + cache + cost log + F11 | Complex | API, backend, integration | ✓ (cache-key, sanitize, vn-smoke) | — | ✓ (3 ai routes + 3 refresh + fallback + cache-ttl + call-log + ai-text-parse-refresh) | — | — | — | — | ✓ (5 VN smoke ships here, merge-blocking) | — | — |
| 3.3 3-tab log flow + image compression | Complex | UI, integration | ✓ (compress) | ✓ (3 tabs + ManualEntryFallback) | ✓ (log-flow-fallback, log-flow-refresh ×3) | — | ✓ (text-log, photo-log) | ✓ (log modal × 3 tabs) | ✓ | — | — | — |
| 3.4 Confirmation + dedup + undo (LIFO 5s) + copy-yesterday | Complex | UI, API, backend, integration | ✓ (normalize-name) | ✓ (UndoToast, ConfirmationScreen) | ✓ (entries-save-idempotency, entries-save-refresh, cache-tag-roundtrip) | — | ✓ (undo-toast, copy-yesterday) | ✓ (log confirmation × 3) | ✓ | — | — | — |
| 3.5 Dashboard + chronometer + macros + meals + water + micros | Complex | UI, backend, design | ✓ (edition-number, aggregate-day-tz, display-micros) | ✓ (Chronometer, MealsBulletin, WaterTracker) | ✓ (dashboard-cache-tag, water-log-refresh) | — | ✓ (dashboard-first-paint) | ✓ (dashboard × 3) | ✓ | — | — | — |
| 3.6 Codex Review (Dashboard+Log) | Review | review | § | § | § | § | § | § | § | § | § | — |
| 3.7 Phase Sweep (Dashboard+Log) — FIRST-USABLE | Review | testing | ✓ all | ✓ all | ✓ all | ✓ all (28 + 8 storage + 2 service-role = 38; + profiles 8 = 46) | ✓ all | ✓ all | ✓ all | ✓ critical | — | — |
| 4.1 Library grid + search + sort + bulk delete + merge | Complex | UI, API, backend | ✓ (filter-sort permutations) | ✓ (LibraryGrid, MergeDuplicates, ThumbnailLetterMark) | ✓ (library-merge, merge-refresh, bulk-delete-refresh) | — | ✓ (library-edit) | ✓ (library × 3) | ✓ | — | — | — |
| 4.2 Food detail + edit + log-now + delete | Medium | UI, API, backend | — | ✓ (FoodDetail) | ✓ (library-update-refresh, library-delete-refresh) | — | ✓ (library-detail-edit) | ~ | ✓ | — | — | — |
| 4.3a Progress D/W/M + weekly review island + sparse-data fallback | Complex | UI, backend, integration | ✓ (sparse-data-fallback) | ✓ (Heatmap, WeeklyInsightCard, WeeklyReviewIsland) | ✓ (weekly-review-tz-rollover, weekly-review-cache-reuse) | — | ✓ (progress-render) | ✓ (progress + heatmap × 3) | ✓ | — | — | — |
| 4.3b Weight log + auto-recalc + nudge | Medium | UI, backend, db, integration | ✓ (recalc-threshold, auto-recalc-trigger) | ✓ (WeightQuickAdd, TargetUpdatedNudge, WeightTrajectoryLine) | ✓ (weight-log-recalc, weight-log-idempotency, weight-log-refresh, weight-quick-add-rollback) | ✓ (weight-log regression) | ✓ (weight-log) | ~ | ✓ | — | — | — |
| 4.5 Codex Review (Library+Progress) | Review | review | § | § | § | § | § | § | § | § | § | — |
| 4.6 Phase Sweep (Library+Progress) | Review | testing | ✓ all | ✓ all | ✓ all | ✓ all (58) | ✓ all | ✓ all | ✓ all | ✓ critical | — | — |
| 5.1 PWA + offline IDB + SW + reduced-motion + AI accuracy fixtures + visual baseline freeze | Complex | infra, UI, testing | ✓ (outbox-conflict table-driven) | ✓ (OfflineBadge, OfflineIndicatorToast) | ✓ (offline-outbox-replay-idempotency, outbox-conflict-resolution, idb-unavailable, reduced-motion, ai-accuracy-regression) | — | ✓ (pwa-install, offline-shell) | ✓ (18 baselines locked) | ✓ | ✓ critical (extends with 3 Western) | ✓ advisory (15+ fixtures) | ✓ |
| 5.2 Cross-tab undo + cross-tab sign-out + export ZIP + account delete | Complex | backend, API, UI, integration | — | — | ✓ (undo-cross-tab, cross-tab-signout, account-delete-cascade, export-zip) | — | ✓ (account-delete) | ~ | ✓ | — | — | — |
| 5.3 Codex Review (Polish+PWA) | Review | review | § | § | § | § | § | § | § | § | § | § |
| 5.4 Phase Sweep (Polish+PWA) — FINAL SHIPPABLE | Review | testing | ✓ all | ✓ all | ✓ all | ✓ all (58) | ✓ all | ✓ all (18) | ✓ all | ✓ critical | ✓ advisory (sign-off) | ✓ all |

### 12.1 Tasks with no clear test level requirement (flagged for follow-up)

After cross-checking all 26 tasks:
- **No tasks lack a test level requirement.** Every implementation task names at least one test file in its AC; every Review task is gated by Phase Sweep regression.
- **Soft flags worth noting at execution time:**
  - **Task 4.2** (Medium, food detail) — only one component test cited (FoodDetail.test.tsx) plus 2 refresh integration tests. The Medium complexity is appropriate; if scope grows during implementation (e.g., inline-edit complexity), promote to Complex and add component tests for editor states.
  - **Task 5.2** (Complex, multi-feature) — covers 4 distinct features (cross-tab undo, cross-tab sign-out, export, account delete) with 4 integration + 1 E2E test. Consider splitting into 5.2a/5.2b if scope-creep emerges; current plan accepts the density.
  - **Task 1.5 / 2.4 / 3.7 / 4.6 / 5.4** Phase Sweeps — explicitly cross-cutting; no per-task test files but they re-run all blocking-tier suites. Sweep is the test.

---

## 13. Testing Philosophy + Anti-Patterns

Cross-references `~/.claude/rules/testing.md` + `ui-design.md §10` accessibility rules + `design-doc.md §13` matrix. The do's and don'ts that apply across every test level.

### 13.1 Do's

- **Test behavior, not implementation.** Assert "user sees the entry on the dashboard after saving", not "saveEntry() calls supabase.from('food_entries').insert(...)".
- **Use real DB for integration.** Supabase Postgres is mockable; that's the trap. RLS is the contract; mock it and you're testing nothing.
- **Run a11y on every E2E.** No "we'll add axe later." If the screen ships, it ships with axe.
- **Name tests by behavior.** `'user can undo a delete within 5s'` beats `'testDelete1'`. When a test name is hard to write because the behavior is unclear, the design is unclear.
- **Generate `client_id` on the client.** Never let the server fabricate one for the optimistic row. The whole point of I11 is that the client owns the identity.
- **TDD: fail-for-the-right-reason.** Run the new test, watch it fail, READ the failure message. If it failed because of a typo, fix the typo first.
- **Phase Testing Sweep is non-negotiable.** Even if every per-task gate is green, the sweep catches integration drift and mutation debt.

### 13.2 Don'ts

- **Don't mock the DB.** Use the real test DB with RLS enforced. The cost is a few seconds of setup per test; the value is catching the regression that mocking hides.
- **Don't skip a11y for "visual-only" changes.** A color tweak can break contrast; a layout tweak can break focus order. Run axe.
- **Don't merge if any critical/serious axe violation.** The contract is zero. There is no "fix later" path.
- **Don't paraphrase test names.** `'testFoo'` is debt. Behavior description.
- **Don't share fixtures across spec files.** A flaky test in spec A pollutes spec B if they share a 2-user fixture. Re-provision per spec.
- **Don't write tests AFTER code.** TDD is mandatory per `~/.claude/rules/testing.md`. Subagents that ship implementation without a failing test first violate the contract; reject their output.
- **Don't suppress failed tests with `.skip`.** If a test is broken, fix it. If a test is flaky, fix it. If a test is wrong, delete it. `.skip` is debt forever.
- **Don't grow the E2E count for the sake of "more coverage".** Each E2E is expensive; the 10 critical flows are the contract. New flows require explicit Codex review sign-off.
- **Don't conflate test count with test value.** 100 unit tests on a getter prove nothing. One integration test that asserts the cache-tag round-trip catches a class of bugs.
- **Don't let coverage drop unchecked.** A 2-percentage-point drop triggers Codex review. No silent regression.

### 13.3 Tests are a design surface

When a test is hard to write, the code is shaped wrong. Examples from the Kalori codebase:

- **If `recalcTargetIfNeeded` needs 5 mocks and a callback, refactor to a pure function** (which is exactly what Task 4.3b does — it composes the Task 2.1 modules without I/O).
- **If `<UndoToast />` test needs to mock the timer + the route navigation + the BroadcastChannel, refactor to a hook** (`useUndoable` headless primitive per `ui-design.md §4.5`).
- **If RLS test needs to mock the JWT, you're missing the point** — use a real authenticated client.

---

## 14. Residual Risks

References R1 from `tasks.md` preamble + adds testing-specific risks discovered during this artifact's drafting.

### R1 — Task 2.1 density (carried from `tasks.md`)

Task 2.1 owns auth flows, profiles, RLS, middleware, Mifflin/TDEE/target calc modules, AND the F12 refresh-and-retry interceptor. Test impact: Phase 2 testing burden is concentrated in one task. Mitigation: tests are written incrementally per the Steps order (Mifflin first, then RLS, then F12); each is independently green before moving on.

### R-T1 — AI accuracy fixtures need periodic regeneration

As Gemini evolves (model version updates, prompt tuning), critical-tier fixtures may drift even when the underlying ground truth hasn't changed. MVP has **no automated detection** for this — only the manual weekly drift report (§8.3). Mitigation: every 4 weeks, run `pnpm script:ai-drift-report` and review the variance trend; regenerate critical fixtures if drift >10%.

### R-T2 — Visual regression baselines may drift across OS

Font rendering (especially Newsreader serif optical sizing) differs subtly across Linux (CI), macOS (dev), and Windows. Cross-browser visual regression accepts up to 0.5% drift. Mitigation: baseline capture happens in CI Linux only; dev iterations use `pnpm test:visual --update-snapshots` only when the change is intentional + reviewer-confirmed.

### R-T3 — Supabase cloud test DB rate limits

Supabase free tier has rate limits on auth + DB calls. Running RLS + integration suites in parallel can throttle. Mitigation: integration tests run serially in CI for now (`workers: 2` for Playwright; Vitest integration uses `--no-isolate` + `--pool-options.threads.singleThread`). If throttle becomes a blocker, upgrade to Supabase Pro tier or self-host a local Postgres + Supabase shadow for CI (deferred decision; revisit if seen in practice).

### R-T4 — F12 interceptor test surface relies on MSW forced-401 fidelity

The 7 endpoint-specific F12 tests (§2.3) all force a 401 via MSW. If MSW interception doesn't reach the actual fetch wrapper (e.g., Server Action native fetch), the test is fictitious. Mitigation: the core test (`auth-refresh-retry.test.ts`) exercises the contract against `/api/profile/save` with a real fetch path; if MSW interception breaks, that test breaks first and surfaces the wiring failure.

### R-T5 — Mutation evidence is manual; humans skip it

The Phase Testing Sweep mutation evidence step (§9.2) is human-driven. Under deadline pressure, it gets skipped. Mitigation: Phase Sweep checklists include the mutation step as an explicit checkbox; Codex Adversarial Review (Task 1.4 / 2.3 / 3.6 / 4.5 / 5.3) checks that the checkbox was honored.

### R-T6 — `tests/visual/__screenshots__/` creates large git history

Each baseline is ~50-200KB. 18 baselines × 3 viewports × 1-2 update cycles per phase = ~10-30 MB over the project lifetime. Acceptable for MVP. Post-MVP: consider Git LFS for screenshots if repo size exceeds 100MB.

### R-T7 — RLS regression on policy refactor

If a future task refactors RLS policies (e.g., extracting common predicates into a function), the RLS test suite must catch the regression. Current 58-assertion suite is the primary defense; supplement with a quarterly manual audit comparing live policies against `architecture.md §3` documented policies.

### R-T8 — Photo fixtures are physically large + privacy-sensitive

Photo fixtures under `tests/fixtures/ai-accuracy/photos/` are JPGs (~500KB each). 5 photos × 1MB = 5MB committed to git. Use stock/CC-licensed photos only; never user-submitted images. Document provenance in a `tests/fixtures/ai-accuracy/photos/PROVENANCE.md` file (one-liner per photo with source URL + license).

### R-T9 — Lighthouse advisory may mask perf regressions

Because Lighthouse is advisory (not blocking), a perf regression can land if the team ignores the advisory output. Mitigation: Phase Testing Sweeps log Lighthouse scores; Codex review at end-of-phase compares against prior sweep; >5-point drop triggers a polish task.

### R-T10 — Single-owner sign-off on AI advisory tier is self-policed

Advisory tier requires "named sign-off comment from the project lead" — for a single-owner project, this is self-sign. The sign-off contract degenerates to a checklist comment. Mitigation: the checklist (§2.9.2) forces the owner to record the cause analysis explicitly; future contributor sees the trail.

---

## End of `testing-strategy.md`

> **Next step:** Step 6.7 Artifact #6 — `Planning/progress.md` (initial tracking template with R1 residual prominent at top).
