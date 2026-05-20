# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-17-micros-display-consistency`
**Round:** 1
**Codex verdict:** needs-attention
**Auto-retry signals detected:** no
**Diff size:** ~55 KB (well under 500 KB budget)

---

## Critical (count: 1)

### C1. Dashboard still drops all RDA-unknown micronutrients
- **File:** `lib/dashboard/aggregate.ts:528-530`
- **Verbatim:** "The dashboard aggregate path explicitly calls the shared helper with `includeUnknownRda: false`, so any consumed micro without an RDA is removed from the dashboard output. That contradicts the clarified requirement to show all RDA-unknown nutrients and breaks the stated cross-surface consistency goal: library view keeps unknown-RDA rows, confirmation keeps them, dashboard excludes them. The code comment says this preserves historical behavior, but that is exactly the behavior the clarification appears to override."
- **Why Critical:** Direct user-stated-intent violation. User clarified that RDA-unknown nutrients (e.g., sugar) should be shown across all surfaces. The implementation sub-agent chose `includeUnknownRda: false` to "preserve historic behavior" — but the historic behavior is exactly what the user's clarification was overriding. Breaks the cross-surface consistency that is the entire premise of this batch.
- **Codex's recommendation:** Align dashboard with the clarified rule (flip to `includeUnknownRda: true`) OR document the dashboard-only exclusion and obtain explicit product approval. Add an aggregate test proving unknown-RDA rows behave consistently with intent.
- **Auto-fix scope:**
  - `lib/dashboard/aggregate.ts` — flip the option from `includeUnknownRda: false` to `includeUnknownRda: true` (also update the inline comment that justifies the exclusion).
  - Add/extend a dashboard aggregate unit test under `tests/unit/lib/dashboard/` (search the test tree for the existing aggregate suite first; co-locate the new case) asserting RDA-unknown rows survive aggregation and appear after RDA-having rows.

---

## Improvement (count: 1)

### I1. Confirmation micros reorder from live draft values during editing
- **File:** `app/(app)/log/_components/ConfirmationScreen.tsx:1674-1729`
- **Verbatim:** "`ConfirmationItemMicros` rebuilds rows from current `micros`, computes pct, sorts them, then renders inputs on every render. The `onChange` handlers update `micros`, so clearing or lowering a high-percent nutrient can immediately move that input elsewhere in the list while the user is typing. The new test only edits iron from 100% to about 67%, which does not force a reorder below sodium/vitamin C, so it misses the jumpy editable-list case."
- **Why Improvement:** Concrete UX regression risk with a clear repro (zero-out a top-ranked input → it jumps), and the new test does not cover this case. Not labelled Critical by Codex (`[medium]`) but it directly contradicts the implementation contract for Surface B noted in the briefing ("frozen-at-mount is the standard pattern; runtime-sort would break focus"). Worth treating as Improvement-tier auto-fix since the helper plus a mount-time freeze is a small, contained change.
- **Codex's recommendation:** Keep the editable input order stable for the lifetime of the expanded editor, OR add a regression test that edits a high-ranked nutrient down to 0 and proves focus/position behaviour remains acceptable.
- **Auto-fix scope:**
  - `app/(app)/log/_components/ConfirmationScreen.tsx` — compute the sorted micro key order once at mount of the expanded editor (e.g., `useMemo(() => sortAndFilterMicrosByRdaPct(...), [])` keyed on the initial draft, OR a `useRef` snapshot) and then render inputs in that frozen order even as live draft values change.
  - Extend `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` with a regression case that edits a top-ranked nutrient down to 0 and asserts the input's DOM order does not shift (focus and position remain stable).

---

## Minor (count: 0)

None reported by Codex in round 1.

---

## Cross-surface inconsistency check (Surface A RDA-unknown)

**Question:** Did Codex flag the dashboard RDA-unknown exclusion as a user-intent violation?

**Answer:** YES — explicitly, as Critical C1 above. Codex called out by name the conflict between the "preserve historic behavior" code comment and the user's clarification, and noted the cross-surface inconsistency (library + confirmation keep unknown-RDA rows; dashboard excludes them) as a direct violation of the batch's stated consistency principle.

---

## Concerns the briefing flagged but Codex did NOT raise

For audit trail:
- (2) Filter threshold semantics (< vs <=) — not raised. Helper presumably uses strict `<` per spec; no flag.
- (3) RDA-unknown stable sort (displayName.localeCompare) — not raised.
- (4) Sodium hardcoded always-visible carve-out removal — not raised (no contractual / a11y obligation found).
- (5) Confirmation runtime-sort focus loss — raised as I1 (this IS concern 5, just labelled by Codex as `[medium]`).
- (6) Helper generic type compatibility with Surface A row shape — not raised (presumed compatible).
- (7) DraftState / buildFieldsPatch handling of RDA-unknown editable inputs — not raised.
- (8) Rewritten "sodium always visible" tests asserting new design — not raised.
- (9) 4 pre-existing failing tests — not commented on (Codex stayed scoped to the diff under review, as instructed).
- (10) i18n strings — not raised (no new strings added in this batch).

---

## Recommendation

Counts: Critical 1, Improvement 1, Minor 0 → **NOT clean.**

Dispatch file-scoped auto-fix sub-agents for:
- `lib/dashboard/aggregate.ts` (+ new/extended dashboard aggregate test)
- `app/(app)/log/_components/ConfirmationScreen.tsx` (+ extended `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` regression)

Two-round cap reminder: this is round 1 of 2. Round 2 is the final adversarial pass after the auto-fix lands.
