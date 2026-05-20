# Bug 1: Mobile account menu Settings and Export do not work

## Classification
known_fix

## Root Cause
`components/nav/profile-menu.tsx` still renders Settings and Export through a local `MenuItem` stub with no click handler, href, or router navigation. Logout works because it delegates to the already-wired `SignOutButton`. The implementation comment says these actions were intended to be wired later, so the current behavior is an unfinished stub rather than a routing failure.

UI guide note: this is a web app using the existing Tailwind/Radix-adjacent foundation. The web-ui-guide Quick-Pick table favors shadcn/Radix-style accessible primitives for app UI, and `Planning/ui-design.md` names Settings and Export as existing `/settings` surfaces, so the fix should reuse the current menu structure and existing Settings export UI rather than introducing a new export modal in nav.

## Proposed Change (Diff Outline)
- `components/nav/profile-menu.tsx`
  - Import `useRouter` from `next/navigation`.
  - Replace the stub-only `MenuItem` contract with a menu item that accepts `onSelect`.
  - Wire Settings to close the menu and navigate to `/settings`.
  - Wire Export to close the menu and navigate to `/settings#data-export` or the project’s chosen existing Settings data-section anchor.
  - Keep Sign out unchanged.
- `app/(app)/settings/_components/DataSubsection.tsx`
  - Add a stable `id` for the existing data/export subsection if one is not already present.
- `tests/components/nav/profile-menu.test.tsx`
  - Mock `next/navigation` router.
  - Assert clicking Settings calls `router.push('/settings')` and closes the menu.
  - Assert clicking Export calls the chosen Settings export target and closes the menu.
- `tests/unit/settings/page.test.tsx` or existing Settings subsection test
  - Assert the export subsection anchor/id exists so the account-menu deep link has a durable target.

## Files Affected
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\profile-menu.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\settings\_components\DataSubsection.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\profile-menu.test.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\settings\page.test.tsx`

## TDD Required
yes - this changes user-triggered navigation behavior and should be locked with component tests before implementation.

## Test Approach
- Add failing `ProfileMenu` tests first for Settings and Export clicks.
- Mock `useRouter().push` and verify exact destinations:
  - Settings -> `/settings`
  - Export -> `/settings#data-export` if the Settings data subsection gets that id.
- Verify the menu closes after each successful selection via `queryByRole('menu')`.
- Add/extend a Settings page/subsection test proving the export section id is rendered with the existing export buttons.

## Risk Assessment
low - the change is isolated to a stubbed menu and one stable anchor on the existing Settings export section.

## Regression Sweep Needed
- Profile menu keyboard/open-close behavior.
- Sidebar/top-app-bar account menu rendering.
- Settings page export buttons and account delete section.
- Nav audit if it validates menu link targets.

## UI Touching
true - `ProfileMenu` account dropdown and the Settings data/export section anchor. No visual redesign is needed.

## Open Questions
- Confirm the export target should be `/settings#data-export`. If a different fragment is preferred, use that consistently in the menu and Settings subsection test.
