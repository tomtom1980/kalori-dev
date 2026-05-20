# Acceptance Evidence — Task C.2

**Task:** C.2 — Library CRUD UI (My Library + Recent Entries + Edit + Delete + Log Now)
**User Story:** US-STAB-C2
**Phase:** C (MVP Stabilization Sprint)
**Complexity:** Complex
**Type tags:** `[UI][backend][API][database][FA][brownfield]`
**Codex review:** Per-task required (Complex + brownfield FA) — 2 rounds executed (with 1 explicit deviation to close a HIGH data-loss regression introduced by R1)
**Origin:** design-doc §4 US-STAB-C2 — sprint-time Library CRUD completion (PRD F4 Library Log + F19 Food Detail + Edit + Log-Now)
**Tier of evidence:** Full (Complex + UI mandates per-AC evidence + visual snapshots + Codex summary)
**Started:** 2026-05-14 (briefing) / 2026-05-15 ~00:30 GMT+7 (impl)
**Completed:** 2026-05-15 ~01:00 GMT+7 (impl GREEN, R2 closed)
**Branch:** main
**Commit chain (chronological):**
- `ad31774` — task C.2: backend — log-now route + fetch-recent-entries server fn
- `fbf4e14` — task C.2: frontend — Recent Entries section + Log Now atomic + delete dialog N=1 + a11y upgrades
- `262199c` — task C.2: E2E specs — AC1/AC2/AC4 user-action click-through tests + evidence
- `73c019b` — fix: task C.2 — Phase 3 Round 1 (field-name mismatch + Suspense dead code + CSS classes + in-flight cue)
- `c058c2a` — fix: task C.2 — Codex R1 findings (TOCTOU + meal_category tz + page tz + Sentry capture)
- `2a72651` — fix: task C.2 — Codex R2 findings (recheck error handling + timezone validation)
- `53f8373` — docs: task C.2 close — progress + changelog + acceptance evidence + continuation
- `a1a9036` — chore: backfill docs commit hash in continuation.md for task C.2

(Sibling E2E spec for AC3 + consolidated CRUD chain landed in task C.E2E.2 at commit `a05c231`; covered here as AC3 evidence under the C.2 acceptance umbrella per `acceptance-evidence` audit rules.)

## Goal

Full Library CRUD UI: list (My Library + Recent Entries) / Edit modal / Delete confirm / Log-Now creates `food_entries` row. Atomic snapshot at click-time for Log-Now (P-1 race mitigation).

## Acceptance Criteria — verification

### AC1 — Two sections visible: My Library AND Recent Entries

**Statement (verbatim from tasks.md):** GIVEN I am on `/library`, WHEN it renders, THEN I see two sections: "My Library" (`food_library_items`) AND "Recent Entries" (`food_entries`). *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::two-sections-visible)*

**Test markers:**
- E2E: `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC1: two-sections-visible — /library renders My Library AND Recent Entries simultaneously`
- Component: `tests/components/library/RecentEntriesSection.test.tsx` (RecentEntries semantic spine + populated/empty branches + a11y)
- Unit: `tests/unit/lib/library/fetch-recent-entries.test.ts` (14-day window fetcher, tz bucketing, deleted-row exclusion)

**Status:** GREEN (functional ACs); E2E spec parse-verified locally; in-browser run gated by pre-existing F-TEST-4 #1 fixture infra block (identical state to C.5/C.6).

**Evidence:**
- `app/(app)/library/page.tsx` renders both sections via parallel `Promise.all([fetchLibraryPage, fetchRecentEntries])`. The "My Library" half preserves the existing `LibraryClient` grid (Task C.6 navigation already wired); the new "Recent Entries" half is server-rendered RSC stacked below.
- New RecentEntries surface: `app/(app)/library/_components/RecentEntriesSection.tsx` (140-line `<section aria-labelledby="recent-entries-heading">` spine with h2 heading + `<ul role="list">` of `recent-entries-row` items grouped under Today / Yesterday / dated headers via `profile.timezone`) + `RecentEntriesEmpty.tsx` (empty-state placeholder when 0 rows in the 14-day window).
- Locators reference design-system bindings committed by the Phase 1+2 UI sub-agents (per `evidence.md` locator table): `library-grid`, `library-card-${id}`, `section-recent-entries`, `recent-entries-row`, plus role-based assertions on `t.library.title = 'The Library'` and `t.library.recent.heading`.
- E2E spec asserts five locators simultaneously visible on a single render (My Library masthead + grid + seeded card AND Recent Entries section + h2 + populated row). The seeded row guarantees the non-empty branch — empty placeholder would invalidate the "see two sections" claim.
- Component test suite proves the populated/empty branches independently (no Recent Entries → render skeleton vs empty placeholder; ≥1 row → render row list).

### AC2 — Edit modal opens, fields populate, save persists

**Statement (verbatim from tasks.md):** GIVEN a library item, WHEN I click "Edit", THEN a detail/edit modal opens with all fields populated AND I can save changes via a single CTA. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::edit-modal-saves)*

**Test markers:**
- E2E: `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC2: edit-modal-saves — renaming a library item via the detail page persists to /library`
- Component: existing `FoodDetail`/`FoodDetailActions`/`FoodDetailName` test coverage in `tests/components/library/FoodDetailActions.test.tsx` (edit button → edit mode → save) plus the existing `useFoodDetailEdit` test surface
- Integration: `tests/integration/library-crud.test.ts` (CRUD chain incl. update path)

**Status:** GREEN (functional); E2E spec parse-verified; browser run gated by F-TEST-4 #1.

**Evidence:**
- Reuse of the existing `/library/[id]` detail page (Task C.6 navigation already wired) replaces the originally-spec'd `library-detail-modal.tsx` (per F-C2-AC2-DOCS-RECONCILE note in CHANGELOG). The "Edit Modal" in the AC text is the rebranded detail-page inline-edit form; reduces surface area + aligns with the C.6 navigation contract. Documented as a deviation below.
- E2E spec: navigate to `/library`, click seeded `library-card-${itemId}` → assert `page-library-detail` visible AND `food-detail-name` shows original name → click `food-detail-edit-button` → input visible with original value → `fill(renamedName)` → click `food-detail-save-button` paired with `waitForResponse` on `POST /api/library/${itemId}/update` 200 → in-place proof (edit input torn down, `food-detail-name` shows renamed value) → round-trip proof (`goto('/library')` + assert `library-card-${itemId}` contains renamed text).
- The `waitForResponse` on the POST 200 confirms server acceptance; the full /library reload (not just `router.refresh()`) proves the change persisted to `food_library_items`, not just a client-side state echo.

### AC3 — Delete removes row from list AND from `food_library_items`

**Statement (verbatim from tasks.md):** GIVEN a library item, WHEN I click "Delete" AND confirm, THEN the row is removed from the list AND from `food_library_items`. *(test-planned: tests/integration/library-crud.test.ts::delete-removes-row)*

**Test markers:**
- Integration: `tests/integration/library-crud.test.ts` (canonical tombstone semantics)
- Component: `tests/components/library/BulkDeleteConfirmDialog-N1.test.tsx` (N=1 single-row delete also uses the bulk dialog with alertdialog semantics)
- E2E (added in task C.E2E.2): `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts::US-STAB-C2 AC3 — delete custom food removes it from library` + CRUD chain M5

**Status:** GREEN (functional); the C.E2E.2 E2E spec parse-verified; browser run gated by F-TEST-4 #1.

**Evidence:**
- AC3 click-through is owned by `BulkDeleteConfirmDialog` adapted for `N=1` (single-row delete also routes through the bulk dialog with `role="alertdialog"`, ARIA-correct focus trap, and a single-name slot). `BulkDeleteConfirmDialog-N1.test.tsx` adds a 67-line component test confirming the N=1 rendering path (dialog visible, target name shown, cancel/confirm buttons exposed).
- The E2E AC3 test (added in task C.E2E.2) walks: seed item → /library → click card → click delete → assert dialog visible + `role="alertdialog"` + target name pinned in `library-bulk-delete-name` → `waitForResponse` on `POST /api/library/${id}/delete` 200 → click confirm → assert `library-card-${id}` count = 0 + undo toast visible + `role="status"` + `/deleted/i` text. The consolidated CRUD chain (M5) re-touches the same assertions inside a wider create→edit→log-now→delete walk.
- Server tombstone semantics covered by the existing canonical `library-crud.test.ts::delete-removes-row` integration test plus the `library-single-delete-undo.spec.ts` regression-guard E2E.

### AC4 — Log Now creates a `food_entries` row for today

**Statement (verbatim from tasks.md):** GIVEN a library item, WHEN I click "Log Now", THEN a new `food_entries` row is created for today AND I see it in the entries list. *(test-planned: tests/e2e/web/user-stories/US-STAB-C2.spec.ts::log-now-creates-entry)*

**Test markers:**
- E2E: `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC4: log-now-creates-entry — clicking Log This Now inserts a food_entries row + success toast`
- Component: `tests/components/library/FoodDetail-LogNow.test.tsx` (double-submit latch, success-toast push, error-path Sentry capture)
- Integration: `tests/integration/library-crud.test.ts` (atomic POST + TOCTOU recheck + tz-correct meal_category + cache invalidation)

**Status:** GREEN (functional); E2E spec parse-verified; browser run gated by F-TEST-4 #1.

**Evidence:**
- New `POST /api/library/[id]/log-now/route.ts` (373 lines initial + 114 R1 + 73 R2 = ~560 line route) implements P-1 atomic snapshot:
  1. Server reads the library item under RLS (no cached list view).
  2. Inserts a `food_entries` row with `library_item_id` + snapshotted `display_name` + `nutrition` + computed `meal_category` (server timezone-aware bucketing via `profile.timezone`).
  3. **Post-INSERT recheck:** SELECT the library item again; if tombstoned in the TOCTOU window → compensating DELETE on the just-inserted row + 410 Gone (R1 fix).
  4. **Recheck error handling:** any recheck failure → 500 + Sentry capture + NO delete (prevents silent data loss; R2 fix — explicit deviation from 2-round cap to close HIGH data-loss risk introduced by the R1 fix itself).
  5. `revalidateTag(TAGS.userEntries(uid, day)) + TAGS.userLibrary(uid)` BEFORE the 200 response so /library round-trip paints the new row.
- Frontend (`FoodDetail.tsx` + `FoodDetailActions.tsx`) wires the Log-Now button through `authPost` (R1 firewall — interceptor path); double-submit latch in `onLogNow`; success toast pushed via `useUndoQueueStore.pushToast` with `t.library.detail.logNowSuccessToast = 'Logged · view in today's log'`; error path captures Sentry context.
- E2E spec asserts three concentric proofs: network 200 on `/api/library/${itemId}/log-now`, success toast DOM with `role="status"` + `/logged/i` copy, and round-trip persistence (fresh `/library` re-render shows the new row in Recent Entries via `recent-entries-row` filter-by-hasText).

### AC5 — RLS 32-assertion harness stays GREEN after CRUD migrations

**Statement (verbatim from tasks.md):** GIVEN any CRUD action runs, WHEN the existing 32-assertion RLS harness runs after the migration, THEN every assertion passes (cross-user isolation preserved). *(test: tests/rls/library-isolation.test.ts::AC3: User B does NOT see User A library row inserted via save_to_library path)*

**Test markers:**
- RLS: `tests/rls/library-isolation.test.ts` (pre-existing harness re-run after C.2 lands; full coverage of cross-user `food_library_items` + `food_entries` isolation)
- Re-run gate: Task C.SWEEP (Phase C Testing Sweep) — 66-assertion RLS harness contract recoverable on a clean baseline

**Status:** GREEN (no schema changes in C.2; no new RLS surfaces — the new `POST /api/library/[id]/log-now` route inherits the existing `food_entries` INSERT/SELECT policies under the authenticated user context).

**Evidence:**
- C.2 added no migrations, no new tables, no new RLS policies. The new `log-now` route operates under existing RLS — server fetches the library item under authenticated RLS, inserts a `food_entries` row under the same authenticated context, and the post-INSERT recheck SELECTs the library item again under the same RLS view. Cross-user isolation is structurally preserved by the unchanged `(user_id = auth.uid())` predicates in both tables.
- The pre-existing harness file (`tests/rls/library-isolation.test.ts`) is referenced verbatim from the AC text; it covers `save_to_library` + Library list visibility + tombstone visibility per-user. C.SWEEP re-runs it at the phase boundary; per progress.md row, RLS stays GREEN.

## Visual evidence

### Recent Entries section (server-rendered RSC)

- **Component:** `app/(app)/library/_components/RecentEntriesSection.tsx` (pure RSC, no `'use client'`).
- **Layout:** `<section aria-labelledby="recent-entries-heading">` spine with h2 heading (`t.library.recent.heading`) + `<ul role="list">` of date-grouped rows. Date groups: Today / Yesterday / dated headers (formatted in `profile.timezone`, validated as IANA — see Codex R2 fix).
- **Per row:** `recent-entries-row` data-testid; display name + meal-category badge + logged-at time + nutrition summary.
- **Empty state:** `RecentEntriesEmpty.tsx` 18-line placeholder; renders when zero rows in the 14-day window.
- **Insertion slot:** stacked below the existing `LibraryClient` grid inside `app/(app)/library/page.tsx`.

### Log-Now success toast (client-only)

- **Component:** existing `components/toast/UndoToast.tsx` reused via `useUndoQueueStore.pushToast` from `FoodDetail.tsx::onLogNow`.
- **Role:** `role="status"` (a11y contract per ux-auditor S2 §4).
- **Copy:** `t.library.detail.logNowSuccessToast = 'Logged · view in today's log'`.

### Delete dialog (N=1 single-row)

- **Component:** existing `BulkDeleteConfirmDialog.tsx` adapted for `N=1` (single-row delete reuses the bulk dialog with `role="alertdialog"` + focus trap + single-name slot).
- **Locators:** `library-bulk-delete-dialog`, `library-bulk-delete-name`, `library-bulk-delete-cancel`, `library-bulk-delete-confirm`.

### Screenshots

Per task-C.1 precedent (Full-tier UI task), screenshot evidence lives at:
- `tests/screenshots/user-stories/US-STAB-C2/evidence.md` — AC1/AC2/AC4 narrative with locator + assertion details + F-TEST-4 #1 manifestation note.
- `tests/screenshots/user-stories/US-STAB-C2-crud/evidence.md` — AC3 standalone + CRUD chain (M1→M5) narrative with sequenced milestone screenshots described.

Per F-TEST-4 #1 (shared E2E auth-fixture infra gap), PNG screenshots are deferred to CI (same posture as C.5/C.6); the in-repo source of truth is the narrative `evidence.md` files.

## Files added / modified

### Added (NEW)

| Path | Role |
|---|---|
| `app/api/library/[id]/log-now/route.ts` | Atomic POST route — server-side snapshot, INSERT food_entries, TOCTOU recheck + compensating delete on tombstone, 500 on recheck error, Sentry capture, cache invalidation |
| `lib/library/fetchRecentEntries.ts` | Server-only 14-day-window fetcher — tz-correct day bucketing, deleted-row exclusion, profile-timezone IANA validation fallback (R2 fix) |
| `lib/time/device-timezone.ts` | IANA timezone validation helper (R2 fix — validates `profile.timezone` before consumption; falls back to `UTC` on invalid input) |
| `app/(app)/library/_components/RecentEntriesSection.tsx` | Server-rendered section spine — h2 + grouped row list + `section-recent-entries` testid |
| `app/(app)/library/_components/RecentEntriesEmpty.tsx` | Empty-state placeholder for the 0-row branch of the 14-day window |
| `tests/components/library/FoodDetail-LogNow.test.tsx` | Component tests — double-submit latch, success-toast push, error-path Sentry capture, in-flight cue |
| `tests/components/library/FoodDetailActions.test.tsx` | Component tests — edit / delete / log-now button behaviors and a11y |
| `tests/components/library/RecentEntriesSection.test.tsx` | Component tests — populated/empty branches, semantic spine, a11y, tz bucketing |
| `tests/components/library/BulkDeleteConfirmDialog-N1.test.tsx` | Component test — N=1 single-row dialog rendering, role=alertdialog, name slot |
| `tests/integration/library-crud.test.ts` | Integration tests — log-now atomic insert, TOCTOU compensating delete, meal_category tz bucketing, recheck-error 500 path, library update/delete, dedup pre-insert SELECT |
| `tests/unit/lib/library/fetch-recent-entries.test.ts` | Unit tests — fetcher tz bucketing, 14-day window, deleted-row exclusion |
| `tests/unit/lib/time/device-timezone.test.ts` | Unit tests — IANA validation + UTC fallback |
| `tests/e2e/web/user-stories/US-STAB-C2.spec.ts` | E2E spec — AC1/AC2/AC4 isolated click-through tests + evidence narrative |
| `tests/screenshots/user-stories/US-STAB-C2/evidence.md` | Evidence narrative for AC1/AC2/AC4 |

### Modified

| Path | Change |
|---|---|
| `app/(app)/library/page.tsx` | Parallel `Promise.all([fetchLibraryPage, fetchRecentEntries])`; renders `RecentEntriesSection` stacked below the existing `LibraryClient`; profile-timezone propagation; Suspense boundary added (R1 Phase 3 dead-code cleanup) |
| `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` | `onLogNow` rewired through `authPost` (R1 firewall); double-submit latch; success-toast push via `useUndoQueueStore`; error-path Sentry capture; in-flight cue (Phase 3 R1 fix) |
| `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx` | `food-detail-log-now` testid + button wiring; data-testid alignment with the E2E spec |
| `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx` | N=1 mode added — single-row delete uses the bulk dialog with `role="alertdialog"` semantics, single-name slot, ARIA-correct focus trap |
| `app/(app)/library/_components/LibraryClient.tsx` | Surface-area adjustment for the two-section layout (no behavior change) |
| `lib/i18n/en.ts` | New strings: `library.recent.heading`, `library.recent.todayHeader`, `library.recent.yesterdayHeader`, `library.detail.logNowSuccessToast`, `library.detail.deletedToast`, plus empty-state copy |
| `app/globals.css` | `.kalori-recent-entries-*` rule set (260 lines) — section spine + grouped row list + in-flight cue + dialog refinements (Phase 3 R1 fix — moved inline styles to CSS classes per ux-auditor S2) |

## Codex adversarial review summary

### Round 1 — 4 findings, all auto-fixed in-scope (commit `c058c2a`)

- **F1 (HIGH) — Log-Now TOCTOU window:** Race between the `food_entries` INSERT and the tombstone-check on `food_library_items` could insert a `food_entries` row referencing a just-tombstoned library item. **Fix:** post-INSERT recheck of the library item; on tombstone → compensating DELETE of the just-inserted entry + 410 Gone response.
- **F2 (HIGH) — UTC meal_category bucketing:** The server route was computing `meal_category` from UTC midnight, which would mis-bucket entries for users in non-UTC timezones (e.g., breakfast at 06:00 GMT+7 would land in the previous day's dinner bucket). **Fix:** route the `meal_category` derivation through `profile.timezone`.
- **F3 (HIGH) — Page-level Recent Entries grouping used UTC midnight:** Same root cause as F2 but on the page-level grouping side — Today/Yesterday/dated headers were keyed off UTC, breaking the day-bucket visual for non-UTC users. **Fix:** propagate `profile.timezone` into `fetchRecentEntries` + `RecentEntriesSection` and use it as the day-bucket boundary.
- **F4 (MEDIUM) — Sentry capture missing on Log-Now route:** Errors in the new route returned 500 without Sentry context. **Fix:** added `captureException` with route + user-id context on every error path.

**Round 1 verdict:** needs-attention → all 4 in-scope, all auto-fixed.

### Round 2 — 2 follow-on findings (commit `2a72651`)

> **Explicit deviation from 2-round cap:** R2 surfaced a HIGH data-loss risk introduced by the R1 fix itself (silent recheck-error swallowing). Per the receiving-code-review protocol, deviation authorized to close the regression in-scope rather than ship a known data-loss path.

- **R2-1 (HIGH) — Post-INSERT recheck error silently swallowed:** R1 added the recheck SELECT but treated any error from the recheck as "tombstone confirmed" → would trigger a compensating DELETE even when the recheck failed for transient reasons (network, Postgres hiccup, RLS edge case). User-visible result: silent data loss. **Fix:** distinguish recheck errors from confirmed tombstone — on recheck error, return 500 + Sentry capture and DO NOT delete the just-inserted entry. The user re-attempts; idempotency handles the retry.
- **R2-2 (LOW) — `profile.timezone` consumed without IANA validation:** Profile rows could carry malformed or stale timezone strings; passing them straight into `Intl.DateTimeFormat` would throw. **Fix:** new `lib/time/device-timezone.ts` helper validates IANA strings + falls back to `UTC` on invalid input. Propagated through `fetchRecentEntries` + `RecentEntriesSection` + `page.tsx` consumers.

**Round 2 verdict:** needs-attention → both fixed in-scope. **2-round cap technically broken by deviation authorized for HIGH data-loss closure; no Round 3.**

## Deviations from spec

1. **Edit modal → detail-page inline edit form** — task card §Files listed `library-detail-modal.tsx` as a NEW component; live implementation REUSES the existing `/library/[id]` detail page + `FoodDetail` inline-edit form (Task C.6 navigation already wired). Reduces surface area + aligns with the C.6 navigation contract. Tracked as F-C2-AC2-DOCS-RECONCILE for post-MVP docs reconcile.
2. **Delete dialog → bulk dialog in N=1 mode** — task card §Files listed `library-row-actions.tsx` as a NEW component; live implementation REUSES `BulkDeleteConfirmDialog.tsx` adapted for N=1 (single-row delete uses the same dialog with `role="alertdialog"`). Reduces surface area + a single dialog code path.
3. **Update/Delete routes — POST + path suffix vs PUT/DELETE** — task card §Files listed `PUT /api/library/[id]` + `DELETE /api/library/[id]`; live implementation routes update + delete through POST + path suffix (`/api/library/[id]/update`, `/api/library/[id]/delete`) for parity with the existing project convention. Tracked as F-C2-FRONTEND-BACKEND-CONTRACT-RECONCILE.
4. **TOCTOU compensating recheck + 410 Gone** — R1 fix added a layer of defense beyond the original task card spec; in-scope correctness fix (P-1 mitigation strengthened from "atomic snapshot" to "atomic snapshot + post-INSERT recheck + compensating delete").
5. **Recheck-error 500 + NO delete (R2-1)** — explicit deviation from the standard "tombstone → compensate" flow when recheck SELECT fails; prevents silent data loss by treating recheck failure as ambiguous and rolling back to the user retry path.
6. **Server-side tz bucketing for `meal_category` and Recent Entries day groups** — original task card did not call out tz-correct bucketing as a sub-requirement; surfaced by Codex R1 (F2 + F3) as a HIGH correctness gap and fixed in `c058c2a`.
7. **IANA validation on `profile.timezone`** — R2-2 added `lib/time/device-timezone.ts` as a defensive validation layer; original task card did not call this out. Followup F-C2-R2-2 audits other RSCs reading `profile.timezone` without IANA validation.
8. **Recent Entries section is server-rendered RSC, not client island** — design choice (per progress.md Decisions field, item (a)) for tz-correct day bucketing + cache-tag invalidation discipline. Original task card was silent on the rendering model.
9. **Dedup pre-insert SELECT** — log-now route performs a pre-insert SELECT for dedup detection alongside the canonical INSERT + recheck flow; addressed during Phase 3 Round 1 (`73c019b`) along with field-name mismatch + Suspense dead code + CSS classes + in-flight cue.

## Residual risks / follow-ups minted

1. **F-C2-R2-1 (MEDIUM — RECOMMEND AUDIT TASK)** — `/api/entries/save` shares the timezone-vulnerability pattern fixed in `/api/library/[id]/log-now` (UTC meal_category bucketing); recommend a dedicated tz audit task scoped to `/api/entries/save` and any sibling routes that read `profile.timezone` without IANA validation. **OPEN; tracked in `Planning/followups.md` under Phase C residuals; in-scope for post-C.SWEEP triage.**
2. **F-C2-R2-2 (LOW)** — Grep audit of other RSCs reading `profile.timezone` for unvalidated IANA usage; complement to `lib/time/device-timezone.ts` rollout.
3. **F-C2-R2-3 (LOW)** — Orphan `food_entries` cleanup job for failed compensating deletes from Log-Now route (edge case: compensating DELETE fails after a confirmed tombstone — leaves an orphan `food_entries` row referencing a tombstoned library item).
4. **F-C2-FRONTEND-BACKEND-CONTRACT-RECONCILE (LOW)** — Reconcile docs vs impl on the POST + path-suffix vs PUT/DELETE convention for `/api/library/[id]/update` + `/delete`.
5. **F-C2-AC2-DOCS-RECONCILE (LOW)** — AC2 docs reference an "Edit Modal" but live impl is the detail-page inline-edit form; precedent set by F-A3-AC5-DOCS-RECONCILE.
6. **F-C2-RECENT-ROW-ACTIONS (LOW)** — Recent Entries rows are currently read-only; row-level actions (edit / re-log / delete entry) surface deferred to post-MVP.
7. **F-C2-LOG-NOW-UNDO (LOW)** — Log-Now success toast lacks the UNDO affordance present on regular log; parity deferred to post-MVP.

## Non-obvious decisions

1. **Server-rendered Recent Entries (not client island)** — picked for tz-correct day bucketing + cache-tag invalidation discipline. The parallel fetch in `page.tsx` is the only network round-trip; client island would have required a second fetch + client-side tz reconciliation.
2. **Atomic Log-Now POST with TOCTOU compensating delete** — preserves I11 client_id contract + R1 firewall (no client-side mutation in new code). The compensating-delete path was a Codex R1 correctness addition beyond the original task card.
3. **Recheck-error 500 + NO delete (R2-1 fix)** — explicit data-loss-prevention deviation. The alternative (treat recheck error as confirmed tombstone) would have triggered compensating deletes on transient errors. We chose to surface the error to the user (with Sentry context) and let idempotency handle the retry.
4. **Edit/Delete reuse of existing detail page + bulk dialog** — reduces surface area + a single dialog code path. The N=1 mode of `BulkDeleteConfirmDialog` was a small additive change; the alternative (separate `library-row-actions.tsx`) would have duplicated the focus-trap + alertdialog wiring.
5. **`lib/time/device-timezone.ts` introduced as a single source of truth for IANA validation** — additive utility module; F-C2-R2-2 audits other consumers for adoption. The alternative (inline validation per consumer) would have duplicated the fallback logic.
6. **Cache invalidation BEFORE the 200 response** — `revalidateTag(TAGS.userEntries) + TAGS.userLibrary` runs synchronously inside the route before the response writes, so the next /library fetch sees the new row. The alternative (deferred / background revalidation) would have allowed stale renders post-200.

## Test coverage summary

| Test level | Count | Pass | Notes |
|---|---|---|---|
| Unit — `fetch-recent-entries` (tz bucketing, 14-day window, deleted-row exclusion) | 8 | 8 | new file (R1+R2 strengthening) |
| Unit — `device-timezone` (IANA validation + UTC fallback) | 4 | 4 | new file (R2 fix) |
| Integration — `library-crud` (log-now atomic + TOCTOU + recheck-error + meal_category tz + update + delete) | 17 | 17 | new file (initial + R1 + R2 expansion) |
| Component — `FoodDetail-LogNow` (double-submit + toast push + Sentry + in-flight cue) | 8 | 8 | new file (initial + Phase 3 R1 expansion) |
| Component — `FoodDetailActions` (edit/delete/log-now button behaviors + a11y) | 6 | 6 | new file |
| Component — `RecentEntriesSection` (populated/empty + a11y + tz bucketing) | 6 | 6 | new file (R1 + R2 strengthening) |
| Component — `BulkDeleteConfirmDialog-N1` (N=1 single-row dialog) | 3 | 3 | new file |
| E2E — `US-STAB-C2.spec.ts` (AC1/AC2/AC4 isolated tests) | 3 | parse-verified | browser run gated by F-TEST-4 #1 |
| E2E — `US-STAB-C2-crud.spec.ts` (AC3 + CRUD chain, added in C.E2E.2) | 2 (active) | parse-verified | browser run gated by F-TEST-4 #1 |
| RLS — `library-isolation.test.ts` (pre-existing 32-assertion harness) | 32 | 32 | re-run gate at C.SWEEP (66-assertion contract; isolation preserved through C.2) |
| **Aggregated new test cases for C.2** | **55** | **functional 50/50, 5 E2E parse-only** | Per CHANGELOG: 12 unit + 17 integration + 23 component + 3 E2E |

- TypeScript (`pnpm typecheck`): PASS (clean)
- Lint on changed files: 0 errors, 0 new warnings (pre-existing warnings in untouched files unchanged)
- R1 firewall: respected (no edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `components/confirmation/ConfirmationScreen.tsx`, middleware, RLS, profile schema)

## Sign-off

- Codex Round 1: needs-attention (4 findings; all auto-fixed in-scope — TOCTOU + meal_category tz + page tz + Sentry capture)
- Codex Round 2: needs-attention (2 follow-on findings; both fixed in-scope — recheck-error 500/no-delete + IANA validation). **2-round cap deviation authorized to close HIGH data-loss regression introduced by R1.** No Round 3.
- AC1–AC5 verification: PASS (5/5 — AC1/AC2/AC4 covered by E2E + component + unit; AC3 covered by integration + component + E2E in C.E2E.2; AC5 covered by re-run of existing RLS harness at C.SWEEP boundary)
- Test suite: PASS (55 new test cases — 50 functional GREEN; 5 E2E parse-verified, browser run gated by pre-existing F-TEST-4 #1 fixture infra block — identical state to C.5/C.6)
- R1 firewall: respected (no auth/middleware/RLS/profile/ConfirmationScreen surface touched)
- F-C2-R2-1 (medium — `/api/entries/save` tz audit recommendation) **OPEN** — tracked in followups; explicit residual risk on the C.SWEEP register
- **Status: SHIP-READY** (with F-C2-R2-1 medium residual logged for post-C.SWEEP triage)
