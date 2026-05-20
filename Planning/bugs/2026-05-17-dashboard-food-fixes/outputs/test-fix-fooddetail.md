# Targeted Failure Fix: FoodDetail Log Now AuthApiError Mock

## Scope
Fixed the full-suite failure reported for `tests/components/library/FoodDetail-LogNow.test.tsx`: the mocked `@/lib/auth/refresh-interceptor` module was missing the `AuthApiError` export required by `FoodDetail.tsx`.

## Diagnosis
This was a stale test mock, not a source regression. The production module `lib/auth/refresh-interceptor.ts` exports `AuthApiError`, and `FoodDetail.tsx` correctly imports it for duplicate-log handling. The failing test's mock needed to expose the same export shape.

## Minimal Fix
The current working tree includes the minimal test-side fix:
- `tests/components/library/FoodDetail-LogNow.test.tsx` defines `FakeAuthApiError` and returns it as `AuthApiError` from the mock.
- The directly related retry/duplicate-log test also uses the same mocked export shape.

No production source change was required.

## Verification
- `pnpm vitest run tests/components/library/FoodDetail-LogNow.test.tsx` passed: 1 file, 8 tests.
- `pnpm vitest run tests/components/library/FoodDetail-LogNow-Retry.test.tsx tests/components/library/FoodDetail-LogNow.test.tsx` passed: 2 files, 15 tests.

## Changed Paths
- `tests/components/library/FoodDetail-LogNow.test.tsx`
- `tests/components/library/FoodDetail-LogNow-Retry.test.tsx`
- `planning/.tmp/bugfix-2026-05-17-dashboard-food-fixes/outputs/test-fix-fooddetail.md`
