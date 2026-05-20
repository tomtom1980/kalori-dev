# Bug 1 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\useFoodDetailEdit.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetail.tsx` (1-line addition: passes `onMicroChange={edit.setMicro}` to `<FoodDetailMacros />` — required wiring; **6 files touched vs the 5-file proposal, flagged below**)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.test.tsx` (1-test patch: testid migration `food-detail-edit-sodium-input` → `food-detail-edit-micro-sodium-input` on the canonical-sodium edit-input regression test; **also out-of-proposal, flagged below**)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.idrift-edit-micros.test.tsx` (rewritten per proposal)

## Tests Added
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.editmicros.test.tsx` (8 tests — proposal §4 "renders every non-zero saved micro" + sugar/sodium always-editable + canonicalization + label-association)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\foodDetail\useFoodDetailEdit.editmicros.test.ts` (7 tests — DraftState.micros bag + buildFieldsPatch round-trip + canonical/legacy dedup + invalid-input skip)

## Tests Modified
- `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` — full rewrite per proposal. Old "saved > 0 → sugar+sodium only" rule replaced with new "every persisted non-zero micro renders an input, plus always-editable sugar + sodium." Trigger + collapsed-default assertions preserved verbatim.
- `tests/components/library/FoodDetailMacros.test.tsx` — single regression test (`'edit mode: canonical-only micros.sodium = 500 exposes the sodium edit input'`, line 806) updated to use the new canonical-keyed testid `food-detail-edit-micro-sodium-input` plus a new `draft.micros: { sodium: '500' }` seeding. Test intent unchanged — still asserts the input renders for canonical-only rows.

## Test Run Result
- FoodDetailMacros (3 files: editmicros, idrift-edit-micros, .test): **49/49 pass**
- useFoodDetailEdit (1 new file `useFoodDetailEdit.editmicros.test.ts` in `tests/unit/foodDetail/`): **7/7 pass**
- Full library suite `tests/components/library/`: **197/197 pass** (29 files)
- ConfirmationScreen `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` (reference parity): **47/47 pass** (combined with cholesterol regression)
- Combined regression sweep across `tests/components/library/`, `tests/unit/foodDetail/`, `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`, `tests/unit/components/FoodDetailMacros-cholesterol.test.tsx`: **251/251 pass** (32 files)

## Typecheck / Lint
- `pnpm typecheck` — **clean** (0 errors)
- `pnpm lint` — **0 errors** in touched files (35 pre-existing warnings repo-wide on unrelated files, none in this diff)

## Deviations from Proposal
Two scope expansions, both unavoidable for correctness:

1. **`FoodDetail.tsx` 1-line addition.** The proposal listed only `FoodDetailMacros.tsx` + `useFoodDetailEdit.ts` as the prod surfaces. But the new `onMicroChange` callback that `<FoodDetailMacros />` accepts must be wired from `<FoodDetail />` to `edit.setMicro` — there's no other path for the panel's per-micro edits to reach the hook. Single-line additive change (`onMicroChange={edit.setMicro}`), zero risk to other call sites.

2. **`FoodDetailMacros.test.tsx` 1-test patch.** The proposal's "Regression Sweep" line listed this file as read-only ("Maybe-affected"). One existing test (`'edit mode: canonical-only micros.sodium = 500 exposes the sodium edit input'`, line 806) asserted the OLD testid `food-detail-edit-sodium-input`. Since the new design renames it to `food-detail-edit-micro-sodium-input` (consistent with all other micros), the existing test had to be updated. The TEST INTENT is preserved (still asserts the sodium input renders for canonical-only rows). Net: 5 lines changed in one test case.

These two additions bring total touched files to **6 vs the proposal's 5**. Both are mechanical wiring/testid migrations directly required by the proposed design.

## Predecessor batch overlap
Status against the four `2026-05-17-followups` superseded batch items:

- **LM-I1 (FoodDetailMacros `resolveSodiumMg` misses display-name 'Sodium' key)** — **INCIDENTALLY CLOSED.** The new edit-mode render loop routes every persisted key through `canonicalizeMicroKey` before rendering, so display-name keys (`"Sodium"`) collapse onto canonical `sodium`. The `buildMicrosDraftBag` helper in `useFoodDetailEdit.ts` does the same for the draft seed path. Test coverage: `FoodDetailMacros.editmicros.test.tsx` "canonicalizes legacy unit-suffixed keys (sodium_mg)" plus an analogous direct hook-level assertion in `useFoodDetailEdit.editmicros.test.ts`. The originally-flagged read path (`resolveSodiumMg`) is unchanged but no longer the canonical-resolution surface; the new code routes through `canonicalizeMicroKey` end-to-end.
- **LM-I2 (useFoodDetailEdit canonical/legacy dedup only on sodiumChanged=true)** — **INCIDENTALLY CLOSED.** The new `buildFieldsPatch` canonicalizes EVERY initial micro key (not just sodium) before computing the merged bag, and layers user edits on top. Drift between `sodium` and `sodium_mg` for ANY micro (not just sodium) now converges on the canonical key. The dedicated `sodium`-only legacy carve-out is preserved for back-compat with the existing top-level `draft.sodium_mg` input, but is now redundant with the generic path. Test coverage: `useFoodDetailEdit.editmicros.test.ts` "preserves the LM-I2 sodium canonical/legacy dedup when sodium changes via the new micros path" — asserts at most one sodium key carries the user value after the round-trip.
- **LM-SEC-1 (EDIT_ITEM_MICRO no upper bound)** — **MIRRORED ON THE NEW SURFACE, original surface UNCHANGED.** The `setMicro` setter and `buildFieldsPatch` both clamp every drafted value to `[0, MAX_MICRO_VALUE]` where `MAX_MICRO_VALUE = 1_000_000`. The original `EDIT_ITEM_MICRO` reducer in `ConfirmationScreen.tsx` is NOT touched by this batch — the followup remains open for that specific surface, but the new edit-mode panel cannot suffer the same NaN-via-overflow attack.
- **LM-SEC-2 (mintLibraryClientId v4 fallback uses Math.random())** — **UNRELATED.** Did not touch UUID minting.

## Status
**implemented**

## Notes for Codex Review

- **Canonical/legacy seam.** The new `buildMicrosDraftBag` and `buildFieldsPatch` both route every key through `canonicalizeMicroKey` and use the canonical key as the bag key. The legacy sodium-only carve-out in `buildFieldsPatch` is preserved for back-compat with the dedicated `draft.sodium_mg` input; it overlays canonical correctly in the canonical-vs-drift case. Verify that a row with `{ sodium_mg: 1200 }` saved → user edits sodium to 1500 via the dedicated input → patch carries exactly `{ sodium_mg: 1500 }` (legacy-only branch); a row with `{ sodium: 1200 }` saved → same user edit → patch carries `{ sodium: 1500 }` (canonical branch); a row with `{ sodium: 1200, sodium_mg: 1100 }` saved → patch converges on canonical only.

- **MAX_MICRO_VALUE = 1_000_000 (1e6) clamp.** Mirrors the LM-SEC-1 followup spirit on the NEW surface. Applied at two seams: (a) `setMicro` clamps before writing to `draft.micros`, (b) `buildFieldsPatch` re-clamps as defense-in-depth before emitting to the JSONB payload. Codex may want to verify both paths agree. Note: the original `EDIT_ITEM_MICRO` reducer in `ConfirmationScreen.tsx` is NOT clamped — that remains the LM-SEC-1 followup.

- **No "Show all micros" toggle added.** The proposal allowed for an optional "Show all 30 canonical micros" expansion toggle but flagged it as optional ("Keep this minimal"). I did NOT add it. Rationale: AI-parsed items routinely have 5-20 non-zero micros — that's already a lot of inputs. Forcing the user to dig past a second toggle for the rare case of "I want to add a micro the AI didn't tag" feels worse than the trade-off of "no way to add brand-new canonical micros from this surface." If the user requests it later, a single button + state flag is ~10 lines.

- **The new edit-mode panel never falls back to an empty-state hint.** Sugar + sodium are always-editable, so the panel always renders at least 2 inputs. The previous `nothingToShow` branch (rendering `editMicrosEmpty`) became unreachable and was removed. The i18n string `editMicrosEmpty` still exists in `lib/i18n/en.ts` but has no consumer now — consider whether to drop it.

- **Sugar + sodium have TWO state sources.** Sugar reads from `draft.sugar_g` (existing top-level field) and writes BOTH `onDraftChange('sugar_g', ...)` and `onMicroChange('sugar', ...)`. Sodium similarly reads from `draft.sodium_mg` and writes BOTH. This dual-write keeps the typed top-level fields in sync with the generic `micros` bag so `buildFieldsPatch` sees a consistent shape. Risk: a future writer that reads from one but not the other could see drift. The dedicated `draft.sodium_mg`-vs-`draft.micros.sodium` sync is bound by the input's onChange handler — there's no other write path.

- **Test fixture migration.** Existing `FoodDetailMacros.test.tsx` `baseDraft` objects do NOT include the new `micros` field. Made `DraftState.micros` OPTIONAL (`micros?: Record<string, string>`) so legacy fixtures still type-check. The hook always seeds it via `itemToDraft`; the panel falls back to `{}` if absent. This optionality is the cleanest way to avoid a mass-fixture-update; the production code always has a populated bag.

- **Dirty computation deep-comparison.** Added a content-based deep compare for the `micros` bag in the `dirty` memo. Without it, `itemToDraft`'s fresh-object mint would always read dirty (top-level identity check) on first render, falsely flagging the form as having unsaved changes immediately after entering edit mode.
