# Bug Bundle Manifest — 2026-05-17-micros-display-consistency

**Batch ID:** `2026-05-17-micros-display-consistency`
**Date:** 2026-05-17
**Project:** Kalori (AI-first nutrition tracker)
**Workflow:** bugfix-tomi (8 phases)
**Status:** implemented; phases 1–8.1 complete; Phase 8.2 (docs/commit/push) in progress
**Starting HEAD SHA:** `42126c051996573524a406c29e8d77b94dec5601`

---

## Bug 1 — Unify micros display rule across surfaces (sort by %RDA desc + hide <1%)

### Description (user verbatim)
> "Anytime we display the micronutrients, including when we're adding on dashboard, we add it to library or viewing the library item, I want it to be ordered from top to bottom for the most percentage used and anything which is less than 1% should not be displayed."

Plus a Phase 2 clarification gate:
> RDA-unknown nutrients (e.g., sugar, caffeine) ALWAYS SHOW, sorted to the END of the list.

### Classification
`known_fix` — three-surface refactor + new shared helper. No debug needed; the rule is a constant the user articulated verbatim. UI-touching, TDD-required, risk MEDIUM (rewrites 8+ behavioral tests on Surface C).

### Root cause
**Consistency was missing — three render surfaces each implemented divergent micros display rules:**

| Surface | Component | Sort (pre-fix) | Filter (pre-fix) |
|---|---|---|---|
| A | `MicronutrientPanel` (dashboard) | desc by `pct`, tie-break by `consumed` desc | `pct < 1` dropped; RDA-unknown rows dropped entirely |
| B | `ConfirmationItemMicros` (add flow, `library-only` mode) | `DEFAULT_MICROS_LIST` declared order (no %RDA sort) | none (editable inputs) |
| C | `MicrosReadOnly` (library view-mode) | `sortMicrosByPriority` (intrinsic priority) | none, with hardcoded sugar+sodium always-visible carve-out |

Dashboard was the closest to the user's rule but excluded RDA-unknown rows (sugar/caffeine), violating the cross-surface intent of "anywhere we display." Confirmation surface ignored sort entirely. Library view-mode used intrinsic priority sort + hardcoded carve-outs, hiding the universal %RDA-desc rule the user requested.

### Fix shape
A single shared helper `sortAndFilterMicrosByRdaPct<T extends MicroDisplayRow>(rows, options)` in `lib/nutrition/display-micros.ts`. Pure function; row-shape agnostic via generic; caller computes `pct` (via `formatMicroPercent`) before passing rows. Options:
- `minPct` (default 1) — filter threshold; pass 0 to disable
- `includeUnknownRda` (default false) — when true, `pct: null` rows survive and sort to END (alphabetical among themselves)

Per-surface invocation:
- **Surface A (dashboard):** `{ minPct: 1, includeUnknownRda: true }` (R1 C1 flipped from `false`)
- **Surface B (confirmation):** `{ minPct: 0, includeUnknownRda: true }` (no filter; sort order frozen at mount via `useState` lazy initializer to prevent jumpy edits)
- **Surface C (library view):** default options `{ minPct: 1, includeUnknownRda: true }` (sugar still appears via RDA-unknown rule; sodium <1% now hidden, hardcoded carve-out removed)

R2 introduced `MicroStatus = 'low' | 'mid' | 'good' | 'over' | 'unknown'` so RDA-unknown rows render neutrally (em-dash label, dust palette, distinct aria copy) instead of misleadingly as "0% below reference" red meters.

### Files touched

| Path | Kind | Change |
|---|---|---|
| `lib/nutrition/display-micros.ts` | src (new exports) | `DisplayMicroRow`, `SortAndFilterMicrosOptions`, `sortAndFilterMicrosByRdaPct<T>()`; `microStatus` now returns `'unknown'` for `rda === null \|\| rda === 0` (was `'low'`) |
| `lib/dashboard/aggregate.ts` | src | Surface A: replaced inline sort+filter with shared-helper call; `includeUnknownRda: true` (R1 C1) |
| `lib/dashboard/types.ts` | src | `MicroStatus` enum extended to 5-tuple (added `'unknown'`) |
| `lib/i18n/en.ts` | src | 3 new dashboard.micro keys: `pctUnknownLabel`, `rowAriaLabelUnknown`, `statusUnknown` |
| `app/(app)/log/_components/ConfirmationScreen.tsx` | src | Surface B: `ConfirmationItemMicros` sort via helper; order frozen via `useState` lazy initializer (R1 I1) |
| `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` | src | Surface C: removed `defaultRows` always-visible carve-out + `ALREADY_VISIBLE` set + sodium dedup guard; unified all rows into single sorted list; preserved Collapsible UX (top row visible, tail under toggle) |
| `components/dashboard/MicronutrientPanel.tsx` | src | (R2) neutral 'unknown' branch wiring |
| `components/dashboard/MicrosOverflowToggle.tsx` | src | (R2) `FILL_COLOR.unknown`, `PCT_COLOR.unknown`, `statusWord` exhaustive, `MeterContent` em-dash branch, `Row` aria-label swap |
| `components/dashboard/MicroBreakdownDialog.tsx` | src | (R2) `MICRO_TEXT_COLORS.unknown = var(--color-dust)` |
| `tests/unit/lib/nutrition/display-micros.sort-filter.test.ts` | test (new) | 13 helper unit tests |
| `tests/unit/lib/nutrition/display-micros.test.ts` | test | Updated `microStatus(50, null)` / `(50, 0)` from `'low'` → `'unknown'` |
| `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` | test | (R1 C1) "unknown keys filtered out" → "orphan survives at END" rewrite; 2 new tests (sugar/caffeine inclusion at end; sub-1% RDA-having regression guard); (R2 I2) orphan-status now `'unknown'` |
| `tests/unit/lib/dashboard/aggregate-micros-rda-unknown.test.ts` | test (new) | 3 R2 I2 tests |
| `tests/unit/components/dashboard/MicronutrientPanel.rda-unknown.test.tsx` | test (new) | 7 R2 I2 tests across 2 describe blocks |
| `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` | test (new) | 3 Surface B sort tests + 2 R1 I1 freeze-at-mount regression tests = 5 total |
| `tests/components/library/FoodDetailMacros.test.tsx` | test | 3 rewrites (vitamin_c zero-value, Codex R1 C1 sodium dedup, LM-I1 display-name Sodium dedup); 5 new Bug 1 universal-rule tests |

**Total:** 8 production files + 6 test files modified or added.

### Tests

- **NEW:** 13 helper unit tests, 3+2 Surface B tests, 5 library universal-rule tests, 3 R2 I2 aggregate tests, 7 R2 I2 component tests, 2 R1 C1 dashboard tests — **~35 new RED→GREEN tests**.
- **REWRITTEN:** 3 library tests (zero-value vitamin_c, R1 C1 sodium dedup, LM-I1 display-name Sodium dedup); 1 dashboard test (orphan-status: `'low'` → `'unknown'`); 1 helper test (microStatus null/0 RDA).
- **PRESERVED:** all existing dashboard / nutrition / micros component tests pass unchanged (113 dashboard tests, 44 FoodDetailMacros tests, 8 ConfirmationItemMicros tests, 5+ confirmation screen tests).
- **Aggregate per-area sweep:** 369/369 GREEN on touched-file batched run.
- **R2 regression sweep:** 35 test files, 317 tests — all GREEN (dashboard + nutrition + micros components).
- **Full repo:** 2972 passed / 99 skipped / 1 pre-existing failure (`tests/integration/focus-ring-token.test.ts` — pre-dates this batch; from commit `dda828e` bottom-tab-bar).
- **TDD compliance:** every behavioral change has a failing test first (RED), then minimum code (GREEN), then refactor.

### Codex Round 1

| Severity | Count | Findings | Auto-fix |
|---|---|---|---|
| Critical | 1 | C1 — Dashboard `includeUnknownRda: false` violated user's cross-surface intent for RDA-unknown rows | Flipped to `true`; updated inline comments; rewrote 1 obsolete assertion + added 2 new tests |
| Improvement | 1 | I1 — `ConfirmationItemMicros` rebuilt + re-sorted rows on every render; clearing a top-ranked input would yank focus and reorder mid-edit | Replaced inline IIFE with `useState(() => sortAndFilterMicrosByRdaPct(...))` lazy initializer; live values still bind via direct `micros[code]` read; 2 new regression tests |
| Minor | 0 | — | — |

Both fixes auto-applied; no user gate required. Verbatim Codex outputs at `codex/round-1.md` + `codex/round-1-categorized.md`. Per-fix artifacts at `codex/fixes-r1-dashboard.md` + `codex/fixes-r1-confirmation-freeze.md`.

### Codex Round 2

| Severity | Count | Findings | Auto-fix |
|---|---|---|---|
| Critical | 0 | — | — |
| Improvement | 1 | I2 — RDA-unknown rows surfaced by R1 C1 now rendered as misleading "0% below reference" red meters on dashboard (public `MicroRow` still carried `pct: 0` + `status: 'low'`); UX false signal | Path A — extended `MicroStatus` enum with `'unknown'`; `microStatus(value, rda)` returns `'unknown'` when `rda === null \|\| rda === 0`; `MicrosOverflowToggle` and `MicroBreakdownDialog` updated for neutral rendering; new i18n keys; new aria copy; new colour palette entries; TypeScript exhaustiveness enforces parity at every consumer |
| Minor | 0 | — | — |

Auto-fix produced 10 new R2 tests across 2 new files. **R2 2-round cap closes the batch** — no R3 invocation.

Verbatim Codex output at `codex/round-2.md` + `codex/round-2-categorized.md`. Per-fix artifact at `codex/fixes-r2-rda-unknown-rendering.md`.

### Security Review

- **Severity counts:** 0 Critical / 0 High / 0 Medium / 0 Informational.
- **Scope:** display-layer batch only — no new mutations, no API surfaces, no auth/RLS, no PII flows, no env vars.
- **Categories audited (all clean):** input validation, authn/authz, PII handling, injection vectors, secret leakage, XSS/CSRF, race conditions, open redirects, resource exhaustion, type safety.
- **Type-safety highlight:** `MicroStatus` 5-tuple extension enforced via `Record<MicroStatus, string>` colour-palette tables in `MicrosOverflowToggle.tsx` + `MicroBreakdownDialog.tsx` — TS exhaustiveness check forces every renderer branch to handle `'unknown'` or fail compile. No `default` switch arms to mask missing cases.
- **React 19 `useState` lazy-init audit (Surface B):** documented React 19 pattern for "compute exactly once at mount" — no race against parent re-renders; live values still read from current `micros` map.

Full report at `security-review.md`.

### E2E + Visual Regression

- **Visual specs audited (5):** `dashboard.spec.ts`, `library.spec.ts`, `progress.spec.ts`, `water-fab-toast.spec.ts`, `log-confirmation.spec.ts`.
- **Visual baselines refreshed in this batch:** **0** (correctly).
- **Result:** 4 visual specs are FAILING but it's **pre-existing project-wide drift** from commits `dda828e` / `cf24019` / `49c6db5` (mobile bottom-tab-bar enlargement, lucide icon layout, desktop sidebar sticky positioning) — not caused by this batch. The 4 failing fullPage specs render +16 px shorter than baselines because of the new bottom-bar height + sticky-sidebar height-100vh side-effects. None of the failing specs captures the 3 surfaces this batch touched:
  - `dashboard.spec.ts` captures empty-state authed dashboard, which renders `MicronutrientPanel`'s "nothing to audit yet" placeholder — NOT the RDA-unknown rows touched here.
  - `library.spec.ts` captures the library grid, never opens `FoodDetail`, so `MicrosReadOnly` never renders.
  - `log-confirmation.spec.ts` captures `/log` landing only, never exercises AI confirmation flow, so `ConfirmationItemMicros` never renders.
  - `progress.spec.ts` doesn't render micros at all.
- **Functional E2E:** no spec in `tests/e2e/*` exercises the micros display contract; coverage delivered by ~35 component-level Vitest + Testing-Library tests already GREEN (Phase 5).
- **Initial refresh attempt → reverted:** sub-agent initially `--update-snapshots` refreshed 3 dashboard baselines before completing the diagnosis; once it confirmed empty-state placeholder doesn't render touched code paths, reverted via `git checkout HEAD -- tests/visual/__screenshots__/visual/dashboard.spec.ts/`. Tree state on snapshots: clean.

Full report at `e2e-results.md`.

### Pending follow-ups (Minor)
- **FOLLOWUP-VISUAL-BASELINE-DRIFT** — refresh visual baselines for dashboard / library / progress / water-fab-toast specs (pre-existing +16 px drift from commits `dda828e` / `cf24019` / `49c6db5` mobile-bottom-bar enlargement + desktop sticky-sidebar). Out of scope for this batch; recommended as a dedicated rebaseline sweep so future visual sweeps catch genuine regressions.

### Predecessor batch overlap
None — this is a pure display-rule unification batch. Builds on helpers from prior batches without modifying them:
- `canonicalizeMicroKey` (from `library-micros-parse` batch) — used unchanged by the helper consumers.
- `canonicalMicroRda` (`micros-rda-resolver`) — RDA lookup, unchanged.
- `formatMicroPercent` — pct integer computation, unchanged.
- LM-I1 sodium read symmetry (`e496627`), LM-I2 canonical dedup (`42126c0`), LM-SEC-1 micros input bound (`d579fbe`) — all preserved verbatim; none touched the sort/filter rendering path.

### Status

`implemented` — Phase 3 complete (TDD red→green), Phase 4 Codex R1 auto-fixed, Phase 5 Codex R2 auto-fixed (2-round cap closed), Phase 6 security clean, Phase 7 E2E clean (no refresh required), Phase 8 docs in progress.

---

## Artifacts (this directory)

| Path | Purpose |
|---|---|
| `manifest.md` | This file |
| `proposals/bug-1.md` | Phase 2 proposal with three-surface diff outline + helper design + STOP-THE-WORLD guardrails |
| `outputs/bug-1.md` | Phase 3 implementation output with file paths + test results + deviations from proposal |
| `codex/round-1.md` | Codex Round 1 raw verbatim output |
| `codex/round-1-categorized.md` | Codex Round 1 categorized (C1 + I1 + 0M) |
| `codex/fixes-r1-dashboard.md` | R1 C1 auto-fix artifact (dashboard RDA-unknown inclusion) |
| `codex/fixes-r1-confirmation-freeze.md` | R1 I1 auto-fix artifact (freeze sort at mount) |
| `codex/round-2.md` | Codex Round 2 raw verbatim output |
| `codex/round-2-categorized.md` | Codex Round 2 categorized (0C + I2 + 0M) |
| `codex/fixes-r2-rda-unknown-rendering.md` | R2 I2 auto-fix artifact (MicroStatus 'unknown' enum + neutral rendering branch) |
| `security-review.md` | Phase 6 security report (0C/0H/0M/0I — clean) |
| `e2e-results.md` | Phase 7 E2E + visual regression report (no baseline refresh required) |
| `project-context.md` | Phase 0 project-context briefing for analysis sub-agent |
| `lessons-relevant.md` | Lessons pre-loaded for this batch from global lessons-learned store |
