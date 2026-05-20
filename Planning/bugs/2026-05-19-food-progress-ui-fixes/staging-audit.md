# Staging Audit: 2026-05-19 Food/Progress UI Fixes

Batch: `2026-05-19-food-progress-ui-fixes`
Audit source: current `git status --porcelain` and `git diff --name-status`
Date: 2026-05-19

## Current State

- Working tree is dirty and nothing should be staged with `git add .`.
- The batch docs directory is untracked as `planning/bugs/2026-05-19-food-progress-ui-fixes/`.
- BAC/alcohol dirty changes are still present and are treated as part of this release candidate.
- Generated/runtime artifacts are also dirty and should remain excluded.

## Recommended Include List

Stage the release candidate intentionally from these path families:

- App and API changes under `app/`, including dashboard, log confirmation, library, progress, AI routes, entry routes, and `app/api/dashboard/`.
- Component changes under `components/`, including charts, dashboard, nav shell, pull-to-refresh, BAC tracker, and weight quick-add.
- Library changes under `lib/`, including aggregation, AI prompt/schema/portion sanity, dashboard aggregation, alcohol aggregation, database types, i18n, and log-flow store changes.
- Test changes under `tests/`, including unit, component, integration, E2E, visual specs, visual baselines, and screenshot evidence that are intentionally part of the release candidate.
- `playwright.config.ts` if its diff is release-related.
- Permanent docs:
  - `planning/CHANGELOG.md`
  - `planning/bugs/2026-05-19-food-progress-ui-fixes/artifact-recovery-note.md`
  - `planning/bugs/2026-05-19-food-progress-ui-fixes/manifest.md`
  - `planning/bugs/2026-05-19-food-progress-ui-fixes/release-summary.md`
  - `planning/bugs/2026-05-19-food-progress-ui-fixes/staging-audit.md`

## Recommended Exclude List

Do not stage generated/runtime/local artifacts:

- `public/sw.js`
- `public/sw.js.map`
- `next-env.d.ts`
- `planning/.prime/briefing.md`
- `planning/.tmp/`
- `.tmp/`
- `.next/`
- `coverage/`
- `test-results/`
- `playwright-report/`
- `*.tsbuildinfo`
- `.env.local`

## Exact Staging Command

Use explicit pathspecs with exclusions:

```powershell
git add -- `
  app `
  components `
  lib `
  tests `
  playwright.config.ts `
  planning/CHANGELOG.md `
  planning/bugs/2026-05-19-food-progress-ui-fixes/artifact-recovery-note.md `
  planning/bugs/2026-05-19-food-progress-ui-fixes/manifest.md `
  planning/bugs/2026-05-19-food-progress-ui-fixes/release-summary.md `
  planning/bugs/2026-05-19-food-progress-ui-fixes/staging-audit.md `
  ':(exclude)next-env.d.ts' `
  ':(exclude)public/sw.js' `
  ':(exclude)public/sw.js.map' `
  ':(exclude)planning/.prime/briefing.md' `
  ':(exclude)planning/.tmp' `
  ':(exclude).tmp' `
  ':(exclude).next' `
  ':(exclude)coverage' `
  ':(exclude)test-results' `
  ':(exclude)playwright-report' `
  ':(exclude)*.tsbuildinfo' `
  ':(exclude).env.local'
```

Then audit exactly what would be committed:

```powershell
git diff --cached --name-status
git status --porcelain
```

## Red Flags Before Commit

- The visual/screenshot tree is large. Confirm every staged screenshot/baseline is intended release evidence or an intentional baseline update.
- `tests/e2e/library/library-visual.spec.ts-snapshots/merge-dialog-open-*` deletions are currently in the dirty tree; confirm those deleted baselines are intentional.
- Broad E2E has documented infra exclusions: Supabase auth rate limiting and missing local Firefox. Do not present the release as full-matrix E2E clean.
- Full repo `pnpm format:check` has unrelated formatting drift. Use the dirty-file formatting result for this release, not a repo-wide clean claim.
- Service worker files are dirty but should remain excluded unless a separate PWA build artifact commit is explicitly intended.
