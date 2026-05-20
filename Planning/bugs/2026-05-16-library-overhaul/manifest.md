# Bug Bundle Manifest — 2026-05-16-library-overhaul

## Batch metadata

- **Started:** 2026-05-16T02:23:00Z
- **Completed:** 2026-05-16 (Asia/Saigon)
- **Branch:** main
- **Starting SHA:** `68a39497c081d5db9ecf78e4ce4b89454dd8ba58`
- **Committing SHA:** `8cf1c86`
- **Backfill commit SHA:** `<fill in after backfill commit>`
- **Bugs in batch:** 12 (11 fixed/added, 1 verify-only — no regression)
- **Project:** Kalori

---

## Per-bug detailed summary

### Bug 1 — Library item detail view appears dim/washed

- **Classification:** bug (FIX)
- **Files touched:**
  - `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — added `mode='route'|'modal'` prop split; route variant drops scrim+slide-in and renders a full-opacity surface; modal branch reserved but unused.
  - `app/globals.css`
  - `tests/components/library/FoodDetail.a11y.test.tsx`
- **Tests added:** `tests/components/library/FoodDetail.route-mode.test.tsx`
- **Root cause:** scrim background + sheet background both stacked the same near-black ledger color, washing the detail surface to ~75 % luminance. Route mode now bypasses the scrim entirely.
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented; covered by Wave 2 component cluster.

### Bug 2 — No loading feedback on card click / detail close

- **Classification:** bug (ADD)
- **Files touched:**
  - `app/(app)/library/[id]/loading.tsx` (new) — App Router segment-level skeleton.
  - `app/(app)/library/loading.tsx` (new) — list-level skeleton.
  - `app/(app)/library/_components/FoodDetailSkeleton.tsx` (new)
  - `app/(app)/library/_components/LibraryCard.tsx` — `data-pending` attribute exposed for CSS.
  - `app/(app)/library/_components/LibraryClient.tsx` — `useTransition` wrap on card-click navigation.
  - `app/(app)/library/_components/LibraryGrid.tsx`
  - `app/globals.css` — pending-cue CSS rule.
  - `lib/i18n/en.ts`
  - `tests/components/library/LibraryCard.test.tsx`
- **Tests added:** `tests/components/library/FoodDetailSkeleton.test.tsx`
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 3 — Quick-action menu on cards

- **Classification:** actually_a_feature (ADD)
- **Files touched:**
  - `app/(app)/library/_components/LibraryCardActionMenu.tsx` (new) — Radix DropdownMenu kebab.
  - `app/(app)/library/_components/LibraryCard.tsx` — root refactor to `<div role="button">` to host nested menu (a11y nested-interactive constraint).
  - `app/(app)/library/_components/LibraryGrid.tsx`
  - `app/(app)/library/_components/LibraryClient.tsx`
  - `app/(app)/library/_components/FoodDetail/FoodDetail.tsx`
  - `app/(app)/library/[id]/page.tsx`
  - `app/globals.css`
  - `lib/i18n/en.ts`
  - `tests/components/library/LibraryCard.test.tsx`
  - `tests/components/library/LibraryGrid.test.tsx`
  - `tests/components/library/LibraryClient.pagination.test.tsx`
- **Tests added:** `tests/components/library/LibraryCardActionMenu.test.tsx`, `tests/components/library/LibraryClient.quick-actions.test.tsx`, `tests/components/library/FoodDetail.mode-edit-query.test.tsx`
- **Scope decision:** Delete + Edit only — Log Now omitted to keep the scope tight (and to avoid coupling to Bug 6 dialog logic).
- **Risk:** medium
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 4 — Mutation feedback + interaction-block on Edit/Save/Delete

- **Classification:** bug (FIX)
- **Files touched:**
  - `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — sheet-wide `aria-busy`; cross-mutation gating; delete-await-before-navigate; ESC gated by busy state.
  - `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx`
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`
  - `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx`
  - `app/globals.css`
  - `lib/i18n/en.ts`
- **Tests added:** `tests/components/library/FoodDetail.mutation-block.test.tsx`
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 5 — Gemini sketch thumbnails

- **Classification:** actually_a_feature (ADD)
- **Files touched:**
  - `supabase/migrations/0021_library_overhaul.sql` (new) — widens `created_from` CHECK + 4 sketch columns.
  - `lib/database.types.ts` — types regen + content-hash header.
  - `scripts/apply-migration-0021.mjs` (new) — Management-API apply helper.
  - `lib/ai/image-client.ts` (new) — Gemini-2.5-flash-image wrapper (50 KB output ceiling, fixture-mode bypass via `KALORI_SKETCH_FIXTURE_BASE64`).
  - `lib/ai/sketch-prompt.ts` (new) — prompt builder with style preamble.
  - `lib/library/sketch-pipeline.ts` (new) — CAS-predicate claim (Round 3 fix), Gemini call, sharp re-encode → WEBP, Supabase Storage upload, durable storage-path persistence (not signed URL), failure recording.
  - `lib/library/sketch-enqueue.ts` (new) — `after()` enqueue helper.
  - `lib/storage/sign-thumbnail.ts` (new) — single-purpose 1 h TTL signing + legacy-URL pass-through.
  - `lib/library/fetch.ts` — sign-on-read at the RSC boundary with `SIGN_LIMIT = 10` bounded fan-out (Round 3).
  - `lib/library/getItem.ts` — sign-on-read at the detail boundary.
  - `app/api/library/sketch/generate/route.ts` (new)
  - `app/api/library/sketch/backfill/route.ts` (new) — 200-item cap + dashboard widget surface.
  - `app/api/entries/save/route.ts` — `thumbnail_kind` ALWAYS `null` at INSERT (photo branch no longer traps the row); sketch enqueue fires for both text + photo source.
  - `app/(app)/library/_components/LibraryCard.tsx` — `data-sketch` attribute for UI affordances.
  - `app/(app)/dashboard/_components/SketchBackfillButton.tsx` (new) — operator widget on dashboard.
  - `app/globals.css`
  - `lib/i18n/en.ts`
- **Tests added:** `tests/integration/library-overhaul-migration-0021.test.ts`, `tests/unit/lib/ai/sketch-prompt.test.ts`, `tests/unit/lib/ai/image-client.test.ts`, `tests/unit/lib/library/sketch-pipeline.test.ts`, `tests/unit/lib/library/sign-on-read.test.ts`, `tests/unit/lib/storage/sign-thumbnail.test.ts`, `tests/unit/api/library-sketch-generate.test.ts`, `tests/unit/api/library-sketch-backfill.test.ts`, `tests/unit/api/entries-save-sketch-enqueue.test.ts`, `tests/components/dashboard/SketchBackfillButton.test.tsx`
- **Cost guardrails:** `MAX_RETRIES = 3` per row + `MAX_BACKFILL_PER_INVOCATION = 200` + CAS predicate prevents concurrent retries firing duplicate Gemini calls.
- **Risk:** high
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented; migration applied to `kalori-dev`.

### Bug 6 — Add-to-Library form

- **Classification:** actually_a_feature (ADD)
- **Files touched:**
  - `supabase/migrations/0021_library_overhaul.sql` — widened `created_from` CHECK to accept `'manual'`.
  - `lib/database.types.ts`
  - `scripts/apply-migration-0021.mjs`
  - `lib/library/create-schema.ts` (new) — Zod schema shared between client + server.
  - `lib/library/fetch.ts`
  - `app/api/library/create/route.ts` (new) — handles `I11` replay (200 + `replayed:true`), normalized-name dedup (409 + existing item id), 4xx/5xx fall-back banner.
  - `app/(app)/library/_components/LibraryAddDialog.tsx` (new) — right-side Sheet drawer with native React form + idempotent `client_id` via `useRef` + sessionStorage persistence (Round 1 Improvement fix).
  - `app/(app)/library/_components/LibraryClient.tsx` — Add Item action bar (hidden in select mode).
  - `app/globals.css`
  - `lib/i18n/en.ts`
- **Tests added:** `tests/integration/library-overhaul-migration-0021.test.ts`, `tests/unit/lib/library/create-schema.test.ts`, `tests/unit/api/library-create.test.ts`, `tests/components/library/LibraryAddDialog.test.tsx`
- **Auto-fires Bug 5 sketch enqueue via `after()`** on successful create.
- **Risk:** medium
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 7 — Library default sort should be Name A-Z

- **Classification:** bug (CHANGE)
- **Files touched:**
  - `app/(app)/library/_components/LibraryClient.tsx` — flipped `usePersistedSelection` fallback at `:193` from `'most-logged'` to `'name-asc'`.
  - `tests/integration/library-page.test.tsx` — rewrote RED-then-GREEN against the new default; "sort change reorders" coverage preserved by switching to most-logged via the dropdown.
- **Out-of-scope:** Log-modal `LibraryTab` uses a different Zustand-backed sort with options `frequent|recent|highest-protein`. Filed as Bug 7b follow-up.
- **Risk:** low
- **UI touching:** no
- **TDD required:** yes
- **Status:** implemented.

### Bug 8 — Fiber typography mismatch + missing DV line on macros

- **Classification:** bug (FIX + ADD)
- **Files touched:**
  - `lib/nutrition/macro-dv.ts` (new) — FDA 21 CFR §101.9 daily-value reference.
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — fiber promoted to fourth `MacroDisplay` row; all 4 macros render DV %.
  - `app/globals.css`
  - `lib/i18n/en.ts`
- **Tests added:** `tests/unit/lib/nutrition/macro-dv.test.ts`, `tests/components/library/FoodDetailMacros.test.tsx`
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 9 — Micros collapsed-by-default with Expand toggle

- **Classification:** actually_a_feature (ADD)
- **Files touched:**
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — Radix Collapsible wraps non-default micros; toggle absent when nothing to expand.
  - `app/(app)/library/_components/FoodDetail/foodDetail.format.ts`
  - `app/globals.css`
  - `lib/i18n/en.ts`
- **Tests added:** updates to `tests/components/library/FoodDetailMacros.test.tsx`
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 10 — Card hover/focus animation

- **Classification:** actually_a_feature (ADD)
- **Files touched:**
  - `app/globals.css` — CSS-only opacity (0.85→1) + brightness wake-up on hover + `:focus-visible`; reduced-motion OR-wrapper gated; layer below `[data-pending='true']` so navigation pending cue wins.
- **Tests added:** updates to `tests/components/library/LibraryCard.test.tsx`
- **Risk:** low
- **UI touching:** yes
- **TDD required:** yes
- **Status:** implemented.

### Bug 11 — Library separators not visually clear

- **Classification:** bug (FIX)
- **Files touched:**
  - `app/globals.css` — `var(--color-rule)` → `var(--color-rule-strong)` on `.kalori-library-grid` (top+left) and `.kalori-library-cell` (right+bottom). Width stays 1 px (no gap/divide refactor).
- **Tests added:** updates to `tests/components/library/LibraryGrid.test.tsx` (CSS-rule-existence insurance test under `describe('grid separator hairlines (Bug 11)')`)
- **Visual baselines:** Phase 7 visual regression baselines for `/library` will need regeneration once E2E infra is unblocked (flagged for the visual sweep).
- **Risk:** low
- **UI touching:** yes
- **TDD required:** no
- **Status:** implemented.

### Bug 12 — Pagination preserved (verify only)

- **Classification:** bug (VERIFY)
- **Files touched:** none
- **Tests added:** none — existing `tests/components/library/LibraryClient.pagination.test.tsx` 2 specs pass post-Wave-3 (Wave 3 already widened the selector for the `role=button` refactor).
- **Verified:** `LIBRARY_PAGE_SIZE = 10` constant still lives at `LibraryClient.tsx:66` (was line 65 in proposal — shifted +1 by earlier Wave edits; contract intact). Slice math + library-pagination nav untouched across the batch.
- **Risk:** low
- **UI touching:** yes (indirectly — verified UI behavior)
- **TDD required:** yes (covered by existing tests)
- **Status:** verified.

---

## Codex findings summary

| Severity | Round | File | Status |
|----------|-------|------|--------|
| Critical | R1 | `lib/library/sketch-pipeline.ts` (durability — stored signed URL instead of path) | Auto-fixed via `sign-on-read` boundary |
| Critical | R1 | `lib/library/sketch-pipeline.ts` (concurrency — `recordFailure` double-bumped attempt count) | Auto-fixed |
| Critical | R1 | `app/api/entries/save/route.ts` (photo-thumbnail-kind contract) | Auto-fixed — `thumbnail_kind` always `null` at INSERT |
| Improvement | R1 | `app/(app)/library/_components/LibraryAddDialog.tsx` (client_id persistence) | Auto-fixed — sessionStorage under `kalori:library-add:client-id` |
| Critical | R2 | `lib/library/sketch-pipeline.ts` `claimSlot` (`.lt()` predicate not actually atomic under READ COMMITTED) | User-authorized Round 3 → CAS predicate `.eq('sketch_attempt_count', currentAttempts)` |
| Improvement | R2 | `lib/library/fetch.ts` (signing fan-out before pagination, O(N) cost) | User-authorized Round 3 → `SIGN_LIMIT = 10` bounded budget |
| Critical | Internal audit | `app/globals.css` (focus-ring outline used `oxblood-soft` instead of ivory — WCAG 1.4.11) | Fixed inline (2 declarations) |
| Critical | Internal audit | `tests/integration/nav-audit.test.ts` (template-literal `href` for runtime path) | Fixed via `// @nav-audit href: /library/[id]` pragma |
| Critical | Schema drift | `lib/database.types.ts` header content hash stale (`fcc47f82…` → `6e11952…`) | Fixed — single-line header update; no type body regen needed |

---

## Security findings summary

| ID | Severity | File | Status |
|----|----------|------|--------|
| M1 | Medium | `lib/library/sketch-pipeline.ts:262-269` (unbounded PNG decode) | Deferred to followup |
| M2 | Medium | `lib/ai/image-client.ts:82-85` (fixture-mode env not prod-gated) | Deferred to followup |
| I1 | Info | `lib/ai/sketch-prompt.ts:46-57` (prompt-injection via `displayName`) | Deferred (multi-user features) |
| I2 | Info | `lib/library/sketch-pipeline.ts:249` (storage-path UUID composition) | Documented as defense-in-depth example |
| I3 | Info | `lib/library/sketch-pipeline.ts:191` (`sketch_last_error` persists upstream text) | Documented; truncated to 500 chars |
| I4 | Info | `next.config.ts:42-53` (next/image remotePatterns) | Documented; future-proofing flag |

---

## Production readiness checklist

- [ ] Apply migration 0021 to production Supabase: `node scripts/apply-migration-0021.mjs Planning/apikeys.txt`
- [ ] Verify `GEMINI_API_KEY` on Vercel Production scope (already configured per `setup-state.md` — re-verify)
- [ ] First-time sketch backfill via dashboard → "Generate sketches" button (~50–150 rows × $0.04 ≈ $2–6)
- [ ] Optional kill switch: `KALORI_SKETCH_DISABLED=1` env var if Gemini issues arise post-deploy
- [ ] Visual regression baseline regen for `/library` once E2E infra drift is fixed (Bug 11 separator-strength change is intentional)

---

## Follow-ups

| ID | Priority | Rationale |
|----|----------|-----------|
| F-LIBOVR-BUG7B-LOGMODAL-SORT-2026-05-16 | Low | Log-modal `LibraryTab` Zustand sort union has no `'name-asc'` option; surface needs a separate fix. |
| F-LIBOVR-SEC-M1-PNG-DECODE-CAP-2026-05-16 | Medium | Bound PNG decode buffer (~5 MB cap) in `sketch-pipeline.ts`; should land before multi-user features. |
| F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE-2026-05-16 | Medium | Prod-gate `KALORI_SKETCH_FIXTURE_BASE64` env var; mirror `sketch-enqueue.ts:56-58`. |
| F-LIBOVR-E2E-INFRA-DRIFT-2026-05-16 | High | E2E suite blocked; strip embedded `\r\n` in `tests/e2e/fixtures/global-setup.ts` + refuse fixture if prod ref + dev-server env split. |
| F-LIBOVR-SIGN-FANOUT-SQL-PAGINATION-2026-05-16 | Low | Option-A refactor: move pagination to SQL layer (full UX refactor; client-side search/filter/sort would need server-side rewrite). |
| F-LIBOVR-LESSONS-COMPACTION-2026-05-16 | Low | `lessonlearned.md` Process & Sub-agents / Testing / Next.js 16 / Concurrency subsections exceed 15 bullets; deferred per prior batch precedent. |

---

## References

- Codex Round 1: `Planning/bugs/2026-05-16-library-overhaul/codex/round-1.md` (+ categorized + auto-fix reports)
- Codex Round 2: `Planning/bugs/2026-05-16-library-overhaul/codex/round-2.md` (+ categorized)
- Codex Round 3 (user-authorized override): `Planning/bugs/2026-05-16-library-overhaul/codex/fixes-r2-round3-batch.md`
- Codex schema-drift fix: `Planning/bugs/2026-05-16-library-overhaul/codex/fixes-schema-drift.md`
- Internal audit fixes: `Planning/bugs/2026-05-16-library-overhaul/codex/fixes-r1-audit-batch.md`
- Security review: `Planning/bugs/2026-05-16-library-overhaul/security-review.md`
- E2E results: `Planning/bugs/2026-05-16-library-overhaul/e2e-results.md`
- Project context: `Planning/bugs/2026-05-16-library-overhaul/project-context.md`
- Filtered lessons reference: `Planning/bugs/2026-05-16-library-overhaul/lessons-relevant.md`
- Wave outputs: `Planning/bugs/2026-05-16-library-overhaul/outputs/wave-{1,2,3,4,5}-*.md`
- Per-bug proposals: `Planning/bugs/2026-05-16-library-overhaul/proposals/bug-{1..12}.md`
