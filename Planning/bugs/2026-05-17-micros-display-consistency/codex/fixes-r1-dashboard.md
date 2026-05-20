# Codex R1 Auto-fix — Dashboard RDA-unknown (C1)

## Finding addressed
**C1 (Critical):** Dashboard excluded RDA-unknown nutrients (e.g., sugar / caffeine) via `includeUnknownRda: false`, contradicting the user-articulated cross-surface consistency rule and Codex's direct flag on `lib/dashboard/aggregate.ts:528-530`.

## False-positive check
**None — Codex was correct.** The implementation sub-agent had chosen `includeUnknownRda: false` to "preserve historic behaviour" (per the original code comment), but the user's Phase 2 clarification ("RDA-unknown ALWAYS SHOW sorted to END") was precisely the override of that historic behaviour. The dashboard was the only surface still applying the old rule, breaking the cross-surface consistency goal that is the entire premise of this batch.

## Files modified
- `lib/dashboard/aggregate.ts` — flipped helper option `includeUnknownRda: false` → `includeUnknownRda: true`; updated the two adjacent comment blocks (line ~478–481 and ~520–523) to document the new cross-surface inclusion intent.
- `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` — rewrote the prior "unknown keys filtered out" assertion (now obsolete) into a positional "orphan survives at END of list" assertion; added two NEW tests (sugar/caffeine cross-surface inclusion at end of sorted list; sub-1% RDA-having regression guard).

## Changes summary
The dashboard `aggregateMicros` function previously called `sortAndFilterMicrosByRdaPct(..., { minPct: 1, includeUnknownRda: false })`. With the flag flipped to `true`, the shared helper now keeps RDA-unknown rows (those whose `__helperPct === null`, i.e., no matching entry in the small `rdaLookup()` table) at the END of the sorted list (alphabetical among themselves), exactly as the library `<MicrosReadOnly />` and confirmation `<ConfirmationItemMicros />` surfaces already do. The `minPct: 1` filter on RDA-having rows is unchanged — sub-1% rows are still dropped so the panel stays signal-only.

The public `MicroRow` shape is unchanged: `pct: number` (always 0 for RDA-unknown rows since `formatMicroPercent(consumed, null) === 0`), `status: 'low'` for RDA-unknown rows (since `microStatus(consumed, null) === 'low'`), `rda: null` for RDA-unknown rows. The existing `MicrosOverflowToggle` renderer therefore does not require null-safety changes: it consumes only `row.pct` (number) and `row.status` (`MicroStatus`).

## Behavioral change
**Dashboard now INCLUDES RDA-unknown nutrients (e.g., sugar, caffeine, and any orphan keys like `made_up_key`) at the END of the sorted micronutrient panel list.** Previously they were filtered out entirely. This is consistent with the user's cross-surface rule articulated in Phase 2 and matches library + confirmation surfaces.

RDA-unknown rows render with `pct: 0`, `status: 'low'` (oxblood bar fill, ember % colour) — the panel's "low" presentation. UX note: this is functional but suboptimal (a zero-pct bar for a non-RDA quantity reads as a deficiency). A follow-up could differentiate visual treatment for `rda === null` rows from genuinely low-percent rows; that's out of scope for the C1 auto-fix.

## Test results
- New tests: 3/3 GREEN
  - `unknown keys (non-canonical, non-display) survive as RDA-unknown rows at the END of the list (Codex R1 C1 fix)`
  - `dashboard includes RDA-unknown nutrients (e.g., sugar) at the end of the sorted list (Codex R1 C1)`
  - `RDA-having nutrients below 1% RDA are STILL filtered out (regression guard)`
- Existing dashboard aggregate tests: 41/41 GREEN (`tests/unit/lib/dashboard/aggregate*`, 5 files)
- Dashboard component tests: 123/123 GREEN (`tests/unit/components/dashboard/`, `tests/unit/components/MicrosOverflowToggle*`, 14 files)
- Dashboard integration tests: 46/46 GREEN (`dashboard-a11y`, `dashboard-orphan-profile`, `dashboard-page-onboarding-guard`)

## Typecheck / lint
- `pnpm typecheck`: **clean** (0 errors)
- `pnpm exec eslint lib/dashboard/aggregate.ts tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts`: **0 errors, 1 warning** — the warning is a pre-existing unused-import on `micros7d` (line 82) verified to be present at HEAD before this fix; out of scope.
