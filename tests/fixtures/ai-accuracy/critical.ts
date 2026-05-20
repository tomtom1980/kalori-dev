/**
 * Tiered fixture registry — SINGLE SOURCE OF TRUTH (testing-strategy.md §3.2).
 *
 * The merge-blocking CI gate `ai-accuracy-critical` enumerates the
 * `CRITICAL_FIXTURE_NAMES` array to discover which fixtures must pass. Adding
 * a slug here is what promotes a fixture into the blocking tier; removing one
 * demotes it. Deliberately a plain typed array (NOT a glob) so the promotion
 * step is visible in code review and cannot happen by accident when a new
 * JSON lands on disk.
 *
 * - Task 3.2 shipped this registry with the 5 VN smoke entries.
 * - Task 5.1.7 extended it with 3 Western critical entries (5 + 3 = 8 total)
 *   and populated `ADVISORY_FIXTURE_NAMES` with 17 advisory fixtures
 *   (5 VN + 7 Western + 5 edge cases) plus 5 vision/photo fixtures.
 *
 * The loader (`./loader.ts`) re-exports these names; tests never import the
 * registry directly — they consume `loadCriticalFixtures()` /
 * `loadAdvisoryFixtures()` / `loadFixtureByName()` / `loadAllFixtures()`.
 *
 * Folder routing (Option C from briefing §5.2): the `*_FOLDER` lookup tables
 * below are the single place that maps slug → on-disk folder. The loader
 * imports them rather than hardcoding `./vn-smoke/${slug}.json`, so adding
 * a Western or photo fixture is a one-row edit instead of a loader patch.
 *
 * --------------------------------------------------------------------------
 * Task C.1 Codex Round 1 Finding 4 — invariant reconciliation (2026-05-14).
 * --------------------------------------------------------------------------
 *
 * Current critical-tier count: 8 fixtures (5 VN + 3 Western). The Task C.1
 * briefing referenced a "30 fixtures" target but no such expansion is in
 * scope for the AI-prompt micros directive change. The C.1 prompt change is
 * additive (it adds a `micros` directive to the system prompt; macros /
 * portions / item counts are unchanged) so the existing 8-fixture suite is
 * the correct pre/post invariant gate.
 *
 * **Invariant (NON-NEGOTIABLE):** This `CRITICAL_FIXTURE_NAMES` suite MUST
 * pass BEFORE and AFTER any AI prompt change. Verified for Task C.1 — see
 * `tests/unit/ai/vn-smoke.test.ts` + `tests/unit/ai/critical-registry.test.ts`
 * pre/post baselines in `Planning/.tmp/task-C.1-output.md`.
 *
 * Expansion of the critical suite to 30 fixtures is deferred to followup
 * `F-AI-CRITICAL-EXPAND-30` (target MVP+1). DO NOT expand this array as
 * a side-effect of a prompt-tuning task — promotion is a deliberate
 * decision tied to fixture coverage analysis.
 */

export const CRITICAL_FIXTURE_NAMES = [
  // VN critical (Task 3.2) — 5 dishes
  'pho',
  'bun-thit-nuong',
  'com-tam',
  'banh-mi',
  'bun-bo-hue',
  // Western critical (Task 5.1.7) — 3 staples
  'eggs-on-toast',
  'large-salad',
  'rotisserie-chicken',
] as const;

export type CriticalFixtureSlug = (typeof CRITICAL_FIXTURE_NAMES)[number];

/**
 * Advisory fixtures (Task 5.1.7). Telemetry-only tier with looser tolerance
 * (kcal ±20%, macro ±30%, fuzzy itemCount ±1). Mix of VN regional, Western,
 * edge cases, and vision/photo. Loader routes each slug to the appropriate
 * folder via `ADVISORY_FOLDER` below.
 */
export const ADVISORY_FIXTURE_NAMES = [
  // VN advisory text — 5 dishes
  'vn-bun-rieu',
  'vn-cha-ca-la-vong',
  'vn-goi-cuon',
  'vn-nem-ran',
  'vn-cao-lau',
  // Western advisory text — 7 dishes
  'western-pasta-carbonara',
  'western-burger-fries',
  'western-greek-yogurt-bowl',
  'western-caesar-salad',
  'western-bolognese',
  'western-rice-bowl',
  'western-protein-bar',
  // Edge / ambiguous-portion — 5 cases
  'ambiguous-small-rice',
  'ambiguous-half-cup',
  'edge-empty-plate',
  'edge-single-apple',
  'edge-no-clear-category',
  // Vision / photo — 5 fixtures
  'vn-pho-bowl',
  'vn-com-tam-plate',
  'vn-banh-mi-wrapped',
  'western-eggs-toast-overhead',
  'western-rotisserie-chicken-side',
] as const;

export type AdvisoryFixtureSlug = (typeof ADVISORY_FIXTURE_NAMES)[number];

export type FixtureFolder = 'vn-smoke' | 'western-smoke' | 'advisory' | 'photos';

/**
 * Codex Round 1 I4: narrow the folder-mapping value types so the compiler
 * catches slug/folder drift. A critical slug can ONLY map to `vn-smoke` or
 * `western-smoke`; an advisory slug can ONLY map to `advisory` or `photos`.
 * Without this narrowing, both maps were typed `Record<Slug, FixtureFolder>`,
 * which would silently accept e.g. `'pho': 'photos'` — a real bug class given
 * how often new fixtures are added.
 */
export type CriticalFolder = Extract<FixtureFolder, 'vn-smoke' | 'western-smoke'>;
export type AdvisoryFolder = Extract<FixtureFolder, 'advisory' | 'photos'>;

/**
 * Critical-tier folder map. VN slugs live in `vn-smoke/`, Western in
 * `western-smoke/`. No critical-tier photos in scope for 5.1.7.
 */
export const CRITICAL_FOLDER: Readonly<Record<CriticalFixtureSlug, CriticalFolder>> = {
  pho: 'vn-smoke',
  'bun-thit-nuong': 'vn-smoke',
  'com-tam': 'vn-smoke',
  'banh-mi': 'vn-smoke',
  'bun-bo-hue': 'vn-smoke',
  'eggs-on-toast': 'western-smoke',
  'large-salad': 'western-smoke',
  'rotisserie-chicken': 'western-smoke',
};

/**
 * Advisory-tier folder map. Text fixtures live in `advisory/`; vision
 * fixtures live in `photos/`. The split is by `callType` (text-parse vs
 * vision) but encoded explicitly here so the loader doesn't need to read
 * the JSON to discover folder.
 */
export const ADVISORY_FOLDER: Readonly<Record<AdvisoryFixtureSlug, AdvisoryFolder>> = {
  'vn-bun-rieu': 'advisory',
  'vn-cha-ca-la-vong': 'advisory',
  'vn-goi-cuon': 'advisory',
  'vn-nem-ran': 'advisory',
  'vn-cao-lau': 'advisory',
  'western-pasta-carbonara': 'advisory',
  'western-burger-fries': 'advisory',
  'western-greek-yogurt-bowl': 'advisory',
  'western-caesar-salad': 'advisory',
  'western-bolognese': 'advisory',
  'western-rice-bowl': 'advisory',
  'western-protein-bar': 'advisory',
  'ambiguous-small-rice': 'advisory',
  'ambiguous-half-cup': 'advisory',
  'edge-empty-plate': 'advisory',
  'edge-single-apple': 'advisory',
  'edge-no-clear-category': 'advisory',
  'vn-pho-bowl': 'photos',
  'vn-com-tam-plate': 'photos',
  'vn-banh-mi-wrapped': 'photos',
  'western-eggs-toast-overhead': 'photos',
  'western-rotisserie-chicken-side': 'photos',
};
