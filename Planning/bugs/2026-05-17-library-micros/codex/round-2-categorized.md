# Codex Round 2 — Categorized Findings

**Batch:** bugfix-tomi `2026-05-17-library-micros`
**Base SHA:** `60e85c5`
**Head SHA:** `8dc799f`
**Round:** 2 (after R1 auto-fix in `8dc799f`)
**Diff size:** 85 files, +2736 / -69, 248,437 bytes (within budget)
**Auto-retry signals:** NONE

---

## Verdict from Codex

`needs-attention` — 2 medium findings, 0 critical.

---

## Critical (must auto-fix in this round)

**Count: 0**

No findings rise to Critical severity. Codex itself classified both as medium. Neither blocks the canonical-write contract; both are surface-area widenings of the same sodium normalization gap.

---

## Improvement (would auto-fix if round budget remained — round-2 cap applies, defer)

**Count: 2**

### I1 — Display-name sodium key dropped from Food Detail
- **Location:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:101-116, 629`
- **Codex severity:** medium
- **Mapped category:** Improvement
- **Nature:** `resolveSodiumMg` only reads `micros.sodium` and `micros.sodium_mg`, but the extras loop drops every key canonicalizing to `sodium` — including display-name `"Sodium"` (which `canonicalizeMicroKey` accepts per line 130 of `lib/dashboard/micros-rda-resolver.ts`). A row with `micros: { "Sodium": 500 }` is hidden from both the always-visible meter AND the collapsible extras.
- **Reality check:** No write path in the repo persists display-name `"Sodium"` as a JSON key. The shape is supported defensively by the dashboard resolver for hypothetical legacy AI-cache rows. So this is asymmetry between the read and exclusion paths, not an active data-loss vector. Worth fixing for symmetry but does not regress any persisted data.
- **Fix sketch:** Route `resolveSodiumMg` through `canonicalizeMicroKey` to mirror the exclusion filter — return value for any raw key canonicalizing to `sodium`.

### I2 — Legacy sodium duplicates survive unrelated edits
- **Location:** `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts:222-250`
- **Codex severity:** medium
- **Mapped category:** Improvement
- **Nature:** The merge spreads ALL of `initMicros` into `mergedMicros` (line 232). The canonical-wins/legacy-delete dedup at lines 234-249 only runs inside `if (sodiumChanged && ...)`. For a drifted row containing BOTH `sodium: 500` AND `sodium_mg: 999`, an unrelated edit (e.g., protein) leaves both keys in the emitted patch. Downstream `aggregateMicros` (line 441 of `lib/dashboard/aggregate.ts`) sums both into the same "Sodium" displayKey bucket, double-counting that row's sodium contribution in dashboard totals.
- **Reality check:** This requires drift to already exist on the row before the bugfix landed (both keys present simultaneously). No code path in this batch CREATES such drift — the R1 fix specifically writes one key only. So this is a back-compat scenario for pre-existing data, not a new regression. Cannot be triggered by any commit in `60e85c5..8dc799f`.
- **Fix sketch:** Pull the canonical/legacy dedup outside the `sodiumChanged` branch — always converge on save, even when sodium is unchanged. Add regression test for `{sodium: 500, sodium_mg: 999}` + protein edit emitting only canonical sodium.

---

## Minor (present to user)

**Count: 0**

---

## C1 fix verification (from round 1)

**Verified.** Codex's round-2 findings DO NOT contradict the R1 C1 fix:
- The sodium read in `FoodDetailMacros.tsx` correctly handles canonical AND legacy keys for all shapes any current write path produces.
- The legacy migration on save (canonical wins, legacy deleted) is correct WHEN `sodiumChanged=true`.
- Codex's I2 expands the contract: dedup should also fire on unrelated edits. That's an expansion, not a contradiction.

The fix as shipped in `8dc799f` is correct for its scoped contract (writes via the edit path emit canonical-only) and does not introduce any silent micro downgrades. Codex did not find regression risks from removing the canonical-only-input test case.

No new cross-bug interactions from `8dc799f` layered on Bug 1/2/3.

---

## Outcome

- **Critical = 0** → no escalation to main agent.
- **Improvement = 2** → would auto-fix if round budget remained. **Round-2 cap applies** (one initial + one re-review = two rounds used). Accept both into `pending_minor_findings`.
- **Minor = 0** → nothing to present to user separately.

**State.md result:** `codex_round_2: completed_with_fixes`

The label `completed_with_fixes` carries the bugfix-tomi semantic: "fix-pass needed in r1 already done; r2 only has Improvement residuals which we accept." Both I1 and I2 are queued as `pending_minor_findings` for follow-up tracking — they should be filed to `planning/followups.md` during Phase 8 as POST-MVP-BUGFIX-2026-05-17-LM-I1 and -I2.

No round 3. No code change in this phase.
