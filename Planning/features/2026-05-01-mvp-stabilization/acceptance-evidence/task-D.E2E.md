# Acceptance Evidence — Task D.E2E

**Task:** D.E2E — Per-Phase User Story E2E bundle (US-STAB-D1 + US-STAB-D2 + US-STAB-D6)
**User Stories:** US-STAB-D1, US-STAB-D2, US-STAB-D6
**Phase:** D (MVP Stabilization Sprint — Per-Phase User Story E2E gate)
**Complexity:** Medium
**Type tags:** `[user-story-e2e][a11y][api][backend]`
**Codex review:** Skipped for `[user-story-e2e]` sweep variant per task card; phase Codex covers at Task D.CODEX.
**Origin:** Per-Phase E2E gate (`Planning/tasks.md` Task D.E2E preamble)
**Tier of evidence:** Standard (Medium bundle; 9 sequenced screenshots committed; full evidence narrative co-located with spec)
**Completed:** 2026-05-15
**Branch:** main
**Implementation commit:** `600c6cd` (task D.E2E: User Story E2E bundle (D1+D2+D6) + D.1 a11y regression fix)
**Reconstruction commit:** `f8de26e` (this file backfilled by FU-D-SWEEP-01 resolution)

> **Reconstruction note:** This evidence file was reconstructed during Task E.1.3
> (D.SWEEP followup cleanup) per FU-D-SWEEP-01. The operative evidence has always
> existed at `tests/screenshots/user-stories/US-STAB-D-bundled/evidence.md` (248
> LoC, committed in `600c6cd`), the bundled spec itself
> (`tests/e2e/web/user-stories/US-STAB-D-bundled.spec.ts`, self-documenting per
> AC), the D.E2E CHANGELOG entry, the 9 committed screenshots, and the
> progress.md row. This file lifts the canonical per-AC summary into the
> standard acceptance-evidence directory shape so D.E2E sits alongside the rest
> of Phase D's evidence artefacts.

## Goal

Run the Phase D Per-Phase User Story E2E sweep as a single auditable spec
covering the three D-phase user stories that have observable E2E surface
(US-STAB-D1 dashboard a11y, US-STAB-D2 401 JSON contract, US-STAB-D6 library
dedup partial-unique index). Confirm each implemented story's user-observable
contract is exercised end-to-end via a real browser session against a
production-shape Next.js build, with click-through user-actions and post-action
DOM assertions per the Click-Through Mandate (HARD-RULE).

## Acceptance Criteria — Status

| #         | AC                                            | Status         | Test file                                                  | Runtime                                  |
| --------- | --------------------------------------------- | -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| D1-AC1    | axe-zero-violations after Tab×8 + chart hover | PASS           | `tests/e2e/web/user-stories/US-STAB-D-bundled.spec.ts:93`  | Captured in 18.8s suite total            |
| D2-AC1    | Unauth GET /api/library/list → 401 JSON envelope | PASS         | same spec (D2-AC1 block)                                   | Captured in 18.8s suite total            |
| D2-AC2    | Unauth response has no Location header + no HTML body | PASS    | same spec (D2-AC2 block)                                   | Captured in 18.8s suite total            |
| D6-AC2    | Two save-to-library cycles → exactly one library card (cardinality proof of partial-unique index) | PASS | same spec (D6-AC2 block) | Captured in 18.8s suite total |
| D1-AC2    | Ivory 2px focus ring on every interactive dashboard element | SCOPE-SKIP | Covered by `tests/visual/dashboard-focus-ring.spec.ts` (3 viewports + Firefox + WebKit advisory) AND `tests/e2e/web/dashboard-a11y.spec.ts::AC2` (full-tab-walk computed-style assertion). Bundling the 80-iteration walk would 4× the suite runtime for no extra signal. | — |
| D1-AC3    | Charts/gauges have accessible textual alternatives | SCOPE-SKIP | Covered by `tests/integration/dashboard-a11y.test.tsx::charts-have-aria-labels` (4 active blocks: ChronometerRing on-target + empty, MacroBars, MicronutrientPanel, MealsBulletin). DOM-content assertion is not a click-through observable. | — |
| D2-AC3    | refresh-interceptor 401 → silent refresh path | SCOPE-SKIP     | Covered by `tests/unit/auth/refresh-interceptor.test.ts`. R1 firewall: spec does NOT touch `lib/auth/refresh-interceptor.ts`. | — |
| D6-AC1    | `food_library_items_user_normalized_name_unique` index exists in `pg_indexes` with documented predicate | SCOPE-SKIP | Covered by `tests/integration/db/0018-migration.test.ts` (file slot keeps legacy 0018 name; shipped migration is 0020 per `migration-plan.md` §2). `pg_indexes` lookup is not a UI surface. | — |
| D6-AC3-AC7 | SQL transactional cleanup / tombstone exclusion / ON CONFLICT / idempotent re-apply / predicate exactness | SCOPE-SKIP | Covered by `tests/integration/db/0018-pre-cleanup.test.ts` + `tests/integration/library-create-real-db-dedup.test.ts` + 66-test RLS harness. SQL-level constraints + transactional cleanup logic are not E2E observables. | — |

**Test suite:** Playwright (chromium project + `tests/e2e/fixtures/auth.ts`
real-user fixture against `kalori-dev`). Total: 9 declared blocks (4 active +
5 SCOPE-SKIP), 4 PASS / 5 skipped, 18.8s suite runtime, 0 failures. Standalone
`tests/e2e/web/dashboard-a11y.spec.ts` also exercised (2 PASS / 11.5s) to
confirm the production fixes resolve both the bundled-spec AC1 and the
standalone D.1 AC1/AC2 RED-states.

## Files changed (production diff inside `600c6cd`)

| File                                                | Change | Notes                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/dashboard/MealEntryContextTrigger.tsx`  | M      | Round-2 production fix (1-line): `color: 'var(--color-oxblood-soft)'` → `'var(--color-ivory)'` on meal-add button label. Restores WCAG 2 AA `color-contrast` (~13:1 vs the required 4.5:1) on dark `--color-bg-base` background; preserves uppercase letter-spacing typography. |
| `components/charts/WeeklyReviewCore.tsx`            | M      | Round-2-extended production fix (1-line, same pattern): same swap on the sparse-state kicker `<p>` (sibling of `#weekly-review-sparse-kicker`). Ivory on `--color-bg-quote` `#1a1310` = ~12:1 ratio. Preserves the `--color-oxblood` left border and `--color-sand` italic body text. |
| `tests/e2e/web/user-stories/US-STAB-D-bundled.spec.ts` | NEW | 518 LoC. Bundled spec covering 4 ACs with the Click-Through Mandate contract (≥1 user-action API + ≥1 post-action `expect(locator)` per AC, no URL/title-only assertions). Documents the 5 SCOPE-SKIPs verbatim. Uses `page.route()` stubs only for non-firewalled endpoints (`/api/ai/text-parse`, `/api/library/dedup-check`). |
| `tests/screenshots/user-stories/US-STAB-D-bundled/evidence.md` | NEW | 248-LoC per-AC evidence narrative co-located with the spec. Source of truth for the per-AC GREEN summary that this acceptance-evidence file mirrors. |
| `tests/screenshots/user-stories/US-STAB-D-bundled/{D1,D2,D6}-ac*.png` | NEW | 9 sequenced screenshots committed at `600c6cd` (D1: 2, D2: 4, D6: 3). Captured against the post-fix DOM by the spec's `page.screenshot({ path })` calls. |
| `Planning/tasks.md`                                 | M      | C5 auto-patch: 6 FA-mandatory Reads entries added to D.E2E task card (manifest, impact-analysis SS-US-STAB-D1/D2/D6, architecture SS-8.1/SS-2.4/SS-6/SS-11).                                                                                                                                                              |
| `Planning/progress.md`                              | M      | D.E2E row → ✅ Completed; Last-updated refreshed.                                                                                                                                                                                                                              |
| `Planning/CHANGELOG.md`                             | M      | D.E2E entry added (verbatim entry above the D.6 row).                                                                                                                                                                                                                          |

## Implementation Strategy (E2E sweep + production fixes via two-round HALT)

**TDD Contract (briefing §"TDD Contract" step 3):** Run the bundled spec on
HEAD as written; HALT on first-run RED to surface gaps for user direction.
Both production fixes that landed alongside the spec emerged from this HALT
discipline — the spec was authored against the AC contract, and HEAD failed
RED because two legacy oxblood-soft text usages on dark dashboard surfaces
fell below 4.5:1 contrast under axe's WCAG 1.4.3 AA rule.

**Round 2 (user-authorized, hard 1-file-edit cap):**

- `MealEntryContextTrigger.tsx` line 68 — meal-add button label color swap.
- Re-run cleared the meal-add violation but unmasked a sibling
  `#weekly-review-sparse-kicker` violation on `var(--color-bg-quote)`.
- Round 2 HALTED per its 1-file rule.

**Round 2-extended (user-authorized, sibling one-line swap):**

- `WeeklyReviewCore.tsx` line 269 — same pattern.
- Re-run: bundled spec **4 passed, 5 skipped (18.8s)**; standalone
  `dashboard-a11y.spec.ts` **2 passed (11.5s)**. Both GREEN.

**Codebase scan rationale (scope-control evidence in
`tests/screenshots/user-stories/US-STAB-D-bundled/evidence.md`):** A repo-wide
`git grep -n "oxblood-soft" -- "*.tsx" "*.ts" "*.css"` enumerated dozens of
hits. Categorized:

- **(a) Accent uses** (`borderColor`, `textDecorationColor`, `glyphColor`,
  dash glyphs with `aria-hidden`) — out of scope; `color-contrast` doesn't
  apply.
- **(b) Text uses on `--color-ivory` / `--color-bg-quote` / `--color-bg-1`** —
  globals.css §line 2761 documents oxblood-soft on ivory clears 5:1; light-bg
  uses safe.
- **(c) Text uses on dark bg with `aria-hidden="true"`** — invisible to
  axe-core color-contrast scan.
- **(d) Text uses on dark surfaces NOT in the dashboard's keyboard-focus +
  hover surface area** (progress / settings / login / PWA) — out of D.E2E's
  `/dashboard`-scoped scope.

Only the two dashboard-subtree text uses were on axe's path; both fixed.

## Click-Through Mandate compliance

| AC                | WHEN user-action API                                                                                                            | THEN post-action DOM expect                                                                                  | Screenshots         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| D1-AC1 (GREEN)    | `keyboard.press('Tab')×8`, `chronometer.hover()`                                                                                | `expect(dashboardFocus).toHaveCount(1).toBeVisible()` + axe sweep zero serious + critical                    | 2 (post-fix)        |
| D2-AC1 (GREEN)    | `request.get('/api/library/list')`, `page.evaluate(inject overlay)`                                                             | `expect(evidenceOverlay).toContainText('"error":"unauthenticated"')`                                         | 2                   |
| D2-AC2 (GREEN)    | `request.get(..., { maxRedirects: 0 })`, `page.evaluate(inject overlay)`                                                        | `expect(evidenceOverlay).toContainText('Location: <ABSENT>')`                                                | 2                   |
| D6-AC2 (GREEN)    | `textarea.fill()`, `parse-button.click()`, `save-to-library.click()`, `confirmation-save.click()` (×2) + nav `/library`         | `expect(libraryGrid.getByText(FOOD_NAME_D6)).toHaveCount(1)`                                                 | 3                   |

All four implemented ACs have ≥1 user-action API + ≥1 post-action
`expect(locator)` assertion against rendered DOM that did NOT exist before the
action. No URL-only / title-only assertions; no smoke-test goto-only patterns.

## Briefing-vs-impl divergences (verbatim from spec docblock §"Planning Gaps")

- **GAP-1 (D2):** AC text references `/api/dashboard/aggregate`; that route
  does NOT exist in HEAD. D2's contract is route-agnostic —
  `lib/auth/api-401-response.ts` is the SSOT for the 401 envelope on `/api/*`.
  Asserted against `GET /api/library/list` (uses `requireProfileOrJson401`
  per `app/api/library/list/route.ts` line 27).
- **GAP-2 (D6):** AC text references migration
  `0018_food_library_items_dedup_partial_unique.sql`. Shipped migration is
  `supabase/migrations/0020_food_library_dedup_index.sql` (renumbered —
  0018 + 0019 were claimed by water_log migrations). Index contract
  (name + predicate) is the assertion target, not slot number.
- **GAP-3 (D6):** There is no public POST `/api/library/items` route. Library
  is populated as a side-effect of `POST /api/entries/save`. When the
  partial-unique-index rejects with 23505, `libError` is captured to Sentry
  and the route still returns 200. The cardinality smoke (Option B per
  briefing) is the chosen observable.

## Codex Review Outcome

Per-task Codex was **skipped for the `[user-story-e2e]` sweep variant** per
the task card's preamble. Phase Codex covers at Task D.CODEX (mandatory phase
gate). Note that D.CODEX Round 1 hit the account quota cap (see
`F-D6-CODEX-ROUND1-DEFERRED` in `Planning/followups.md`) and was retried per
the D.CODEX closeout (commits `2745b65` and `ea7d0e7` are the D.CODEX Round 2
and Round 3 outputs). Phase D ended with 9/9 tasks complete and 1 exit
residual per the closeout commit `ef7407d` (docs: D.CODEX closeout).

## R1 + DT-2 Firewall Compliance

This spec does NOT touch:

- `lib/auth/refresh-interceptor.ts`
- `lib/auth/cross-tab-signout.ts`
- `lib/api/authFetch.ts`
- `lib/auth/proxy.ts`
- `middleware.ts`
- `components/log-flow/ConfirmationScreen.tsx`
- `lib/db/outbox.ts`

Auth path runs through the `authedPage` Supabase admin fixture and the anon
`request` fixture only. The R1 mitigation contract is preserved.

## Residual Risks

None new in scope. The unrelated `F-D6-CODEX-ROUND1-DEFERRED` open
(documented in `Planning/followups.md`) is the only Phase D residual that
touches the D.E2E neighborhood, and it was resolved post-D.E2E in Round 2/3
(commits `2745b65`, `ea7d0e7`, closeout `ef7407d`).

## Test Regression Impact

- **Bundled E2E sweep:** 4/4 GREEN (5 SCOPE-SKIP), 18.8s.
- **Standalone D.1 spec:** 2/2 GREEN, 11.5s.
- **D.1 integration suite:** 13/13 GREEN (`tests/integration/dashboard-a11y.test.tsx`).
- **Visual baseline (`dashboard-focus-ring`):** unchanged; ivory focus-ring
  baseline preserved across chromium / Firefox / WebKit projects.
- **No surface mutation in `lib/auth/*`, `middleware.ts`, or
  `ConfirmationScreen.tsx`** (R1 firewall held).
- **D1 production fixes color-only (foreground swaps).** No layout / focus /
  semantics change; only restores AA contrast on the two dashboard surfaces
  axe scans saw.

## Sign-off

- Per-task Codex: skipped (`[user-story-e2e]` sweep variant).
- Phase Codex (D.CODEX): GREEN after Round 2 + Round 3 follow-up.
- Click-Through Mandate compliance: PASS (4/4 active ACs).
- Test suite: PASS (no regressions).
- Evidence narrative: `tests/screenshots/user-stories/US-STAB-D-bundled/evidence.md`.
- **Status: SHIP-READY** (already shipped at `600c6cd`).
