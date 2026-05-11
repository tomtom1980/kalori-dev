# Bug 2: Dashboard water "CORRECT" custom button — wire stub to per-platform editor (Popover desktop / WheelSheet mobile)

## Classification
known_fix

## Root Cause

`components/dashboard/WaterTracker.tsx:383-392` — the third chip (rendered with `testId="water-correct"`, label `t.dashboard.water.correct === 'CORRECT'`) is a deliberate stub from Task 3.5: its `onClick` only fires `announcePolite(t.dashboard.live.undoAvailable)` and explicitly comments `"3.5 scope: CORRECT wiring is a stub"`. There is NO open editor, NO server roundtrip, NO state mutation. The user's transcription "correct button" is the existing labeled `CORRECT` button — the user wants it to act as a **CUSTOM amount editor** (set-the-day-total). That's a wiring task, not a debug task.

This is reusing-known-good-primitives territory: `MobileWheelPicker` (387 LoC) + `MobileWheelSheet` (226 LoC) + `useIsMobile()` (72 LoC) + `lib/motion/defaults.ts` already exist on HEAD and are the prescribed solution per `Planning/ui-design.md` §13 tiebreaker #23. Only the desktop popover is novel — Radix UI is installed (`@radix-ui/react-dialog` already in `MobileWheelSheet`); we just need `@radix-ui/react-popover` (likely already a transitive dep — to be verified Phase 2).

**Verification trail:**
- `components/primitives/MobileWheelPicker.tsx` exists ✓ — 387 LoC, role="listbox", a11y contract per §10.6.1, reduced-motion hook from `lib/motion/defaults`, scroll-snap with snap-end onChange, Enter/Escape commit/cancel grammar.
- `components/primitives/MobileWheelSheet.tsx` exists ✓ — 226 LoC, Radix Dialog wrapper, slide-up 180ms via `motion.standard`, focus trap + Escape + outside-click for free, full-width oxblood DONE button, reduced-motion → instant.
- `lib/motion/defaults.ts` exists ✓ — exports `m`, `motion`, `useReducedMotion()` (the project-aware union of OS pref + Settings toggle + storage event).
- `lib/hooks/use-is-mobile.ts` exists ✓ — `MOBILE_QUERY = '(max-width: 767px)'` via `useSyncExternalStore`. THIS is the prescribed responsive split mechanism (NOT CSS media queries — tiebreaker #23 cites the literal string).
- Existing canonical consumer: `app/(app)/log/_components/LibraryTab.tsx:584-613` — single `MobileWheelSheet` rendered at component root, gated by `isMobile && wheelOpenForId !== null`. Wheel-draft state separate from committed state. `commitWheel` runs on DONE. THIS is the integration pattern to mirror.
- `app/api/water/log/route.ts:35-42` — current Zod schema accepts `unit: 'glass'|'bottle'|'ml'` and `count: int.positive().max(200)`. The `'ml'` unit is ALREADY supported (sanity cap 200 = 200ml × 200 = 40,000ml — but we'll cap CLIENT-side at 5000). This is an ADD-delta API, NOT a SET-total API. Bug #1 owns the cap migration.

## Coordination With Bug #1

Bug #1 owns the **server-authoritative 0–5000ml cap + over-cap toast**. Bug #2 must NOT duplicate that work. Concretely:

- Bug #2 client clamps the desktop input + mobile wheel to `[0, 5000]` BEFORE submission. This is UX (preventing the user from physically entering 6000), not security.
- Bug #2 submits via whatever final API shape Bug #1 lands on. The most likely shape (see Open UX Questions below) is one of:
  - **(A) ADD-delta `'ml'` unit** — keep current `/api/water/log` route, send `{ unit: 'ml', count: enteredMl }`. The user's "edit field. We choose the current value which is there, and it can be changed to any other number" ALMOST mandates SET semantics, BUT we can simulate SET as `enteredMl - currentTotalMl` and submit the difference (positive OR negative) — this requires negative-count support on the server (currently `count.positive()`).
  - **(B) New SET-total endpoint** — `PUT /api/water/log/total` with `{ logged_on, total_ml }`. Server replaces the day's rows with a single synthetic row OR upserts an "override" row. Cleaner semantics but a NEW route, likely Bug-1 territory.
- Bug #2 surfaces Bug #1's toast on cap violation. Toast text + position == whatever Bug #1 picks. We do NOT define toast copy here.

**Hard dependency:** Bug #2 cannot land before Bug #1 picks A or B and either (i) extends the existing route to accept negative counts (A) or (ii) ships the new endpoint (B). Phase 2 gate must resolve this — see Open UX Questions.

## Proposed Change (Diff Outline)

`components/dashboard/WaterTracker.tsx` (existing 454 LoC):
- Add imports: `MobileWheelPicker`, `MobileWheelSheet`, `useIsMobile`, plus `Popover` primitive (path TBD — likely `@/components/ui/popover` if shadcn is installed, else inline Radix Popover wrapper at `components/primitives/PopoverInline.tsx` — Phase 2 decides).
- Add three new `useState` slots inside `WaterTracker`:
  - `customOpen: boolean` — visible/hidden state for the editor (popover OR sheet).
  - `customDraft: number` — the in-flight value the user is dialing (number, never NaN, always clamped 0–5000).
  - `customError: string | null` — inline validation message (out-of-range, NaN paste, etc.).
- Replace the existing CORRECT chip's `onClick` with `setCustomOpen(true)` + `setCustomDraft(consumedMl)`. The chip's outer markup stays — only the handler changes.
- After the chip row, conditionally render ONE of:
  - **Mobile (<768px):** `<MobileWheelSheet open={customOpen} onCancel={...} onDone={() => commitCustom(customDraft)} title={t.dashboard.water.customWheelTitle} description={t.dashboard.water.customWheelDescription}> <MobileWheelPicker value={customDraft} onChange={setCustomDraft} options={WATER_CUSTOM_WHEEL_OPTIONS} ariaLabel={...} /> </MobileWheelSheet>` where `WATER_CUSTOM_WHEEL_OPTIONS` is `Array.from({length: 101}, (_, i) => ({ value: i*50, label: `${i*50} ml` }))` — 101 options @ step 50ml from 0 to 5000ml. **101 > §10.6.1's 50-row cap — see Stop-the-World Triggers below; resolution: step 100ml giving 51 options, just barely on the cap. Or: keep step 50ml and request a one-time §10.6.1 cap relax to 100 with documented justification (water amounts have natural step 50, the wheel is being used as a slider, page-up/down + home/end give acceptable reach to extremes).**
  - **Desktop (≥768px):** Radix `Popover` anchored to the CORRECT chip's button. Inside: a flush layout matching the Ledger style — `<input type="number" inputmode="numeric" min={0} max={5000} step={50} value={customDraft} onChange={...}>` with `oxblood` underline focus ring, plus a 56px full-width oxblood `DONE` button. Cancel via Escape OR clicking outside (Radix gives this for free). Inline error caption beneath the input on out-of-range paste.
- New `commitCustom(value)` function: clamps `value` to `[0, 5000]`, computes `delta = value - currentTotalMl` (assuming Interpretation A), submits via the chosen API surface (Bug #1 dependency), surfaces toast on `OVER_DAILY_LIMIT` error, optimistic update on success path. Uses the same `authPost` + optimistic + `setCommittedConsumedMl(response.totalMl)` pattern already in `addWater()` (lines 160-234 — model on this exactly).

`lib/i18n/en.ts`:
- Add new strings under `dashboard.water`: `customLabel: 'CUSTOM'` (display label override — current `correct: 'CORRECT'` is misleading; user said "the [custom] button"; we can EITHER rename `correct` → `custom` OR keep both keys for backward-compat — Phase 2 decides), `customA11y: 'Set custom water amount'`, `customWheelTitle: 'Set water amount'`, `customWheelDescription: '0 to 5000 ml'`, `customOutOfRange: 'Enter a value between 0 and 5000 ml'`. (5 new keys.)

`tests/unit/components/dashboard/WaterTracker.test.tsx` (existing TDD spec):
- TDD Test 1 — RED: render `<WaterTracker>` with `initial.consumedMl: 1500`. Click `[data-testid="water-correct"]`. Assert mobile path: `[data-testid="water-custom-wheel-sheet"]` is in the DOM. Assert desktop path (override `useIsMobile` mock to return `false`): `[role="dialog"]` Popover content is in the DOM with input value `1500`. Currently FAILS — chip onClick is a stub. After fix: PASSES.
- TDD Test 2 — Range clamp: dial wheel to value `5000` (max), DONE. Verify outgoing fetch payload's effective ml is 5000 (whatever API shape Bug #1 lands on). Try to dial / type `6000` — verify clamp prevents it client-side AND submit button stays enabled at `5000`.
- TDD Test 3 — Cancel: open editor, change draft, press Escape. Assert no fetch fires, `consumedMl` readout unchanged.
- TDD Test 4 — Cap-toast on server reject: mock `authPost` to reject with `{ error: 'OVER_DAILY_LIMIT' }`. Submit `5000`. Assert `useUndoQueueStore.pushToast` called with Bug #1's toast description (cross-bug coordination — pull from Bug #1 proposal verbatim).
- TDD Test 5 — Reduced-motion path: mock `useReducedMotion()` to return `true`. Open editor. Assert mobile: `[data-reduced-motion="true"]` set on the listbox; assert desktop: popover renders without fade transition. (These assertions piggyback on existing reduced-motion infrastructure already verified in Bug 4 / mobile-ui-overhaul.)

`tests/e2e/water-correct-button.spec.ts` (NEW):
- Mobile viewport (375×812): tap CORRECT, assert sheet slides up, dial to 1500ml, tap DONE, assert dashboard `water-consumed-ml` reads `1500`. Reload — still `1500`.
- Desktop viewport (1280×800): click CORRECT, assert popover opens anchored to chip, type `2000`, click DONE, assert readout `2000`. Click outside the popover during edit — assert popover closes WITHOUT committing.
- Reduced-motion: re-run mobile flow with `prefers-reduced-motion: reduce` emulation — assert no sheet slide animation but final state still correct.

NO change to `app/api/water/log/route.ts` IF Bug #1 picks Interpretation A with delta — but Bug #1 owns this route. NO change to `next.config.ts`.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WaterTracker.tsx` (production — primary change)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts` (strings only — 5 new keys)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\PopoverInline.tsx` (NEW — only if shadcn `Popover` is not pre-installed; ~80 LoC Radix wrapper styled in Ledger tokens)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WaterTracker.test.tsx` (TDD)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\e2e\water-correct-button.spec.ts` (NEW E2E)

Total: 4–5 files (5 if PopoverInline is needed). Within the 7-file ceiling. **If shadcn Popover is already shipped, drop PopoverInline.tsx → 4 files.**

## TDD Required
yes — UX-touching with new control surfaces (open/close, draft state, range clamp, error path, A11y wiring), per `~/.claude/rules/testing.md` mandatory TDD policy. The wheel and popover infrastructure is reused/tested already (LibraryTab integration, `mobile-wheel-picker-consumers.test.tsx`); the **integration glue** (chip onClick → sheet open → wheel snap → DONE → server submit → optimistic apply → toast on reject) is what tests must cover. RED-first per the 5 tests above.

## Test Approach

1. **Unit (Vitest, RED-first):** all 5 TDD tests above. Mock `useIsMobile`, `useReducedMotion`, `authPost`, `useUndoQueueStore.pushToast`. Render `<WaterTracker>` with controlled `initial`. Assert desired behavior; confirm CURRENT impl FAILS RED.
2. **Integration (Vitest):** verify `WaterTracker` + `MobileWheelSheet` + `MobileWheelPicker` compose without warnings. Existing test `tests/integration/mobile-wheel-picker-consumers.test.tsx` already exercises the wheel/sheet pair against `LibraryTab`; mirror that test for `WaterTracker`.
3. **E2E (Playwright, mobile + desktop):** the new `water-correct-button.spec.ts` exercises real DOM, real Radix focus trap, real scroll-snap. Mobile viewport (375×812) AND desktop (1280×800). Reduced-motion variant.
4. **Visual regression:** capture screenshots at each editor state per `tests/screenshots/user-stories/...` convention — landing chip row, mobile sheet open, desktop popover open, reduced-motion variant. Phase 2 to decide whether to wire into existing visual-regression suite.

## Risk

**Low–Medium.**
- `MobileWheelPicker` + `MobileWheelSheet` are battle-tested (Bug 4 / mobile-ui-overhaul shipped, two existing consumers, dedicated test suite). Reuse path = LOW risk.
- Desktop Popover with Radix is a well-understood pattern. The Ledger token application is standard. LOW risk.
- The HARD dependency on Bug #1's API shape (SET vs ADD, delta vs total, cap enforcement location) is what could trip implementation. MEDIUM risk until Phase 2 gate resolves SET-vs-ADD.
- High-cardinality wheel (101 options @ step 50) exceeds §10.6.1's 50-row cap. Resolution path: step 100ml = 51 options (1-row over cap), or get explicit cap relax. **Surfaced to user gate.**
- Possible regression on existing `addWater('glass'|'bottle')` chip path — mitigated by tests in `tests/unit/components/dashboard/WaterTracker.test.tsx` that already cover those paths and would re-run.

---

## UI Library / Primitive Reuse

**Mobile wheel:** Reuse `MobileWheelPicker` (387 LoC, file path `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelPicker.tsx`) + `MobileWheelSheet` (226 LoC, file path `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelSheet.tsx`). Confirmed reuse, NOT new build.

> `Planning/ui-design.md` §13 tiebreaker #23 (line 3167):
> "Hand-rolled `<MobileWheelPicker>` (§4.1.10) on the already-prescribed `LazyMotion + m` foundation (no new dependency). Used on `<768px` for: Portion Picker §7.2.5 [...]. Native `<select>` (timezone §7.5) and native `<input type="date">` are NOT migrated — the OS already renders an OS-level wheel for those. Breakpoint is `(max-width: 767px)` via `useIsMobile()` (`lib/hooks/use-is-mobile.ts`)."

The custom-water surface fits the pattern exactly: a high-cardinality enumerated selection (0–5000ml step 50) within a sheet, mobile only.

**Desktop popover:** Add (or reuse if installed) shadcn/Radix `Popover`. Per the project's existing dependency list — `@radix-ui/react-dialog` is already used in `MobileWheelSheet.tsx`; `@radix-ui/react-popover` is the sibling primitive. ~80 LoC inline if no pre-existing `components/ui/popover.tsx` exists; Phase 2 verifies via Glob `**/components/ui/popover*` before deciding.

**Velocity-aware momentum + bounce-stop:** Provided by **native CSS `scroll-snap-type: y mandatory` + browser-native momentum scrolling on iOS/Android** (per `MobileWheelPicker.tsx:296`: `scrollSnapType: 'y mandatory'`). The browser's snap engine handles velocity, momentum, AND bounce-at-bounds for free — no custom Framer code needed. Verified in PortionPicker / LibraryTab usage.

**Reduced motion:** `useReducedMotion()` from `lib/motion/defaults.ts` (line 279) — confirmed exists, drives `data-reduced-motion="true"` attribute on the listbox AND collapses the sheet's slide-up to instant. Project-aware (OS pref + Settings toggle).

## Quick-Pick Citations

**Mobile (`mobile-ui-guide.md` §1 Quick-Pick Decision Table):**
> "Bottom sheets | @gorhom/bottom-sheet | ~40 KB | Industry standard, Reanimated-powered"

NOT applicable — `@gorhom/bottom-sheet` is React Native. The project is Next.js web; the equivalent is Radix Dialog + Framer slide-up motion, which `MobileWheelSheet` already implements.

> "Gesture-driven interactions (swipe, drag, pinch) | React Native Gesture Handler | ~80 KB | Native gesture recognition, pairs with Reanimated"

ALSO not applicable for the same reason — web uses native pointer/touch + CSS scroll-snap, which `MobileWheelPicker` already wires.

**The web Quick-Pick that DOES apply** (`web-ui-guide.md` §1):
> "Drag/pinch/gesture interactions | @use-gesture/react ⚛ | ~10 KB | Pairs with Spring"

Not needed — native CSS scroll-snap + browser pointer events do the job at 0 KB. The wheel implementation deliberately avoids @use-gesture per `MobileWheelPicker.tsx:34-37` ("Pointer scroll uses native CSS `scroll-snap-type: y mandatory` because (a) it's free, (b) it honors `prefers-reduced-motion` at the browser level, and (c) it composes correctly with iOS momentum scrolling").

**Web Quick-Pick for popover positioning:**
> `web-ui-guide.md` §4 (recommended default stack):
> "npm i @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover"

`@radix-ui/react-popover` is the recommended primitive. Bundle cost ≈ 5 KB. Provides positioning, focus-trap, Escape-to-close, anchor-relative placement, viewport-edge collision avoidance — all for free. NOT custom positioning logic.

**Web Quick-Pick for inline edit field with keyboard escape:**
> `web-ui-guide.md` §5 (Forms + validation):
> "npm i react-hook-form zod @hookform/resolvers"

NOT applicable here — the input is a single number, not a form. Use a controlled `<input type="number">` with `min={0} max={5000} step={50}` and a `onKeyDown` handler that submits on Enter and cancels on Escape (Radix Popover handles outside-click).

## Reduced-Motion Plan

**Desktop popover:**
- Default: instant open/close (no fade). Radix Popover does NOT animate by default; we add Ledger `inkFade` transition (120ms `motion.micro`) ONLY when `useReducedMotion() === false`. Under reduced motion: render with `display: block` from the moment `open === true`. No `<motion.div>` wrapper needed in the reduced-motion branch.
- Focus management: Radix Popover handles focus trap + restore-to-trigger on close (works under reduced motion identically).

**Mobile sheet:**
- The existing `MobileWheelSheet.tsx:84-93` already collapses slide + fade to `{ duration: 0, opacity: 1, y: 0 }` under `reducedMotion`. **No additional work.** The existing primitive does this correctly.
- The wheel `MobileWheelPicker.tsx:172-178` already toggles `scrollBehavior: 'smooth' → 'auto'` and uses instant `scrollTop = N * itemHeight` under reduced motion. **No additional work.**
- The center-row underline jump under reduced motion: already handled — wheel uses CSS `border-bottom` toggle on the active row (no transition), works identically.

**Bounce-at-bounds animation:**
- Under reduced motion: the wheel's CSS scroll-snap engine bounces in line with the browser's reduced-motion preference (most browsers disable rubber-band bounce automatically). No additional work; this is browser-native behavior.

## Open UX Questions for User Gate

1. **SET-the-total vs ADD-delta semantics.** User said "edit field. We choose the current value which is there, and it can be changed to any other number" → strongly suggests **SET-the-total**. But Bug #1 owns the API surface and may pick ADD-delta to avoid migration work. **Recommendation: SET semantics**, implemented as `delta = enteredMl - currentTotalMl` over the existing `'ml'` unit endpoint (requires server `count` to accept negative — a one-line schema relax), OR a new `PUT /api/water/log/total` route. **User gate must resolve.**
2. **Default value source.** Confirmed Interpretation A: open the editor pre-filled with `consumedMl` (current daily total). User said "the current value which is there"; for the dashboard chip context, "there" = the daily total readout right above the chip. **Recommendation: A.** Phase 2 confirms.
3. **Step size for the wheel + input.** Recommend step 50ml (matches the philosophy of glass=250 + bottle=500 increments, both multiples of 50). Step 50 over 0–5000 = 101 options, **which exceeds §10.6.1's 50-row cap**. Resolutions, in priority:
   - **Recommendation:** step 100ml → 51 options → JUST over cap. Acceptable. (User can still get to any 50-multiple by Glass+Bottle+Custom combos.)
   - Alternative: step 50ml AND request a one-time §10.6.1 cap relax to ≤101 (justified: this is a slider-like wheel, not a navigation listbox; PageUp/PageDown + Home/End give 1-flick reach to extremes). Document in `Planning/ui-design.md` change log.
   - Alternative: ditch the wheel entirely on mobile, use a numeric input + slider — but this contradicts the user's explicit spec ("nice 3D wheel").
   - **User gate must pick** between step-100 (cleaner) and cap-relax (matches user spec exactly).
4. **Button label rename `'CORRECT' → 'CUSTOM'`.** User's transcription says "we have three buttons. The glass, the bottle, those are working fine. The 'correct' button doesn't do anything" — a transcription error per the problem statement. The chip currently says CORRECT but the user intended CUSTOM. **Recommendation: rename label** (i18n keys `correct/correctA11y/correctedToastFormat` migrated to `custom/customA11y/customAdjustedToastFormat`; OR keep keys as-is and just change the strings to `'CUSTOM'`/`'Set custom water amount'`). User gate confirms preferred semantics.
5. **Bug #1 toast surface coordination.** Pending Bug #1 proposal — what test/UI string is the over-cap toast? Cross-bug deferral.
6. **Existing `correctedToastFormat` ('Removed {amount} {unit}')**: this currently goes unused (chip is a stub); should the SET-to-lower-value path show this on a successful reduction? **Recommendation: yes** — consistency with the glass/bottle toasts. User gate confirms.

---

## Stop-the-World Triggers — Status

| Trigger | Status |
|---|---|
| `MobileWheelPicker` / `MobileWheelSheet` does NOT exist on HEAD | ✓ EXISTS — both primitives confirmed at the canonical paths |
| Existing primitive doesn't support velocity-based motion or bounce-stop | ✓ NATIVE — CSS `scroll-snap-type: y mandatory` provides browser-native momentum + bounce. No primitive extension needed. |
| The custom button doesn't exist in the dashboard markup at all | ✓ EXISTS — `WaterTracker.tsx:383` chip with `testId="water-correct"`; only its onClick handler is a stub |
| Touching this requires a server-action redesign | ⚠️ COORDINATION NEEDED — depends on Bug #1's SET-vs-ADD pick. Bug #2 cannot ship without Bug #1's API shape resolved at Phase 2 gate. |
| File-touch count exceeds 7 | ✓ within budget — 4–5 files |

**No hard stop.** One COORDINATION blocker (#4) and one DESIGN-CAP question (wheel step → 51-or-101 options) for the user gate.
