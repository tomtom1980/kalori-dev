# Codex R2 Auto-fix — RDA-unknown rendering (I2)

## Finding addressed

**I2 (Improvement):** RDA-unknown dashboard rows render as misleading 0% low-RDA meters.

R1's `includeUnknownRda: true` flip correctly kept sugar / caffeine / orphan rows visible at the END of the panel's sorted list, but the public `MicroRow` shape still carried `{ pct: 0, status: 'low' }`. The renderer (`MicrosOverflowToggle`) painted them red with a "0%" label and an aria phrase of "below reference" — a user-visible false nutrition signal.

## Files modified

**Production:**
- `lib/dashboard/types.ts` — extended `MicroStatus` to add `'unknown'` (5-tuple now: `'low' | 'mid' | 'good' | 'over' | 'unknown'`)
- `lib/nutrition/display-micros.ts` — `microStatus` returns `'unknown'` (not `'low'`) for `rda === null || rda === 0`
- `lib/i18n/en.ts` — added `dashboard.micro.pctUnknownLabel` ("—"), `dashboard.micro.rowAriaLabelUnknown` ("{name}, {amount}{unit}, no daily reference"), `dashboard.micro.statusUnknown` ("no daily reference")
- `components/dashboard/MicrosOverflowToggle.tsx` — `FILL_COLOR.unknown` neutral rule, `PCT_COLOR.unknown` neutral dust, `statusWord` case for `'unknown'`, `MeterContent` branches on `isUnknownRda` to zero the bar fill and swap the percent label, `Row` swaps the aria-label template to `rowAriaLabelUnknown` when status === 'unknown'
- `components/dashboard/MicroBreakdownDialog.tsx` — `MICRO_TEXT_COLORS.unknown` neutral dust so the breakdown amounts inherit a non-red tone for RDA-unknown rows

**Tests:**
- `tests/unit/components/dashboard/MicronutrientPanel.rda-unknown.test.tsx` (NEW — 7 tests across two describe blocks)
- `tests/unit/lib/dashboard/aggregate-micros-rda-unknown.test.ts` (NEW — 3 tests)
- `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` — updated `status: 'low'` → `'unknown'` assertion + comment for orphan row
- `tests/unit/lib/nutrition/display-micros.test.ts` — updated `microStatus(50, null)` and `microStatus(50, 0)` assertions from `'low'` → `'unknown'`

## Approach

Path A (per Codex's suggestion list). Distinguishing the row at the status enum gives the renderer the smallest possible diff to branch on, without changing the public `pct` field (which is `number`, not `number | null`) and without forcing every downstream consumer to detect `rda === null` separately.

**Reference pattern (per Codex's hint):** `<MicrosReadOnly />` in `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` already distinguished `dvPct === null` rows from measurable rows in its `MicroRowDisplay` branch. The R2 fix brings the dashboard surface into parity by surfacing the same semantic distinction through the status enum, which is the cleanest seam for `MicrosOverflowToggle` (a tight 4-status `Record<MicroStatus, string>` palette table).

**Renderer contract (unchanged for measurable rows):**
- `'low' | 'mid' | 'good' | 'over'` — color-coded bar fill + integer `{pct}%` label + status-word aria copy ("below reference" / "at reference" / "over upper limit").

**Renderer contract (new for unknown rows):**
- `'unknown'` — neutral palette (`--color-rule` rail + `--color-dust` text), em-dash placeholder in the percent slot, aria copy `{name}, {amount}{unit}, no daily reference` so screen readers announce a useful value ("sugar, 25g, no daily reference") instead of the misleading "sugar, 0 percent of daily reference, status below reference".

**Status enum exhaustiveness:** `statusWord` is a `switch (status)` over `MicroStatus`, so the TypeScript exhaustiveness check forced the `'unknown'` case to be added (caught by `tsc --noEmit` and now passes cleanly).

## Concurrent-session recovery

Mid-implementation, a sibling Claude Code session stashed all my in-flight work (and the Bug 1 + Codex R1 changes that lived in the working tree). State observed:
- `git status` showed clean working tree.
- `git stash list` showed `stash@{0}: On main: task-6-push-isolate-all-concurrent-2026-05-17` and `stash@{1}: On main: task-6-push-isolate-concurrent-2026-05-17`.

Recovered via `git stash apply stash@{0}` + `git stash apply stash@{1}`. Both applied cleanly. The lost untracked component test (`MicronutrientPanel.rda-unknown.test.tsx`) was rewritten from memory (the aggregate test had landed in stash@{0} as an untracked file via `git stash push -u`, but the component test had not). All previously-applied edits to `types.ts`, `display-micros.ts`, and `en.ts` survived the recovery.

## Test results

### New tests (R2 I2 regression)

```
Test Files  4 passed (4)
Tests       28 passed (28)
```

Targeted run:
- `tests/unit/components/dashboard/MicronutrientPanel.rda-unknown.test.tsx` — 7/7 GREEN
- `tests/unit/lib/dashboard/aggregate-micros-rda-unknown.test.ts` — 3/3 GREEN
- `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` — 6/6 GREEN (the updated orphan-status assertion now expects `'unknown'`)
- `tests/unit/lib/nutrition/display-micros.test.ts` — 12/12 GREEN (the updated `null`/`0` rda assertion now expects `'unknown'`)

### Regression sweep (dashboard + nutrition)

```
Test Files  35 passed (35)
Tests       317 passed (317)
```

Includes:
- `tests/unit/components/dashboard/*` (every existing dashboard component test — `MicronutrientPanel`, `MicrosOverflowToggle-collision-boundary`, `MicrosOverflowToggle-interactive`, `MicroBreakdownDialog`, `MacroBars`, `Masthead`, etc.)
- `tests/unit/lib/dashboard/*` (every aggregator test — micros canonical, contributions, aliases, day-tz, cholesterol)
- `tests/unit/lib/nutrition/*` (every display-micros helper test — priority, formatMicroPercent, microStatus, sortMicrosByPriority, sortAndFilterMicrosByRdaPct)

### Full suite

`pnpm test` (single-worker, all 410 test files): **2972 passed, 99 skipped, 1 failed**.

The one failure — `tests/integration/focus-ring-token.test.ts` (oxblood vs ivory `:focus-visible` outline in `app/globals.css`) — is **pre-existing**, documented in `state.md::concurrent_session_observations`, and stems from a different commit (`dda828e` bottom-tab-bar). Not in scope for this batch.

## Typecheck / lint

- `pnpm typecheck` — exit 0, no output.
- ESLint on the 10 touched files — 0 errors, 1 pre-existing warning (`aggregate.ts:82` `micros7d` unused arg, unrelated to this fix).

## Confirmation

I2 closed. The R2 two-round cap is honored — no more Codex rounds. Batch advances to Phase 6 (security review).

The dashboard panel will now render:
- Iron at 22% RDA → red oxblood fill, "22%" label, aria "Iron, 22 percent of daily reference, status below reference" (unchanged).
- Sugar (no RDA) → neutral rule-colored bar with no fill, "—" label, aria "sugar, 25g, no daily reference" (NEW — was misleading "sugar, 0 percent of daily reference, status below reference").

Cross-surface consistency confirmed:
- Dashboard `MicronutrientPanel` — neutral treatment for `status === 'unknown'`.
- Library `MicrosReadOnly` — neutral treatment for `dvPct === null` (pre-existing).
- Confirmation `ConfirmationItemMicros` — input-driven UI, no pct labels (pre-existing).
