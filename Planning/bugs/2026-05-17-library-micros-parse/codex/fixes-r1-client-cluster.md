# Codex R1 Auto-fix — Client cluster (C1, C2, I1, I2)

## Findings addressed
- C1: Sugar dual-write stray `micros.sugar` key drift
- C2: Both-present legacy/canonical merge preserved stale legacy on legacy-first JSONB order
- I1: `validateDraft` did not validate `draft.micros`; invalid edits silently no-op or saved alongside discarded micro
- I2: Zero-value persisted micros expanded the panel into a noisy zero-row set

## False-positive check
None — all 4 are valid. C1's `micros.sugar` write was directly observable in the component's onChange handler. C2's legacy-first order failure was reproducible by inserting `{ iron_mg: 3, iron: 4 }`. I1's silent invalid-edit drop was visible in `buildFieldsPatch` (skip-without-error). I2's `'0'` string was confirmed via `itemToDraft` stringifying numeric zeros.

## Files modified
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — C1 (remove sugar+sodium onMicroChange dual-write), I2 (filter zero-string rows, two-pass canonical-precedence in render).
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` — C1 (drop stray `micros.sugar` on merge; sodium single-write reconciliation), C2 (two-pass canonical-precedence in `buildMicrosDraftBag` + `canonicalizeMicrosBag`; both helpers walk canonical pass first, alias pass second), I1 (`validateMicroValue` helper; `validateDraft` flags NaN/negative on `errs.micros`; `buildFieldsPatch` honours empty-string clears via `microClears` set; legacy-suffixed initial micros now converge to canonical on the merged-bag construction).
- `tests/unit/foodDetail/useFoodDetailEdit.editmicros.test.ts` — Added Codex R1 RED tests (C1 / C2 / I1) plus `validateDraft` micros validation tests. 14 new tests covering empty-clear, NaN/negative rejection, large-clamp, canonical-precedence (legacy-first + canonical-first orderings), and itemToDraft canonical-seed.
- `tests/components/library/FoodDetailMacros.editmicros.test.tsx` — Added Codex R1 RED tests (C1 / I2). 5 new tests covering sugar onMicroChange suppression, sodium onMicroChange suppression, sugar input value binding to `draft.sugar_g`, zero-row hidden, non-zero-row regression guard.
- `tests/unit/library/food-detail-edit-validation.test.ts` — Updated Round-2 C2 "micros survival" assertion to match new canonical-precedence contract (legacy `*_mg` keys converge to canonical `*` codes on merge; values survive verbatim; legacy aliases no longer present alongside canonical).

## Changes summary

**C1 — Sugar dual-write removal:** The sugar input's onChange used to call both `onDraftChange('sugar_g', ...)` AND `onMicroChange('sugar', ...)`. The second call wrote a non-canonical `sugar` key into `draft.micros`, which the patch builder trusted and persisted into `nutrition.micros.sugar` on every sugar edit. Sugar is a carb sub-component stored at `macros.sugar_g`, not a canonical micro. Fix: sugar input now single-writes through `onDraftChange('sugar_g', ...)` only. The patch builder additionally scrubs any stray `micros.sugar` key during merge construction (defensive — handles legacy rows where the leak already happened). Same single-write contract applied to sodium (`onDraftChange('sodium_mg', ...)` only), since the patch builder canonicalises sodium edits made via the dedicated typed field.

**C2 — Both-present canonical-precedence:** `buildMicrosDraftBag` and the merge step in `buildFieldsPatch` both used a "first iteration wins" rule when canonicalising mixed-shape JSONB. For `{ iron_mg: 3, iron: 4 }` (legacy-first JSON insertion order), iron seeded at 3 — and any unrelated nutrition edit silently overwrote canonical `iron: 4` with stale `iron_mg: 3`. Fix: new two-pass canonicalisation helpers (`buildMicrosDraftBag` + new `canonicalizeMicrosBag`). Pass 1 writes canonical keys (where `canonicalizeMicroKey(rawKey) === rawKey`). Pass 2 writes legacy / display-name aliases only where pass 1 didn't already populate the canonical slot. Result: canonical always wins, order-independent. The same two-pass rule lives in the component's render filter (`savedCanonical`).

**I1 — validateDraft + buildFieldsPatch validation:** Added `validateMicroValue(raw)` helper returning `{ kind: 'empty' | 'valid' | 'invalid' }`. `buildFieldsPatch` now: (a) treats empty strings as "clear this micro" via a `microClears` set, deleting the key from the merged bag on apply; (b) skips invalid (NaN/negative) drafted values without surfacing them in the patch — `validateDraft` catches them as a single aggregate `errs.micros` error using the existing `errMacroNonneg` i18n key. Large values still clamp to `MAX_MICRO_VALUE` (1e6) via the `kind: 'valid'` branch.

**I2 — Zero-row filter:** Two complementary fixes. (a) `buildMicrosDraftBag` skips zero values at seed time so `itemToDraft` no longer stringifies `0` into `'0'` and the draft bag stays lean. (b) The render filter in `FoodDetailMacros.EditMicrosCollapsible` parses each draft value with `Number(raw) > 0` instead of `trim() !== ''`, so `'0'` strings never expand the panel. Sugar + sodium remain always-editable regardless of value (preserves post-hoc add affordance).

## Test results
- **New RED tests:** 19 added; 19 GREEN after fix.
  - useFoodDetailEdit.editmicros: 14 new (C1: 2, C2: 3, I1: 4, validateDraft: 3, regression guards: 2).
  - FoodDetailMacros.editmicros: 5 new (C1: 3 [sugar binding, sugar onMicroChange suppression, sodium onMicroChange suppression], I2: 2 [zero hidden, non-zero regression]).
- **Existing tests:** All 360 passed across the regression sweep (tests/components/library + tests/unit/foodDetail + tests/unit/library + ConfirmationScreen + cholesterol + idrift).
- **Updated test:** `tests/unit/library/food-detail-edit-validation.test.ts`'s Round-2 C2 micros-survival test updated to match the new canonical-precedence contract — values survive verbatim, key shape converges to canonical.

## Typecheck / lint
- `pnpm typecheck`: clean (zero errors).
- `pnpm lint`: zero warnings on the 4 touched files. 35 pre-existing warnings in unrelated test files (use-is-mobile, fetch.test, sign-on-read, sign-thumbnail) — out of scope for this fix.

## Notes on dual-write removal approach
The removed `onMicroChange('sugar', ...)` and `onMicroChange('sodium', ...)` calls used to "keep the generic micros bag in sync so the rowKeys set picks it up on re-render." That coupling is no longer needed because sugar+sodium are ALWAYS in `rowKeys` (the hard-coded `rowKeys.add('sodium')` + the always-rendered sugar block guarantee both render regardless of `draft.micros` state). Removing the dual-write therefore has no UX-visible side effect on row presence — only on the JSONB-shape of the saved patch.

Sodium typed-field edits are still routed through `draft.sodium_mg` (back-compat with the existing macro-row sodium input pattern and the read-only meter), and the patch builder's `sodiumChanged` branch canonicalises them into `micros.sodium` on the wire. The dedicated `draft.sodium_mg` field stays as the single source of truth for sodium typed-input writes.

## Out of scope
- C3 (server route unbounded micros) — parallel sub-agent owns `app/api/library/[id]/update/route.ts`. Not touched in this cluster.
- Confirmation screen `EDIT_ITEM_MICRO` reducer (LM-SEC-1 followup) — different surface; unchanged.
