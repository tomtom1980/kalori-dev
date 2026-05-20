# Codex R1 — ConfirmationScreen.tsx fix decision

## Findings addressed

- **C2** (lines 751-814): Library-only multi-row batch save is not retry-safe: sequential POSTs with regenerated `client_id`s per attempt mean row 0 success + row 1 failure persists row 0 while the modal errors out; retry can duplicate or self-collide on row 0. Pre-flight dedup-check only inspects `row[0]` so rows 1+ surface 409s only at POST time.

## A/B determination

**Branch B — PRE-EXISTING (not introduced by this batch).** False positive for THIS round.

## Evidence

### 1. Git history of `app/(app)/log/_components/ConfirmationScreen.tsx`

```
$ git log --oneline -- "app/(app)/log/_components/ConfirmationScreen.tsx" | head -5
45376f8 feat: bugfix batch library-micros — bug 1 ConfirmationScreen library-only micros collapsible   <-- THIS BATCH
783fcc1 fix: POST-MVP-CODEX-R2 C1+C2 — schema-valid UUIDs + server-409 banner wiring                   <-- PREVIOUS (introduced mintLibraryClientId-per-attempt + dedup banner)
60e85c5 feat: library — meal-slot picker on Log This Now + persist micros on add                       <-- BATCH BASELINE
6b793a6 fix: E.CODEX Round-2 C1+C2 — library-only multi-row persist + dedup banner
ab0cd16 feat: library — Add Item flow is library-only (no log entry side effect)
```

### 2. Pre-existing pattern at baseline `60e85c5` (lines 642-722 of the file at that SHA)

The sequential POST loop, per-row `client_id` generation (then via `${clientId}:${idx}` suffix scheme — schema-invalid but stable-on-retry), row[0]-only pre-flight dedup, and no row-level error tracking were ALL present at the baseline `60e85c5`:

```typescript
// At 60e85c5 line 673:
client_id: idx === 0 ? clientId : `${clientId}:${idx}`,

// At 60e85c5 line 689-712: same `for (const ... of rowsToPersist)` sequential loop.
```

### 3. `783fcc1` (PRE-batch) introduced `mintLibraryClientId()` regeneration per attempt

Between `60e85c5` and the start of THIS batch, commit `783fcc1` (the previous Codex-driven fix for POST-MVP-CODEX-R2-C1) traded `${clientId}:${idx}` for `mintLibraryClientId()` to satisfy the UUID schema:

```typescript
// 783fcc1 changes:
- client_id: idx === 0 ? clientId : `${clientId}:${idx}`,
+ client_id: mintLibraryClientId(),
```

That commit's message explicitly acknowledges the trade-off (schema-valid UUIDs > retry-stable suffix) and the retry-safety regression was filed as a Round-3 followup in the same session (see `planning/followups.md` POST-MVP-CODEX-R3-C1, filed ~03:00 GMT+7 on 2026-05-17).

### 4. THIS batch's diff against the commit immediately preceding it is purely additive

```
$ git diff 783fcc1..45376f8 --stat -- "app/(app)/log/_components/ConfirmationScreen.tsx"
 app/(app)/log/_components/ConfirmationScreen.tsx | 133 +++++++++++++++++++++++
 1 file changed, 133 insertions(+)
```

**133 insertions, 0 deletions.** Every line touched by this batch is in the additive set:
- Import `@radix-ui/react-collapsible`
- Import `DEFAULT_MICROS_LIST`
- New action `EDIT_ITEM_MICRO`
- New reducer case `EDIT_ITEM_MICRO`
- New callback `editMicro` on `ConfirmationActions`
- New context registration of `editMicro`
- New `<ConfirmationItemMicros>` mount inside `ConfirmationItemRow`
- New `ConfirmationItemMicros` component (default-closed Radix Collapsible)

**The save loop (lines 748-826 of the current file), the `mintLibraryClientId()` call (line 735), and the row[0]-only pre-flight dedup-check were NOT touched by this batch.**

### 5. Already tracked in `planning/followups.md`

The exact issue Codex Round-1 C2 surfaces is already filed as:

- **POST-MVP-CODEX-R3-C1** — "Library-only multi-row save retries lose idempotency" — High severity, deferred to "Next `bugfix-tomi` pass" per the 2-round Codex cap
- **POST-MVP-CODEX-R3-C2** — "Library-only dedup state needs row-scoping for non-primary-row recovery" — covers the row[0]-only pre-flight-dedup half of Codex Round-1 C2

Both filed earlier today (2026-05-17 ~03:00 GMT+7) by E.CODEX Round-3 against this batch's baseline `60e85c5`.

## Action taken

**No code change in this batch.** Per bugfix-tomi false-positive protocol:

1. Marked as Branch B / pre-existing.
2. Updated `planning/followups.md` POST-MVP-CODEX-R3-C1 entry with:
   - Note that Codex Round-1 in this batch re-surfaced the same issue with deeper symptom analysis (extends from line 698-700 to lines 751-814 + row[0]-only pre-flight dedup).
   - Explicit reference to the git-diff evidence (133 insertions, 0 deletions between `783fcc1..45376f8`).
   - Clarification that the retry-safety surface dates to commit `783fcc1`, NOT to this batch.
   - Stronger fix sketch covering both R3-C1 (per-row stable UUIDs) and R3-C2 (per-row dedup state) — recommendation: address as a single paired `bugfix-tomi` pass since they're same component / same store / same architectural change.
3. NO change to `ConfirmationScreen.tsx` (out of user-approved scope for batch `2026-05-17-library-micros`).

## Tests added/modified (if A)

N/A — Branch B, no code change.

## Commit SHA (if A)

N/A — Branch B, no code commit. The followups.md update will be committed alongside other Phase 8 documentation at the end of this batch.

## False positive determination

**`false_positive: true`** for THIS batch.

**Justification:** Issue is in code paths NOT changed by this batch. Pre-exists at `60e85c5` (baseline) in essentially the same form (sequential POST loop + row[0]-only dedup), and the fresh-UUID-per-attempt variant dates to commit `783fcc1` (one commit before this batch's bug-1 commit `45376f8`). Verified via `git diff 783fcc1..45376f8 --stat -- "app/(app)/log/_components/ConfirmationScreen.tsx"` which is 133 insertions and 0 deletions, all in `EDIT_ITEM_MICRO` / `ConfirmationItemMicros` (additive only — no edits to the save loop, the `mintLibraryClientId()` call, or the pre-flight dedup-check).

Already tracked at high priority as `POST-MVP-CODEX-R3-C1` (and paired `POST-MVP-CODEX-R3-C2` for the row-scoped dedup half). Recommend the user file a dedicated `bugfix-tomi` pass addressing both R3 entries together.

## Notes for main agent

- Surface this determination at Phase 8 with the recommendation: "Codex Round-1 C2 re-surfaced an already-tracked High-severity architectural issue (POST-MVP-CODEX-R3-C1 + R3-C2). Out of scope for this batch. File a dedicated bugfix-tomi pass to address both R3 entries as paired structural fixes — same component, same store, same architectural change."
- Do not include C2 in the "Bugs fixed" list of this batch's final PR description; do include it in the "Codex Round-1 findings → false positives surfaced and re-tracked" section.
