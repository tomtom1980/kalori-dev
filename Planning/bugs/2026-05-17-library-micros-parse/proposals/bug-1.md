# Bug 1: Library AI-parsed items don't show micronutrients in edit mode

## Classification

**`known_fix`** — single clear root cause, narrow surface, no debugging needed beyond what's already in this analysis.

## Theory verification

### Theory A (parse drops micros): REJECTED

The parse + persist path is fully wired and writes the AI-returned micros all the way to the DB:

1. **Prompt asks for all 30 micros.** `lib/ai/prompts.ts:110` — `MICROS_DIRECTIVE` is built at module-load from `DEFAULT_MICROS_LIST` and embedded in BOTH `FOOD_PARSE_SYSTEM` (line 160) and `VISION_SYSTEM` (line 177). Text reads:

   > "The 'micros' field is REQUIRED on every item. Return EVERY one of these canonical keys as a nonnegative number in the declared unit; emit 0 (zero) when the food contributes none of that micronutrient: …"

2. **Schema accepts + canonicalises micros.** `lib/ai/schemas.ts:75–100` — `Micros` Zod schema accepts `Record<string, nonneg finite number>`, rejects unknown keys via `superRefine`, then `.transform()` fills missing canonical keys with 0. Output is exactly 30 keys per `DEFAULT_MICROS_LIST.code`.

3. **Create body schema passes micros through.** `lib/library/create-schema.ts:58` — `micros: z.record(z.string(), z.number().nonnegative().finite()).optional()` (free-shape record). No `.pick()` / no `.omit()`.

4. **Confirmation library-only save loop forwards micros.** `app/(app)/log/_components/ConfirmationScreen.tsx:805–834` — builds `nutrition.micros = nonZeroMicros` (filters values `> 0` to avoid bloating JSONB with 30 zeros) and POSTs to `/api/library/create`.

5. **Route inserts verbatim.** `app/api/library/create/route.ts:122–142` — `insertPayload.nutrition = body.nutrition`. JSONB lands in DB as `{ kcal, macros, micros }` with micros carrying every non-zero canonical key the AI returned.

   **Net:** the parse → save path is intact. For a parsed Phở Bò item the DB row's `nutrition.micros` would contain non-zero entries like `{ sodium: 1900, iron: 4.2, vitamin_b12: 1.8, niacin: 6.5, ... }`.

### Theory B (edit-mode UI scope gap): CONFIRMED

The view-mode renders all non-zero micros, but edit-mode only exposes sugar + sodium — and even those are gated on `saved > 0`. Direct evidence:

1. **`EditMicrosCollapsible` (`FoodDetailMacros.tsx:813–894`)** ONLY renders inputs for sugar + sodium, AND only when their saved values are `> 0`:
   ```ts
   const hasSugar = savedSugarG > 0;
   const hasSodium = savedSodiumMg > 0;
   const nothingToShow = !hasSugar && !hasSodium;
   ```
   If both are zero, the collapsible renders `t.library.detail.editMicrosEmpty` ("No recorded micros") — which IS the symptom the user described as "it all shows zero." The other 28 canonical micros (potassium, calcium, iron, all vitamins, etc.) have NO edit input at all, regardless of their saved values.

2. **`DraftState` (`useFoodDetailEdit.ts:26–41`)** carries only 8 keys: `display_name`, `default_portion`, `default_unit`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `cholesterol_mg?`, `sugar_g`, `sodium_mg`. No way to express edits to the other 28 micros.

3. **`buildFieldsPatch` (`useFoodDetailEdit.ts:222–266`)** merges only `mergedMicros.sodium` (or `sodium_mg`) into the patch. Every other micro is preserved by the `{ ...initMicros }` spread but never editable.

4. **Asymmetry vs ConfirmationItemMicros.** `ConfirmationScreen.tsx:1615–1681` (`ConfirmationItemMicros`) DOES render inputs for all 30 `DEFAULT_MICROS_LIST` codes in the confirmation step — and the doc-comment at line 1604–1607 says it "mirrors" `EditMicrosCollapsible` "verbatim." It does NOT — confirmation has 30, FoodDetail edit has 2.

5. **The existing test confirms current behavior is INTENTIONAL.** `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` is a characterization test that asserts the "saved > 0 → sugar+sodium only" rule. The IDRIFT test comment block says the design is "locked-in and being relied on by adjacent code." So the bug is a planned-behavior mismatch with user expectation, not a regression.

### Mixed-cause possibility

Minor sub-issue: even after the UI is fixed, the library-only save loop's `nonZeroMicros` filter at `ConfirmationScreen.tsx:817–821` strips zero-valued micros at create time. That's a SEPARATE design choice (JSONB-bloat avoidance) that's orthogonal to this bug. The user's symptom is solved by exposing the persisted (non-zero) micros in edit-mode — they don't need to edit a `0 mg vitamin_d` to zero. Out of scope for this minimal fix.

## Root Cause

The edit-mode collapsible (`EditMicrosCollapsible` in `FoodDetailMacros.tsx`) was designed under a "saved > 0 → only sugar + sodium inputs" rule that predates the AI-parse-driven library add flow. When users add items through AI parse, the persisted `nutrition.micros` JSONB contains 10–25 non-zero canonical micros (iron, calcium, vitamin_b12, niacin, etc.), but edit-mode exposes editable inputs ONLY for sugar + sodium. The other persisted micros are silently invisible in edit-mode — so the user perceives "all micros are zero" even though the data IS in the DB. View-mode (`MicrosReadOnly`, lines 552–694) renders them correctly via `extraRows` + the Bug 9 collapsible — confirming the data is present, just unreachable in edit-mode.

## Proposed Change (Diff Outline)

Minimal-scope fix: expose every persisted non-zero micro as an editable input in edit-mode. Reuse the exact pattern + grid layout `ConfirmationItemMicros` already uses for parity with the confirmation surface the user just came from.

1. **`app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`** — replace the body of `EditMicrosCollapsible`:
   - Keep the Radix `<Collapsible.Root>` shell + trigger / panelId / labels (visual + a11y contract unchanged).
   - Replace the hardcoded sugar/sodium block with a loop over the canonical micros that EITHER appear in the persisted item with a non-zero value OR are sugar / sodium (always editable so the user can ADD them post-hoc, preserving prior "edit what's here" affordance for those two specific known-domain micros).
   - For each rendered micro: emit `<label>` + `<input>` matching today's CSS classes (`kalori-fd-input kalori-fd-input-num`). Wire `onChange` through a NEW callback on `useFoodDetailEdit` (see step 2) that updates an arbitrary micro key.
   - `nothingToShow` empty state still rendered if the persisted item carries zero non-zero micros AND sugar/sodium are both unset — but for any AI-parsed item, this branch will never fire.
   - Pass new props: `savedMicros: Record<string, number>` + a per-micro draft accessor + a per-micro change callback. Keep `savedSugarG / savedSodiumMg / draftSugarG / draftSodiumMg` for back-compat on the two known-domain inputs.

2. **`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`** — extend `DraftState` + the patch builder:
   - `DraftState.micros: Record<string, string>` — string-typed (controllable) draft for each editable micro, seeded in `itemToDraft` from `initial.nutrition.micros` (non-zero entries → stringified value, plus pre-seeded sugar+sodium logic preserved).
   - Add `setMicro(code: string, value: string)` to the returned API; binds to `<input>` onChange.
   - Update `buildFieldsPatch` to coerce + diff EVERY drafted micro against `initMicros`, build a `mergedMicros` that overlays user edits onto `{...initMicros}`, and write it through to `fields.nutrition.micros` (same shallow-replace-full-shape pattern that's already used). Preserve the canonical/legacy sodium reconciliation logic verbatim.
   - Add `setField` carve-out for the `micros.*` shape OR a separate `setMicroDraft` — either works; cleaner is a dedicated callback so `DraftKey` doesn't have to bend.
   - Update `validateDraft` to apply the same `nonneg + finite` check across each drafted micro.

3. **`tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx`** — UPDATE the characterization tests to reflect new design (this WILL break the existing test; that's the intent — the IDRIFT test was a snapshot of the OLD intentional behavior):
   - Old assertion "default-closed; expands to sugar+sodium only when saved > 0; renders empty hint otherwise" → NEW assertion "default-closed; expands to render an input for every non-zero saved micro (and always sugar + sodium even when zero); renders empty hint only when NO micros were saved AND sugar+sodium are both blank."
   - Keep the trigger + collapsed-default tests verbatim.

4. **New tests (RED → GREEN, TDD):**
   - `FoodDetailMacros.test.tsx`: edit-mode collapsible expanded by user → for a library item with `nutrition.micros = { sodium: 1900, iron: 4.2, vitamin_c: 12 }`, renders inputs for sodium, iron, vitamin_c (assert via testid `food-detail-edit-micro-<code>-input`).
   - `useFoodDetailEdit.test.ts` (new file — currently doesn't exist): `__internals.buildFieldsPatch` produces a `nutrition.micros` patch that merges drafted edits to arbitrary micros (e.g., user edits `iron` from 4.2 → 6.0) without dropping other persisted micros.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailMacros.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\useFoodDetailEdit.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.idrift-edit-micros.test.tsx` (UPDATE — characterization rewrite)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetailMacros.editmicros.test.tsx` (NEW — TDD red anchor for "renders every non-zero saved micro")
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\foodDetail\useFoodDetailEdit.editmicros.test.ts` (NEW — TDD red anchor for buildFieldsPatch round-trip)

Maybe-affected (read-only / behaviorally identical, but worth a regression sweep): `tests/components/library/FoodDetailMacros.test.tsx`, `tests/unit/components/FoodDetailMacros-cholesterol.test.tsx`, the Confirmation library-only save loop tests, and any visual baseline that captures the edit-mode micros block.

## TDD Required

**Yes** — this is logic-touching. Per `~/.claude/rules/testing.md` and the repo's TDD discipline: write the RED test FIRST in the new test files, run it to verify it fails for the correct reason (input not in DOM / patch payload missing key), then write the implementation in `EditMicrosCollapsible` + `useFoodDetailEdit`.

## Test Approach

**Unit (Vitest + RTL) — RED phase before any implementation:**

1. **`FoodDetailMacros.editmicros.test.tsx`** — RED:
   - Render `<FoodDetailMacros editing draft={...} item={item}/>` where `item.nutrition.micros = { sodium: 1900, iron: 4.2, vitamin_c: 12 }`.
   - Expand the collapsible (`userEvent.click(getByTestId('food-detail-edit-micros-trigger'))`).
   - Assert `getByTestId('food-detail-edit-micro-sodium-input')`, `food-detail-edit-micro-iron-input`, `food-detail-edit-micro-vitamin_c-input` are all present and prefilled.
   - Today fails: only sodium-input exists (Bug 9 path), iron + vitamin_c are not rendered.

2. **`useFoodDetailEdit.editmicros.test.ts`** — RED:
   - Seed `initial.nutrition.micros = { iron: 4.2, vitamin_c: 12, sodium: 1900 }`.
   - Use `__internals.itemToDraft` to build draft; mutate `draft.micros.iron = '6.0'`.
   - Call `__internals.buildFieldsPatch(initial, draft)`.
   - Assert returned `fields.nutrition.micros` is `{ iron: 6.0, vitamin_c: 12, sodium: 1900 }` (user edit applied; siblings preserved; canonical/legacy sodium reconciliation unaffected).
   - Today fails because `DraftState.micros` doesn't exist as a typed shape.

3. **`FoodDetailMacros.idrift-edit-micros.test.tsx`** — REWRITE existing characterization:
   - Old "saved > 0 gates inputs" replaced with "non-zero saved micros render inputs."
   - Keep the trigger + collapsed-default assertions verbatim (visual contract preserved).
   - Add explicit assertion that sugar + sodium are ALWAYS shown (their dedicated UX role as "known-domain" micros is preserved).

**Regression sweep — GREEN phase:**
- Run all of `tests/components/library/FoodDetailMacros*.test.tsx`.
- Run all of `tests/unit/foodDetail/*` (if any exist) — they don't, so this is fresh-file only.
- Run `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` (the library-only save loop test surface — confirms parsed micros still flow through).
- Run the visual regression baselines for `library-detail-edit` if they exist.

## Risk Assessment

**Medium.** Reasoning:

- The change DOES rewrite an intentional product-design decision (the "saved > 0 → only sugar+sodium" rule was characterized as "locked-in" by the IDRIFT test 8 hours ago at commit `d1118c9`). Replacing that test's assertions is a deliberate product change, not a bug-fix in the strict sense — the user's request reframes the intent.
- Surface is contained: 2 source files, 3 test files. No DB schema change, no API schema change, no migration. The create-route already accepts arbitrary nonneg micro keys.
- The shallow-JSONB-replace gotcha (lesson line 7 — full post-edit shape, not a diff) is already handled by `buildFieldsPatch`'s existing `{ ...initMicros }` spread; new code MUST preserve this pattern.
- Visual regression possible: edit-mode collapsible may render 5–20 input rows where before it rendered 0–2. Need to refresh visual baselines if they snap this area.
- Predecessor batch's LM-I1 / LM-I2 followups touch the same `resolveSodiumMg` / canonical-legacy sodium logic in the SAME files — careful not to revert their fix.

## Regression Sweep Needed

- `tests/components/library/FoodDetailMacros.test.tsx`
- `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` (this gets rewritten)
- `tests/unit/components/FoodDetailMacros-cholesterol.test.tsx` (cholesterol macro rendering unchanged but in same file)
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` (verify library-only save loop still produces same shape body)
- Any visual baseline named like `*food-detail*edit*` / `*library-detail*edit*`
- The currently-staged `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` working-tree modification (per `git status`) — verify our change doesn't conflict with that file's pending diff.
- `lib/library/create-schema.ts` — no change needed (already accepts arbitrary canonical-code micros).

## UI Touching

**True.** `EditMicrosCollapsible` is a UI component; the change extends the collapsible's expanded panel from 0–2 input rows to N input rows (N = count of non-zero persisted micros, plus sugar + sodium always editable). Layout uses the existing `.kalori-fd-micros-expand-grid` 2-col grid (label + input columns) — same as `ConfirmationItemMicros`. No new CSS classes needed. Visual baselines for `library-detail-edit-mode-micros-expanded` (if they exist) will need to refresh.

## Predecessor batch overlap

The archived followups batch `2026-05-17-followups` (path `Planning/.tmp/archive/bugfix-2026-05-17-followups-superseded-2026-05-17T0530Z/state.md`) has 4 pending bugs, all in this same surface:

- **LM-I1 (FoodDetailMacros `resolveSodiumMg` misses display-name 'Sodium' key)** — this bug's surface is the same function family (`resolveSodiumMg`); my fix does NOT touch `resolveSodiumMg` itself, but the new "expose every non-zero micro" loop should iterate over `initial.nutrition.micros` using `canonicalizeMicroKey` so it picks up display-name-cased keys. **MAY INCIDENTALLY RESOLVE** LM-I1 if the loop canonicalizes keys before render.
- **LM-I2 (useFoodDetailEdit canonical/legacy dedup only on sodiumChanged=true)** — same file, same `buildFieldsPatch`. My new "for every drafted micro, write back to canonical-keyed `mergedMicros`" loop, if implemented carefully, MAY INCIDENTALLY RESOLVE LM-I2 by extending the canonical/legacy dedup to all micros, not just sodium. To be safe, the fix should explicitly preserve LM-I2's intent (canonical key wins on drift) for all micros, not just sodium.
- **LM-SEC-1 (EDIT_ITEM_MICRO no upper bound)** — DIFFERENT surface (`ConfirmationScreen.tsx::EDIT_ITEM_MICRO` reducer, the confirmation step). My fix doesn't touch that surface, but the equivalent issue exists in MY new code: `setMicro(code, value)` must enforce the same upper bound as `EDIT_ITEM_MICRO` does (whatever bound is chosen — likely `< 1e6` to prevent NaN-via-string-overflow). I will mirror whatever bound the user picks for LM-SEC-1 to keep both surfaces consistent. If LM-SEC-1 hasn't shipped yet, I'll apply a defensive bound now (`Math.min(value, 1e6)` or equivalent).
- **LM-SEC-2 (mintLibraryClientId v4 fallback uses Math.random())** — UNRELATED surface; my fix doesn't touch UUID minting.

**Net:** the fix MAY incidentally close LM-I1 + LM-I2 (a good thing) if implemented carefully, and MUST add a defensive numeric upper-bound to mirror LM-SEC-1's intent in the new `setMicro` flow.

## Open Questions for user

**None — proceed with proposed fix.** The user said "make sure when we do the parsing, all the micronutrients are also added and the library item will have it." The data IS in the DB (verified above); the missing piece is exposing it in edit-mode. The minimal-scope fix gives the user exactly what they asked: open an AI-parsed item in edit, see and edit every micro the AI captured. No new capability beyond what was implied.

One micro-question if the user volunteers: "should sugar + sodium ALWAYS render (even when zero)?" — recommended default YES (preserves today's "edit what's here for known-domain micros" affordance for those two specifically, since the user can manually log sugar/sodium without an AI parse). Other 28 micros only render when non-zero. If the user wants ALL 30 ALWAYS editable like `ConfirmationItemMicros`, that's a 2-line tweak — but the minimal fix renders only the persisted non-zero ones to avoid clutter.
