# Add Food Tab Merge — Followups

## Task 14: Visual regression baseline refresh (CI-only)

The Add Food tab merge changes the log-flow modal's tab bar from 3 columns
(TYPE / SNAP / LIBRARY) to 2 (ADD FOOD / SNAP) and adds new UI affordances:

- Library subview: search-row `+` icon button (`library-add-new-icon-button`)
  and empty-state CTA (`library-add-new-cta`).
- Parse subview: back-arrow header (`ai-parse-form-back`) that returns to the
  library subview while preserving the search term.

### Audit result — zero affected `toHaveScreenshot` baselines

A grep audit of `tests/**` for visual baselines that capture the changed
surfaces returned the following:

- **`tests/e2e/library/library-visual.spec.ts`** (24 baselines × 2 platforms
  = 48 PNGs under `library-visual.spec.ts-snapshots/`) — **NOT AFFECTED.**
  This spec snapshots the standalone `/library` PAGE route
  (`app/(app)/library/`), which uses its own `LibraryClient` +
  `LibraryEmptyState` components and has NO dependency on the log-flow
  modal's `AddFoodTab` / `LibraryList`. Verified by grepping
  `app/(app)/library` for `AddFoodTab|LogFlowTabs|log-flow|LibraryList|
  AddNewItemCTA|AddNewItemIconButton` — the only hit is a stale code
  comment in `SearchBar.tsx` referencing the old log-flow `LibraryTab`
  pattern.
- **`tests/e2e/nav-responsive.spec.ts`** visual case
  (`nav-${viewport.label}.png`) — **NOT AFFECTED.** Captures the nav shell
  surface, not the log-flow modal. Also `test.skip`-ed pending F-TEST-1
  Linux baseline bootstrap.
- **`tests/e2e/onboarding-completion.spec.ts`** visual case
  (`onboarding-results-${bp.name}.png` × 3 breakpoints) — **NOT AFFECTED.**
  Captures the onboarding wizard Step 8, unrelated to log-flow.

**No log-flow modal `toHaveScreenshot` baselines exist in the repo today.**
The `US-ADDFOOD-1` spec (Task 13) exercises the merge via interactive
assertions only — no `toHaveScreenshot()` calls — so no baselines were
created when it landed at commit `6bfdc1d`.

### What this means for CI

No baselines need refresh as part of the Add Food tab merge. The next CI
run on `main` should be visually green on the existing `*-chromium-linux.png`
baselines.

### If a future task adds modal visual coverage

If a subsequent task introduces `toHaveScreenshot()` against
`log-flow-modal`, `log-flow-tablist`, or the library/parse subviews, follow
the project's Linux-baseline contract:

```bash
pnpm playwright test --update-snapshots tests/e2e/<spec>.spec.ts
```

Run in CI on Linux only — Windows/macOS baselines fail comparison due to
platform font + subpixel rendering differences. Review the generated PNGs
to confirm only intended changes are captured before committing.

### Concurrent-session baseline collision (informational)

At the time of this audit (2026-05-17), ~32 baselines under
`tests/screenshots/user-stories/US-STAB-*-bundled/` were in working-tree
modified state from a concurrent session's micros-RDA / nav-responsive
work. Those are evidence PNGs from `page.screenshot()` calls (not
`toHaveScreenshot()` baselines), so they neither block this task nor
interact with the Add Food merge. The concurrent session owns their
commit.
