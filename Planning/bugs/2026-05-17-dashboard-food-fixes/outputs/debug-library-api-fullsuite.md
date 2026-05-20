# Targeted library/API regression worker

Batch: `2026-05-17-dashboard-food-fixes`

## Root Cause

The latest failures were stale test harnesses, not production API/data-shape regressions.

- `LibraryClient.quick-actions.test.tsx` mocked `authFetch` without a default response. `LibraryClient` now checks `/api/library/quota` before opening the add-item modal, so the test clicked Add Item and then crashed on `res.ok` because the mock returned `undefined`.
- `library-create-cholesterol.test.ts` mocked `food_library_items.select()` only for idempotency/dedup lookups. `/api/library/create` now performs a quota count with `.select('id', { count: 'exact', head: true }).eq(...).gte(...).lt(...)`; the stale mock threw, and the route correctly returned `503 quota_lookup_failed`.
- `entries-save*.test.ts` had the same stale `food_library_items` mocks. `/api/entries/save` now checks library-create quota before save-to-library enrichment, so the mock threw before insert/link/sketch paths. The route swallowed the enrichment error by design and still returned `200`, making assertions see no library insert/link/cache/sketch.

No evidence was found that this batch broke production save-to-library payload shape. The production routes are correctly requiring quota lookup before library creation/enrichment.

## Changes

- `tests/components/library/LibraryClient.quick-actions.test.tsx`
  - Added a controllable `authFetchMock`.
  - Defaulted `/api/library/quota` to `{ quota: { exceeded: false } }`.
- `tests/integration/library-create-cholesterol.test.ts`
  - Added mock support for the quota count chain on `food_library_items`.
- `tests/unit/api/entries-save.test.ts`
  - Added quota count-chain support to the base library-table mock, extended save-to-library mock, and insert-error override mock.
- `tests/unit/api/entries-save-sketch-enqueue.test.ts`
  - Added quota count-chain support to the library-table mock.
- `tests/unit/api/entries-save-micros-bound.test.ts`
  - Added quota count-chain support to the library-table mock.

Production source changed: none.

## Verification

Isolation:

- `pnpm vitest run tests/components/library/LibraryClient.quick-actions.test.tsx --reporter verbose` passed: 1 file / 8 tests.
- `pnpm vitest run tests/integration/library-create-cholesterol.test.ts --reporter verbose` passed: 1 file / 3 tests.
- `pnpm vitest run tests/unit/api/entries-save.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/entries-save-micros-bound.test.ts --reporter verbose` passed: 3 files / 36 tests.

Grouped library/API slice:

- `pnpm vitest run tests/components/library/LibraryClient.quick-actions.test.tsx tests/integration/library-create-cholesterol.test.ts tests/unit/api/library-create.test.ts tests/unit/api/entries-save.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/entries-save-micros-bound.test.ts --reporter verbose` passed: 6 files / 56 tests.

Static checks:

- `pnpm typecheck` passed.
- `pnpm exec prettier --check ...` passed for all touched files.

Known unrelated warning:

- `LibraryClient.quick-actions.test.tsx` still emits the existing Radix `DialogContent` description warning from the delete dialog path. It did not fail tests and was not part of this targeted worker scope.
