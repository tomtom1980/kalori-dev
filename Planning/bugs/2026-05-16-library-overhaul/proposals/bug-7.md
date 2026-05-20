# Bug 7 — Library default sort should be Name A–Z

## Summary
- **Bug ID:** 7
- **Description (verbatim):** "When we are in the library and you view the items, it should be default sort by name A to Z."
- **User intent:** First-time landing on `/library` shows items sorted alphabetical-ascending by display name. Users may still pick any other sort manually; only the INITIAL (no-persistence) state changes.
- **Classification:** `known_fix` — single literal-string default change + test fixture updates.
- **UI Touching:** YES — changes default visible state of the `<SortDropdown />` trigger label and grid order. Cited surface: `Planning/ui-design.md:1469` (sort/filter persistence row) and `Planning/ui-design-fragments/agent-5-library.md:117` (library sort persistence contract). Neither pins `most-logged` as a contractually-required default; both speak only to persistence semantics.
- **TDD required:** YES (logic-touching default + test scaffold reflects current default).
- **Risk:** Low. One constant literal change. Existing users with a sessionStorage value at key `library:sort` keep their last choice (per `usePersistedSelection` contract — `LibraryClient.tsx:189–193`). Only no-storage / cleared-storage / first-visit sessions see the new default.
- **Stop-the-world flags:** None.

## Root cause
The library page default sort is hard-coded to `'most-logged'` in the `usePersistedSelection` fallback at `app/(app)/library/_components/LibraryClient.tsx:189–193`:

```ts
const [sort, setSort] = usePersistedSelection<LibrarySort>(
  SORT_STORAGE_KEY,
  LIBRARY_SORTS,
  'most-logged',  // ← the fallback the user wants changed to 'name-asc'
);
```

That third argument is the SOLE source of the default. The `LIBRARY_SORTS` union (`lib/library/types.ts:30–43`) already contains `'name-asc'` as a valid option, the `<SortDropdown />` (`app/(app)/library/_components/SortDropdown.tsx`) already renders `'name-asc'` with label `Name A–Z` (i18n key `sortNameAsc`, value `'Name A-Z'` at `lib/i18n/en.ts:573`), and `lib/library/filter-sort.ts` already implements the `'name-asc'` ordering. So this is a one-token change at the call site.

The sort persists via `sessionStorage` key `library:sort`. The fallback is read only when (a) first visit, (b) user cleared sessionStorage, (c) logout cleared the key, or (d) SSR pre-hydration render. For all of those, the user wants `'name-asc'`.

## Proposed change

### File 1 — `app/(app)/library/_components/LibraryClient.tsx` (1 line)
Change the `usePersistedSelection` fallback at line 192 from `'most-logged'` to `'name-asc'`.

### File 2 — `tests/integration/library-page.test.tsx` (RED → GREEN refactor)
Existing test at lines 196–213 (`'sort change reorders visible cards'`) asserts:
- "Default sort is most-logged → Banh Mi (5) first."
- After clicking `library-sort-option-name-asc`, "Apple (id=a) should be first."

This test must be rewritten to:
1. RED step: assert the FIRST visible card is `library-card-a` (Apple — alphabetically first) WITHOUT any sort interaction → fails today because default is `most-logged` so Banh Mi (most-logged=5) is first.
2. Switch to `most-logged` via the dropdown → assert reorder to Banh Mi first (preserves coverage of "sort change reorders").

### File 3 — `tests/components/library/SortDropdown.test.tsx` (no change required)
This test renders `<SortDropdown value="most-logged" />` directly (lines 12, 20, 37) — it tests the dropdown's display-of-passed-value, not the page-level default. **Leave unchanged.** Same applies to all `value="most-logged"` literals in this file: they're prop fixtures, not assertions about page defaults.

### Files to check for fixtures hard-coding the old default (defensive sweep before commit)
- `tests/unit/library/filter-sort.test.ts` — verify it doesn't assert "default = most-logged" anywhere (Grep "default" within file). If silent on defaults: leave alone.
- `tests/e2e/library/*.spec.ts` — Grep for `most-logged` + first-load assertions; update any that assume Banh Mi is the first card on initial render.

## TDD sequence
1. RED: rewrite the integration test at `library-page.test.tsx:196–213` as described — first-card assertion expects `library-card-a` BEFORE any sort interaction. Run; confirm RED with "expected library-card-a, received library-card-b" or equivalent.
2. GREEN: change `LibraryClient.tsx:192` literal `'most-logged'` → `'name-asc'`. Run the test; confirm GREEN.
3. Run the full `tests/integration/library-page.test.tsx` + `tests/components/library/SortDropdown.test.tsx` + `tests/unit/library/filter-sort.test.ts` sweep to catch any other fixture that quietly asserted the old default.
4. Run any `tests/e2e/library/*.spec.ts` locally to check for E2E fixture assumptions.

## Regression risk surface
- **Persistence users** (anyone who has interacted with the sort dropdown before) are NOT affected — `sessionStorage[library:sort]` holds their last pick. The fallback is purely first-visit behavior.
- **SSR initial render** shows the fallback (`'name-asc'`) for ALL users on every page load (because sessionStorage isn't read server-side); post-hydration the persisted value (if any) replaces it. Brief flash from `'name-asc'` to the persisted value on hydration is possible for returning users. This is the SAME behavior as today (just with `'most-logged'`); not introduced by this fix.
- No DB schema change. No API change. No CSS change. No additional dependencies.

## Out of scope (do NOT touch)
- `app/(app)/log/_components/LibraryTab.tsx` — that is the log-flow's in-modal library selector (different surface from `/library` route). The user's bug description says "When we are in the library" which maps to the `/library` route in the conversation's prior context. Leave the log-flow LibraryTab's default unchanged unless the user explicitly asks otherwise.
- The `<SortDropdown />` options list or labels (already correct; "Name A–Z" already shipped).
- The `LIBRARY_SORTS` array ordering in `lib/library/types.ts` (display order in the dropdown menu is separate concern; user didn't ask).

## Open questions
1. **Does the user also want `/log` LibraryTab default changed?** Bug description says "in the library" — could mean either surface. Default reading: `/library` route only. Confirm with user during approval gate.
2. **Should logout clear sessionStorage[library:sort]?** Out of scope for this bug (already clears per Planning/ui-design-fragments/agent-5-library.md:117 contract). Just flagging the dependency.

## Acceptance criteria
- A first-time visitor to `/library` (no `library:sort` in sessionStorage) sees items in alphabetical-ascending order by `display_name`.
- The `<SortDropdown />` trigger displays "Name A-Z" as the active label on first visit.
- Existing users with a persisted sort choice continue to see that choice (regression safety).
- All test suites green after the test fixture rewrite.

## Estimated effort
- Investigation: complete.
- Implementation + test rewrite: ~15 minutes.
- TDD verify + regression sweep: ~15 minutes.
- Total: <30 minutes wall-clock for one engineer.
