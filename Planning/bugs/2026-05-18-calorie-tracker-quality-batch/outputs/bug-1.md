# Bug 1 Phase 3 Output: Mobile account menu Settings and Export

## Files changed
- `components/nav/profile-menu.tsx`
- `app/(app)/settings/_components/DataSubsection.tsx`
- `tests/components/nav/profile-menu.test.tsx`
- `tests/unit/settings/page.test.tsx`

## Tests added/modified
- `tests/components/nav/profile-menu.test.tsx`
  - Added Settings menu assertion: clicking Settings calls `router.push('/settings')` and closes the menu.
  - Added Export menu assertion: clicking Export calls `router.push('/settings#data-export')` and closes the menu.
- `tests/unit/settings/page.test.tsx`
  - Added settings page assertion that the existing data/export section renders `id="data-export"`.

## Implementation notes
- `ProfileMenu` now uses the existing Next.js router pattern to navigate Settings to `/settings` and Export to `/settings#data-export`.
- The existing Sign out menu item was left unchanged.
- `DataSubsection` now exposes the stable `data-export` anchor on the existing settings data/export section.

## Commands run and results
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/nav/profile-menu.test.tsx tests/unit/settings/page.test.tsx`
  - Red run before implementation: failed as expected with no router calls and no `data-export` id.
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/nav/profile-menu.test.tsx tests/unit/settings/page.test.tsx`
  - Green run after implementation: passed, 2 files / 13 tests.

## Residual risk
- Low. This is scoped to two previously stubbed menu actions and a stable anchor on an existing section. No loading states, food logging, progress, AI summaries, or charts were touched.

## Phase 7 regression note
- `tests/components/nav/top-app-bar.test.tsx` was updated to mock `next/navigation` because `ProfileMenu` now legitimately calls `useRouter`. The targeted failed-file subset passed after this update.
