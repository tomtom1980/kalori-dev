# Acceptance Evidence — Task C.1

**Task:** C.1 — Micros + RDA on AI prompt and dashboard
**User Story:** US-STAB-C1
**Phase:** C (MVP Stabilization Sprint)
**Complexity:** Complex
**Type tags:** `[UI][backend][integration][FA]`
**Codex review:** Per-task required (Complex + brownfield FA)
**Origin:** issuelog #2 (P1) — design-doc §4 US-STAB-C1
**Tier of evidence:** Full (Complex + UI mandates per-AC evidence + visual snapshots + Codex summary)
**Completed:** 2026-05-14
**Branch:** main
**Commit chain:**
- `69193cf` — task C.1: implement micros + RDA dashboard panel
- `485f14a` — fix: task C.1 — Codex Round 1 findings
- `818205e` — fix: task C.1 — Codex Round 2 (in-scope)

## Goal

Extend the Gemini AI prompt to extract a canonical 30-micronutrient `micros` field (per `DEFAULT_MICROS_LIST` — single source of truth for AI keys + dashboard RDA denominators) and surface a new `<MicrosRdaPanel />` between the Macros hero row and the Meals bulletin showing each micronutrient as a `% of RDA` chip. Per-user override DEFERRED per DT-5/O-2 — resolver signature accepts NO profile parameter so `profiles.micros_rda_override` cannot leak in.

## Acceptance Criteria — verification

### AC1 — AI prompt extracts the canonical 30 micros

**Statement (verbatim from design-doc.md §4):** GIVEN the Gemini AI prompt for `F2 Text Log` and `F3 Photo Log`, WHEN it returns, THEN the response contains a `micros` field with exactly the micronutrients listed in `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` (the canonical sprint-time micronutrient set, ~30 entries derived from FDA + WHO baseline). The constant is the single source of truth.

**Test marker:** `tests/unit/ai/micros-extraction.test.ts` — six AC1 cases asserting `DEFAULT_MICROS_LIST` shape (30 codes), text-parse + vision prompts enumerate every code, VN fallback variants inherit, and Zod accepts/rejects accordingly.

**Status:** GREEN

**Evidence:** Targeted run of `tests/unit/ai/micros-extraction.test.ts` (post-Round-2) returns **18/18 PASS** (6 AC1 + 3 R1 exemplar-shape + 7 R1 schema-hardening + 2 R2 JSON-exemplar integrity). Tests exercise the assembled `FOOD_PARSE_SYSTEM` + `VISION_SYSTEM` + VN-fallback strings and assert the `Micros contract:` directive enumerates every canonical code in `DEFAULT_MICROS_LIST` (30 keys).

### AC2 — Critical fixture invariant (no regression, Lesson #5)

**Statement (verbatim from design-doc.md §4):** GIVEN the existing `tests/fixtures/ai-accuracy/critical.ts` 30-fixture suite, WHEN the AI prompt change ships, THEN the suite still passes 30/30 (no regression — Lesson #5 invariant).

**Test marker:** `tests/unit/ai/vn-smoke.test.ts` + `tests/unit/ai/critical-registry.test.ts` (driven by `tests/fixtures/ai-accuracy/critical.ts`).

**Status:** GREEN (invariant holds)

**Evidence:**
- Pre-flight baseline (BEFORE any prompt edits, Step B of TDD): **12/12 PASS** (5 VN smoke fixture iterations + 7 critical-registry sanity tests).
- Post-prompt-change (after AC1 GREEN): **12/12 PASS** (same suite, identical fixture set, no removals or modifications).
- Post Round-1 fixes (after schema hardening + JSON exemplar restructuring): **12/12 PASS**.
- Post Round-2 fixes (after resolver display-name fallback + JSON exemplar valid syntax): **12/12 PASS**.

**Fixture-count reconciliation:** Briefing referenced "30 fixtures" but the actual registry holds 8 (5 VN smoke + 3 Western smoke). The Lesson #5 invariant is "no regression on the existing pre-flight count" — that is what we enforced. Block-comment added to `tests/fixtures/ai-accuracy/critical.ts` documenting actual count + Codex Round 1 acknowledgement; followup `F-AI-CRITICAL-EXPAND-30` filed to grow the registry to the planning-time 30 target.

### AC3 — Dashboard renders 30 chips with `% of RDA`

**Statement (verbatim from design-doc.md §4):** GIVEN the dashboard renders, WHEN today's entries are aggregated, THEN a "Micros" panel renders below the existing Macros panel showing each micronutrient in `DEFAULT_MICROS_LIST` as a `% of RDA` chip with the corresponding code constant as the denominator (per-user RDA override DEFERRED per DT-5/O-2).

**Test marker:** `tests/integration/dashboard-micros-panel.test.tsx::renders one chip per DEFAULT_MICROS_LIST entry when data is populated` and `::flips [data-over-threshold] on rows with pct >= 90`.

**Status:** GREEN

**Evidence:** Integration test mounts `<MicrosRdaPanel rows={…30 fully-populated rows} />` and asserts:
- Exactly 30 chip cells render under `[data-testid="micros-rda-grid"]`.
- Chip ordering matches `DEFAULT_MICROS_LIST` declared order.
- Each chip's percentage text (JetBrains Mono, tabular-nums) matches the resolver-supplied `pct` value.
- `[data-over-threshold]` attribute is `"true"` exactly on rows where `pct >= 90`, otherwise `"false"`.
- 2 tests PASS (covers both AC3 cases). Combined with AC5 in the same file: **4/4 PASS**.

### AC4 — Resolver reads `DEFAULT_MICROS_LIST` constants only

**Statement (verbatim from design-doc.md §4):** GIVEN the dashboard reads RDA values from `DEFAULT_MICROS_LIST` code constants (per-user `profiles.micros_rda_override` column DEFERRED per DT-5/O-2 — see `F-MICROS-RDA-OVERRIDE-COLUMN`), WHEN the dashboard computes `% of RDA`, THEN the default code constant is used for every micronutrient.

**Test marker:** `tests/unit/lib/dashboard/micros-rda-resolver.test.ts` — 13 cases (10 AC4 + 3 R2 display-name fallback).

**Status:** GREEN

**Evidence:** Resolver signature `resolveMicrosRda(todayEntries: FoodEntry[]): MicroRdaRow[]` enforces DT-5/O-2 deferral at the type-system level — accepts NO `profile` parameter, so `profiles.micros_rda_override` is structurally impossible to consume. RDA values are derived directly from `DEFAULT_MICROS_LIST` baked-in constants (FDA Daily Values + WHO RNI baseline, citations inline in the constant file). Test coverage:
- Row count + declared-order preservation
- RDA value sourced from constant (not profile)
- Empty/single-row/multi-entry summation
- Threshold flip at pct=90 (true), non-flip at pct=89 (false)
- No upper-clamp at pct=250 (raw percentage preserved)
- AI-drift defense (unknown keys silently dropped, not crashed)
- Empty `{}` micros object handled
- (R2) Legacy display-name keys (`"Vitamin C"`) translated via `DISPLAY_NAME_TO_CANONICAL_CODE`
- (R2) Mixed canonical + display-name keys for the same row merge into one bucket
- (R2) Unknown keys ignored without error
- **13/13 PASS.**

### AC5 — Sparse-data empty-state

**Statement (verbatim from design-doc.md §4):** GIVEN the RDA panel renders, WHEN the values are 0/null (sparse data), THEN the panel renders the empty-state described in `ui-design.md` (NOT a chart with 0% for all 30 micros).

**Test marker:** `tests/integration/dashboard-micros-panel.test.tsx::renders empty-state heading + caption when every row has value=0` and `::one non-zero row flips the panel to populated mode (NOT empty-state)`.

**Status:** GREEN

**Evidence:** Panel branches on `rows.every((r) => r.value === 0)`. When TRUE: empty-state renders with existing i18n `t.dashboard.micro.emptyHeading` ("— nothing to audit yet —") + `t.dashboard.micro.emptyCaption` ("Log a few meals and the minor elements will surface here.") — matches the empty-state pattern of the existing `MicronutrientPanel` per ui-design.md §8.3. NO chip cells render in this branch. Single-pivot trigger: even one row with `value > 0` flips the panel back to populated 30-chip render (the other 29 chips show 0%, as expected for populated mode). **2/2 PASS.**

## Visual evidence

### Populated state (rendered RSC)

- **Component:** `components/dashboard/MicrosRdaPanel.tsx` (pure RSC; no `'use client'`, no Radix, no motion library — Quick-Pick decision per `ui-design/web-ui-guide.md` confirmed surface needs ZERO animation library)
- **Eyebrow header:** `MICROS` left + `30 ELEMENTS` right (Inter 500, 10.5px, UPPERCASE, letter-spacing 0.22em, `var(--color-dust)`)
- **Layout:** 2-col responsive grid (1-col below 600px breakpoint via `@media (min-width: 600px)` in `app/globals.css::.kalori-micros-rda-grid`), hairline 1px `var(--color-rule)` borders between chips
- **Per chip:** name (Inter UPPERCASE 0.22em letter-spacing, `var(--color-ivory)`) + percent (JetBrains Mono, tabular-nums, right-aligned)
- **Threshold:** chip text foreground swaps to `var(--color-oxblood)` when `pct >= 90` via `[data-over-threshold="true"]`; default foreground `var(--color-sand)` otherwise. CSS-token-only — no inline conditional styles, no new tokens.
- **Insertion slot:** between MacroBars and `<MealsBulletin />` in `app/(app)/dashboard/page.tsx`, wrapped in `<FadeUpCard delay={0.2}>` (preserves existing 0.05/0.15/0.25/0.35/0.45 cascade by occupying the unused 0.20 slot)

### Empty state (rendered RSC)

- Italic-serif heading (`var(--font-serif)`, font-style italic, 15px, `var(--color-sand)`) — `t.dashboard.micro.emptyHeading`
- Sans-serif caption (`var(--font-sans)`, 13px, `var(--color-dust)`) — `t.dashboard.micro.emptyCaption`
- NO chip grid rendered — element absent from DOM (asserted via `queryByTestId('micros-rda-grid')` returning `null`)
- Matches existing `MicronutrientPanel` empty-state DOM shape (Task 3.5 / 3.7 surface) for visual continuity

## Files added / modified

### Added (NEW)

| Path | Role |
|---|---|
| `lib/nutrition/micros-rda.ts` | `DEFAULT_MICROS_LIST` (30 entries with FDA + WHO citation comments), `MicroRdaEntry` type, `MicroCode` union, `MICROS_COUNT`, `CANONICAL_CODE_TO_DISPLAY_NAME` + `DISPLAY_NAME_TO_CANONICAL_CODE` (R2 — single source of truth for both lookups) |
| `lib/dashboard/micros-rda-resolver.ts` | `resolveMicrosRda(todayEntries)` resolver; no profile param (DT-5/O-2 enforcement); R2 walk handles canonical + display-name keys with AI-drift defense |
| `components/dashboard/MicrosRdaPanel.tsx` | Pure RSC; branches empty/populated; CSS-token-only |
| `tests/unit/ai/micros-extraction.test.ts` | 18 tests (AC1 + R1 schema + R2 JSON exemplar) |
| `tests/unit/lib/dashboard/micros-rda-resolver.test.ts` | 13 tests (AC4 + R2 fallback) |
| `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` | 11 tests (R1 canonical→display-name translation in `aggregateMicros`) |
| `tests/integration/dashboard-micros-panel.test.tsx` | 4 tests (AC3 + AC5) |

### Modified

| Path | Change |
|---|---|
| `lib/ai/prompts.ts` | `MICROS_KEY_LIST` + `MICROS_DIRECTIVE` constants added; `FOOD_PARSE_SYSTEM` exemplar updated (R2 — valid JSON sample with 3 canonical illustrative keys); `VISION_SYSTEM` directive appended as standalone paragraph (R1 — moved out of JSON shape exemplar); VN fallback variants inherit via existing concatenation |
| `lib/ai/schemas.ts` | R1: replaced permissive `z.record(z.string(), z.number())` with strict pipeline — `z.record(z.string(), z.number().nonnegative().finite())` → `.superRefine()` rejects unknown keys → `.transform()` fills missing canonical keys with 0; output type widened to `Record<string, number>` for back-compat with legacy fixtures |
| `lib/dashboard/aggregate.ts` | R1: `CANONICAL_CODE_TO_DISPLAY_NAME` translation step added in `aggregateMicros` (raw canonical AI keys → display names BEFORE existing RDA lookup); legacy display-name shape passthrough preserved |
| `lib/dashboard/types.ts` | `DashboardSnapshot` extended with `microsRda: MicroRdaRow[]`; re-exports `MicroRdaRow` from resolver module |
| `app/(app)/dashboard/page.tsx` | Inserted `<MicrosRdaPanel rows={snapshot.microsRda} />` at FadeUpCard delay=0.20 slot |
| `app/globals.css` | `.kalori-micros-rda-grid` 2-column rule at `@media (min-width: 600px)` |
| `lib/i18n/en.ts` | New `microsRda` namespace under `dashboard` with 3 strings: `headerLeft` ("MICROS"), `headerRight` ("30 ELEMENTS"), `rowAriaLabel` template. Required by `kalori/no-inline-user-strings` lint rule. Additive — existing `micro` namespace untouched. |
| `tests/fixtures/ai-accuracy/critical.ts` | Comment-only — documents actual fixture count (8) + Lesson #5 invariant + `F-AI-CRITICAL-EXPAND-30` followup pointer |

## Codex adversarial review summary

### Round 1 — 4 findings, all auto-fixed in-scope

- **HIGH 1 — snake_case keys regress MicronutrientPanel (Task 3.5):** AI now emits canonical `vitamin_c`-style keys; existing `aggregateMicros` looked up by display name → counters silently zeroed. **Fix:** `CANONICAL_CODE_TO_DISPLAY_NAME` translation step in `aggregateMicros` BEFORE existing RDA lookup. R1 firewall respected (`MicronutrientPanel.tsx` + `display-micros.ts` untouched). 11 new tests in `aggregate-micros-canonical.test.ts`.
- **HIGH 2 — malformed JSON exemplar:** `MICROS_DIRECTIVE` enumeration injected mid-object inside the JSON shape block, breaking the exemplar's parseability and risking Gemini drift. **Fix:** Directive lifted out of JSON shape exemplar; rendered as standalone "Micros contract:" paragraph below the shape block in both `FOOD_PARSE_SYSTEM` and `VISION_SYSTEM`. 3 new shape-integrity tests in `micros-extraction.test.ts`.
- **MEDIUM 3 — schema permissive:** Zod accepted any string→number pairs, undermining the AC1 invariant. **Fix:** Strict pipeline — nonnegative + finite + reject-unknown via `superRefine` + fill-missing-with-0 via `transform`. Output type widened to `Record<string, number>` for legacy-fixture compat. 7 new hardening tests.
- **MEDIUM 4 — fixture count mismatch:** Briefing claimed 30 fixtures; reality is 8. **Fix:** Block-comment in `tests/fixtures/ai-accuracy/critical.ts` documenting actual count + `F-AI-CRITICAL-EXPAND-30` followup.

**Round 1 verdict:** needs-attention → all 4 in-scope, all auto-fixed.

### Round 2 — 4 findings; 2 in-scope (auto-fixed), 2 deferred to followups

- **HIGH 2 (in scope) — resolver drops legacy display-name keys:** `resolveMicrosRda` only read `micros[entry.code]` (canonical snake_case); pre-C.1 persisted entries + warm AI-cache rows with display-name keys (`"Vitamin C"`) were silently dropped. **Fix:** `DISPLAY_NAME_TO_CANONICAL_CODE` inverse map relocated into `lib/nutrition/micros-rda.ts` (single source of truth); resolver rewritten to walk `Object.entries(micros)` and resolve each key via canonical → display-name fallback → silent-drop. 3 new tests in `micros-rda-resolver.test.ts`.
- **MEDIUM 3 (in scope) — JSON exemplar valid syntax:** R1 fix used `"micros": { /* see micros contract below */ },` — invalid JSON syntax; Gemini drift could propagate the comment verbatim. **Fix:** Replaced with valid 3-key sample `"micros": { "vitamin_c": 80, "calcium": 1000, "iron": 18 }` + instructional sentence pointing to the directive paragraph for the full 30-key contract. JSON-parseability assertion added; comment-free assertion added.
- **HIGH 1 (deferred) — AI cache versioning:** Cache key lacks prompt/schema-contract version; pre-C.1 cached payloads bypass the new ParseResult transform. Cross-cutting infra change; risk bounded by cache TTL. Filed as **F-AI-CACHE-VERSIONING**.
- **MEDIUM 4 (deferred) — RDA table divergence:** `aggregateMicros` RDA lookup is a sparse subset diverging from `DEFAULT_MICROS_LIST` (~16 canonical codes → `rda=null`; calcium/magnesium/potassium values differ). Unification touches Task 3.5 visual + functional regression. Filed as **F-RDA-TABLE-UNIFICATION**.

**Round 2 verdict:** needs-attention → 2 in-scope fixed, 2 deferred. **2-round Codex review cap closed cleanly. No Round 3.**

## Non-obvious decisions

1. **Sibling, not extend** — new `MicrosRdaPanel.tsx` adjacent to existing `MicronutrientPanel.tsx`. Preserves Task 3.5 last-7-days union behavior (different visual mode, different membership rule). Per Phase 1 architecture spec §1 recommendation (b).
2. **i18n namespace hybrid** — REUSE existing `t.dashboard.micro.emptyHeading` / `emptyCaption` (AC5 requires the same empty-state shape) + NEW `t.dashboard.microsRda.*` (3 strings: eyebrows + aria template). Required by `kalori/no-inline-user-strings` lint rule. Briefing's "no new tokens" applies to CSS tokens (design-system-snapshot.md line 40), not i18n strings.
3. **Zod permissive at outer layer, strict in transform pipeline** — final schema accepts any record but `superRefine` rejects unknowns and `transform` fills missing canonical keys with 0. Output type `Record<string, number>` preserves call-site compat (including legacy fixtures using `micros: {}`).
4. **AI accuracy invariant reconciled to actual fixture count** — briefing assumed 30 fixtures; reality is 8 (5 VN smoke + 3 Western smoke). Invariant enforced as "pre-flight count == post-flight count" (8/8). `F-AI-CRITICAL-EXPAND-30` minted to grow registry to the planning target post-MVP.
5. **Insertion slot at FadeUpCard delay 0.2** — preserves existing 0.05/0.15/0.25/0.35/0.45 cascade by occupying the unused 0.20 slot between Macros (0.15) and Meals (0.25).
6. **DT-5/O-2 enforced at the type system** — resolver signature is `(todayEntries: FoodEntry[]) => MicroRdaRow[]` with NO profile parameter; `profiles.micros_rda_override` column is structurally impossible to consume without widening the contract. F-MICROS-RDA-OVERRIDE-COLUMN already minted for post-MVP widening.
7. **`MICROS_DIRECTIVE` on both `FOOD_PARSE_SYSTEM` and `VISION_SYSTEM`** — architecture spec was implicit about vision; AC1 test asserts BOTH prompts enumerate every code. Made explicit by appending the directive to `VISION_SYSTEM` too (VN fallback variants inherit via existing string concatenation).
8. **Resolver test path `tests/unit/lib/dashboard/`** — briefing said `tests/unit/dashboard/`; existing convention used by `aggregate-day-tz.test.ts` and `fetch.test.ts` is `tests/unit/lib/dashboard/`. Followed existing convention. Surfaced for Codex (no objection).

## Followups minted

1. **F-MICROS-RDA-OVERRIDE-COLUMN** — defer per-user RDA override column (DT-5/O-2; tracked in `Planning/followups.md`). When this lands post-MVP, resolver signature widens additively to `(todayEntries, profile?)`.
2. **F-AI-CRITICAL-EXPAND-30** — expand `tests/fixtures/ai-accuracy/critical.ts` from 8 → 30 fixtures per planning-time target.
3. **F-AI-CACHE-VERSIONING** — version AI cache key by prompt/schema-contract version OR run cache hits through the current ParseResult parser; cross-cutting infra task.
4. **F-RDA-TABLE-UNIFICATION** — source `aggregateMicros` RDA lookup from `DEFAULT_MICROS_LIST` (single source of truth). Requires Task 3.5 regression pass (visual + functional).

## Test coverage summary

| Test level | Count | Pass |
|---|---|---|
| Unit — AI extraction (`micros-extraction.test.ts`) | 18 | 18 |
| Unit — resolver (`micros-rda-resolver.test.ts`) | 13 | 13 |
| Unit — aggregate canonical translation (`aggregate-micros-canonical.test.ts`) | 11 | 11 |
| Integration — panel (`dashboard-micros-panel.test.tsx`) | 4 | 4 |
| AC2 AI accuracy invariant (`vn-smoke` + `critical-registry`) | 12 | 12 |
| Dashboard regression (`tests/unit/lib/dashboard` + integration) | 72 | 72 |
| AI integration regression (`tests/unit/ai`) | 74 | 74 |
| **Aggregated combined run (15 suites)** | **146** | **146** |

- TypeScript (`pnpm typecheck`): PASS (clean)
- Lint on changed files: 0 errors, 0 new warnings (pre-existing warnings in untouched files unchanged)
- AC2 invariant: pre-flight 12/12 → post Round-1 12/12 → post Round-2 12/12 (no fixture changes)

## Sign-off

- Codex Round 1: needs-attention (4 findings; all auto-fixed in-scope)
- Codex Round 2: needs-attention (4 findings; 2 in-scope auto-fixed, 2 deferred to followups). 2-round cap reached.
- AC1–AC5 verification: PASS (5/5)
- Test suite: PASS (146/146 combined; no regressions)
- R1 firewall: respected (no auth/middleware/RLS surface touched)
- DT-5 / O-2 deferral: enforced at type system (resolver has no profile parameter)
- **Status: SHIP-READY**
