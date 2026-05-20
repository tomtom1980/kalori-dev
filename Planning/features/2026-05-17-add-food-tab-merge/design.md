# Design: Merge Type + Library tabs → unified "Add Food" tab

**Status:** Draft (pending user review)
**Author:** Claude (brainstorming session 2026-05-17)
**Routing:** `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development` (single-feature contained scope, no schema/migration/cross-cutting; see `~/.claude/rules/skill-routing.md` Case 4)
**Scope estimate:** 3–5 hours implementation + tests

---

## 1. Problem statement

The dashboard log-flow modal currently exposes three sibling tabs — **Type**, **Snap**, **Library** — that share a Radix `<Tabs.Root>` host in `app/(app)/log/_components/LogFlowTabs.tsx`. From a user's mental model, Type and Library are not really two separate concepts: both end with "I logged a food." Type is "I will describe a food I don't have saved"; Library is "I will pick from foods I've saved before." Splitting them into two top-level tabs forces the user to know in advance which path applies, and the Library tab's initial render flashes an empty state for ~50–300 ms while `/api/library/list` resolves (the React effect fires after mount, not synchronously).

We're consolidating Type + Library into a single **Add Food** tab whose default view is the library list, with explicit affordances for "add a new item not in my library" via an inline-swap to the AI parse form. The Snap tab (photo → AI vision) stays a sibling tab because it's a genuinely different input modality (camera). End-state: 2 tabs instead of 3, single mental model for non-photo food entry, no empty-state flash.

---

## 2. Goals and non-goals

### Goals

1. Replace the 3-tab bar (Type / Snap / Library) with a 2-tab bar (Add Food / Snap).
2. Default the new Add Food tab to the library list view.
3. Replace the empty-state flash with a match-to-shape skeleton during initial library hydration.
4. Provide two entry points to the AI parse form from within Add Food: a subtle persistent `+` button next to the search input, and a prominent CTA inside the no-results empty state.
5. Preserve library list state (search term, scroll position) across the inline back-and-forth between the library view and the AI parse subview.
6. Pre-seed the AI parse textarea with the current search term when the user enters parse mode via the empty-state CTA.
7. Keep the existing Snap flow, ConfirmationScreen flow, library-only mode (`/library` Add Item button), edit-entry flow, save-to-library toggle, and AI parse algorithm exactly as they are today.

### Non-goals

- No redesign of the Snap tab or its photo capture flow.
- No changes to library-only mode UI (the special render branch triggered from `LibraryClient.tsx` line 614 when `mode === 'library-only'`).
- No changes to the AI parse algorithm (text or vision).
- No changes to ConfirmationScreen, save-to-library toggle, per-row save toggle, or the entries-save API.
- No changes to library item editing inside `/library/[id]`.
- No changes to the edit-entry flow via `MealEntryContextTrigger.tsx` lines 182–198 (this path skips Add Food entirely; opens `enterConfirmation` directly).
- No schema, migration, or API surface changes.
- No new modal-stacking pattern (Kalori does not stack modals anywhere today; we won't introduce that here).

---

## 3. User journeys (4 happy paths)

### Journey A — Re-log an existing library item

1. Tap dashboard FAB → log-flow modal opens → `activeTab='add-food'`, `addFoodView='library'`.
2. Skeleton renders for ~50–300 ms while `/api/library/list` resolves.
3. Library populates with items (sorted as today — most-recent / log-count, unchanged).
4. User types "pho" in search → debounced local filter → row appears.
5. User taps the row → existing `enterConfirmation({ source: 'library', libraryItemIds: [<id>] })` fires.
6. ConfirmationScreen renders → user confirms → entry saved → modal closes.

### Journey B — Add a brand-new food via direct `+` button

1. Modal opens → library view.
2. User taps `+` button beside search input.
3. `setAddFoodView('parse')` → AiParseForm renders.
4. If `typeDraft` has prior content (from earlier same-session parse attempt), the textarea pre-fills with it; otherwise empty.
5. User types description → presses PARSE → existing `/api/ai/text-parse` call → `enterConfirmation({ source: 'text', ... })`.
6. ConfirmationScreen → confirm → save → modal closes.

### Journey C — Search-miss → empty-state CTA (the seeded path)

1. Modal opens → library view → items hydrated.
2. User types "banh xeo" in search → 0 matches → LibraryEmptyState renders with prominent "+ Add it as new item" CTA.
3. User taps CTA.
4. `setTypeDraft('banh xeo')` + `setAddFoodView('parse')` fire together.
5. AiParseForm renders with textarea **pre-filled with "banh xeo"** → user just presses PARSE.
6. From there, same as Journey B.

### Journey D — Back-out from parse without committing

1. From any of B/C, user taps the back arrow in AiParseForm (top-left of the parse subview).
2. `setAddFoodView('library')` fires.
3. LibraryList re-renders. **Search term preserved** (lifted to `AddFoodTab` state — see §4 and §5). **Scroll position resets to top** (accepted trade-off per §11 #3 — the alternative `scrollRestoreRef` pattern is ~30 min extra and not in the 3–5h budget unless user overrides).
4. `typeDraft` REMAINS in the Zustand store, so re-entering parse view shows the user's prior text.
5. User can switch to Snap tab without unwinding (tab bar is still visible).

---

## 4. Component architecture

```
app/(app)/log/_components/
├── LogFlowTabs.tsx                    (MODIFIED — TAB_DEFS shrinks to 2 entries)
├── AddFoodTab/                        (NEW directory)
│   ├── AddFoodTab.tsx                 (NEW wrapper; hosts addFoodView state machine)
│   ├── LibraryList.tsx                (EXTRACTED from LibraryTab.tsx)
│   ├── LibraryLoadingSkeleton.tsx     (NEW — 8-row match-to-shape skeleton)
│   ├── LibraryEmptyState.tsx          (EXTRACTED + EXTENDED with CTA)
│   ├── AddNewItemIconButton.tsx       (NEW — subtle '+' beside search)
│   ├── AddNewItemCTA.tsx              (NEW — prominent button inside empty state)
│   └── AiParseForm.tsx                (EXTRACTED from TypeTab.tsx + back-arrow header)
├── SnapTab.tsx                        (UNCHANGED)
├── ConfirmationScreen.tsx             (UNCHANGED)
└── ...                                (other files UNCHANGED)
```

### LogFlowTabs.tsx changes

- `TAB_DEFS` shrinks from `[{key:'type'}, {key:'snap'}, {key:'library'}]` to `[{key:'add-food', label:t.tabs.addFood, testId:'tab-add-food'}, {key:'snap', label:t.tabs.snap, testId:'tab-snap'}]`.
- `LogTab` type union shrinks from `'type' | 'snap' | 'library'` to `'add-food' | 'snap'`.
- Library-only mode render branch (the `mode === 'library-only'` short-circuit) stays intact — it bypasses the tab bar entirely, so the tab union shrinking doesn't affect it.
- All `<Tabs.Content value="...">` rewires: previous `value="type"` and `value="library"` panels are removed; new `value="add-food"` panel renders `<AddFoodTab />`.

### AddFoodTab.tsx (new wrapper)

```tsx
type AddFoodView = 'library' | 'parse';

export function AddFoodTab(props: AddFoodTabProps) {
  const [view, setView] = useState<AddFoodView>('library');
  const setTypeDraft = useLogFlowStore((s) => s.setTypeDraft);

  const enterParseView = useCallback((seed?: string) => {
    if (seed) setTypeDraft(seed);
    setView('parse');
  }, [setTypeDraft]);

  const backToLibrary = useCallback(() => setView('library'), []);

  if (view === 'parse') {
    return <AiParseForm onBack={backToLibrary} {...props} />;
  }
  return <LibraryList onAddNew={enterParseView} {...props} />;
}
```

Key invariants:
- `view` is local React state, **not Zustand** — reopening the modal always lands on `library` (no surprise resume into parse subview).
- `typeDraft` persists across the view toggle because it's stored in Zustand and only cleared explicitly (e.g., on ConfirmationScreen commit success).

### LibraryList.tsx

Mostly the existing `LibraryTab.tsx` content, with three additions:
1. `<AddNewItemIconButton>` rendered to the right of the search input.
2. `<LibraryLoadingSkeleton>` rendered when `libraryItems.length === 0 && hydrating === true`.
3. `<LibraryEmptyState>` now receives the current search term and an `onAddNew(seed)` callback.

Search term and scroll position kept in `LibraryList`'s own local state (search) and natural DOM scroll position (scroll). When `AddFoodTab` swaps to `AiParseForm` and back, `LibraryList` unmounts/remounts — so we need to **lift the search term and scroll position into `AddFoodTab` state** to survive the unmount, OR keep `LibraryList` mounted and hide it via CSS. The cleaner solution: lift `searchTerm` to `AddFoodTab` (pass down as prop + onChange); scroll position can be lifted via a `scrollRestoreRef` pattern, OR we accept that scroll resets to top on back (acceptable for MVP). **Design decision: lift `searchTerm` only; scroll resets to top on back is acceptable.**

### AiParseForm.tsx

Mostly the existing `TypeTab.tsx` content, with one addition:
1. A back-arrow header above the textarea: `← Back to library` (or chevron + label). Calls `props.onBack`.

Everything else (textarea, character count, PARSE button, ManualEntryFallback, error states, debounce, auth, `/api/ai/text-parse` call, `enterConfirmation` routing) is **unchanged**.

### LibraryLoadingSkeleton.tsx

```tsx
export function LibraryLoadingSkeleton({ rowCount = 8 }: { rowCount?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading library" className="kalori-library-skeleton">
      {Array.from({ length: rowCount }, (_, i) => (
        <li key={i} className="kalori-library-skeleton-row">
          <div className="kalori-library-skeleton-thumb" />
          <div className="kalori-library-skeleton-content">
            <div className="kalori-library-skeleton-name" style={{ width: `${60 + (i * 7) % 35}%` }} />
            <div className="kalori-library-skeleton-macros">
              <span className="kalori-library-skeleton-macro" />
              <span className="kalori-library-skeleton-macro" />
              <span className="kalori-library-skeleton-macro" />
            </div>
          </div>
          <div className="kalori-library-skeleton-kcal" />
        </li>
      ))}
    </ul>
  );
}
```

- `rowCount` defaults to 8 (matches typical above-the-fold density).
- Pseudo-random width variation per row (deterministic from index) avoids the "all rows identical" tell.
- `aria-busy="true"` + `aria-label` for screen-reader announcement.
- CSS lives in `app/globals.css` under a new `.kalori-library-skeleton-*` namespace.
- Animation: subtle 1.5 s `opacity` keyframe pulse 0.4 ↔ 1.0 on `--color-mock-bg` blocks. Disabled under `prefers-reduced-motion`.

### AddNewItemIconButton.tsx + AddNewItemCTA.tsx

Both wrap a click handler that calls `onAddNew(searchTermOrUndefined)`. The icon button is a 32×32 ghost-icon `+` (Lucide `Plus`) next to the search input; the CTA is a full-width prominent button rendered inside `LibraryEmptyState` when search returns no matches.

---

## 5. State and store changes

### useLogFlowStore (lib/stores/useLogFlowStore.ts)

Changes:
- `LogTab` type: `'type' | 'snap' | 'library'` → `'add-food' | 'snap'`.
- `openModal(tab, opts)`: default tab becomes `'add-food'` when caller passes nothing.
- Library-only mode's draft-reset logic (lines 471–484 per Explore findings) currently clears `typeDraft / typeParsed / failureMode / clientId` for the 'type' tab. Those state keys are NOT renamed (Coding Principle #3, surgical). Only the tab-key argument changes.
- All other store actions unchanged.

### Local state in AddFoodTab

- `view: 'library' | 'parse'` (useState, defaults to 'library' on mount)
- `searchTerm: string` (lifted from LibraryList so it survives the view toggle)

These are intentionally **not** in Zustand:
- `view` should not persist across modal closes (always reopen on library).
- `searchTerm` is tab-local; storing in Zustand would leak it across modal sessions, which is a regression vs. current LibraryTab behavior.

---

## 6. Migration touch points (audit-able list)

| File | Change | Risk |
|---|---|---|
| `app/(app)/log/_components/LogFlowTabs.tsx` | TAB_DEFS → 2 entries; remove `<Tabs.Content value="type">` and `value="library">`; add `value="add-food">`. | M — central file; covered by tests |
| `app/(app)/log/_components/LibraryTab.tsx` | DELETE after extracting to `AddFoodTab/LibraryList.tsx`. Verify no external import. | L |
| `app/(app)/log/_components/TypeTab.tsx` | DELETE after extracting to `AddFoodTab/AiParseForm.tsx`. Verify no external import. | L |
| `app/(app)/log/_components/AddFoodTab/` | NEW directory + 6 new files (see §4). | M — new code |
| `lib/stores/useLogFlowStore.ts` | `LogTab` type narrowed; default tab in `openModal()`. Draft-reset internals unchanged. | M — store mutation; tests cover |
| `components/dashboard/MealEntryContextTrigger.tsx:56` | `openModal('type', ...)` → `openModal('add-food', ...)`. | L — 1-line change |
| `app/(app)/library/_components/LibraryClient.tsx:614` | `openModal('type', { mode: 'library-only' })` → `openModal('add-food', { mode: 'library-only' })`. | L — 1-line change |
| `lib/i18n/en.ts` | Add `tabs.addFood`; remove `tabs.type`, `tabs.library`. | L |
| `app/globals.css` | Add `.kalori-library-skeleton-*` rules + `.kalori-add-food-back-button` rule. | L |
| `app/(app)/log/page.tsx` | If it server-fetches and passes `initialTab` props, default to `'add-food'`. | L — config-style change |
| `app/(app)/log/_components/LogPageClient.tsx` | If it accepts an `initialTab` URL param mapped from `?tab=`, accept new value. | L — backward-compat decision below |
| Tests with `data-testid="tab-type"` / `data-testid="tab-library"` | Migrate to `tab-add-food`. Grep for occurrences. | M — broad surface |
| Visual baselines | ~6–10 PNGs in `tests/screenshots/` need refresh. | L |

**Backward-compat decision for `?tab=` URL param (if it exists):** map legacy `?tab=type` and `?tab=library` to `?tab=add-food` server-side for one release, then remove. **Pending grep audit during implementation phase** — may not exist at all, in which case nothing to do.

---

## 7. Error handling

### Library fetch failure (`/api/library/list` rejects)

- Show inline error within LibraryList: "Couldn't load library. [Retry]".
- `+` icon button beside search remains functional (user can still parse).
- Empty-state CTA path requires items to be loaded for "no match" detection; if items never loaded, the `+` button is the only entry point. This is acceptable degradation.

### AI parse failure

- Existing `ManualEntryFallback` renders inline within AiParseForm. Unchanged behavior.
- Back arrow remains visible so user can return to library and re-log a known item.

### Library-only mode opens during a stale Add Food session

- The store already clears the `typeDraft` etc. on library-only mode entry (per Explore findings line 471–484). After library-only mode commits and closes, reopening the dashboard FAB lands on Add Food → library view with skeleton (fresh fetch). No state leak.

### Tab switch from Add Food → Snap mid-parse

- `addFoodView` is local state. Switching to Snap unmounts `<AddFoodTab>` and discards `view`. `typeDraft` remains in store (so returning to Add Food and tapping `+` shows the prior text). Acceptable — this matches the existing TypeTab ↔ Snap switch behavior.

---

## 8. Testing strategy

### Unit (Vitest)

- `AddFoodTab.test.tsx` — 5 cases:
  1. Mounts in 'library' view by default.
  2. `+` button click sets view to 'parse'.
  3. Empty-state CTA click sets view to 'parse' AND seeds typeDraft with search term.
  4. Back arrow in parse view returns to 'library' AND preserves search term.
  5. Re-mount (simulated modal close + reopen) returns to 'library' view, NOT 'parse'.

- `LibraryLoadingSkeleton.test.tsx` — 4 cases:
  1. Renders `rowCount` rows (default 8).
  2. `aria-busy="true"` and accessible label present.
  3. Width variation applied per row (style attribute check).
  4. Respects `prefers-reduced-motion` (CSS class flag or omitted animation).

- `LibraryEmptyState.test.tsx` — 3 cases:
  1. CTA absent when items present.
  2. CTA visible when search returns no matches.
  3. CTA click invokes `onAddNew` with the current search term.

- `useLogFlowStore.test.ts` — 2 new cases (added to existing file):
  1. `openModal()` with no args defaults `activeTab` to `'add-food'`.
  2. `openModal('add-food', { mode: 'library-only' })` still triggers library-only mode (Type-draft reset logic still fires).

### Integration

- `tests/integration/add-food-tab-flow.test.tsx` — full happy path: open modal → skeleton → items loaded → search 'banh xeo' → empty-state CTA → parse pre-filled → PARSE → ConfirmationScreen → commit → modal closes.
- `tests/integration/add-food-tab-back-nav.test.tsx` — back-navigation state preservation: open → search 'pho' → `+` → parse view → back → search term still 'pho' → list filtered correctly.

### E2E (Playwright)

- NEW user story `US-ADDFOOD-1` (per testing-strategy.md format):
  - AC1: Dashboard FAB opens log-flow modal with Add Food tab active by default.
  - AC2: Library skeleton renders for at least one frame before items appear (race-safe assertion).
  - AC3: User can search, get a no-match empty state, tap "Add it as new item", and see the search term pre-filled in the parse textarea.
  - AC4: Back arrow from parse → library preserves search term.
  - AC5: Snap tab remains accessible and unchanged in behavior.

- MIGRATE: existing E2E specs that used `data-testid="tab-type"` or `data-testid="tab-library"` → `tab-add-food`. Grep audit during implementation. Spot-check:
  - `tests/e2e/user-stories/US-STAB-A1.spec.ts`
  - `tests/e2e/user-stories/US-STAB-A2.spec.ts`
  - `tests/e2e/user-stories/US-STAB-A3-bundled.spec.ts`
  - `tests/e2e/user-stories/US-STAB-A-bundled.spec.ts`
  - any others surfaced by grep

### Visual regression

- New baselines for:
  - `add-food-tab-skeleton.png` (skeleton state)
  - `add-food-tab-library-populated.png` (items loaded)
  - `add-food-tab-empty-state.png` (no-match)
  - `add-food-tab-parse-view.png` (after `+` click)
  - `add-food-tab-parse-prefilled.png` (after empty-state CTA click)
- Refresh existing baselines that show the 3-tab bar (will need to display the 2-tab bar instead).

### Test count rollup

- Unit: ~14 new cases across 4 test files (+ 2 amendments to existing useLogFlowStore test).
- Integration: 2 new files.
- E2E: 1 new user story (5 ACs) + migration in ~6+ existing files.
- Visual: 5 new + ~6–10 refreshed baselines.

---

## 9. Accessibility

- Tab bar already has `role="tablist"` from Radix Tabs — unchanged.
- AddFoodTab subview switching: announce view changes via `aria-live="polite"` region (e.g., "Showing library" / "Showing AI parse form"). Subtle but matters for screen-reader users.
- Skeleton: `aria-busy="true"` and `aria-label="Loading library"` on the `<ul>`.
- `+` icon button: visible `aria-label="Add new food item"`.
- Empty-state CTA: full text label (no icon-only); reads as a button.
- Back arrow in AiParseForm: visible label "Back to library" (not just chevron); minimum 44×44 touch target.

---

## 10. Out-of-scope explicit no-touch list

Restated for self-reference during implementation:

- Snap tab UI, capture flow, and vision API calls.
- Library-only mode UI (the `mode === 'library-only'` render branch).
- AI text-parse and AI vision algorithms.
- ConfirmationScreen layout, save-to-library toggle, per-row toggle, micros editing.
- Library item editing inside `/library/[id]`.
- Library merge dialog.
- Edit-entry path via `MealEntryContextTrigger.tsx` lines 182–198.
- Schema, RLS policies, migrations.
- R1 firewall — no auth-file edits.
- DT-2 firewall.

---

## 11. Open questions for user review

These are explicit assumptions I'm making and want to flag for the user to override before plan-writing:

1. **Default tab on dashboard FAB open** — assumed `'add-food'`, not a sticky last-used preference. If user wants last-used persistence, that's a separate small feature.
2. **Empty-state CTA seeds typeDraft with search term** — small UX win. Override = CTA opens parse with empty textarea regardless.
3. **Scroll position resets to top on back-from-parse** — accepting this trade-off vs. lifting scroll state. Override = lift scroll position via `scrollRestoreRef` pattern (~30 min extra).
4. **`addFoodView` is local React state, not Zustand** — reopening the modal always lands on library. Override = put it in store so user resumes wherever they were.
5. **Visual treatment of `+` icon button** — assumed ghost icon button beside search. Override = inline pill, primary button, or floating action button (FAB).
6. **i18n key migration** — assumed `tabs.type` and `tabs.library` are deleted, not just left orphaned. Safe because i18n type-checking will flag any orphan reference.

---

## 12. Acceptance criteria for this design (gate to plan-writing)

- [ ] User confirms the 11 sections above are internally consistent.
- [ ] User confirms the assumptions in §11 (or overrides any).
- [ ] User confirms the out-of-scope list in §10 is correct.
- [ ] User confirms the estimate (3–5h) feels reasonable for their priority.

When all four boxes are checked, brainstorming transitions to `superpowers:writing-plans` (NOT `frontend-design`, NOT `superpowers-exec-tomi`, NOT any other implementation skill — per skill-routing the next step is writing-plans only).
