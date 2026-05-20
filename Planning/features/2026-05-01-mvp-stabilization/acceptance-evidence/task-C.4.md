# Acceptance Evidence — Task C.4

**Task:** C.4 — Library `log_count` / `last_used_at` bumped on re-log + reversed on undo
**User Story:** US-STAB-C4
**Phase:** C (MVP Stabilization Sprint)
**Complexity:** Medium
**Type tags:** `[database][API][backend][FA][brownfield]`
**Codex review:** Per-task required (Medium + brownfield FA)
**Origin:** F-VERIFY-201 (Severity P1) — verification-report.md Owner Feature × AC: F4 AC5
**Tier of evidence:** Standard (Medium + database/API; no UI screenshots required)
**Completed:** 2026-05-14
**Branch:** main
**Implementation commit:** b662e9c

## Goal

Re-logging a library item must bump `food_library_items.log_count` and `last_used_at`, restoring the "frequency-sorted by default" Library tab contract; the F11 undo path must symmetrically reverse the bump so the counters never drift.

## Acceptance Criteria — Status

| # | Marker | Status | Test file | Runtime |
|---|---|---|---|---|
| AC1 | `::bumps-on-relog` | PASS | tests/integration/library-relog-bumps-counters.test.ts | 431ms |
| AC2 | `::reverses-on-undo` | PASS | tests/integration/library-undo-reverses-bump.test.ts | 376ms |
| AC2-NULL | `::reverses-on-undo-null` (MAX returns NULL when 0 entries remain) | PASS | tests/integration/library-undo-reverses-bump.test.ts | 5ms |
| AC3 | `::tombstone-tolerant-no-op` (both re-log and undo) | PASS | both test files | 5ms (relog) + 4ms (undo) |
| AC4 | `::frequency-sort-restored` | PASS — exercises `fetchLibraryPage` + asserts `.order('last_used_at', { ascending: false, nullsFirst: false })` + bumped item at index 0 | tests/integration/library-relog-bumps-counters.test.ts | 12ms |
| AC5 | RLS 32-assertion harness | env-gated skip (no real-DB credentials in env; project pattern); RLS policies on `food_library_items` and `food_entries` unchanged by C.4 — implementation reuses existing RLS-scoped Supabase client, no new auth surface |

**Test suite:** Vitest. Total: 6 tests, 2 files, 1.76s runtime, 0 failures.

## Files changed

| File | Change | Lines |
|---|---|---|
| `app/api/entries/save/route.ts` | M | +89 (impl + Round 1 fix; final shape: COUNT-after-INSERT then UPDATE log_count = count, last_used_at = now()) |
| `app/api/entries/[id]/route.ts` | M | +135 / -3 (impl + Round 1 fix; final shape: pre-delete SELECT captures library_item_id; post-delete COUNT + MAX with error checks; UPDATE log_count = count, last_used_at = MAX or NULL) |
| `tests/integration/library-relog-bumps-counters.test.ts` | NEW | +319 initial + Round 1 strengthening (AC4 imports `fetchLibraryPage` + asserts `.order()` signature) |
| `tests/integration/library-undo-reverses-bump.test.ts` | NEW | +386 initial + Round 1 strengthening (AC2-NULL asserts COUNT-driven NULL on 0-remaining; tombstone test asserts `.is('deleted_at', null)` on UPDATE chain) |

## Implementation strategy

Post-Codex-Round-1 strategy: **derive-from-COUNT** rather than blind +/- 1.

**Re-log (save/route.ts):**
1. INSERT entry (existing behavior).
2. If `library_item_id` non-null AND library item exists and is not tombstoned:
3. SELECT `count('id', { count: 'exact', head: true })` FROM `food_entries` WHERE `library_item_id = $1 AND user_id = $2`.
4. UPDATE `food_library_items` SET `log_count = <count>, last_used_at = now()` WHERE `id = $1 AND user_id = $2 AND deleted_at IS NULL`.
5. Soft-fail catch (entry remains authoritative).

**Undo (DELETE handler in [id]/route.ts):**
1. Pre-delete SELECT now captures `library_item_id`.
2. DELETE entry (existing behavior).
3. If `library_item_id` was non-null:
4. SELECT `count('id', ...)` from `food_entries`. Check `error` field — on error, Sentry capture + skip UPDATE.
5. If count > 0, SELECT MAX(logged_at). Check `error` — on error, Sentry capture + skip UPDATE.
6. UPDATE `log_count = <count>, last_used_at = <MAX or NULL>` WHERE `id = $1 AND user_id = $2 AND deleted_at IS NULL`.
7. Cache invalidation: `revalidateTag(TAGS.userLibrary) + revalidatePath('/library', 'page')` on success.
8. Soft-fail catch.

**Why derive-from-COUNT (vs original +/- 1 plan):**
- Idempotent — re-running converges to truth.
- Self-correcting for orphan-bump paths — paths that set `library_item_id` without bumping (copy-yesterday, PATCH) self-heal on next save/undo.
- Concurrency-tolerant — last UPDATE wins with the most recent COUNT.

## Codex Review Outcome

**Round 1** (4 findings, all auto-fixed):
- High #1: Reverse bump over-decrements rows never bumped → **Fixed** (derive-from-COUNT).
- High #2: Failed MAX read written back as NULL → **Fixed** (error check + skip).
- Medium: Concurrent SELECT-then-UPDATE lost updates → **Mitigated** (derive-from-COUNT).
- Low: AC4 test doesn't prove ORDER signature → **Fixed** (Option A: `fetchLibraryPage` + `.order()` capture).

**Round 2** (3 findings, all dispositioned):
- High R2-1: Counter drift still possible under concurrent writers → **Accepted as residual**, filed `F-C4-CODEX-R2-1` in followups.md. Rationale: single-user PWA bounds the probability; self-healing on next operation; atomic fix = Postgres RPC + migration (scope creep).
- High R2-2: copy-yesterday route doesn't bump → **Out of scope**, filed `F-C4-CODEX-R2-2` as new task.
- Medium R2-3: PATCH route doesn't reconcile → **Out of scope**, filed `F-C4-CODEX-R2-3` as new task (can bundle with R2-2).

**2-round cap reached.** Disposition: ship C.4 with documented residual + 2 new follow-up tasks.

## Residual Risks

1. `F-C4-CODEX-R2-1` — Counter drift under concurrent re-log/undo (single-user PWA bounds the probability).
2. `F-C4-CODEX-R2-2` — copy-yesterday route library counter recompute (new task).
3. `F-C4-CODEX-R2-3` — PATCH route library counter reconcile (new task; can bundle with R2-2).

## Test Regression Impact

- Library tests sweep: 23 files, 59 tests — all GREEN.
- Entries tests sweep: combined — all GREEN.
- RLS harness: env-gated skip (project pattern); no policy or implementation change to RLS.

## Sign-off

- Codex Round 2: needs-attention (3 findings; all dispositioned).
- C9 Runtime AC verification: PASS (6/6).
- Test suite: PASS (no regressions).
- **Status: SHIP-READY**
