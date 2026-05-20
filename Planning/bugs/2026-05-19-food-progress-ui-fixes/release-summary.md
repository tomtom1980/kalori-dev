# Release Summary: 2026-05-19 Food/Progress UI Fixes

Batch: `2026-05-19-food-progress-ui-fixes`
Date: 2026-05-19
Status: `ready_for_docs_commit`

## Scope

This bugfix-tomi batch implemented all 9 approved fixes:

1. Image recognition no-food responses now return the no-food path instead of falling through to manual detail fields.
2. Progress and dashboard data tables now have sticky opaque headers, sortable header buttons, `aria-sort`, and improved micronutrient/recommendation ordering.
3. Progress `Custom` range now opens the inline editor first, validates client-side, and applies valid `range=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` URLs without scroll jumps.
4. Tablet pull-down refresh now uses a guarded touch-event client island mounted from `NavShell`.
5. Food log future-date validation is visible above the datetime picker and remains linked by `aria-describedby`.
6. Parsed-food remove actions now sit in the final direct control position for each confirmation row.
7. Approximate gram display no longer depends on item confidence, while sanity bounds and gram-unit suppression remain.
8. Localized AI portion units now normalize to deterministic English unit labels where aliases are known.
9. Progress inline weight/date/save controls now share responsive alignment, 52px minimum height, and a narrow-screen one-column fallback.

## Review And Security

- Codex/manual review Round 1 found one responsive weight/date/save grid improvement; it was fixed.
- Codex/manual review Round 2 was clean: 0 Critical, 0 Improvement, 0 Minor.
- Security review fixed one High issue: alcohol aggregate output is capped to database-safe `volume_ml` and `alcohol_grams` bounds, with the `portion <= 100` route guard narrowed to alcoholic items.
- Security review fixed one Medium issue: dashboard/BAC timezone handling now normalizes invalid stored timezone values and falls back safely.

## Validation

Final deterministic gates passed:

- `pnpm typecheck`
- `pnpm lint` with warnings only
- `pnpm build`
- `pnpm test` with 3336 tests passed
- `pnpm test:a11y`
- `pnpm schema-drift`
- `pnpm check:bundle-budget`
- Focused Playwright and visual subsets, including AC6 coverage

E2E status:

- Focused deterministic Playwright subsets passed for the release-critical flows.
- Broad full E2E was not re-run cleanly in the final gate because Supabase auth rate limiting and missing local Firefox dominated broad failures.
- The batch remains defensible as `passed_with_infra_exclusions`, matching the manifest/changelog exclusions.

Formatting status:

- Full `pnpm format:check` has unrelated repo-wide formatting drift.
- Dirty-file formatting passed.

## Documentation Recovery

The original `planning/.tmp/bugfix-2026-05-19-food-progress-ui-fixes/` evidence tree was deleted during the Phase 8 artifact move incident. Permanent recovery docs now rely on:

- `planning/bugs/2026-05-19-food-progress-ui-fixes/manifest.md`
- `planning/bugs/2026-05-19-food-progress-ui-fixes/artifact-recovery-note.md`
- `planning/CHANGELOG.md`
- current `git status --porcelain`
- current `git diff --name-status`

The manifest preserves the release summary, per-bug outcomes, review/security notes, final readiness gates, and documented exclusions. The full deleted temp artifact contents are not recoverable from the workspace.

## Release Readiness

The release candidate is ready for careful manual staging. Do not use `git add .`; use explicit pathspecs and keep generated/runtime artifacts excluded.
