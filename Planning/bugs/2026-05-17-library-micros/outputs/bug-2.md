# Bug 2 — Implementation Output

## Files Touched
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\nutrition\micros-rda.ts — added `CANONICAL_CODE_TO_UNIT` frozen map built from `DEFAULT_MICROS_LIST` (single source of truth).
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\micros-rda-resolver.ts — added `canonicalMicroUnit(rawKey)` helper; pipes through `canonicalizeMicroKey` first, then case-insensitive retry on canonical-code path, then map lookup.
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx — `buildMicroRow` now calls `canonicalMicroUnit(key) ?? unitFromMicroKey(key)`; the sodium always-visible row resolves its unit through `canonicalMicroUnit('sodium')` (with the i18n literal as defensive fallback).
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\foodDetail.format.ts — `unitFromMicroKey` JSDoc updated to mark it a LEGACY FALLBACK only, documenting the canonical-path-first contract; behaviour preserved for orphan keys not in the canonical 30 (e.g. `omega3_g`).

## Tests Added/Modified
- NEW C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\dashboard\canonical-micro-unit.test.ts — 9 cases pinning the helper contract: suffixed legacy, bare canonical, uppercased canonical, mcg-suffixed, display-name, orphan, cross-unit suffix (sodium_g → undefined), canonical sodium, canonical vitamin_a (the bug-reproducer mcg case).
- EXTENDED C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx — appended `Bug 2 library micros unit display` describe block: 6 cases covering suffixed key, bare canonical, bare mcg vitamin_a, sodium always-visible row, orphan key fallback, and double-unit defensive regression.

## Test Run Result
- `canonical-micro-unit.test.ts` — 9/9 passed.
- `FoodDetailMacros.test.tsx` — 19/19 passed (13 existing Bug 8/9 + 6 new Bug 2).
- Affected-module regression sweep (`tests/unit/lib/dashboard` + `tests/components/library` + `tests/unit/components/FoodDetailMacros-cholesterol.test.tsx`): **293 tests across 44 files passed, 0 failed**. happy-dom teardown emits an unrelated `DOMException [AbortError]` after the suite reports green — it does not affect the pass/fail count.
- Pre-existing typecheck error in `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` (sugar_g object-literal typing) is unrelated and was already on `main` before this change.

## Deviations from Proposal
None — the proposal's three Step 3 fallback options included "render the value with NO unit". I picked option (2) "legacy suffix-parser fallback for orphan keys" since it preserves existing UX for `omega3_g`. No user gate triggered because the existing else-branch (no unit) is preserved verbatim as the FINAL fallback after both resolvers fail — exactly the contract the proposal specified for orphan AI-drift keys.

## ui-design prescription followed
- `planning/ui-design.md` §3.2 line 118-123 — tabular numerics utility `.num { font-variant-numeric: lining-nums tabular-nums; font-feature-settings: 'lnum' 1, 'tnum' 1 }` is MANDATORY for every numeric display. Existing `kalori-fd-micro-value num` class is unchanged; the value cell continues to render with JetBrains Mono 11px ivory tabular numerics (per design-lead §4.3, ui-design.md line 291). My fix changes ONLY the string content (adds the unit suffix) — the typography contract is untouched.
- web-ui-guide.md has no Quick-Pick table entry for "number formatting / typography / numeric labels" specifically (that table is animation libraries). Acknowledged and routed to the project's authoritative tabular-numerics spec at `ui-design.md` §3.2 instead.

## Single-source-of-truth result
`unitFromMicroKey` is **kept as legacy fallback** only — its JSDoc is updated to mark it that way, and the SINGLE production call site (`buildMicroRow`) now reads `canonicalMicroUnit(key) ?? unitFromMicroKey(key)`. Justification: the proposal explicitly recommends keeping it alive for orphan keys not in the canonical 30 (e.g. `omega3_g`), and deleting it would force the orphan path to render values with no unit — a UX regression. The canonical map is the primary resolver for all 30 canonical micros + their aliases; the suffix parser only fires for non-canonical keys. Two resolvers cannot disagree on a canonical row because the canonical path always runs first.

## Status
implemented

## Coordination note for bug 3
- `buildMicroRow` (FoodDetailMacros.tsx lines 467-489 after my edit, was lines 467-483) — I modified the unit-resolution branch at line 478: `const unit = canonicalMicroUnit(key) ?? unitFromMicroKey(key);` plus the existing format branch (`formatted = ...`). The `MicroRow` interface and the return shape are UNCHANGED.
- `MicrosReadOnly` default-row build for sodium (FoodDetailMacros.tsx lines ~498-516 after my edit) — the value cell now resolves its unit via `canonicalMicroUnit('sodium')`. The block still pushes `{ name, value, key }` to `defaultRows`. Bug 3 can layer DV-comparison onto either the `value` string or alongside it (e.g. `{value} mg · 800/2300 mg DV`) without touching the unit-resolution logic.
- For Bug 3's "30 mg / 90 mg DV" rendering: the canonical RDA is already exposed via `DEFAULT_MICROS_LIST` and `resolveMicrosRda`'s `MicroRdaRow.rda`. Bug 3 should add a `canonicalMicroRda(rawKey)` companion helper in `lib/dashboard/micros-rda-resolver.ts` next to `canonicalMicroUnit` — same shape, same alias chain, same `DEFAULT_MICROS_LIST` source-of-truth. With unit AND rda both coming from canonical, the DV line will agree with the dashboard MicrosRdaPanel by construction.
- No JSX restructure inside the `extraRows.map((r) => ...)` loop — `r.formatted` is still the only string used. Bug 3 will likely extend `MicroRow` with an `rdaPct` / `dvLabel` field; that is purely additive.
