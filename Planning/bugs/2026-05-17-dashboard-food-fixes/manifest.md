# Bug Bundle Manifest: 2026-05-17-dashboard-food-fixes

Date: 2026-05-18
Batch state source: `Planning/.tmp/bugfix-2026-05-17-dashboard-food-fixes/state.md`
Permanent artifact copy: `Planning/bugs/2026-05-17-dashboard-food-fixes/`

## Summary

This batch fixed six dashboard, progress, library logging, duplicate confirmation, and photo-recognition regressions. All six approved bugs were implemented. No bugs were dropped or rolled back.

The final artifact set has one verification-history caveat: `final-verification.md` records an earlier failed full-suite gate, while the later `outputs/debug-nav-final.md` records the subsequent fix and full `pnpm test -- --reporter verbose` pass. Both files are preserved for history.

Global lessons were skipped because `C:\Users\tamas\.Codex\lessonlearned.md` was missing earlier in the batch and still was not present during Phase 8 docs preparation.

## Batch Status

- Bugs fixed: 6
- Bugs dropped: 0
- Codex Round 1: Critical 0, Improvement 1, Minor 2; the Improvement was fixed.
- Codex Round 2: Critical 0, Improvement 0, Minor 2.
- Security review: clean, no blocking findings.
- Verification: typecheck and lint passed; focused batch Vitest passed; final full Vitest passed after test-isolation fixes.
- Playwright/native picker E2E: not run by this docs sub-agent; mobile camera/upload native picker behavior remains best covered by real-device smoke testing.
- Production push/deploy: not performed by this docs sub-agent.

## Bugs Fixed

### Bug 1: Dashboard Data Table Modal

- Description: Dashboard "view as data table" calorie entries still rendered as a dropdown instead of a modal card with a structured table.
- Classification: `known_fix`
- Status: implemented
- Risk: low
- UI touching: yes, dashboard chronometer data table.
- Main files:
  - `components/charts/ChronometerRing.tsx`
  - `lib/i18n/en.ts`
  - `tests/unit/components/charts/ChronometerRing.test.tsx`
  - `tests/integration/dashboard-a11y.test.tsx`
- Result: `ChronometerRing` now uses the shared `DataTableDrawer` modal rather than a native details/dropdown fallback.
- Tests: focused chronometer/dashboard note/a11y/i18n suites passed; see `outputs/bug-1.md`.

### Bug 2: Duplicate Food Confirmation

- Description: Duplicate food logged for the same meal used browser confirmation instead of an in-site confirmation popup matching the app style.
- Classification: `known_fix`
- Status: implemented
- Risk: medium
- UI touching: yes, duplicate confirmation dialog.
- Main files:
  - `components/primitives/DuplicateLogConfirmDialog.tsx`
  - `app/(app)/log/_components/ConfirmationScreen.tsx`
  - `app/(app)/library/_components/LibraryClient.tsx`
  - `app/(app)/library/_components/FoodDetail/FoodDetail.tsx`
  - `lib/i18n/en.ts`
  - `tests/unit/components/DuplicateLogConfirmDialog.test.tsx`
  - `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`
  - `tests/components/library/LibraryClient.quick-actions.test.tsx`
  - `tests/components/library/FoodDetail-LogNow-Retry.test.tsx`
- Result: duplicate-log flows now use a shared Radix in-app dialog. Confirmed retries add `allow_duplicate: true`; cancel does not retry.
- Codex R1 follow-up: bulk library logging now detects duplicate rows, opens the same in-app dialog, and retries only confirmed duplicate rows.
- Tests: focused duplicate dialog/log/library/FoodDetail suites passed; strict `window.confirm(...)` production grep passed. See `outputs/bug-2.md`.

### Bug 3: Library Default Serving Hydration

- Description: Adding fried egg from the food library used one gram instead of the saved one-large-egg serving.
- Classification: `needs_debug_shallow`
- Status: implemented
- Risk: medium
- UI touching: yes, log flow library selection.
- Main files:
  - `lib/stores/useLogFlowStore.ts`
  - `lib/library/to-log-library-item.ts`
  - `app/(app)/log/page.tsx`
  - `app/(app)/log/_components/LogPageClient.tsx`
  - `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
  - `tests/unit/library/to-log-library-item.test.ts`
  - `tests/components/library-tab-continue-cta.test.tsx`
  - `tests/components/log-flow/library-tab-preselect.test.tsx`
  - `tests/integration/log-page-library-hydration.test.tsx`
- Result: `defaultPortion` now survives library hydration and selection, defaults quantity to the saved serving, and scales nutrition by `quantity / defaultPortion`.
- Tests: focused mapper, library-tab, row preselect, and log-page hydration suites passed. See `outputs/bug-3.md`.

### Bug 4: Daily Dashboard Editor's Note

- Description: Dashboard editor's note showed incorrect weekly-review sparse copy instead of day-scoped notes and recommendations.
- Classification: `known_fix`
- Status: implemented
- Risk: medium
- UI touching: yes, dashboard editor note.
- Main files:
  - `lib/dashboard/daily-editors-note.ts`
  - `components/dashboard/DailyEditorsNote.tsx`
  - `app/(app)/dashboard/page.tsx`
  - `lib/i18n/en.ts`
  - `tests/unit/components/dashboard/DailyEditorsNote.test.tsx`
  - `tests/integration/dashboard-a11y.test.tsx`
- Result: dashboard now renders deterministic daily note copy from `DashboardSnapshot` and `viewedDay`, including empty-day guidance, outcome, recommendation, and good/needs-attention signals.
- Tests: focused dashboard note, dashboard a11y, and i18n suites passed. See `outputs/bug-4.md`.

### Bug 5: Progress Editor Note Period Awareness

- Description: Progress editor note should summarize the selected progress time period.
- Classification: `known_fix`
- Status: implemented
- Risk: medium
- UI touching: yes, progress editor note.
- Main files:
  - `app/(app)/progress/page.tsx`
  - `app/(app)/progress/_components/weekly-review-island.tsx`
  - `components/charts/WeeklyReviewCore.tsx`
  - `lib/i18n/en.ts`
  - `tests/components/progress/WeeklyReviewCore.test.tsx`
  - `tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- Result: weekly range keeps the existing Gemini/cache review path; daily and monthly ranges render deterministic period-aware notes from progress aggregates.
- Tests: focused progress editor note and profile lookup suites passed. See `outputs/bug-5.md`.

### Bug 6: Camera and Upload Image Recognition

- Description: image recognition camera/upload flows did not correctly support snapping or uploading an image for editable food recognition inputs.
- Classification: `needs_debug_shallow`
- Status: implemented
- Risk: medium
- UI touching: yes, Snap tab camera/upload inputs.
- Main files:
  - `app/(app)/log/_components/SnapTab.tsx`
  - `tests/components/log-flow/SnapTab.test.tsx`
  - `tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`
- Result: Snap tab now has separate camera and upload file inputs. Camera keeps `capture="environment"`; upload has no capture attribute. Both paths still feed the same image analysis and editable confirmation pipeline.
- Tests: focused Snap tab and AI vision integration suites passed. Native OS picker prompts were not E2E-automated. See `outputs/bug-6.md`.

## Additional Verification/Test Fixes

The batch also included test-only and generated-schema freshness fixes needed to make the full suite reliable after the implementation:

- `tests/components/library/FoodDetail-LogNow.test.tsx`
- `tests/components/library/FoodDetail-LogNow-Retry.test.tsx`
- `tests/components/nav/nav-shell.test.tsx`
- `tests/components/onboarding/WizardShell.phase3.test.tsx`
- `tests/integration/library-create.test.ts`
- `tests/integration/library-create-cholesterol.test.ts`
- `tests/unit/api/entries-save.test.ts`
- `tests/unit/api/entries-save-sketch-enqueue.test.ts`
- `tests/unit/api/entries-save-micros-bound.test.ts`
- `lib/database.types.ts`

Supporting reports:

- `outputs/test-fix-fooddetail.md`
- `outputs/test-fix-navshell.md`
- `outputs/debug-schema-drift.md`
- `outputs/debug-onboarding-fullsuite.md`
- `outputs/debug-library-api-fullsuite.md`
- `outputs/debug-library-create-final.md`
- `outputs/debug-nav-fullsuite.md`
- `outputs/debug-nav-final.md`

## Review Summary

### Codex Round 1

- Critical: 0
- Improvement: 1
- Minor: 2
- Fixed Improvement: bulk library logging duplicate responses now use the in-app confirmation and confirmed retry path.
- Deferred Minor notes: generated/local artifacts should be reviewed before staging.

### Codex Round 2

- Critical: 0
- Improvement: 0
- Minor: 2
- Deferred Minor notes:
  - Review staging scope for generated/local artifacts such as `next-env.d.ts`, `public/sw.js`, and `supabase/.temp/*`.
  - Smoke-test camera/upload picker behavior on real mobile browsers.

### Security

Security review and final delta review found no Critical, High, Medium, Low, or blocking findings. Informational notes confirm duplicate retries remain user-confirmed and authenticated, editor notes render as plain text, and camera/upload inputs keep existing authenticated image-processing paths.

## Verification Evidence

- `pnpm typecheck`: passed in final relevant runs.
- `pnpm lint`: passed with warnings only.
- Focused batch Vitest: passed, 21 files / 161 tests.
- Strict production `window.confirm(...)` grep: passed, no executable production callsites.
- `pnpm test -- --reporter verbose`: initially failed, then passed after nav full-suite isolation fix; see `outputs/debug-nav-final.md`.
- `pnpm build`: reported passed in a later status notification, but no fresh final build report was written into this artifact set by the docs sub-agent.
- Playwright/UI E2E: not run in the preserved reports after the full-suite gate was fixed.

## Historical Artifacts

Copied from `Planning/.tmp/bugfix-2026-05-17-dashboard-food-fixes/` into this permanent folder:

- `state.md`
- `project-context.md`
- `lessons-relevant.md`
- `proposals/`
- `outputs/`
- `codex/`
- `security-review.md`
- `verification-results.md`
- `final-verification.md`

The `.tmp` directory was intentionally left in place because the final verification trail was updated incrementally and should remain available until the main batch owner performs commit/deploy cleanup.

## Open Follow-Ups

- Do not stage pre-existing screenshot artifacts unless they are intentionally part of the release.
- Review generated/local artifacts before commit: `next-env.d.ts`, `public/sw.js`, and `supabase/.temp/*`.
- Real-device smoke test for iOS Safari and Android Chrome camera/upload picker behavior.
- Complete commit/push/deploy steps outside this docs-only sub-agent if not already handled.
