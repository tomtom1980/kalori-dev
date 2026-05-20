# Bug 1: Library ADD/RECORD form missing collapsible Micronutrients section

## Classification

`actually_a_feature` — the AI-parse flow already returns a `micros` map (30 canonical codes) which is preserved into `/api/library/create`'s nutrition payload, but the ConfirmationScreen UI surfaces it as **zero editable inputs** in `library-only` mode. The user is asking us to expose those values in a collapsible expander so they can review/edit micronutrients before the library row is created. Treated as a small, scoped feature delivered via the bugfix-tomi batch (per Phase 1 dispatch).

## Root Cause

`ConfirmationItemMacros` (`app/(app)/log/_components/ConfirmationScreen.tsx:1259–1317`) renders only the five macros (`protein`, `carbs`, `fat`, `fiber`, `cholesterol_mg`) as read-only `<dl>` rows. There is no JSX, no reducer case, no `actions.editMicro` for any of the 30 canonical micros. In `library-only` mode the row's `item.micros` is forwarded verbatim to `/api/library/create` (line 653 `parsedMicros = row.item.micros ?? {}` → `nutrition.micros = nonZeroMicros`), so values "ride along" silently. Detail/edit view DOES expose a collapsible micros editor (`EditMicrosCollapsible` in `FoodDetailMacros.tsx:621–701`) but ONLY for `sugar_g` + `sodium_mg` (per design rule "only show inputs whose saved value > 0"). Neither surface lets the user enter a *new* micro value at creation time.

## Existing pattern reference

`app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:621–701` — `EditMicrosCollapsible` component using `@radix-ui/react-collapsible`:

- `Collapsible.Root` with `style={{ gridColumn: '1 / -1' }}` (lines 635)
- `Collapsible.Trigger` with `data-testid="food-detail-edit-micros-trigger"`, dual `<span data-state-label="show|hide">` for label-swap, `aria-controls={panelId}` (lines 636–645)
- `Collapsible.Content` containing the inputs; `kalori-fd-micros-expand-grid` class wraps a label+input grid (lines 646–699)
- CSS classes already exist (`kalori-fd-micros-expand-trigger`, `kalori-fd-micros-expand-caret`, `kalori-fd-input`, `kalori-fd-micros-expand-content`, `kalori-fd-micros-expand-grid`) and are styled in the existing Library SCSS for the detail page.

Read-only version (`MicrosReadOnly`) at the same file lines 485–586 uses `Collapsible.Root` + `sortMicrosByPriority` from `@/lib/nutrition/display-micros` — the priority sort is the canonical ordering we should reuse.

## Reusability assessment

**Inline JSX needing partial extraction.** The detail-edit `EditMicrosCollapsible`:

- Takes detail-page-specific props (`savedSugarG`, `savedSodiumMg`, `draftSugarG`, `draftSodiumMg`, `errors`, `saving`, `onDraftChange`) — these are bound to the FoodDetail edit reducer/draft model, not portable.
- Is restricted to two micros by the "saved > 0" rule (sugar + sodium only).
- The Collapsible **shell** (trigger, content frame, caret, label swap, CSS classes) IS the reusable pattern, but the **content** must be re-implemented for the confirmation row because the data shape, edit semantics, and "show all 30 canonical micros" requirement differ.

Decision: **don't extract a shared component in this bug.** Instead, build a new `ConfirmationItemMicros` sibling to `ConfirmationItemMacros` that reuses (a) the same Radix Collapsible primitive, (b) the same CSS classes (move them up to a shared SCSS file or copy if locally-scoped), and (c) the same `sortMicrosByPriority` ordering. Future refactor (out of scope) could extract a `<MicrosCollapsibleShell>` once we have a third caller.

## Proposed Change (Diff Outline)

- **File:** `app/(app)/log/_components/ConfirmationScreen.tsx`
  - Add reducer action `EDIT_ITEM_MICRO` (line ~201, after `EDIT_ITEM_PORTION`):
    ```ts
    | { type: 'EDIT_ITEM_MICRO'; id: RowId; key: string; value: number }
    ```
  - Add reducer case (after `EDIT_ITEM_PORTION` case ~345):
    ```ts
    case 'EDIT_ITEM_MICRO': {
      const rows = state.rows.map((r) =>
        r.id === action.id
          ? { ...r, item: { ...r.item, micros: { ...(r.item.micros ?? {}), [action.key]: action.value } } }
          : r,
      );
      return { ...state, rows };
    }
    ```
  - Add action `editMicro: (id, key, value) => dispatch({ type: 'EDIT_ITEM_MICRO', id, key, value })` to `ConfirmationActions` interface (line ~375) and to the actions object (~line 580).
  - Inside `Row` / item render block (line ~1244 `<ConfirmationItemMacros ... />`), add a sibling `<ConfirmationItemMicros rowId={rowId} index={index} />`. Render ONLY in `library-only` mode — gate via `useConfirmation().meta.mode === 'library-only'` OR pass through as a prop. (Decision question — see Open Questions.)
  - Implement new `ConfirmationItemMicros` component below `ConfirmationItemMacros` (~line 1318):
    - Reads `row.item.micros` via context.
    - Renders Radix `Collapsible.Root` default closed, with `data-testid="confirmation-item-{index}-micros-trigger"` and matching content panel.
    - Trigger label: i18n strings `t.log.confirmationMicrosExpandShow` / `…Hide` (new keys — see content/translations entry below). Use existing CSS classes (`kalori-fd-micros-expand-*`) once stylesheet is shared (Open Question).
    - Inside content: iterate the 30 canonical micro codes (use `MICRO_PRIORITY` from `@/lib/nutrition/display-micros`); for each, render `<label htmlFor> + <input type="text" inputMode="decimal">` bound to current value (string-coerced from `row.item.micros?.[key] ?? 0`).
    - On input change: parse to number, call `actions.editMicro(rowId, key, parsed)`. Use `roundNutrition` already in file (line 283) on commit.
    - Disable inputs while `meta.isSaving` (mirror existing `disabled` pattern).
    - Per-row a11y: `aria-controls={panelId}` + `useId()`.

- **File:** `content/en/log.ts` (or equivalent translations file holding `t.log.*`)
  - Add strings `confirmationMicrosExpandShow` ("Add micronutrients"), `confirmationMicrosExpandHide` ("Hide micronutrients"), `confirmationMicrosEmpty` ("All micros at zero — expand to add values"), micro labels if they're not already shared with the library detail page.

- **File:** `app/(app)/log/_components/confirmation.module.scss` (or wherever `kalori-confirmation-*` classes live)
  - Add styles for `kalori-confirmation-item-micros` wrapper. Reuse `kalori-fd-micros-expand-*` classes by either:
    1. Copying the rules into a shared partial like `_micros-collapsible.scss` and importing from both files, OR
    2. Adding the same class names to the new component (since they're already styled globally) — verify scope before choosing.

- **File:** `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` (verify path)
  - No changes expected — but check that `sortMicrosByPriority` is exported usefully for both surfaces.

- **(Optional/Deferred)** Extract shared `<MicrosCollapsibleShell>` in a future cleanup task. Out of scope for this bug.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\content\en\log.ts` (path TBD; whichever file holds `t.log.*` strings)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\content\vi\log.ts` (Vietnamese mirror, if i18n is dual-locale here)
- Stylesheet that owns `kalori-confirmation-*` (path TBD — likely `app/(app)/log/_components/confirmation.scss` or `app/globals.css`)
- **NEW test:** `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx`
- **POSSIBLY MODIFIED:** `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` (add cases for library-only micros surface visibility and dispatch)
- **POSSIBLY MODIFIED:** existing `tests/components/log-flow/library-tab-self-hydrate.test.tsx` if it asserts shape of confirmation rows

## TDD Required

**yes** — logic-touching. Reducer gains a new action + case; component renders new editable inputs; library-only branch must persist user-edited micros to `/api/library/create` payload.

## Test Approach

1. **Reducer unit test (red-first):** assert dispatching `EDIT_ITEM_MICRO { id, key: 'iron_mg', value: 5 }` updates `state.rows[i].item.micros.iron_mg` without clobbering other keys. Verify decimal input via `roundNutrition` produces `5.3` not `5.300000001`.
2. **Component unit test:** render `ConfirmationScreen` in `library-only` mode with one row. Assert the micros trigger button exists (`getByTestId('confirmation-item-0-micros-trigger')`); click expands and reveals 30 (or canonical-filtered) input rows; type a value into `iron_mg` input → dispatched action shows in mock; collapsing hides the panel (Radix sets `data-state="closed"`).
3. **Library-only persistence (integration via existing pattern):** in a render-and-save test, edit a micro, click Save, assert the POST body sent to `/api/library/create` (mocked `authFetch`) contains the edited `nutrition.micros.iron_mg` value.
4. **Log-flow regression:** assert the micros expander does NOT appear in `mode !== 'library-only'` (or whatever rule we settle on per Open Questions) — keeps the existing dashboard log flow unchanged.
5. **A11y:** verify trigger has `aria-controls`, inputs have associated labels, expanded state reads "Hide micronutrients" not "Add micronutrients".
6. **Empty/zero state:** if AI parse returned all-zero micros, expander still mounts and content explains the user can add values (mirror detail-edit's "nothingToShow" hint, but with "you can fill these in" framing instead of "edit what's here").

## Risk Assessment

**low–medium.** Reducer change is purely additive (new action, no mutation of existing cases). Component is a new sibling render. The only cross-cutting risk:

- `library-only` is also the path that previously had the dedup banner / save-CTA wording tweaks (E.CODEX Round-2 C2), so any new render inside the row should not interfere with the dedup-modal blocking-save state.
- AI-parse already populates `row.item.micros` with all 30 canonical codes from the AI parse contract (per existing comment line 646–651). New user edits must round-trip via `roundNutrition` to keep shape consistent.
- We need to confirm whether the standard (log) flow ConfirmationScreen should *also* gain this expander or stay log-flow-untouched (default: keep log flow unchanged to honor "surgical changes" and avoid log-flow UX scope creep).

## Regression Sweep Needed

- ConfirmationScreen tests (`tests/components/log-flow/*` and `tests/unit/components/log-flow/*`).
- Library tab self-hydrate + preselect tests (they read confirmation rows).
- E2E user stories: US-STAB-A1 (Add Item flow), US-STAB-A-bundled, the cholesterol Phase B/C E2E tests since they touch ConfirmationItemMacros rendering.
- Visual baselines for `tests/screenshots/user-stories/US-STAB-A1/*` (Add Item screenshots) will regenerate because the row now has a collapsed expander trigger.

## UI Touching

`true` — components: `ConfirmationScreen` (new sub-component `ConfirmationItemMicros`), no detail page changes. Bug touches log-flow modal in library-only sub-mode only.

## ui-design prescription cited

- **Quick-Pick Decision Table — Disclosure/Collapse row:** "Use Radix `Collapsible` for single-section show/hide with a labeled trigger; reserve shadcn `Accordion` for multi-section exclusive expansion." Library-only micros = single-section single-panel → **Radix `Collapsible`** matches (and matches the existing detail-edit precedent in `FoodDetailMacros.tsx`).
- **planning/ui-design.md Library Prescriptions — `Inline disclosure for secondary nutrient data`:** "Micros panel ships as a Radix Collapsible default-closed, trigger label swaps via `data-state-label` pseudo-attributes, content panel uses `kalori-fd-micros-expand-grid` (2-col label+input)." Reuse verbatim — same component family, same CSS class namespace, same a11y contract (`aria-controls` + `useId()`).

## Coordination notes

- **Bug 2 (Detail-edit micros: all-zero collapsible quirk / mid-quote micro entry):** If Bug 2 reworks `EditMicrosCollapsible` to allow user-driven new-micro entry (relaxing the "saved > 0" guard), our Bug 1 design becomes a natural twin of the new detail-edit shape and we MAY want to extract a shared `<MicrosCollapsibleShell>`. **Sequence:** wait for Bug 2's proposal before finalizing whether to extract OR keep two parallel implementations. If Bug 2 does NOT relax the guard, Bug 1 ships standalone with no shared component.
- **Bug 3:** No file overlap expected. Parallel-safe with bug 3.
- **Shared file with bug 2:** if bug 2 modifies `FoodDetailMacros.tsx`, no overlap with bug 1's `ConfirmationScreen.tsx`. Stylesheet *may* overlap if bug 2 adds new `kalori-fd-micros-*` rules — coordinate via state.md.

## Open Questions

1. **Scope gate:** should the micros expander render only in `library-only` mode, or also in the normal log flow (so users can adjust micros before logging a food entry too)? Default per "surgical changes": **library-only only**, since bug ticket says "recording form" (= library Add Item). Confirm with main agent / user.
2. **i18n key file location:** confirm which file under `content/` owns `t.log.confirmationItemMacro*` keys so we can add `t.log.confirmationItemMicro*` siblings — could not verify without an extra grep. Implementation sub-agent must locate before writing strings.
3. **Stylesheet sharing:** are `kalori-fd-micros-expand-*` classes globally scoped (in `app/globals.css`) or module-scoped to FoodDetail? If global, the new ConfirmationItemMicros can reuse them verbatim. If module-scoped, we either (a) extract a shared partial or (b) duplicate the rules under `kalori-confirmation-item-micros-expand-*`. Decision deferred to implementation phase after a 1-minute grep.
4. **Sorting / canonical set:** render all 30 canonical codes, or only the subset returned by `sortMicrosByPriority`? `sortMicrosByPriority` operates on existing entries; for add-time we likely want ALL 30 so the user can fill any in. Confirm with main agent.
5. **Validation:** mirror detail-edit's input validation (`zod` schema?) or accept any non-negative decimal? Detail-edit uses `errors: EditErrors` map — bug 1 likely needs the same error-surfacing shape. Pull the existing micro-validation Zod schema from `lib/parse/parsed-item.schema.ts` (or wherever) at implementation time.
