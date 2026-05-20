# Codex Round-1 Findings — Categorized

Source: `round-1.md` (verdict: needs-attention / No-ship)
Auto-retry signals: none. Review complete.

---

## Critical (3)

### C1 — Sugar dual-write leaks non-canonical `micros.sugar` key
- **File:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:918-922`
- **Verbatim finding:**
  > The sugar input dual-writes to `sugar_g` and `onMicroChange('sugar')`. `sugar` is not a canonical micro, but the patch builder later trusts draft micro keys and writes them into `nutrition.micros`. A normal sugar edit can therefore persist both `macros.sugar_g` and stray `micros.sugar`, creating schema drift that dashboard/read paths do not canonicalize.
- **Severity rationale:** Data-shape corruption — broken contract on canonical-only micros bag. Persists schema drift on every sugar edit.
- **Recommended action:** Do not route sugar through the generic micros bag, OR hard-whitelist/canonicalize draft micro keys before building `microEdits` so non-canonical keys cannot be persisted.

### C2 — Both-present legacy/canonical merge can drop canonical value
- **File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:322-329`
- **Verbatim finding:**
  > The merge keeps the first raw key that canonicalizes to a code and skips later duplicates. If JSONB order is `{ iron_mg: 3, iron: 4 }`, an unrelated nutrition edit rewrites the item as canonical `iron: 3`, dropping the canonical value. The same ordering-sensitive loss applies to sodium unless the dedicated sodium field changed.
- **Severity rationale:** Data loss — ordering-sensitive overwrite of the canonical value with the stale legacy alias during unrelated edits.
- **Recommended action:** Make duplicate resolution deterministic with explicit precedence — canonical key over display-name over legacy alias — and add both-present legacy-first tests for unrelated nutrition edits.

### C3 — Server route still accepts unbounded micro values (claimed MAX_MICRO_VALUE bypass)
- **File:** `app/api/library/[id]/update/route.ts:76-83`
- **Verbatim finding:**
  > The new clamp is only in client edit state and patch construction. The update route schema still accepts any finite nonnegative number in `nutrition.micros`, so a direct authenticated fetch can persist values far above `MAX_MICRO_VALUE` and bypass the claimed data-integrity bound.
- **Severity rationale:** Broken contract on the stated data-integrity bound (1e6 cap). Direct fetch bypass is trivial for any authenticated user.
- **Recommended action:** Enforce the same maximum in the server zod schema OR normalize micros server-side before writing JSONB.

---

## Improvement (2)

### I1 — Invalid/cleared generic micro edits silently discarded
- **File:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:278-288`
- **Verbatim finding (Codex labeled "high"):**
  > Generic micro inputs accept free text, but `validateDraft` never validates `draft.micros`, and `buildFieldsPatch` skips empty, non-finite, and negative values. A user can clear or type an invalid value into iron, click Save, and the edit either closes as a no-op or saves other fields while silently preserving the old micro value.
- **Severity rationale:** Unhandled edge case with concrete UX impact — silent edit loss, but not corruption-on-disk. Maps to Improvement per the rubric ("unhandled edge case").
- **Recommended action:** Validate every rendered micro draft value before commit, surface field errors/focus like existing macro fields, and define clear semantics for empty values (reset to 0 OR reject).

### I2 — Zero-valued persisted micros bypass the non-zero render rule
- **File:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:864-870`
- **Verbatim finding (Codex labeled "medium"):**
  > The render set first filters saved values with `> 0`, but then adds every non-empty `draftMicros` key. Since `itemToDraft` stringifies numeric zeros as `'0'`, zero-filled persisted canonical bags expand to all zero-value rows, contradicting the stated persisted-non-zero rule and creating a noisy 30-input panel for zero micros.
- **Severity rationale:** Unhandled edge case — contradicts stated render rule, UX regression for zero-filled bags. Improvement per rubric.
- **Recommended action:** When adding draft-only row keys, only include keys absent from the saved bag OR whose parsed draft value is non-zero. Add a zero-filled canonical bag regression test.

---

## Minor (0)

None reported.

---

## Auto-fix scope (file list for Phase 5 dispatch)

- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — C1, I2
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` — C2, I1
- `app/api/library/[id]/update/route.ts` — C3
- Tests to add: legacy-first ordering regression, zero-filled canonical bag, invalid/empty micro save validation, direct update-route max enforcement
