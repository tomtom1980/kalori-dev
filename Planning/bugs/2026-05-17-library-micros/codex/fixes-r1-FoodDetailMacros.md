# Codex R1 — FoodDetailMacros.tsx fixes

## Findings addressed

- **C1** (`app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:96-97, 233-235, 537-565`) — Sodium canonical/legacy key drift between Bug 1 writer (canonical `micros.sodium`) and Bug 2/3 reader (legacy `micros.sodium_mg`). Library rows created via the new `ConfirmationItemMicros` flow had sodium fall into the extras collapsible AND lose the edit input.

## Diff summary

- **`FoodDetailMacros.tsx` (+50 / −5)**
  - Added `resolveSodiumMg(micros)` helper — canonical-first lookup (`micros.sodium`), legacy fallback (`micros.sodium_mg`), `null` when neither present.
  - Line 97: replaced `typeof micros.sodium_mg === 'number' ? micros.sodium_mg : null` with `resolveSodiumMg(...)`.
  - Line 233 (`savedSodiumMg` prop on `EditMicrosCollapsible`): same canonical resolver — fixes the "edit input cannot edit canonical sodium" half of the finding.
  - Lines 563-575 (extras-loop exclusion set): added `'sodium'` alongside `'sodium_mg'`; also added defensive `canonicalizeMicroKey(key) === 'sodium'` guard so any future sodium alias the alias map picks up also gets dropped from the collapsible.
  - Added `canonicalizeMicroKey` to the existing `@/lib/dashboard/micros-rda-resolver` import.

- **`useFoodDetailEdit.ts` (+44 / −5)**
  - Added `readSodiumMg(micros)` helper — same canonical-first contract as `resolveSodiumMg` (kept local rather than imported because the hook file is server-import-safe and the resolver re-export chain wasn't worth re-routing).
  - `itemToDraft` line 79: seeds `draft.sodium_mg` from the canonical-aware reader so the input pre-fills for `ConfirmationItemMicros`-created rows.
  - `buildFieldsPatch` line 182: `sodiumPrev` now reads via `readSodiumMg(initMicros)` instead of legacy-only, preventing a spurious "changed" diff for unchanged canonical sodium.
  - `buildFieldsPatch` save merge (line 195 onwards): writes to whichever key the row already used. Canonical `sodium` for canonical-only / drift / net-new rows (preserves Bug 1's canonical convergence). Legacy `sodium_mg` only for legacy-only rows. Drift case actively deletes the legacy duplicate so the row converges on save.

- **`FoodDetailMacros.test.tsx` (+155)**
  - Added 5 new tests under `<FoodDetailMacros /> — Codex R1 C1 sodium canonical/legacy alignment`:
    1. Canonical-only `micros.sodium = 500` renders 500 mg in always-visible row + meter aria-valuenow=22 (500/2300).
    2. Legacy-only `micros.sodium_mg = 500` continues to render identically (back-compat).
    3. Drift case (both keys): canonical wins, no double-render, single sodium row.
    4. Extras-loop exclusion: canonical sodium does NOT appear inside the collapsible expand panel.
    5. Edit mode: canonical-only sodium exposes the sodium edit input (proves "edit input cannot edit" is fixed).

## Tests added/modified

- `tests/components/library/FoodDetailMacros.test.tsx`: +5 test cases.

## Test result

- `pnpm vitest run tests/components/library/FoodDetailMacros.test.tsx`: **34 / 34 passed** (30 pre-existing + 4 new visible, plus 1 edit-mode test verifying the input renders). Initial RED-first run failed 4/4 of the new behaviour assertions (the legacy-only case stayed green throughout, confirming back-compat).
- Broader sweep (`tests/components/library tests/unit/components/log-flow tests/lib/dashboard tests/lib/nutrition`): **267 / 267 passed**.
- `pnpm tsc --noEmit`: clean.

## Commit SHA

- Local + origin: see git log after commit.

## False positives

- None. The Codex finding is real and confirmed by the RED-first behaviour. Cross-bug alignment is now enforced: Bug 1's canonical writer and Bug 2/3's reader share the same canonical-first resolver, and the hook's save path actively migrates legacy rows to canonical on edit.

## Anything surprising

- The hook had a second drift surface I had to fix beyond the rendering: `sodiumPrev` was reading legacy-only at line 182, which would have reported any canonical-sourced unchanged sodium as "changed" on save, triggering a spurious POST that wrote a duplicate `sodium_mg` next to the existing `sodium`. Codex's finding mentioned read paths only; the write-side drift was a latent regression of the same root cause.
- A linter / concurrent-session interaction once stashed and reverted my source-code edits mid-session; I recovered by `git checkout stash@{0} --` on only the 3 relevant paths so the screenshot-conflict surface never blocked the source-code restore. All 267 tests pass and the typecheck is clean.
