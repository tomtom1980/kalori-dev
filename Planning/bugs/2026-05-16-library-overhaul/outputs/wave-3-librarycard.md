# Wave 3 — LibraryCard Cluster Implementation

**Batch:** `2026-05-16-library-overhaul`
**Scope:** Bugs 3, 10 — atomic refactor of the LibraryCard surface (kebab quick-action menu + hover/focus animation).
**Result:** BOTH BUGS GREEN. 231 library + integration tests pass. Typecheck clean. 0 lint errors, 13 pre-existing warnings (none in changed files).

---

## Bug 3 — Quick-action menu on each card (Edit + Delete)

### Files touched
- `app/(app)/library/_components/LibraryCardActionMenu.tsx` — NEW. Radix DropdownMenu wrapper; `MoreVertical` lucide icon trigger; `stopPropagation` on pointerDown / click / Enter+Space keydown to shield the card root from menu interactions. Edit / Delete menu items dispatch typed callbacks. Pattern precedent: `FilterDropdown.tsx`.
- `app/(app)/library/_components/LibraryCard.tsx` — Root refactored from native `<button>` to `<div role="button" tabIndex>` so the kebab menu trigger can legally nest inside (no nested-interactive a11y violation). Keyboard semantics preserved via roving `tabIndex` + Enter/Space `onKeyDown`. Menu mounts only when `selectMode === false` AND `onCardEdit` / `onCardDelete` are wired (not rendered at all in selectMode — leaves the tab order entirely, per briefing).
- `app/(app)/library/_components/LibraryGrid.tsx` — Threads new `onCardEdit?: ((id) => void) | undefined` and `onCardDelete?: ((id) => void) | undefined` props through to each `LibraryCard`. `querySelector<HTMLButtonElement>` widened to `<HTMLElement>` because the focus target is now a div with `tabIndex`.
- `app/(app)/library/_components/LibraryClient.tsx` — Wires `onCardEdit` → `router.push(\`/library/${id}?mode=edit\`)` wrapped in `useTransition` (reuses `setNavPendingId` so the pending cue from Bug 2 still paints). `onCardDelete` → clears the selection, toggles the single id in, opens the existing `BulkDeleteConfirmDialog` (length-1 client_ids pattern per lessons #8).
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — Added `initialMode: 'view' | 'edit'` prop (default `view`). When `'edit'`, a mount-scoped ref-gated `useEffect` calls `edit.enter()` AND `router.replace(\`/library/${id}\`)` to strip the `?mode=edit` query param. Ref gate prevents re-entry if React re-renders the effect (clean exhaustive-deps lint).
- `app/(app)/library/[id]/page.tsx` — Reads `searchParams.mode`; passes `initialMode="edit"` when `mode === 'edit'`, otherwise `'view'`. Updated `searchParams` signature to the Next 16 async Promise form.
- `app/globals.css` — Added `.kalori-library-card-menu-trigger` (absolute top:6 right:6, 32×32, semi-opaque scrim, oxblood-soft focus outline) + `.kalori-library-card-menu-content` (bg-2, hairline strong border, zero-radius, fade-in 120ms reusing the existing `kalori-library-fade-in` keyframe) + `.kalori-library-card-menu-item` + destructive variant for Delete.
- `lib/i18n/en.ts` — New strings: `cardMenuAriaLabel` (`"Actions for {name}"`), `cardMenuEdit` (`"Edit"`), `cardMenuDelete` (`"Delete"`).

### Tests added
- `tests/components/library/LibraryCardActionMenu.test.tsx` — 5 cases: trigger renders with correct aria-label, menu opens revealing Edit + Delete, Edit click calls onEdit once, Delete click calls onDelete once, trigger click does NOT bubble to parent click handler.
- `tests/components/library/LibraryClient.quick-actions.test.tsx` — 3 cases: Edit navigates to `/library/{id}?mode=edit`, Delete opens `BulkDeleteConfirmDialog` in single-item mode (italic name preview present), opening the menu does NOT activate the card.
- `tests/components/library/FoodDetail.mode-edit-query.test.tsx` — 3 cases: `initialMode="edit"` auto-enters edit mode (Cancel button visible), `router.replace('/library/{id}')` fires to strip query, `initialMode` undefined keeps view mode + no replace.
- `tests/components/library/LibraryCard.test.tsx` — 5 new cases under `quick-action menu (Bug 3)` describe: trigger renders in browse mode, hidden in selectMode (not in DOM), trigger click does NOT activate, Edit calls `onCardEdit('a')` + NOT `onActivate`, Delete calls `onCardDelete('a')` + NOT `onActivate`.

### Tests updated to reflect role=button refactor
- `tests/components/library/LibraryGrid.test.tsx` — Replaced `tagName === 'BUTTON'` assertion with `toHaveAttribute('role', 'button')` + `toHaveAttribute('tabindex')` check. Comment explains the Bug 3 refactor.
- `tests/components/library/LibraryClient.pagination.test.tsx` — Selector widened from `button[data-testid^="library-card-item-"]` → `[data-testid^="library-card-item-"]` since cards are no longer native buttons.

### RED → GREEN
- RED: ActionMenu component didn't exist; LibraryCard had no menu wiring; `initialMode` prop didn't exist on FoodDetail; click-handlers fired both card activation + menu open; nested `<button>` inside `<button>` failed a11y.
- GREEN: All 13 new + 2 updated test cases pass. Existing 6 LibraryCard tests + 6 LibraryGrid tests + 7 LibraryClient.pagination tests still green.

### Deviations / decisions
- **No Log Now in the menu** — per the briefing's "Default chosen (E1 + E2): Delete + Edit only". The retry contract for Log Now (in-flight latch, status announce, ConfirmationScreen handover) lives on the FoodDetail page and the in-flow log surface; duplicating it on the card menu risks the retry contract diverging.
- **selectMode → menu not rendered** (not `display: none`) — fully leaves the tab order, which is stricter than the briefing's "display:none" suggestion and matches the lessons #15 nested-interactive a11y bar.
- **Single-item delete reuses bulk substrate** — `clearSelected()` then `toggleSelected(id)` then open `BulkDeleteConfirmDialog`. The dialog's existing `totalCount === 1` branch (set up for Task C.2 AC3) renders the italic name preview verbatim — no new dialog file, no dialog API drift.
- **Edit query-param strip strategy** — chose `router.replace('/library/{id}')` AFTER `edit.enter()`. Single-shot via mount-scoped ref so the effect's deps can include `[initialMode, edit, item.id, router]` and pass exhaustive-deps lint without a suppression directive.

---

## Bug 10 — Library card hover/focus animation

### Files touched
- `app/globals.css` — Refined `.kalori-library-card-*` block (lines ~2917–3035) verbatim against `Planning/ui-design.md:1552-1562`:
  - Base `transition` now uses `var(--motion-micro)` (120ms) + `var(--ease-editorial)` (`cubic-bezier(0.2, 0.8, 0.2, 1)`) instead of generic `120ms ease-out`.
  - Combined `:hover, :focus-visible` selector for background wake-up so keyboard focus paints the same `bg-1` shift as mouse hover (a11y parity per spec).
  - Thumb image: idle `opacity: 0.85`, transitions to `opacity: 1` on hover/focus. Dropped the prior `transform: scale(1.02)` (spec calls for opacity, not transform).
  - Letter-mark fallback: idle `filter: brightness(0.9)`, wakes to `brightness(1.05)` on hover/focus. Same wake-up language so the sketch image (Bug 5, when it lands) gets identical treatment.
  - `prefers-reduced-motion: reduce` + `html[data-reduce-motion='1']` BOTH gate transitions to `1ms` per the project's OR-wrapper convention cited at `lib/motion/defaults.ts:296`.
- `[data-pending='true']` block placed AFTER the hover/focus rules so the pending cue (opacity 0.7, cursor: progress) wins specificity when the user hovers a card mid-navigation — explicitly verified via a CSS-rule-order assertion test.

### Tests added
- `tests/components/library/LibraryCard.test.tsx` — 6 new cases under `hover/focus animation CSS rules (Bug 10)` describe, using CSS-rule-existence assertions (JSDOM cannot compute `:hover`/`:focus-visible` pseudo styles reliably, so reads `app/globals.css` and asserts regex patterns):
  1. Combined `:hover, :focus-visible` selector sets `background-color: var(--color-bg-1)`.
  2. Thumb img idle `opacity: 0.85` + `transition: opacity`.
  3. Combined `:hover .thumb img, :focus-visible .thumb img` → `opacity: 1`.
  4. Letter-mark idle `filter: brightness(0.9)` + combined hover/focus selector brightens.
  5. Reduced-motion: both `@media (prefers-reduced-motion: reduce)` AND `html[data-reduce-motion='1']` blocks collapse `transition-duration` to `1ms` on card + thumb img + letter-mark.
  6. Pending block lives AFTER hover block in CSS source order (specificity guarantee — pending wins over hover when both apply).

### RED → GREEN
- RED: Idle opacity 0.85 was missing; `:focus-visible` did NOT mirror the hover bg wake-up (a11y parity gap); transition used generic `ease-out`; no reduced-motion gate on the image scale.
- GREEN: All 6 CSS-rule assertions pass; existing 12 LibraryCard tests still green; pending cue still wins specificity (test verifies it).

### Deviations / decisions
- **CSS-only, not Framer Motion** — per Bug 10 proposal §"Why CSS-only and not Framer Motion `whileHover`". The transition surface is purely tonal (color, opacity, brightness, all compositor-friendly); Framer's `whileHover` would add render-tree churn on 10–50 grid cards for zero visual difference at 120ms.
- **Letter-mark idle `brightness(0.9)` is subtle on purpose** — flagged in proposal Open Q2 as "may feel too dim for idle"; user-approved at gate via "Default chosen". If the live grid feels too dim once Bug 5 lands real sketches, the filter clause can be dropped without re-running TDD.
- **Pending cue order constraint** — Wave 2's `[data-pending='true']` rule was already in the file at line 2945; I moved it intact to AFTER the new hover/focus block. Specificity-test guarantees future edits can't accidentally reverse the order without flagging at test run.

---

## Cluster regression check

- **Library component tests:** 153/153 pass (26 files).
- **Library + unit + integration combined:** 231/231 pass (37 files).
- **Library integration tests (library-page + library-grid-navigation):** 15/15 pass (2 files).
- **Adjacent surfaces** (log-flow LibraryTab, library-tab-continue, library-tab-hydration): 88/88 pass (14 files) — no LogFlow surface uses LibraryCard, so the role refactor is isolated to `/library` route.
- **Typecheck:** clean (`tsc --noEmit`).
- **Lint:** 0 errors, 13 pre-existing warnings (none in changed files; FoodDetail.tsx lint warning cleared by the ref-gated effect).
- **Visual diffs anticipated** (NOT regenerated this wave — flagged for Phase 7 visual sweep):
  1. Cards now show a kebab trigger in the top-right of each thumb (24×24 visual surface inside a 32×32 hit target, semi-opaque scrim).
  2. Cards' idle thumb opacity is now `0.85` (was 1.0) — spec-mandated subtle dim.
  3. Letter-mark idle brightness is now `0.9` (was 1.0) — spec-mandated subtle dim.
  4. Hover/focus wake-up transition now uses `ease-editorial` curve (was generic `ease-out`) — feel difference at 120ms is subtle but more "snappy-graceful".

---

## Hand-off

### Wave 4 (List / Sort / Separator) — contract changes to know about
- `LibraryCard` root is now `<div role="button" tabIndex>`. Anything that queries `button[data-testid^="library-card-"]` must widen the selector. Already-updated places: `LibraryGrid.tsx`'s `focusCard` querySelector, `LibraryClient.pagination.test.tsx` `cardButtons` helper, `LibraryGrid.test.tsx` tagName assertion.
- `LibraryGrid` now accepts optional `onCardEdit` + `onCardDelete` props. If Wave 4's pagination / sort / separator refactor touches `LibraryGrid` props, preserve these.
- Card-level `[data-pending='true']` cue still wins over the new hover/focus wake-up — order in CSS is enforced by a test.

### Wave 5 (Add-to-library + Sketch) — thumbnail render path expectations
- Bug 10's `.kalori-library-card-thumb img` rule applies idle `opacity: 0.85` to EVERY thumb image, including the future sketch image (Bug 5). If Wave 5's sketch render needs a different idle opacity, override on a more-specific selector (e.g. `.kalori-library-card-thumb img[data-sketch='true']`) rather than re-tuning the base rule.
- The kebab menu trigger is mounted absolutely inside `.kalori-library-card-thumb`. If Wave 5 changes the thumb's positioning context, the trigger must stay at top-right (32×32 hit target spec from ui-design.md hit-target rules).
- Bug 5's sketch backfill / generation worker is unaffected by Bug 3/10 — none of the wiring touches `thumbnail_url`, `thumbnail_kind`, or `sketch_*` columns. Wave 5 owns those.

### Stop-the-world / blocker check
- **NONE.** No tests had to be deleted. No proposal turned out wrong. Two existing tests (`LibraryGrid.test.tsx` tagName, `LibraryClient.pagination.test.tsx` selector) were updated to reflect the role refactor — both were anticipated in the briefing's "verify existing LibraryCard tests still pass" rider.
- BulkDeleteConfirmDialog single-item branch already existed (Task C.2 AC3) — no dialog API drift.
- `display: none` in selectMode was NOT used; instead the menu trigger is unconditionally not rendered (cleaner contract — leaves tab order entirely, never paints).
- Hover/focus + pending state coexistence verified via CSS-rule-order test.
- Reduced-motion gate engaged via both OS pref and `[data-reduce-motion='1']` selectors (test asserts both blocks exist).
