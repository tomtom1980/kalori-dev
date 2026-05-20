/**
 * @vitest-environment happy-dom
 *
 * Task D.1 (US-STAB-D1) — Dashboard a11y integration tests.
 *
 * Asserts the three D.1 acceptance criteria at the per-component level
 * (jsdom / happy-dom, no Playwright). Each dashboard island that ships
 * a chart / region / interactive grid is rendered in isolation with
 * a representative fixture, then passed through `vitest-axe` for the
 * AA tag set (matches the project-wide `wcag2a + wcag2aa + wcag21a +
 * wcag21aa + wcag22aa` baseline; NO best-practice, NO AAA — see
 * `tests/axe/setup.ts` which the E2E spec re-uses).
 *
 *   - `axe-zero-violations` — every island renders with zero axe
 *      serious/critical violations under the AA tag set. The dashboard
 *      page itself is RSC-rendered + requires an authed Supabase
 *      session, so the per-island sweep is the integration-level
 *      proxy. The full-page surface is covered by the E2E spec
 *      (`tests/e2e/web/dashboard-a11y.spec.ts`).
 *
 *   - `charts-have-aria-labels` — each chart / gauge component
 *      surfaces an accessible name (aria-label OR aria-labelledby
 *      resolving to non-empty text). ChronometerRing carries
 *      `role="img"`; MacroBars per-bar carries the breakdown
 *      `<button>` with `aria-label` (per briefing §17 anti-scope —
 *      do NOT migrate to `role="meter"` unless axe surfaces a real
 *      violation).
 *
 *   - `axe-zero-violations on composed dashboard` (Codex R1 Finding 1
 *     remediation) — renders the entire dashboard subtree the way
 *     `app/(app)/dashboard/page.tsx` composes it (Masthead +
 *     DashboardDateControl + DashboardInteractionLock wrapping the
 *     hero row + MicrosRdaPanel + MealsBulletin + WaterTracker +
 *     MicronutrientPanel + DailyEditorsNote). Pins the axe
 *     runOnly tag set explicitly so the gate does not silently drift
 *     onto axe-core's default rule set. Surfaces duplicate-ID
 *     collisions, provider-boundary issues, and Suspense-replacement
 *     composition failures that per-island fixtures miss.
 *
 * R1 firewall (briefing §12): zero touches to `lib/auth/refresh-
 * interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/api/authFetch.ts`,
 * `app/(app)/(modals)/ConfirmationScreen.tsx`. All renders are pure-
 * presentation per-island; no mutation paths run. The composed test
 * skips the `<TargetUpdatedNudgeWrapper />` because the wrapper
 * imports `authPost` from refresh-interceptor — the dashboard page
 * already gates nudge rendering on `target_mode === 'auto' && ...`,
 * so omitting it under the fixture's `target_mode === 'manual'`
 * shape mirrors the page's runtime branch.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// Stub next/navigation BEFORE any test imports a component that depends
// on it (EntryRowActions reaches for useRouter via the MealsBulletin
// transitive import chain).
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Stub the Zustand log-flow store so MealColumn's MealAddButton +
// EntryRowActions don't crash without a Provider — the test doesn't
// exercise modal flow, only the rendered DOM contract.
vi.mock('@/lib/stores/useLogFlowStore', () => ({
  useLogFlowStore: (selector?: (state: unknown) => unknown) => {
    const noop = () => {};
    const fakeState = {
      openModal: noop,
      enterConfirmation: noop,
    };
    return selector ? selector(fakeState) : fakeState;
  },
}));

vi.mock('@/lib/stores/useUndoQueueStore', () => ({
  useUndoQueueStore: Object.assign(() => ({ pushToast: () => {} }), {
    getState: () => ({ pushToast: () => {} }),
  }),
}));

import { ChronometerRing } from '@/components/charts/ChronometerRing';
import { DashboardDateControl } from '@/components/dashboard/DashboardDateControl';
import { DashboardInteractionLock } from '@/components/dashboard/DashboardInteractionLock';
import { DailyEditorsNote } from '@/components/dashboard/DailyEditorsNote';
import { MacroBars } from '@/components/dashboard/MacroBars';
import { Masthead } from '@/components/dashboard/Masthead';
import { MealsBulletin } from '@/components/dashboard/MealsBulletin';
import { MicronutrientPanel } from '@/components/dashboard/MicronutrientPanel';
import { MicrosRdaPanel } from '@/components/dashboard/MicrosRdaPanel';
import { WaterTracker } from '@/components/dashboard/WaterTracker';
import type { MicroRdaRow } from '@/lib/dashboard/micros-rda-resolver';
import type {
  ChronometerData,
  DashboardSnapshot,
  MacrosByKey,
  MealsByCategory,
  MicroRow,
  Edition,
  FoodEntry,
  WaterLogEntry,
} from '@/lib/dashboard/types';

// Codex R1 Finding 1 — pin the axe runOnly tag set to the agreed
// WCAG baseline so the composed-dashboard gate cannot silently drift
// onto axe-core's default rule set (which includes best-practice
// rules that the project explicitly excluded — see
// `tests/axe/setup.ts` `.withTags([...])`). Tag list is verbatim
// from the E2E helper to keep integration ↔ E2E parity.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const AXE_RUN_OPTIONS = { runOnly: { type: 'tag', values: WCAG_AA_TAGS } } as const;

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures — minimal data shapes that exercise the populated render path.
// Each fixture mirrors the runtime payload the RSC aggregator emits, kept
// inline so the test never reaches a network / database boundary.
// ---------------------------------------------------------------------------

const fixtureEdition: Edition = {
  n: 142,
  weekday: 'Thursday',
  day: 18,
  month: 'April',
  year: 2026,
};

const fixtureChronometer: ChronometerData = {
  status: 'on-target',
  consumed: 1400,
  target: 2000,
  fiber: { consumed: 18, target: 25 },
  nowAngle: 180,
  entryCount: 4,
  lastLoggedAt: '2026-04-18T12:30:00.000Z',
};

const fixtureChronometerEmpty: ChronometerData = {
  status: 'empty',
  target: 2000,
};

const fixtureMacros: MacrosByKey = {
  protein: {
    key: 'protein',
    consumedG: 103,
    targetG: 140,
    pct: 74,
    status: 'default',
    contributions: [],
  },
  carbs: {
    key: 'carbs',
    consumedG: 220,
    targetG: 280,
    pct: 79,
    status: 'default',
    contributions: [],
  },
  fat: { key: 'fat', consumedG: 60, targetG: 70, pct: 86, status: 'default', contributions: [] },
  fiber: {
    key: 'fiber',
    consumedG: 18,
    targetG: 25,
    pct: 72,
    status: 'default',
    contributions: [],
  },
};

function makeFoodEntry(id: string, loggedAt: string): FoodEntry {
  return {
    id,
    client_id: `cid-${id}`,
    logged_at: loggedAt,
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: [
      {
        name: 'Oats with berries',
        portion: 1,
        unit: 'bowl',
        kcal: 320,
        macros: { protein_g: 12, carbs_g: 54, fat_g: 6, fiber_g: 7 },
        micros: {},
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
  };
}

const fixtureMealsPopulated: MealsByCategory = {
  breakfast: {
    category: 'breakfast',
    entries: [makeFoodEntry('e1', '2026-04-18T07:30:00.000Z')],
    totalKcal: 320,
    heaviestEntryId: 'e1',
  },
  lunch: {
    category: 'lunch',
    entries: [makeFoodEntry('e2', '2026-04-18T12:30:00.000Z')],
    totalKcal: 480,
    heaviestEntryId: 'e2',
  },
  dinner: { category: 'dinner', entries: [], totalKcal: 0, heaviestEntryId: null },
  snack: { category: 'snack', entries: [], totalKcal: 0, heaviestEntryId: null },
  drink: { category: 'drink', entries: [], totalKcal: 0, heaviestEntryId: null },
};

const fixtureMicros: MicroRow[] = [
  { name: 'Iron', consumed: 8, rda: 18, pct: 44, status: 'mid' },
  { name: 'Vitamin C', consumed: 65, rda: 90, pct: 72, status: 'good' },
  { name: 'Calcium', consumed: 600, rda: 1000, pct: 60, status: 'mid' },
];

const fixtureDashboardSnapshot: DashboardSnapshot = {
  edition: fixtureEdition,
  chronometer: fixtureChronometer,
  macros: fixtureMacros,
  meals: fixtureMealsPopulated,
  water: { consumedMl: 500, targetMl: 2000, entries: [] },
  bac: { value: 0, calculatedAt: '2026-05-18T12:00:00.000Z' },
  micros: fixtureMicros,
  microsRda: [],
};

// ---------------------------------------------------------------------------
// AC1 + AC3 (regions + Critical fixes): axe-zero-violations across islands.
// ---------------------------------------------------------------------------

describe('Task D.1 (US-STAB-D1) — axe-zero-violations', () => {
  // Codex R2 Finding 1 / R3 carryover — every island axe invocation
  // passes `AXE_RUN_OPTIONS` so the entire integration suite (islands +
  // composed) shares ONE WCAG AA baseline. Without this pin the island
  // tests would silently run axe-core's default rule set (which includes
  // best-practice rules excluded from the project gate), splitting the
  // suite across two axe baselines and contradicting the header claim
  // that every island uses the AA tag set.
  it('Masthead — zero axe violations', async () => {
    const { container } = render(<Masthead edition={fixtureEdition} firstVisit={false} />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('ChronometerRing (on-target) — zero axe violations', async () => {
    const { container } = render(<ChronometerRing data={fixtureChronometer} timezone="UTC" />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('ChronometerRing (empty state) — zero axe violations', async () => {
    const { container } = render(<ChronometerRing data={fixtureChronometerEmpty} timezone="UTC" />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('MacroBars — zero axe violations', async () => {
    const { container } = render(<MacroBars macros={fixtureMacros} />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('MealsBulletin (populated) — zero axe violations', async () => {
    const { container } = render(
      <MealsBulletin meals={fixtureMealsPopulated} timezone="UTC" viewedDay="2026-04-18" />,
    );
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('MicronutrientPanel (populated) — zero axe violations', async () => {
    const { container } = render(<MicronutrientPanel rows={fixtureMicros} visibleCount={3} />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('MicronutrientPanel (empty) — zero axe violations', async () => {
    const { container } = render(<MicronutrientPanel rows={[]} visibleCount={0} />);
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('DailyEditorsNote - zero axe violations', async () => {
    const { container } = render(
      <DailyEditorsNote snapshot={fixtureDashboardSnapshot} viewedDay="2026-04-18" />,
    );
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// AC3 — charts-have-aria-labels.
// ---------------------------------------------------------------------------

describe('Task D.1 (US-STAB-D1) — charts-have-aria-labels', () => {
  it('ChronometerRing wraps the chart in role="img" with non-empty aria-label (on-target)', () => {
    render(<ChronometerRing data={fixtureChronometer} timezone="UTC" />);
    const ring = screen.getByRole('img', { name: /calories logged/i });
    expect(ring).toBeInTheDocument();
    const label = ring.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
    // `formatNumber` uses toLocaleString('en-US') so target renders with
    // a comma at the thousands separator (e.g., "2,000").
    expect(label).toMatch(/1400.*of.*2,000.*calories logged today/i);
    expect(label).toMatch(/percent of target/i);
    expect(label).toMatch(/status/i);
  });

  it('ChronometerRing aria-label is non-empty in the empty state (zero / no-data)', () => {
    render(<ChronometerRing data={fixtureChronometerEmpty} timezone="UTC" />);
    const ring = screen.getByRole('img', { name: /calories logged/i });
    const label = ring.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
    expect(label).toMatch(/0.*of.*2,000.*calories logged today/i);
  });

  it('MacroBars surfaces an accessible name on every per-macro trigger', () => {
    render(<MacroBars macros={fixtureMacros} />);
    // Per-bar buttons carry breakdownTriggerA11y aria-label
    // (e.g. "Show Protein breakdown. Protein, 103 grams of 140 target, 74 percent").
    const proteinBtn = screen.getByRole('button', { name: /protein.*103 grams of 140 target/i });
    const carbsBtn = screen.getByRole('button', { name: /carbs.*220 grams of 280 target/i });
    const fatBtn = screen.getByRole('button', { name: /fat.*60 grams of 70 target/i });
    const fiberBtn = screen.getByRole('button', { name: /fiber.*18 grams of 25 target/i });
    for (const btn of [proteinBtn, carbsBtn, fatBtn, fiberBtn]) {
      expect(btn).toBeInTheDocument();
      const label = btn.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('MicronutrientPanel section has an accessible name (aria-labelledby resolves to non-empty heading)', () => {
    render(<MicronutrientPanel rows={fixtureMicros} visibleCount={3} />);
    // The section root must surface an accessible name via aria-labelledby.
    const section = screen.getByRole('region', { name: /minor elements/i });
    expect(section).toBeInTheDocument();
    const headingId = section.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    const heading = document.getElementById(headingId!);
    expect(heading).not.toBeNull();
    expect((heading?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('MealsBulletin section has an accessible name (aria-labelledby resolves to non-empty heading)', () => {
    render(<MealsBulletin meals={fixtureMealsPopulated} timezone="UTC" viewedDay="2026-04-18" />);
    const section = screen.getByRole('region', { name: /entries/i });
    expect(section).toBeInTheDocument();
    const headingId = section.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    const heading = document.getElementById(headingId!);
    expect(heading).not.toBeNull();
    expect((heading?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Codex R1 Finding 1 — axe-zero-violations on the COMPOSED dashboard subtree.
//
// Renders the same JSX shape `app/(app)/dashboard/page.tsx` returns
// (Masthead + DashboardDateControl + DashboardInteractionLock wrapping the
// hero row + MicrosRdaPanel + MealsBulletin + WaterTracker pair +
// MicronutrientPanel + DailyEditorsNote). Pins the axe
// `runOnly` tag set explicitly (`WCAG_AA_TAGS` above) so this gate cannot
// silently fall onto the default rule set.
//
// Surfaces composed-tree regressions that the per-island sweep cannot:
//   - duplicate `aria-labelledby` target IDs across islands
//   - heading-order issues that only manifest with all panels stacked
//   - daily editor note composition
//   - real provider boundaries (zustand stores, next/navigation stubs)
//
// Renders are skip the `<TargetUpdatedNudgeWrapper />` per file header —
// it imports `authPost` (R1 firewall) and the page's nudge-render gate
// would skip it for this fixture's `target_mode === 'manual'` shape
// anyway.
// ---------------------------------------------------------------------------

// Composed-render fixtures — additional shapes the per-island fixtures
// above don't carry.
const fixtureMicrosRda: MicroRdaRow[] = [
  { code: 'iron', name: 'Iron', value: 8, rda: 18, unit: 'mg', pct: 44, meetsThreshold: false },
  {
    code: 'vitamin_c',
    name: 'Vitamin C',
    value: 65,
    rda: 90,
    unit: 'mg',
    pct: 72,
    meetsThreshold: false,
  },
  {
    code: 'calcium',
    name: 'Calcium',
    value: 600,
    rda: 1000,
    unit: 'mg',
    pct: 60,
    meetsThreshold: false,
  },
  {
    code: 'vitamin_a',
    name: 'Vitamin A',
    value: 700,
    rda: 700,
    unit: 'mcg',
    pct: 100,
    meetsThreshold: true,
  },
];

const fixtureWaterEntries: WaterLogEntry[] = [
  { id: 'w1', client_id: 'cw1', date: '2026-04-18', count: 2, unit: 'glass' },
];

function ComposedDashboard() {
  // Mirrors the JSX shape returned by `DashboardPage` after the async
  // auth / profile resolution succeeds, with the nudge branch skipped
  // (see header comment). FadeUpCard wrappers are intentionally omitted
  // — they introduce framer-motion render boundaries that don't change
  // the a11y tree; the page's `data-prefers-reduced-motion` shortcut
  // makes them transparent in the static snapshot.
  return (
    <section data-testid="page-dashboard">
      <Masthead edition={fixtureEdition} firstVisit={false} />
      <DashboardDateControl viewedDay="2026-04-18" today="2026-04-18" />
      <DashboardInteractionLock viewedDay="2026-04-18">
        <div className="kalori-dashboard-hero-row">
          <ChronometerRing data={fixtureChronometer} timezone="UTC" />
          <MacroBars macros={fixtureMacros} />
        </div>

        <MicrosRdaPanel rows={fixtureMicrosRda} />

        <MealsBulletin meals={fixtureMealsPopulated} timezone="UTC" viewedDay="2026-04-18" />

        <div className="kalori-dashboard-hero-row">
          <WaterTracker
            initial={{ consumedMl: 500, targetMl: 2000, entries: fixtureWaterEntries }}
            timezone="UTC"
            viewedDay="2026-04-18"
          />
          <MicronutrientPanel rows={fixtureMicros} visibleCount={10} />
        </div>

        <DailyEditorsNote snapshot={fixtureDashboardSnapshot} viewedDay="2026-04-18" />
      </DashboardInteractionLock>
    </section>
  );
}

describe('Task D.1 (US-STAB-D1) — axe-zero-violations on composed dashboard', () => {
  it('composed dashboard subtree — zero axe violations under WCAG AA tag set', async () => {
    const { container } = render(<ComposedDashboard />);

    // Smoke-test: every island we expect to compose must actually render
    // in the same DOM. If a composition error swallows one of these, the
    // axe gate below would silently shrink — assert presence first.
    expect(container.querySelector('[data-testid="dashboard-masthead"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dashboard-date-control"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dashboard-interaction-lock"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chronometer-ring"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="macro-bars"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="micros-rda-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="meals-bulletin"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="water-tracker"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="micronutrient-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="daily-editors-note"]')).not.toBeNull();

    // Run axe with the explicit WCAG AA tag set (NOT the default rule
    // set). `vitest-axe`'s `axe()` second arg is `axe-core`'s standard
    // `RunOptions`, which accepts `runOnly: { type, values }`.
    const results = await axe(container, AXE_RUN_OPTIONS);
    expect(results).toHaveNoViolations();
  });

  it('composed dashboard has no duplicate `aria-labelledby` target IDs', () => {
    // Codex R1 Finding 1 sub-concern: per-island fixtures cannot detect
    // ID collisions across the composed page. Enumerate every element
    // that owns an `id` attribute referenced by an `aria-labelledby` /
    // `aria-describedby` and assert each id is unique in the composed
    // tree. (Plain duplicate-id-active axe rule covers the active form-
    // control + ARIA-referenced surface; this explicit walk catches
    // any other id collision a future change might introduce.)
    const { container } = render(<ComposedDashboard />);
    const seen = new Map<string, number>();
    for (const el of container.querySelectorAll('[id]')) {
      const id = el.getAttribute('id');
      if (!id) continue;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    expect(
      duplicates,
      `duplicate DOM ids in composed dashboard: ${JSON.stringify(duplicates)}`,
    ).toEqual([]);
  });
});
