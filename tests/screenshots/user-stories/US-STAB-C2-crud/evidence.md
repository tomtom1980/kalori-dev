# US-STAB-C2-crud — Evidence narrative

> Spec parse-verified locally via `npx playwright test --list`. Execution runs on CI with `SUPABASE_TEST_*` secrets. Screenshots are CI-generated; this file documents what each screenshot will show + which locator proves what.

This file is the test-authoring counterpart to `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts`. The sibling spec `tests/e2e/web/user-stories/US-STAB-C2.spec.ts` (committed during task C.2) owns AC1 / AC2 / AC4 as isolated tests; THIS spec owns AC3 (delete click-through) and the consolidated CRUD chain. The two specs coexist in the same directory.

---

## Spec scope coverage map

| AC                             | Coverage                                                                                                | Owner                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------- |
| AC1 (`two-sections-visible`)   | SCOPE-SKIP here; sibling spec covers as isolated test. Re-touched in CRUD chain M1.                     | `US-STAB-C2.spec.ts::AC1` |
| AC2 (`edit-modal-saves`)       | SCOPE-SKIP here; sibling spec covers as isolated test. Re-touched in CRUD chain M2+M3.                  | `US-STAB-C2.spec.ts::AC2` |
| AC3 (`delete-removes-row`)     | **THIS spec — both isolated AC3 test AND CRUD chain M5.** UNIQUE to `-crud`.                            | `US-STAB-C2-crud.spec.ts` |
| AC4 (`log-now-creates-entry`)  | SCOPE-SKIP here; sibling spec covers as isolated test. Re-touched in CRUD chain M4.                     | `US-STAB-C2.spec.ts::AC4` |
| AC5 (`rls-harness-regression`) | SCOPE-SKIP here; task C.SWEEP (Phase C Testing Sweep) re-runs the 66-assertion RLS harness.             | `C.SWEEP`                 |
| CRUD chain                     | **THIS spec.** Single `test()` walking list → Edit → Save → Delete → Confirm → Log-Now → entry appears. | `US-STAB-C2-crud.spec.ts` |

---

## Active tests in this spec

### AC3 — `US-STAB-C2 AC3 — delete custom food removes it from library`

**Goal:** Prove the click-through path "seeded library item → /library → click card → click Delete → confirm dialog opens (N=1 single-name slot) → click Confirm → 200 from `/api/library/<id>/delete` → row disappears + undo toast surfaces."

**Click-through Mandate audit (per `test()`):**

- WHEN-clause user-action API calls: `authedPage.getByTestId(...).click()` x3 (card → delete button → confirm), `authedPage.goto('/library')` (entry) + auto-refresh.
- Post-action DOM assertions: card visible pre-delete, dialog visible + `role="alertdialog"` + single-name text, card has count 0 post-delete, toast visible + `role="status"` + text matches `/deleted/i`.
- Network proof: `waitForResponse` set up BEFORE the Confirm click; matches POST to `/api/library/<id>/delete` + status 200.
- Sequenced screenshots: 2 (`ac3-01-initial.png` pre-delete, `ac3-02-result.png` post-tombstone).
- No raw `fetch()` in the spec body; mutations exercised via UI buttons → server route → production `authPost` path.

**Screenshots:**

- `ac3-01-initial.png` — /library with the seeded card visible before the delete chain begins. Anchored by `getByTestId(library-card-<id>)`.
- `ac3-02-result.png` — /library after tombstone + undo toast. Anchored by `getByTestId(library-card-<id>).toHaveCount(0)` AND `getByTestId('undo-toast').first()` visible with `/deleted/i`.

### CRUD chain — `US-STAB-C2 CRUD chain — create -> edit -> log-now -> recent-entries -> delete`

**Goal:** Prove state continuity across the full CRUD surface in a single end-to-end walk. The chain seeds TWO library items + ONE food_entries row attached to item_B (so Recent Entries' non-empty branch survives the item_A delete), then walks M1→M5 below.

**Click-through Mandate audit (per `test()`):**

- WHEN-clause user-action API calls: `.click()` x9 (cards, edit-button, save-button, log-now, delete-button, confirm), `.fill()` x1 (rename input), `goto('/library')` x4 (entry + 3 round-trip refreshes).
- Post-action DOM assertions: 22+ `expect(locator).to…` calls across the six milestones (heading + grid + cards + section + dialog + toasts + recent-entries row).
- Network proofs: 3 `waitForResponse` blocks (update, log-now, delete) set up BEFORE each click + status 200 asserted.
- Sequenced screenshots: 5 (`chain-01-empty.png` → `chain-02-create.png` → `chain-03-edit.png` → `chain-04-log.png` → `chain-05-delete.png`).
- No raw `fetch()` in the spec body.

#### Milestone M1 — `chain-01-empty.png`

- **User action:** `authedPage.goto('/library')` + `waitForLoadState('networkidle')`.
- **DOM proof locators:** `getByRole('heading', { name: /the library/i })`, `getByTestId('library-grid')`, `getByTestId('library-card-<itemA.id>')`, `getByTestId('library-card-<itemB.id>')`, `getByTestId('section-recent-entries')`, `getByRole('heading', { name: /recent entries/i, level: 2 })`.
- **Screenshot:** `chain-01-empty.png` — fullPage capture of /library showing My Library grid (2 cards: item_A + item_B) and Recent Entries section (≥1 row for item_B). Re-touch of AC1.

#### Milestone M2 — `chain-02-create.png`

- **User action:** click `library-card-<itemA.id>` to navigate to /library/<id>, then click `food-detail-edit-button`.
- **DOM proof locators:** `getByTestId('page-library-detail')` visible, `getByTestId('food-detail-name')` has text `itemAName`, `getByTestId('food-detail-edit-name-input')` visible + has value `itemAName`.
- **Screenshot:** `chain-02-create.png` — fullPage capture of detail page in edit mode with name input pre-filled. Re-touch of AC2 (edit entry point).

#### Milestone M3 — `chain-03-edit.png`

- **User action:** `nameInput.fill(renamedAName)` → `food-detail-save-button` click → `waitForResponse` on `POST /api/library/<itemA.id>/update` + status 200.
- **In-place proofs:** `food-detail-name` has text `renamedAName`, `food-detail-edit-name-input` has count 0 (edit form torn down).
- **Round-trip proof:** `goto('/library')` + `waitForLoadState('networkidle')`, then `library-card-<itemA.id>` contains text `renamedAName`.
- **Screenshot:** `chain-03-edit.png` — fullPage capture of detail page post-save, read-mode h1 swapped to renamed value. Re-touch of AC2 (persistence).

#### Milestone M4 — `chain-04-log.png`

- **User action:** click `library-card-<itemB.id>` → navigate to /library/<itemB.id> → click `food-detail-log-now` → `waitForResponse` on `POST /api/library/<itemB.id>/log-now` + status 200.
- **DOM proof locators:** success toast `getByTestId('undo-toast').first()` visible + `role="status"` + text matches `/logged/i`.
- **Round-trip proof:** `goto('/library')` + `waitForLoadState('networkidle')`, then `section-recent-entries` contains `recent-entries-row` with text `itemBName` (uses `.filter({ hasText })` so reordering is resilient).
- **Screenshot:** `chain-04-log.png` — fullPage capture of detail page post-log-now toast. Re-touch of AC4.

#### Milestone M5 — `chain-05-delete.png`

- **User action:** click `library-card-<itemA.id>` → click `food-detail-delete-button` → assert `library-bulk-delete-dialog` open with `role="alertdialog"` + `library-bulk-delete-name` contains `renamedAName` → `waitForResponse` on `POST /api/library/<itemA.id>/delete` + status 200 → click `library-bulk-delete-confirm`.
- **DOM proof locators:** post-delete, `library-card-<itemA.id>` has count 0, `library-card-<itemB.id>` still visible (item_B survives), `section-recent-entries` still visible (the seeded food_entries row attached to item_B survives the delete of item_A — briefing §13 question 5), `undo-toast` visible + `role="status"` + text matches `/deleted/i`.
- **Screenshot:** `chain-05-delete.png` — fullPage capture of /library after the tombstone + undo toast. UNIQUE to this spec; this is the AC3 click-through within the chained flow.

---

## Skipped tests (SCOPE-SKIP)

Four `test.skip()` blocks live at the bottom of the spec. Each documents WHERE the actual coverage lives so a reader of `-crud.spec.ts` knows where to look:

| Skipped test title                                      | Coverage location                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `US-STAB-C2 AC1 — [SCOPE-SKIP]: two-sections-visible`   | `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC1` (sibling spec) |
| `US-STAB-C2 AC2 — [SCOPE-SKIP]: edit-modal-saves`       | `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC2` (sibling spec) |
| `US-STAB-C2 AC4 — [SCOPE-SKIP]: log-now-creates-entry`  | `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::AC4` (sibling spec) |
| `US-STAB-C2 AC5 — [SCOPE-SKIP]: rls-harness-regression` | `C.SWEEP` (Phase C Testing Sweep — 66-assertion RLS harness)        |

---

## Locators reference design-system bindings

All locators target data-testids committed by the Phase 1+2 UI sub-agents and re-confirmed against HEAD at spec-authoring time (2026-05-15):

| Selector                      | Source                                                               |
| ----------------------------- | -------------------------------------------------------------------- |
| `library-grid`                | `app/(app)/library/_components/LibraryGrid.tsx:121`                  |
| `library-card-<id>`           | `app/(app)/library/_components/LibraryCard.tsx:88`                   |
| `page-library-detail`         | `app/(app)/library/[id]/page.tsx:43`                                 |
| `food-detail-name`            | `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx:35`     |
| `food-detail-edit-button`     | `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx:99`  |
| `food-detail-edit-name-input` | `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx:66`     |
| `food-detail-save-button`     | `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx:58`  |
| `food-detail-delete-button`   | `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx:108` |
| `food-detail-log-now`         | `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx:84`  |
| `library-bulk-delete-dialog`  | `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx:98`       |
| `library-bulk-delete-name`    | `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx:104`      |
| `library-bulk-delete-cancel`  | `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx:141`      |
| `library-bulk-delete-confirm` | `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx:152`      |
| `section-recent-entries`      | `app/(app)/library/_components/RecentEntriesSection.tsx:140`         |
| `recent-entries-row`          | `app/(app)/library/_components/RecentEntriesSection.tsx:178`         |
| `undo-toast`                  | `components/toast/UndoToast.tsx:44`                                  |

Role-based accessible-name assertions (`getByRole('heading', { name: /the library/i })`) anchor on i18n strings (`t.library.title`, `t.library.recent.heading`).

I18n strings asserted (anchor-text matching):

- `/deleted/i` matches `t.library.detail.deletedToast = '1 item deleted · undo 5s'` (lib/i18n/en.ts:721)
- `/logged/i` matches `t.library.detail.logNowSuccessToast` (per C.2 sibling spec AC4)

---

## F-TEST-4 #1 manifestations (local vs CI)

| Phase                                  | Local                                                                                             | CI                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Spec authoring                         | YES — done                                                                                        | n/a                                                 |
| Parse check (`playwright test --list`) | YES — required gate                                                                               | n/a                                                 |
| Spec execution (browser run)           | SKIP — auth fixture requires `SUPABASE_TEST_*` service-role secrets which are not in local `.env` | YES — workflow runs on push with secrets configured |
| Screenshot generation                  | SKIP locally; CI generates them                                                                   | YES                                                 |

The local gate is `npx playwright test --list tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts` exiting 0. CI runs the actual flow.
