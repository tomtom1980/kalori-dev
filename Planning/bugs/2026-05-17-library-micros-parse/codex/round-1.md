# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship: the diff still has data-shape corruption and silent edit-loss paths in the new generic micros bag.

Findings:
- [critical] Sugar edits leak a non-canonical micros.sugar key (app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:918-922)
  The sugar input dual-writes to `sugar_g` and `onMicroChange('sugar')`. `sugar` is not a canonical micro, but the patch builder later trusts draft micro keys and writes them into `nutrition.micros`. A normal sugar edit can therefore persist both `macros.sugar_g` and stray `micros.sugar`, creating schema drift that dashboard/read paths do not canonicalize.
  Recommendation: Do not route sugar through the generic micros bag, or hard-whitelist/canonicalize draft micro keys before building `microEdits` so non-canonical keys cannot be persisted.
- [critical] Both-present legacy/canonical micros can lose the canonical value (app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:322-329)
  The merge keeps the first raw key that canonicalizes to a code and skips later duplicates. If JSONB order is `{ iron_mg: 3, iron: 4 }`, an unrelated nutrition edit rewrites the item as canonical `iron: 3`, dropping the canonical value. The same ordering-sensitive loss applies to sodium unless the dedicated sodium field changed.
  Recommendation: Make duplicate resolution deterministic with explicit precedence, preferably canonical key over display-name over legacy alias, and add both-present legacy-first tests for unrelated nutrition edits.
- [high] Invalid or cleared generic micro edits are silently discarded (app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:278-288)
  Generic micro inputs accept free text, but `validateDraft` never validates `draft.micros`, and `buildFieldsPatch` skips empty, non-finite, and negative values. A user can clear or type an invalid value into iron, click Save, and the edit either closes as a no-op or saves other fields while silently preserving the old micro value.
  Recommendation: Validate every rendered micro draft value before commit, surface field errors/focus like existing macro fields, and define clear semantics for empty values, such as reset to 0 or reject.
- [medium] Zero-valued persisted micros bypass the non-zero render rule (app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:864-870)
  The render set first filters saved values with `> 0`, but then adds every non-empty `draftMicros` key. Since `itemToDraft` stringifies numeric zeros as `'0'`, zero-filled persisted canonical bags expand to all zero-value rows, contradicting the stated persisted-non-zero rule and creating a noisy 30-input panel for zero micros.
  Recommendation: When adding draft-only row keys, only include keys absent from the saved bag or whose parsed draft value is non-zero; add a zero-filled canonical bag regression test.
- [medium] Server still accepts unbounded micro values (app/api/library/[id]/update/route.ts:76-83)
  The new clamp is only in client edit state and patch construction. The update route schema still accepts any finite nonnegative number in `nutrition.micros`, so a direct authenticated fetch can persist values far above `MAX_MICRO_VALUE` and bypass the claimed data-integrity bound.
  Recommendation: Enforce the same maximum in the server schema or normalize micros server-side before writing JSONB.

Next steps:
- Block shipment until the generic micros bag is whitelisted/canonicalized and sugar no longer writes a stray micro key.
- Add regression tests for legacy-first duplicate ordering, invalid/empty generic micro saves, zero-filled canonical bags, and direct update-route max enforcement.
