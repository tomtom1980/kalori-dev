# Bug 1 — Implementation Output (re-implementation after concurrent-session wipe)

## Status

implemented_committed_pushed

## Commit SHA

- **Local + origin (Bug 1 production code + test):** `45376f8`
- **Local + origin (push-unblock fix — pre-existing TS error in Bug 2/3 test):** `9361fe6`

Both commits verified on `origin/main` via `git log origin/main -3 --oneline`.

## Files Touched

- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/app/(app)/log/_components/ConfirmationScreen.tsx`
  - Added `Collapsible` + `DEFAULT_MICROS_LIST` imports.
  - Added `EDIT_ITEM_MICRO` action type (with reducer case that round-trips
    the value through `roundNutrition` and writes back into the row's
    `item.micros` bag).
  - Added `editMicro` callback to `ConfirmationActions` interface + wired
    through the `useCallback` + `actions` object on the context value.
  - Created `ConfirmationItemMicros` function component that renders
    Radix `Collapsible.Root` / `Trigger` / `Content` shell mirroring
    `EditMicrosCollapsible` in `FoodDetailMacros.tsx`. Self-gates on
    `meta.mode === 'library-only'` and renders all 30 canonical micros
    from `DEFAULT_MICROS_LIST` with stable per-row
    `confirmation-item-{i}-micro-{code}-input` testids.
  - Mounted `<ConfirmationItemMicros />` after `<ConfirmationItemMacros />`
    inside the row.
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/lib/i18n/en.ts`
  - **NOT touched in this re-implementation.** `confirmationItemMicrosExpandShow`
    + `confirmationItemMicrosExpandHide` keys were already committed in
    `b51cad1` (verified pre-implementation per main-agent briefing).
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/tests/components/library/FoodDetailMacros.test.tsx`
  - **Side-fix to unblock the push.** A pre-existing TS excess-property
    error on `sugar_g` (introduced by `b51cad1`, the bugs-2+3 wip commit)
    blocked the pre-push typecheck hook for ALL pushes against `origin/main`.
    Applied the same widening pattern that commit `a0879b1` used for the
    sibling IDRIFT test fixture. Pure type-cast on the literal, no behavior
    change. Test continues passing 29/29.

## Tests Added/Modified

- **Added (TDD anchor — recovered from prior wiped stash):**
  `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx`
  - `renders the micros expander trigger in library-only mode`
  - `does NOT render the micros expander trigger in the standard log flow`
  - `exposes inputs for all 30 canonical micros once the expander is open`
  - `typing a new iron value updates the row state so save POSTs the edited micro`
- **Modified (push-unblock side-fix only):**
  `tests/components/library/FoodDetailMacros.test.tsx` — widened the
  `macros: { ...baseItem.nutrition.macros!, sugar_g: 20 }` literal with
  an `as { protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number;
  cholesterol_mg?: number }` cast so tsc stops flagging the runtime-only
  field. No assertion changes.

## Test Run Result

- **Target test** (`ConfirmationItemMicros.test.tsx`): **4 passed / 0 failed**.
- **Log-flow regression sweep** (`tests/unit/components/log-flow`):
  **5 files, 66 tests, all passed**.
- **Wider log-flow regression sweep** (`tests/components/log-flow`):
  **12 files, 84 tests, all passed**.
- **FoodDetailMacros regression check**
  (`tests/components/library/FoodDetailMacros.test.tsx`):
  **29/29 passed** after the type-widening cast.
- **Pre-push hook** (typecheck + full unit suite — `pnpm test:unit`):
  TS clean, **164 files / 1433 tests, all passed** at 145.68s.

## Deviations from Proposal

- The originally-proposed proposal file
  (`planning/.tmp/bugfix-2026-05-17-library-micros/proposals/bug-1.md`)
  does not exist on the current working tree — only `outputs/` and
  `state.md` survive in the bugfix temp directory. Implementation tracked
  the previous-attempt blueprint (this file's predecessor) verbatim plus
  the test-file assertion contract.
- **Push-unblock side commit (`9361fe6`).** Strictly out-of-scope for Bug 1
  but mandated by the pre-push typecheck hook + the contractual "commit +
  push within the same sub-agent invocation" requirement against the
  concurrent-session wipe risk. Surgical 1-file type-cast widening, no
  test behavior change. Logged here + in `state.md` so main agent /
  Phase 4 Codex round can flag it explicitly.

## ui-design prescription followed

- **web-ui-guide §1 Quick-Pick Decision Table — Disclosure row:**
  "Dynamic lists, accordions, tabs → AutoAnimate. (For single-section
  show/hide with a labeled trigger, the project precedent is Radix
  `@radix-ui/react-collapsible`.)" Mirrored the exact primitive used by
  `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx::EditMicrosCollapsible`.
- **`kalori-fd-micros-expand-*` CSS namespace:** reused verbatim from the
  library-detail edit collapsible (defined in `app/globals.css` line
  ~4133). No stylesheet edits required.
- **A11y contract:** `aria-controls={useId()}` on trigger paired with
  matching `id` on `Collapsible.Content`, mirroring the
  `EditMicrosCollapsible` precedent and the `ui-design.md` §2911
  why-panel disclosure spec.

## Open Questions Resolved

- **Q1 (scope gate):** PRE-RESOLVED → library-only ONLY. New
  `<ConfirmationItemMicros />` returns `null` when
  `meta.mode !== 'library-only'`. Standard dashboard log flow is
  unchanged. Verified by the negative-assertion test which passes.
- **Q2 (i18n key file location):** Reused the
  `confirmationItemMicrosExpandShow` / `Hide` keys from `b51cad1`. No
  i18n edits in this re-implementation.
- **Q3 (stylesheet sharing):** No stylesheet edits — `kalori-fd-micros-expand-*`
  is globally defined and reused verbatim.
- **Q4 (canonical set):** Render ALL 30 canonical codes from
  `DEFAULT_MICROS_LIST` in declared order. Verified by the
  "all 30 canonical micros" test which iterates `DEFAULT_MICROS_LIST` and
  asserts each `confirmation-item-0-micro-{code}-input` is in the
  document.
- **Q5 (validation):** In-input `Number.isFinite(parsed) && parsed >= 0`
  guard + `roundNutrition` rounding inside the reducer. Empty-string
  collapses to 0 explicitly so the user can clear a value.

## Coordination notes

- Bug 1 touched ONLY `ConfirmationScreen.tsx` (production code) + the
  test file. No overlap with `FoodDetailMacros.tsx`,
  `micros-rda-resolver.ts`, or `display-micros.ts`.
- The push-unblock side commit (`9361fe6`) touched
  `tests/components/library/FoodDetailMacros.test.tsx` (Bug 2/3 test
  territory) — pure type-widening, no behavior change.
- The concurrent session has since added a local-only commit `dda828e`
  (bottom-tab-bar lucide icons, batch `bugfix-2026-05-17-mobile-bottom-nav`)
  on top of my Bug 1 + push-unblock commits. Their work has NOT been
  pushed yet. Surface to main agent as a tracking note but it is not my
  responsibility to push or merge it.

## Anything surprising

- **Wipe-event recurrence:** Confirmed the previous-attempt output's
  warning. The earlier session's working-tree fixes to Bug 1 (in
  `ConfirmationScreen.tsx`) had been wiped before my invocation started.
  Test file (`ConfirmationItemMicros.test.tsx`) survived (recovered from
  stash@{0}) and served as the TDD anchor.
- **Pre-push hook flagged a Bug 2/3-introduced TS error.** Documented +
  fixed surgically (commit `9361fe6`) since:
  (a) it was the only barrier to pushing Bug 1 work onto origin before
  another wipe cycle, and
  (b) the precedent (`a0879b1`) for the same surgical widening pattern
  is on the project's own history.
- **Lint-staged is wrapping every commit in its own stash.** Visible in
  the commit-time output. Not destructive — the stash unwinds after the
  staged tasks complete and the commit lands cleanly. Worth main agent
  awareness because it's another stash entry visible in `git stash list`
  during the next session's audit.
