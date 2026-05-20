# Codex Adversarial Review — Round 2

**Batch:** 2026-05-17-micros-display-consistency
**Invoked:** 2026-05-17 (after Phase 4 R1 C1 + I1 auto-fixes applied)
**Base ref:** HEAD (i.e., uncommitted working-tree diff)
**Mode:** review-only (no patches applied)
**Auto-retry signals:** none detected

---

## Verbatim Codex Output

```
# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship for the dashboard path: the R1 inclusion fix now exposes RDA-unknown rows, but the existing renderer presents them as 0%/low RDA instead of unknown, which is misleading user-facing nutrition feedback.

Findings:
- [medium] Improvement: RDA-unknown dashboard rows render as misleading 0% low-RDA meters (lib/dashboard/aggregate.ts:509-517)
  The R1 fix correctly keeps `rda === null` rows by feeding `__helperPct: null` into the shared sorter, but the public row still carries `pct: 0` and `status: microStatus(consumed, null)`, which returns `low`. Once included, `MicrosOverflowToggle` renders that as a red/low meter with a `0%` label and aria text like `0 percent of daily reference, status below reference`. For sugar/caffeine/orphan rows, the real state is unknown/no reference, not deficient. This creates a user-visible false nutrition signal on the dashboard while library detail already omits the DV suffix for non-measurable rows.
  Recommendation: Represent RDA-unknown rows distinctly before they reach the dashboard renderer, for example by carrying an `unknown`/non-measurable status or rendering `rda === null` rows without a percent meter, low coloring, or low-status aria copy.

Next steps:
- Escalate this R2 Improvement for the requested file-scoped follow-up review path; no patches were applied.
```

---

## Inspection commands Codex ran

- `git status --short`
- `git diff --name-only`
- `git diff --stat HEAD`
- `git diff -- lib/nutrition/display-micros.ts`
- `git diff -- lib/dashboard/aggregate.ts`
- `git diff -- 'app/(app)/log/_components/ConfirmationScreen.tsx'`
- `git diff -- 'app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx'`
- `git diff -- tests/components/library/FoodDetailMacros.test.tsx`
- `git diff -- tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts`
- Get-Content of all new/modified files (helper, dashboard aggregator, both UI surfaces, test files)
- `rg "function MicrosOverflowToggle"` (verify renderer signature)
- `rg "MicrosOverflowToggle"` (confirm dashboard panel renders RDA-unknown rows the same way as RDA-having ones)
- `rg "function microStatus"` (verify microStatus returns 'low' for rda === null)
- `rg "status: microStatus"` (count usages — confirms dashboard aggregator is the call site)
- `rg "const PCT_C"` / `rg "pctFormat|r"` (verify percent-formatter handles pct: 0 the same as any other pct)
- `rg "DEFAULT_MIC"` / `rg "EDIT_ITEM_M"` / `rg "Confirmatio"` (snapshot keyset audit on confirmation surface)
- `rg "function bu"` (verify buildFieldsPatch / dependent helpers untouched)

---

## Notes for state.md update

- Round 2 verdict: needs-attention with 1 Improvement (medium severity) — categorized below
- No Critical findings introduced by R1 fixes
- No regression of R1 findings detected — dashboard correctly sorts RDA-unknown rows to end; confirmation sort stayed frozen
- ConfirmationItemMicros useState lazy initializer: Codex did NOT flag, snapshot is correct on mount and re-captures on unmount/remount as intended
- Cross-surface consistency (sort order with identical inputs): Codex did not flag drift between the 3 surfaces
- i18n: no new strings flagged
- Visual consequences (row count): Codex did not flag row-count overflow
