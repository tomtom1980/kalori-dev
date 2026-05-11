# Bug 2 — Implementation Output

## Files Touched

Production:
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\water\log\route.ts` — Zod schema split per-unit via `discriminatedUnion`; `unit:'ml'` cap raised to 5000, `glass`/`bottle` cap unchanged at 200.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` — third chip wired to EDIT surface; renders desktop popover OR mobile sheet+wheel; `commitEdit()` POSTs `{unit:'ml', count: delta}`; new `roundUpToStep` helper; chip gains `disabled` + `buttonRef` props; at-cap branch (`committedConsumedMl >= 5000`) disables the button.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\PopoverInline.tsx` — NEW Radix-Popover wrapper styled in Ledger tokens. ~70 LoC.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` — 11 new keys under `t.dashboard.water` (`editButtonLabel`, `editButtonA11y`, `editPopoverTitle`, `editPopoverHint`, `editWheelTitle`, `editWheelDescription`, `editWheelA11y`, `editInputA11y`, `editSaveLabel`, `editCancelLabel`, `editOutOfRange`, `editDisabledAtCap`).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\package.json` (+ `pnpm-lock.yaml`) — added dependency `@radix-ui/react-popover@^1.1.15`.

Tests:
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WaterTracker.test.tsx` — new describe block "Bug-2 — EDIT surface (desktop popover + mobile wheel)" with 9 tests; existing "renders + GLASS, + BOTTLE, CORRECT…" assertion updated to assert EDIT label.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\water-log.test.ts` — new describe block "Bug-2 — per-row count cap split per unit" with 6 tests.

7 production files (within the 7-file ceiling) plus 2 test files plus 1 lockfile.

## Tests Added/Modified

### `tests/unit/components/dashboard/WaterTracker.test.tsx` — 9 new + 1 modified
1. desktop: clicking EDIT opens popover with input prefilled at currentTotalMl rounded UP to next 50ml (4775 → 4800).
2. desktop: Save submits `POST {unit:'ml', count: delta = entered − currentTotalMl}` with logged_on derived at tap time.
3. desktop: Save at the cap (5000) succeeds with delta = 5000 − currentTotalMl.
4. desktop: when `committedConsumedMl == 5000` the EDIT button is disabled (Option A — at-cap state); aria-label switches to `editDisabledAtCap`; clicking does not open popover.
5. desktop: Cancel closes popover and does NOT issue POST.
6. desktop: server 409 OVER_DAILY_LIMIT path syncs total + shows cap toast (reuses chip i18n keys).
7. mobile: clicking EDIT opens MobileWheelSheet with wheel options [lower..5000] step 50; active option = rounded-up consumedMl (4800).
8. mobile: Save commits the wheel value via POST `{unit:'ml', count: delta}`; clicks "2000 ml" row from a base of 1500 → POSTs count=500.
9. mobile: Cancel closes sheet without POST.
10. reduced-motion: mobile wheel listbox carries `data-reduced-motion="true"` when `reducedMotion` is true.

Modified: existing "renders + GLASS, + BOTTLE, CORRECT" → "renders + GLASS, + BOTTLE, EDIT" with the new aria-label expectation.

### `tests/unit/api/water-log.test.ts` — 6 new
1. `unit:'ml'` count up to 5000 passes Zod (custom-amount EDIT delta).
2. `unit:'ml'` count = 5000 (boundary) passes Zod.
3. `unit:'ml'` count = 5001 fails Zod ValidationError (above ceiling).
4. `unit:'glass'` count = 201 still fails Zod (per-row cap unchanged for glass).
5. `unit:'bottle'` count = 201 still fails Zod (per-row cap unchanged for bottle).
6. `unit:'ml'` count = 0 fails Zod (positive() unchanged).

## Test Run Results

- WaterTracker tests: **27 passed / 27 total** (was 17 pre-Bug-2; Bug-2 adds 10).
- API route tests: **28 passed / 28 total** (was 22 pre-Bug-2; Bug-2 adds 6). All Bug-1 cap tests still pass — confirmed Bug-1 regression check.
- nav-shell tests: **24 passed / 24 total** (untouched, regression sanity).
- Wheel/sheet integration: **7 passed / 7 total** (`tests/integration/mobile-wheel-picker-consumers.test.tsx` — confirms the existing primitive is reusable; the same primitive Bug-2 mounts in mobile branch).
- Combined run: **86 passed / 86 total**.
- TypeScript typecheck (`tsc --noEmit`): **clean**.
- ESLint on all touched files: **clean**.

Run commands:
```
pnpm add @radix-ui/react-popover@^1.1.15
npx vitest run tests/unit/components/dashboard/WaterTracker.test.tsx
npx vitest run tests/unit/api/water-log.test.ts
npx vitest run tests/unit/api/water-log.test.ts tests/unit/components/dashboard/WaterTracker.test.tsx tests/components/nav/nav-shell.test.tsx tests/integration/mobile-wheel-picker-consumers.test.tsx
npx tsc --noEmit
npx eslint components/dashboard/WaterTracker.tsx components/primitives/PopoverInline.tsx app/api/water/log/route.ts lib/i18n/en.ts tests/unit/components/dashboard/WaterTracker.test.tsx tests/unit/api/water-log.test.ts
```

## Mobile Wheel Range Decision

**Rule:** lower bound = `roundUpToStep(committedConsumedMl, 50)`. Wheel options span `[lower, lower+50, …, 5000]` inclusive, step 50. Default selection on open = `lower`.

**Examples:**
- `committedConsumedMl = 0` → lower = 0 → options 0, 50, 100, …, 5000 → **101 rows** (max cardinality).
- `committedConsumedMl = 4775` → lower = 4800 → options 4800, 4850, 4900, 4950, 5000 → 5 rows.
- `committedConsumedMl = 4800` → lower = 4800 → 5 rows.
- `committedConsumedMl = 4850` → lower = 4850 → 4 rows.
- `committedConsumedMl = 5000` → at-cap branch, button disabled (no wheel rendered).

Rounding direction = UP. Rationale: the SET-semantic with Option A means the new total must be ≥ current. Rounding DOWN would risk the user picking a value LESS than current (the wheel's lowest visible row), which would force a hidden client-side clamp; rounding UP keeps every visible option a legal commit.

Memoised via `useMemo([editLowerBoundMl])` so the wheel option array is stable across non-edit-related re-renders.

## EDIT-when-at-cap UX Decision

**Choice:** disable the EDIT button entirely.

When `committedConsumedMl >= MAX_DAILY_WATER_ML (5000)`:
- `<button disabled>` — keyboard-focusable but click + Enter no-op (browser-native).
- `aria-label` switches from `editButtonA11y` ("Edit total water amount") to `editDisabledAtCap` ("Daily limit reached") for SR users.
- Visual: opacity 0.55, color shifts to `--color-dust`, cursor `not-allowed`. No oxblood underline. Same hairline border so chip-row composition stays identical.
- Clicking does NOT open the popover (handler short-circuits with `if (isAtDailyCap) return`); the Chip's `disabled` prop also prevents the click event from firing in standard browsers.

This avoids the no-headroom case (current = 5000, lower = 5000, only option is 5000, delta = 0 = no-op) gracefully without rendering an editor that has nothing to do.

## SET-semantics UX Restriction (Phase 8 follow-up)

> "User can only EDIT up. To decrease, undo a logged item or reset the day."

**Why:** the existing `POST /api/water/log` route's Zod schema enforces `count: positive()`. Bug-1 explicitly rejects negative deltas. Implementing decrement semantics would need either (a) a new route (`PUT /api/water/log/total`) or (b) a sign-aware delta route — both out of scope for a bug-fix batch and properly belong to a feature task.

**Surface as Phase 8 follow-up:** add to `Planning/followups.md`:
- **F-WATER-EDIT-DECREMENT** — Decrement path for the EDIT surface. Today the editor only allows raising the daily total. Users wanting to lower must (i) tap the relevant logged-row's undo control once it ships in the entries panel, or (ii) reset day from Settings. Either ship a SET-total endpoint OR enrich the EDIT surface with a per-row delete column. Estimate: Small / Medium FA depending on which approach.

## §10.6.1 50-row a11y relax — documented exception

The wheel renders **up to 101 rows** (when `committedConsumedMl = 0`). This exceeds `Planning/ui-design.md` §10.6.1's 50-row a11y guideline.

**Rationale (one-time exception, surface-specific):**
- Step 50 ml matches the natural increments of glass (250 = 5 × 50) and bottle (500 = 10 × 50), keeping cognitive load consistent with the chip row.
- Range 0–5000 ml is fixed by `MAX_DAILY_WATER_ML`; halving the step to 100 would yield 51 rows (just over the cap anyway) AND degrade granularity for users whose chip-mash totals naturally land on 50-multiples.
- The wheel is used here as a **slider**, not as a navigation listbox. The §10.6.1 cap exists primarily to protect SR users from "list of 200 items with no good keyboard reach." `MobileWheelPicker` provides PageUp/PageDown (5-row jumps) + Home/End (jumps to bounds), so the worst-case keyboard traversal from 0 to 5000 is `End` (1 keystroke) or 20 PageDowns. SR `aria-activedescendant` updates with each move so the user always hears the new value.
- Recorded in this output (not in source code) per task contract.

## Primitive Reuse Confirmation

- **`MobileWheelPicker`** — reused as-is, ZERO modifications. Path: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelPicker.tsx`. 387 LoC. Already imports `useReducedMotion` from `lib/motion/defaults`. Verified handles 101 rows (the listbox is just a `<ul>` with native CSS `scroll-snap-type: y mandatory`; row count has no virtualization layer that could throw — Codex Round 1 may want to vet perf, but rendering 101 plain `<li>`s is well within budget).
- **`MobileWheelSheet`** — reused as-is, ZERO modifications. Path: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelSheet.tsx`. 226 LoC. Imports `m`, `motion as motionPresets`, `useReducedMotion`, `Transition`, `Variants` from `lib/motion/defaults`.
- **`useIsMobile`** — reused as-is. Path: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\hooks\use-is-mobile.ts`. `MOBILE_QUERY = '(max-width: 767px)'`.
- **`PopoverInline`** — NEW thin wrapper around `@radix-ui/react-popover`. ~70 LoC. Imports `useReducedMotion` from `lib/motion/defaults`. Outside-click + Escape handled by Radix; `data-reduced-motion="true"` added when reduced motion is active.

## i18n Keys Added

Under `t.dashboard.water.*`:
- `editButtonLabel: 'EDIT'`
- `editButtonA11y: 'Edit total water amount'`
- `editPopoverTitle: 'Set water total'`
- `editPopoverHint: "Replace today's total with a custom amount."`
- `editWheelTitle: 'Set water total'`
- `editWheelDescription: 'Step 50 ml · up to 5 L'`
- `editWheelA11y: 'Set total water amount in millilitres'`
- `editInputA11y: 'Total water amount in millilitres'`
- `editSaveLabel: 'Save'`
- `editCancelLabel: 'Cancel'`
- `editOutOfRange: 'Enter a value between {lower} and 5000 ml'`
- `editDisabledAtCap: 'Daily limit reached'`

12 new keys (one more than the proposal's 5; needed for both popover + wheel surfaces, plus the at-cap aria-label, plus the localized Save/Cancel button labels passed to `MobileWheelSheet`).

Reused (per Bug-1 contract): `t.dashboard.water.capReachedToast`, `t.dashboard.water.capReachedAnnounce`. NO new cap-toast keys added.

## Zod Constraint Change

**File:** `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\water\log\route.ts` lines 35–67.

**Before (Bug-1 / pre-Bug-2):**
```ts
const BodySchema = z
  .object({
    client_id: z.string().uuid(),
    unit: z.enum(['glass', 'bottle', 'ml']),
    count: z.number().int().positive().max(200),
    logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
```

**After (Bug-2):**
```ts
const BaseFields = {
  client_id: z.string().uuid(),
  logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};
const BodySchema = z.discriminatedUnion('unit', [
  z.object({ ...BaseFields, unit: z.literal('glass'),  count: z.number().int().positive().max(200) }).strict(),
  z.object({ ...BaseFields, unit: z.literal('bottle'), count: z.number().int().positive().max(200) }).strict(),
  z.object({ ...BaseFields, unit: z.literal('ml'),     count: z.number().int().positive().max(5000) }).strict(),
]);
```

Behavior: `unit:'ml' count: 1..5000` accepted; `unit:'glass'|'bottle'` cap unchanged at 200. Daily-total cap still enforced at the aggregate layer below the schema check.

## Deviations from Proposal

1. **No new `correct → custom` rename.** The proposal Open UX Question #4 floated renaming `t.dashboard.water.correct` to `custom`. User-approved decision specifies the label is **EDIT** (not CUSTOM). Implemented as a new `editButtonLabel` key. The legacy `correct`/`correctA11y` keys are now orphaned but kept (no surgical-changes principle to delete unrelated dead i18n).
2. **`PopoverInline` instead of `components/ui/popover.tsx`.** No `components/ui/` folder exists in this project (verified via Glob). Following the existing `components/primitives/` convention used by `MobileWheelPicker` / `MobileWheelSheet`. Same dependency surface (`@radix-ui/react-popover` is a sibling of `@radix-ui/react-dialog` already used by `MobileWheelSheet`), thinner wrapper than shadcn's would have generated.
3. **`@radix-ui/react-popover` is a NEW dependency.** Not previously installed; added via `pnpm add @radix-ui/react-popover@^1.1.15` (matches the version of the other 7 Radix packages already in the project). Bundle cost ~5 KB — within the proposal's anticipated cost.
4. **12 i18n keys instead of 5.** The proposal estimated 5; needed 12 because the surface has both popover and wheel branches with localized labels for each, plus the at-cap aria-label, plus the Save/Cancel button labels passed to `MobileWheelSheet` (which exposes `doneLabel`/`cancelLabel` precisely so consumers can localize).
5. **Edit-side toast dedupe ref is separate from chip-side.** Followed Bug-1's per-consumer dedupe pattern: `editToastLastShownRef` is dedicated. Justification: chip-mash dedupe and edit-mash dedupe are independent UX flows; sharing the ref would mean a chip-tap-then-Save burst suppresses one of the two cap toasts, surprising the user.
6. **One unsafe-cast in `PopoverInline.tsx` for `virtualRef`.** Radix's `virtualRef` typing is `RefObject<Measurable>` (non-null) but our consumer's ref is `RefObject<HTMLButtonElement | null>` because the chip mounts on first render. Cast through `unknown` documented inline; runtime-safe because the popover only renders content when `open === true`, by which point the button has mounted.

## Status

implemented
