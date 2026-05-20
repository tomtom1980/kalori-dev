# Bug 1: Drink UI alcohol capture

## Classification
NO_BUG_FOUND

## Root Cause
No issue found on this surface — the UI correctly renders alcohol controls when `state.meal === 'drink'` and correctly sends `alcohol: { volume_ml, abv_percent }` in the `/api/entries/save` payload when the "Alcoholic drink" toggle is on. All wiring is internally consistent: reducer → context actions → `AlcoholControls` component → save handler → API schema match. The bug must live elsewhere (server insert path, RLS, dashboard read, schema mismatch with the `alcohol_logs` table, or the BAC display component on the dashboard).

## Proposed Change (Diff Outline)
N/A — no change required on this surface.

## Files Affected
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx` (read-only inspection)
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts` (read-only — schema contract verified)
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (read-only — i18n strings present)
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.alcohol.test.tsx` (read-only — coverage confirms wiring)

## TDD Required
no — no change proposed.

## Test Approach
Existing tests at `tests/unit/components/log-flow/ConfirmationScreen.alcohol.test.tsx` already cover all four scenarios (visibility gated on meal, payload populated for alcoholic drinks, payload absent when not alcoholic, validation blocks save on invalid input). If a regression test is added later to prove the END-TO-END production path, it would have to live at the API integration or E2E level — not on this UI surface.

## Risk Assessment
low — no code change.

## Regression Sweep Needed
N/A.

## UI Touching
true

## Open Questions
1. Has the user verified in production DevTools that the POST `/api/entries/save` body actually contains `alcohol: { volume_ml, abv_percent }` when they save an alcoholic drink? If YES, the bug is server-side. If the field is missing in production but present locally, it could be a build/cache issue (Vercel didn't deploy the new bundle) — worth re-checking the production HTML/JS bundle hash for the AlcoholControls component.
2. Is the user on the latest deployed Vercel build? Hard refresh may be needed (sw.ts service worker could be serving a stale `ConfirmationScreen.js` chunk from cache).
3. Are they actually selecting `DRINK` in MealSlot and toggling `Alcoholic drink` to ON? If they leave the default meal slot (which derives from time-of-day via `defaultMealForNow()`), the alcohol fields will never reach the payload because of the `state.meal === 'drink'` gate at `ConfirmationScreen.tsx:1231`.

## Evidence

### 1. AlcoholControls component renders only on drink meal category (correct)
`app/(app)/log/_components/ConfirmationScreen.tsx:2195-2198`
```typescript
const isDrink = state.meal === 'drink';
const isInvalid = state.alcohol.isAlcoholic && !isValidAlcoholState(state.alcohol);

if (!isDrink) return null;
```

### 2. AlcoholControls is included in the ConfirmationScreen JSX tree (correct)
`app/(app)/log/_components/ConfirmationScreen.tsx:2758-2764`
```typescript
<>
  <Confirmation.MealSlot />
  <Confirmation.AlcoholControls />
  <Confirmation.TimeEditor />
  <Confirmation.SaveToLibraryToggle />
  <Confirmation.DedupBanner />
</>
```

### 3. Save handler appends alcohol payload only on CREATE + drink + isAlcoholic, with shape that matches the API schema exactly (correct)
`app/(app)/log/_components/ConfirmationScreen.tsx:1231-1240`
```typescript
if (!editEntryId && state.meal === 'drink' && state.alcohol.isAlcoholic) {
  if (!isValidAlcoholState(state.alcohol)) {
    dispatch({ type: 'SAVE_ERROR', message: t.log.confirmationAlcoholValidation });
    return;
  }
  body.alcohol = {
    volume_ml: state.alcohol.volumeMl,
    abv_percent: state.alcohol.abvPercent,
  };
}
```

### 4. API schema accepts exactly this shape (correct)
`app/api/entries/save/route.ts:120-126`
```typescript
alcohol: z
  .object({
    volume_ml: z.number().positive().max(5000),
    abv_percent: z.number().positive().max(100),
  })
  .strict()
  .optional(),
```

Field names match: `volume_ml` ↔ `volume_ml`, `abv_percent` ↔ `abv_percent`. No casing mismatch, no typo.

### 5. Server uses `body.logged_at` as `consumed_at` for the alcohol_logs row (correct — no client work needed)
`app/api/entries/save/route.ts:413-414`
```typescript
const alcoholFreshError = inserted
  ? await ensureAlcoholLogForEntry(inserted, body.logged_at)
  : null;
```

The client doesn't need to send `consumed_at` separately — `logged_at` (which the TimeEditor manages, defaulting to "now") is reused. This is correct per the design.

### 6. Reducer / actions correctly wire all four alcohol fields
`app/(app)/log/_components/ConfirmationScreen.tsx:616-639` — reducer cases for `SET_ALCOHOLIC`, `SET_ALCOHOL_PRESET`, `SET_ALCOHOL_VOLUME`, `SET_ALCOHOL_ABV` are all correct.

`app/(app)/log/_components/ConfirmationScreen.tsx:945-956` — corresponding `useCallback` action creators dispatch the correct action types.

`app/(app)/log/_components/ConfirmationScreen.tsx:1392-1410` — all four are exposed via `value.actions`.

### 7. Validation guard correctly blocks save on invalid alcoholic state
`app/(app)/log/_components/ConfirmationScreen.tsx:1232-1234` — if `state.alcohol.isAlcoholic && !isValidAlcoholState(state.alcohol)`, dispatch SAVE_ERROR and return. So validation is NOT silently swallowed; it surfaces via `t.log.confirmationAlcoholValidation`.

### 8. Existing tests confirm end-to-end wiring at unit level
`tests/unit/components/log-flow/ConfirmationScreen.alcohol.test.tsx:95-113` — the test asserts that after selecting "DRINK" meal, clicking "Alcoholic drink", and clicking "Beer", the save payload contains `alcohol: { volume_ml: 355, abv_percent: 5 }`. Test was added in commit `9ae4e98` and is presumably green in CI.

### 9. No feature flags / env gates / build conditions
`grep -i 'NEXT_PUBLIC|FEATURE_FLAG|env\.' app/(app)/log/_components/ConfirmationScreen.tsx` returns zero matches. No SSR/CSR split, no dynamic-import gate, no env-driven branch. The component is unconditionally exported and bundled.

### 10. Service Worker caching is a possible (but UI-adjacent) hypothesis
`app/sw.ts` exists and was bumped in commit `9ae4e98` (per `git show --stat 9ae4e98`). If the user is on a cached chunk from before the BAC release, they would see the old ConfirmationScreen without alcohol controls. Worth checking via DevTools Application → Service Workers → Update on reload, OR an Incognito-window test. Not a code bug on the UI surface, but a possible production-only observation cause.

### Stop-the-world signal
The user's claim "BAC feature was deployed but it does not work in production" should be sharpened by Bug 2-6 investigators looking at: server alcohol_logs insert, dashboard BAC read aggregate, BacTracker component, RLS on alcohol_logs table, and migration application. The UI surface is clean.
