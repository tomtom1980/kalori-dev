/**
 * Task C.E2E.1 (US-STAB-C1) — Micros + RDA dashboard panel.
 *
 * Story (verbatim from `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §4):
 *   AS a user logging food via text or photo,
 *   I WANT the AI to extract micronutrients (vitamins + minerals) AND the
 *     dashboard to display them as `% of RDA`,
 *   SO THAT I see nutritional completeness, not just calories + macros.
 *
 * 2026-05-16 AC3+AC5 Addendum
 * ---------------------------
 * The dashboard was migrated 2026-05-16 from `<MicrosRdaPanel />` (30-chip
 * grid of today's micros + RDA%) to `<MicronutrientPanel />` (day-scoped
 * micros, sorted by %-of-RDA descending, zero-consumption rows filtered,
 * top-10 visible with a "More elements" overflow toggle). The component
 * file `MicrosRdaPanel.tsx` is retained for a potential future weekly /
 * monthly view but is no longer rendered on `/dashboard`. See the addendum
 * block appended to `Planning/features/2026-05-01-mvp-stabilization/
 * design-doc.md` §US-STAB-C1 and `app/(app)/dashboard/page.tsx` for the
 * removal comment.
 *
 * AC intent (micros + RDA% visible on dashboard) is preserved. The
 * assertions below are rewritten to match the new component semantics:
 *   - panel testid `micros-rda-panel` → `micronutrient-panel`
 *   - empty-state testid `micros-rda-empty` → `micros-empty`
 *   - 30-chip count is dropped (the new panel renders only the rows the
 *     aggregator surfaced — zero-consumption rows are filtered upstream,
 *     so a 30-count invariant is meaningless under the new contract)
 *   - per-row testids changed from `micros-rda-chip-${code}` (e.g. `iron`)
 *     to `micro-row-${name-with-dashes}` (e.g. `Iron`, `Vitamin-C`); the
 *     spec checks the seeded anchor rows surface with their formatted %.
 *
 * AC coverage (E2E mirror):
 *   AC3 (panel-below-macros + seeded rows surface with % of RDA) — single
 *       test block exercises:
 *         (a) the Micronutrient panel renders below the Macros panel
 *             (bounding-box y-coordinate ordering; robust to FadeUpCard
 *             wrappers + the side-by-side Phase 2A water-micros row),
 *         (b) the seeded iron + vitamin C rows render with their `%`
 *             values (mono-numeric content with `%` glyph),
 *         (c) the empty-state branch is NOT chosen.
 *   AC5 (empty-state on sparse data) — the panel renders the italic-serif
 *       empty-state heading + caption when the aggregator returns zero
 *       rows. Three concentric proofs: panel root visible, empty-state
 *       inner visible, zero micro-row testids emitted.
 *
 * SCOPE-SKIP (3) — covered outside the E2E click-through surface per the
 *   briefing test plan (precedent: US-STAB-A-bundled.spec.ts L265-456):
 *   AC1 — AI prompt micros-field contract (unit-level, no UI surface).
 *   AC2 — AI accuracy 30/30 fixture suite (fixture-level invariant).
 *   AC4 — Dashboard reads from DEFAULT_MICROS_LIST code constants (resolver
 *         unit, not user-observable beyond AC3's pct values).
 *
 * Click-through Mandate compliance (Planning/testing-strategy.md):
 *   - WHEN-clause user-action API calls per AC: `authedPage.goto('/dashboard')`
 *     + `waitForLoadState('networkidle')`. The page-load IS the action that
 *     triggers the RSC aggregate + Micros panel render.
 *   - Post-action `expect(locator).toBeVisible() / toHaveCount() / toContainText()`
 *     against rendered DOM — NOT URL-only / title-only.
 *   - Sequenced screenshots per AC at
 *     `tests/screenshots/user-stories/US-STAB-C1/`.
 *   - Evidence narrative at the same path.
 *
 * Seed strategy (briefing Option A — in-spec local helper, NOT shared infra):
 *   The shared `seedFoodEntries` helper inserts `items[]` without a `micros`
 *   field. The resolver reads `item.micros ?? {}` so seeded entries produce
 *   all-zero rows → empty-state branch. To exercise AC3's populated branch
 *   the spec uses a local `seedFoodEntryWithMicros` helper that mirrors
 *   `_seed.ts`'s insert shape but injects `items[0].micros` inline. Stays
 *   inside this spec file; does NOT modify shared `tests/e2e/library/_seed.ts`.
 *
 * R1 firewall:
 *   This spec does NOT edit any production code under test
 *   (`MicronutrientPanel.tsx`, `MicrosOverflowToggle.tsx`,
 *   `micros-rda-resolver.ts`, `aggregate.ts`, `MacroBars.tsx`,
 *   `dashboard/page.tsx`, `lib/nutrition/micros-rda.ts`,
 *   `lib/dashboard/build-micro-hover-text.ts`). The fresh `authedPage` user
 *   already starts onboarding-complete with `timezone: 'UTC'`, so AC3's
 *   `logged_at: new Date().toISOString()` falls inside the aggregator's
 *   `todayEntries` filter.
 */
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { test } from '../../fixtures/auth';
import { resolveTestUserId } from '../../library/_seed';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-C1';

/**
 * In-spec service-role helper: insert a food_entries row for `userId` whose
 * single `items[0]` carries the supplied `micros` map (jsonb). Mirrors the
 * shared `seedFoodEntries` insert shape except for the additional `micros`
 * key on the item, which `aggregateMicros` consumes via `item.micros ?? {}`.
 *
 * 2026-05-16 — the item carries `name` (the canonical ParsedItem schema
 * field, per `lib/ai/schemas.ts::ParsedItem`) so `aggregateMicros`'s
 * `itemName: item.name` populates each `MicroContribution.itemName` for
 * the new MicronutrientPanel hover-text path. The shared `seedFoodEntries`
 * helper writes `display_name` (a non-schema key the aggregator never
 * reads); the resulting `itemName: undefined` would crash
 * `buildMicroHoverText`'s `truncateItemName(undefined)` once the
 * MicronutrientPanel mounts. Keeping the fix local per Option A — no
 * shared `_seed.ts` change.
 *
 * Option A per briefing — minimal blast radius. Does NOT touch shared
 * `_seed.ts` infrastructure.
 */
async function seedFoodEntryWithMicros(
  userId: string,
  payload: {
    name: string;
    micros: Record<string, number>;
    nutrition?: { kcal: number; macros: { protein_g: number; carbs_g: number; fat_g: number } };
    logged_at?: string;
    meal_category?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  },
): Promise<{ id: string }> {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Seed helper env missing: SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY (CI) or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (local).',
    );
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from('food_entries')
    .insert({
      user_id: userId,
      client_id: crypto.randomUUID(),
      library_item_id: null,
      meal_category: payload.meal_category ?? 'lunch',
      source: 'text' as const,
      items: [
        {
          name: payload.name,
          portion: 1,
          unit: 'serving',
          nutrition: payload.nutrition ?? {
            kcal: 500,
            macros: { protein_g: 25, carbs_g: 50, fat_g: 18 },
          },
          micros: payload.micros,
        },
      ],
      logged_at: payload.logged_at ?? new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedFoodEntryWithMicros failed: ${error.message}`);
  return data as { id: string };
}

test.describe('US-STAB-C1 · Micros + RDA dashboard panel', () => {
  test('US-STAB-C1 AC3 — panel-renders-below-macros-with-pct-rda-chips', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);

    // GIVEN — a single food_entries row in today's window with non-zero
    // micros values (iron + vitamin C are the assertion anchors; calcium
    // + magnesium round out the seed so multiple rows display non-zero
    // pct values without exceeding 100%).
    //   iron      5 mg   → 28% of RDA 18mg
    //   vitamin_c 50 mg  → 56% of RDA 90mg
    //   calcium   600 mg → 46% of RDA 1300mg
    //   magnesium 200 mg → 48% of RDA 420mg
    await seedFoodEntryWithMicros(userId, {
      name: 'C1-ac3-bo-luc-lac',
      micros: { iron: 5, vitamin_c: 50, calcium: 600, magnesium: 200 },
      nutrition: { kcal: 520, macros: { protein_g: 32, carbs_g: 24, fat_g: 28 } },
    });

    // WHEN — load /dashboard. The RSC aggregate runs `aggregateMicros`
    // over today's entries; the MicronutrientPanel paints below the
    // MacroBars panel (inside the Phase 2A side-by-side water+micros row).
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-01-initial.png`,
      fullPage: true,
    });

    // THEN (panel + macros both visible) — pin the Micronutrient panel
    // anchor. Per the 2026-05-16 design evolution the panel testid is
    // `micronutrient-panel` (renders `<MicronutrientPanel />`, top-10
    // sorted by %-of-RDA, "More elements" overflow toggle).
    const microsPanel = authedPage.getByTestId('micronutrient-panel');
    await expect(microsPanel).toBeVisible();

    // Anchor the Macros panel via its per-row testid. `MacroBars.tsx` does
    // not expose a top-level `data-testid="macros-panel"`, so we use the
    // first macro row as the macros-region sentinel. This avoids touching
    // production source for a test-only affordance.
    const macrosAnchor = authedPage.getByTestId(/^macro-row-/).first();
    await expect(macrosAnchor).toBeVisible();

    // THEN (panel ordered below macros) — bounding-box y-coordinate
    // comparison. The MicronutrientPanel lives in the Phase 2A
    // `.kalori-dashboard-water-micros-row` (FadeUpCard delay 0.35) which
    // sits BELOW the meals bulletin (delay 0.25) and BELOW the hero row
    // hosting MacroBars (delay 0.15). This assertion guards against a
    // future regression that flips that slot order in
    // `app/(app)/dashboard/page.tsx`.
    const macrosBox = await macrosAnchor.boundingBox();
    const microsBox = await microsPanel.boundingBox();
    expect(macrosBox, 'macros anchor must have a bounding box').not.toBeNull();
    expect(microsBox, 'micros panel must have a bounding box').not.toBeNull();
    expect(microsBox!.y).toBeGreaterThan(macrosBox!.y);

    // THEN (≥1 row surfaces a `%` of RDA value) — iron + vitamin C are
    // the seeded anchors. The MicronutrientPanel renders each contributing
    // row via `MicrosOverflowToggle` with an inner div carrying
    // `data-testid="micro-row-${row.name.replace(/\s+/g, '-')}"`. The
    // canonical display names from `DEFAULT_MICROS_LIST` are `Iron` and
    // `Vitamin C` (`canonicalCodeToDisplayName`), so the testids resolve
    // to `micro-row-Iron` and `micro-row-Vitamin-C`. The right column
    // emits a formatted percent string (e.g. `28%` or `56%`) per the
    // `t.dashboard.micro.pctFormat` template.
    const ironRow = authedPage.getByTestId('micro-row-Iron');
    await expect(ironRow).toBeVisible();
    await expect(ironRow).toContainText(/%/);
    const vitaminCRow = authedPage.getByTestId('micro-row-Vitamin-C');
    await expect(vitaminCRow).toBeVisible();
    await expect(vitaminCRow).toContainText(/%/);

    // THEN (empty-state branch NOT chosen) — the panel must have picked
    // the populated branch (`MicrosOverflowToggle`), not the empty-state
    // (`micros-empty`). Pin this explicitly so an aggregator regression
    // (seed micros silently dropped) flips this test red instead of
    // falling back to "panel renders empty state" mode.
    await expect(authedPage.getByTestId('micros-empty')).toHaveCount(0);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-02-result.png`,
      fullPage: true,
    });
  });

  test('US-STAB-C1 AC5 — empty-state-on-sparse-data', async ({ authedPage }) => {
    // GIVEN — a fresh ephemeral user with NO food_entries rows. The
    // `authedPage` fixture provisions a brand-new user per test, so by
    // default no entries exist → `aggregateMicros` returns an empty `rows`
    // array → `<MicronutrientPanel />` renders its empty-state branch
    // (`data-testid="micros-empty"`). No seeding required.

    // WHEN — load /dashboard.
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac5-01-initial.png`,
      fullPage: true,
    });

    // THEN (panel root present) — the section renders header + branch even
    // when sparse. Per the 2026-05-16 design evolution the panel testid is
    // `micronutrient-panel`.
    const microsPanel = authedPage.getByTestId('micronutrient-panel');
    await expect(microsPanel).toBeVisible();

    // THEN (empty-state branch fired) — italic-serif heading + sans
    // caption. The `rows.length === 0` ternary in
    // `MicronutrientPanel.tsx` picks this branch when the aggregator
    // returned no contributing rows.
    const emptyState = microsPanel.getByTestId('micros-empty');
    await expect(emptyState).toBeVisible();

    // THEN (populated branch is ABSENT) — proves the panel chose the
    // empty-state, not the `MicrosOverflowToggle` row grid. The toggle's
    // "More elements" CTA is only emitted when hidden rows exist, so it
    // serves as a sentinel for the populated branch.
    await expect(authedPage.getByTestId('micros-overflow-toggle')).toHaveCount(0);

    // THEN (zero rows emitted) — `micro-row-${name}` testids are only
    // produced inside the populated branch. Counting 0 rows is the
    // strongest proof that `aggregateMicros` returned `[]` AND the
    // component chose the empty branch.
    const rows = authedPage.getByTestId(/^micro-row-/);
    await expect(rows).toHaveCount(0);

    // THEN (empty-state copy contract) — the empty heading + caption
    // come from `t.dashboard.micro.emptyHeading` / `emptyCaption`. Pin
    // the heading copy so a future i18n key rename surfaces here.
    await expect(emptyState).toContainText('— nothing to audit yet —');

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac5-02-result.png`,
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // SCOPE-SKIP declarations — coverage trail to unit/fixture suites per the
  // [SCOPE-SKIP] precedent in tests/e2e/web/user-stories/US-STAB-A-bundled.spec.ts.
  // -------------------------------------------------------------------------

  // SCOPE-SKIP — AC1's contract is the Gemini AI prompt payload shape
  // (response carries a `micros` field with every DEFAULT_MICROS_LIST
  // entry). This is a prompt-payload contract, not a user-observable
  // dashboard surface. The user-observable surface (the chip values
  // landing in the panel) is exercised by AC3. The prompt-payload
  // contract itself is verified at the unit level against a fixture
  // response.
  test.skip('US-STAB-C1 AC1 — [SCOPE-SKIP]: ai-prompt-returns-30-micros — covered by tests/unit/ai/micros-extraction.test.ts', () => {
    /* covered by unit suite — prompt-payload contract, no UI surface */
  });

  // SCOPE-SKIP — AC2's contract is "the 30/30 accuracy fixture suite still
  // passes after the prompt change ships" (Lesson #5 invariant). The
  // suite IS the test; running it inside the E2E click-through surface
  // would be a recursive fixture run with no extra signal. Covered
  // directly by the existing accuracy harness.
  test.skip('US-STAB-C1 AC2 — [SCOPE-SKIP]: ai-accuracy-30/30-preserved — covered by tests/fixtures/ai-accuracy/critical.ts + tests/unit/ai/vn-smoke.test.ts', () => {
    /* covered by accuracy harness — invariant, no UI surface */
  });

  // SCOPE-SKIP — AC4's contract is "the dashboard reads RDA values from
  // the code constants in lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST".
  // The source-of-truth claim is not user-observable; the only user
  // observable is the resulting pct value, which AC3 already pins via
  // the iron + vitamin C chip assertions. Resolver-level "reads from
  // default constants" is covered at the unit level.
  test.skip('US-STAB-C1 AC4 — [SCOPE-SKIP]: dashboard-reads-default-constants — covered by tests/unit/dashboard/micros-rda-resolver.test.ts', () => {
    /* covered by resolver unit suite — source-of-truth claim, no UI surface */
  });
});
