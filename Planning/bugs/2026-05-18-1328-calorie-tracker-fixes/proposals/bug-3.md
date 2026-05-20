# Bug 3: AI parse details should show micronutrients

## Classification
`known_fix`

This is a shallow display-path omission, not deep debugging. The AI parse schema already returns canonical micronutrients on every parsed item, and the confirmation state already carries those `items` into the AI details surface. The details component simply does not receive or render any micronutrient rows.

## Bug
AI food parsing details should show micronutrients: the minimal view should show the top micronutrient by percentage of RDA, and an expand/collapse control should show all relevant micronutrients.

## Relevant Existing Behavior
- `lib/ai/schemas.ts` defines `ParsedItem.micros` as the canonical micronutrient map and fills missing canonical keys with `0`.
- `app/(app)/log/_components/LogFlowTabs.tsx` forwards text-parse items into `ConfirmationScreen`; photo parse currently forwards items but sets `reasoning: null`, so the existing `WhyTheseNumbers` details surface only appears for text unless photo reasoning is wired separately.
- `app/(app)/log/_components/ConfirmationScreen.tsx` renders `Confirmation.Reasoning` as `<WhyTheseNumbers source={meta.source} reasoning={meta.reasoning} />`, so parsed item micronutrients are not available to that component.
- `app/(app)/log/_components/WhyTheseNumbers.tsx` renders narrative, ingredient confidence, sources, and low-confidence footnote only. No macro or micronutrient display exists there.
- `lib/nutrition/display-micros.ts` already exports `formatMicroPercent` and `sortAndFilterMicrosByRdaPct`, which match the needed “top by percentage” rule.
- `components/dashboard/MicrosOverflowToggle.tsx` is the existing minimal-plus-expand pattern: render `rows.slice(0, visibleCount)`, then use an `aria-expanded` button to reveal hidden rows.

## Root Cause
`WhyTheseNumbers` is the AI parse details disclosure, but its props are limited to:

```ts
source: 'text' | 'photo' | 'library' | 'manual';
reasoning: string | ReasoningPayload | null;
```

The component has no access to `state.rows[].item.micros`, `DEFAULT_MICROS_LIST`, or the display helper used elsewhere. As a result, even when text/photo parse results contain micronutrients, the details disclosure cannot show them.

## Proposed Change
Keep the change inside the existing confirmation/details surface:

1. Extend `WhyTheseNumbersProps` with an optional `items?: ParsedItemT[]` or narrower `{ micros?: Record<string, number> }[]`.
2. In `ConfirmationScreen.Reasoning`, pass `state.rows.map((row) => row.item)` into `WhyTheseNumbers`.
3. Inside `WhyTheseNumbers`, aggregate item micros by canonical code, join against `DEFAULT_MICROS_LIST`, compute `pct = formatMicroPercent(total, micro.rda)`, and call `sortAndFilterMicrosByRdaPct(rows)` so rows under 1% are hidden and rows sort by percent descending.
4. Render the top row inside the expanded details content as the minimal nutrient summary; if more rows exist, render a secondary `button` with `aria-expanded` / `aria-controls` that toggles the remaining rows.
5. Do not render the micronutrient section when no row survives the existing `<1%` filter, or when `source` is `manual` / `library`.

Recommended display copy: compact, factual labels such as `Top micronutrient` and `Show all micronutrients ({n})`; add strings to `lib/i18n/en.ts` rather than inline text.

## UI / Animation Guidance
UI-touching: `true`.

Relevant Quick-Pick table citation from `web-ui-guide.md`: **“Dynamic lists, accordions, tabs → AutoAnimate → 3.3 KB → Zero config, any framework.”** For this bug, do not add AutoAnimate unless a polished list enter/exit animation is explicitly desired in Phase 2. The existing project pattern already uses Radix `Collapsible` plus CSS caret rotation/reduced-motion guards for single-section disclosure, so the lowest-risk implementation is React state + existing CSS/Radix-style disclosure semantics, with no new animation dependency.

## Files Likely Affected
- `app/(app)/log/_components/WhyTheseNumbers.tsx`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `lib/i18n/en.ts`
- `tests/unit/components/log-flow/WhyTheseNumbers.test.tsx`
- Possibly `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` for integration-level wiring.

This stays at or below the 5-file stop threshold unless implementation discovers missing shared styles or i18n split files.

## TDD Required
Yes. Component tests are the right primary coverage because this is a UI display contract with existing pure helpers.

## Test Approach
Add RED tests before implementation:

1. `WhyTheseNumbers` with text source, reasoning, and item micros renders the top micronutrient by `%RDA` first, e.g. iron `18 / 18 = 100%` before sodium `460 / 2300 = 20%`.
2. The default/minimal view shows only the top micronutrient summary and hides lower-ranked rows until the user expands.
3. Clicking the micronutrient toggle sets `aria-expanded="true"` and reveals all rows that survive the `<1%` filter.
4. Rows below 1% are not rendered.
5. No micronutrient section renders for `manual` or `library` source, matching the existing AI-details gate.
6. Existing axe tests for collapsed and expanded `WhyTheseNumbers` remain green; add one expanded-with-micros axe case if the DOM shape changes substantially.

## Risk
Low-medium.

The data and sort/filter helper already exist, so the main risk is UX density inside an already collapsible “Why these numbers?” region. Keep the micronutrient list terse and avoid nested heavy tables. If Phase 2 chooses to support photo parse details too, confirm whether `LogFlowTabs.handleAnalyzeSuccess` should preserve the vision route’s `reasoning`; that is adjacent but not required to satisfy text AI parse details.

## Stop Flags
No stop flag triggered.

- Not `actually_a_feature`: it extends an existing AI parse details disclosure with data already present in the parsed result.
- Not `needs_debug_deep`: source, data path, and display helper are identified.
- Not `out_of_scope`: limited to AI parse confirmation details.
- Not `>5 files`: proposed implementation is 4-5 files.
- No intentional behavior found that says AI details must omit micronutrients.
