# Item 4 — F-LIBOVR-BUG7B-LOGMODAL-SORT — log-modal LibraryTab default sort A-Z

**Classification:** `known_fix` (single-feature scope, ~30-50 production LOC + 3 tests + 1 i18n line)
**Files affected:** 2 prod + 1 i18n + 1 test (4 files)
**UI Touching:** YES — visible sort selector option + default visual order change
**TDD:** Required (RED-GREEN, 3 new tests + 2 existing test updates)
**Risk:** LOW-MEDIUM — sort state lives in Zustand persist (sessionStorage) with no `version` field, so a stale persisted `librarySort` from a 30-min-fresh prior session can land on a value not in the new union; needs an `onRehydrateStorage` defensive coercion (or a `version` bump + `migrate` fn). Existing rehydrate already has TTL purging at 30 min.

---

## Root cause (one-liner)

Bug 7 only flipped the `/library` page's `usePersistedSelection` fallback at `app/(app)/library/_components/LibraryClient.tsx:193`. The log-modal LibraryTab uses an entirely separate sort surface — `useLogFlowStore.librarySort: LibrarySort` (union `'frequent' | 'recent' | 'highest-protein'`) with initial value `'frequent'` at `lib/stores/useLogFlowStore.ts:366`. `'name-asc'` is not even a member of that union, so the original Bug 7 single-line flip was not applicable to this surface.

## Verified state (the three open-question checks)

1. **Zustand `persist` version field** — `grep version` returns zero matches in `lib/stores/useLogFlowStore.ts`. Default version is `0`. No `migrate` callback configured. **Implication:** any persisted state with a stale value would round-trip into the new state shape verbatim. The existing `onRehydrateStorage` (lines 620-639) only enforces TTL (`30 * 60 * 1000` ms) and ephemeral resets — it does NOT validate that `librarySort` is a member of the current union. A user with a 29-minute-fresh persisted `'frequent'` will load that value after the union change. **Two options:** (a) bump `version: 1` + `migrate: (state) => ({...state, librarySort: 'name-asc'})` to forcibly migrate; (b) add a defensive guard in `onRehydrateStorage` that coerces unknown `librarySort` values to `'name-asc'`. Option (b) is cheaper and aligns with how the rest of `onRehydrateStorage` already handles invariants. Recommended: **(b)**.

2. **LibraryTab sort pill UI fit (4 pills)** — Current pill labels: `FREQUENT` (~80px), `RECENT` (~65px), `HIGH-PROTEIN` (~110px). Adding `NAME A-Z` (~75px) brings totals to ~330px of label width + `margin-right: var(--spacing-2)` (= 8px) × 3 gaps + `padding: 6px var(--spacing-4)` (= 16px L+R) × 4 → ~440-460px. Modal inner width on mobile (375px viewport, padding 16px each side) = ~343px. **4 pills WILL wrap on mobile** — but the radiogroup container has no `display:flex` / `flex-wrap` rule applied (button default `inline-block` will wrap naturally; verified at `app/globals.css:1325-1353` — no parent container style). Wrapping is graceful, not broken. **Verdict:** keep the 4th pill inline — no overflow dropdown needed. Matches the pill-radiogroup A11y pattern (compliance §C3, already implemented). Adding a dropdown overflow would introduce a Radix dependency and break the current roving-tabindex contract.

3. **E2E sort selector pattern (`library-sort-option-name-asc`)** — This testid is the `/library` page's **dropdown** pattern (`app/(app)/library/_components/SortDropdown.tsx:67`). The log-modal uses a different pattern: `data-testid={`library-sort-${key}`}` (e.g., `library-sort-frequent`, `library-sort-recent`, `library-sort-highest-protein`) per `LibraryTab.tsx:381`. **The new testid will be `library-sort-name-asc`** (mirrors the existing pill testid pattern, NOT the `/library` dropdown `library-sort-option-*` pattern). No E2E spec currently asserts `library-sort-name-asc` for the log modal — that's net-new test surface (the lone E2E touching the log-modal LibraryTab is `library-tab-self-hydrate.test.tsx` which doesn't exercise sort UI).

## Decision: which option to ship — (a) widen union OR (b) document divergence

Per the followup, both options were on the table. **Recommend Option (a) — widen union + flip default.** Rationale:

- The user already approved Bug 7's intent across the project (Wave 4 stop-the-world surfaced this as a follow-up specifically to align surfaces).
- Documented divergence (Option b) creates two competing default behaviors in the same product, which compounds discoverability cost.
- The 4-pill geometry wraps cleanly; no design-system stress.
- Scope is contained: ~50 LOC, no DB / API / auth touch.

If the user prefers Option (b), the proposal collapses to a one-paragraph append in `Planning/CHANGELOG.md` + closing this followup with `intentional-divergence` rationale. That's a 5-minute task and doesn't need this proposal's TDD scaffold.

## Proposed change — diff outline (Option a)

### File 1 — `lib/stores/useLogFlowStore.ts`

```diff
-export type LibrarySort = 'frequent' | 'recent' | 'highest-protein';
+export type LibrarySort = 'name-asc' | 'frequent' | 'recent' | 'highest-protein';
+
+const LIBRARY_SORT_VALUES: readonly LibrarySort[] = [
+  'name-asc',
+  'frequent',
+  'recent',
+  'highest-protein',
+] as const;
+
+function isLibrarySort(v: unknown): v is LibrarySort {
+  return typeof v === 'string' && (LIBRARY_SORT_VALUES as readonly string[]).includes(v);
+}
```

```diff
-  librarySort: 'frequent',
+  librarySort: 'name-asc',
```

```diff
   onRehydrateStorage: () => (state) => {
     if (!state) return;
+    // Bug 7b — coerce stale persisted librarySort values that aren't members
+    // of the current union to the new default. Sessions on the device from
+    // before the union widening would otherwise keep their stale string;
+    // this guard rewrites unknown values without a full migrate callback.
+    if (!isLibrarySort(state.librarySort)) {
+      state.librarySort = 'name-asc';
+    }
     const age = Date.now() - (state.restoredAt || 0);
```

### File 2 — `app/(app)/log/_components/LibraryTab.tsx`

```diff
 const SORT_OPTIONS = [
+  { key: 'name-asc' as const, label: t.log.librarySortNameAsc },
   { key: 'frequent' as const, label: t.log.librarySortFrequent },
   { key: 'recent' as const, label: t.log.librarySortRecent },
   { key: 'highest-protein' as const, label: t.log.librarySortHighProtein },
 ];
```

```diff
   const sorted = [...filtered].sort((a, b) => {
+    if (sort === 'name-asc') return a.name.localeCompare(b.name);
     if (sort === 'frequent') return b.logCount - a.logCount;
     if (sort === 'recent') {
       const aT = a.lastUsedIso ? Date.parse(a.lastUsedIso) : 0;
       const bT = b.lastUsedIso ? Date.parse(b.lastUsedIso) : 0;
       return bT - aT;
     }
     return b.proteinG - a.proteinG;
   });
```

**Sort comparator reuse note:** `/library`'s `applySort` at `lib/library/filter-sort.ts:72-73` uses `a.display_name.localeCompare(b.display_name)`. The log-modal's `LibraryItem.name` field maps 1:1 to `display_name`. We use the same `localeCompare` semantics inline (matching the existing inline-sort pattern in LibraryTab) rather than importing `applySort` because:
- `applySort` is typed against `LibraryItem` from `lib/library/fetch.ts` (different shape — `display_name`, `nutrition.kcal`, etc.) — not the log-modal's `LogLibraryItem` (`name`, `kcal` flat).
- Wiring an adapter would cost more LOC than inlining 1 line.
- The 1-line `localeCompare` IS the semantic equivalent of `applySort('name-asc')`.

### File 3 — `lib/i18n/en.ts`

```diff
     librarySortLabel: 'Sort library',
+    librarySortNameAsc: 'NAME A-Z',
     librarySortFrequent: 'FREQUENT',
     librarySortRecent: 'RECENT',
     librarySortHighProtein: 'HIGH-PROTEIN',
```

(Matches existing UPPERCASE + letter-spacing style for pill labels. `/library`'s dropdown uses `'Name A-Z'` mixed-case at `en.ts:577` — divergent because the dropdown's `kalori-library-dropdown-item` uses sentence case; the pill's `text-transform: uppercase` would visually conform either way, but explicit uppercase here mirrors the sibling pill labels.)

### File 4 — `tests/components/log-flow/LibraryTab.test.tsx`

**Existing tests to UPDATE:**

- Line 46-53 (`renders the 3-way sort radiogroup`) → rename to `4-way` + assert `library-sort-name-asc` exists.
- Line 55-58 (`default sort is 'frequent'`) → flip to `default sort is 'name-asc'` (RED before code change; GREEN after).
- Line 139-148 (`sort radiogroup uses roving tabindex`) → first tabbable becomes `library-sort-name-asc`; others get `-1`.
- Line 150-163 (`ArrowRight on sort radiogroup moves selection forward`) → starting from `name-asc`, ArrowRight → `frequent`; Home → `name-asc`; End → `highest-protein`.

**Net-new tests to ADD:**

1. `'clicking NAME A-Z sets aria-checked + updates store'` — mirror line 60-65 pattern but click `library-sort-name-asc` and assert `librarySort === 'name-asc'`.
2. `'name-asc sort orders items alphabetically by name'` — render with `items=[{name:'Pho Bo',…},{name:'Apple',…},{name:'Banh Mi',…}]`, assert DOM order: Apple → Banh Mi → Pho Bo (via `screen.getAllByTestId(/^library-card-/)`).
3. `'rehydrate coerces stale librarySort to name-asc'` — seed sessionStorage with `{state:{librarySort:'kcal-asc',restoredAt:Date.now()},version:0}` under `STORAGE_KEY`, force-rehydrate, assert `useLogFlowStore.getState().librarySort === 'name-asc'`. (Migration guard test.)

## TDD approach (RED → GREEN sequence)

1. **RED step 1** (rewrite line-55 default-sort test → `name-asc`): test fails because store default is still `'frequent'`. Reason matches.
2. **RED step 2** (add new test #2 — alphabetical ordering): fails because `'name-asc'` is not in the union → TS error OR runtime fall-through to `proteinG` comparator. Reason matches.
3. **RED step 3** (add new test #3 — rehydrate coercion): fails because `onRehydrateStorage` has no validator and the union is widened. Reason matches.
4. **GREEN**: apply the 3 production diffs. Re-run `tests/components/log-flow/LibraryTab.test.tsx` (12 specs after update) → all GREEN. Update existing 4 tests in same commit per the diff outline.

## Files affected (final)

| File | Change | LOC |
|---|---|---|
| `lib/stores/useLogFlowStore.ts` | Union widen + `isLibrarySort` guard + default flip + rehydrate coercion | ~15 |
| `app/(app)/log/_components/LibraryTab.tsx` | Add `SORT_OPTIONS` entry + 1-line comparator branch | ~3 |
| `lib/i18n/en.ts` | Add `librarySortNameAsc: 'NAME A-Z'` | 1 |
| `tests/components/log-flow/LibraryTab.test.tsx` | Update 4 existing tests + add 3 net-new | ~50 |

**Total: ~70 LOC across 4 files** (50 of which are tests).

## Risk assessment

**LOW for production code surface:**
- `lib/library/filter-sort.ts` is untouched (sort comparator inlined, not refactored).
- `LIBRARY_SORT_VALUES` is a new private const — no export, no public-API expansion.
- `onRehydrateStorage` coercion runs once at hydrate, idempotent.
- 4-pill geometry wraps cleanly on mobile (no flex-wrap container = natural inline-block wrap).

**MEDIUM for persisted-state surface:**
- A user with an active 30-min-fresh sessionStorage entry holding `librarySort: 'frequent'` will be migrated to `'name-asc'` on next page load (their explicit RECENT/HIGH-PROTEIN choice loses). This is the trade-off of Option (b)-style coercion vs. a more sophisticated migrate that preserves valid-and-still-valid values. **Mitigation:** the `isLibrarySort` guard ONLY coerces unknown values; valid values (frequent, recent, highest-protein) ARE preserved. So in practice only users whose last persisted value was a typo / future-migration value get coerced. Net: zero behavioral regression for the documented use case.

**Cross-wave invariants (per parent-batch lesson at lessons-relevant.md line 11):**
- `focus-ring-token.test.ts` — sort pill uses no new focus-ring token (existing `.kalori-log-sort-pill` already has the project's focus-visible style applied at the `[aria-checked='true']` selector). Untouched.
- `nav-audit.test.ts` — no nav surface touched.
- `schema-drift/generated-types-fresh.test.ts` — no DB / generated-types touch.
- Lint: `LibraryTab.tsx` is a stable file; the 1-line addition won't introduce unused-var or react-hooks warnings.
- Typecheck: `LibrarySort` union widening is a superset change, so any consumer narrowing on the union will still typecheck (no exhaustiveness regression — the only switch on `sort` value is the inline comparator we're modifying).

## Regression sweep (must run before sign-off)

1. `pnpm vitest run tests/components/log-flow/LibraryTab.test.tsx` (12 tests after update).
2. `pnpm vitest run tests/components/log-flow/library-tab-preselect.test.tsx tests/components/log-flow/library-tab-self-hydrate.test.tsx` (sibling LibraryTab tests — should be unaffected; sort state isn't in their scope).
3. `pnpm vitest run tests/components/log-flow/` (whole log-flow component dir — 12 files).
4. `pnpm vitest run tests/unit/library/filter-sort.test.ts` (defensive — `/library` `applySort` should be untouched; this confirms we didn't accidentally cross-wire).
5. `npx tsc --noEmit` — typecheck clean.
6. `pnpm lint` (project-wide, mandatory per Wave 4 lesson) — must show zero new warnings.
7. Project-wide invariant tests per parent-batch lesson:
   - `pnpm vitest run tests/components/focus-ring-token.test.ts` (if it exists at that path; otherwise the project's focus-ring invariant equivalent).
   - `pnpm vitest run tests/integration/nav-audit.test.ts`
   - `pnpm vitest run tests/integration/schema-drift/generated-types-fresh.test.ts`

## UI Touching — design references

**No specific `Planning/ui-design.md` line** prescribes the log-modal LibraryTab sort pill set (the closest reference is line 626 noting "Log library tab" as one of 9 Suspense boundaries — no design-token / option-set line). The pill-row design pattern (32h hairline, oxblood 2px active rule, 18em letter-spacing) is established at `app/globals.css:1325-1353` and the i18n keys at `lib/i18n/en.ts:416-419`. Adding a 4th option follows the established pattern verbatim. No new design tokens required.

**Visual regression baseline:** The 4-pill row WILL change visual baseline on `/log` route's library tab. If a Phase 7-equivalent visual sweep is in scope, regen `tests/screenshots/**/log-library*` baselines (verified: none currently exist for this surface — log-modal screenshots focus on `library-list` cards, not the sort pill row).

## Open questions for the user

1. **Confirm Option (a) widen-union** (recommended) vs. **Option (b) document divergence** (cheaper but leaves the surfaces inconsistent). The proposal assumes (a); switching to (b) collapses this to a 5-min changelog append.

2. **Persisted-state migration policy** — proposal recommends coercing only INVALID (non-union) values to `'name-asc'`. An alternative is a `version: 1` bump + `migrate` callback that forcibly resets EVERY user's `librarySort` to `'name-asc'` on first hydrate after the change (i.e., even users with valid `'frequent'` get reset to `'name-asc'` once). The recommended option is more user-friendly; the alternative is more aligned with "every user sees the new default at least once." Recommend sticking with proposal (coerce-only-invalid).

3. **i18n label casing** — proposal uses `'NAME A-Z'` (UPPERCASE matching sibling pills like `'FREQUENT'`). `/library`'s dropdown uses `'Name A-Z'` (sentence case). Either is consistent within its own surface. Confirm UPPERCASE for pill consistency.

4. **Position in pill order** — proposal puts `NAME A-Z` first (matches new default at position 0). Alternative: append at the end (preserves existing 3-pill muscle memory, but the leftmost pill being aria-checked-on-mount is conventional for radiogroups). Recommend first position.

## Stop-the-world triggers checklist (from briefing)

- [x] **Zustand persist middleware is configured** — YES (lines 401-642). Migration strategy is covered by the `onRehydrateStorage` coercion path (no full `version` bump required). **Surfaced** but not a halt; resolved in proposal.
- [x] **Sort comparator can't be reused from `/library`** — Confirmed (different data shape: `display_name` vs `name`, `nutrition.kcal` vs `kcal`). Inlining `a.name.localeCompare(b.name)` is equivalent and 1 LOC. **Surfaced** but doesn't scope-creep; no halt.
- [x] **LibraryTab uses a different list rendering path than expected** — Confirmed: pill radiogroup (not dropdown). Plan accommodates by adding a 4th pill, not introducing a dropdown. **Surfaced** but no halt.

No halts triggered.
