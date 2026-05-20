# Bugfix-tomi Batch Manifest — 2026-05-17-library-micros-parse

**Batch ID:** `2026-05-17-library-micros-parse`
**Started:** 2026-05-17 03:22 UTC
**Closed:** 2026-05-17 12:18 GMT+7
**Starting HEAD SHA:** `07273a3ca9e15aec6a4186b2c45aad8ba1e9fb86`
**Bugs:** 1 (single bug, plural-batch infrastructure preserved)
**Working tree state at start:** clean (predecessor superseded-followups batch already stashed)
**Final status:** SHIPPED — implementation + Codex + security + E2E gates closed.

---

## Bug 1 — Library edit-mode hides 28 of 30 persisted micros after AI parse

**Slug:** `library-edit-mode-exposes-every-persisted-micro`
**TDD required:** yes (logic-touching surface)
**UI touching:** yes
**Risk classification:** medium

### Description

User reported "micros aren't being saved" after using the AI parse flow on the
library Add Item path. Investigation rejected the user's surface theory: parse
+ persist is fully wired — Gemini returns all 30 canonical micros (via
`MICROS_DIRECTIVE` prompt + `Micros` Zod superRefine transform), the
confirmation library-only save loop forwards `nonZeroMicros`, the
`/api/library/create` route inserts the JSONB verbatim, and the DB row's
`nutrition.micros` carries 10–25 non-zero canonical entries.

The actual bug was a UI scope gap one layer down: `EditMicrosCollapsible` in
`FoodDetailMacros.tsx` rendered editable inputs ONLY for sugar + sodium (and
only when `saved > 0`). The other 28 canonical micros (iron, calcium,
vitamins, etc.) had NO edit input regardless of their persisted values, so the
user saw "no micros" in edit mode and interpreted it as "all zero".

### Classification + root cause

**`known_fix`** with a deliberate product-design pivot.

The original `EditMicrosCollapsible` design predates the AI-parse-driven
library add flow. The "saved > 0 → only sugar + sodium" rule was characterized
as locked-in by the `FoodDetailMacros.idrift-edit-micros.test.tsx`
characterization test added 8 hours before this batch at commit `d1118c9`. The
fix rewrites that intent: every persisted non-zero canonical micro now renders
an input, plus sugar + sodium remain always-editable so users can ADD them
post-hoc. View-mode (`MicrosReadOnly`) already rendered the right rows via
`extraRows` + the Bug 9 collapsible — the data was always present, just
unreachable in edit mode.

### Files touched

#### Production (12 files)

| File | Change |
|---|---|
| `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` | `EditMicrosCollapsible` rewritten: renders input per persisted non-zero canonical micro plus always-editable sugar + sodium; zero-string render filter; canonical-precedence two-pass row set; new `onMicroChange` prop; per-micro `aria-invalid` + `aria-describedby` + inline `<p role="alert">` error rendering mirroring FoodDetailName precedent. |
| `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` | `DraftState.micros: Record<string,string>` (optional for back-compat); new `setMicro(code,value)` + per-key error-clear; new `buildMicrosDraftBag` + `canonicalizeMicrosBag` two-pass canonical-precedence helpers; `buildFieldsPatch` round-trips all drafted micros (canonical/legacy dedup applies to every micro, not only sodium); orphan-key preservation block at lines 431-435 (security note: see SEC-MED-2); `validateMicroValue` helper + per-key `MicrosErrors` map; `EditErrors.micros` reshaped from `string` → `Record<string,string>`; commit `ORDER` extended with `'micros'` last; focus routes to `fd-edit-micro-{code}` for first errored key; `MAX_MICRO_VALUE` upper clamp imported from shared `lib/library/micros-bounds.ts` and re-exported under original name for back-compat. |
| `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` | 1-line additive wiring: `onMicroChange={edit.setMicro}` passed to `<FoodDetailMacros />`. Scope expansion vs proposal — flagged in bug-1 output but unavoidable for correctness. |
| `app/api/library/[id]/update/route.ts` | `MicrosPartial` value type tightened with `.max(MAX_MICRO_VALUE)` (R1 C3 server bound). R3 replaced local constant with shared module import. |
| `app/api/library/create/route.ts` | No file edit directly — schema lives in `lib/library/create-schema.ts`. Route inherits the new bound via shared schema import. |
| `app/api/entries/save/route.ts` | R3 C2-R2-1 fix: `ParsedItemSchema.micros` tightened with `.finite().nonnegative().max(MAX_MICRO_VALUE)` from shared module; closes the save-to-library bypass. |
| `app/api/library/merge/route.ts` | R3 C2-R2-2 fix: `NutritionSchema.micros` tightened with the same constraint; closes the merge-route bypass. |
| `lib/library/create-schema.ts` | R1 C3 fix on the shared schema; R3 replaced local constant with shared module import. |
| `lib/library/micros-bounds.ts` (NEW) | Shared `MAX_MICRO_VALUE = 1_000_000` constant module. Single source of truth across 5 surfaces (4 server + 1 client) — created at R3 after rule-of-four+ trigger. |
| `lib/ai/schemas.ts` | Untouched in scope (Gemini parse schema independent of route inline schemas); listed here for traceability — `Micros` superRefine already enforced canonical-keys + nonneg + finite pre-batch; no max needed (Gemini values never approach 1e6 for tracked micros). |
| `lib/i18n/en.ts` | Added `errMicroNumber: 'Must be a number.'` for NaN-class micro errors; distinct from existing `errMacroNonneg` (negative class). |

#### Tests (10 files)

| File | Change |
|---|---|
| `tests/components/library/FoodDetailMacros.editmicros.test.tsx` (NEW) | 18 tests total: 8 baseline TDD (renders inputs for non-zero canonicals, sugar/sodium always editable, canonicalization of legacy keys, label-association) + 5 R1 (C1 sugar onMicroChange suppression, sodium suppression, sugar input binding, zero-row hidden, non-zero regression) + 5 R3 a11y (aria-invalid, inline alert, aria-describedby, clean sibling, clean draft). |
| `tests/unit/foodDetail/useFoodDetailEdit.editmicros.test.ts` (NEW) | 21 tests: 7 baseline TDD (DraftState.micros bag, buildFieldsPatch round-trip, canonical/legacy dedup, invalid-input skip) + 14 R1 (C1/C2/I1 + validateDraft) + 7 R3 (I2-R2-1 raw-string negatives/NaN, upper clamp, multi-error per-key, hook shape verification). |
| `tests/components/library/FoodDetailMacros.idrift-edit-micros.test.tsx` (REWRITTEN) | Old "saved > 0 → sugar+sodium only" characterization replaced with "every persisted non-zero micro renders an input, sugar + sodium always editable". Trigger + collapsed-default assertions preserved verbatim. |
| `tests/components/library/FoodDetailMacros.test.tsx` (PATCHED) | 1-test patch on `'edit mode: canonical-only micros.sodium = 500 exposes the sodium edit input'` (line 806): migrated testid from `food-detail-edit-sodium-input` → `food-detail-edit-micro-sodium-input` and added `draft.micros` seed. Test intent preserved. Out-of-proposal scope expansion flagged in bug-1 output. |
| `tests/integration/library-item-update-round1.test.ts` (EXTENDED) | 3 R1 C3 cases appended: 400 on iron_mg=1.5e6, 400 on multi-key overflow (iron_mg=9.999e9 + sodium_mg=2e6), 200 boundary check at exactly iron_mg=1e6. |
| `tests/unit/lib/library/create-schema.test.ts` (EXTENDED) | 4 R1 C3 cases appended: rejects 1.5e6, rejects 9.999e9, accepts 1e6 boundary, accepts realistic sub-cap values. |
| `tests/unit/api/entries-save-micros-bound.test.ts` (NEW) | 4 R3 cases for C2-R2-1: 1.5e6 reject, multi-key overflow reject, 1e6 boundary accept, negative reject. |
| `tests/unit/api/library-merge-micros-bound.test.ts` (NEW) | 4 R3 cases for C2-R2-2: same shape mirrored against merge body schema; RPC mock asserts no DB write on rejection. |
| `tests/unit/library/food-detail-edit-validation.test.ts` (EXTENDED) | Round-2 C2 micros-survival assertion updated for new canonical-precedence contract (values survive verbatim under canonical keys; legacy aliases no longer present alongside canonical). |

### Tests added — total count

- **R1 baseline:** 22 tests (8 component + 14 hook).
- **R1 server cluster (C3):** 7 tests (3 update-route integration + 4 schema unit).
- **R1 client cluster (C1/C2/I1/I2):** 19 tests (5 component + 14 hook). One existing test (`food-detail-edit-validation` C2) updated for new contract.
- **R3 server cluster (C2-R2-1, C2-R2-2):** 8 tests (4 entries-save + 4 merge).
- **R3 client cluster (I2-R2-1, I2-R2-2):** 12 tests (5 component a11y + 7 hook).
- **IDRIFT rewrite:** 8 characterization tests rewritten in place.

**Grand total:** 68 new + 1 updated + 8 rewritten. All GREEN at every gate.

### Codex R1/R2/R3 findings table

| Round | ID | Severity | Surface | Finding | Resolution |
|---|---|---|---|---|---|
| R1 | C1 | Critical | `FoodDetailMacros.tsx:918-922` | Sugar dual-write leaks non-canonical `micros.sugar` key | Auto-fixed: sugar input single-writes through `onDraftChange('sugar_g')`; patch builder scrubs stray `micros.sugar`. |
| R1 | C2 | Critical | `useFoodDetailEdit.ts:322-329` | Both-present legacy/canonical merge can drop canonical value on legacy-first JSONB order | Auto-fixed: two-pass canonical-precedence in `buildMicrosDraftBag` + `canonicalizeMicrosBag` — canonical always wins, order-independent. |
| R1 | C3 | Critical | `app/api/library/[id]/update/route.ts:76-83` | Server route accepts unbounded micro values (claimed MAX_MICRO_VALUE bypass) | Auto-fixed: `.max(MAX_MICRO_VALUE)` applied on `MicrosPartial` + shared `CreateLibraryNutritionSchema.micros`; 1e6 constant duplicated with cross-reference comments (R3 later extracted to shared module). |
| R1 | I1 | Improvement | `useFoodDetailEdit.ts:278-288` | Invalid/cleared generic micro edits silently discarded by `buildFieldsPatch` | Auto-fixed: `validateMicroValue` helper; `validateDraft` flags NaN/negative on `errs.micros`; empty-string clears via `microClears` set. |
| R1 | I2 | Improvement | `FoodDetailMacros.tsx:864-870` | Zero-valued persisted micros expand to noisy zero-row panel | Auto-fixed: `buildMicrosDraftBag` skips zero seeds; render filter parses `Number(raw) > 0` instead of `trim()`. |
| R2 | C2-R2-1 | Critical (scope-expansion) | `app/api/entries/save/route.ts:56` | save-to-library bypasses MAX_MICRO_VALUE — third mutation surface | R3 auto-fixed via shared module import: `ParsedItemSchema.micros` tightened with `.finite().nonnegative().max(MAX_MICRO_VALUE)`. |
| R2 | C2-R2-2 | Critical (scope-expansion) | `app/api/library/merge/route.ts:69` | Merge route accepts negative/oversized micros — fourth mutation surface (strictly weaker than pre-R1 schemas) | R3 auto-fixed via shared module import: `NutritionSchema.micros` tightened with the same constraint. |
| R2 | I2-R2-1 | Improvement | `useFoodDetailEdit.ts:589-601` | `Math.max(n, 0)` in `setMicro` silently clamps negatives, bypassing I1 validation | R3 auto-fixed: clamp removed for negatives; raw string propagates to `validateDraft` which surfaces per-key error. Upper-bound clamp preserved as data-integrity defense. |
| R2 | I2-R2-2 | Improvement | `useFoodDetailEdit.ts:535` + FoodDetailMacros micro inputs | `errs.micros` set but commit focus skips micros; no aria-invalid; no error rendering — a11y/recoverability regression | R3 auto-fixed: `EditErrors.micros` reshaped to `Record<string,string>`; commit `ORDER` extended with `'micros'` last; focus routes to `fd-edit-micro-{code}`; FoodDetailMacros generic-micro inputs render `aria-invalid` + `aria-describedby` + inline `<p role="alert">` mirroring FoodDetailName precedent. |
| R3 | — | — | — | All R2 findings resolved; no new findings surfaced | Two-round cap explicitly overridden under user's standing "go with recommendation" authority. R3 documented as a single batch closing R2 scope-expansion cluster + R2 client improvements via two parallel sub-agents (server + client clusters). |

**Net round-by-round:** R1 = C3 I2 M0 → R2 = C2 I2 M0 → R3 = C0 I0 M0.

### Security review summary

**Overall:** 0 Critical / 0 High / 2 Medium / 1 Informational. Block E2E = NO.

| ID | Severity | Class | Surface | Single-user MVP threat |
|---|---|---|---|---|
| SEC-MED-1 | Medium | Resource exhaustion | All 4 micros schemas (create / update / merge / entries-save) | LOW (self-DoS only). Required before multi-user. |
| SEC-MED-2 | Medium | Key namespace pollution | `useFoodDetailEdit.ts:431-435` (NEW orphan-preservation) + `canonicalizeMicroKey` prototype-chain leak | LOW (no XSS/SQLi sink reached in this batch). Required before multi-user. |
| SEC-INFO-1 | Informational | Note | Canonical/legacy dedup uses closed-allowlist Sets / frozen maps | No bypass beyond SEC-MED-2 surface — retained for awareness. |

Categories all PASS: input validation (uniform `MAX_MICRO_VALUE = 1e6` across 4 mutation routes), authn/authz (unchanged RLS fences), PII handling (no new logs, no user-input interpolation), injection vectors (parameterized JSONB), secret leakage (none), XSS/CSRF (no raw-HTML render), race conditions (preserved TOCTOU mitigations), open redirects (N/A).

### E2E + visual regression result

**Verdict:** PASS. Advance to Phase 8 (clean).

- `tests/e2e/library/library-list-thumbnails-post-edit.spec.ts` (focused — only spec that opens FoodDetail edit) → **2/2 PASS** in 31.2s.
- `tests/e2e/library/**` chromium sweep → 10 pass / 7 fail (all 7 pre-existing per session memory 8105: DB seed pollution + axe-core + sketch thumbnails, 0 attributable to this batch).
- `tests/visual/library.spec.ts × visual-baseline-chromium / -tablet / -mobile` → **3/3 PASS** gating projects.
- Cross-browser advisory drift (firefox + safari, 136px height delta on /library grid) → pre-existing, non-gating per `playwright.config.ts` line 77.
- **Visual baselines refreshed:** 0. Rationale: FoodDetail edit-mode UI is NOT screenshotted by any spec — the new `EditMicrosCollapsible` rows render inside the FoodDetail dialog which is not visually captured anywhere in the suite.

### Predecessor batch overlap

The superseded `2026-05-17-followups` batch (archived at `Planning/.tmp/archive/bugfix-2026-05-17-followups-superseded-2026-05-17T0530Z`) had 4 deferred items, all on this surface. Resolution against each:

- **LM-I1** (FoodDetailMacros `resolveSodiumMg` display-name read/exclude asymmetry) — **INCIDENTALLY CLOSED.** The new render loop routes every persisted key through `canonicalizeMicroKey` before rendering; `buildMicrosDraftBag` does the same for the draft seed path. `resolveSodiumMg` is unchanged but no longer the canonical-resolution surface.
- **LM-I2** (useFoodDetailEdit canonical/legacy dedup only on `sodiumChanged=true`) — **INCIDENTALLY CLOSED.** The new `buildFieldsPatch` canonicalizes EVERY initial micro key (not just sodium) before computing the merged bag. Drift between `sodium` and `sodium_mg` for ANY micro now converges on canonical.
- **LM-SEC-1** (EDIT_ITEM_MICRO no upper bound) — **MIRRORED ON THE NEW SURFACE.** `setMicro` + `buildFieldsPatch` clamp every drafted value to `[0, MAX_MICRO_VALUE]` (R3 sourced from shared module). The original `EDIT_ITEM_MICRO` reducer in `ConfirmationScreen.tsx` is NOT touched — that surface remains the open LM-SEC-1 followup for a future batch.
- **LM-SEC-2** (mintLibraryClientId Math.random fallback) — **UNRELATED.** Not touched.

### Recovery incidents

**None.** Working tree was clean at batch start (predecessor superseded-followups batch had already stashed its concurrent-session work under `stash@{0}` labeled `bugfix-tomi-followups-pre-flight-2026-05-17`). No `git stash; git reset --hard` cycles from sibling Claude Code sessions observed during this batch's execution window. The commit-fast pattern was preserved on principle but did not need to be exercised under threat.

### Pending follow-ups

| ID | Severity | Source | Description |
|---|---|---|---|
| FOLLOWUP-MICROS-CARDINALITY-CAP | Medium (single-user) / High (multi-user) | Phase 6 security review | Add `MAX_MICROS_KEYS = 100` + `MAX_MICRO_KEY_LEN = 64` to `lib/library/micros-bounds.ts`; refine all 4 micros schemas with `.refine(o => Object.keys(o).length <= MAX_MICROS_KEYS, …)` + key string length. Must land before multi-user. |
| FOLLOWUP-MICROS-RESERVED-KEY-FILTER | Medium (single-user) / High (multi-user) | Phase 6 security review | (a) Fix `canonicalizeMicroKey` prototype-chain leak via `Object.prototype.hasOwnProperty.call`; AND (b) reject reserved keys (`__proto__` / `constructor` / `prototype`) at Zod boundary across all 4 micros schemas; OR (c) drop unconditional orphan-preservation branch at `useFoodDetailEdit.ts:431-435` in favor of explicit legacy allowlist. Must land before multi-user. |
| FOLLOWUP-MICROS-BOUNDS-JSDOC-SECURITY-NOTE | Informational | Phase 6 security review | Document orphan-preservation security trade-off in `lib/library/micros-bounds.ts` JSDoc — call out that consumers MUST use `Object.prototype.hasOwnProperty.call` on micros objects, never `obj.hasOwnProperty` directly. |
| (known limit) | Informational | R3 client cluster note | Commit-focus skips invalid micro input when `EditMicrosCollapsible` is collapsed (no programmatic Radix Collapsible expand API). Requires lifting collapsible state into parent for full fix. SAVE banner + inline error still surface once user expands. |
| LM-SEC-2 | Informational | Predecessor batch | `mintLibraryClientId` Math.random fallback — unrelated to this batch. |

### Final status

**SHIPPED — all gates closed clean.**

- Phase 1 (analysis): complete — single bug, single root cause confirmed.
- Phase 2 (user approval): user said "fix this bug" (singular) with standing "go with recommendation".
- Phase 3 (implement): complete — TDD with 22 new RED→GREEN tests; 1 IDRIFT rewritten in place.
- Phase 4 (Codex R1): complete — C3 I2 M0, all 5 auto-fixed.
- Phase 5 (Codex R2): complete — C2 I2 M0; user-override authority granted R3 to close inline.
- Phase 5.5 (Codex R3, user-override): complete — C0 I0 M0; shared module extracted.
- Phase 6 (security review): complete — 0/0/2/1; both Mediums deferred to follow-up tickets.
- Phase 7 (E2E + visual): complete — 2/2 focused PASS, 3/3 gating visual PASS, 0 baselines refreshed (none captured this surface).
- Phase 8 (docs + commit + push): in progress — docs being written by this sub-agent.
