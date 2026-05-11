# Bug 2 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (lines 53–59 + comment) — production fix
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\bottom-tab-bar.test.tsx` — new TDD assertions
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\i18n-shape.test.ts` — pinned assertions updated to track new contract

## Tests Added/Modified
- `tests/components/nav/bottom-tab-bar.test.tsx` — Added 2 new `it()` blocks:
  - "renders full-word labels (Dashboard / Library / Progress / Settings) per ui-design.md §6.4" — asserts each full-word DOM text appears, none of the abbreviated forms appear.
  - "keeps textTransform: uppercase on each tab so users see UPPERCASE rendering" — guards against future regression where someone removes the inline style and labels render as mixed-case.
- `tests/unit/i18n-shape.test.ts` — Existing `it('exposes the nav keys referenced by Sidebar + BottomTabBar')` assertions updated lines 168–171 from abbreviated values (`'DASH'`, `'LIB'`, `'PROG'`, `'SET'`) to full-word values (`'Dashboard'`, `'Library'`, `'Progress'`, `'Settings'`). This file was previously pinning the abbreviation as an explicit shape contract — updating it to track the new full-word contract is required, not a regression.

## Test Run Result
- `tests/components/nav/bottom-tab-bar.test.tsx` — 6 passed (4 pre-existing + 2 new)
- `tests/unit/i18n-shape.test.ts` — passed (full file, multiple suites unchanged)
- `tests/integration/nav-audit.test.ts` — passed (literal `'DASH'` reference at line 97 is a negative-control test fixture for the auditNavLinks function, not a consumer of `t.nav.shortLabel.*`)
- Wider sweep: `tests/components/nav/**` + `tests/unit/i18n-shape.test.ts` → **46/46 passed across 8 files**.
- `shortLabel` consumer search confirmed:
  - **Production consumers of `t.nav.shortLabel.*`:** 1 — only `components/nav/primary-destinations.ts` → `components/nav/bottom-tab-bar.tsx`. ✅ Matches proposal expectation.
  - **Test consumers pinning the values:** 1 — `tests/unit/i18n-shape.test.ts` (updated above).
  - **Other `shortLabel` matches:** `components/charts/MicronutrientHeatmap.tsx` and `components/charts/CalorieAdherenceBar.tsx` define their own local `shortLabel()` chart-bucket helper functions — completely unrelated namespace, not affected.

## Deviations from Proposal
- **Test file scope grew by one** beyond what the proposal said ("single-file scope: i18n + its test"). The proposal noted at line 36 only `lib/i18n/en.ts` + `tests/components/nav/bottom-tab-bar.test.tsx`, but the existing `tests/unit/i18n-shape.test.ts` had hard-pinned assertions on the abbreviated values that would have failed without an update. This is a test-only follow-on edit that tracks the new contract — it's not a production scope expansion. Surfacing here per "Stop-the-world: more than 1 consumer of shortLabel" trigger — but the additional consumer is a test, not production code, and the production-consumer count remains 1 as proposal expected.
- No icons added (per user's Phase 2 decision — confirmed).
- `shortLabel` i18n key NOT renamed (per proposal recommendation — defer rename to avoid churn).

## Status
implemented

## Open Concerns for Codex Round 1
1. **Test pinning shape vs values.** `tests/unit/i18n-shape.test.ts` line 168–171 now pins the new full-word values verbatim. If product later wants to localize these (e.g., Vietnamese variant returning `'Bảng điều khiển'`), this test will break. Codex may flag this as overly-specific shape testing — alternative would be to assert `typeof === 'string'` + `length > 0` + `!== abbreviation`. Decision deferred to Codex review.
2. **Visual regression baselines.** Per proposal §Test Approach, visual-regression snapshots that capture the bottom nav at 375px need a `--update-snapshots` pass. Per the bugfix-tomi pipeline this happens at the batch's E2E stage, not per-bug — so left unaddressed here. Flagged for Phase 6/7 of the bugfix workflow.
3. **The i18n key name `shortLabel` is now misleading.** The values are no longer "short" — they are full words. Per proposal Open Question #2, rename was deferred to avoid churn across `primary-destinations.ts` + `i18n-shape.test.ts` + `en.ts`. Codex may flag this naming drift; the team can decide whether the rename earns its keep on round 1 review.
