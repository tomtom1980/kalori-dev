/**
 * AI accuracy fixture loader — shared surface for the VN smoke suite
 * (Task 3.2), the Task 5.1.7 Phase-5 regression matrix, and Task 5.4's
 * tiered-gate driver.
 *
 * Per testing-strategy.md §3.2: the loader is the single public entry
 * for accuracy fixtures. Every test that drives a VN / Western prompt
 * through the MSW-stubbed Gemini pipeline imports from here — the
 * tiered registry (`critical.ts`) is the only writer.
 *
 * Shipped surface (frozen — Task 3.2 + 5.1.7 + 5.4 lock against this):
 *   - `AccuracyFixture` — canonical fixture type (serializable; mirrors
 *     the on-disk JSON shape with a typed `tier` tag)
 *   - `loadCriticalFixtures()` — merge-blocking tier (5 VN at Task 3.2,
 *     5 VN + 3 Western at Task 5.1.7)
 *   - `loadAdvisoryFixtures()` — telemetry-only tier (populated by
 *     Task 5.1.7; empty at Task 3.2 by design)
 *   - `loadFixtureByName(name)` — by-slug lookup for targeted tests
 *   - `loadAllFixtures()` — critical + advisory concatenation for
 *     regression / discovery passes
 *
 * Folder routing: the loader consults `CRITICAL_FOLDER` /
 * `ADVISORY_FOLDER` from `./critical.ts` to map each slug to its on-disk
 * folder (`vn-smoke/`, `western-smoke/`, `advisory/`, `photos/`). This
 * keeps the registry as the single source of truth for both *which*
 * fixture is which tier AND *where* it lives — adding a fixture is a
 * one-row edit in `critical.ts`, no loader patch required.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ADVISORY_FIXTURE_NAMES,
  ADVISORY_FOLDER,
  CRITICAL_FIXTURE_NAMES,
  CRITICAL_FOLDER,
  type AdvisoryFixtureSlug,
  type CriticalFixtureSlug,
} from './critical';

export type AccuracyFixtureTier = 'critical' | 'advisory';

export interface AccuracyFixtureItem {
  readonly name: string;
  readonly portion: number;
  readonly unit: string;
  readonly kcal: number;
  readonly macros: {
    readonly protein_g: number;
    readonly carbs_g: number;
    readonly fat_g: number;
    readonly fiber_g: number;
  };
}

export interface AccuracyFixture {
  readonly name: string;
  readonly tier: AccuracyFixtureTier;
  readonly region: 'vn' | 'western';
  readonly callType: 'text-parse' | 'vision' | 'weekly-review';
  readonly input: string;
  readonly expected: {
    readonly itemCount: number;
    readonly items: readonly AccuracyFixtureItem[];
    readonly total: {
      readonly kcal: number;
      readonly protein_g: number;
      readonly carbs_g: number;
      readonly fat_g: number;
      readonly fiber_g: number;
    };
  };
  readonly tolerance: {
    readonly kcal_pct: number;
    readonly macro_pct: number;
  };
  readonly notes?: string;
}

function readFixture(relativePath: string): AccuracyFixture {
  const absolute = resolve(__dirname, relativePath);
  const raw = readFileSync(absolute, 'utf8');
  return JSON.parse(raw) as AccuracyFixture;
}

/**
 * Critical-tier fixtures. Merge-blocking: CI's `ai-accuracy-critical` job
 * runs every entry through the MSW-stubbed Gemini pipeline and fails the
 * run if any exceeds its tolerance band.
 *
 * Folder routing via `CRITICAL_FOLDER` from the registry — VN slugs land
 * in `vn-smoke/`, Western in `western-smoke/`.
 *
 * The `region` filter preserves Task 3.2's invariant: VN smoke suite only
 * sees the 5 VN slugs unless callers explicitly opt into the wider matrix.
 * Default is `'vn'` so `tests/unit/ai/vn-smoke.test.ts` keeps its single-
 * region contract without modification.
 *   - `'vn'` (default): the 5 VN critical slugs
 *   - `'western'`: the 3 Western critical slugs
 *   - `'all'`: all critical slugs in registry order (5 VN + 3 Western)
 */
export function loadCriticalFixtures(
  region: 'vn' | 'western' | 'all' = 'vn',
): readonly AccuracyFixture[] {
  // Codex Round 2 I1: pre-filter slugs by folder BEFORE reading any JSON.
  // The previous implementation read every critical fixture from disk and
  // then filtered by `fx.region`, which meant a malformed Western JSON could
  // break the VN smoke suite (Task 3.2's single-region contract). Folder is
  // the registry-level region marker (`vn-smoke` ⇔ `region: 'vn'`,
  // `western-smoke` ⇔ `region: 'western'`), so deriving the region predicate
  // from `CRITICAL_FOLDER` lets us skip JSON.parse on out-of-region files
  // entirely. Invariant: when `region === 'vn'`, no Western JSON is read.
  const slugs = CRITICAL_FIXTURE_NAMES.filter((slug: CriticalFixtureSlug) => {
    if (region === 'all') return true;
    const folder = CRITICAL_FOLDER[slug];
    const slugRegion: 'vn' | 'western' = folder === 'vn-smoke' ? 'vn' : 'western';
    return slugRegion === region;
  });
  return slugs.map((slug: CriticalFixtureSlug) => {
    const folder = CRITICAL_FOLDER[slug];
    return readFixture(`./${folder}/${slug}.json`);
  });
}

/**
 * Advisory-tier fixtures — telemetry only. Populated by Task 5.1.7 with
 * 5 VN regional + 7 Western + 5 edge text fixtures (advisory/) and
 * 5 vision/photo fixtures (photos/). Routing via `ADVISORY_FOLDER`.
 */
export function loadAdvisoryFixtures(): readonly AccuracyFixture[] {
  return ADVISORY_FIXTURE_NAMES.map((slug: AdvisoryFixtureSlug) => {
    const folder = ADVISORY_FOLDER[slug];
    return readFixture(`./${folder}/${slug}.json`);
  });
}

/**
 * By-slug lookup across both tiers. Throws if the slug is not registered.
 * Useful for one-off regression tests that pin a specific dish.
 */
export function loadFixtureByName(slug: string): AccuracyFixture {
  const critical = loadCriticalFixtures('all').find((f) => f.name === slug);
  if (critical) return critical;
  const advisory = loadAdvisoryFixtures().find((f) => f.name === slug);
  if (advisory) return advisory;
  throw new Error(
    `loadFixtureByName: no fixture registered with slug '${slug}' (check tests/fixtures/ai-accuracy/critical.ts)`,
  );
}

/**
 * Critical + advisory concatenation. Order is stable: critical entries
 * first (in registry order), then advisory entries. Suitable for
 * regression sweeps that want to exercise every fixture without
 * distinguishing tiers.
 */
export function loadAllFixtures(): readonly AccuracyFixture[] {
  return [...loadCriticalFixtures('all'), ...loadAdvisoryFixtures()];
}
