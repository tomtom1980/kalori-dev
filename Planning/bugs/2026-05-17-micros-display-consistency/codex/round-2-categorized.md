# Codex Round 2 — Categorized Findings

**Batch:** 2026-05-17-micros-display-consistency
**Verdict:** needs-attention
**Auto-retry signals:** none

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| Improvement | 1 |
| Minor | 0 |

---

## Critical findings

None.

---

## Improvement findings

### I2 — RDA-unknown dashboard rows render as misleading 0% low-RDA meters

- **File:** `lib/dashboard/aggregate.ts:509-517`
- **Severity:** Improvement (medium)
- **Origin:** Codex R2 (introduced by R1 C1 fix when `includeUnknownRda` was flipped to `true`)

**Description (verbatim from Codex):**

> The R1 fix correctly keeps `rda === null` rows by feeding `__helperPct: null` into the shared sorter, but the public row still carries `pct: 0` and `status: microStatus(consumed, null)`, which returns `low`. Once included, `MicrosOverflowToggle` renders that as a red/low meter with a `0%` label and aria text like `0 percent of daily reference, status below reference`. For sugar/caffeine/orphan rows, the real state is unknown/no reference, not deficient. This creates a user-visible false nutrition signal on the dashboard while library detail already omits the DV suffix for non-measurable rows.

**Recommendation (verbatim from Codex):**

> Represent RDA-unknown rows distinctly before they reach the dashboard renderer, for example by carrying an `unknown`/non-measurable status or rendering `rda === null` rows without a percent meter, low coloring, or low-status aria copy.

**Auto-fix plan (for sub-agent):**

The fix must touch the dashboard surface render path (NOT the helper, since that path is shared across surfaces and the library surface already handles `rda === null` correctly by omitting the DV suffix). The MicroRow shape leaving `aggregateMicros` should distinguish RDA-unknown rows so the renderer can:

1. Render them WITHOUT a "0%" label
2. Render them WITHOUT the red "low" color treatment / meter
3. Use neutral aria copy (e.g., "no daily reference") instead of "below reference"

Most surgical surface for this fix is the row-status pipeline. Two paths:

- **Path A:** Extend `microStatus` to return a third value `'unknown'` when `rda === null`, and update `MicrosOverflowToggle` to render `'unknown'` rows distinctly (neutral color, omit pct label, alt aria text).
- **Path B:** Keep `microStatus` 2-valued but mark the row separately (e.g., `pct: null` instead of `pct: 0`) and have the renderer detect `pct === null` and render without meter + percent label.

Sub-agent should pick the path that produces the smallest, most surgical diff. Test additions:

- Unit test: `aggregateMicros` output for sugar/caffeine retains the distinction (status !== 'low' OR pct !== 0 — depending on path chosen)
- Component test: `MicronutrientPanel` renders an RDA-unknown row with neutral treatment, no "0%" label, and no "below reference" aria text

---

## Minor findings

None.

---

## Recommendation

C=0 AND I=1 → **Dispatch one more file-scoped auto-fix, no Round 3.**

Per the bugfix-tomi 2-round cap (one initial review + one re-review after auto-fix), Round 2 is the second round. The single Improvement finding can be auto-fixed and the batch advances to Phase 6 (security review) without a Round 3 invocation — auto-fix is followed only by a localized smoke verification (regression sweep on dashboard tests + visual check that the RDA-unknown row no longer shows "0% low") rather than a full Codex pass.

If auto-fix introduces additional risk surface or the sub-agent flags a side-effect, escalate to user before Phase 6.

---

## Cross-surface consistency assertion

Codex confirmed (implicit) that the cross-surface sort order is consistent across the 3 surfaces — no drift was flagged. The only consistency problem reported is the RENDERING (not the sorting/ordering) of RDA-unknown rows on the dashboard surface. Library FoodDetail already renders RDA-unknown rows without DV suffix; Confirmation does not display RDA pct labels at all (input-driven UI). Only Dashboard renders the misleading "0% / low" treatment.

After I2 auto-fix, all 3 surfaces will render RDA-unknown rows with semantically appropriate treatment: omitted from "low" color, omitted from "0%" label, sorted to end.
