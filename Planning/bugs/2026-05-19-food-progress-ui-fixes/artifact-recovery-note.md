# Artifact Recovery Note

Date: 2026-05-19
Batch: `2026-05-19-food-progress-ui-fixes`

## Status

The permanent documentation files were written:

- `planning/CHANGELOG.md`
- `planning/bugs/2026-05-19-food-progress-ui-fixes/manifest.md`
- `planning/bugs/2026-05-19-food-progress-ui-fixes/artifact-recovery-note.md`

The source `.tmp` folder no longer exists:

- `planning/.tmp/bugfix-2026-05-19-food-progress-ui-fixes/`

## Incident

During artifact movement, the intended copy command used a wildcard with `-LiteralPath`. The command reported success but did not copy the `.tmp` tree contents into the destination. The subsequent guarded delete removed the exact intended source folder. Verification immediately after the move showed only `manifest.md` in the destination.

## Recovery Search

Checked for recoverable copies in:

- git tracked files for `planning/.tmp/bugfix-2026-05-19-food-progress-ui-fixes`
- `planning/.tmp`
- `planning/bugs`
- `C:\Users\tamas\Documents`
- `C:\Users\tamas\AppData\Local\Temp`

No duplicate markdown/report copies were found. Temp screenshot folders named `kalori-e2e-food-progress-*` still exist separately under `C:\Users\tamas\AppData\Local\Temp`, but they are not the deleted batch report documents.

## Original Artifact Inventory Observed Before Deletion

The following files were observed in the `.tmp` folder before deletion:

- `e2e-results.md`
- `final-validation.md`
- `lessons-relevant.md`
- `project-context.md`
- `release-readiness.md`
- `security-review.md`
- `state.md`
- `validation-sweep.md`
- `codex/round-1-categorized.md`
- `codex/round-1.md`
- `codex/round-2-categorized.md`
- `codex/round-2.md`
- `outputs/bug-1.md`
- `outputs/bug-2.md`
- `outputs/bug-3.md`
- `outputs/bug-4.md`
- `outputs/bug-5.md`
- `outputs/bug-6.md`
- `outputs/bug-7.md`
- `outputs/bug-8.md`
- `outputs/bug-9.md`
- `outputs/release-e2e-failure-map.md`
- `outputs/release-refix-ac6-orphan-profile.md`
- `outputs/release-refix-e2e-narrow.md`
- `outputs/release-refix-full-vitest.json`
- `outputs/release-refix-full-vitest.md`
- `outputs/security-refix-bac-timezone.md`
- `outputs/validation-refix-confirmation-testid.md`
- `outputs/validation-refix-playwright-visual-calendar.md`
- `outputs/validation-refix-release-blockers.md`
- `proposals/bug-1.md`
- `proposals/bug-2.md`
- `proposals/bug-3.md`
- `proposals/bug-4.md`
- `proposals/bug-5.md`
- `proposals/bug-6.md`
- `proposals/bug-7.md`
- `proposals/bug-8.md`
- `proposals/bug-9.md`
- `proposals/summary.md`

## Available Summary Replacement

`manifest.md` contains the per-bug summaries, tests, Codex/security/E2E summaries, release-readiness notes, and known exclusions reconstructed from the documentation outputs read before the copy/delete operation.
