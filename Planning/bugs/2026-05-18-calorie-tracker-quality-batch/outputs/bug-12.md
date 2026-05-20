# Bug 12: Heatmap/table cell interactions need hover value plus persistent accessible detail popup

## Status
implemented

## Summary
Split heatmap cell interactions into hover preview and persistent click/keyboard detail states. The persistent detail popup exposes dialog semantics and closes via outside click, Escape, or the icon-only X.

Cleanup pass moved the persistent detail close button accessible name from an inline `aria-label` literal into the progress heatmap i18n copy.

## Files Touched
- `components/charts/HeatmapInteractive.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- `tests/components/progress/MicronutrientHeatmap.test.tsx`

## Tests Added
- `tests/components/progress/MicronutrientHeatmap.test.tsx::hover shows a quick value tooltip and pointer leave removes it`
- `tests/components/progress/MicronutrientHeatmap.test.tsx::click opens a persistent detail popup that closes via X, outside click, and Escape`

## Verification
- `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/unit/components/dashboard/WeightQuickAdd.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm typecheck`
- `pnpm exec eslint components/charts/HeatmapInteractive.tsx`
- `pnpm vitest run tests/components/progress/MicronutrientHeatmap.test.tsx --pool threads --maxWorkers 1`
- `pnpm lint` (passes with existing warnings only)

## Recovery Review-Fix Addendum - 2026-05-18T23:05:35+07:00

- Confirmed the persistent heatmap detail surface manages focus: the close button receives focus on open, Escape/outside/X close the popup, and focus returns to the triggering cell.
- Confirmed regression coverage in `tests/components/progress/MicronutrientHeatmap.test.tsx::click opens a persistent detail popup that closes via X, outside click, and Escape`.
- UI pattern note: this remains a lightweight non-modal detail dialog/popover rather than a blocking modal; no extra animation library was needed per the web UI guide's Quick-Pick table for this accessibility-only interaction.

Focused verification:
- PASS: `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx tests/components/progress/MicronutrientHeatmap.test.tsx -- --reporter=verbose`.
