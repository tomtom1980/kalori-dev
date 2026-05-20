# Wave 4 — List / Sort / Separator / Pagination

**Batch:** `2026-05-16-library-overhaul`
**Scope:** Bugs 7 (default sort), 11 (separator strength), 12 (pagination verify).
**Result:** ALL THREE GREEN. 255 library + integration + unit tests pass (40 files). Typecheck clean. ≤6 production lines changed across the wave (1 production line per Bug 7, 4 per Bug 11, 0 per Bug 12).

---

## Bug 7 — Default sort Name A-Z (`/library` only)

### Files touched
- `app/(app)/library/_components/LibraryClient.tsx` — flipped `usePersistedSelection` fallback at line 193 from `'most-logged'` to `'name-asc'`. Added inline comment explaining the persistence semantics.
- `tests/integration/library-page.test.tsx` — rewrote the `sort change reorders visible cards` test (lines 196–214): RED step asserts `library-card-a` (Apple) is first on initial render with no sort interaction (was failing under old `most-logged` default). GREEN step preserves the "sort change reorders" coverage by switching to `most-logged` via the dropdown and asserting Banh Mi (id=b) first.

### RED → GREEN
- RED: re-run after test rewrite, before constant flip — `expected library-card-a, received library-card-b` (the correct reason — default still `most-logged`).
- GREEN: after constant flip — full `library-page.test.tsx` suite (11 tests) green.

### Out-of-scope decision (briefing F: yes — also apply to log modal)
**Stop-the-world trigger fired and surfaced.** The log modal's LibraryTab (`app/(app)/log/_components/LibraryTab.tsx`) does NOT use `sessionStorage`-fallback. It uses a separate `useLogFlowStore` zustand slice with sort options `'frequent' | 'recent' | 'highest-protein'` — `'name-asc'` is not a member of the union. The store-level default lives at `lib/stores/useLogFlowStore.ts:366` (`librarySort: 'frequent'`).
- Per the briefing's stop-the-world rule for exactly this case, I proceeded with `/library` only and surfaced this for follow-up. Adding `'name-asc'` to LibraryTab would require: (1) extending the `LibrarySort` union in `useLogFlowStore.ts`, (2) implementing the sort comparator in LibraryTab's local `[...filtered].sort` block, (3) adding the i18n string + SORT_OPTIONS entry, (4) updating `tests/components/log-flow/LibraryTab.test.tsx:55` ('default sort is `frequent`'), and (5) reconciling the persistence model (store-resident vs sessionStorage). That's not 1 file or "≤6 lines" of scope — it's a separate Bug 7b conversation if the user wants the log modal aligned.

### Defensive sweep (clean)
- `tests/unit/library/filter-sort.test.ts` — applies `applySort(ITEMS, '<sort>')` with explicit sort args; no default assumption. **Untouched.**
- `tests/components/library/SortDropdown.test.tsx` — passes `value="most-logged"` as a prop fixture (the dropdown's display-of-passed-value contract). **Untouched.**
- `tests/e2e/library/library-search-filter-sort.spec.ts` — explicitly clicks `library-sort-option-name-asc` then asserts `sessionStorage.getItem('library:sort') === 'name-asc'`. No initial-render default assumption. **Untouched.**
- `tests/components/log-flow/LibraryTab.test.tsx:55` — `'default sort is frequent'` — that's the log modal store's default. **Out of scope per the surfaced finding.**

---

## Bug 11 — Separator hairline strength

### Files touched
- `app/globals.css` — 4 line swaps (lines 2831–2832 grid frame + lines 2849–2850 cell borders). `var(--color-rule)` (#3f3731, 3:1 ambient divider) → `var(--color-rule-strong)` (#504742, 4:1 card-frame token). Added inline comments referencing Bug 11 + the token-pairing rationale. Width stays 1px; `gap: 0` + drawn-hairline cell pattern preserved.

### Tests added (insurance, not a behavior change)
- `tests/components/library/LibraryGrid.test.tsx` — new `grid separator hairlines (Bug 11)` describe with 2 CSS-rule-existence assertions against `app/globals.css` (same pattern Bug 10 uses on `LibraryCard.test.tsx`). Test 1 locks in `--color-rule-strong` on the grid frame (top + left). Test 2 locks in `--color-rule-strong` on every cell's right + bottom. A future refactor that swaps back to `--color-rule` will fail these tests immediately.

### TDD waived per proposal
- Pure CSS token swap. Visual regression on `/library` baselines is the right gate — flagged for Phase 7 visual sweep (baselines will need regen).

### No interaction with Wave 3
- The `.kalori-library-card-thumb img` idle `opacity: 0.85` from Bug 10 lives on the CARD, not the cell separator. Both rules coexist.

---

## Bug 12 — Pagination preserved (verification only)

### Files touched
- **NONE.** Verification item.

### Verification gates (all GREEN)
- `LIBRARY_PAGE_SIZE = 10` still at `LibraryClient.tsx:66` (was line 65 in proposal — shifted +1 by earlier Wave edits; constant + value intact).
- `tests/components/library/LibraryClient.pagination.test.tsx` — 2 specs pass cleanly post-Wave-3. Wave 3 had already widened the selector (`button[data-testid^=...]` → `[data-testid^=...]`) when LibraryCard refactored from `<button>` to `<div role="button">`, so this test was already self-healing.
- Slice math (lines 228–231 per proposal) untouched.
- `library-pagination` nav (lines 525–574 per proposal) untouched.

### Confidence
Bug 12 GREEN means none of Waves 1–3 broke pagination, AND nothing in Wave 4 touches `LibraryClient.tsx` pagination code (only the sort fallback literal).

---

## Cluster regression sweep

- **Library component tests:** 153 specs across all `tests/components/library/**` files — GREEN.
- **Library + integration + unit combined:** 255 / 255 pass across 40 files (`tests/components/library`, `tests/integration/library-page.test.tsx`, `tests/unit/library`).
- **Typecheck:** `npx tsc --noEmit` clean (no errors).
- **Lint:** not re-run this wave (no new warning surface introduced — only constant flips + CSS token swaps + insurance tests).

---

## Hand-off to Wave 5 (likely none from this wave)

- The Wave 4 surfaces (sort default, separator color, pagination) are independent of Wave 5's scope (Bug 5 sketch worker + Bug 6 `/api/library/create` route + AddLibraryItemDialog).
- Wave 5 should NOT touch `LIBRARY_PAGE_SIZE`, the sort fallback literal, or `--color-rule` / `--color-rule-strong` in the library grid section. If a Wave 5 dialog needs a custom hairline, scope a new selector — don't re-tune the grid tokens.
- The Bug 11 lock-in test in `LibraryGrid.test.tsx` will catch any accidental Bug 11 regression introduced during Wave 5 implementation.

---

## Stop-the-world flags raised this wave

1. **Bug 7 F-decision needs revisit** — the log modal's LibraryTab does NOT share `sessionStorage` fallback semantics with `/library`. Proceeded with `/library` only per the briefing's explicit instruction; full mechanics + scope estimate documented above. User to decide if they want to expand `LibrarySort` union + add `name-asc` to the log-flow store as a separate Bug 7b.

No other halts. No deviations from proposal beyond the F-decision finding above.
