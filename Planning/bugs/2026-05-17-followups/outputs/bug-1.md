# Bug 1 (LM-I1) — Implementation Output

## Status
implemented_committed_pushed

## Commit SHA
- Local: `e496627`
- Origin: `e496627` (verified via `git log origin/main` — appears 3 commits back behind concurrent LM-SEC-1 and LM-I2 pushes; HEAD == origin/main confirms my work is on remote)

## Files Touched (2)
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — rewrote `resolveSodiumMg` (lines 110-148 post-fix) to iterate `Object.entries(micros)`, canonicalize each key via `canonicalizeMicroKey`, and apply canonical-wins precedence (`sodium` > `sodium_mg` > first alias). JSDoc updated to describe the canonical-aware contract and cite LM-I1 + lessons 2026-05-14.
- `tests/components/library/FoodDetailMacros.test.tsx` — appended `<FoodDetailMacros /> — LM-I1 display-name parity` describe block (5 tests) after the existing Codex R1 C1 sodium block.

## Tests Added (5) — All Pass
1. **`micros["Sodium"] = 500` renders 500 mg in the always-visible sodium row** — the load-bearing RED test. Pre-fix: rendered "No micronutrients recorded." because both read-path AND extras-loop excluded display-name "Sodium". Post-fix: meter renders with `aria-valuenow="22"`.
2. **canonical `micros.sodium = 500` still renders 500 mg** — regression cite (already passed pre-fix; pins rewrite did not break canonical path).
3. **legacy `micros.sodium_mg = 500` still renders 500 mg** — regression cite (already passed pre-fix; pins back-compat).
4. **drift case: `Sodium` (500) + `sodium` (100) → canonical wins (100)** — pins canonical-wins precedence under new canonicalizeMicroKey-routed path; `aria-valuenow="4"`; single sodium row only.
5. **extras loop: display-name `Sodium` does NOT appear inside collapsible** — mirrors line 776-804 pattern; pins no double-render after the read-path fix.

## TDD Compliance
RED-first confirmed: ran tests before implementation, test 1 failed with `Unable to find element by [data-testid="food-detail-micro-row-sodium"]` (the always-visible meter was absent because `resolveSodiumMg` returned `null` for display-name "Sodium"). DOM snapshot showed "No micronutrients recorded." — correct failure reason (read/exclude asymmetry, NOT import error or unrelated regression). Implementation made the test GREEN.

## Regression Sweep
- `tests/components/library/FoodDetailMacros.test.tsx` — 39/39 pass (5 new + 34 prior)
- `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` — 7/7 pass
- `tests/components/library/FoodDetail-LogNow.test.tsx` — included in 47/47 batch run
- `tests/lib/dashboard/aggregate.test.ts` — included in 47/47 batch run
- `lib/dashboard/**` test glob — 113/113 pass (13 test files)
- Pre-push hook ran full vitest suite — **1483/1483 pass** before remote accepted the push.

## Pre-commit/Pre-push
- lint-staged: prettier + eslint --fix ran clean.
- pre-push: full vitest suite (1483 tests) passed in 175s; `pre-push: ok` printed.
- No `--no-verify` used at any point.

## Risk
low (per proposal) — confirmed during implementation:
- Single function rewrite; surface (`number | null`) unchanged.
- Producer-side canonical filter at line 636 already drops display-name "Sodium" from extras, so no display-name sodium currently appears anywhere in production — fix RESTORES coverage rather than changing existing rendering.
- 5 existing sodium tests in the file kept green; new tests pin the previously-missing display-name path.
- `canonicalizeMicroKey` is a pure frozen-map lookup with no side effects; no helper modification needed.

## Anything Surprising
- Three concurrent sub-agents (LM-I1, LM-SEC-1, LM-I2) interleaved their commit-and-push cycles. First push (`e496627` = LM-I1) succeeded with full pre-push test suite; subsequent pushes from sibling sub-agents stacked cleanly without rebase/merge conflicts because each touched disjoint file sets. Final `origin/main == 42126c0` (LM-I2) with my `e496627` reachable 3 commits back. No stash-cycle wipe occurred.
- The proposal mentioned "stop-the-world if push rejected" — push was NOT rejected; the pre-push hook delayed the foreground call enough that the second redundant push call I queued earlier completed as a no-op (HEAD already on origin).
- state.md did not exist at the bugfix-tomi temp dir when I went to update it. I created it with bug-1 populated and placeholders for bugs 2/3/4 noting they're managed by sibling sub-agents — main agent may reconcile if sibling sub-agents also populate the same file.
