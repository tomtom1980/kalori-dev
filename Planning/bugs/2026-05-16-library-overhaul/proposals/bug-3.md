# Bug 3 — Quick-action menu on Library item cards

## Classification

**`actually_a_feature`** — additive UI surface. No existing bug; the user is requesting a new interaction affordance to avoid the navigate→load→delete/edit round trip on items where they already know what they want to do.

## Root Cause (why the feature is missing)

`LibraryCard.tsx` is a single `<button>` whose ENTIRE surface activates the detail navigation (`onActivate` → `router.push(/library/[id])`). Edit + Delete live inside `FoodDetailActions.tsx` (rendered at `/library/[id]` after the detail RSC loads). There is no surface on the card itself that lets a user skip the detail-page round trip. The existing edit/delete handlers in `FoodDetail.tsx` are not callable from the grid surface.

## Proposed Change

Introduce `<LibraryCardActionMenu>` rendered as an absolutely-positioned trigger in the top-right corner of every card thumbnail. Built on Radix `DropdownMenu` (already in deps; pattern precedent: `FilterDropdown.tsx`). Menu items: **Edit**, **Delete**. (Keep tight — user said "delete or edit"; "Log now" already lives on the detail page and on Confirmation flow — out of scope.)

Architecture:

1. **Trigger** — icon button (`MoreVertical` from `lucide-react`, matches `ChevronDown` usage in FilterDropdown). 32×32 hit target, absolute-positioned top-right of `kalori-library-card-thumb`. `data-testid="library-card-menu-trigger-{id}"`, `aria-label="Actions for {name}"`.
2. **`stopPropagation` strategy** — the card root is a `<button>`. A nested `<button>` is invalid HTML AND would still bubble click. Solution: refactor `LibraryCard.tsx` root from `<button>` to `<div role="button" tabIndex>` (keep keyboard semantics) — Radix `DropdownMenu.Trigger` then sits as a sibling DOM-wise but lives at the same React subtree. Trigger calls `ev.stopPropagation()` in `onPointerDown` + `onClick` to prevent the card-level `handleClick` from firing. Verified pattern: Radix DropdownMenu.Trigger asChild button + parent role=button is the standard nested-interactive escape hatch. (Alt considered: keep `<button>` root and render the menu trigger OUTSIDE the button via React Portal — rejected, breaks visual stacking + focus order.)
3. **Edit action** — navigates to `/library/[id]?mode=edit` (new query param). `FoodDetail.tsx` reads the query param and auto-enters edit mode (calls existing `onEditStart`). Avoids creating a parallel inline edit on the card itself (out of scope — user said "edit options through that" implying the existing edit surface, not a new one).
4. **Delete action** — opens the existing `<BulkDeleteConfirmDialog>` with a single-item `client_ids` array (per lessons line 8: "Single-item soft-delete reuses the bulk substrate"). On confirm, calls `POST /api/library/bulk-delete` (length-1 array) + pushes undo toast via `useUndoQueueStore.pushToast`. Card optimistically removed from grid.
5. **Selection-mode disable** — when `selectMode === true`, the menu trigger is hidden (`aria-hidden`, `display: none`) — the card's whole surface is a checkbox in that mode; quick actions don't apply.

Note: Per project convention, deleting from the grid surface goes through `bulk-delete` (length-1), NOT `[id]/delete` — the existing `FoodDetailActions` uses `[id]/delete` because it deletes the item currently being viewed and then navigates away; the grid context wants the undo-queue + optimistic-remove substrate that bulk-delete already wires up.

## Files Affected

| File | Change | LOC |
|---|---|---|
| `app/(app)/library/_components/LibraryCardActionMenu.tsx` | NEW — Radix DropdownMenu component, takes `itemId`, `displayName`, `onEdit`, `onDelete` | ~70 |
| `app/(app)/library/_components/LibraryCard.tsx` | Refactor root `<button>` → `<div role="button" tabIndex>`. Mount `<LibraryCardActionMenu>` absolutely-positioned in thumb. Hide in selectMode. | ~25 |
| `app/(app)/library/_components/LibraryGrid.tsx` | Thread new `onCardEdit`, `onCardDelete` props through to each card. | ~15 |
| `app/(app)/library/_components/LibraryClient.tsx` | Wire `onCardEdit` → `router.push('/library/{id}?mode=edit')`; `onCardDelete` → open single-item `BulkDeleteConfirmDialog`. | ~30 |
| `app/(app)/library/[id]/page.tsx` + `FoodDetail.tsx` | Read `mode=edit` searchParam, call existing `onEditStart` after mount. | ~10 |
| `app/globals.css` | New `.kalori-library-card-menu-trigger` styles (absolute top:6 right:6, 32×32 hit target, hover ring oxblood-soft, focus-visible outline). New `.kalori-library-card-menu-content` (Ledger hairline, bg-2, zero-radius). | ~25 |
| `lib/i18n/en.ts` | New strings: `cardMenuAriaLabel`, `cardMenuEdit`, `cardMenuDelete`. | ~5 |

**Total: 7 files, ~180 LOC.**

## TDD Required

**YES** — feature affects user-observable behavior, navigation, and destructive action surface. Per testing.md, exception (pure UI/styling) does NOT apply because this introduces logic (stopPropagation, navigation, delete dispatch).

## Test Approach

Per testing.md TDD + lessons line 10 ("don't assert presence; assert behavior"):

1. **RED — `LibraryCardActionMenu.test.tsx` (unit)**:
   - Trigger renders with correct `aria-label="Actions for {name}"`, `data-testid` per item.
   - Opening menu via click reveals two menu items: `Edit`, `Delete`. Both have correct role + `data-testid`.
   - Click on Edit calls `onEdit` exactly once. Click on Delete calls `onDelete` exactly once. The card's `onActivate` is NOT called in either path (stopPropagation verified).
   - Keyboard: trigger reachable via Tab, Space/Enter opens, ArrowDown moves focus, Escape closes + restores focus to trigger.
2. **RED — `LibraryCard-menu.test.tsx` (integration)**:
   - Mount `<LibraryCard selectMode={false}>` + click trigger → menu opens. Click outside → menu closes, card NOT activated.
   - Click on card body (NOT trigger) → `onActivate` fires.
   - `selectMode={true}` → trigger NOT in DOM (hidden).
3. **RED — `LibraryClient-quick-actions.test.tsx` (integration)**:
   - Click Edit → asserts `router.push` called with `'/library/{id}?mode=edit'`.
   - Click Delete → asserts `BulkDeleteConfirmDialog` opens with `client_ids: [id]`. Confirm → asserts POST to `/api/library/bulk-delete` + undo toast pushed.
4. **RED — `FoodDetail-mode-edit-query.test.tsx`**:
   - Mount `<FoodDetail>` with `searchParams.mode === 'edit'` → component auto-enters edit mode on first render.
5. **a11y test**:
   - `axe(container)` on rendered grid with menu OPEN — zero violations. (Per lessons line 15: real-tool against real-markup, not audit-only.)

GREEN: implement minimal Radix DropdownMenu + thread handlers + searchParam read. No premature abstraction.

## Risk

**Medium.**

- **Nested-interactive hazard** — refactoring `LibraryCard` root from `<button>` to `<div role="button">` is a touch point on a high-traffic component. Mitigation: keyboard tests must explicitly cover Enter/Space activation parity, Tab order, and screen-reader role announcement. Lessons line 15 directly applies (Phase 1 audits don't catch nested-interactive issues; RED-first axe against composed markup does).
- **`stopPropagation` correctness** — must stop both `onPointerDown` AND `onClick` because the card uses `onClick`; if pointerDown also triggers any focus side-effect on the parent, that needs blocking too.
- **selectMode interaction** — in select mode, the trigger must be hidden from tab-order, not just visually hidden (otherwise keyboard users tab through invisible triggers).
- **Optimistic delete + undo** — using the bulk-delete substrate is correct per lessons line 8, but we MUST verify the grid actually removes the card optimistically and re-inserts on undo. Existing `LibraryClient` selection-mode bulk delete already does this; new path just calls the same store action.
- **Mode=edit query param leak** — after auto-entering edit mode, the `?mode=edit` query param should be stripped via `router.replace` so reloads / back-navigation don't re-trigger.

## Regression Sweep

After GREEN:

1. `pnpm test app/(app)/library` — every library component test passes.
2. E2E (`tests/e2e/web/user-stories/US-STAB-*.spec.ts` for library flows): card click still navigates to detail page.
3. Axe scan on `/library` with menu OPEN and CLOSED.
4. Keyboard sweep: Tab through grid; verify trigger is reachable, menu opens via Space/Enter, Escape returns focus.
5. Visual regression at mobile-375, tablet-768, desktop-1280 (lessons line 12 — `min-width: 0` cascade); trigger should not overflow card or push macros line.

## UI Touching

**YES.**

## Component Affected

`LibraryCard.tsx` (refactor root, mount trigger), new `LibraryCardActionMenu.tsx`, `LibraryGrid.tsx` (prop thread), `LibraryClient.tsx` (handler wiring), `FoodDetail.tsx` (mode=edit read).

## Library/Token Citation

- **Radix primitive** — `@radix-ui/react-dropdown-menu` (^2.1.16, `package.json:37`). Pattern precedent: `app/(app)/library/_components/FilterDropdown.tsx` — same project, same skill (DropdownMenu.Root → Trigger asChild → Portal → Content → Items).
- **Icon** — `MoreVertical` from `lucide-react` (already in deps; `ChevronDown` from same lib already used in FilterDropdown).
- **Tokens** — trigger background transparent, border `var(--color-rule-strong)` on hover, focus-visible outline `var(--color-oxblood-soft)` (lessons line 7: oxblood-soft is accent-only on dark surfaces — used as outline/border, NOT as text fill, ✓ compliant). Menu content panel: `bg: var(--color-bg-2)`, `border: 1px solid var(--color-rule-strong)`, zero-radius, no shadow per Ledger §3.4.
- **Spacing** — trigger 32×32 hit target (WCAG 2.5.5 AA, per ui-design.md §3 hit-target rules).
- **`ui-design.md` reference** — §4.2.5 `LibraryCard` compound API does NOT currently spec a menu slot; this proposal introduces `<LibraryCard.ActionMenu>` as a new compound member positioned absolutely within `<LibraryCard.Thumbnail>`. Cite ui-design.md §1505 (LibraryCard compound docs) — addendum needed; flag for follow-up.
- **`web-ui-guide.md` quick-pick** — Radix DropdownMenu is the canonical menu primitive on this stack (FilterDropdown + SortDropdown both use it).

## Open Questions

1. **Should Log-now be a third option in the menu?** User said "delete or edit." I propose keeping it tight (just those two) — Log-now lives on FoodDetail page with its own UI affordances (in-flight latch, status announcement, retry semantics per lessons line 9). Adding it to the quick menu duplicates that surface and risks the retry contract diverging. **Recommend NO.**
2. **`stopPropagation` on PointerDown OR Click?** Radix DropdownMenu.Trigger handles its own pointer events. If the parent `<div role="button">` still uses `onClick` for activation, stopping at click level is enough. If parent ever migrates to pointer-down for snappier feel, this needs revisit. **Recommend `onClick` stopPropagation + verify via test.**
3. **Edit-mode query param strategy** — `router.push('/library/{id}?mode=edit')` then `router.replace('/library/{id}')` on auto-enter, OR pass via state without query string? Query string is shareable + bookmarkable + survives reload; state-only doesn't survive reload. **Recommend query string + strip-after-consume.**
4. **Mobile UX** — on small viewports, 32×32 trigger on a 160px-wide thumb crowds the count-badge. Recommend: trigger occupies top-right, count-badge shifts to bottom-right of thumb (currently it's not pinned but flow-positioned). Need to verify with UI sub-agent if scope expands beyond this proposal.
5. **Confirm dialog reuse** — `BulkDeleteConfirmDialog` currently shows "Delete N items?" wording. Single-item path may want "Delete '{name}'?" — does the dialog already accept a `displayName` override, or do we need a small i18n branch?
