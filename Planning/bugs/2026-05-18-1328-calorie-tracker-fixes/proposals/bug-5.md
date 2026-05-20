# Bug 5: Approximate gram text for whole-style parsed servings

## Classification
actually_a_feature

STOP-THE-WORLD: This is missing product behavior, not a regression in an existing gram-display path. The current parse, persistence, and library display contracts do not carry an approximate gram-equivalent for non-gram serving units.

## Root Cause
AI text and vision parse results are validated as `name`, `portion`, `unit`, kcal, macros, micros, and confidence only. The portion-sanity layer intentionally repairs impossible tiny gram portions into whole-style units such as `piece`, `bowl`, `scoop`, or `serving`, but it does not preserve or derive an approximate gram equivalent. Library creation then persists only `default_portion` and `default_unit`, and the library card/detail views render only those fields. The UI-design guidance supports a subtle secondary portion sub-row pattern, but there is no source data for `approx. N g` today.

## Proposed Change (Diff Outline)
- Not proposed in this Phase 1 bugfix path because classification is `actually_a_feature`.
- If re-routed as feature work, define the gram-equivalent source of truth first: model-provided field, deterministic unit/item heuristic, or stored metadata in `nutrition`.
- Then add subtle static display below the serving line in confirmation, library card, and FoodDetail read/edit surfaces.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\schemas.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\portion-sanity.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\create-schema.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\fetch.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryCard.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailName.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\foodDetail.format.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`

## TDD Required
yes - if re-routed as implementation, this changes persisted/displayed food-serving semantics and multiple UI surfaces. Tests should lock both data propagation and rendered static text.

## Test Approach
- Add unit tests for any gram-equivalent formatter/helper, including null, gram-unit suppression, and whole-style units.
- Add AI schema/normalization tests if a new parse metadata field is introduced.
- Add `ConfirmationScreen` component tests proving parsed `1 piece` / `1 bowl` rows render a subtle approximate gram line below the serving control.
- Add `LibraryCard` and `FoodDetailName` component tests proving saved library rows render the same static approximate gram text in list/open/manage/edit contexts.
- Add API/schema tests if the value is persisted through `POST /api/library/create` or `POST /api/entries/save`.

## Risk Assessment
medium - the display text is low-risk visually, but the data source decision is product-significant. A naive fixed unit map could mislead users for foods where `1 piece`, `1 bowl`, or `1 serving` varies widely.

## Regression Sweep Needed
- AI text parse and vision parse response validation.
- Portion sanity repair behavior for tiny gram portions.
- Confirmation serving editor, including mobile wheel/desktop stepper paths.
- Save-to-library and library-only save paths.
- Library card list view, FoodDetail route view, and FoodDetail edit mode.
- Existing library logging defaults that rely on `default_portion/default_unit`.

## UI Touching
true - Confirmation serving display, `LibraryCard`, and `FoodDetailName`. Keep the new line static and de-emphasized under the serving text, matching the Ledger style: serif/italic or mono-small, sand/dust color, no animation. Web guide Quick-Pick: no animation library is needed; this is static text, so the Quick-Pick animation table is not applicable beyond avoiding unnecessary motion/dependency.

## Open Questions
- What is the authoritative gram source: Gemini should return an explicit approximate gram field, the app should derive it with a local heuristic, or it should be stored as optional library metadata only after user confirmation?
- Should gram-unit items suppress the secondary text because the serving already is grams?
- Should the approximate gram value scale when the user changes the confirmation portion, or remain the original parse estimate?
- Should manually created library items support this field, or only AI/photo-created rows?

## User Decision
Approximate gram text is scoped to newly recorded items going forward only. Do not retrofit existing historical entries or existing library records.

Source of truth accepted: for new AI/image-parsed items with non-gram serving units, AI should return an `approxGrams` value, and the app should persist/display that metadata. Do not use a hard-coded local conversion table for food-specific units.
