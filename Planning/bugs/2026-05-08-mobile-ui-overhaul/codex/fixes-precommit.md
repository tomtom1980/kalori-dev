# Pre-commit Hook Fix — bugfix-tomi 2026-05-08-mobile-ui-overhaul

## Errors fixed

1. **MobileWheelPicker.tsx:142** (`react-hooks/set-state-in-effect`) — fix pattern: **Option A** (`useSyncExternalStore`).
   - Removed: `const [hasMounted, setHasMounted] = useState(false); useEffect(() => { setHasMounted(true); }, []);`
   - Replaced with: `useSyncExternalStore(subscribeMount, getMountSnapshot, getMountServerSnapshot)` returning `false` on the server snapshot and `true` on the client snapshot.
   - Rationale: `hasMounted` is consumed inside the second `useEffect` (and was used as a "first paint vs subsequent" branch — first render jumps `scrollTop`, later renders smooth-scroll). The flag IS read inside an effect, so `useRef` (Option C) would have worked, but `useRef` mutations don't trigger React to re-run the effect — and we DO want the smooth-scroll path to engage on the very next render after hydration. `useSyncExternalStore` is the canonical SSR-safe "post-hydration flag" pattern already used in this project (`lib/hooks/use-is-mobile.ts`, `lib/motion/defaults.ts`, etc.), so the fix matches existing conventions and avoids the cascading-render anti-pattern flagged by the rule.
   - Module-level `subscribeMount` / `getMountSnapshot` / `getMountServerSnapshot` constants keep the hook references stable across renders (no re-subscription).
   - Imports updated: removed `useState` and `UIEvent`; added `useSyncExternalStore`.

2. **MobileWheelSheet.tsx:190** (`kalori/no-inline-user-strings`) — moved "Cancel" out of JSX text via the existing prop pattern.
   - Added `cancelLabel?: string` prop (mirrors the existing `doneLabel` prop).
   - Default value `cancelLabel = 'Cancel'` lives in the destructure (TS-only — `kalori/no-inline-user-strings` is JSX-only per `eslint-rules/no-inline-user-strings.js` line 81–82, so the module-level default is safe).
   - JSX literal `Cancel` replaced with `{cancelLabel}` — same pattern as `{doneLabel}` already in the same `<footer>`.
   - Consumers (`ConfirmationScreen.tsx`, `LibraryTab.tsx`) keep their existing call signatures; they can opt in to localized copy by passing `cancelLabel={t.log.<key>}` later, but the default mirrors the previous behavior verbatim. No new i18n key required for the immediate fix.

## Warnings addressed

- `MobileWheelPicker.tsx:188` (`@typescript-eslint/no-unused-vars` on `_ev`) — **fixed**. Removed the unused parameter and the now-unused `UIEvent` import. Trivial fix while in the file.
- `ConfirmationScreen.tsx:676` (`jsx-a11y/role-supports-aria-props` for `aria-invalid` on a `<button>`) — **left as warning**. The button is a wheel-sheet trigger that participates in form validation; whether `aria-invalid` is the right semantic is a design question, not a syntactic typo. Non-blocking warning, unchanged.

## Files modified

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelPicker.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelSheet.tsx`

(`lib/i18n/en.ts` was NOT touched — the chosen prop-with-default pattern doesn't require a new key.)

## Test results

- `tests/components/primitives/MobileWheelPicker.test.tsx`: 24 / 24 passed
- `tests/integration/mobile-wheel-picker-consumers.test.tsx`: 7 / 7 passed
- Combined run: **31 / 31 passed**, no warnings, ~2.2s wall-clock
- (No dedicated `MobileWheelSheet.test.tsx` exists — sheet behavior is covered via the consumer-integration suite.)

## Lint result

- `npx eslint components/primitives/MobileWheelPicker.tsx components/primitives/MobileWheelSheet.tsx` — **0 errors, 0 warnings**
- `npx eslint "app/(app)/log/_components/ConfirmationScreen.tsx"` — 0 errors, 1 warning (pre-existing `aria-invalid` jsx-a11y warning, unchanged)
- `npx tsc --noEmit -p tsconfig.json` — **clean** (no output)

## Staging state

- Files re-staged: `components/primitives/MobileWheelPicker.tsx`, `components/primitives/MobileWheelSheet.tsx` (both `A` — they're new files in this batch).
- Original Phase 8.3 staging preserved: **yes** — 76 files staged before, 76 staged after; insertion count rose 6669 → 6699 (matches the small lines added by the 2 fixes).
- No `git restore --staged` needed; Husky's auto-revert kept staging intact.

## Ready for commit retry

- **Yes.**
