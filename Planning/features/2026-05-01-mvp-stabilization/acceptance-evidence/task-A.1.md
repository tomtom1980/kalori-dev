# Task A.1 — Acceptance Evidence (Lean form)

> **Status: HALTED — Implementation Fix Circuit Breaker**
> Generated: 2026-05-01 18:18 GMT+7
> See `Planning/.tmp/task-A.1-output.md` for full diagnosis.

---

## Pre-implementation deviation note

### Layer 1 — File divergence (from `Planning/.tmp/task-A.1-tracer-findings.md` "C-FILE-DIVERGENCE Reconciliation", quoted verbatim)

> Card-prescribed files that DO NOT exist in HEAD (do NOT create unless explicitly justified):
>
> - `app/(app)/library/_components/new-item-form.tsx` — does not exist; no separate "new-item" form in the Library UI
> - `app/api/library/route.ts` — does not exist; only sub-routes (`[id]/`, `bulk-delete/`, `merge/`, `dedup-check/`)
> - `lib/library/create-item.ts` — does not exist; insert logic owned by `/api/entries/save`
>
> **Actual save-to-library path (HEAD):** `ConfirmationScreen.tsx` save toggle → `authFetch('/api/entries/save', …)` → `app/api/entries/save/route.ts` `save_to_library:true` branch (lines 317-353) → INSERT into `food_library_items` → `revalidateTag(TAGS.userLibrary(uid))` at line 341.

### Layer 2 — Reconciled-fix infeasibility (NEW finding by Step 2 implementation sub-agent, not in tracer or briefing)

The briefing reconciles the card to a "wrap `fetchLibraryPage` in `'use cache'` + `cacheTag(TAGS.userLibrary(uid))`" fix. Pre-implementation reading of `next.config.ts:22-31`, `lib/dashboard/fetch.ts:7-22`, and `lib/aggregations/progress-fetch.ts:7-29` reveals this fix cannot ship on this codebase as-is:

1. `next.config.ts` deliberately runs with `cacheComponents: false` ("Migrating all 9 routes is out of scope for 3.5"). The `'use cache'` directive REQUIRES `cacheComponents: true` and will fail the build / runtime-error if encountered.
2. Two prior project tasks (Task 3.7 dashboard, Task 4.3a progress) attempted the equivalent migration with `unstable_cache` and reverted after Next.js 16 hard-errored on `cookies()` inside the cache lambda. Both files now run on React `cache()` only with `revalidateTag` calls kept as forward-compat no-ops.
3. `lib/library/fetch.ts:14-23` is in the exact same shape and explicitly anticipates this migration as "Phase 5 deferred."
4. `app/(app)/library/page.tsx:26` `force-dynamic` page directive means every navigation produces a fresh fetch — newly inserted rows ARE visible on the next render. The "asymmetry" the briefing identifies is structurally benign under the current cache mode.

**Conclusion:** the reported issuelog #4 ("newly added items not saved to library") cannot be a cache-asymmetry bug under the current architecture. The actual root cause must be elsewhere (briefing §9 lists candidates as out-of-scope: source-guard at `route.ts:317`, swallowed insert failure at lines 342-351, dedup-poisoning on whitespace names, etc.).

### Reason for divergence

The card was authored against an idealized architecture where Library has its own POST endpoint and create form. HEAD has neither — save-to-library is a flag on `/api/entries/save`. The Step 1.5 briefing reconciled the file surface but inherited the tracer's framing of the bug as cache-asymmetry. The Step 2 implementation pass adds a SECOND layer of divergence: the bug isn't where the tracer thought, AND the prescribed fix structurally cannot ship.

---

## Status

**Pre-implementation deviation recorded. ACs to verify:**

- AC1 (integration round-trip) — **NOT AUTHORED**. Authoring an AC1 RED test that proves cache asymmetry would either mock `revalidateTag` (forbidden by briefing) or pass on HEAD (because page is `force-dynamic`). Cannot RED-for-the-right-reason.
- AC2 (E2E click-through) — **NOT AUTHORED**. The user-visible bug is real (per issuelog #4) but the briefing's prescribed code path doesn't reproduce it. Authoring an E2E spec without a known reproducer would be a guess.
- AC3 (RLS extension) — **NOT AUTHORED**. The 32-assertion baseline is GREEN. Adding 2 isolation assertions is straightforward, but committing them under Task A.1 without the AC1/AC2 fix would mis-represent the task as complete.

**Codex review:** PENDING (Step 2b cannot run without an implementation diff).

---

## PASS evidence — TBD

To be filled when:
1. Main agent re-routes A.1 through brainstorm-tomi for re-scoping per Implementation Fix Circuit Breaker, AND
2. A new briefing identifies the actual root cause + a fix surface compatible with `cacheComponents: false`.

Until then, no PASS evidence exists.

---

## RED → GREEN trace

Not produced. RED test was not authored — see Layer 2 deviation above + `Planning/.tmp/task-A.1-output.md` § Implementation Fix Circuit Breaker.

## Codex findings disposition

Pending. No diff to review.

## Vitest / typecheck / lint

Not run. No diff produced.

---

## Round 2 — Final Implementation (REV 2)

> Generated: 2026-05-01 ~19:00 GMT+7
> Briefing: `Planning/.tmp/task-A.1-briefing.md` (REV 2, 570 lines)
> Round 1 halt history preserved above; Round 2 supersedes the "TBD" markers.

### Corrected scope (revalidatePath fix)

REV 2 retargets the fix from a `'use cache'` cache-tag migration (structurally infeasible under `cacheComponents:false`) to a server-side `revalidatePath('/library', 'page')` call inside the existing `/api/entries/save` route handler. The fix invalidates Next.js's client-side Router Cache (segment cache, ~30s prefetch TTL) so a post-save navigation to `/library` re-fetches the freshly inserted row instead of replaying a stale prefetch.

### Production diff (final)

`app/api/entries/save/route.ts` — 1 import line update + 1 new statement:

- **Line 24**: `import { revalidateTag } from 'next/cache';` → `import { revalidatePath, revalidateTag } from 'next/cache';`
- **After line 341** (inside the `try` block of the `save_to_library` branch, after `revalidateTag(TAGS.userLibrary(userId), 'max');`, before the `catch`): add `revalidatePath('/library', 'page');`

The existing `revalidateTag(TAGS.userLibrary(userId), 'max')` is RETAINED for forward-compat with the eventual `cacheComponents:true` flip (per `lib/dashboard/fetch.ts` + `lib/aggregations/progress-fetch.ts` precedent).

### Planned tests (RED → GREEN)

- AC1 unit: extend `tests/unit/api/entries-save.test.ts` with `// AC1` test asserting `revalidatePath('/library', 'page')` fires under `save_to_library:true`.
- AC1 integration: NEW `tests/integration/library-create.test.ts` — round-trip POST `/api/entries/save` → `fetchLibraryPage(uid)` returns the new row.
- AC2 E2E: NEW `tests/e2e/web/user-stories/US-STAB-A1.spec.ts` — fill log → toggle save-to-library → click Save → click `nav-library` Link → assert new card visible within 1s.
- AC3 RLS: NEW `tests/rls/library-isolation.test.ts` — User A save-to-library via `/api/entries/save` → User B's `fetchLibraryPage` excludes the row; User A's includes it.
- Sequenced screenshots at `tests/screenshots/user-stories/US-STAB-A1/ac2-01-confirmation-with-toggle.png` + `ac2-02-library-after-nav.png`, narrative at `evidence.md`.

### PASS markers per AC

**AC1 unit — PASS**
- Test: `tests/unit/api/entries-save.test.ts` › `POST /api/entries/save` › `save-to-library — server-computed normalized_name + full nutrition (Task 4.7.3)` › `AC1: save_to_library=true fires revalidatePath(/library, page) for router-cache invalidation`
- Run: `pnpm test --run tests/unit/api/entries-save.test.ts -t "AC1"`
- Result: `Tests 1 passed | 18 skipped (19) — 888ms`
- Asserts: `revalidatePath('/library', 'page')` is captured exactly once in the mocked `revalidatePathCalls` array AND existing `revalidateTag(TAGS.userLibrary)` is still fired (forward-compat).

**AC1 integration — PASS**
- Test: `tests/integration/library-create.test.ts` › `library create round-trip (integration, AC1)` › `AC1 round-trip: POST save_to_library:true → fetchLibraryPage returns the new row`
- Run: `pnpm test --run tests/integration/library-create.test.ts`
- Result: `Tests 1 passed (1) — 904ms`
- Asserts: POST `/api/entries/save` + `save_to_library:true` round-trips through the in-memory store; `fetchLibraryPage(uid)` returns the inserted row with correct normalized_name + full nutrition shape.

**AC2 E2E — PASS**
- Test: `tests/e2e/web/user-stories/US-STAB-A1.spec.ts` › `US-STAB-A1 · save-to-library round-trip` › `AC2: new library item visible on /library within 1s of Link nav post-save`
- Run: `pnpm exec playwright test tests/e2e/web/user-stories/US-STAB-A1.spec.ts --project=chromium`
- Result: `1 passed (4.6s)`
- Sequenced screenshots:
  - Given: `tests/screenshots/user-stories/US-STAB-A1/ac2-01-confirmation-with-toggle.png` (confirmation screen with kale-A1-stab + meal categories)
  - Then: `tests/screenshots/user-stories/US-STAB-A1/ac2-02-library-after-nav.png` (/library with K letter-mark card + "Logged kale-A1-stab" undo toast)
- Evidence narrative: `tests/screenshots/user-stories/US-STAB-A1/evidence.md`
- Asserts: WHEN clause via `page.fill` + `page.click(parse)` + `page.click(save-to-library)` + `page.click(save)` + `page.click(nav-library Link)`. THEN clause via `expect(libraryGrid.getByText('kale-A1-stab')).toBeVisible({ timeout: 1_000 })`.
- **Note (deviation):** RED proof attempt found that the bug does NOT actually reproduce in this codebase under `force-dynamic` + `cacheComponents:false` — see `Planning/.tmp/task-A.1-output.md` § Round 2 → Layer 3 deviation. The fix is applied as defensively correct + forward-compat. The unit test (AC1) provides the strict regression coverage for the `revalidatePath` call.

**AC3 RLS — PASS**
- Tests:
  - `tests/rls/library-isolation.test.ts` › `AC3: library_items_user_isolation (Task A.1)` › `AC3: User B does NOT see User A library row inserted via save_to_library path`
  - `tests/rls/library-isolation.test.ts` › `AC3: library_items_user_isolation (Task A.1)` › `AC3: User A DOES see her own library row inserted via save_to_library path`
- Run: `pnpm test --run tests/rls/library-isolation.test.ts` (against live kalori-dev DB)
- Result: `Tests 2 passed (2) — 4.76s`
- Pre-existing 32-assertion RLS baseline + 4-assertion library coverage in `tests/rls/food-schema.test.ts` UNCHANGED and still GREEN (full Vitest run: 1735/1735 — see Regression Check below).

### Regression Check

```
Test Files  263 passed (263)
Tests  1735 passed (1735)
Duration  312.70s
```
Baseline 1731 → 1735 (+4 net new tests; matches AC1 unit + AC1 integration + 2× AC3 RLS).

`pnpm typecheck` exits 0 (no errors).
`pnpm lint` clean on touched files (5 pre-existing warnings on UNTOUCHED files).

### Codex disposition

PENDING — Step 2b. Round 2 implementation diff is ready for `codex:rescue` adversarial review.

### RED → GREEN trace

- Unit AC1 RED: `expected [] to deep equally contain [ '/library', 'page' ]` (route handler doesn't call `revalidatePath`).
- Production GREEN: `app/api/entries/save/route.ts` line 24 import + line ~349 `revalidatePath('/library', 'page')` (with comment block).
- Unit AC1 GREEN: `Tests 1 passed | 18 skipped (19) — 888ms`.
- E2E AC2 RED proof attempt failed (bug doesn't reproduce in this cache mode); E2E now provides defensive smoke-level regression coverage. See output file for full diagnosis.

### Files changed

- `app/api/entries/save/route.ts` (production fix)
- `tests/unit/api/entries-save.test.ts` (AC1 unit)
- `tests/integration/library-create.test.ts` (AC1 integration, NEW)
- `tests/rls/library-isolation.test.ts` (AC3 RLS, NEW)
- `tests/e2e/web/user-stories/US-STAB-A1.spec.ts` (AC2 E2E, NEW)
- `tests/screenshots/user-stories/US-STAB-A1/ac2-01-confirmation-with-toggle.png` (M4, NEW)
- `tests/screenshots/user-stories/US-STAB-A1/ac2-02-library-after-nav.png` (M4, NEW)
- `tests/screenshots/user-stories/US-STAB-A1/evidence.md` (M5, NEW)
- `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-A.1.md` (this file, Round 2 sections)
- `Planning/.tmp/task-A.1-output.md` (Round 2 sections appended below Round 1 halt)

---

## Round 3 — Post-Codex Hardening

> Generated: 2026-05-01 ~19:45 GMT+7
> Codex review: `Planning/.tmp/task-A.1-codex-review.md` — verdict `REQUEST_CHANGES`
> Outcome: Critical Finding B fixed inline; Improvement Finding A deferred via `F-A1-PROD-RUNTIME-TRACE` + evidence.md downgrade note. APPROVE_ROUND_1.

### AC1 — extended PASS (happy-path AND error-path)

**AC1 happy-path (REGRESSION — still GREEN):**
- Test: `tests/unit/api/entries-save.test.ts` › `AC1: save_to_library=true fires revalidatePath(/library, page) for router-cache invalidation`
- Run: `pnpm test --run tests/unit/api/entries-save.test.ts -t "AC1"`
- Result: GREEN (unchanged from Round 2).

**AC1 error-path (NEW — Codex Round 1):**
- Test: `tests/unit/api/entries-save.test.ts` › `AC1-error-path: when food_library_items INSERT errors, route does NOT invalidate cache and emits Sentry signal`
- Run: `pnpm test --run tests/unit/api/entries-save.test.ts`
- Result: `Tests 20 passed (20) — 1.04s`
- Asserts: when the mocked `food_library_items` insert returns `{ data: null, error: { code: '23505', … } }`:
  - Route still returns 200 (entry write committed; library is enrichment-only).
  - `revalidatePath('/library', 'page')` is NOT called.
  - `revalidateTag(TAGS.userLibrary(uid), 'max')` is NOT called.
  - `Sentry.captureException(libError, { tags: { component: 'entries-save', scope: 'library_insert', pg_code: '23505' }, … })` IS called exactly once with the PostgREST error object.

### Codex Findings disposition (final)

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| B — cache invalidation on failed library insert | Critical | **Fixed inline (Codex Round 1)** | `app/api/entries/save/route.ts` guard block; new AC1-error-path unit test |
| A — AC2 smoke masquerade | Improvement | **Deferred via `F-A1-PROD-RUNTIME-TRACE`** | `tests/screenshots/user-stories/US-STAB-A1/evidence.md` "Coverage scope note (post-Codex review)" section |

No deferred residual for Critical Finding B. The follow-up tracking for Improvement Finding A reuses the pre-existing `F-A1-PROD-RUNTIME-TRACE` entry — no new follow-up created.

### Final regression check (post-Codex)

```
Test Files  263 passed (263)
Tests  1736 passed (1736)
Duration  298.05s
```
Baseline 1735 → 1736 (+1 net new: AC1-error-path). `pnpm typecheck` clean. `pnpm lint` clean on touched files (5 pre-existing warnings on UNTOUCHED files unchanged).

### Files changed (Round 3)

- `app/api/entries/save/route.ts` (Codex guard block + Sentry capture)
- `tests/unit/api/entries-save.test.ts` (new AC1-error-path test)
- `tests/screenshots/user-stories/US-STAB-A1/evidence.md` (Coverage scope note appended)
- `Planning/.tmp/task-A.1-output.md` (Round 2 — Codex Fix Round 1 section appended)
- `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/task-A.1.md` (this Round 3 section appended)



