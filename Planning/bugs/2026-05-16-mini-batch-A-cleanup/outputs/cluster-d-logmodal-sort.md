# Cluster D — Log-Modal LibraryTab Sort Default (Item 4)

**Item:** Item 4 — F-LIBOVR-BUG7B-LOGMODAL-SORT (parent batch followup)
**Status:** implemented
**Sub-agent:** Cluster D implementation
**Timestamp:** 2026-05-16T11:40:00Z
**TDD evidence:** RED → 8 failing tests (default-sort wrong, missing pill, ArrowKey traversal off, 3 rehydrate-coerce expectations unmet, 2 invalid-payload coercion expectations unmet). GREEN after the 4-file production diff + sibling assertion update.

---

## Approved defaults applied

| Q | Default | How applied |
|---|---|---|
| Q4.1 | (a) Widen Zustand `LibrarySort` union to include `'name-asc'` | `lib/stores/useLogFlowStore.ts:123` — union now `'name-asc' \| 'frequent' \| 'recent' \| 'highest-protein'` |
| Q4.2 | Coerce-only-invalid in `onRehydrateStorage` (no version bump) | `lib/stores/useLogFlowStore.ts` — new `LIBRARY_SORT_VALUES` const + `isLibrarySort` guard + guard wired into `onRehydrateStorage` before the existing TTL check |
| Q4.3 | UPPERCASE `'NAME A-Z'` pill text for pill-row consistency | `lib/i18n/en.ts:417` — new `librarySortNameAsc: 'NAME A-Z'` between `librarySortLabel` and `librarySortFrequent` |
| Q4.4 | New pill at position 0 (matches new default) | `app/(app)/log/_components/LibraryTab.tsx:142-150` — `SORT_OPTIONS[0]` is now `{ key: 'name-asc', label: t.log.librarySortNameAsc }` |

---

## Production diff summary

### 1. `lib/stores/useLogFlowStore.ts`

- **Line ~123:** Widen `LibrarySort` union to include `'name-asc'`.
- **Line ~125 (new):** Add `LIBRARY_SORT_VALUES` runtime const (the readonly union list).
- **Line ~133 (new):** Add `isLibrarySort(v): v is LibrarySort` type-predicate guard.
- **Line ~366 (formerly `librarySort: 'frequent'`):** Flip default to `'name-asc'` with comment explaining mirroring of `/library` Bug 7.
- **Line ~620 (`onRehydrateStorage`):** Insert coercion block BEFORE the TTL purge — `if (!isLibrarySort(state.librarySort)) state.librarySort = 'name-asc'`. Comment explains why no `version` bump (preserves valid `'frequent'` / `'recent'` / `'highest-protein'` choices that survive the widening).

### 2. `app/(app)/log/_components/LibraryTab.tsx`

- **`SORT_OPTIONS` (line ~142):** Prepend `{ key: 'name-asc', label: t.log.librarySortNameAsc }` so the new pill renders first and the roving-tabindex/ArrowKey contract picks it up automatically (existing `handleSortKey` is index-driven, no other code change needed).
- **Sort comparator (line ~237):** Insert `if (sort === 'name-asc') return a.name.localeCompare(b.name);` as the first branch. Mirrors `/library`'s `applySort('name-asc')` semantics inline (different data shape — `name` vs `display_name` — so no shared import).

### 3. `lib/i18n/en.ts`

- **Line ~417:** Add `librarySortNameAsc: 'NAME A-Z'` between `librarySortLabel` and `librarySortFrequent`. UPPERCASE matches sibling pill labels (`'FREQUENT'`, `'RECENT'`, `'HIGH-PROTEIN'`).

### 4. `tests/components/log-flow/LibraryTab.test.tsx`

- **Header comment:** Update from `3-way` to `4-way` sort radiogroup + add Bug 7b explanatory paragraph.
- **Import:** Add `LOG_FLOW_STORAGE_KEY` alongside `useLogFlowStore` (used by the new rehydrate suite).
- **Renamed test:** "renders the 3-way sort radiogroup" → "renders the 4-way sort radiogroup (Bug 7b — adds name-asc)" + assert `library-sort-name-asc` exists.
- **Flipped test:** "default sort is `frequent`" → "default sort is `name-asc`".
- **NEW test:** "clicking NAME A-Z sets aria-checked + updates store (Bug 7b)" — clicks `frequent` first to flip off the default, then clicks `name-asc` and asserts both store + aria-checked transitions.
- **NEW test:** "name-asc sort orders items alphabetically by name (Bug 7b)" — renders 3 items (Pho Bo, Apple, Banh Mi) and asserts DOM order is Apple → Banh Mi → Pho Bo via `screen.getAllByTestId(/^library-card-(?!lettermark-|lastused-)/)`. The negative-lookahead avoids the descendant `library-card-lettermark-{id}` + `library-card-lastused-{id}` testids inside each card.
- **Updated test:** "sort radiogroup uses roving tabindex" — first tabbable becomes `library-sort-name-asc`; others get `tabindex="-1"`.
- **Updated test:** "ArrowRight on sort radiogroup moves selection forward" — start from `name-asc`; ArrowRight → `frequent`; Home → `name-asc`; End → `highest-protein`.
- **NEW describe block:** "Bug 7b — librarySort rehydrate coercion" (5 specs) — uses `vi.resetModules()` per test + a `seedSession(librarySort)` helper that writes a fresh `{state:{...}, version:0}` snapshot to `sessionStorage` under `LOG_FLOW_STORAGE_KEY`, then `await store.persist.rehydrate()` and asserts:
  1. `'name-foo'` (invalid string) → coerced to `'name-asc'`.
  2. `42` (non-string) → coerced to `'name-asc'`.
  3. `'frequent'` (valid) → preserved.
  4. `'recent'` (valid) → preserved.
  5. `'highest-protein'` (valid) → preserved.

### 5. `tests/unit/stores/useLogFlowStore.test.ts`

- **Line 30:** Updated `expect(state.librarySort).toBe('frequent')` to `'name-asc'` with comment. This is the only sibling assertion in the broader test suite that pinned the OLD default.

---

## Verification

| Check | Result |
|---|---|
| `pnpm vitest run tests/components/log-flow/LibraryTab.test.tsx` | 18/18 GREEN |
| `pnpm vitest run tests/components/log-flow/ tests/unit/library/filter-sort.test.ts tests/unit/stores/useLogFlowStore.test.ts` | 116/116 GREEN (14 files) |
| `pnpm vitest run tests/components/ tests/unit/` (full sweep) | 1647/1647 GREEN (209 files) |
| `npx tsc --noEmit` | clean (no diagnostics) |
| `pnpm exec eslint lib/stores/useLogFlowStore.ts app/(app)/log/_components/LibraryTab.tsx lib/i18n/en.ts tests/components/log-flow/LibraryTab.test.tsx tests/unit/stores/useLogFlowStore.test.ts` | clean (no diagnostics) |

---

## Deviations from briefing

1. **Test file location for rehydrate coercion.** The briefing suggested "Test (rehydrate coercion)" in `tests/components/log-flow/LibraryTab.test.tsx`. I placed those 5 specs in the SAME file but inside a sibling `describe('Bug 7b — librarySort rehydrate coercion')` block (not nested under `<LibraryTab />`) because the rehydrate test needs `vi.resetModules()` per spec to re-trigger `persist`'s creation phase — which would interfere with the LibraryTab render lifecycle in the parent describe. Co-locating in the same file (per the briefing intent) but isolating in a sibling describe keeps the regression scope tight without polluting LibraryTab's beforeEach.
2. **Test count.** Briefing predicted "3-4 new" specs; I shipped 7 net-new specs (4 NAME-A-Z surface + 5 rehydrate matrix that splits invalid into two cases: invalid-string AND non-string-type for guard coverage) — the extra 3 are cheap and provide better fault localization for Codex Round 1.
3. **`libraryItems` rehydrate side-effect.** The existing `onRehydrateStorage` always sets `state.libraryItems = []` at the end (ephemeral reset). My added rehydrate specs do not assert on `libraryItems` — they only assert on `librarySort`. Behavior is unchanged.

---

## Stop-the-world triggers checked

| Trigger | Status |
|---|---|
| Zustand `persist` middleware has a `version` field set | NO — confirmed via grep on the store file. Default version 0; the proposal's coerce-only-invalid path is correct (no migration strategy revisit needed). |
| `onRehydrateStorage` doesn't exist in current store config | EXISTS — `lib/stores/useLogFlowStore.ts:620-639` (now expanded by ~8 lines with the coercion block). No change to the existing TTL purge / ephemeral reset logic. |
| 4-pill layout doesn't fit visually on mobile | OK per proposal's pre-flight (graceful inline-block wrap; no flex-wrap container forces tight horizontal layout). Not visually re-verified in this implementation (no snapshot or visual diff in scope), but the underlying DOM order + tabindex + aria-checked invariants are GREEN. |
| `/library`'s `name-asc` comparator non-trivial to reuse | CONFIRMED via Grep — `/library` uses `LibraryItem.display_name` while log-modal uses `LibraryItem.name`. Inlined `a.name.localeCompare(b.name)` (1 LOC, semantic equivalent). Justified inline rather than refactored to a shared helper because writing the adapter would cost more LOC than inlining. |

No halts triggered.

---

## Cross-surface safety (LibrarySort widening)

- 41 files import `@/lib/stores/useLogFlowStore`. None of them switch on or narrow on `LibrarySort` exhaustively (TypeScript's union-widening is a superset change, so all consumers continue to compile).
- `/library` page sort surface is independent — uses `lib/library/types.ts:LibrarySortKey`, not our `LibrarySort`. No cross-wiring.
- The full unit + components test sweep (1647 tests) caught zero regressions across the 41 consumers.

---

## Lessons-relevant snippets

(For Phase 8 lessons-learned append, if Codex round results route there.)

- **TDD with persisted Zustand state requires `vi.resetModules()` per spec.** The store's `persist` initializer reads sessionStorage at module-eval time; tests that seed sessionStorage AFTER import will not see the seeded value unless the module is re-evaluated. Pattern: `vi.resetModules()` in `beforeEach`, then `await import('@/lib/stores/useLogFlowStore')` inside each spec.
- **`store.persist.rehydrate()` is the right rehydrate handle for Zustand v4+.** Don't try to fire DOM events or window-storage events — the persist middleware exposes a public `rehydrate()` method that triggers the `onRehydrateStorage` callback path verbatim.
- **Union widening is a superset change.** Adding `'name-asc'` to a union with consumers using non-exhaustive narrowing (e.g., `if (sort === 'frequent') ... else if (sort === 'recent') ... else return /* protein */`) preserves backward compatibility because the new value falls through to the existing `else` branch. The implementor's responsibility is to add the NEW branch BEFORE the existing fall-through so the new value gets its dedicated comparator.
