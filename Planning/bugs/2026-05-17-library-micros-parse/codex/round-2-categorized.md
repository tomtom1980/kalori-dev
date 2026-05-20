# Codex Round 2 — Categorized Findings

**Date:** 2026-05-17
**Diff base:** HEAD (uncommitted working tree)
**Verdict from Codex:** needs-attention ("No-ship")
**Auto-retry signals:** none detected
**Review scope:** Full aggregate diff (Phase 3 implementation + R1 fixes)

## Counts

| Severity | Count |
|---|---|
| Critical | 2 |
| Improvement | 2 |
| Minor | 0 |

## Mapping note

Codex emits its own severity tags. Per the standard bugfix-tomi severity rule:
- `[critical]` → **Critical**
- `[medium]` → **Improvement**
- `[low]` / `[minor]` → **Minor**

Both `[medium]` findings here are functional gaps (not stylistic / cosmetic), so they remain **Improvement**, not Minor.

---

## Critical (2)

### C2-R2-1 — Save-to-library bypasses MAX_MICRO_VALUE bound (app/api/entries/save/route.ts:56)

**Verbatim:**
> The C3 cap was added to /api/library/create and /api/library/[id]/update, but /api/entries/save can also create food_library_items when save_to_library is true. Its item schema still accepts micros as arbitrary numbers, then writes firstItem.micros directly into the library row. An authenticated direct POST can therefore persist nutrition.micros values above 1,000,000 by saving an entry with save_to_library, bypassing the claimed server-side integrity bound.

**Why critical:** This is a direct regression of the C3 R1 intent. The R1 fix was scoped to update + create but the entries-save route is a third mutation surface that writes the same `food_library_items.nutrition.micros` JSON column. A direct authenticated POST to `/api/entries/save` with `save_to_library: true` and unbounded micros persists oversized values to the same column the C3 cap was meant to protect — defeating the integrity claim across the row.

**Affected files:**
- `app/api/entries/save/route.ts` (production)
- `ParsedItemSchema` (or whichever schema validates `firstItem.micros`)

**Recommended fix surface:** Apply the same `z.number().finite().nonnegative().max(MAX_MICRO_VALUE)` to ParsedItemSchema.micros, OR refactor save-to-library to flow through the shared library nutrition schema before insertion.

---

### C2-R2-2 — Merge route can write unbounded micros (app/api/library/merge/route.ts:69)

**Verbatim:**
> The merge endpoint accepts fields.nutrition.micros with z.record(z.string(), z.number()) and forwards resolvedFields into library_merge_atomic. Because merge updates the winner library item's nutrition, this is another library-item mutation path without the C3 max bound, and it also lacks finite/nonnegative checks. A crafted merge payload can persist oversized or negative micro values despite the update/create fixes.

**Why critical:** Same class of vulnerability as C2-R2-1 but via a different mutation route. Merge accepts `z.record(z.string(), z.number())` with no max, no finite, no nonnegative — strictly weaker than even the pre-R1 update/create schemas. Negative micros + oversized micros both possible. The merge RPC `library_merge_atomic` updates the winner library item's nutrition JSON.

**Affected files:**
- `app/api/library/merge/route.ts` (production)

**Recommended fix surface:** Use the same bounded micros schema (or import it from `lib/library/create-schema.ts`) before passing fields to the merge RPC.

---

## Improvement (2)

### I2-R2-1 — Negative micro input clamped before validation (useFoodDetailEdit.ts:589-601)

**Verbatim:**
> validateMicroValue treats negative drafted micros as invalid, but the actual UI setter normalizes any finite negative value with Math.max(n, 0) and stores '0'. That means typing -5 into a generic micro input never reaches validateDraft as invalid; it becomes a valid zero and can overwrite the saved micro. This regresses the I1 goal of rejecting invalid inputs on the real edit path.

**Why improvement (not critical):** Data integrity is preserved (zero is a valid micro value), but the I1 R1 goal — "reject invalid inputs" — is bypassed because the setter silently coerces. The user's intent (typing -5) is lost; their save is silently treated as "clear to zero". UX gap, not data corruption.

**Affected files:**
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:589-601` (setMicro setter)

**Recommended fix surface:** Remove `Math.max(n, 0)` clamp in setMicro for negatives; preserve raw string so validateDraft blocks the save with a clear error. Upper-bound clamp at MAX_MICRO_VALUE may remain if intentional.

---

### I2-R2-2 — Generic micro validation errors have no focus or aria-invalid target (useFoodDetailEdit.ts:535)

**Verbatim:**
> validateDraft now sets errs.micros for invalid generic micro values, but the commit focus order stops at sodium_mg and never includes micros. The generic micro inputs also do not read errors.micros for aria-invalid or render an associated alert. The result is a blocked save with no focused field and no visible per-field error for inputs like 'abc' in iron, which is an accessibility and recoverability regression on the new edit surface.

**Why improvement (not critical):** Save is correctly blocked (data integrity preserved) but no focus / no aria-invalid / no error rendering means the user has no recoverability path. Click "Save", nothing happens, no field highlighted, no error message. Accessibility regression on a surface that already enforces label-control associations and field-level error rendering for other inputs (cal/p/c/f).

**Affected files:**
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:535` (commit flow / focus order)
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (micro input rendering — needs aria-invalid + errors.micros[key] read + error alert)

**Recommended fix surface:** Track the offending canonical micro key in `errs.micros[key]` (already partly present), include micros in commit focus order, mark relevant input aria-invalid, render associated visible error.

---

## Minor (0)

None surfaced in this round.

---

## Auto-retry verification

Scanned the full verbatim Codex stdout for the following signals:
- `Input exceeded 1MB` — **not present**
- `Retrying with tighter scope` — **not present**
- `production files only` — **not present**
- `spec context trimmed` — **not present**

Review is **COMPLETE**, not auto-trimmed. Concrete file paths + line numbers + specific schema-level references confirm Codex had full source access.

---

## Recommendation per bugfix-tomi 2-round cap rule

- **Critical=2, Improvement=2** after R2.
- The 2-round cap is now exhausted (R1 + R2 = 2 rounds).
- **ESCALATE to user**: critical findings remain after R2.

The Critical findings (C2-R2-1, C2-R2-2) are scope-expansion findings — they identify two NEW routes (entries/save and library/merge) outside the original bug scope that share the same MAX_MICRO_VALUE vulnerability class as C3. Although the original bug (parse → micros drop) is fixed, the integrity claim of the C3 fix is incomplete across mutation surfaces.

User must decide:
1. **Expand scope**: auto-fix both Critical findings in a third pass (would violate 2-round cap) → recommend escalating to a separate bugfix batch.
2. **Defer**: file Critical findings + both Improvements as pending P0/P1 follow-ups, ship the in-scope fixes.
3. **Block ship**: refuse to commit until C2-R2-1 and C2-R2-2 are resolved (most conservative).
